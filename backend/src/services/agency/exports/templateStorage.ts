import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppError } from '../../../utils/AppError.js';

/**
 * Private storage for uploaded proposal templates (Agency Workspace A6).
 *
 * Sources live outside the public `/uploads` tree and are read only after the
 * tenant guard has authorised an admin. Keys are server-generated
 * `<agencyId>/<templateVersionId>.html`; a client never supplies a path.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function agencyTemplateRootDir(): string {
  const configured = process.env.AGENCY_TEMPLATE_DIR;
  return configured
    ? path.resolve(configured)
    : path.resolve(__dirname, '../../../../agency-templates');
}

function isHexId(value: unknown): boolean {
  return /^[a-f0-9]{24}$/i.test(String(value ?? ''));
}

const SOURCE_EXTENSIONS = new Set(['html']);
const ASSET_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'woff',
  'woff2',
  'ttf',
  'otf',
]);

export function buildAgencyTemplateStorageKey(
  agencyId: unknown,
  versionId: unknown
): string {
  if (!isHexId(agencyId) || !isHexId(versionId)) {
    throw new AppError('That template reference is not valid.', 400);
  }
  return `${String(agencyId)}/${String(versionId)}.html`;
}

/** Snapshot keys are version-scoped: `<agency>/<version>/<slot>.<ext>`. */
export function buildAgencyTemplateAssetStorageKey(
  agencyId: unknown,
  versionId: unknown,
  slot: unknown,
  extension: unknown
): string {
  if (!isHexId(agencyId) || !isHexId(versionId)) {
    throw new AppError('That template asset reference is not valid.', 400);
  }
  const name = String(slot ?? '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(name)) {
    throw new AppError('That template asset reference is not valid.', 400);
  }
  const ext = String(extension ?? '').trim().toLowerCase();
  if (!ASSET_EXTENSIONS.has(ext)) {
    throw new AppError('That template asset type is not supported.', 400);
  }
  return `${String(agencyId)}/${String(versionId)}/${name}.${ext}`;
}

function templateFilePath(
  storageKey: unknown,
  allowedExtensions: Set<string>
): string {
  const root = agencyTemplateRootDir();
  const key = String(storageKey ?? '').replace(/\\/g, '/');
  const extension = key.includes('.')
    ? key.slice(key.lastIndexOf('.') + 1).toLowerCase()
    : '';
  if (
    !key ||
    path.isAbsolute(key) ||
    key.startsWith('/') ||
    key.includes('..') ||
    !allowedExtensions.has(extension)
  ) {
    throw new AppError('That template reference is not valid.', 400);
  }
  const target = path.resolve(root, key);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new AppError('That template reference is not valid.', 400);
  }
  return target;
}

export function agencyTemplateFilePath(storageKey: unknown): string {
  return templateFilePath(storageKey, SOURCE_EXTENSIONS);
}

export function agencyTemplateAssetFilePath(storageKey: unknown): string {
  return templateFilePath(storageKey, ASSET_EXTENSIONS);
}

export async function writeAgencyTemplateFile(
  storageKey: string,
  source: string
): Promise<void> {
  const target = agencyTemplateFilePath(storageKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, source, { encoding: 'utf8', mode: 0o600 });
}

export async function readAgencyTemplateFile(
  storageKey: string
): Promise<string> {
  try {
    return await fs.readFile(agencyTemplateFilePath(storageKey), 'utf8');
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw new AppError('That template source is no longer available.', 404);
    }
    throw error;
  }
}

export async function removeAgencyTemplateFile(
  storageKey: string
): Promise<void> {
  try {
    await fs.unlink(agencyTemplateFilePath(storageKey));
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

export async function writeAgencyTemplateAssetFile(
  storageKey: string,
  buffer: Buffer
): Promise<void> {
  const target = agencyTemplateAssetFilePath(storageKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer, { mode: 0o600 });
}

export async function readAgencyTemplateAssetFile(
  storageKey: string
): Promise<Buffer> {
  try {
    return await fs.readFile(agencyTemplateAssetFilePath(storageKey));
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw new AppError(
        'A template asset snapshot is no longer available. Upload a new template version.',
        409
      );
    }
    throw error;
  }
}

export async function removeAgencyTemplateAssetFile(
  storageKey: string
): Promise<void> {
  try {
    await fs.unlink(agencyTemplateAssetFilePath(storageKey));
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

/** Best-effort cleanup for a version whose row was never committed. */
export async function removeAgencyTemplateVersionFiles(version: {
  storageKey?: string | null;
  assets?: Array<{ storageKey?: string | null }> | null;
}): Promise<void> {
  const tasks: Array<Promise<void>> = [];
  if (version.storageKey) {
    tasks.push(
      removeAgencyTemplateFile(version.storageKey).catch((error) => {
        console.warn('Could not remove agency template source:', error);
      })
    );
  }
  for (const asset of version.assets ?? []) {
    if (!asset?.storageKey) continue;
    tasks.push(
      removeAgencyTemplateAssetFile(asset.storageKey).catch((error) => {
        console.warn('Could not remove agency template asset:', error);
      })
    );
  }
  await Promise.all(tasks);
}
