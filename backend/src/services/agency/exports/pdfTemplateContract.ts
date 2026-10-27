import crypto from 'node:crypto';
import type { AgencyTemplateAudience } from '../../../models/AgencyTemplate.js';
import { AppError } from '../../../utils/AppError.js';
import type { ResolvedTemplateAssets } from './templateAssets.js';

/**
 * Slot-map contract for uploaded PDF designs (Agency Workspace A6f).
 *
 * A PDF version keeps the agency's design as a sanitised vector background and
 * stores a closed map of text/image slots on top of it. Coordinates are PDF
 * points with a top-left origin, matching the browser mapper; the renderer
 * converts them to pdf-lib's bottom-left space.
 *
 * The token vocabulary mirrors the HTML template view. Day-scoped tokens are
 * only valid on the single page marked `repeat: 'days'`, which the renderer
 * expands once per itinerary day.
 */

export const AGENCY_PDF_SLOT_MAP_SCHEMA_VERSION = 1;
export const AGENCY_PDF_MAX_BYTES = 10 * 1024 * 1024;
export const AGENCY_PDF_MAX_PAGES = 20;
export const AGENCY_PDF_MAX_SLOTS = 250;
export const AGENCY_PDF_MAX_SLOTS_PER_PAGE = 80;

export type AgencyPdfSlotKind = 'text' | 'image';
export type AgencyPdfSlotFont = 'body' | 'heading';
export type AgencyPdfSlotAlign = 'left' | 'center' | 'right';
export type AgencyPdfSlotFit = 'cover' | 'contain';

export interface AgencyPdfSlot {
  id: string;
  kind: AgencyPdfSlotKind;
  token: string;
  /** PDF points, top-left origin. */
  x: number;
  y: number;
  w: number;
  h: number;
  font?: AgencyPdfSlotFont;
  size?: number;
  minSize?: number;
  align?: AgencyPdfSlotAlign;
  color?: string;
  lineHeight?: number;
  maxLines?: number;
  fit?: AgencyPdfSlotFit;
}

export interface AgencyPdfPage {
  /** 1-based page in the background PDF. */
  page: number;
  repeat?: 'days';
  slots: AgencyPdfSlot[];
}

export interface AgencyPdfSlotMap {
  schemaVersion: typeof AGENCY_PDF_SLOT_MAP_SCHEMA_VERSION;
  pages: AgencyPdfPage[];
}

export interface AgencyPdfPageSize {
  width: number;
  height: number;
}

interface SlotTokenDefinition {
  label: string;
  kind: AgencyPdfSlotKind;
  /** Only valid on the repeatable day page. */
  day?: boolean;
  internalOnly?: boolean;
}

const text = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);

function lines(value: unknown, prefix = '• '): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((entry) => text(entry).trim())
    .filter(Boolean)
    .map((entry) => `${prefix}${entry}`)
    .join('\n');
}

function activityLines(value: unknown, internal: boolean): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((activity) => {
      const head = [text(activity?.time).trim(), text(activity?.title).trim()]
        .filter(Boolean)
        .join(' · ');
      const description = text(activity?.description).trim();
      const cost =
        internal && text(activity?.costFormatted).trim()
          ? ` (${text(activity?.costFormatted).trim()})`
          : '';
      const body = description ? `${head} — ${description}${cost}` : `${head}${cost}`;
      return body.trim();
    })
    .filter(Boolean)
    .map((entry) => `• ${entry}`)
    .join('\n');
}

function stayLines(value: unknown, internal: boolean): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((stay) => {
      const head = [text(stay?.name).trim(), text(stay?.location).trim()]
        .filter(Boolean)
        .join(' · ');
      const price =
        internal && text(stay?.pricePerNightFormatted).trim()
          ? ` (${text(stay?.pricePerNightFormatted).trim()} / night)`
          : '';
      return `${head}${price}`.trim();
    })
    .filter(Boolean)
    .map((entry) => `• ${entry}`)
    .join('\n');
}

/**
 * The closed slot vocabulary. Unknown or audience-inappropriate tokens are
 * rejected before bytes are stored, so a layout can never read arbitrary data.
 */
