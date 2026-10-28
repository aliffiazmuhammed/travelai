import mongoose, { type FilterQuery } from 'mongoose';
import Agency from '../../models/Agency.js';
import AgencyProfile from '../../models/AgencyProfile.js';
import { AppError } from '../../utils/AppError.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import {
  DIRECTORY_LANGUAGE_CODES,
  DIRECTORY_LANGUAGE_LABELS,
  type DirectoryLanguageCode,
} from './taxonomy.js';
import {
  projectDirectoryListingCard,
  type DirectoryListingCard,
} from './projection.js';
import { publicProfileFilter } from './profile.js';
import { lowestPackagePrices } from './packages.js';

/**
 * Public agency directory listing and facets (Milestone 9 D3).
 *
 * The listing mirrors the gallery's shape: a stable `(publishedAt, _id)` cursor,
 * `limit + 1` to learn whether another page exists, and a `total` for the
 * filtered set. Profiles are the source of truth for publication, and each page
 * is enriched from the owning `Agency`, so a suspended tenant drops out even if
 * its profile row still says `published`.
 *
 * `total` counts eligible profiles before that enrichment, exactly like the
 * gallery's; it can therefore be one or two higher than the cards a visitor can
 * page through while a suspension is being cleaned up.
 */

export interface DirectoryListQuery {
  q?: string;
  city?: string;
  destination?: string;
  specialty?: string;
  language?: string;
  cursor?: string;
  limit?: number;
}

export interface DirectoryPage {
  agencies: DirectoryListingCard[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

export interface DirectoryFacet {
  value: string;
  label: string;
  count: number;
}

export interface DirectoryFacets {
  destinations: DirectoryFacet[];
  specialties: DirectoryFacet[];
  cities: DirectoryFacet[];
  languages: DirectoryFacet[];
}

interface DirectoryCursor {
  publishedAt: Date;
  id: string;
}

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;
/** Free-text facets can grow without bound; chips only need the top of it. */
const FACET_LIMIT = 30;

function exactInsensitive(value: string): RegExp {
  return new RegExp(`^${escapeRegex(value)}$`, 'i');
}

function textArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

export function encodeDirectoryCursor(row: any): string {
  const publishedAt = new Date(row.publishedAt);
  return Buffer.from(
    JSON.stringify({ p: publishedAt.toISOString(), i: String(row._id) })
  ).toString('base64url');
}

export function decodeDirectoryCursor(raw: string): DirectoryCursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const publishedAt = new Date(String(parsed?.p ?? ''));
    const id = String(parsed?.i ?? '');
    if (
      Number.isNaN(publishedAt.getTime()) ||
      !mongoose.isValidObjectId(id) ||
      Object.keys(parsed ?? {}).length !== 2
    ) {
      throw new Error('bad cursor');
    }
    return { publishedAt, id };
  } catch {
    throw new AppError('That page cursor is not valid.', 400);
  }
}

/**
 * Builds the Mongo filter for the listing. Exported so the query shape
 * (eligibility, search, facet filters, cursor) is pinned by tests without a
 * database. `nameMatchedAgencyIds` carries the agencies whose *name* matched
 * the text query, resolved by `agencyIdsMatchingName` before this runs.
 */
export function buildDirectoryFilter(
  query: DirectoryListQuery,
  nameMatchedAgencyIds: string[] = []
): FilterQuery<any> {
  const clauses: FilterQuery<any>[] = [publicProfileFilter()];

  const search = String(query.q ?? '').trim();
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    const branches: FilterQuery<any>[] = [
      { about: pattern },
      { baseCity: pattern },
      { destinations: pattern },
      { specialties: pattern },
    ];
    if (nameMatchedAgencyIds.length > 0) {
      branches.push({ agencyId: { $in: nameMatchedAgencyIds } });
    }
    clauses.push({ $or: branches });
  }

  const city = String(query.city ?? '').trim();
  if (city) clauses.push({ baseCity: exactInsensitive(city) });

  const destination = String(query.destination ?? '').trim();
  if (destination) clauses.push({ destinations: exactInsensitive(destination) });

  const specialty = String(query.specialty ?? '').trim();
  if (specialty) clauses.push({ specialties: exactInsensitive(specialty) });

  const language = String(query.language ?? '').trim().toLowerCase();
  if (language) clauses.push({ languages: language });

  if (query.cursor) {
    const cursor = decodeDirectoryCursor(query.cursor);
    const id = new mongoose.Types.ObjectId(cursor.id);
    clauses.push({
      $or: [
        { publishedAt: { $lt: cursor.publishedAt } },
        { publishedAt: cursor.publishedAt, _id: { $lt: id } },
      ],
    });
  }

  return { $and: clauses };
}

