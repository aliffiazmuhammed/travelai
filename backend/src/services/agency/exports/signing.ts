import crypto from 'crypto';
import { env } from '../../../config/env.js';

/**
 * Short-lived signed download URLs (Agency Workspace A5).
 *
 * The signature is bound to the tenant and export id, so a valid token for one
 * agency can never download another tenant's file. The download route still
 * requires an authenticated agency member; the signature is defence in depth
 * and gives the UI a URL that expires instead of a permanent object path.
 */

export const EXPORT_DOWNLOAD_TTL_MS = 10 * 60 * 1000;

function secret(explicit?: string): string {
  return explicit || process.env.AGENCY_EXPORT_SIGNING_SECRET || env.JWT_SECRET;
}

export function signExportDownload(input: {
  agencyId: string;
  exportId: string;
  expiresAt: number;
  secret?: string;
}): string {
  return crypto
    .createHmac('sha256', secret(input.secret))
    .update(`${input.agencyId}:${input.exportId}:${input.expiresAt}`)
    .digest('hex');
}

export function verifyExportDownload(input: {
  agencyId: string;
  exportId: string;
  expiresAt: number;
  signature: string;
  now?: number;
  secret?: string;
}): boolean {
  if (
    !Number.isInteger(input.expiresAt) ||
    input.expiresAt <= (input.now ?? Date.now())
  ) {
    return false;
  }
  if (!/^[a-f0-9]{64}$/i.test(input.signature)) return false;

  const expected = signExportDownload(input);
  const provided = Buffer.from(input.signature.toLowerCase(), 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (provided.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(provided, expectedBuffer);
}

export function exportDownloadPath(input: {
  agencyId: string;
  exportId: string;
  now?: number;
  secret?: string;
}): string {
  const expiresAt = (input.now ?? Date.now()) + EXPORT_DOWNLOAD_TTL_MS;
  const signature = signExportDownload({ ...input, expiresAt });
  return `/api/agency/${input.agencyId}/exports/${input.exportId}/download?expires=${expiresAt}&signature=${signature}`;
}
