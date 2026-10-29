import Agency from '../../models/Agency.js';
import AgencyClient from '../../models/AgencyClient.js';
import AgencyQuote, { IAgencyQuote, QuoteStatus } from '../../models/AgencyQuote.js';
import Trip from '../../models/Trip.js';
import { AppError } from '../../utils/AppError.js';
import { agencyCan, type AgencyRole } from './access.js';
import { assertAgencyClient } from './clients.js';
import {
  markEnquiryQuotedByProposal,
  markEnquiryWonByAcceptance,
} from '../directory/enquiries.js';
import {
  AGENCY_TERMS_MAX_ITEMS,
  AGENCY_TERMS_MAX_LENGTH,
} from './agencies.js';

/**
 * Agency quote engine (A4).
 *
 * Money rules:
 * - every calculation happens in integer minor units (paise/cents) and is
 *   rounded once per step, so 0.1 + 0.2 can never leak into a client price;
 * - the client sends line items, percentages and a discount, never a total;
 * - quotes are append-only once sent: editing allocates `version + 1` with the
 *   same quote number instead of rewriting history.
 */

export const QUOTE_CURRENCIES = [
  'INR',
  'USD',
  'EUR',
  'GBP',
  'AED',
  'SGD',
  'AUD',
  'CAD',
] as const;
export type QuoteCurrency = (typeof QUOTE_CURRENCIES)[number];

export const QUOTE_MAX_LINE_ITEMS = 100;
export const QUOTE_MAX_QUANTITY = 10_000;
export const QUOTE_MAX_UNIT_PRICE = 100_000_000;
export const QUOTE_MAX_DISCOUNT = 100_000_000;
export const QUOTE_MAX_MARKUP_PCT = 1000;
export const QUOTE_MAX_TAX_PCT = 100;

export function isQuoteCurrency(value: unknown): value is QuoteCurrency {
  return (
    typeof value === 'string' &&
    QUOTE_CURRENCIES.includes(value.trim().toUpperCase() as QuoteCurrency)
  );
}

/* -------------------------------------------------------------------------- */
/*  Money                                                                     */
/* -------------------------------------------------------------------------- */

const toMinor = (amount: number): number => Math.round(amount * 100);
const fromMinor = (minor: number): number => Math.round(minor) / 100;

function finiteNumber(value: unknown, label: string): number {
  const parsed =
    typeof value === 'number' ? value : value === '' || value == null ? NaN : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError(`Enter a valid ${label}.`, 400);
  }
  return parsed;
}

function boundedNumber(
  value: unknown,
  label: string,
  min: number,
  max: number
): number {
  const parsed = finiteNumber(value, label);
  if (parsed < min || parsed > max) {
    throw new AppError(`${label} must be between ${min} and ${max}.`, 400);
  }
  return parsed;
}

export interface QuoteLineDraft {
  label: string;
  description?: string;
  quantity: number;
  unitPrice: number;
}

export interface QuoteLineTotal extends QuoteLineDraft {
  total: number;
}

export interface QuoteTotalsInput {
  lineItems: Array<{
    label?: unknown;
    description?: unknown;
    quantity?: unknown;
    unitPrice?: unknown;
  }>;
  markupPct?: unknown;
  taxPct?: unknown;
  discount?: unknown;
  adults: number;
  children: number;
}

export interface QuoteTotals {
  lineItems: QuoteLineTotal[];
  subtotal: number;
  markupPct: number;
  markupAmount: number;
  taxPct: number;
  taxAmount: number;
  discount: number;
  total: number;
  perPerson: number;
  travelers: number;
}

/**
 * Pure pricing function shared by the service and the unit tests. It never
 * trusts a submitted line total: only quantity and unit price are inputs.
 */
