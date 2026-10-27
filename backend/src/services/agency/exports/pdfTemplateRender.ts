import crypto from 'node:crypto';
import fontkit from '@pdf-lib/fontkit';
import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFPage,
  PDFRef,
  StandardFonts,
  clip,
  closePath,
  degrees,
  endPath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFFont,
  type PDFImage,
} from 'pdf-lib';
import type { AgencyTemplateAudience } from '../../../models/AgencyTemplate.js';
import { AppError } from '../../../utils/AppError.js';
import type { ExportDocument } from './document.js';
import { buildAgencyTemplateView } from './customTemplate.js';
import {
  AGENCY_PDF_MAX_BYTES,
  AGENCY_PDF_MAX_PAGES,
  AGENCY_PDF_SLOT_TOKENS,
  resolveAgencyPdfSlotImage,
  resolveAgencyPdfSlotText,
  slotMapTokens,
  validateAgencyPdfSlotMap,
  type AgencyPdfPageSize,
  type AgencyPdfSlot,
  type AgencyPdfSlotMap,
} from './pdfTemplateContract.js';
import type {
  ResolvedTemplateAssets,
  ResolvedTemplateFont,
} from './templateAssets.js';

/**
 * Uploaded-PDF template engine (Agency Workspace A6f).
 *
 * The agency's design is a sanitised vector PDF; the merged document is
 * produced with pdf-lib alone, so exports need neither Chromium nor a remote
 * renderer. Uploads are rebuilt into a fresh document (no catalog actions,
 * scripts, attachments or annotations survive) and pages are never rasterised,
 * so print quality is preserved.
 */

export const AGENCY_PDF_PAGE_TOLERANCE = 0.5;

/** Stand-in for glyphs the built-in PDF fonts cannot encode (WinAnsi). */
const WIN_ANSI_REPLACEMENTS: Record<string, string> = {
  '₹': 'Rs. ',
  '→': '->',
  '←': '<-',
  '↑': '^',
  '↓': 'v',
  '✓': 'v',
  '✔': 'v',
  '✕': 'x',
  '✗': 'x',
  '★': '*',
  '☆': '*',
  '≥': '>=',
  '≤': '<=',
  '\u00A0': ' ',
  '\u200B': '',
};

const IMAGE_DATA_URL =
  /^data:(image\/(?:png|jpe?g|webp));base64,([a-z0-9+/=]+)$/i;
const FONT_DATA_URL = /^data:font\/(?:woff2?|ttf|otf);base64,([a-z0-9+/=]+)$/i;

function hexColour(value: string | undefined, fallback = '#0F172A') {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value ?? ''));
  const hex = match ? match[1] : fallback.slice(1);
  return rgb(
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255
  );
}

interface SanitizedPdfTemplate {
  bytes: Buffer;
  pageCount: number;
  pageSizes: AgencyPdfPageSize[];
  checksum: string;
}

/**
 * Rebuilds an uploaded PDF as a passive background document. Every object the
 * renderer keeps comes from this copy: the fresh catalog has no OpenAction,
 * JavaScript name tree, AcroForm or attachments, and page-level annotations,
 * additional actions and XMP metadata are removed.
 */
