import type { QuoteStatus } from '../../../models/AgencyQuote.js';
import { effectiveQuoteStatus } from '../quotes.js';
import { addDaysUtc, exportDateIso } from './format.js';

/**
 * Canonical, renderer-ready export document (Agency Workspace A5).
 *
 * The renderer never reads a Mongoose document: it receives this versioned DTO
 * so every normalization rule is testable and a future stored-template engine
 * sees exactly the same shape. Client-facing exports must stay free of
 * markup, internal cost, expenses, prepared-by and chat ciphertext. None of
 * those fields exist on this type.
 */

export const EXPORT_SCHEMA_VERSION = 1;

export const EXPORT_PROVIDER_NAME = 'TravelAI';

export interface ExportBrandAssets {
  logoDataUrl?: string | null;
  mascotDataUrl?: string | null;
}

export interface ExportAgency {
  name: string;
  logoUrl: string | null;
  mascotUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  fontHeading: string | null;
  fontBody: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  gstin: string | null;
}

export interface ExportClient {
  name: string;
  email: string | null;
  phone: string | null;
  adults: number | null;
  children: number | null;
  rooms: number | null;
}

export interface ExportQuote {
  id: string;
  number: string;
  version: number;
  status: QuoteStatus;
  date: string | null;
  validUntil: string | null;
  currency: string;
  total: number;
  perPerson: number;
  inclusions: string[];
  exclusions: string[];
  terms: string[];
}

export interface ExportActivity {
  title: string;
  time: string | null;
  description: string | null;
  location: string | null;
  /** Content-only estimate from the AI itinerary; never an agency cost. */
  cost: number | null;
}

export interface ExportStay {
  name: string;
  location: string | null;
  description: string | null;
  vibe: string | null;
  pricePerNight: string | null;
}

export interface ExportDay {
  day: number;
  date: string | null;
  title: string;
  summary: string | null;
  activities: ExportActivity[];
  stay: ExportStay[];
  food: string[];
  transport: string[];
  tips: string[];
  permitRequired: boolean;
  imageUrl: string | null;
}

export interface ExportTrip {
  id: string;
  title: string;
  destination: string;
  startDate: string | null;
  endDate: string | null;
  durationDays: number;
  nights: number;
  groupType: string | null;
  season: string | null;
  days: ExportDay[];
}

export interface ExportContact {
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
}

export interface ExportDocument {
  schemaVersion: number;
  generatedAt: string;
  agency: ExportAgency;
  trip: ExportTrip;
  client: ExportClient | null;
  quote: ExportQuote | null;
  recommendations: string[];
  thingsToCarry: string[];
  cancellationPolicy: string[];
  contact: ExportContact;
}

export interface BuildExportDocumentInput {
  agency: any;
  trip: any;
  quote?: any | null;
  client?: any | null;
  brand?: ExportBrandAssets;
  now?: Date;
}

const MAX_STRING = 2_000;
const MAX_DAY_TITLE = 160;
const MAX_DAY_COUNT = 30;
const MAX_TEXT_ITEMS = 100;

function text(value: unknown, max = MAX_STRING): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function nullableText(value: unknown, max = MAX_STRING): string | null {
  const normalized = text(value, max);
  return normalized || null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function wholeNumber(value: unknown, min: number, max: number): number | null {
  const parsed = finiteNumber(value);
  if (parsed === null || !Number.isInteger(parsed)) return null;
  return Math.min(max, Math.max(min, parsed));
}

/** Accepts strings and the `{ title }` / `{ name }` shapes models may return. */
function textList(value: unknown, maxItems = MAX_TEXT_ITEMS, maxLength = MAX_STRING): string[] {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const entry of value) {
    const item =
      typeof entry === 'string'
        ? text(entry, maxLength)
        : entry && typeof entry === 'object'
          ? text((entry as any).title ?? (entry as any).name, maxLength)
          : '';
    if (item) items.push(item);
    if (items.length >= maxItems) break;
  }
  return items;
}

