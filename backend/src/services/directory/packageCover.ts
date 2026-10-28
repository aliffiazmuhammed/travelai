import mongoose from 'mongoose';
import AgencyPackage from '../../models/AgencyPackage.js';
import { AppError } from '../../utils/AppError.js';
import { readAgencyAssetContent } from '../agency/assets.js';
import { loadPublicAgencyRecord } from './profile.js';

/**
 * Public package cover bytes (M9 D4).
 *
 * A cover is an ordinary agency image asset, so anonymous visitors cannot use
 * its authenticated URL. This loader applies the profile's public eligibility
 * first (active agency, published profile) and then serves only the cover of a
 * published package owned by that tenant.
 */
export interface PublicPackageCover {
  buffer: Buffer;
  mime: string;
}

export async function loadPublicPackageCover(
  rawSlug: string,
  packageId: string
): Promise<PublicPackageCover | null> {
  if (!mongoose.isValidObjectId(packageId)) return null;

  const record = await loadPublicAgencyRecord(rawSlug);
  if (!record) return null;

  const pkg = await AgencyPackage.findOne({
    _id: packageId,
    agencyId: record.agency._id,
    state: 'published',
    'moderation.hiddenAt': null,
  })
    .select('coverAssetId')
    .lean();
  if (!pkg?.coverAssetId) return null;

  try {
    const { asset, buffer } = await readAgencyAssetContent(
      String(record.agency._id),
      String(pkg.coverAssetId)
    );
    if (asset.kind !== 'image') return null;
    return { buffer, mime: asset.mime };
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 404) return null;
    throw error;
  }
}
