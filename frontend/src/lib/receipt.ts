/**
 * Receipt helpers (Milestone 5 — Budget & Financial, sub-milestone 5.5).
 *
 * The server is the source of truth for validation; these helpers exist so the
 * UI can reject an obviously bad file instantly (no upload round trip) and can
 * render already-stored receipts. Mirrors the rules in
 * `backend/src/services/finance/receipt.ts`.
 */

import { API_BASE_URL } from "@/config";

export const ALLOWED_RECEIPT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const DEFAULT_MAX_UPLOAD_MB = 5;

/** `accept` attribute for the receipt `<input type="file">`. */
export const RECEIPT_ACCEPT_ATTR = ALLOWED_RECEIPT_MIME_TYPES.join(",");

export const RECEIPT_HINT = "JPEG, PNG, WebP or PDF";

/** Configured maximum upload size in whole megabytes. */
export function maxUploadMb(): number {
  const configured = Number(import.meta.env.VITE_MAX_UPLOAD_MB);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_UPLOAD_MB;
}

export function maxUploadBytes(): number {
  return maxUploadMb() * 1024 * 1024;
}

/** Human-friendly file size (e.g. `820 KB`, `1.4 MB`). */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Client-side pre-flight validation. Returns a user-facing error message, or
 * `null` when the file looks acceptable.
 */
export function validateReceiptFile(file: File | null | undefined): string | null {
  if (!file) return "Please choose a receipt file to upload.";

  if (!(ALLOWED_RECEIPT_MIME_TYPES as readonly string[]).includes(file.type)) {
    return `Receipts must be a ${RECEIPT_HINT} file.`;
  }

  if (file.size <= 0) return "That file appears to be empty.";

  if (file.size > maxUploadBytes()) {
    return `Receipts must be smaller than ${maxUploadMb()} MB.`;
  }

  return null;
}

/** True when a stored receipt URL points at a PDF. */
export function isPdfReceipt(url: string | undefined | null): boolean {
  return /\.pdf(\?|#|$)/i.test(String(url ?? ""));
}

/**
 * Resolves a stored (relative) receipt URL against the API base so it works in
 * both the Vite dev server and the deployed single-origin build.
 */
export function receiptUrl(url: string | undefined | null): string {
  const value = String(url ?? "");
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${API_BASE_URL}${value.startsWith("/") ? "" : "/"}${value}`;
}

/** Short label for a stored receipt (e.g. `receipt-….pdf`). */
export function receiptDisplayName(url: string | undefined | null): string {
  const value = String(url ?? "");
  if (!value) return "Receipt";
  const base = value.split("?")[0].split("/").pop() || "Receipt";
  return isPdfReceipt(base) ? "PDF receipt" : "Photo receipt";
}
