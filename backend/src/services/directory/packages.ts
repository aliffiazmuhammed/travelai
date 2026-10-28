import mongoose, { Types } from 'mongoose';
import AgencyAsset from '../../models/AgencyAsset.js';
import AgencyPackage, {
  AGENCY_PACKAGE_LIMITS,
  type AgencyPackageState,
  type IAgencyPackage,
} from '../../models/AgencyPackage.js';
import Trip from '../../models/Trip.js';
import { AppError } from '../../utils/AppError.js';
import { recordAgencyAudit } from '../agency/audit.js';
import { agencyAssetContentUrl } from '../agency/assetStorage.js';
import { normalizeTextList } from './taxonomy.js';

/**
 * Package lifecycle (Milestone 9 D4).
 *
 * Two rules shape this module:
 *
 * 1. **A package is a snapshot.** `createAgencyPackage` copies the trip's
 *    title, nights and highlights into the package row and never reads the trip
 *    again. Re-saving or deleting the trip cannot change a public payload.
 * 2. **Publishing is a readiness decision.** A card without a title or a
 *    one-line summary cannot go public, because a bare card is worse than no
 *    card on a directory page.
 *
 * Covers are ordinary agency image assets: the package stores only
 * `coverAssetId`, and public visitors get bytes from a slug-addressed route.
 *
 * Ops moderation lives in `moderation`, not in `state`, so a takedown keeps the
 * agency's draft/published choice and a restore needs no second decision.
 */

export interface PackageReadiness {
  ready: boolean;
  missing: string[];
}

export interface OwnPackageView {
  id: string;
  tripId: string | null;
  title: string;
  summary: string;
  nights: number;
  pricePerPerson: number | null;
  currency: string;
  coverUrl: string | null;
  highlights: string[];
  inclusions: string[];
  state: AgencyPackageState;
  publishedAt: string | null;
  /** Ops takedown; the agency can see it but cannot clear it. */
  hidden: boolean;
  hiddenAt: string | null;
  hiddenReason: string | null;
  readiness: PackageReadiness;
}

export interface PackageInput {
  title?: unknown;
  summary?: unknown;
  nights?: unknown;
  fromPricePerPerson?: unknown;
  currency?: unknown;
  highlights?: unknown;
  inclusions?: unknown;
  coverAssetId?: unknown;
}

export interface PublicPackage {
  _id: unknown;
  title?: string;
  summary?: string;
  nights?: number;
  fromPricePerPerson?: number | null;
  currency?: string;
  coverAssetId?: unknown;
  highlights?: unknown;
  inclusions?: unknown;
  publishedAt?: Date | null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function textArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

export function packageReadiness(pkg: Partial<IAgencyPackage> | null): PackageReadiness {
  const missing: string[] = [];
  if (!text(pkg?.title)) {
    missing.push('Give the package a title.');
  }
  if (!text(pkg?.summary)) {
    missing.push('Write a one-line summary for the card.');
  }
  return { ready: missing.length === 0, missing };
}

/**
 * Shape wall for package writes. Unknown keys never reach the document, and
 * an empty string clears the optional price rather than publishing a zero.
 */
export function buildPackageFields(input: PackageInput): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if (input.title !== undefined) {
    const title = text(input.title);
    if (!title) throw new AppError('Give the package a title.', 400);
    if (title.length > AGENCY_PACKAGE_LIMITS.title) {
      throw new AppError(
        `Keep the title under ${AGENCY_PACKAGE_LIMITS.title} characters.`,
        400
      );
    }
    fields.title = title;
  }

  if (input.summary !== undefined) {
    const summary = text(input.summary);
    if (summary.length > AGENCY_PACKAGE_LIMITS.summary) {
      throw new AppError(
        `Keep the summary under ${AGENCY_PACKAGE_LIMITS.summary} characters.`,
        400
      );
    }
    fields.summary = summary;
  }