export function computeQuoteTotals(input: QuoteTotalsInput): QuoteTotals {
  if (!Array.isArray(input.lineItems) || input.lineItems.length === 0) {
    throw new AppError('Add at least one line item to the quote.', 400);
  }
  if (input.lineItems.length > QUOTE_MAX_LINE_ITEMS) {
    throw new AppError(
      `A quote can have at most ${QUOTE_MAX_LINE_ITEMS} line items.`,
      400
    );
  }

  const lineItems: QuoteLineTotal[] = input.lineItems.map((item, index) => {
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    if (!label) {
      throw new AppError(`Line ${index + 1} needs a label.`, 400);
    }
    if (label.length > 160) {
      throw new AppError(
        `Line ${index + 1} label must be 160 characters or fewer.`,
        400
      );
    }
    const description =
      typeof item.description === 'string' ? item.description.trim().slice(0, 500) : '';

    const quantity = boundedNumber(
      item.quantity,
      `Quantity on line ${index + 1}`,
      0.01,
      QUOTE_MAX_QUANTITY
    );
    const unitPrice = boundedNumber(
      item.unitPrice,
      `Unit price on line ${index + 1}`,
      0,
      QUOTE_MAX_UNIT_PRICE
    );

    return {
      label,
      ...(description ? { description } : {}),
      quantity,
      unitPrice: fromMinor(toMinor(unitPrice)),
      total: fromMinor(Math.round(quantity * unitPrice * 100)),
    };
  });

  const subtotalMinor = lineItems.reduce(
    (sum, item) => sum + toMinor(item.total),
    0
  );
  if (subtotalMinor > Number.MAX_SAFE_INTEGER / 100) {
    throw new AppError('This quote total is too large to price safely.', 400);
  }

  const markupPct = boundedNumber(
    input.markupPct ?? 0,
    'Markup percentage',
    0,
    QUOTE_MAX_MARKUP_PCT
  );
  const taxPct = boundedNumber(
    input.taxPct ?? 0,
    'Tax percentage',
    0,
    QUOTE_MAX_TAX_PCT
  );
  const discountMinor = toMinor(
    boundedNumber(input.discount ?? 0, 'Discount', 0, QUOTE_MAX_DISCOUNT)
  );

  const markupMinor = Math.round((subtotalMinor * markupPct) / 100);
  if (discountMinor > subtotalMinor + markupMinor) {
    throw new AppError(
      'The discount cannot be more than the subtotal plus markup.',
      400
    );
  }

  const taxableMinor = subtotalMinor + markupMinor - discountMinor;
  const taxMinor = Math.round((taxableMinor * taxPct) / 100);
  const totalMinor = taxableMinor + taxMinor;

  const adults = boundedNumber(input.adults, 'Adult travellers', 1, 30);
  const children = boundedNumber(input.children, 'Child travellers', 0, 30);
  if (!Number.isInteger(adults) || !Number.isInteger(children)) {
    throw new AppError('Traveller counts must be whole numbers.', 400);
  }
  const travelers = adults + children;
  const perPersonMinor = Math.round(totalMinor / travelers);

  return {
    lineItems,
    subtotal: fromMinor(subtotalMinor),
    markupPct,
    markupAmount: fromMinor(markupMinor),
    taxPct,
    taxAmount: fromMinor(taxMinor),
    discount: fromMinor(discountMinor),
    total: fromMinor(totalMinor),
    perPerson: fromMinor(perPersonMinor),
    travelers,
  };
}

/* -------------------------------------------------------------------------- */
/*  Status and expiry                                                         */
/* -------------------------------------------------------------------------- */

export interface QuoteStatusShape {
  status: QuoteStatus;
  validUntil?: Date | string;
}

export function isQuoteExpired(
  quote: QuoteStatusShape | null | undefined,
  now: Date = new Date()
): boolean {
  if (!quote || quote.status !== 'sent' || !quote.validUntil) return false;
  const until = new Date(quote.validUntil).getTime();
  return Number.isFinite(until) && until < now.getTime();
}

/** `sent` rows whose validity passed are presented as `expired`. */
export function effectiveQuoteStatus(
  quote: QuoteStatusShape,
  now: Date = new Date()
): QuoteStatus {
  return isQuoteExpired(quote, now) ? 'expired' : quote.status;
}

/* -------------------------------------------------------------------------- */
/*  Projections                                                               */
/* -------------------------------------------------------------------------- */

