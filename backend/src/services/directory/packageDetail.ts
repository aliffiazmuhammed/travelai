import mongoose from 'mongoose';
import AgencyPackage from '../../models/AgencyPackage.js';
import { loadPublicAgencyRecord } from './profile.js';

/**
 * Public package detail (M9 follow-up).
 *
 * The profile listing carries cards only. Opening one asks for the plan too,
 * so it lives on its own read: the profile must be publicly visible and the
 * package must be published and not hidden by ops. Anything else is a 404,
 * exactly like the cover bytes.
 */
export async function loadPublicPackageDetail(
  rawSlug: string,
  packageId: string
): Promise<any | null> {
  if (!mongoose.isValidObjectId(packageId)) return null;

  const record = await loadPublicAgencyRecord(rawSlug);
  if (!record) return null;

  return AgencyPackage.findOne({
    _id: packageId,
    agencyId: record.agency._id,
    state: 'published',
    publishedAt: { $ne: null },
    'moderation.hiddenAt': null,
  })
    .select(
      'title summary nights fromPricePerPerson currency coverAssetId highlights inclusions itinerary _id'
    )
    .lean();
}
