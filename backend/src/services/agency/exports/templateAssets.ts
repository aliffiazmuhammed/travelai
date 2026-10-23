import { Types } from 'mongoose';
import AgencyAsset, { type IAgencyAsset } from '../../../models/AgencyAsset.js';
import type { IAgencyTemplateVersionAsset } from '../../../models/AgencyTemplateVersion.js';
import { AppError } from '../../../utils/AppError.js';
import {
  extensionForAgencyAssetMime,
  sniffAgencyAssetMime,
} from '../assets.js';
import { readAgencyAssetFile } from '../assetStorage.js';
import {
  buildAgencyTemplateAssetStorageKey,
  readAgencyTemplateAssetFile,
  removeAgencyTemplateAssetFile,
  writeAgencyTemplateAssetFile,
} from './templateStorage.js';

/**
 * Asset snapshots for uploaded templates (Agency Workspace A6).
 *
 * A template version embeds private copies of the approved logo, mascot, fonts,
 * cover and day images. Deleting or replacing an A3 asset later therefore
 * cannot change an approved proposal. Snapshot keys are version-scoped and
 * generated server-side; no asset URL from a template is fetched at render
 * time.
 */

export const AGENCY_TEMPLATE_MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;
export const AGENCY_TEMPLATE_MAX_DAY_ASSETS = 30;

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const ASSET_CONTENT_URL =
  /^\/api\/agency\/([a-f0-9]{24})\/assets\/([a-f0-9]{24})\/content$/i;
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const FONT_MIMES = new Set(['font/woff', 'font/woff2', 'font/ttf', 'font/otf']);
const IMAGE_SLOT = /^(?:logo|mascot|cover|day-(?:[1-9]|[12]\d|30))$/;

export interface AgencyTemplateAssetSelection {
  logoAssetId?: string | null;
  mascotAssetId?: string | null;
  headingFontAssetId?: string | null;
  bodyFontAssetId?: string | null;
  coverAssetId?: string | null;
  /** One image per 1-based itinerary position; later days win nothing. */
  dayAssets?: Array<{ day: number; assetId: string }>;
}

export interface SnapshotAgencyTemplateAssetsInput {
  agencyId: string;
  versionId: string;
  branding?: any;
  selection?: AgencyTemplateAssetSelection;
  /** Values and positive sections referenced by the validated source. */
  usedTokens?: string[];
}

export interface ResolvedTemplateFont {
  dataUrl: string;
  mime: string;
  family: string;
}

export interface ResolvedTemplateAssets {
  /** Recognised snapshot slots mapped to safe embedded data URLs. */
  images: Record<string, string>;
  headingFont: ResolvedTemplateFont | null;
  bodyFont: ResolvedTemplateFont | null;
}

interface WantedAsset {
  slot: string;
  assetId: string;
  kind: 'image' | 'font';
  /** Explicit admin choices fail loudly; branding fallbacks may be stale. */
  required: boolean;
}

function isImageAsset(asset: IAgencyAsset): boolean {
  return ['logo', 'mascot', 'image'].includes(String(asset.kind));
}

/** Parses a private A3 content URL, but only for the current tenant. */
export function agencyAssetIdFromContentUrl(
  value: unknown,
  agencyId: string
): string | null {
  const match = ASSET_CONTENT_URL.exec(String(value ?? '').trim());
  if (!match) return null;
  if (match[1].toLowerCase() !== agencyId.toLowerCase()) return null;
  return match[2].toLowerCase();
}

function addExplicit(
  wanted: WantedAsset[],
  slot: string,
  value: unknown,
  kind: 'image' | 'font'
): boolean {
  const assetId = String(value ?? '').trim().toLowerCase();
  if (!assetId) return false;
  if (!OBJECT_ID.test(assetId)) {
    throw new AppError('That asset reference is not valid.', 400);
  }
  wanted.push({ slot, assetId, kind, required: true });
  return true;
}

