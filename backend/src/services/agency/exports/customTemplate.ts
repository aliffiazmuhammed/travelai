import type { AgencyTemplateAudience } from '../../../models/AgencyTemplate.js';
import { AppError } from '../../../utils/AppError.js';
import type { ExportDocument } from './document.js';
import { formatExportDate, formatExportMoney } from './format.js';
import { escapeHtml, safeFontFamily, safeHexColour } from './render.js';
import type { ResolvedTemplateAssets, ResolvedTemplateFont } from './templateAssets.js';
import {
  countTemplatePages,
  renderAgencyTemplateFragment,
  validateAgencyTemplateSource,
} from './templateValidation.js';

/**
 * Custom HTML template renderer (Agency Workspace A6).
 *
 * The validated source is rendered with a closed, client-safe view assembled
 * from the A5 ExportDocument and the version's asset snapshots. The wrapper
 * owns the print geometry, embedded fonts, brand variables, CSP and draft
 * watermark; the uploaded template owns the page layout in between.
 */

export interface CustomTemplateDescriptor {
  name: string;
  audience: AgencyTemplateAudience;
  version: number;
}

export interface RenderedCustomTemplate {
  html: string;
  pageCount: number;
}

const DEFAULT_PRIMARY = '#0F766E';
const DEFAULT_ACCENT = '#F59E0B';
const FALLBACK_FONT_STACK = `'Segoe UI', Arial, sans-serif`;
const IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=]+$/i;
const FONT_DATA_URL = /^data:font\/(?:woff2?|ttf|otf);base64,[a-z0-9+/=]+$/i;
const FONT_MIMES = new Set(['font/woff', 'font/woff2', 'font/ttf', 'font/otf']);

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function safeImage(value: unknown): string {
  const source = String(value ?? '').trim();
  return IMAGE_DATA_URL.test(source) ? source : '';
}

function safeFontData(value: unknown): string | null {
  const source = String(value ?? '').trim();
  return FONT_DATA_URL.test(source) ? source : null;
}

function formatGeneratedAt(value: unknown): string {
  const date = new Date(String(value ?? ''));
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(date);
}

function stayPrice(value: unknown, currency: string): string {
  const raw = text(value).trim();
  if (!raw) return '';
  return /^\d+(?:\.\d{1,2})?$/.test(raw)
    ? formatExportMoney(Number(raw), currency)
    : raw;
}

function watermarkFor(doc: ExportDocument, internal: boolean): string {
  if (!doc.quote) return internal ? '' : 'DRAFT';
  return doc.quote.status === 'draft'
    ? 'DRAFT'
    : doc.quote.status === 'expired'
      ? 'EXPIRED'
      : doc.quote.status === 'cancelled'
        ? 'CANCELLED'
        : '';
}

function statusLabelFor(
  doc: ExportDocument,
  templateName: string,
  internal: boolean
): string {
  if (internal) return `Internal · ${templateName}`;
  return doc.quote
    ? `${doc.quote.number} · ${doc.quote.status.toUpperCase()}`
    : 'Pricing on request';
}

/**
 * The complete Mustache view. Client views omit internal cost keys entirely so
 * a client projection is safe by construction, not by template convention.
 */
export function buildAgencyTemplateView(input: {
  doc: ExportDocument;
  templateName: string;
  audience: AgencyTemplateAudience;
  assets: ResolvedTemplateAssets;
}): Record<string, unknown> {
  const { doc, assets } = input;
  const internal = input.audience === 'internal';
  const quote = doc.quote;
  const currency = quote?.currency ?? 'INR';
  const headingFamily =
    safeFontFamily(assets.headingFont?.family) ??
    safeFontFamily(doc.agency.fontHeading) ??
    '';
  const bodyFamily =
    safeFontFamily(assets.bodyFont?.family) ??
    safeFontFamily(doc.agency.fontBody) ??
    '';
  const statusLabel = statusLabelFor(doc, input.templateName, internal);

  return {
    agency: {
      name: doc.agency.name,
      address: text(doc.agency.address),
      phone: text(doc.agency.phone),
      email: text(doc.agency.email),
      website: text(doc.agency.website),
      instagram: text(doc.contact.instagram),
      gstin: text(doc.agency.gstin),
      primaryColor: safeHexColour(doc.agency.primaryColor, DEFAULT_PRIMARY),
      accentColor: safeHexColour(doc.agency.accentColor, DEFAULT_ACCENT),
    },
    trip: {
      title: doc.trip.title,
      destination: doc.trip.destination,
      startDate: formatExportDate(doc.trip.startDate),
      endDate: formatExportDate(doc.trip.endDate),
      durationDays: doc.trip.durationDays,
      nights: doc.trip.nights,
      groupType: text(doc.trip.groupType),
      season: text(doc.trip.season),
    },
    client: doc.client
      ? {
          name: doc.client.name,
          email: text(doc.client.email),
          phone: text(doc.client.phone),
          adults: text(doc.client.adults),
          children: text(doc.client.children),
          rooms: text(doc.client.rooms),
        }
      : null,
    quote: quote
      ? {
          number: quote.number,
          version: quote.version,
          status: quote.status,
          statusLabel: `${quote.number} · ${quote.status.toUpperCase()}`,
          date: formatExportDate(quote.date),
          validUntil: formatExportDate(quote.validUntil),
          currency,
          total: quote.total,
          totalFormatted: formatExportMoney(quote.total, currency),
          perPerson: quote.perPerson,
          perPersonFormatted: formatExportMoney(quote.perPerson, currency),
          inclusions: quote.inclusions,
          exclusions: quote.exclusions,
          terms: quote.terms,
        }
      : null,
    days: doc.trip.days.map((day, index) => ({
      day: day.day,
      pageNumber: index + 1,
      date: formatExportDate(day.date),
      title: day.title,
      summary: text(day.summary),
      permitRequired: Boolean(day.permitRequired),
      imageDataUrl: safeImage(assets.images[`day-${index + 1}`]),
      activities: day.activities.map((activity) => ({
        time: text(activity.time),
        title: activity.title,
        description: text(activity.description),
        location: text(activity.location),
        ...(internal
          ? {
              costFormatted:
                activity.cost === null
                  ? ''
                  : formatExportMoney(activity.cost, currency),
            }
          : {}),
      })),
      stays: day.stay.map((stay) => ({
        name: stay.name,
        location: text(stay.location),
        vibe: text(stay.vibe),
        description: text(stay.description),
        ...(internal
          ? { pricePerNightFormatted: stayPrice(stay.pricePerNight, currency) }
          : {}),
      })),
      food: day.food,
      transport: day.transport,
      tips: day.tips,
    })),
    recommendations: doc.recommendations,
    thingsToCarry: doc.thingsToCarry,
    cancellationPolicy: doc.cancellationPolicy,
    contact: {
      phone: text(doc.contact.phone),
      email: text(doc.contact.email),
      website: text(doc.contact.website),
      instagram: text(doc.contact.instagram),
    },
    assets: {
      logoDataUrl: safeImage(assets.images.logo),
      mascotDataUrl: safeImage(assets.images.mascot),
      coverImageDataUrl: safeImage(assets.images.cover),
      headingFontFamily: headingFamily,
      bodyFontFamily: bodyFamily,
    },
    generatedAt: formatGeneratedAt(doc.generatedAt),
    watermark: watermarkFor(doc, internal),
    statusLabel,
    internal,
  };
}