export const AGENCY_PDF_SLOT_TOKENS: Record<string, SlotTokenDefinition> = {
  'agency.name': { label: 'Agency name', kind: 'text' },
  'agency.address': { label: 'Agency address', kind: 'text' },
  'agency.phone': { label: 'Agency phone', kind: 'text' },
  'agency.email': { label: 'Agency email', kind: 'text' },
  'agency.website': { label: 'Agency website', kind: 'text' },
  'agency.instagram': { label: 'Agency Instagram', kind: 'text' },
  'agency.gstin': { label: 'Agency GSTIN', kind: 'text' },

  'trip.title': { label: 'Trip title', kind: 'text' },
  'trip.destination': { label: 'Destination', kind: 'text' },
  'trip.startDate': { label: 'Start date', kind: 'text' },
  'trip.endDate': { label: 'End date', kind: 'text' },
  'trip.durationDays': { label: 'Duration (days)', kind: 'text' },
  'trip.nights': { label: 'Nights', kind: 'text' },
  'trip.groupType': { label: 'Group type', kind: 'text' },
  'trip.season': { label: 'Season', kind: 'text' },

  'client.name': { label: 'Client name', kind: 'text' },
  'client.email': { label: 'Client email', kind: 'text' },
  'client.phone': { label: 'Client phone', kind: 'text' },
  'client.adults': { label: 'Adults', kind: 'text' },
  'client.children': { label: 'Children', kind: 'text' },
  'client.rooms': { label: 'Rooms', kind: 'text' },

  'quote.number': { label: 'Quote number', kind: 'text' },
  'quote.version': { label: 'Quote version', kind: 'text' },
  'quote.statusLabel': { label: 'Quote status label', kind: 'text' },
  'quote.date': { label: 'Quote date', kind: 'text' },
  'quote.validUntil': { label: 'Quote valid until', kind: 'text' },
  'quote.totalFormatted': { label: 'Quote total', kind: 'text' },
  'quote.perPersonFormatted': { label: 'Price per person', kind: 'text' },
  'quote.inclusions': { label: 'Inclusions', kind: 'text' },
  'quote.exclusions': { label: 'Exclusions', kind: 'text' },
  'quote.terms': { label: 'Terms', kind: 'text' },

  recommendations: { label: 'Recommendations', kind: 'text' },
  thingsToCarry: { label: 'Things to carry', kind: 'text' },
  cancellationPolicy: { label: 'Cancellation policy', kind: 'text' },

  'contact.phone': { label: 'Contact phone', kind: 'text' },
  'contact.email': { label: 'Contact email', kind: 'text' },
  'contact.website': { label: 'Contact website', kind: 'text' },
  'contact.instagram': { label: 'Contact Instagram', kind: 'text' },

  generatedAt: { label: 'Generated at', kind: 'text' },
  statusLabel: { label: 'Document status label', kind: 'text' },

  'day.number': { label: 'Day number', kind: 'text', day: true },
  'day.date': { label: 'Day date', kind: 'text', day: true },
  'day.title': { label: 'Day title', kind: 'text', day: true },
  'day.summary': { label: 'Day summary', kind: 'text', day: true },
  'day.permitRequired': { label: 'Permit required', kind: 'text', day: true },
  'day.activities': { label: 'Day activities', kind: 'text', day: true },
  'day.stays': { label: 'Day stays', kind: 'text', day: true },
  'day.food': { label: 'Day food', kind: 'text', day: true },
  'day.transport': { label: 'Day transport', kind: 'text', day: true },
  'day.tips': { label: 'Day tips', kind: 'text', day: true },
  'day.activityCosts': {
    label: 'Day activity costs (internal)',
    kind: 'text',
    day: true,
    internalOnly: true,
  },
  'day.stayPrices': {
    label: 'Day stay prices (internal)',
    kind: 'text',
    day: true,
    internalOnly: true,
  },

  'image.logo': { label: 'Logo', kind: 'image' },
  'image.mascot': { label: 'Mascot', kind: 'image' },
  'image.cover': { label: 'Cover image', kind: 'image' },
  'day.image': { label: 'Day image', kind: 'image', day: true },
};

type View = Record<string, any>;