export interface QuoteProjection {
  _id: string;
  number: string;
  version: number;
  status: QuoteStatus;
  clientId?: string;
  client: Record<string, unknown>;
  currency: string;
  lineItems: Array<Record<string, unknown>>;
  subtotal: number;
  markupPct?: number;
  markupAmount?: number;
  taxPct: number;
  taxAmount: number;
  discount: number;
  total: number;
  perPerson: number;
  validUntil: Date;
  inclusions: string[];
  exclusions: string[];
  terms: string[];
  preparedBy?: string;
  sentAt?: Date;
  acceptedAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

function baseProjection(quote: IAgencyQuote | any, now: Date) {
  return {
    _id: String(quote._id),
    number: String(quote.number),
    version: Number(quote.version),
    status: effectiveQuoteStatus(quote, now),
    ...(quote.clientId ? { clientId: String(quote.clientId) } : {}),
    client: {
      name: quote.client?.name ?? '',
      ...(quote.client?.email ? { email: quote.client.email } : {}),
      ...(quote.client?.phone ? { phone: quote.client.phone } : {}),
      adults: Number(quote.client?.adults ?? 1),
      children: Number(quote.client?.children ?? 0),
      ...(quote.client?.rooms !== undefined ? { rooms: quote.client.rooms } : {}),
    },
    currency: String(quote.currency),
    lineItems: (quote.lineItems ?? []).map((item: any) => ({
      label: item.label,
      ...(item.description ? { description: item.description } : {}),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
    })),
    subtotal: quote.subtotal,
    taxPct: quote.taxPct,
    taxAmount: quote.taxAmount,
    discount: quote.discount,
    total: quote.total,
    perPerson: quote.perPerson,
    validUntil: quote.validUntil,
    inclusions: quote.inclusions ?? [],
    exclusions: quote.exclusions ?? [],
    terms: quote.terms ?? [],
    sentAt: quote.sentAt,
    acceptedAt: quote.acceptedAt,
    cancelledAt: quote.cancelledAt,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
  };
}

/**
 * Client-safe view. Markup is the agency's margin, not the client's price, so
 * it (and the preparing agent's name) is stripped for viewers. Expenses are
 * never part of a quote document at all.
 */
export function projectQuoteForClient(
  quote: IAgencyQuote | any,
  now: Date = new Date()
): QuoteProjection {
  return baseProjection(quote, now);
}

/** Staff view: planners and above additionally see the margin fields. */
export function projectQuote(
  quote: IAgencyQuote | any,
  role: AgencyRole,
  now: Date = new Date()
): QuoteProjection {
  const base = baseProjection(quote, now);
  if (!agencyCan(role, 'planner')) return base;
  return {
    ...base,
    markupPct: quote.markupPct,
    markupAmount: quote.markupAmount,
    ...(quote.preparedBy ? { preparedBy: quote.preparedBy } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/*  Number allocation                                                         */
/* -------------------------------------------------------------------------- */

export function quoteNumberFor(year: number, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new AppError('Quote numbers need a positive sequence.', 500);
  }
  return `Q-${year}-${String(sequence).padStart(4, '0')}`;
}

/** Atomic per-agency sequence; allocated only when a trip gets its first quote. */
export async function allocateQuoteNumber(
  agencyId: string,
  now: Date = new Date()
): Promise<string> {
  const agency = await Agency.findOneAndUpdate(
    { _id: agencyId },
    { $inc: { quoteCounter: 1 } },
    { new: true }
  ).select('quoteCounter');
  if (!agency) {
    throw new AppError('Agency not found', 404);
  }
  return quoteNumberFor(now.getUTCFullYear(), Number(agency.quoteCounter));
}

/* -------------------------------------------------------------------------- */
/*  Persistence                                                               */
/* -------------------------------------------------------------------------- */

async function latestQuoteDocument(
  agencyId: string,
  tripId: string
): Promise<IAgencyQuote | null> {
  return AgencyQuote.findOne({ agencyId, tripId }).sort({ version: -1 });
}

/** Persists `sent -> expired` lazily so history and dashboards stay truthful. */
export async function reconcileQuoteExpiry(
  quote: IAgencyQuote | null,
  now: Date = new Date()
): Promise<IAgencyQuote | null> {
  if (!quote || !isQuoteExpired(quote, now)) return quote;
  const updated = await AgencyQuote.findOneAndUpdate(
    { _id: quote._id, status: 'sent' },
    { $set: { status: 'expired' } },
    { new: true }
  );
  return updated ?? quote;
}

export async function getLatestQuote(
  agencyId: string,
  tripId: string,
  now: Date = new Date()
): Promise<IAgencyQuote | null> {
  const latest = await latestQuoteDocument(agencyId, tripId);
  return reconcileQuoteExpiry(latest, now);
}

export async function listQuoteVersions(
  agencyId: string,
  tripId: string
): Promise<IAgencyQuote[]> {
  return AgencyQuote.find({ agencyId, tripId }).sort({ version: -1 });
}

export interface SaveQuoteInput {
  agencyId: string;
  tripId: string;
  userId: string;
  role: AgencyRole;
  agencyDefaultTerms?: {
    inclusions?: string[];
    exclusions?: string[];
    terms?: string[];
  };
  clientId?: unknown;
  client?: {
    name?: unknown;
    email?: unknown;
    phone?: unknown;
    adults?: unknown;
    children?: unknown;
    rooms?: unknown;
  };
  currency?: unknown;
  lineItems?: QuoteTotalsInput['lineItems'];
  markupPct?: unknown;
  taxPct?: unknown;
  discount?: unknown;
  validUntil?: unknown;
  inclusions?: unknown;
  exclusions?: unknown;
  terms?: unknown;
  preparedBy?: unknown;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A date picker's `YYYY-MM-DD` stays valid through the end of that day. */
export function parseQuoteValidity(value: unknown): Date {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  const text = String(value ?? '').trim();
  if (!text) {
    throw new AppError('Choose how long this quote stays valid.', 400);
  }
  const date = DATE_ONLY.test(text)
    ? new Date(`${text}T23:59:59.999Z`)
    : new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('Choose a valid validity date.', 400);
  }
  return date;
}

function normalizeQuoteClient(input: SaveQuoteInput['client']) {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (!name) {
    throw new AppError("Enter the client's name for the quote.", 400);
  }
  if (name.length > 120) {
    throw new AppError('Client names must be 120 characters or fewer.', 400);
  }

  const email =
    typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160)) {
    throw new AppError('Enter a valid client email address.', 400);
  }
  const phone = typeof input?.phone === 'string' ? input.phone.trim().slice(0, 40) : '';

  const adults = finiteNumber(input?.adults, 'adult traveller count');
  const children = finiteNumber(input?.children ?? 0, 'child traveller count');
  if (!Number.isInteger(adults) || adults < 1 || adults > 30) {
    throw new AppError('Adult travellers must be a whole number between 1 and 30.', 400);
  }
  if (!Number.isInteger(children) || children < 0 || children > 30) {
    throw new AppError('Child travellers must be a whole number between 0 and 30.', 400);
  }

  let rooms: number | undefined;
  if (input?.rooms !== undefined && input.rooms !== null && input.rooms !== '') {
    rooms = finiteNumber(input.rooms, 'room count');
    if (!Number.isInteger(rooms) || rooms < 0 || rooms > 30) {
      throw new AppError('Rooms must be a whole number between 0 and 30.', 400);
    }
  }

  return {
    name,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    adults,
    children,
    ...(rooms !== undefined ? { rooms } : {}),
  };
}

/** Undefined means "inherit"; an explicit empty array clears the section. */
export function normalizeQuoteTerms(
  value: unknown,
  label: string
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new AppError(`Quote ${label} must be a list.`, 400);
  }
  if (value.length > AGENCY_TERMS_MAX_ITEMS) {
    throw new AppError(`Add at most ${AGENCY_TERMS_MAX_ITEMS} ${label} lines.`, 400);
  }
  return value.map((entry) => {
    const line = typeof entry === 'string' ? entry.trim() : '';
    if (!line) {
      throw new AppError(`Remove the empty ${label} line.`, 400);
    }
    if (line.length > AGENCY_TERMS_MAX_LENGTH) {
      throw new AppError(
        `Keep each ${label} line under ${AGENCY_TERMS_MAX_LENGTH} characters.`,
        400
      );
    }
    return line;
  });
}