export async function sanitizeAgencyPdfTemplate(
  input: Buffer
): Promise<SanitizedPdfTemplate> {
  if (!Buffer.isBuffer(input) || input.byteLength === 0) {
    throw new AppError('Choose a PDF file to upload.', 400);
  }
  if (input.byteLength > AGENCY_PDF_MAX_BYTES) {
    throw new AppError(
      `PDF designs must be smaller than ${Math.round(AGENCY_PDF_MAX_BYTES / (1024 * 1024))} MB.`,
      413
    );
  }
  if (input.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new AppError('That file is not a PDF.', 400);
  }

  let source: PDFDocument;
  try {
    source = await PDFDocument.load(input, { updateMetadata: false });
  } catch (error: any) {
    if (String(error?.message ?? '').toLowerCase().includes('encrypt')) {
      throw new AppError(
        'Password-protected PDFs are not supported. Remove the password and upload again.',
        400
      );
    }
    throw new AppError(
      'That PDF could not be read. Re-export it and upload again.',
      400
    );
  }

  const pageCount = source.getPageCount();
  if (pageCount === 0) {
    throw new AppError('That PDF has no pages.', 400);
  }
  if (pageCount > AGENCY_PDF_MAX_PAGES) {
    throw new AppError(
      `PDF designs can have at most ${AGENCY_PDF_MAX_PAGES} pages.`,
      400
    );
  }

  const pageSizes: AgencyPdfPageSize[] = [];
  for (const page of source.getPages()) {
    if (page.getRotation().angle % 360 !== 0) {
      throw new AppError(
        'Rotated PDF pages are not supported. Rotate the page in your design tool, save, and upload again.',
        400
      );
    }
    const media = page.getMediaBox();
    const crop = page.getCropBox();
    if (
      Math.abs(media.x - crop.x) > AGENCY_PDF_PAGE_TOLERANCE ||
      Math.abs(media.y - crop.y) > AGENCY_PDF_PAGE_TOLERANCE ||
      Math.abs(media.width - crop.width) > AGENCY_PDF_PAGE_TOLERANCE ||
      Math.abs(media.height - crop.height) > AGENCY_PDF_PAGE_TOLERANCE
    ) {
      throw new AppError(
        'That PDF uses a cropped page box. Export the design at its final page size and upload again.',
        400
      );
    }
    pageSizes.push({ width: media.width, height: media.height });
  }

  const clean = await PDFDocument.create();
  const copied = await clean.copyPages(
    source,
    source.getPageIndices()
  );
  for (const page of copied) {
    page.node.delete(PDFName.of('Annots'));
    page.node.delete(PDFName.of('AA'));
    page.node.delete(PDFName.of('Metadata'));
    clean.addPage(page);
  }

  const bytes = Buffer.from(await clean.save());
  const checksum = crypto.createHash('sha256').update(bytes).digest('hex');

  return { bytes, pageCount: clean.getPageCount(), pageSizes, checksum };
}

/** Reads page geometry from a stored (already sanitised) background PDF. */
export async function readAgencyPdfPageSizes(
  buffer: Buffer
): Promise<AgencyPdfPageSize[]> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(buffer, { updateMetadata: false });
  } catch {
    throw new AppError(
      'The stored PDF template could not be read. Upload it again.',
      409
    );
  }
  return doc.getPages().map((page) => {
    const size = page.getSize();
    return { width: size.width, height: size.height };
  });
}

interface BrandFont {
  font: PDFFont;
  standard: boolean;
}

async function embedBrandFont(
  doc: PDFDocument,
  asset: ResolvedTemplateFont | null,
  fallback: StandardFonts
): Promise<BrandFont> {
  if (asset) {
    const match = FONT_DATA_URL.exec(String(asset.dataUrl ?? '').trim());
    if (match) {
      try {
        const bytes = Buffer.from(match[1], 'base64');
        // Subsetting in @pdf-lib/fontkit corrupts WOFF sources, so the whole
        // face is embedded. Brand fonts are bounded to a few hundred KB.
        const font = await doc.embedFont(bytes, { subset: false });
        return { font, standard: false };
      } catch {
        /* fall through to the built-in face */
      }
    }
  }
  return { font: await doc.embedFont(fallback), standard: true };
}

function sanitizeForStandardFont(text: string, font: PDFFont): string {
  const cache = new Map<string, string>();
  let result = '';
  for (const character of text) {
    const cached = cache.get(character);
    if (cached !== undefined) {
      result += cached;
      continue;
    }
    let replacement = '';
    try {
      font.widthOfTextAtSize(character, 10);
      replacement = character;
    } catch {
      replacement = WIN_ANSI_REPLACEMENTS[character] ?? '';
    }
    cache.set(character, replacement);
    result += replacement;
  }
  return result;
}