export function normalizeActivities(value: unknown): ExportActivity[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): ExportActivity | null => {
      if (typeof entry === 'string') {
        const title = text(entry, MAX_DAY_TITLE);
        return title
          ? {
              title,
              time: null,
              description: null,
              location: null,
              cost: null,
            }
          : null;
      }
      if (!entry || typeof entry !== 'object') return null;
      const source = entry as any;
      const title = text(source.title ?? source.name, MAX_DAY_TITLE);
      const description = nullableText(source.description, 3_000);
      if (!title && !description) return null;
      const cost = finiteNumber(source.approx_cost ?? source.cost);

      return {
        title: title || text(description, MAX_DAY_TITLE),
        time: nullableText(source.time, 40),
        description,
        location: nullableText(source.location ?? source.location_name, 160),
        cost: cost !== null && cost >= 0 ? cost : null,
      };
    })
    .filter((entry): entry is ExportActivity => entry !== null);
}

export function normalizeStays(value: unknown): ExportStay[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): ExportStay | null => {
      if (typeof entry === 'string') {
        const name = text(entry, MAX_DAY_TITLE);
        return name
          ? {
              name,
              location: null,
              description: null,
              vibe: null,
              pricePerNight: null,
            }
          : null;
      }
      if (!entry || typeof entry !== 'object') return null;
      const source = entry as any;
      const name = text(source.name ?? source.title, MAX_DAY_TITLE);
      if (!name) return null;
      const price =
        typeof source.price_per_night === 'number'
          ? String(source.price_per_night)
          : nullableText(source.price_per_night, 80);

      return {
        name,
        location: nullableText(source.location, 160),
        description: nullableText(source.description, 2_000),
        vibe: nullableText(source.vibe, 160),
        pricePerNight: price,
      };
    })
    .filter((entry): entry is ExportStay => entry !== null);
}