/** Agency names are the one search field that lives outside the profile row. */
export async function agencyIdsMatchingName(search: string): Promise<string[]> {
  const pattern = new RegExp(escapeRegex(search), 'i');
  const rows = (await Agency.find({ status: 'active', name: pattern })
    .select('_id')
    .lean()) as any[];
  return rows.map((row) => String(row._id));
}

async function activeAgencyMap(ids: unknown[]): Promise<Map<string, any>> {
  const unique = [
    ...new Set(
      ids
        .map((id) => String(id))
        .filter((id) => mongoose.isValidObjectId(id))
    ),
  ];
  if (unique.length === 0) return new Map();

  const rows = (await Agency.find({
    _id: { $in: unique },
    status: 'active',
  })
    .select('name slug branding')
    .lean()) as any[];

  return new Map(rows.map((row) => [String(row._id), row]));
}

/** Anonymous directory listing, newest publication first. */
export async function listDirectoryAgencies(
  query: DirectoryListQuery = {}
): Promise<DirectoryPage> {
  const limit = Math.min(
    Math.max(Math.floor(Number(query.limit) || DEFAULT_LIMIT), 1),
    MAX_LIMIT
  );
  const search = String(query.q ?? '').trim();
  const nameMatched = search ? await agencyIdsMatchingName(search) : [];

  const filter = buildDirectoryFilter(query, nameMatched);
  const countFilter = buildDirectoryFilter(
    { ...query, cursor: undefined },
    nameMatched
  );

  const [rows, total] = await Promise.all([
    AgencyProfile.find(filter)
      .select('agencyId baseCity specialties services publishedAt verifiedAt')
      .sort({ publishedAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean() as unknown as Promise<any[]>,
    AgencyProfile.countDocuments(countFilter),
  ]);

  const pageRows = rows.slice(0, limit);
  const [agencies, prices] = await Promise.all([
    activeAgencyMap(pageRows.map((row) => row.agencyId)),
    lowestPackagePrices(pageRows.map((row) => String(row.agencyId))),
  ]);
  const cards = pageRows
    .map((row) => {
      const agency = agencies.get(String(row.agencyId));
      if (!agency) return null;
      return projectDirectoryListingCard({
        agency,
        profile: row,
        lowestPrice: prices.get(String(row.agencyId)) ?? null,
      });
    })
    .filter((card): card is DirectoryListingCard => card !== null);

  const last = pageRows[pageRows.length - 1];
  return {
    agencies: cards,
    nextCursor: rows.length > limit && last ? encodeDirectoryCursor(last) : null,
    hasMore: rows.length > limit,
    total,
  };
}

function tallyFacets(values: string[][]): DirectoryFacet[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const list of values) {
    for (const raw of list) {
      const label = raw.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { label, count: 1 });
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, FACET_LIMIT)
    .map((entry) => ({ value: entry.label, label: entry.label, count: entry.count }));
}

function languageFacets(profiles: any[]): DirectoryFacet[] {
  const counts = new Map<DirectoryLanguageCode, number>();
  for (const profile of profiles) {
    for (const code of textArray(profile?.languages)) {
      if (!(DIRECTORY_LANGUAGE_CODES as readonly string[]).includes(code)) continue;
      const typed = code as DirectoryLanguageCode;
      counts.set(typed, (counts.get(typed) ?? 0) + 1);
    }
  }

  return DIRECTORY_LANGUAGE_CODES.filter((code) => counts.has(code))
    .map((code) => ({
      value: code,
      label: DIRECTORY_LANGUAGE_LABELS[code],
      count: counts.get(code) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Pure facet tally over the eligible profiles; exported for DB-free tests.
 * Counts are agencies, because a tenant has exactly one profile.
 */
export function tallyDirectoryFacets(profiles: any[]): DirectoryFacets {
  return {
    destinations: tallyFacets(profiles.map((row) => textArray(row?.destinations))),
    specialties: tallyFacets(profiles.map((row) => textArray(row?.specialties))),
    cities: tallyFacets(
      profiles.map((row) => {
        const city = String(row?.baseCity ?? '').trim();
        return city ? [city] : [];
      })
    ),
    languages: languageFacets(profiles),
  };
}

/** Filter chips for the listing, taken from what is currently published. */
export async function listDirectoryFacets(): Promise<DirectoryFacets> {
  const [rows, agencies] = await Promise.all([
    AgencyProfile.find(publicProfileFilter())
      .select('agencyId baseCity destinations specialties languages')
      .lean() as unknown as Promise<any[]>,
    Agency.find({ status: 'active' }).select('_id').lean() as unknown as Promise<
      any[]
    >,
  ]);

  const activeIds = new Set(agencies.map((row) => String(row._id)));
  return tallyDirectoryFacets(
    rows.filter((row) => activeIds.has(String(row.agencyId)))
  );
}
