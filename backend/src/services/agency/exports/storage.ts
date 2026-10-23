import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppError } from '../../../utils/AppError.js';

/**
 * Private storage for rendered proposal PDFs (Agency Workspace A5).
 *
 * Like brand assets, export bytes live outside the public `/uploads` tree and
 * are only read after the tenant guard plus a signed-URL check. Keys are
 * server-generated `<agencyId>/<exportId>.pdf`; a client never supplies a path.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function agencyExportRootDir(): string {
  const configured = process.env.AGENCY_EXPORT_DIR;
  return configured
    ? path.resolve(configured)
    : path.resolve(__dirname, '../../../../agency-exports');
}

function isHexId(value: unknown): boolean {
  return /^[a-f0-9]{24}$/i.test(String(value ?? ''));
}

export function buildAgencyExportStorageKey(
  agencyId: unknown,
  exportId: unknown
): string {
  if (!isHexId(agencyId) || !isHexId(exportId)) {
    throw new AppError('That export reference is not valid.', 400);
  }
  return `${String(agencyId)}/${String(exportId)}.pdf`;
}

export function agencyExportFilePath(storageKey: unknown): string {
  const root = agencyExportRootDir();
  const key = String(storageKey ?? '').replace(/\\/g, '/');
  if (!key || key.startsWith('/') || key.includes('..') || !key.endsWith('.pdf')) {
    throw new AppError('That export reference is not valid.', 400);
  }
  const target = path.resolve(root, key);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new AppError('That export reference is not valid.', 400);
  }
  return target;
}

export async function writeAgencyExportFile(
  storageKey: string,
  buffer: Buffer
): Promise<void> {
  const target = agencyExportFilePath(storageKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer, { mode: 0o600 });
}

export async function readAgencyExportFile(storageKey: string): Promise<Buffer> {
  try {
    return await fs.readFile(agencyExportFilePath(storageKey));
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw new AppError('That export file is no longer available.', 404);
    }
    throw error;
  }
}

export async function removeAgencyExportFile(storageKey: string): Promise<void> {
  try {
    await fs.unlink(agencyExportFilePath(storageKey));
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
