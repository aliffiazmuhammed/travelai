import { Types } from 'mongoose';
import Agency from '../../models/Agency.js';
import AgencyAsset, {
  AGENCY_ASSET_KINDS,
  type AgencyAssetKind,
  type IAgencyAsset,
} from '../../models/AgencyAsset.js';
import { AppError } from '../../utils/AppError.js';
import { assertStorageQuota } from './plan.js';
import { sniffMime } from '../finance/receipt.js';
import {
  agencyAssetContentUrl,
  buildAgencyAssetStorageKey,
  readAgencyAssetFile,
  removeAgencyAssetFile,
  writeAgencyAssetFile,
} from './assetStorage.js';

/**
 * Brand asset ingestion (Agency Workspace A3).
 *
 * The client's declared MIME type and the file's magic bytes must agree; the
 * extension is chosen from the sniffed type, never from the uploaded filename.
 * Size limits and font-license metadata are enforced here so every route gets
 * the same guarantees.
 */

export const AGENCY_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const AGENCY_FONT_MIME_TYPES = [
  'font/woff',
  'font/woff2',
  'font/ttf',
  'font/otf',
] as const;

export type AgencyAssetMime =
  | (typeof AGENCY_IMAGE_MIME_TYPES)[number]
  | (typeof AGENCY_FONT_MIME_TYPES)[number];

const EXTENSION_FOR_MIME: Record<AgencyAssetMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'font/woff': 'woff',
  'font/woff2': 'woff2',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
};

export const AGENCY_IMAGE_MAX_MB = 2;
export const AGENCY_FONT_MAX_MB = 5;
export const AGENCY_IMAGE_MAX_BYTES = AGENCY_IMAGE_MAX_MB * 1024 * 1024;
export const AGENCY_FONT_MAX_BYTES = AGENCY_FONT_MAX_MB * 1024 * 1024;

const IMAGE_MIMES = new Set<string>(AGENCY_IMAGE_MIME_TYPES);
const FONT_MIMES = new Set<string>(AGENCY_FONT_MIME_TYPES);

export function isAgencyAssetKind(value: unknown): value is AgencyAssetKind {
  return (AGENCY_ASSET_KINDS as readonly string[]).includes(String(value ?? ''));
}

/** Canonicalises common browser/OS aliases before the allow-list check. */
export function normalizeAgencyAssetMime(mime: unknown): string {
  const value = String(mime ?? '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  if (value === 'image/jpg' || value === 'image/pjpeg') return 'image/jpeg';
  if (value === 'application/font-woff' || value === 'application/x-font-woff') {
    return 'font/woff';
  }
  if (value === 'application/font-woff2' || value === 'application/x-font-woff2') {
    return 'font/woff2';
  }
  if (value === 'application/x-font-ttf' || value === 'application/x-font-truetype') {
    return 'font/ttf';
  }
  if (value === 'font/truetype') return 'font/ttf';
  if (
    value === 'application/vnd.ms-opentype' ||
    value === 'application/x-font-opentype' ||
    value === 'font/opentype'
  ) {
    return 'font/otf';
  }
  return value;
}

/**
 * Sniffs the bytes for every format A3 accepts. `sniffMime` already covers the
 * image formats; fonts are checked by their OpenType/WOFF signatures.
 */
export function sniffAgencyAssetMime(
  buffer: Buffer | Uint8Array | null | undefined
): AgencyAssetMime | null {
  const image = sniffMime(buffer);
  if (image === 'image/jpeg' || image === 'image/png' || image === 'image/webp') {
    return image;
  }

  const bytes =
    buffer instanceof Uint8Array
      ? buffer
      : Buffer.from((buffer ?? new Uint8Array()) as ArrayBuffer);
  const at = (index: number): number => bytes[index] ?? -1;

  // WOFF: "wOFF"; WOFF2: "wOF2"
  if (at(0) === 0x77 && at(1) === 0x4f && at(2) === 0x46 && at(3) === 0x46) {
    return 'font/woff';
  }
  if (at(0) === 0x77 && at(1) === 0x4f && at(2) === 0x46 && at(3) === 0x32) {
    return 'font/woff2';
  }
  // OpenType: "OTTO"
  if (at(0) === 0x4f && at(1) === 0x54 && at(2) === 0x54 && at(3) === 0x4f) {
    return 'font/otf';
  }
  // TrueType: 00 01 00 00, "true", or a TrueType collection "ttcf"
  if (
    (at(0) === 0x00 && at(1) === 0x01 && at(2) === 0x00 && at(3) === 0x00) ||
    (at(0) === 0x74 && at(1) === 0x72 && at(2) === 0x75 && at(3) === 0x65) ||
    (at(0) === 0x74 && at(1) === 0x74 && at(2) === 0x63 && at(3) === 0x66)
  ) {
    return 'font/ttf';
  }

  return null;
}

export function extensionForAgencyAssetMime(mime: unknown): string | null {
  return EXTENSION_FOR_MIME[normalizeAgencyAssetMime(mime) as AgencyAssetMime] ?? null;
}

export function assertAgencyAssetSize(kind: AgencyAssetKind, bytes: number): void {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    throw new AppError('That file is empty.', 400);
  }
  const isFont = kind === 'font';
  const max = isFont ? AGENCY_FONT_MAX_BYTES : AGENCY_IMAGE_MAX_BYTES;
  if (bytes > max) {
    throw new AppError(
      isFont
        ? `Fonts must be smaller than ${AGENCY_FONT_MAX_MB} MB.`
        : `Images must be smaller than ${AGENCY_IMAGE_MAX_MB} MB.`,
      413
    );
  }
}