function resolveTerms(
  value: unknown,
  label: string,
  existing: string[] | undefined,
  fallback: string[] | undefined
): string[] {
  const provided = normalizeQuoteTerms(value, label);
  if (provided !== undefined) return provided;
  if (existing !== undefined) return [...existing];
  return [...(fallback ?? [])];
}

function quoteFieldsFromInput(
  input: SaveQuoteInput,
  totals: ReturnType<typeof computeQuoteTotals>,
  client: ReturnType<typeof normalizeQuoteClient>,
  validUntil: Date,
  terms: { inclusions: string[]; exclusions: string[]; terms: string[] },
  preparedBy: string | undefined
) {
  return {
    client,
    currency: String(input.currency ?? '').trim().toUpperCase(),
    lineItems: totals.lineItems,
    subtotal: totals.subtotal,
    markupPct: totals.markupPct,
    markupAmount: totals.markupAmount,
    taxPct: totals.taxPct,
    taxAmount: totals.taxAmount,
    discount: totals.discount,
    total: totals.total,
    perPerson: totals.perPerson,
    validUntil,
    inclusions: terms.inclusions,
    exclusions: terms.exclusions,
    terms: terms.terms,
    ...(preparedBy ? { preparedBy } : {}),
  };
}

/**
 * `PUT /trips/:id/quote`.
 *
 * - no quote yet: allocate the number and create version 1 (draft);
 * - latest is a draft: update it in place;
 * - latest is sent/accepted/expired/cancelled: create a new draft version.
 *
 * Once sent, a version is never mutated — the unique `(agencyId, tripId,
 * version)` index also prevents two concurrent first saves from colliding.
 */
