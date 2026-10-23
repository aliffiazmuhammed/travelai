import AgencyAsset from '../../../models/AgencyAsset.js';
import { readAgencyAssetContent } from '../assets.js';
import { readAgencyAssetFile } from '../assetStorage.js';
import type { ExportBrandAssets } from './document.js';
import type { ExportRenderBrand } from './render.js';

/**
 * Resolves agency branding into self-contained data URLs for the export
 * renderer (Agency Workspace A5).
 *
 * Only private assets owned by the tenant are embedded. External branding URLs
 * are deliberately never fetched: the document must render offline, and an
 * agency-controlled URL must not become an SSRF handle or a slow network
 * dependency inside the PDF worker.
 */

const ASSET_URL = /^\/api\/agency\/([a-f0-9]{24})\/assets\/([a-f0-9]{24})\/content$/i;

function assetIdFromUrl(
  value: unknown,
  agencyId: string
): string | null {
  const match = ASSET_URL.exec(String(value ?? '').trim());
  if (!match) return null;
  if (match[1].toLowerCase() !== agencyId.toLowerCase()) return null;
  return match[2];
}

async function imageDataUrl(
  agencyId: string,
  value: unknown
): Promise<string | null> {
  const assetId = assetIdFromUrl(value, agencyId);
  if (!assetId) return null;
  try {
    const { asset, buffer } = await readAgencyAssetContent(agencyId, assetId);
    if (!/^image\/(?:png|jpe?g|webp)$/i.test(asset.mime)) return null;
    return `data:${asset.mime};base64,${buffer.toString('base64')}`;
  } catch (error) {
    // A deleted or unreadable brand asset must not fail the whole export.
    console.warn('Agency export brand image unavailable:', error);
    return null;
  }
}

async function fontData(
  agencyId: string,
  family: unknown
): Promise<{ dataUrl: string; mime: string } | null> {
  const name = String(family ?? '').trim().toLowerCase();
  if (!name) return null;

  const fonts = await AgencyAsset.find({ agencyId, kind: 'font' })
    .sort({ createdAt: -1 })
    .limit(25);
  const asset = fonts.find(
    (candidate) => String(candidate.fontFamily ?? '').trim().toLowerCase() === name
  );
  if (!asset) return null;

  try {
    const buffer = await readAgencyAssetFile(asset.storageKey);
    return {
      dataUrl: `data:${asset.mime};base64,${buffer.toString('base64')}`,
      mime: asset.mime,
    };
  } catch (error) {
    console.warn('Agency export brand font unavailable:', error);
    return null;
  }
}

export interface ResolvedExportBrand extends ExportRenderBrand {
  /** The subset the canonical document embeds directly. */
  documentAssets: ExportBrandAssets;
}

export async function resolveExportBrand(
  agencyId: string,
  agency: any
): Promise<ResolvedExportBrand> {
  const branding = agency?.branding ?? {};

  const [logo, mascot, headingFont, bodyFont] = await Promise.all([
    imageDataUrl(agencyId, branding.logoUrl),
    imageDataUrl(agencyId, branding.mascotUrl),
    fontData(agencyId, branding.fontHeading),
    fontData(agencyId, branding.fontBody),
  ]);

  return {
    logoDataUrl: logo,
    mascotDataUrl: mascot,
    headingFontDataUrl: headingFont?.dataUrl ?? null,
    bodyFontDataUrl: bodyFont?.dataUrl ?? null,
    headingFontMime: headingFont?.mime ?? null,
    bodyFontMime: bodyFont?.mime ?? null,
    documentAssets: {
      logoDataUrl: logo,
      mascotDataUrl: mascot,
    },
  };
}