function prepareText(value: string, font: BrandFont): string {
  return font.standard
    ? sanitizeForStandardFont(value, font.font)
    : value;
}

function wrapText(
  input: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  for (const paragraph of input.replace(/\r\n?/g, '\n').split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
        continue;
      }
      let chunk = '';
      for (const character of word) {
        if (font.widthOfTextAtSize(chunk + character, size) <= maxWidth) {
          chunk += character;
        } else {
          if (chunk) lines.push(chunk);
          chunk = character;
        }
      }
      current = chunk;
    }
    if (current) lines.push(current);
  }
  return lines;
}

function ellipsize(
  line: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string {
  let text = line;
  const suffix = '…';
  while (
    text.length > 0 &&
    font.widthOfTextAtSize(text + suffix, size) > maxWidth
  ) {
    text = text.slice(0, -1).trimEnd();
  }
  return text ? `${text}${suffix}` : '';
}

function layoutSlotText(
  raw: string,
  slot: AgencyPdfSlot,
  font: PDFFont
): { lines: string[]; size: number } {
  const maxWidth = Math.max(1, slot.w);
  const size = slot.size ?? 11;
  const minSize = slot.minSize ?? Math.max(6, size * 0.6);
  const lineHeight = slot.lineHeight ?? 1.25;
  const maxLines = slot.maxLines ?? 10;

  for (let candidate = size; candidate >= minSize; candidate -= 0.5) {
    const heightLines = Math.max(
      1,
      Math.floor(slot.h / (candidate * lineHeight))
    );
    const lines = wrapText(raw, font, candidate, maxWidth);
    if (lines.length <= Math.min(maxLines, heightLines)) {
      return { lines, size: Math.round(candidate * 100) / 100 };
    }
  }

  const heightLines = Math.max(
    1,
    Math.floor(slot.h / (minSize * lineHeight))
  );
  const allowed = Math.max(1, Math.min(maxLines, heightLines));
  const lines = wrapText(raw, font, minSize, maxWidth);
  if (lines.length > allowed) {
    lines.length = allowed;
    lines[allowed - 1] = ellipsize(
      lines[allowed - 1] ?? '',
      font,
      minSize,
      maxWidth
    );
  }
  return { lines, size: minSize };
}

async function embedDataUrlImage(
  doc: PDFDocument,
  dataUrl: string,
  cache: Map<string, PDFImage>
): Promise<PDFImage | null> {
  const match = IMAGE_DATA_URL.exec(String(dataUrl ?? '').trim());
  if (!match) return null;
  const cached = cache.get(dataUrl);
  if (cached) return cached;

  const mime = match[1].toLowerCase();
  const bytes = Buffer.from(match[2], 'base64');
  if (mime === 'image/webp') {
    throw new AppError(
      'This template uses a WebP image, which PDF exports cannot embed. Choose a PNG or JPEG version of that image.',
      409
    );
  }
  const image =
    mime === 'image/png'
      ? await doc.embedPng(bytes)
      : await doc.embedJpg(bytes);
  cache.set(dataUrl, image);
  return image;
}

function drawSlotImage(
  page: PDFPage,
  pageHeight: number,
  slot: AgencyPdfSlot,
  image: PDFImage
): void {
  const bottom = pageHeight - slot.y - slot.h;
  const fit = slot.fit ?? 'cover';
  const scale =
    fit === 'contain'
      ? Math.min(slot.w / image.width, slot.h / image.height)
      : Math.max(slot.w / image.width, slot.h / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = slot.x + (slot.w - width) / 2;
  const y = bottom + (slot.h - height) / 2;

  page.pushOperators(
    pushGraphicsState(),
    moveTo(slot.x, bottom),
    lineTo(slot.x + slot.w, bottom),
    lineTo(slot.x + slot.w, bottom + slot.h),
    lineTo(slot.x, bottom + slot.h),
    closePath(),
    clip(),
    endPath()
  );
  page.drawImage(image, { x, y, width, height });
  page.pushOperators(popGraphicsState());
}

function drawSlotText(
  page: PDFPage,
  pageHeight: number,
  slot: AgencyPdfSlot,
  value: string,
  font: PDFFont,
  standard: boolean
): void {
  const raw = value.trim();
  if (!raw) return;
  const text = standard ? sanitizeForStandardFont(raw, font) : raw;
  if (!text.trim()) return;

  const { lines, size } = layoutSlotText(text, slot, font);
  const lineHeight = slot.lineHeight ?? 1.25;
  const align = slot.align ?? 'left';
  const colour = hexColour(slot.color);

  const firstBaseline = pageHeight - slot.y - size * 0.85;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    const width = font.widthOfTextAtSize(line, size);
    let x = slot.x;
    if (align === 'center') x += (slot.w - width) / 2;
    else if (align === 'right') x += slot.w - width;
    page.drawText(line, {
      x,
      y: firstBaseline - index * size * lineHeight,
      size,
      font,
      color: colour,
    });
  }
}

/**
 * pdf-lib copies a page's indirect objects once per source page, so duplicate
 * copies (the repeatable day page) share one Contents array. Replacing it with
 * a new array over the same streams keeps resources shared but makes each
 * output page's overlay independent.
 */
function detachPageContents(page: PDFPage, doc: PDFDocument): void {
  const raw = page.node.get(PDFName.of('Contents'));
  const refs: PDFRef[] = [];
  const collect = (value: unknown): void => {
    if (value instanceof PDFArray) {
      for (const entry of value.asArray()) {
        if (entry instanceof PDFRef) refs.push(entry);
      }
    } else if (value instanceof PDFRef) {
      const resolved = doc.context.lookup(value);
      if (resolved instanceof PDFArray) {
        for (const entry of resolved.asArray()) {
          if (entry instanceof PDFRef) refs.push(entry);
        }
      } else {
        refs.push(value);
      }
    }
  };
  collect(raw);
  if (refs.length > 0) {
    page.node.set(PDFName.of('Contents'), doc.context.obj(refs));
  }
}

function watermarkText(value: unknown): string {
  const text = String(value ?? '').trim().toUpperCase();
  return /^[A-Z ]{3,20}$/.test(text) ? text : '';
}

export interface RenderAgencyPdfTemplateInput {
  doc: ExportDocument;
  template: { name: string; audience: AgencyTemplateAudience; version?: number };
  background: Buffer;
  slotMap: AgencyPdfSlotMap;
  assets: ResolvedTemplateAssets;
}

export interface RenderedAgencyPdfTemplate {
  pdf: Buffer;
  pageCount: number;
  tokens: string[];
}

/**
 * Merges export data into the sanitised background and returns the final PDF.
 * The slot map is re-validated here so a tampered version cannot smuggle
 * internal-only tokens into a client document.
 */
export async function renderAgencyPdfTemplate(
  input: RenderAgencyPdfTemplateInput
): Promise<RenderedAgencyPdfTemplate> {
  let background: PDFDocument;
  try {
    background = await PDFDocument.load(input.background, {
      updateMetadata: false,
    });
  } catch {
    throw new AppError(
      'The stored PDF template could not be read. Upload it again.',
      409
    );
  }

  const pageSizes: AgencyPdfPageSize[] = background
    .getPages()
    .map((page) => {
      const size = page.getSize();
      return { width: size.width, height: size.height };
    });
  const slotMap = validateAgencyPdfSlotMap(input.slotMap, {
    audience: input.template.audience,
    pageSizes,
  });

  const view = buildAgencyTemplateView({
    doc: input.doc,
    templateName: input.template.name,
    audience: input.template.audience,
    assets: input.assets,
  }) as Record<string, any>;

  const days: any[] = Array.isArray(view.days) ? view.days : [];

  const plan: Array<{ sourceIndex: number; day: any | null }> = [];
  for (let index = 0; index < background.getPageCount(); index += 1) {
    const mapped = slotMap.pages.find((page) => page.page === index + 1);
    if (mapped?.repeat === 'days' && days.length > 0) {
      for (const day of days) plan.push({ sourceIndex: index, day });
    } else {
      plan.push({ sourceIndex: index, day: null });
    }
  }

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const copied = await doc.copyPages(
    background,
    plan.map((entry) => entry.sourceIndex)
  );
  for (const page of copied) {
    detachPageContents(page, doc);
    doc.addPage(page);
  }

  const body = await embedBrandFont(
    doc,
    input.assets.bodyFont,
    StandardFonts.Helvetica
  );
  const heading = await embedBrandFont(
    doc,
    input.assets.headingFont,
    StandardFonts.HelveticaBold
  );

  const imageCache = new Map<string, PDFImage>();
  const pageSizeByNumber = new Map(
    plan.map((entry, index) => [index, pageSizes[entry.sourceIndex]])
  );

  for (let index = 0; index < plan.length; index += 1) {
    const entry = plan[index];
    const page = doc.getPage(index);
    const size = pageSizeByNumber.get(index);
    if (!size) continue;
    const mapped = slotMap.pages.find(
      (candidate) => candidate.page === entry.sourceIndex + 1
    );
    if (!mapped) continue;

    for (const slot of mapped.slots) {
      if (slot.kind !== 'image') continue;
      const dataUrl = resolveAgencyPdfSlotImage(
        input.assets,
        slot.token,
        entry.day
      );
      if (!dataUrl) continue;
      const image = await embedDataUrlImage(doc, dataUrl, imageCache);
      if (image) drawSlotImage(page, size.height, slot, image);
    }

    for (const slot of mapped.slots) {
      if (slot.kind !== 'text') continue;
      const value = resolveAgencyPdfSlotText(
        view,
        slot.token,
        entry.day,
        input.template.audience
      );
      if (!value) continue;
      const chosen = slot.font === 'heading' ? heading : body;
      drawSlotText(
        page,
        size.height,
        slot,
        value,
        chosen.font,
        chosen.standard
      );
    }
  }

  const watermark = watermarkText(view.watermark);
  if (watermark) {
    for (let index = 0; index < plan.length; index += 1) {
      const size = pageSizeByNumber.get(index);
      if (!size) continue;
      const page = doc.getPage(index);
      const fontSize = Math.min(size.width, size.height) * 0.16;
      const text = prepareText(watermark, heading);
      const width = heading.font.widthOfTextAtSize(text, fontSize);
      page.drawText(text, {
        x: (size.width - width) / 2,
        y: size.height * 0.42,
        size: fontSize,
        font: heading.font,
        color: rgb(0.39, 0.45, 0.55),
        opacity: 0.22,
        rotate: degrees(-30),
      });
    }
  }

  const title = String(input.doc.trip?.title ?? '').trim();
  if (title) doc.setTitle(title);
  doc.setProducer('TravelAI');

  const pdf = Buffer.from(await doc.save());
  return {
    pdf,
    pageCount: doc.getPageCount(),
    tokens: slotMapTokens(slotMap),
  };
}

/** Tokens a layout may bind, for upload-time validation and the mapper UI. */
export function agencyPdfSlotTokenCatalog(audience: AgencyTemplateAudience) {
  return Object.entries(AGENCY_PDF_SLOT_TOKENS)
    .filter(
      ([, definition]) =>
        !definition.internalOnly || audience === 'internal'
    )
    .map(([token, definition]) => ({
      token,
      label: definition.label,
      kind: definition.kind,
      day: Boolean(definition.day),
    }));
}
