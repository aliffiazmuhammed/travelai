import { AppError } from '../../utils/AppError.js';

/**
 * Public directory taxonomy (Milestone 9 D1).
 *
 * Agencies pick services and languages from fixed lists so the directory can
 * filter on stable ids later without normalising free text. Destinations and
 * specialties stay free text — the set of places an Indian operator covers is
 * too open for an enum.
 *
 * The language codes intentionally mirror `SUPPORTED_LANGUAGES` in
 * `schemas/itinerary.schema.ts`; `taxonomy.test.ts` fails if they drift.
 */

export const DIRECTORY_SERVICE_IDS = [
  'custom_itineraries',
  'group_tours',
  'honeymoons',
  'family_trips',
  'adventure',
  'wildlife',
  'pilgrimage',
  'corporate_retreats',
  'destination_weddings',
  'visa_assistance',
] as const;

export type DirectoryServiceId = (typeof DIRECTORY_SERVICE_IDS)[number];

export const DIRECTORY_SERVICE_LABELS: Record<DirectoryServiceId, string> = {
  custom_itineraries: 'Custom itineraries',
  group_tours: 'Group tours',
  honeymoons: 'Honeymoons',
  family_trips: 'Family trips',
  adventure: 'Adventure & trekking',
  wildlife: 'Wildlife & safaris',
  pilgrimage: 'Pilgrimage',
  corporate_retreats: 'Corporate retreats',
  destination_weddings: 'Destination weddings',
  visa_assistance: 'Visa & documentation',
};

export const DIRECTORY_LANGUAGE_CODES = [
  'en',
  'hi',
  'ta',
  'bn',
  'te',
  'mr',
  'kn',
  'ml',
  'gu',
] as const;

export type DirectoryLanguageCode = (typeof DIRECTORY_LANGUAGE_CODES)[number];

export const DIRECTORY_LANGUAGE_LABELS: Record<DirectoryLanguageCode, string> = {
  en: 'English',
  hi: 'Hindi',
  ta: 'Tamil',
  bn: 'Bengali',
  te: 'Telugu',
  mr: 'Marathi',
  kn: 'Kannada',
  ml: 'Malayalam',
  gu: 'Gujarati',
};

export const DIRECTORY_LIMITS = {
  /** Publish gate: below this the profile reads like a placeholder. */
  aboutMin: 80,
  about: 1200,
  baseCity: 80,
  listItem: 60,
  destinations: 12,
  specialties: 12,
} as const;

function asList(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new AppError(`${label} must be a list.`, 400);
  }
  return value;
}

/**
 * Trims, drops empties, dedupes case-insensitively (first spelling wins) and
 * caps the list. Enforcing the cap here keeps the publish payload small.
 */
export function normalizeTextList(
  value: unknown,
  options: { label: string; maxItems: number; maxLength?: number }
): string[] {
  const list = asList(value, options.label);
  const maxLength = options.maxLength ?? DIRECTORY_LIMITS.listItem;
  const seen = new Set<string>();

  const cleaned: string[] = [];
  for (const entry of list) {
    if (typeof entry !== 'string') {
      throw new AppError(`${options.label} must be text.`, 400);
    }
    const text = entry.trim();
    if (!text) continue;
    if (text.length > maxLength) {
      throw new AppError(
        `Keep each ${options.label} entry under ${maxLength} characters.`,
        400
      );
    }
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(text);
  }

  if (cleaned.length > options.maxItems) {
    throw new AppError(
      `Add at most ${options.maxItems} ${options.label} entries.`,
      400
    );
  }
  return cleaned;
}

function normalizeCodes<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string
): T[] {
  const list = asList(value, label);
  const chosen = new Set<T>();
  for (const entry of list) {
    if (typeof entry !== 'string' || !allowed.includes(entry.trim().toLowerCase() as T)) {
      throw new AppError(`Choose ${label} from the list.`, 400);
    }
    chosen.add(entry.trim().toLowerCase() as T);
  }
  return allowed.filter((code) => chosen.has(code));
}

/** Keeps the canonical order so two agencies with the same pick read alike. */
export function normalizeServiceIds(value: unknown): DirectoryServiceId[] {
  return normalizeCodes(value, DIRECTORY_SERVICE_IDS, 'services');
}

export function normalizeLanguageCodes(value: unknown): DirectoryLanguageCode[] {
  return normalizeCodes(value, DIRECTORY_LANGUAGE_CODES, 'languages');
}

export interface DirectoryServiceView {
  id: DirectoryServiceId;
  label: string;
}

export interface DirectoryLanguageView {
  code: DirectoryLanguageCode;
  label: string;
}

/** Unknown ids are dropped rather than rendered as bare slugs. */
export function serviceViews(ids: unknown): DirectoryServiceView[] {
  if (!Array.isArray(ids)) return [];
  return DIRECTORY_SERVICE_IDS.filter((id) => ids.includes(id)).map((id) => ({
    id,
    label: DIRECTORY_SERVICE_LABELS[id],
  }));
}

export function languageViews(codes: unknown): DirectoryLanguageView[] {
  if (!Array.isArray(codes)) return [];
  return DIRECTORY_LANGUAGE_CODES.filter((code) => codes.includes(code)).map(
    (code) => ({ code, label: DIRECTORY_LANGUAGE_LABELS[code] })
  );
}

export interface DirectoryCatalog {
  services: DirectoryServiceView[];
  languages: DirectoryLanguageView[];
}

/** Chooser options for the agency editor; labels stay server-owned. */
export function directoryCatalog(): DirectoryCatalog {
  return {
    services: serviceViews(DIRECTORY_SERVICE_IDS),
    languages: languageViews(DIRECTORY_LANGUAGE_CODES),
  };
}