export async function saveQuote(input: SaveQuoteInput): Promise<IAgencyQuote> {
  if (!agencyCan(input.role, 'planner')) {
    throw new AppError("You don't have permission to edit this quote.", 403);
  }

  // The route guard has already scoped the trip, but the service defends its
  // own boundary: a foreign tripId must never mint a quote row here.
  const trip = await Trip.findOne({
    _id: input.tripId,
    agencyId: input.agencyId,
    workspace: 'agency',
    isDeleted: { $ne: true },
  }).select('_id').lean();
  if (!trip) {
    throw new AppError('Trip not found', 404);
  }

  const currency = String(input.currency ?? '').trim().toUpperCase();
  if (!isQuoteCurrency(currency)) {
    throw new AppError('Choose a supported quote currency.', 400);
  }

  const validUntil = parseQuoteValidity(input.validUntil);
  if (validUntil.getTime() <= Date.now()) {
    throw new AppError('Choose a validity date in the future.', 400);
  }

  const client = normalizeQuoteClient(input.client);
  const clientId =
    input.clientId === null || input.clientId === undefined || input.clientId === ''
      ? undefined
      : String(input.clientId);
  if (clientId) {
    await assertAgencyClient(input.agencyId, clientId);
  }

  const totals = computeQuoteTotals({
    lineItems: input.lineItems ?? [],
    markupPct: input.markupPct,
    taxPct: input.taxPct,
    discount: input.discount,
    adults: client.adults,
    children: client.children,
  });

  const latest = await latestQuoteDocument(input.agencyId, input.tripId);
  const preparedBy =
    typeof input.preparedBy === 'string' && input.preparedBy.trim()
      ? input.preparedBy.trim().slice(0, 120)
      : latest?.preparedBy;

  const terms = {
    inclusions: resolveTerms(
      input.inclusions,
      'inclusions',
      latest?.inclusions,
      input.agencyDefaultTerms?.inclusions
    ),
    exclusions: resolveTerms(
      input.exclusions,
      'exclusions',
      latest?.exclusions,
      input.agencyDefaultTerms?.exclusions
    ),
    terms: resolveTerms(
      input.terms,
      'terms',
      latest?.terms,
      input.agencyDefaultTerms?.terms
    ),
  };

  const fields = quoteFieldsFromInput(
    { ...input, currency },
    totals,
    client,
    validUntil,
    terms,
    preparedBy
  );

  if (!latest) {
    const number = await allocateQuoteNumber(input.agencyId);
    return AgencyQuote.create({
      agencyId: input.agencyId,
      tripId: input.tripId,
      number,
      version: 1,
      status: 'draft',
      createdBy: input.userId,
      ...(clientId ? { clientId } : {}),
      ...fields,
    });
  }

  if (latest.status === 'draft') {
    const updated = await AgencyQuote.findOneAndUpdate(
      { _id: latest._id, status: 'draft' },
      {
        $set: {
          ...fields,
          ...(clientId ? { clientId } : {}),
        },
        ...(clientId ? {} : { $unset: { clientId: 1 } }),
      },
      { new: true, runValidators: true }
    );
    if (!updated) {
      throw new AppError(
        'This quote was just sent or changed. Reload it and try again.',
        409
      );
    }
    return updated;
  }

  try {
    return await AgencyQuote.create({
      agencyId: input.agencyId,
      tripId: input.tripId,
      number: latest.number,
      version: latest.version + 1,
      status: 'draft',
      createdBy: input.userId,
      ...(clientId ? { clientId } : {}),
      ...fields,
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new AppError(
        'Another version of this quote was just created. Reload it and try again.',
        409
      );
    }
    throw error;
  }
}

async function requireLatestQuote(
  agencyId: string,
  tripId: string
): Promise<IAgencyQuote> {
  const latest = await latestQuoteDocument(agencyId, tripId);
  if (!latest) {
    throw new AppError('Create a quote for this trip first.', 404);
  }
  return latest;
}

export async function sendQuote(input: {
  agencyId: string;
  tripId: string;
  role: AgencyRole;
}): Promise<IAgencyQuote> {
  if (!agencyCan(input.role, 'planner')) {
    throw new AppError("You don't have permission to send this quote.", 403);
  }
  const latest = await reconcileQuoteExpiry(
    await requireLatestQuote(input.agencyId, input.tripId)
  );
  if (!latest) throw new AppError('Create a quote for this trip first.', 404);

  if (latest.status === 'sent') return latest;
  if (latest.status === 'accepted') {
    throw new AppError('This quote was already accepted.', 409);
  }
  if (latest.status === 'expired') {
    throw new AppError(
      'This quote has expired. Update the validity date and save a new version.',
      409
    );
  }
  if (latest.status === 'cancelled') {
    throw new AppError('This quote was cancelled.', 409);
  }
  if (latest.validUntil.getTime() <= Date.now()) {
    throw new AppError('Update the validity date before sending this quote.', 400);
  }

  const sent = await AgencyQuote.findOneAndUpdate(
    { _id: latest._id, status: 'draft' },
    { $set: { status: 'sent', sentAt: new Date() } },
    { new: true }
  );
  if (!sent) {
    throw new AppError('This quote changed before it could be sent. Reload it.', 409);
  }

  // Sending is the funnel's quote step, not a private status flip: a directory
  // lead moves to `quoted` here exactly as it does when the proposal document
  // is shared. A won or lost lead keeps the status its agency chose.
  if (sent.clientId) {
    const client = (await AgencyClient.findOne({
      _id: sent.clientId,
      agencyId: input.agencyId,
    })
      .select('sourceEnquiryId')
      .lean()) as any;
    if (client?.sourceEnquiryId) {
      await markEnquiryQuotedByProposal(String(client.sourceEnquiryId));
    }
  }

  return sent;
}

export async function acceptQuote(input: {
  agencyId: string;
  tripId: string;
  role: AgencyRole;
}): Promise<IAgencyQuote> {
  if (!agencyCan(input.role, 'planner')) {
    throw new AppError("You don't have permission to accept this quote.", 403);
  }
  const latest = await reconcileQuoteExpiry(
    await requireLatestQuote(input.agencyId, input.tripId)
  );
  if (!latest) throw new AppError('Create a quote for this trip first.', 404);

  // Acceptance is idempotent: a retry must return the same accepted row.
  if (latest.status === 'accepted') return latest;
  if (latest.status === 'expired') {
    throw new AppError('This quote has expired and can no longer be accepted.', 409);
  }
  if (latest.status === 'cancelled') {
    throw new AppError('This quote was cancelled.', 409);
  }
  if (latest.status !== 'sent') {
    throw new AppError('Send this quote before marking it accepted.', 409);
  }

  const accepted = await AgencyQuote.findOneAndUpdate(
    { _id: latest._id, status: 'sent' },
    { $set: { status: 'accepted', acceptedAt: new Date() } },
    { new: true }
  );
  if (!accepted) {
    throw new AppError('This quote changed before it could be accepted. Reload it.', 409);
  }

  // A quote accepted by phone still closes the directory lead behind it.
  const client = accepted.clientId
    ? ((await AgencyClient.findOne({
        _id: accepted.clientId,
        agencyId: input.agencyId,
      })
        .select('sourceEnquiryId')
        .lean()) as any)
    : null;
  if (client?.sourceEnquiryId) {
    await markEnquiryWonByAcceptance(
      input.agencyId,
      String(client.sourceEnquiryId)
    );
  }

  return accepted;
}

export async function cancelQuote(input: {
  agencyId: string;
  tripId: string;
  role: AgencyRole;
}): Promise<IAgencyQuote> {
  if (!agencyCan(input.role, 'planner')) {
    throw new AppError("You don't have permission to cancel this quote.", 403);
  }
  const latest = await reconcileQuoteExpiry(
    await requireLatestQuote(input.agencyId, input.tripId)
  );
  if (!latest) throw new AppError('Create a quote for this trip first.', 404);

  if (latest.status === 'cancelled') return latest;
  if (latest.status === 'accepted') {
    throw new AppError('An accepted quote cannot be cancelled.', 409);
  }
  if (latest.status === 'expired') {
    throw new AppError('This quote has already expired.', 409);
  }

  const cancelled = await AgencyQuote.findOneAndUpdate(
    { _id: latest._id, status: latest.status },
    { $set: { status: 'cancelled', cancelledAt: new Date() } },
    { new: true }
  );
  if (!cancelled) {
    throw new AppError('This quote changed before it could be cancelled. Reload it.', 409);
  }
  return cancelled;
}