/**
 * Verifies the declared type AND the actual bytes. Returns the canonical MIME
 * that is stored in Mongo. A renamed text file fails here even when its
 * extension/declared MIME says PNG.
 */
export function assertAgencyAssetBytes(
  kind: AgencyAssetKind,
  declaredMime: unknown,
  buffer: Buffer
): AgencyAssetMime {
  assertAgencyAssetSize(kind, buffer.byteLength);
  const declared = normalizeAgencyAssetMime(declaredMime);
  const sniffed = sniffAgencyAssetMime(buffer);

  const isFont = kind === 'font';
  if (isFont) {
    if (declared !== 'application/octet-stream' && !FONT_MIMES.has(declared)) {
      throw new AppError('Choose a WOFF, WOFF2, TTF or OTF font file.', 400);
    }
    if (!sniffed || !FONT_MIMES.has(sniffed)) {
      throw new AppError('That file does not look like a supported font.', 400);
    }
    if (declared !== 'application/octet-stream' && declared !== sniffed) {
      throw new AppError(
        'That font file does not match the type it claims to be. Choose a WOFF, WOFF2, TTF or OTF font.',
        400
      );
    }
    return sniffed;
  }

  if (!IMAGE_MIMES.has(declared)) {
    throw new AppError('Choose a JPEG, PNG or WebP image.', 400);
  }
  if (!sniffed || sniffed !== declared) {
    throw new AppError(
      'That file does not look like the image type it claims to be. Choose a JPEG, PNG or WebP image.',
      400
    );
  }
  return sniffed;
}

export interface AgencyAssetProjection {
  _id: string;
  kind: AgencyAssetKind;
  mime: string;
  bytes: number;
  originalName?: string;
  fontFamily?: string;
  licenseNote?: string;
  createdAt: Date;
  url: string;
}

/** Never exposes `storageKey`: callers only get the authenticated content URL. */
export function projectAgencyAsset(asset: IAgencyAsset | any): AgencyAssetProjection {
  return {
    _id: String(asset._id),
    kind: asset.kind,
    mime: asset.mime,
    bytes: asset.bytes,
    originalName: asset.originalName ?? undefined,
    fontFamily: asset.fontFamily ?? undefined,
    licenseNote: asset.licenseNote ?? undefined,
    createdAt: asset.createdAt,
    url: agencyAssetContentUrl(asset.agencyId, asset._id),
  };
}

export async function listAgencyAssets(agencyId: string): Promise<AgencyAssetProjection[]> {
  const assets = await AgencyAsset.find({ agencyId })
    .sort({ createdAt: -1 })
    .limit(100);
  return assets.map(projectAgencyAsset);
}

export async function getAgencyAsset(
  agencyId: string,
  assetId: string
): Promise<IAgencyAsset> {
  if (!Types.ObjectId.isValid(assetId)) {
    throw new AppError('Asset not found', 404);
  }
  const asset = await AgencyAsset.findOne({ _id: assetId, agencyId });
  if (!asset) throw new AppError('Asset not found', 404);
  return asset;
}

export interface UploadAgencyAssetInput {
  agencyId: string;
  userId: string;
  kind: AgencyAssetKind;
  buffer: Buffer;
  declaredMime: unknown;
  originalName?: string;
  fontFamily?: string;
  licenseNote?: string;
}