function globalText(view: View, token: string): string {
  switch (token) {
    case 'agency.name':
      return text(view.agency?.name);
    case 'agency.address':
      return text(view.agency?.address);
    case 'agency.phone':
      return text(view.agency?.phone);
    case 'agency.email':
      return text(view.agency?.email);
    case 'agency.website':
      return text(view.agency?.website);
    case 'agency.instagram':
      return text(view.agency?.instagram);
    case 'agency.gstin':
      return text(view.agency?.gstin);
    case 'trip.title':
      return text(view.trip?.title);
    case 'trip.destination':
      return text(view.trip?.destination);
    case 'trip.startDate':
      return text(view.trip?.startDate);
    case 'trip.endDate':
      return text(view.trip?.endDate);
    case 'trip.durationDays':
      return text(view.trip?.durationDays);
    case 'trip.nights':
      return text(view.trip?.nights);
    case 'trip.groupType':
      return text(view.trip?.groupType);
    case 'trip.season':
      return text(view.trip?.season);
    case 'client.name':
      return text(view.client?.name);
    case 'client.email':
      return text(view.client?.email);
    case 'client.phone':
      return text(view.client?.phone);
    case 'client.adults':
      return text(view.client?.adults);
    case 'client.children':
      return text(view.client?.children);
    case 'client.rooms':
      return text(view.client?.rooms);
    case 'quote.number':
      return text(view.quote?.number);
    case 'quote.version':
      return text(view.quote?.version);
    case 'quote.statusLabel':
      return text(view.quote?.statusLabel);
    case 'quote.date':
      return text(view.quote?.date);
    case 'quote.validUntil':
      return text(view.quote?.validUntil);
    case 'quote.totalFormatted':
      return text(view.quote?.totalFormatted);
    case 'quote.perPersonFormatted':
      return text(view.quote?.perPersonFormatted);
    case 'quote.inclusions':
      return lines(view.quote?.inclusions);
    case 'quote.exclusions':
      return lines(view.quote?.exclusions);
    case 'quote.terms':
      return lines(view.quote?.terms);
    case 'recommendations':
      return lines(view.recommendations);
    case 'thingsToCarry':
      return lines(view.thingsToCarry);
    case 'cancellationPolicy':
      return lines(view.cancellationPolicy);
    case 'contact.phone':
      return text(view.contact?.phone);
    case 'contact.email':
      return text(view.contact?.email);
    case 'contact.website':
      return text(view.contact?.website);
    case 'contact.instagram':
      return text(view.contact?.instagram);
    case 'generatedAt':
      return text(view.generatedAt);
    case 'statusLabel':
      return text(view.statusLabel);
    default:
      return '';
  }
}

function dayText(day: View, token: string, internal: boolean): string {
  switch (token) {
    case 'day.number':
      return text(day?.day);
    case 'day.date':
      return text(day?.date);
    case 'day.title':
      return text(day?.title);
    case 'day.summary':
      return text(day?.summary);
    case 'day.permitRequired':
      return day?.permitRequired ? 'Permit required' : '';
    case 'day.activities':
      return activityLines(day?.activities, internal);
    case 'day.stays':
      return stayLines(day?.stays, internal);
    case 'day.food':
      return lines(day?.food);
    case 'day.transport':
      return lines(day?.transport);
    case 'day.tips':
      return lines(day?.tips);
    case 'day.activityCosts':
      return internal
        ? (Array.isArray(day?.activities) ? day.activities : [])
            .map((activity: any) => text(activity?.costFormatted).trim())
            .filter(Boolean)
            .map((entry: string) => `• ${entry}`)
            .join('\n')
        : '';
    case 'day.stayPrices':
      return internal
        ? (Array.isArray(day?.stays) ? day.stays : [])
            .map((stay: any) => text(stay?.pricePerNightFormatted).trim())
            .filter(Boolean)
            .map((entry: string) => `• ${entry} / night`)
            .join('\n')
        : '';
    default:
      return '';
  }
}

/** Resolves one text slot against the same view the HTML renderer receives. */
export function resolveAgencyPdfSlotText(
  view: View,
  token: string,
  day: View | null,
  audience: AgencyTemplateAudience
): string {
  const definition = AGENCY_PDF_SLOT_TOKENS[token];
  if (!definition || definition.kind !== 'text') {
    throw new AppError('That layout slot is not supported.', 400);
  }
  if (definition.internalOnly && audience !== 'internal') {
    return '';
  }
  if (definition.day) {
    return day ? dayText(day, token, audience === 'internal') : '';
  }
  return globalText(view, token);
}

/** Resolves one image slot to the version's private data-URL snapshot. */
export function resolveAgencyPdfSlotImage(
  assets: ResolvedTemplateAssets,
  token: string,
  day: View | null
): string {
  switch (token) {
    case 'image.logo':
      return assets.images.logo ?? '';
    case 'image.mascot':
      return assets.images.mascot ?? '';
    case 'image.cover':
      return assets.images.cover ?? '';
    case 'day.image': {
      const position = Number(day?.pageNumber);
      return Number.isInteger(position) && position >= 1
        ? assets.images[`day-${position}`] ?? ''
        : '';
    }
    default:
      return '';
  }
}

/**
 * Reuses the HTML asset-coverage guard by translating layout image tokens to
 * the equivalent template view tokens.
 */
