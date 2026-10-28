import Agency from '../../models/Agency.js';
import AgencyProfile, {
  type AgencyProfileState,
  type IAgencyProfile,
} from '../../models/AgencyProfile.js';
import { AppError } from '../../utils/AppError.js';
import { recordAgencyAudit } from '../agency/audit.js';
import { projectDirectoryProfile, type DirectoryProfileView } from './projection.js';
import { loadPublicPackages } from './packages.js';
import { agencyReplyTimeHours } from './insights.js';
import {
  DIRECTORY_LIMITS,
  normalizeLanguageCodes,
  normalizeServiceIds,
  normalizeTextList,
} from './taxonomy.js';

/**
 * Directory profile lifecycle (Milestone 9 D1).
 *
 * Two rules shape this module:
 *
 * 1. **The tenant copy and the public copy are different payloads.** The
 *    agency reads its own row through `viewOwnDirectoryProfile` (state,
 *    moderation flag included); strangers only ever see
 *    `projectDirectoryProfile`.
 * 2. **Publishing is a readiness decision, not a flag.** A profile missing a
 *    description, city, destination, service or logo cannot go public, so a
 *    half-filled listing never becomes a first impression.
 */

export interface DirectoryReadiness {
  ready: boolean;
  missing: string[];
}

export interface OwnDirectoryProfileView {
  state: AgencyProfileState;
  about: string;
  baseCity: string;
  destinations: string[];
  specialties: string[];
  services: string[];
  languages: string[];
  showPhone: boolean;
  showGstin: boolean;
  publishedAt: string | null;
  verified: boolean;
  underReview: boolean;
}

export interface DirectoryProfileInput {
  about?: unknown;
  baseCity?: unknown;
  destinations?: unknown;
  specialties?: unknown;
  languages?: unknown;
  services?: unknown;
  showPhone?: unknown;
  showGstin?: unknown;
}

export interface DirectoryProfileUpdate {
  $set: Record<string, unknown>;
  $unset: Record<string, 1>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
    : [];
}

export function directoryReadiness(
  profile: any,
  agency: any
): DirectoryReadiness {
  const missing: string[] = [];
  const about = String(profile?.about || '').trim();
  if (about.length < DIRECTORY_LIMITS.aboutMin) {
    missing.push(
      `Write at least ${DIRECTORY_LIMITS.aboutMin} characters about your agency.`
    );
  }
  if (!String(profile?.baseCity || '').trim()) {
    missing.push('Add the city you plan trips from.');
  }
  if (stringArray(profile?.destinations).length === 0) {
    missing.push('List at least one destination you cover.');
  }
  if (stringArray(profile?.services).length === 0) {
    missing.push('Choose at least one service you offer.');
  }
  if (!String(agency?.branding?.logoUrl || '').trim()) {
    missing.push('Upload a logo in Agency settings.');
  }
  return { ready: missing.length === 0, missing };
}

function normalizeLongText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') {
    throw new AppError(`${label} must be text.`, 400);
  }
  const text = value.trim();
  if (text.length > max) {
    throw new AppError(`Keep ${label} under ${max} characters.`, 400);
  }
  return text;
}

/** Allow-list builder: unknown keys can never reach the document. */
export function buildDirectoryProfileUpdate(
  input: DirectoryProfileInput
): DirectoryProfileUpdate {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};

  if (input.about !== undefined) {
    const about = normalizeLongText(input.about, 'the description', DIRECTORY_LIMITS.about);
    if (about) $set.about = about;
    else $unset.about = 1;
  }

  if (input.baseCity !== undefined) {
    const city = normalizeLongText(input.baseCity, 'the base city', DIRECTORY_LIMITS.baseCity);
    if (city) $set.baseCity = city;
    else $unset.baseCity = 1;
  }

  if (input.destinations !== undefined) {
    $set.destinations = normalizeTextList(input.destinations, {
      label: 'destinations',
      maxItems: DIRECTORY_LIMITS.destinations,
    });
  }

  if (input.specialties !== undefined) {
    $set.specialties = normalizeTextList(input.specialties, {
      label: 'specialties',
      maxItems: DIRECTORY_LIMITS.specialties,
    });
  }

  if (input.services !== undefined) {
    $set.services = normalizeServiceIds(input.services);
  }

  if (input.languages !== undefined) {
    $set.languages = normalizeLanguageCodes(input.languages);
  }

  for (const key of ['showPhone', 'showGstin'] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') {
      throw new AppError(`${key === 'showPhone' ? 'Phone' : 'GSTIN'} visibility must be on or off.`, 400);
    }
    $set[key] = value;
  }

  if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
    throw new AppError('Provide a profile change.', 400);
  }

  return { $set, $unset };
}