export function normalizeAgencyTemplateAssetSelection(
  selection: AgencyTemplateAssetSelection = {}
): Array<{ slot: string; assetId: string }> {
  const wanted: WantedAsset[] = [];
  addExplicit(wanted, 'logo', selection.logoAssetId, 'image');
  addExplicit(wanted, 'mascot', selection.mascotAssetId, 'image');
  addExplicit(wanted, 'heading-font', selection.headingFontAssetId, 'font');
  addExplicit(wanted, 'body-font', selection.bodyFontAssetId, 'font');
  addExplicit(wanted, 'cover', selection.coverAssetId, 'image');

  const days = new Map<number, string>();
  for (const entry of selection.dayAssets ?? []) {
    const day = Number(entry?.day);
    const assetId = String(entry?.assetId ?? '').trim().toLowerCase();
    if (!Number.isInteger(day) || day < 1 || day > AGENCY_TEMPLATE_MAX_DAY_ASSETS) {
      throw new AppError(
        `Day images must use a day between 1 and ${AGENCY_TEMPLATE_MAX_DAY_ASSETS}.`,
        400
      );
    }
    if (!OBJECT_ID.test(assetId)) {
      throw new AppError('That asset reference is not valid.', 400);
    }
    if (days.has(day)) {
      throw new AppError(`Day ${day} has more than one image.`, 400);
    }
    days.set(day, assetId);
  }
  for (const day of [...days.keys()].sort((a, b) => a - b)) {
    wanted.push({
      slot: `day-${day}`,
      assetId: days.get(day) as string,
      kind: 'image',
      required: true,
    });
  }

  return wanted.map(({ slot, assetId }) => ({ slot, assetId }));
}

/**
 * Rejects a template that references a snapshot slot the admin did not map.
 * Without this check a client proposal would silently ship with a missing
 * cover or day image.
 */
export function assertTemplateAssetCoverage(
  usedTokens: string[],
  assets: Array<Pick<IAgencyTemplateVersionAsset, 'slot'>> | null | undefined
): void {
  const slots = new Set((assets ?? []).map((asset) => String(asset.slot)));
  const required: Array<[string, string, string]> = [
    ['assets.logoDataUrl', 'logo', 'a logo'],
    ['assets.mascotDataUrl', 'mascot', 'a mascot'],
    ['assets.coverImageDataUrl', 'cover', 'a cover image'],
  ];
  for (const [token, slot, label] of required) {
    if (usedTokens.includes(token) && !slots.has(slot)) {
      throw new AppError(
        `This template uses ${label}. Choose one before uploading the template.`,
        400
      );
    }
  }
  if (
    usedTokens.includes('days.imageDataUrl') &&
    ![...slots].some((slot) => /^day-\d+$/.test(slot))
  ) {
    throw new AppError(
      'This template uses day images. Choose at least one day image before uploading.',
      400
    );
  }
}