  if (input.nights !== undefined) {
    const nights = Number(input.nights);
    if (
      !Number.isInteger(nights) ||
      nights < 0 ||
      nights > AGENCY_PACKAGE_LIMITS.nights
    ) {
      throw new AppError(
        `Nights must be a whole number between 0 and ${AGENCY_PACKAGE_LIMITS.nights}.`,
        400
      );
    }
    fields.nights = nights;
  }

  if (input.fromPricePerPerson !== undefined) {
    const raw = input.fromPricePerPerson;
    if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      fields.fromPricePerPerson = null;
    } else {
      const price = Number(raw);
      if (
        !Number.isInteger(price) ||
        price < 0 ||
        price > AGENCY_PACKAGE_LIMITS.priceMax
      ) {
        throw new AppError('Enter a per-person price in whole rupees.', 400);
      }
      fields.fromPricePerPerson = price;
    }
  }

  if (input.currency !== undefined) {
    if (input.currency !== 'INR') {
      throw new AppError('Package prices are in rupees for now.', 400);
    }
    fields.currency = 'INR';
  }

  if (input.highlights !== undefined) {
    fields.highlights = normalizeTextList(input.highlights, {
      label: 'highlights',
      maxItems: AGENCY_PACKAGE_LIMITS.highlights,
      maxLength: AGENCY_PACKAGE_LIMITS.listItem,
    });
  }

  if (input.inclusions !== undefined) {
    fields.inclusions = normalizeTextList(input.inclusions, {
      label: 'inclusions',
      maxItems: AGENCY_PACKAGE_LIMITS.inclusions,
      maxLength: AGENCY_PACKAGE_LIMITS.listItem,
    });
  }

  return fields;
}

/**
 * A cover must be an image this agency already uploaded. Reusing the asset
 * library means no second upload pipeline and no foreign asset ids.
 */
export async function resolveCoverAsset(
  agencyId: string,
  value: unknown
): Promise<Types.ObjectId | null> {
  if (value === null || text(value) === '') return null;
  const id = String(value);
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Choose a cover image from your asset library.', 400);
  }
  const asset = await AgencyAsset.findOne({ _id: id, agencyId, kind: 'image' })
    .select('_id')
    .lean();
  if (!asset) {
    throw new AppError('Choose a cover image from your asset library.', 400);
  }
  return new Types.ObjectId(String((asset as any)._id));
}

function durationDays(trip: any): number {
  const details = trip?.tripDetails ?? {};
  const declared = Number(details.duration_days);
  if (Number.isInteger(declared) && declared > 0) return declared;

  const days = details.day_by_day_itinerary;
  if (Array.isArray(days) && days.length > 0) return days.length;

  const start = trip?.startDate ? new Date(trip.startDate) : null;
  const end = trip?.endDate ? new Date(trip.endDate) : null;
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    const span = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (span > 0) return span;
  }
  return 1;
}

/** The copied half of the snapshot; nothing monetary ever comes from a trip. */
export function snapshotFromTrip(trip: any): {
  title: string;
  nights: number;
  highlights: string[];
} {
  const details = trip?.tripDetails ?? {};
  const title = text(trip?.title) || text(details.trip_title);
  return {
    title: title.slice(0, AGENCY_PACKAGE_LIMITS.title),
    nights: Math.min(
      AGENCY_PACKAGE_LIMITS.nights,
      Math.max(0, durationDays(trip) - 1)
    ),
    highlights: textArray(details.highlights)
      .map((entry) => entry.slice(0, AGENCY_PACKAGE_LIMITS.listItem))
      .slice(0, AGENCY_PACKAGE_LIMITS.highlights),
  };
}