function fontFormat(mime: unknown): string {
  const value = String(mime ?? '').toLowerCase();
  if (!FONT_MIMES.has(value)) return '';
  if (value === 'font/ttf') return 'truetype';
  if (value === 'font/otf') return 'opentype';
  return value.replace('font/', '');
}

function fontFace(
  font: ResolvedTemplateFont | null,
  weight: number
): string {
  if (!font) return '';
  const family = safeFontFamily(font.family);
  const data = safeFontData(font.dataUrl);
  const format = fontFormat(font.mime);
  if (!family || !data || !format) return '';
  return `@font-face{font-family:'${family}';src:url('${data}') format('${format}');font-weight:${weight};font-style:normal;font-display:block;}`;
}

function fontStack(family: string): string {
  return family ? `'${family}', ${FALLBACK_FONT_STACK}` : FALLBACK_FONT_STACK;
}

function wrapperStyles(
  doc: ExportDocument,
  assets: ResolvedTemplateAssets
): string {
  const primary = safeHexColour(doc.agency.primaryColor, DEFAULT_PRIMARY);
  const accent = safeHexColour(doc.agency.accentColor, DEFAULT_ACCENT);
  const heading =
    safeFontFamily(assets.headingFont?.family) ??
    safeFontFamily(doc.agency.fontHeading);
  const body =
    safeFontFamily(assets.bodyFont?.family) ??
    safeFontFamily(doc.agency.fontBody);

  return `${fontFace(assets.headingFont, 700)}${fontFace(assets.bodyFont, 400)}
:root {
  --brand-primary: ${primary};
  --brand-accent: ${accent};
  --font-heading: ${fontStack(heading ?? '')};
  --font-body: ${fontStack(body ?? '')};
}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: var(--font-body);
  color: #0F172A;
  background: #FFFFFF;
  font-size: 10.5pt;
  line-height: 1.55;
  overflow-wrap: anywhere;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.page {
  position: relative;
  width: 210mm;
  min-height: 297mm;
  background: #FFFFFF;
  page-break-after: always;
  break-after: page;
}
.page:last-child { page-break-after: auto; break-after: auto; }
img { max-width: 100%; }
.export-watermark {
  position: fixed;
  top: 42%;
  left: 0;
  right: 0;
  z-index: 9999;
  text-align: center;
  font-family: var(--font-heading);
  font-size: 88pt;
  font-weight: 800;
  letter-spacing: 0.16em;
  color: rgba(100, 116, 139, 0.24);
  transform: rotate(-18deg);
  pointer-events: none;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}`;
}

/**
 * Renders a stored version against one real ExportDocument. Sources are
 * re-validated on every render so an audience mismatch or a manually edited
 * file can never reach the PDF worker.
 */
export function renderCustomTemplateHtml(input: {
  doc: ExportDocument;
  template: CustomTemplateDescriptor;
  source: string;
  assets: ResolvedTemplateAssets;
}): RenderedCustomTemplate {
  validateAgencyTemplateSource(input.source, {
    audience: input.template.audience,
  });

  const view = buildAgencyTemplateView({
    doc: input.doc,
    templateName: input.template.name,
    audience: input.template.audience,
    assets: input.assets,
  });
  const fragment = renderAgencyTemplateFragment(input.source, view);
  const pageCount = countTemplatePages(fragment);
  if (pageCount === 0) {
    throw new AppError(
      'This template did not render any pages for the selected trip. Check its page sections.',
      400
    );
  }

  const watermark = String(view.watermark ?? '');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" />
<title>${escapeHtml(input.doc.trip.title)} · ${escapeHtml(input.doc.agency.name)}</title>
<style>${wrapperStyles(input.doc, input.assets)}</style>
</head>
<body>${fragment}${
    watermark
      ? `<div class="export-watermark" aria-hidden="true">${escapeHtml(
          watermark
        )}</div>`
      : ''
  }</body>
</html>`;

  return { html, pageCount };
}
