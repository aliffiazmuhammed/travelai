import { AppError } from '../../utils/AppError.js';
import { readAgencyAssetContent } from '../agency/assets.js';
import { loadPublicAgencyRecord } from './profile.js';

/**
 * Public logo bytes (Milestone 9 D3).
 *
 * `branding.logoUrl` is the authenticated asset route and cannot be loaded by
 * an anonymous visitor. The directory therefore serves the same bytes through
 * this slug-addressed route, and only while the agency is active *and* its
 * profile is published: unpublishing or suspending takes the logo down with the
 * page instead of leaving a cached image behind.
 */

const LOGO_URL_PATTERN =
  /^\/api\/agency\/([a-f0-9]{24})\/assets\/([a-f0-9]{24})\/content$/i;

export interface PublicAgencyLogo {
  buffer: Buffer;
  mime: string;
}

/**
 * Anything but a server-generated pointer to this tenant's own asset is a
 * miss, never a redirect: the public route must not proxy arbitrary URLs.
 */
export function parseLogoAssetRef(
  agencyId: unknown,
  logoUrl: unknown
): { agencyId: string; assetId: string } | null {
  const match = LOGO_URL_PATTERN.exec(String(logoUrl ?? '').trim());
  if (!match || match[1] !== String(agencyId)) return null;
  return { agencyId: match[1], assetId: match[2] };
}

export async function loadPublicAgencyLogo(
  rawSlug: string
): Promise<PublicAgencyLogo | null> {
  const record = await loadPublicAgencyRecord(rawSlug);
  if (!record) return null;

  const ref = parseLogoAssetRef(record.agency?._id, record.agency?.branding?.logoUrl);
  if (!ref) return null;

  try {
    const { asset, buffer } = await readAgencyAssetContent(ref.agencyId, ref.assetId);
    if (asset.kind !== 'logo') return null;
    return { buffer, mime: asset.mime };
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 404) return null;
    throw error;
  }
}