export async function createAgencyPackage(input: {
  agencyId: string;
  actorId?: string;
  tripId?: unknown;
  fields: PackageInput;
}): Promise<any> {
  const fields = buildPackageFields(input.fields);
  let snapshot: ReturnType<typeof snapshotFromTrip> | null = null;
  let tripId: Types.ObjectId | null = null;

  if (input.tripId !== undefined && input.tripId !== null) {
    const raw = String(input.tripId);
    if (!mongoose.isValidObjectId(raw)) {
      throw new AppError('Trip not found.', 404);
    }
    const trip = await Trip.findOne({
      _id: raw,
      workspace: 'agency',
      agencyId: input.agencyId,
      isDeleted: { $ne: true },
    }).lean();
    if (!trip) throw new AppError('Trip not found.', 404);

    const existing = await AgencyPackage.findOne({
      agencyId: input.agencyId,
      tripId: raw,
    })
      .select('_id')
      .lean();
    if (existing) {
      throw new AppError('This trip already has a package.', 409);
    }

    snapshot = snapshotFromTrip(trip);
    tripId = new Types.ObjectId(raw);
  }

  const coverAssetId =
    input.fields.coverAssetId !== undefined
      ? await resolveCoverAsset(input.agencyId, input.fields.coverAssetId)
      : null;

  const pkg = await AgencyPackage.create({
    agencyId: input.agencyId,
    tripId,
    title: (fields.title as string | undefined) ?? snapshot?.title ?? '',
    summary: (fields.summary as string | undefined) ?? '',
    nights: (fields.nights as number | undefined) ?? snapshot?.nights ?? 1,
    fromPricePerPerson:
      (fields.fromPricePerPerson as number | null | undefined) ?? null,
    currency: 'INR',
    coverAssetId,
    highlights:
      (fields.highlights as string[] | undefined) ?? snapshot?.highlights ?? [],
    inclusions: (fields.inclusions as string[] | undefined) ?? [],
    state: 'draft',
  });

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'package.created',
    targetType: 'package',
    targetId: String(pkg._id),
    metadata: { title: pkg.title, source: tripId ? 'trip' : 'scratch' },
  });

  return pkg;
}

export async function getAgencyPackage(
  agencyId: string,
  packageId: string
): Promise<IAgencyPackage> {
  if (!mongoose.isValidObjectId(packageId)) {
    throw new AppError('Package not found.', 404);
  }
  const pkg = await AgencyPackage.findOne({ _id: packageId, agencyId });
  if (!pkg) throw new AppError('Package not found.', 404);
  return pkg;
}

export async function updateAgencyPackage(input: {
  agencyId: string;
  packageId: string;
  actorId?: string;
  fields: PackageInput;
}): Promise<any> {
  const pkg = await getAgencyPackage(input.agencyId, input.packageId);
  const fields = buildPackageFields(input.fields);

  if (input.fields.coverAssetId !== undefined) {
    fields.coverAssetId = await resolveCoverAsset(
      input.agencyId,
      input.fields.coverAssetId
    );
  }

  if (Object.keys(fields).length === 0) {
    throw new AppError('Provide a package change.', 400);
  }

  Object.assign(pkg, fields);
  await pkg.save();

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'package.updated',
    targetType: 'package',
    targetId: String(pkg._id),
  });

  return pkg;
}

export async function publishAgencyPackage(input: {
  agencyId: string;
  packageId: string;
  actorId?: string;
}): Promise<any> {
  const pkg = await getAgencyPackage(input.agencyId, input.packageId);

  // Ops review outranks agency intent: only support clears a moderation hide.
  if (pkg.moderation?.hiddenAt) {
    throw new AppError(
      'This package is under review. Contact support before publishing it again.',
      409
    );
  }

  const readiness = packageReadiness(pkg);
  if (!readiness.ready) {
    throw new AppError(`Finish these first: ${readiness.missing.join(' ')}`, 400);
  }

  pkg.state = 'published';
  if (!pkg.publishedAt) pkg.publishedAt = new Date();
  await pkg.save();

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'package.published',
    targetType: 'package',
    targetId: String(pkg._id),
    metadata: { title: pkg.title },
  });

  return pkg;
}

export async function unpublishAgencyPackage(input: {
  agencyId: string;
  packageId: string;
  actorId?: string;
}): Promise<any> {
  const pkg = await getAgencyPackage(input.agencyId, input.packageId);

  pkg.state = 'draft';
  pkg.publishedAt = null;
  await pkg.save();

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'package.unpublished',
    targetType: 'package',
    targetId: String(pkg._id),
    metadata: { title: pkg.title },
  });

  return pkg;
}