export async function loadDirectoryProfile(agencyId: string): Promise<any | null> {
  return AgencyProfile.findOne({ agencyId }).lean();
}

export async function updateDirectoryProfile(
  agencyId: string,
  input: DirectoryProfileInput
): Promise<any> {
  const update = buildDirectoryProfileUpdate(input);
  const profile = await AgencyProfile.findOneAndUpdate({ agencyId }, update, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
    runValidators: true,
  }).lean();
  if (!profile) {
    throw new AppError('Could not save the public profile.', 500);
  }
  return profile;
}

export function viewOwnDirectoryProfile(profile: any): OwnDirectoryProfileView {
  return {
    state: (profile?.state ?? 'draft') as AgencyProfileState,
    about: String(profile?.about || ''),
    baseCity: String(profile?.baseCity || ''),
    destinations: stringArray(profile?.destinations),
    specialties: stringArray(profile?.specialties),
    services: stringArray(profile?.services),
    languages: stringArray(profile?.languages),
    showPhone: Boolean(profile?.showPhone),
    showGstin: Boolean(profile?.showGstin),
    publishedAt: profile?.publishedAt
      ? new Date(profile.publishedAt).toISOString()
      : null,
    verified: Boolean(profile?.verifiedAt),
    underReview: Boolean(profile?.moderation?.hiddenAt),
  };
}

export async function publishDirectoryProfile(input: {
  agencyId: string;
  actorId?: string;
}): Promise<any> {
  const agency = await Agency.findById(input.agencyId).lean();
  if (!agency) {
    throw new AppError('Agency not found.', 404);
  }

  const profile = await AgencyProfile.findOne({ agencyId: input.agencyId });
  if (!profile) {
    throw new AppError('Save your public profile before publishing it.', 400);
  }
  // Ops review outranks agency intent: only support clears a moderation hide.
  if (profile.moderation?.hiddenAt) {
    throw new AppError(
      'This profile is under review. Contact support before publishing it again.',
      409
    );
  }

  const readiness = directoryReadiness(profile, agency);
  if (!readiness.ready) {
    throw new AppError(`Finish these first: ${readiness.missing.join(' ')}`, 400);
  }

  profile.state = 'published';
  if (!profile.publishedAt) profile.publishedAt = new Date();
  await profile.save();

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'profile.published',
    targetType: 'profile',
    targetId: String(profile._id),
    metadata: { slug: agency.slug },
  });

  return profile;
}

export async function unpublishDirectoryProfile(input: {
  agencyId: string;
  actorId?: string;
}): Promise<any> {
  const profile = await AgencyProfile.findOne({ agencyId: input.agencyId });
  if (!profile) {
    throw new AppError('This agency has no public profile yet.', 404);
  }

  profile.state = 'draft';
  profile.publishedAt = null;
  await profile.save();

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'profile.unpublished',
    targetType: 'profile',
    targetId: String(profile._id),
  });

  return profile;
}

/**
 * The filter every public directory read (profile, logo, listing, facets) must
 * apply to a profile row. One definition keeps an ops hide or an unpublished
 * draft from surviving on one surface after it vanished from another.
 */
export function publicProfileFilter(): Record<string, unknown> {
  return {
    state: 'published',
    publishedAt: { $ne: null },
    'moderation.hiddenAt': null,
  };
}

/**
 * The single eligibility rule for every public agency read (profile and logo).
 * Returns `null` for unknown slug, suspended agency, draft or hidden profile,
 * ops-hidden profile, or a published state without a date — so each route can
 * answer a uniform 404.
 */
export async function loadPublicAgencyRecord(
  rawSlug: string
): Promise<{ agency: any; profile: any } | null> {
  const slug = String(rawSlug || '').trim().toLowerCase();
  if (!slug || slug.length > 40) return null;

  const agency = await Agency.findOne({ slug, status: 'active' }).lean();
  if (!agency) return null;

  const profile = await AgencyProfile.findOne({
    agencyId: agency._id,
    ...publicProfileFilter(),
  }).lean();
  if (!profile) return null;

  return { agency, profile };
}

/**
 * The only public profile read path; projection only. Published packages are
 * snapshots of their own rows, so the profile read never touches a trip.
 */
export async function loadPublicAgencyProfile(
  rawSlug: string
): Promise<DirectoryProfileView | null> {
  const record = await loadPublicAgencyRecord(rawSlug);
  if (!record) return null;
  const [packages, replyTimeHours] = await Promise.all([
    loadPublicPackages(String(record.agency._id)),
    agencyReplyTimeHours(String(record.agency._id)),
  ]);
  return projectDirectoryProfile({ ...record, packages, replyTimeHours });
}
