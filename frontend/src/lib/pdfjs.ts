import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/**
 * One place that configures the pdf.js worker. Vite fingerprints the worker
 * asset, so the CSP can stay `worker-src 'self' blob:` without a CDN.
 */
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy, PDFPageProxy };

export async function loadPdfDocument(
  source: Blob | Uint8Array
): Promise<PDFDocumentProxy> {
  const data =
    source instanceof Blob ? new Uint8Array(await source.arrayBuffer()) : source;
  return pdfjs.getDocument({ data }).promise;
}

/** Base64 from the API (template/export previews) to pdf.js bytes. */
export function base64PdfToBytes(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Page dimensions in PDF points (top-left origin, unrotated). */
export function pdfPageSize(page: PDFPageProxy): {
  width: number;
  height: number;
} {
  const viewport = page.getViewport({ scale: 1 });
  return { width: viewport.width, height: viewport.height };
}