export async function deleteAgencyPackage(input: {
  agencyId: string;
  packageId: string;
  actorId?: string;
}): Promise<{ id: string }> {
  const pkg = await getAgencyPackage(input.agencyId, input.packageId);
  await AgencyPackage.deleteOne({ _id: pkg._id, agencyId: input.agencyId });

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'package.deleted',
    targetType: 'package',
    targetId: String(pkg._id),
    metadata: { title: pkg.title },
  });

  return { id: String(pkg._id) };
}

export function viewOwnPackage(pkg: any, agencyId: string): OwnPackageView {
  return {
    id: String(pkg?._id ?? ''),
    tripId: pkg?.tripId ? String(pkg.tripId) : null,
    title: text(pkg?.title),
    summary: text(pkg?.summary),
    nights: Math.max(0, Number(pkg?.nights) || 0),
    pricePerPerson:
      pkg?.fromPricePerPerson === null || pkg?.fromPricePerPerson === undefined
        ? null
        : Number(pkg.fromPricePerPerson),
    currency: text(pkg?.currency) || 'INR',
    coverUrl: pkg?.coverAssetId
      ? agencyAssetContentUrl(agencyId, pkg.coverAssetId)
      : null,
    highlights: textArray(pkg?.highlights),
    inclusions: textArray(pkg?.inclusions),
    state: (pkg?.state ?? 'draft') as AgencyPackageState,
    publishedAt: pkg?.publishedAt ? new Date(pkg.publishedAt).toISOString() : null,
    hidden: Boolean(pkg?.moderation?.hiddenAt),
    hiddenAt: pkg?.moderation?.hiddenAt
      ? new Date(pkg.moderation.hiddenAt).toISOString()
      : null,
    hiddenReason: pkg?.moderation?.reason
      ? String(pkg.moderation.reason)
      : null,
    readiness: packageReadiness(pkg),
  };
}

export async function listAgencyPackages(agencyId: string): Promise<OwnPackageView[]> {
  const rows = await AgencyPackage.find({ agencyId })
    .sort({ order: 1, createdAt: -1 })
    .lean();
  return (rows as any[]).map((row) => viewOwnPackage(row, agencyId));
}

const PUBLIC_PACKAGE_FIELDS =
  'title summary nights fromPricePerPerson currency coverAssetId highlights inclusions publishedAt order';

/**
 * Every package a public profile may show. The profile's own eligibility
 * (published, active agency) is checked by the caller, so a package never
 * floats on a page that is not publicly visible.
 */
export async function loadPublicPackages(agencyId: string): Promise<PublicPackage[]> {
  const rows = await AgencyPackage.find({
    agencyId,
    state: 'published',
    publishedAt: { $ne: null },
    'moderation.hiddenAt': null,
  })
    .select(PUBLIC_PACKAGE_FIELDS)
    .sort({ order: 1, publishedAt: -1, _id: -1 })
    .lean();
  return rows as any[];
}

/** Lowest published per-person price per agency; feeds the listing "from". */
export async function lowestPackagePrices(
  agencyIds: string[]
): Promise<Map<string, { price: number; currency: string }>> {
  const ids = [...new Set(agencyIds.filter((id) => mongoose.isValidObjectId(id)))];
  const result = new Map<string, { price: number; currency: string }>();
  if (ids.length === 0) return result;

  const rows = (await AgencyPackage.find({
    agencyId: { $in: ids },
    state: 'published',
    publishedAt: { $ne: null },
    'moderation.hiddenAt': null,
    fromPricePerPerson: { $ne: null },
  })
    .select('agencyId fromPricePerPerson currency')
    .lean()) as any[];

  for (const row of rows) {
    const price = Number(row.fromPricePerPerson);
    if (!Number.isFinite(price)) continue;
    const key = String(row.agencyId);
    const current = result.get(key);
    if (!current || price < current.price) {
      result.set(key, { price, currency: text(row.currency) || 'INR' });
    }
  }
  return result;
}