/**
 * Writes the validated bytes, then the metadata row. Logo/mascot uploads also
 * become the active brand URL, so the settings page gets one predictable
 * replace action. A DB failure removes the orphaned file.
 */
export async function uploadAgencyAsset(input: UploadAgencyAssetInput) {
  if (!isAgencyAssetKind(input.kind)) {
    throw new AppError('Choose a valid asset type.', 400);
  }

  const fontFamily = String(input.fontFamily ?? '').trim();
  const licenseNote = String(input.licenseNote ?? '').trim();
  if (input.kind === 'font') {
    if (!fontFamily) {
      throw new AppError('Give the font a family name.', 400);
    }
    if (!licenseNote) {
      throw new AppError(
        'Confirm the font licence in a note before uploading it.',
        400
      );
    }
  }

  const mime = assertAgencyAssetBytes(input.kind, input.declaredMime, input.buffer);
  const extension = extensionForAgencyAssetMime(mime);
  if (!extension) throw new AppError('That asset type is not supported.', 400);

  await assertStorageQuota(input.agencyId, input.buffer.byteLength);

  const assetId = new Types.ObjectId();
  const storageKey = buildAgencyAssetStorageKey(input.agencyId, assetId, extension);
  await writeAgencyAssetFile(storageKey, input.buffer);

  let asset: IAgencyAsset | null = null;
  try {
    asset = await AgencyAsset.create({
      _id: assetId,
      agencyId: input.agencyId,
      kind: input.kind,
      storageKey,
      mime,
      bytes: input.buffer.byteLength,
      originalName: String(input.originalName ?? '')
        .replace(/[\u0000-\u001f]/g, '')
        .slice(0, 255) || undefined,
      fontFamily: input.kind === 'font' ? fontFamily : undefined,
      licenseNote: input.kind === 'font' ? licenseNote : undefined,
      createdBy: input.userId,
    });

    let agency = null;
    if (input.kind === 'logo' || input.kind === 'mascot') {
      agency = await Agency.findByIdAndUpdate(
        input.agencyId,
        {
          $set: {
            [`branding.${input.kind}Url`]: agencyAssetContentUrl(
              input.agencyId,
              asset._id
            ),
          },
        },
        { new: true, runValidators: true }
      );
      if (!agency) throw new AppError('Agency not found', 404);
    }

    return { asset: projectAgencyAsset(asset), agency };
  } catch (error) {
    if (asset?._id) {
      await AgencyAsset.deleteOne({ _id: asset._id }).catch(() => undefined);
    }
    await removeAgencyAssetFile(storageKey).catch(() => undefined);
    throw error;
  }
}

/**
 * Deletes the row and file, and clears the active logo/mascot pointer when it
 * referred to this asset. A5/A6 template previews snapshot their assets; A3
 * only has live brand pointers, so there is nothing else to preserve.
 */
export async function deleteAgencyAsset(agencyId: string, assetId: string) {
  const asset = await getAgencyAsset(agencyId, assetId);

  await AgencyAsset.deleteOne({ _id: asset._id, agencyId });
  await removeAgencyAssetFile(asset.storageKey).catch((error) => {
    console.warn('Could not remove agency asset file:', error);
  });

  const url = agencyAssetContentUrl(agencyId, asset._id);
  const unset: Record<string, 1> = {};
  const agency = await Agency.findById(agencyId);
  if (agency?.branding?.logoUrl === url) unset['branding.logoUrl'] = 1;
  if (agency?.branding?.mascotUrl === url) unset['branding.mascotUrl'] = 1;
  // A deleted font must not stay referenced by the typography settings.
  if (asset.kind === 'font' && asset.fontFamily) {
    if (agency?.branding?.fontHeading === asset.fontFamily) {
      unset['branding.fontHeading'] = 1;
    }
    if (agency?.branding?.fontBody === asset.fontFamily) {
      unset['branding.fontBody'] = 1;
    }
  }

  const updatedAgency =
    Object.keys(unset).length > 0
      ? await Agency.findByIdAndUpdate(
          agencyId,
          { $unset: unset },
          { new: true, runValidators: true }
        )
      : agency;

  return { asset: projectAgencyAsset(asset), agency: updatedAgency };
}

export async function readAgencyAssetContent(agencyId: string, assetId: string) {
  const asset = await getAgencyAsset(agencyId, assetId);
  const buffer = await readAgencyAssetFile(asset.storageKey);
  return { asset, buffer };
}
