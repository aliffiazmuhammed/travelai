import {
  languageViews,
  serviceViews,
  type DirectoryLanguageView,
  type DirectoryServiceView,
} from './taxonomy.js';

/**
 * Public directory projection (Milestone 9 D1).
 *
 * An exact allow-list, pinned by a key-set test. Tenant internals are never
 * selected here: agency id, createdBy, plan, billing, GSTIN unless the agency
 * opted in, contact email, staff, quotes, clients and exports.
 *
 * Withheld values are `null` rather than missing keys — the payload shape is
 * stable, and a null is impossible to confuse with a leaked value.
 */

export interface DirectoryProfileView {
  slug: string;
  name: string;
  about: string;
  baseCity: string;
  destinations: string[];
  specialties: string[];
  services: DirectoryServiceView[];
  languages: DirectoryLanguageView[];
  logoUrl: string | null;
  website: string | null;
  contactPhone: string | null;
  gstin: string | null;
  verified: boolean;
  publishedAt: string | null;
  /** Median first-response hours, or null below the sample threshold. */
  replyTimeHours: number | null;
  packages: DirectoryPackageView[];
}

/** Sorted for the key-set test; keep in sync with the interface above. */
export const DIRECTORY_PROFILE_KEYS = [
  'about',
  'baseCity',
  'contactPhone',
  'destinations',
  'gstin',
  'languages',
  'logoUrl',
  'name',
  'packages',
  'publishedAt',
  'replyTimeHours',
  'services',
  'slug',
  'specialties',
  'verified',
  'website',
] as const;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalText(value: unknown): string | null {
  const trimmed = text(value);
  return trimmed || null;
}

function textArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

/**
 * The logo an anonymous visitor can actually load (M9 D3). `branding.logoUrl`
 * points at the authenticated asset route, so the public payload points at the
 * public logo route instead and never leaks a tenant-scoped URL.
 */
export function publicDirectoryLogoUrl(slug: unknown, branding: unknown): string | null {
  const value = text(slug);
  if (!value) return null;
  if (!optionalText((branding as any)?.logoUrl)) return null;
  return `/api/agencies/${encodeURIComponent(value)}/logo`;
}

/**
 * One published package card (M9 D4). The trip snapshot only: the source
 * `tripId`, the owning agency id, cover assets and any client-facing trip field
 * are structurally absent. `pricePerPerson` is null when the agency chose
 * "price on request".
 */
export interface DirectoryPackageView {
  id: string;
  title: string;
  summary: string;
  nights: number;
  pricePerPerson: number | null;
  currency: string;
  coverUrl: string | null;
  highlights: string[];
  inclusions: string[];
}

/** Sorted for the key-set test; keep in sync with the interface above. */
export const DIRECTORY_PACKAGE_KEYS = [
  'coverUrl',
  'currency',
  'highlights',
  'id',
  'inclusions',
  'nights',
  'pricePerPerson',
  'summary',
  'title',
] as const;

function publicPackageCoverUrl(
  slug: string,
  packageId: string,
  coverAssetId: unknown
): string | null {
  if (!coverAssetId) return null;
  return `/api/agencies/${encodeURIComponent(slug)}/packages/${encodeURIComponent(
    packageId
  )}/cover`;
}

export function projectDirectoryPackage(
  pkg: any,
  slug: string
): DirectoryPackageView {
  const id = pkg?._id ? String(pkg._id) : '';
  const price = Number(pkg?.fromPricePerPerson);
  return {
    id,
    title: text(pkg?.title),
    summary: text(pkg?.summary),
    nights: Math.max(0, Math.floor(Number(pkg?.nights) || 0)),
    pricePerPerson:
      pkg?.fromPricePerPerson === null ||
      pkg?.fromPricePerPerson === undefined ||
      !Number.isFinite(price)
        ? null
        : price,
    currency: text(pkg?.currency) || 'INR',
    coverUrl: publicPackageCoverUrl(slug, id, pkg?.coverAssetId),
    highlights: textArray(pkg?.highlights).slice(0, 6),
    inclusions: textArray(pkg?.inclusions).slice(0, 12),
  };
}

/**
 * One directory listing card (M9 D3). Deliberately smaller than the profile:
 * a browser needs a name, a face, where the agency works from and what it
 * specialises in. About, contact details, languages and GSTIN stay on the
 * profile page so the listing cannot be scraped as a contact list.
 *
 * `fromPricePerPerson` is the lowest published package price, or null when the
 * agency has published no number ("price on request" on the card).
 */
export interface DirectoryListingCard {
  slug: string;
  name: string;
  baseCity: string;
  specialties: string[];
  services: DirectoryServiceView[];
  logoUrl: string | null;
  verified: boolean;
  fromPricePerPerson: number | null;
  currency: string;
}

/** Sorted for the key-set test; keep in sync with the interface above. */
export const DIRECTORY_CARD_KEYS = [
  'baseCity',
  'currency',
  'fromPricePerPerson',
  'logoUrl',
  'name',
  'services',
  'slug',
  'specialties',
  'verified',
] as const;

export function projectDirectoryListingCard(input: {
  agency: any;
  profile: any;
  lowestPrice?: { price: number; currency: string } | null;
}): DirectoryListingCard {
  const { agency, profile } = input;
  const branding = agency?.branding ?? {};
  const lowest = input.lowestPrice ?? null;

  return {
    slug: text(agency?.slug),
    name: text(agency?.name),
    baseCity: text(profile?.baseCity),
    specialties: textArray(profile?.specialties),
    services: serviceViews(profile?.services),
    logoUrl: publicDirectoryLogoUrl(agency?.slug, branding),
    verified: Boolean(profile?.verifiedAt),
    fromPricePerPerson:
      lowest && Number.isFinite(lowest.price) ? lowest.price : null,
    currency: lowest ? text(lowest.currency) || 'INR' : 'INR',
  };
}

export function projectDirectoryProfile(input: {
  agency: any;
  profile: any;
  packages?: any[];
  replyTimeHours?: number | null;
}): DirectoryProfileView {
  const { agency, profile } = input;
  const branding = agency?.branding ?? {};
  const slug = text(agency?.slug);
  const packages = Array.isArray(input.packages) ? input.packages : [];
  const replyTime = Number(input.replyTimeHours);

  return {
    slug,
    name: text(agency?.name),
    about: text(profile?.about),
    baseCity: text(profile?.baseCity),
    destinations: textArray(profile?.destinations),
    specialties: textArray(profile?.specialties),
    services: serviceViews(profile?.services),
    languages: languageViews(profile?.languages),
    logoUrl: publicDirectoryLogoUrl(agency?.slug, branding),
    website: optionalText(branding.website),
    // Opt-in only: a directory visitor cannot harvest a phone number.
    contactPhone: profile?.showPhone ? optionalText(branding.contactPhone) : null,
    gstin: profile?.showGstin ? optionalText(agency?.gstin) : null,
    verified: Boolean(profile?.verifiedAt),
    publishedAt: profile?.publishedAt
      ? new Date(profile.publishedAt).toISOString()
      : null,
    replyTimeHours:
      Number.isFinite(replyTime) && replyTime > 0 ? Math.round(replyTime) : null,
    packages: packages.map((pkg) => projectDirectoryPackage(pkg, slug)),
  };
}