function dataUrl(mime: string, buffer: Buffer): string {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function writeSnapshot(
  agencyId: string,
  versionId: string,
  wanted: WantedAsset,
  asset: IAgencyAsset,
  family: string | undefined,
  currentBytes: number
): Promise<IAgencyTemplateVersionAsset> {
  const buffer = await readAgencyAssetFile(asset.storageKey);
  const sniffed = sniffAgencyAssetMime(buffer);
  const expectedMime =
    wanted.kind === 'font' ? FONT_MIMES.has(String(sniffed)) : IMAGE_MIMES.has(String(sniffed));
  if (!sniffed || !expectedMime) {
    throw new AppError(
      `The ${wanted.slot.replace('-', ' ')} asset file is not a supported ${wanted.kind}.`,
      409
    );
  }
  if (currentBytes + buffer.byteLength > AGENCY_TEMPLATE_MAX_SNAPSHOT_BYTES) {
    throw new AppError(
      'These assets are too large to snapshot together. Choose smaller images or fonts.',
      413
    );
  }

  const extension = extensionForAgencyAssetMime(sniffed);
  if (!extension) {
    throw new AppError('That asset type is not supported.', 400);
  }
  const storageKey = buildAgencyTemplateAssetStorageKey(
    agencyId,
    versionId,
    wanted.slot,
    extension
  );
  await writeAgencyTemplateAssetFile(storageKey, buffer);

  return {
    slot: wanted.slot,
    assetId: asset._id as Types.ObjectId,
    storageKey,
    mime: sniffed,
    bytes: buffer.byteLength,
    ...(wanted.kind === 'font' && family ? { fontFamily: family } : {}),
  };
}

/**
 * Copies every mapped A3 asset into the version's private snapshot. Explicit
 * choices are tenant-scoped and must exist; current branding is used as a
 * fallback for logo, mascot and fonts so a first version needs little setup.
 */
export async function snapshotAgencyTemplateAssets(
  input: SnapshotAgencyTemplateAssetsInput
): Promise<IAgencyTemplateVersionAsset[]> {
  if (!OBJECT_ID.test(input.agencyId) || !OBJECT_ID.test(input.versionId)) {
    throw new AppError('That template reference is not valid.', 400);
  }

  const branding = input.branding ?? {};
  const selection = input.selection ?? {};
  const wanted: WantedAsset[] = [];
  const selected = normalizeAgencyTemplateAssetSelection(selection);
  for (const entry of selected) {
    const kind = entry.slot.endsWith('font') ? 'font' : 'image';
    wanted.push({ ...entry, kind, required: true });
  }

  const explicitLogo = Boolean(String(selection.logoAssetId ?? '').trim());
  const explicitMascot = Boolean(String(selection.mascotAssetId ?? '').trim());
  if (!explicitLogo) {
    const assetId = agencyAssetIdFromContentUrl(branding.logoUrl, input.agencyId);
    if (assetId) {
      wanted.push({ slot: 'logo', assetId, kind: 'image', required: false });
    }
  }
  if (!explicitMascot) {
    const assetId = agencyAssetIdFromContentUrl(branding.mascotUrl, input.agencyId);
    if (assetId) {
      wanted.push({ slot: 'mascot', assetId, kind: 'image', required: false });
    }
  }

  // Fonts are referenced by family, not URL, so resolve them from the tenant's
  // font library unless the upload explicitly chose an asset.
  const fontFamilies: Array<{ slot: string; family: string }> = [];
  if (!String(selection.headingFontAssetId ?? '').trim()) {
    const family = String(branding.fontHeading ?? '').trim();
    if (family) fontFamilies.push({ slot: 'heading-font', family });
  }
  if (!String(selection.bodyFontAssetId ?? '').trim()) {
    const family = String(branding.fontBody ?? '').trim();
    if (family) fontFamilies.push({ slot: 'body-font', family });
  }

  const assetIds = [...new Set(wanted.map((entry) => entry.assetId))];
  const assetDocs =
    assetIds.length > 0
      ? await AgencyAsset.find({ agencyId: input.agencyId, _id: { $in: assetIds } })
      : [];
  const assetsById = new Map(assetDocs.map((asset) => [String(asset._id), asset]));

  const resolved: Array<{ wanted: WantedAsset; asset: IAgencyAsset; family?: string }> = [];
  for (const entry of wanted) {
    const asset = assetsById.get(entry.assetId);
    if (!asset) {
      if (entry.required) throw new AppError('Asset not found', 404);
      continue;
    }
    const validKind =
      entry.kind === 'font' ? asset.kind === 'font' : isImageAsset(asset);
    if (!validKind) {
      if (entry.required) {
        throw new AppError(
          entry.kind === 'font'
            ? 'Choose a font asset for the typography slot.'
            : 'Choose an image asset for that slot.',
          400
        );
      }
      continue;
    }
    if (entry.kind === 'font' && !String(asset.fontFamily ?? '').trim()) {
      if (entry.required) {
        throw new AppError('That font has no family name.', 400);
      }
      continue;
    }
    resolved.push({ wanted: entry, asset });
  }

  if (fontFamilies.length > 0) {
    const fonts = await AgencyAsset.find({
      agencyId: input.agencyId,
      kind: 'font',
    })
      .sort({ createdAt: -1 })
      .limit(50);
    for (const request of fontFamilies) {
      const family = request.family.toLowerCase();
      const asset = fonts.find(
        (candidate) =>
          String(candidate.fontFamily ?? '').trim().toLowerCase() === family
      );
      if (asset) {
        resolved.push({
          wanted: {
            slot: request.slot,
            assetId: String(asset._id),
            kind: 'font',
            required: false,
          },
          asset,
          family: String(asset.fontFamily).trim(),
        });
      }
    }
  }

  const snapshots: IAgencyTemplateVersionAsset[] = [];
  let totalBytes = 0;
  try {
    for (const entry of resolved) {
      const family =
        entry.family ??
        (entry.wanted.kind === 'font'
          ? String(entry.asset.fontFamily ?? '').trim()
          : undefined);
      try {
        const snapshot = await writeSnapshot(
          input.agencyId,
          input.versionId,
          entry.wanted,
          entry.asset,
          family,
          totalBytes
        );
        totalBytes += snapshot.bytes;
        snapshots.push(snapshot);
      } catch (error) {
        if (entry.wanted.required) throw error;
        console.warn('Skipping unavailable brand asset for template:', error);
      }
    }

    assertTemplateAssetCoverage(input.usedTokens ?? [], snapshots);
    return snapshots;
  } catch (error) {
    await Promise.all(
      snapshots.map((snapshot) =>
        removeAgencyTemplateAssetFile(snapshot.storageKey).catch(() => undefined)
      )
    );
    throw error;
  }
}

function snapshotImageUrl(
  asset: IAgencyTemplateVersionAsset,
  buffer: Buffer
): string {
  const mime = String(asset.mime);
  if (!IMAGE_MIMES.has(mime)) {
    throw new AppError('A template image snapshot is not a supported image.', 409);
  }
  return dataUrl(mime, buffer);
}

/**
 * Reads the version's private snapshots into embedded data URLs. This is the
 * only place renderers get asset bytes; no live A3 row is consulted.
 */
export async function loadAgencyTemplateVersionAssets(
  assets: IAgencyTemplateVersionAsset[] | null | undefined = []
): Promise<ResolvedTemplateAssets> {
  const loaded: ResolvedTemplateAssets = {
    images: {},
    headingFont: null,
    bodyFont: null,
  };

  for (const asset of assets ?? []) {
    const slot = String(asset.slot);
    const isFont = slot === 'heading-font' || slot === 'body-font';
    if (!isFont && !IMAGE_SLOT.test(slot)) continue;

    const buffer = await readAgencyTemplateAssetFile(asset.storageKey);
    if (buffer.byteLength !== Number(asset.bytes)) {
      throw new AppError(
        'A template asset snapshot is incomplete. Upload a new template version.',
        409
      );
    }
    const sniffed = sniffAgencyAssetMime(buffer);
    if (!sniffed || sniffed !== asset.mime) {
      throw new AppError(
        'A template asset snapshot is no longer readable. Upload a new template version.',
        409
      );
    }

    if (!isFont) {
      loaded.images[slot] = snapshotImageUrl(asset, buffer);
      continue;
    }

    const family = String(asset.fontFamily ?? '').trim();
    if (!FONT_MIMES.has(sniffed) || !family) {
      throw new AppError(
        'A template font snapshot is no longer readable. Upload a new template version.',
        409
      );
    }
    const font: ResolvedTemplateFont = {
      dataUrl: dataUrl(sniffed, buffer),
      mime: sniffed,
      family,
    };
    if (slot === 'heading-font') loaded.headingFont = font;
    else loaded.bodyFont = font;
  }

  return loaded;
}