function validDate(value: unknown): Date | null {
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function inclusiveDayCount(start: Date | null, end: Date | null): number | null {
  if (!start || !end || end < start) return null;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function dayTitle(source: any, index: number): string {
  return text(source?.title, MAX_DAY_TITLE) || `Day ${index + 1}`;
}

function normalizeDay(source: any, index: number, startDate: Date | null): ExportDay {
  const raw = source && typeof source === 'object' ? source : {};
  const explicitDate =
    exportDateIso(raw.date) ??
    exportDateIso(raw.dayDate) ??
    exportDateIso(addDaysUtc(startDate, index));
  const dayNumber = wholeNumber(raw.day, 1, 999) ?? index + 1;

  return {
    day: dayNumber,
    date: explicitDate,
    title: dayTitle(raw, index),
    summary: nullableText(raw.summary, 2_000),
    activities: normalizeActivities(raw.activities),
    stay: normalizeStays(raw.stay_recommendations ?? raw.stays),
    food: textList(raw.food_spots ?? raw.food, 40, 240),
    transport: textList(raw.transport, 40, 240),
    tips: textList(raw.pro_tip ?? raw.tips, 40, 500),
    permitRequired: Boolean(raw.permit_required ?? raw.permitRequired),
    imageUrl: null,
  };
}

function quoteClient(quote: any): ExportClient | null {
  if (!quote?.client) return null;
  return {
    name: text(quote.client.name, 120),
    email: nullableText(quote.client.email, 160),
    phone: nullableText(quote.client.phone, 40),
    adults: wholeNumber(quote.client.adults, 1, 30),
    children: wholeNumber(quote.client.children, 0, 30),
    rooms: wholeNumber(quote.client.rooms, 0, 30),
  };
}

function directoryClient(client: any): ExportClient | null {
  if (!client) return null;
  const name = text(client.name, 120);
  if (!name) return null;
  return {
    name,
    email: nullableText(client.email, 160),
    phone: nullableText(client.phone, 40),
    adults: null,
    children: null,
    rooms: null,
  };
}

/** First non-empty activity location works as a destination fallback. */
function destinationFromDays(days: ExportDay[]): string {
  for (const day of days) {
    for (const activity of day.activities) {
      if (activity.location) return activity.location;
    }
  }
  return '';
}

function brandAsset(value: unknown): string | null {
  const source = text(value, 8_000_000);
  if (!source) return null;
  // Only data URLs are embedded; the template never fetches remote assets.
  return /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(source)
    ? source
    : null;
}

export function buildExportDocument(input: BuildExportDocumentInput): ExportDocument {
  const agency = input.agency ?? {};
  const trip = input.trip ?? {};
  const details =
    trip.tripDetails && typeof trip.tripDetails === 'object' ? trip.tripDetails : {};
  const branding =
    agency.branding && typeof agency.branding === 'object' ? agency.branding : {};

  const start = validDate(trip.startDate);
  const end = validDate(trip.endDate);
  const rawDays = Array.isArray(details.day_by_day_itinerary)
    ? details.day_by_day_itinerary
    : [];
  const dateDayCount = inclusiveDayCount(start, end);
  const declaredDayCount = wholeNumber(details.duration_days, 1, MAX_DAY_COUNT);
  const targetDays = Math.min(
    MAX_DAY_COUNT,
    Math.max(rawDays.length, dateDayCount ?? 0, declaredDayCount ?? 0, 1)
  );

  const days: ExportDay[] = [];
  for (let index = 0; index < targetDays; index += 1) {
    days.push(normalizeDay(rawDays[index], index, start));
  }

  const quote = input.quote ?? null;
  const quoteSnapshot: ExportQuote | null = quote
    ? {
        id: String(quote._id ?? ''),
        number: text(quote.number, 20),
        version: wholeNumber(quote.version, 1, 10_000) ?? 1,
        status: effectiveQuoteStatus(quote),
        date: exportDateIso(quote.createdAt),
        validUntil: exportDateIso(quote.validUntil),
        currency: text(quote.currency, 3).toUpperCase() || 'INR',
        total: finiteNumber(quote.total) ?? 0,
        perPerson: finiteNumber(quote.perPerson) ?? 0,
        inclusions: textList(quote.inclusions, 50, 500),
        exclusions: textList(quote.exclusions, 50, 500),
        terms: textList(quote.terms, 50, 500),
      }
    : null;

  const client = quoteClient(quote) ?? directoryClient(input.client);
  const contact: ExportContact = {
    phone: nullableText(branding.contactPhone, 40),
    email: nullableText(branding.contactEmail, 160),
    website: nullableText(branding.website, 2048),
    instagram: nullableText(branding.instagram ?? details.instagram, 2048),
  };

  const explicitDestination = text(details.destination, 160);
  const title =
    text(details.trip_title, 160) || text(trip.title, 160) || 'Your journey';

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    generatedAt: (input.now ?? new Date()).toISOString(),
    agency: {
      name: text(agency.name, 80) || 'Travel agency',
      logoUrl: brandAsset(input.brand?.logoDataUrl),
      mascotUrl: brandAsset(input.brand?.mascotDataUrl),
      primaryColor: nullableText(branding.primaryColor, 7),
      accentColor: nullableText(branding.accentColor, 7),
      fontHeading: nullableText(branding.fontHeading, 120),
      fontBody: nullableText(branding.fontBody, 120),
      address: nullableText(branding.address, 400),
      phone: contact.phone,
      email: contact.email,
      website: contact.website,
      gstin: nullableText(agency.gstin, 20),
    },
    trip: {
      id: String(trip._id ?? ''),
      title,
      destination: explicitDestination || destinationFromDays(days),
      startDate: exportDateIso(start),
      endDate: exportDateIso(end),
      durationDays: days.length,
      nights: Math.max(0, days.length - 1),
      groupType: nullableText(details.group_type, 80),
      season: nullableText(details.season, 80),
      days,
    },
    client,
    quote: quoteSnapshot,
    recommendations: textList(details.highlights, 12, 300),
    thingsToCarry: textList(
      details.things_to_carry ?? details.thingsToCarry ?? details.weather_advisory?.packing_tips,
      40,
      240
    ),
    cancellationPolicy: quoteSnapshot?.terms ?? [],
    contact,
  };
}