export function slotMapCoverageTokens(slotMap: AgencyPdfSlotMap): string[] {
  const tokens = new Set<string>();
  for (const page of slotMap.pages) {
    for (const slot of page.slots) {
      if (slot.token === 'image.logo') tokens.add('assets.logoDataUrl');
      else if (slot.token === 'image.mascot') tokens.add('assets.mascotDataUrl');
      else if (slot.token === 'image.cover') tokens.add('assets.coverImageDataUrl');
      else if (slot.token === 'day.image') tokens.add('days.imageDataUrl');
    }
  }
  return [...tokens];
}

export function slotMapTokens(slotMap: AgencyPdfSlotMap): string[] {
  const tokens = new Set<string>();
  for (const page of slotMap.pages) {
    for (const slot of page.slots) tokens.add(slot.token);
  }
  return [...tokens].sort();
}

export function slotMapSlotCount(slotMap: AgencyPdfSlotMap | null | undefined): number {
  return (slotMap?.pages ?? []).reduce(
    (total, page) => total + (page.slots?.length ?? 0),
    0
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Detects edits to the stored map, mirroring the template source checksum. */
export function slotMapChecksum(slotMap: AgencyPdfSlotMap): string {
  return crypto.createHash('sha256').update(stableStringify(slotMap)).digest('hex');
}

const SLOT_ID = /^[A-Za-z0-9_-]{1,40}$/;
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

const MAP_KEYS = new Set(['schemaVersion', 'pages']);
const PAGE_KEYS = new Set(['page', 'repeat', 'slots']);
const SLOT_KEYS = new Set([
  'id',
  'kind',
  'token',
  'x',
  'y',
  'w',
  'h',
  'font',
  'size',
  'minSize',
  'align',
  'color',
  'lineHeight',
  'maxLines',
  'fit',
]);

function assertObject(
  value: unknown,
  allowed: Set<string>,
  label: string
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(`The ${label} is not valid.`, 400);
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (!allowed.has(key)) {
      throw new AppError(`The ${label} contains an unsupported field.`, 400);
    }
  }
  return value as Record<string, unknown>;
}

function finite(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundPoints(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface ValidateAgencyPdfSlotMapOptions {
  audience: AgencyTemplateAudience;
  pageSizes: AgencyPdfPageSize[];
}

/**
 * Validates and normalises an untrusted layout. Defaults are materialised here
 * so the stored map and its checksum stay stable across edits and releases.
 */
export function validateAgencyPdfSlotMap(
  input: unknown,
  options: ValidateAgencyPdfSlotMapOptions
): AgencyPdfSlotMap {
  const source = assertObject(input, MAP_KEYS, 'layout');
  if (
    Number(source.schemaVersion) !== AGENCY_PDF_SLOT_MAP_SCHEMA_VERSION
  ) {
    throw new AppError(
      'This layout uses an unsupported contract. Map the design again.',
      400
    );
  }
  if (!Array.isArray(source.pages) || source.pages.length === 0) {
    throw new AppError('Add at least one slot to the PDF layout.', 400);
  }
  if (source.pages.length > options.pageSizes.length) {
    throw new AppError('The layout references a page that is not in the PDF.', 400);
  }

  const pages: AgencyPdfPage[] = [];
  const seenPages = new Set<number>();
  const seenIds = new Set<string>();
  let repeatPage: number | null = null;
  let totalSlots = 0;

  for (const rawPage of source.pages) {
    const page = assertObject(rawPage, PAGE_KEYS, 'layout page');
    const pageNumber = finite(page.page);
    if (
      pageNumber === null ||
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber > options.pageSizes.length
    ) {
      throw new AppError('The layout references a page that is not in the PDF.', 400);
    }
    if (seenPages.has(pageNumber)) {
      throw new AppError('Each PDF page can only be mapped once.', 400);
    }
    seenPages.add(pageNumber);

    let repeat: 'days' | undefined;
    if (page.repeat !== undefined) {
      if (page.repeat !== 'days') {
        throw new AppError('That page repeat mode is not supported.', 400);
      }
      if (repeatPage !== null) {
        throw new AppError('Only one page can repeat for each itinerary day.', 400);
      }
      repeatPage = pageNumber;
      repeat = 'days';
    }

    if (!Array.isArray(page.slots)) {
      throw new AppError('Each mapped page needs a slot list.', 400);
    }
    if (page.slots.length > AGENCY_PDF_MAX_SLOTS_PER_PAGE) {
      throw new AppError(
        `Map at most ${AGENCY_PDF_MAX_SLOTS_PER_PAGE} slots on one page.`,
        400
      );
    }

    const pageSize = options.pageSizes[pageNumber - 1];
    const slots: AgencyPdfSlot[] = [];
    for (const rawSlot of page.slots) {
      const slot = assertObject(rawSlot, SLOT_KEYS, 'layout slot');
      const id = String(slot.id ?? '').trim();
      if (!SLOT_ID.test(id)) {
        throw new AppError('Every slot needs a stable id.', 400);
      }
      if (seenIds.has(id)) {
        throw new AppError('Each layout slot needs a unique id.', 400);
      }
      seenIds.add(id);

      const kind = slot.kind === 'text' || slot.kind === 'image' ? slot.kind : null;
      if (!kind) {
        throw new AppError('Every slot must be text or an image.', 400);
      }
      const token = String(slot.token ?? '').trim();
      const definition = AGENCY_PDF_SLOT_TOKENS[token];
      if (!definition) {
        throw new AppError(`"${token || 'Empty'}" is not a supported layout field.`, 400);
      }
      if (definition.kind !== kind) {
        throw new AppError(
          `"${definition.label}" must be mapped as ${definition.kind === 'image' ? 'an image' : 'text'}.`,
          400
        );
      }
      if (definition.internalOnly && options.audience !== 'internal') {
        throw new AppError(
          `"${definition.label}" is only available in internal templates.`,
          400
        );
      }
      if (definition.day && repeat !== 'days') {
        throw new AppError(
          `"${definition.label}" needs a page marked to repeat for each day.`,
          400
        );
      }

      const x = finite(slot.x);
      const y = finite(slot.y);
      const w = finite(slot.w);
      const h = finite(slot.h);
      if (x === null || y === null || w === null || h === null) {
        throw new AppError('Every slot needs a position and size.', 400);
      }
      if (x < 0 || y < 0 || w < 4 || h < 4) {
        throw new AppError('Slots must be at least 4 points and inside the page.', 400);
      }
      if (
        x + w > pageSize.width + 0.5 ||
        y + h > pageSize.height + 0.5
      ) {
        throw new AppError('A slot extends past the edge of the PDF page.', 400);
      }

      if (kind === 'text') {
        const size = finite(slot.size ?? 11) ?? 11;
        if (size < 6 || size > 72) {
          throw new AppError('Text size must be between 6 and 72 points.', 400);
        }
        const minSize = finite(slot.minSize ?? Math.max(6, size * 0.6)) ?? size;
        if (minSize < 6 || minSize > size) {
          throw new AppError(
            'The smallest text size must be between 6 points and the chosen size.',
            400
          );
        }
        const lineHeight = finite(slot.lineHeight ?? 1.25) ?? 1.25;
        if (lineHeight < 1 || lineHeight > 2.5) {
          throw new AppError('Line height must be between 1 and 2.5.', 400);
        }
        const maxLines = finite(slot.maxLines ?? 10) ?? 10;
        if (!Number.isInteger(maxLines) || maxLines < 1 || maxLines > 60) {
          throw new AppError('Map between 1 and 60 text lines per slot.', 400);
        }
        const align =
          slot.align === 'center' || slot.align === 'right' ? slot.align : 'left';
        const font = slot.font === 'heading' ? 'heading' : 'body';
        const colour = String(slot.color ?? '#0F172A').trim().toUpperCase();
        if (!HEX_COLOUR.test(colour)) {
          throw new AppError('Choose a six-digit text colour.', 400);
        }

        slots.push({
          id,
          kind,
          token,
          x: roundPoints(x),
          y: roundPoints(y),
          w: roundPoints(w),
          h: roundPoints(h),
          font,
          size: Math.round(size * 100) / 100,
          minSize: Math.round(minSize * 100) / 100,
          align,
          color: colour,
          lineHeight: Math.round(lineHeight * 100) / 100,
          maxLines,
        });
      } else {
        slots.push({
          id,
          kind,
          token,
          x: roundPoints(x),
          y: roundPoints(y),
          w: roundPoints(w),
          h: roundPoints(h),
          fit: slot.fit === 'contain' ? 'contain' : 'cover',
        });
      }
    }

    totalSlots += slots.length;
    pages.push({ page: pageNumber, ...(repeat ? { repeat } : {}), slots });
  }

  if (totalSlots === 0) {
    throw new AppError('Add at least one slot to the PDF layout.', 400);
  }
  if (totalSlots > AGENCY_PDF_MAX_SLOTS) {
    throw new AppError(`Map at most ${AGENCY_PDF_MAX_SLOTS} slots in one layout.`, 400);
  }

  return {
    schemaVersion: AGENCY_PDF_SLOT_MAP_SCHEMA_VERSION,
    pages,
  };
}
