import { AppError } from '../../../utils/AppError.js';
import type {
  AgencyBuiltinTemplateKey,
  AgencyTemplateAudience,
} from '../../../models/AgencyTemplate.js';
import {
  formatExportDate,
  formatExportDateRange,
  formatExportMoney,
} from './format.js';
import type { ExportActivity, ExportDay, ExportDocument } from './document.js';

/**
 * Built-in HTML brochure renderer (Agency Workspace A5).
 *
 * Everything is escaped and validated before it reaches the markup. There is
 * no user-authored HTML and the document CSP forbids scripts and remote asset
 * fetch, so a template can never exfiltrate or execute anything. The renderer
 * also never reads the database.
 */

export interface ExportRenderTemplate {
  builtinKey: AgencyBuiltinTemplateKey;
  name: string;
  audience: AgencyTemplateAudience;
  version: number;
}

export interface ExportRenderBrand {
  logoDataUrl?: string | null;
  mascotDataUrl?: string | null;
  headingFontDataUrl?: string | null;
  bodyFontDataUrl?: string | null;
  headingFontMime?: string | null;
  bodyFontMime?: string | null;
}

export interface RenderedExport {
  html: string;
  pageCount: number;
}

const DEFAULT_PRIMARY = '#0F766E';
const DEFAULT_ACCENT = '#F59E0B';

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeHexColour(value: unknown, fallback: string): string {
  const colour = String(value ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(colour) ? colour.toUpperCase() : fallback;
}

export function safeFontFamily(value: unknown): string | null {
  const family = String(value ?? '').trim();
  if (!family) return null;
  // Quotes, braces and semicolons are never part of a legitimate family name
  // and are the characters that could break out of the CSS declaration.
  return /^[A-Za-z0-9][A-Za-z0-9 _-]{0,59}$/.test(family) ? family : null;
}

function fontMime(value: unknown): string {
  const mime = String(value ?? '').toLowerCase();
  return ['font/woff', 'font/woff2', 'font/ttf', 'font/otf'].includes(mime)
    ? mime
    : '';
}

function fontDataUrl(value: unknown): string | null {
  const source = String(value ?? '').trim();
  if (!source) return null;
  return /^data:font\/(?:woff2?|ttf|otf);base64,[a-z0-9+/=]+$/i.test(source)
    ? source
    : null;
}

function imageDataUrl(value: unknown): string | null {
  const source = String(value ?? '').trim();
  if (!source) return null;
  return /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(source)
    ? source
    : null;
}

function alpha(hex: string, suffix: string): string {
  return `${hex}${suffix}`;
}

function luminance(hex: string): number {
  const clean = hex.replace('#', '');
  const rgb = [0, 2, 4].map((offset) => parseInt(clean.slice(offset, offset + 2), 16) / 255);
  const linear = rgb.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function inkFor(background: string): string {
  return luminance(background) > 0.55 ? '#0F172A' : '#FFFFFF';
}

function list(items: string[], className = 'bullets', empty = ''): string {
  if (items.length === 0) {
    return empty ? `<p class="muted">${escapeHtml(empty)}</p>` : '';
  }
  return `<ul class="${className}">${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')}</ul>`;
}

function activityRow(activity: ExportActivity, internal: boolean): string {
  const cost =
    internal && activity.cost !== null
      ? `<span class="activity-cost">Approx. ${escapeHtml(
          formatExportMoney(activity.cost, 'INR')
        )}</span>`
      : '';
  return `<li class="activity">
    <span class="activity-dot"></span>
    <div class="activity-body">
      <div class="activity-head">
        ${activity.time ? `<span class="activity-time">${escapeHtml(activity.time)}</span>` : ''}
        <strong>${escapeHtml(activity.title)}</strong>
        ${cost}
      </div>
      ${
        activity.location
          ? `<span class="activity-location">${escapeHtml(activity.location)}</span>`
          : ''
      }
      ${
        activity.description
          ? `<p class="activity-description">${escapeHtml(activity.description)}</p>`
          : ''
      }
    </div>
  </li>`;
}

function dayPage(
  day: ExportDay,
  index: number,
  totalDays: number,
  internal: boolean,
  primary: string,
  accent: string,
  contactFooter: string,
  statusBadge: string
): string {
  const activities =
    day.activities.length > 0
      ? `<ol class="timeline">${day.activities
          .map((activity) => activityRow(activity, internal))
          .join('')}</ol>`
      : '<p class="muted">The detailed plan for this day is being finalised.</p>';

  const stays =
    day.stay.length > 0
      ? `<div class="stay-grid">${day.stay
          .map(
            (stay) => `<div class="stay-card">
              <strong>${escapeHtml(stay.name)}</strong>
              ${stay.location ? `<span>${escapeHtml(stay.location)}</span>` : ''}
              ${stay.vibe ? `<em>${escapeHtml(stay.vibe)}</em>` : ''}
              ${
                internal && stay.pricePerNight
                  ? `<span class="stay-price">${escapeHtml(stay.pricePerNight)}</span>`
                  : ''
              }
              ${stay.description ? `<p>${escapeHtml(stay.description)}</p>` : ''}
            </div>`
          )
          .join('')}</div>`
      : '<p class="muted">Stay details will be confirmed with the final plan.</p>';

  const detailBlocks = [
    day.food.length ? `<section class="mini"><h4>Where to eat</h4>${list(day.food)}</section>` : '',
    day.transport.length
      ? `<section class="mini"><h4>Getting around</h4>${list(day.transport)}</section>`
      : '',
    day.tips.length ? `<section class="mini tip"><h4>Good to know</h4>${list(day.tips)}</section>` : '',
  ].join('');

  return `<section class="page day-page" data-page="day" data-day="${index + 1}">
    ${statusBadge}
    <header class="day-head">
      <div class="day-label" style="background:${alpha(primary, '14')};color:${primary}">
        Day ${day.day}
      </div>
      <div class="day-date">${escapeHtml(day.date ? formatExportDate(day.date) : '')}</div>
      <h2>${escapeHtml(day.title)}</h2>
      ${day.summary ? `<p class="lede">${escapeHtml(day.summary)}</p>` : ''}
      ${
        day.permitRequired
          ? `<span class="permit" style="background:${alpha(accent, '22')}">Permit required</span>`
          : ''
      }
    </header>
    <div class="day-main">
      <div class="timeline-wrap">${activities}</div>
      <div class="day-side">${detailBlocks}</div>
    </div>
    <section class="stay-section">
      <h3>Where you stay</h3>
      ${stays}
    </section>
    <footer class="page-footer">
      <span>${contactFooter}</span>
      <span>Day ${index + 1} of ${totalDays}</span>
    </footer>
  </section>`;
}

function coverPage(
  doc: ExportDocument,
  primary: string,
  accent: string,
  ink: string,
  logo: string,
  mascot: string,
  statusBadge: string,
  watermark: string
): string {
  const travellers = doc.client
    ? [
        doc.client.adults !== null ? `${doc.client.adults} adult${doc.client.adults === 1 ? '' : 's'}` : '',
        doc.client.children ? `${doc.client.children} child${doc.client.children === 1 ? '' : 'ren'}` : '',
        doc.client.rooms ? `${doc.client.rooms} room${doc.client.rooms === 1 ? '' : 's'}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const contact = [doc.contact.phone, doc.contact.email].filter(Boolean).map(String).join('   ·   ');

  return `<section class="page cover" data-page="cover" style="background:${primary};color:${ink}">
    <div class="cover-orbit cover-orbit-one" style="background:${alpha(accent, '44')}"></div>
    <div class="cover-orbit cover-orbit-two" style="background:${alpha('#FFFFFF', '12')}"></div>
    ${statusBadge}
    ${watermark ? `<div class="watermark">${escapeHtml(watermark)}</div>` : ''}
    <header class="cover-head">
      <div class="cover-brand">
        ${
          logo
            ? `<img class="brand-logo" src="${logo}" alt="${escapeHtml(doc.agency.name)}" />`
            : `<span class="brand-wordmark">${escapeHtml(doc.agency.name)}</span>`
        }
      </div>
      <span class="cover-tag">Travel proposal</span>
    </header>
    <div class="cover-content">
      ${mascot ? `<img class="mascot" src="${mascot}" alt="" />` : ''}
      <p class="cover-eyebrow">${escapeHtml(doc.agency.name)}</p>
      <h1>${escapeHtml(doc.trip.title)}</h1>
      ${doc.trip.destination ? `<p class="cover-destination">${escapeHtml(doc.trip.destination)}</p>` : ''}
      <div class="cover-meta">
        <div><span>Trip dates</span><strong>${escapeHtml(
          formatExportDateRange(doc.trip.startDate, doc.trip.endDate)
        )}</strong></div>
        <div><span>Duration</span><strong>${doc.trip.durationDays} days${
          doc.trip.nights ? ` / ${doc.trip.nights} nights` : ''
        }</strong></div>
        <div><span>Prepared for</span><strong>${escapeHtml(doc.client?.name || 'Your guest')}</strong></div>
        ${travellers ? `<div><span>Travellers</span><strong>${escapeHtml(travellers)}</strong></div>` : ''}
      </div>
      ${
        doc.quote
          ? `<div class="cover-quote">
              <span>${escapeHtml(doc.quote.number)} · v${doc.quote.version}</span>
              <strong>${escapeHtml(
                formatExportMoney(doc.quote.total, doc.quote.currency)
              )}</strong>
            </div>`
          : ''
      }
    </div>
    <footer class="cover-footer">
      <div>
        <strong>${escapeHtml(doc.agency.name)}</strong>
        ${doc.agency.address ? `<span>${escapeHtml(doc.agency.address)}</span>` : ''}
      </div>
      <div>${escapeHtml(contact)}${doc.agency.website ? `<span>${escapeHtml(doc.agency.website)}</span>` : ''}</div>
    </footer>
  </section>`;
}

function overviewPage(
  doc: ExportDocument,
  primary: string,
  accent: string,
  contactFooter: string,
  statusBadge: string
): string {
  const stats = [
    ['Duration', `${doc.trip.durationDays} days${doc.trip.nights ? ` / ${doc.trip.nights} nights` : ''}`],
    ['Season', doc.trip.season],
    ['Group', doc.trip.groupType],
    [
      'Proposal',
      doc.quote ? `${doc.quote.number} · ${doc.quote.status}` : 'Pricing on request',
    ],
  ].filter((entry) => Boolean(entry[1]));

  const highlights =
    doc.recommendations.length > 0
      ? doc.recommendations
          .map(
            (item, index) => `<div class="highlight">
              <span class="highlight-number" style="color:${primary};background:${alpha(accent, '26')}">
                ${String(index + 1).padStart(2, '0')}
              </span>
              <p>${escapeHtml(item)}</p>
            </div>`
          )
          .join('')
      : '<p class="muted">Your day-by-day plan below carries the full journey.</p>';

  const route = doc.trip.days
    .map(
      (day) => `<li>
        <span class="route-day" style="background:${alpha(primary, '14')};color:${primary}">Day ${day.day}</span>
        <span class="route-title">${escapeHtml(day.title)}</span>
        <span class="route-date">${escapeHtml(day.date ? formatExportDate(day.date) : '')}</span>
      </li>`
    )
    .join('');

  return `<section class="page overview-page" data-page="overview">
    ${statusBadge}
    <p class="section-kicker" style="color:${primary}">The journey</p>
    <h2 class="section-title">${escapeHtml(doc.trip.title)}</h2>
    <p class="lede">A ${doc.trip.durationDays}-day itinerary${
      doc.trip.destination ? ` across ${escapeHtml(doc.trip.destination)}` : ''
    }, curated for ${escapeHtml(doc.client?.name || 'your group')}.</p>
    <div class="stat-row">
      ${stats
        .map(
          ([label, value]) =>
            `<div class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(
              String(value)
            )}</strong></div>`
        )
        .join('')}
    </div>
    <section class="highlights">
      <h3 style="border-color:${accent}">Journey highlights</h3>
      <div class="highlight-grid">${highlights}</div>
    </section>
    <section class="route-section">
      <h3 style="border-color:${accent}">Day by day</h3>
      <ul class="route-list">${route}</ul>
    </section>
    <footer class="page-footer">
      <span>${contactFooter}</span>
      <span>Journey at a glance</span>
    </footer>
  </section>`;
}

function pricingPage(
  doc: ExportDocument,
  primary: string,
  accent: string,
  contactFooter: string,
  statusBadge: string
): string {
  const quote = doc.quote;
  const body = quote
    ? `<div class="price-hero" style="background:${primary};color:${inkFor(primary)}">
        <div>
          <span>Total for ${doc.client?.name || 'your group'}</span>
          <strong>${escapeHtml(formatExportMoney(quote.total, quote.currency))}</strong>
        </div>
        <div class="per-person" style="background:${alpha(accent, '33')}">
          <span>Per person</span>
          <strong>${escapeHtml(formatExportMoney(quote.perPerson, quote.currency))}</strong>
        </div>
      </div>
      <div class="quote-meta">
        <span>${escapeHtml(quote.number)} · version ${quote.version}</span>
        <span>${escapeHtml(quote.status.toUpperCase())}</span>
        <span>Valid until ${escapeHtml(formatExportDate(quote.validUntil) || 'on request')}</span>
      </div>
      <div class="terms-grid">
        <section>
          <h3 style="border-color:${accent}">What is included</h3>
          ${list(quote.inclusions, 'check-list', 'Inclusions will be confirmed with your proposal.')}
        </section>
        <section>
          <h3 style="border-color:${accent}">Not included</h3>
          ${list(quote.exclusions, 'cross-list', 'Nothing else is excluded beyond the itinerary notes.')}
        </section>
      </div>`
    : `<div class="draft-panel" style="border-color:${accent}">
        <span style="color:${primary}">Pricing on request</span>
        <h3>The commercial proposal is being finalised.</h3>
        <p class="muted">Your itinerary is ready; the quote will be added before this document is shared with a client.</p>
      </div>`;

  return `<section class="page pricing-page" data-page="pricing">
    ${statusBadge}
    <p class="section-kicker" style="color:${primary}">Your investment</p>
    <h2 class="section-title">A clear, itemised proposal</h2>
    ${body}
    <div class="assurance">
      <strong>What happens next</strong>
      <p>Reply to your travel designer to confirm this plan. We will hold the itinerary, stays and inclusions while the proposal is valid.</p>
    </div>
    <footer class="page-footer">
      <span>${contactFooter}</span>
      <span>Investment</span>
    </footer>
  </section>`;
}

function practicalPage(
  doc: ExportDocument,
  primary: string,
  accent: string,
  contactFooter: string,
  statusBadge: string
): string {
  const contactRows = [
    doc.contact.phone ? `<div><span>Phone</span><strong>${escapeHtml(doc.contact.phone)}</strong></div>` : '',
    doc.contact.email ? `<div><span>Email</span><strong>${escapeHtml(doc.contact.email)}</strong></div>` : '',
    doc.contact.website ? `<div><span>Website</span><strong>${escapeHtml(doc.contact.website)}</strong></div>` : '',
    doc.contact.instagram
      ? `<div><span>Instagram</span><strong>${escapeHtml(doc.contact.instagram)}</strong></div>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  return `<section class="page practical-page" data-page="practical">
    ${statusBadge}
    <p class="section-kicker" style="color:${primary}">Before you go</p>
    <h2 class="section-title">Practical details</h2>
    <div class="practical-grid">
      <section>
        <h3 style="border-color:${accent}">Things to carry</h3>
        ${list(doc.thingsToCarry, 'check-list', 'A packing list will be shared closer to departure.')}
      </section>
      <section>
        <h3 style="border-color:${accent}">Payment & cancellation</h3>
        ${list(doc.cancellationPolicy, 'bullets', 'Your travel designer will confirm payment and cancellation terms.')}
      </section>
    </div>
    <section class="contact-block" style="background:${alpha(primary, '0D')}">
      <h3 style="border-color:${accent}">Talk to your travel designer</h3>
      <div class="contact-rows">${contactRows || `<p class="muted">${escapeHtml(doc.agency.name)}</p>`}</div>
      ${doc.agency.gstin ? `<p class="gstin">GSTIN ${escapeHtml(doc.agency.gstin)}</p>` : ''}
    </section>
    <footer class="page-footer">
      <span>${contactFooter}</span>
      <span>${escapeHtml(doc.agency.name)} · Prepared with TravelAI</span>
    </footer>
  </section>`;
}

function styles(
  doc: ExportDocument,
  primary: string,
  accent: string,
  headingFont: string,
  bodyFont: string,
  renderBrand: ExportRenderBrand
): string {
  const headingFamily = safeFontFamily(doc.agency.fontHeading);
  const bodyFamily = safeFontFamily(doc.agency.fontBody);
  const headingData = fontDataUrl(renderBrand.headingFontDataUrl);
  const bodyData = fontDataUrl(renderBrand.bodyFontDataUrl);
  const headingMime = fontMime(renderBrand.headingFontMime);
  const bodyMime = fontMime(renderBrand.bodyFontMime);

  const fontFaces = [
    headingFamily && headingData && headingMime
      ? `@font-face{font-family:'${headingFamily}';src:url('${headingData}') format('${headingMime
          .replace('font/', '')
          .replace('ttf', 'truetype')
          .replace('otf', 'opentype')}');font-weight:700;font-style:normal;font-display:block;}`
      : '',
    bodyFamily && bodyData && bodyMime
      ? `@font-face{font-family:'${bodyFamily}';src:url('${bodyData}') format('${bodyMime
          .replace('font/', '')
          .replace('ttf', 'truetype')
          .replace('otf', 'opentype')}');font-weight:400;font-style:normal;font-display:block;}`
      : '',
  ].join('');

  return `${fontFaces}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: ${bodyFont};
  color: #0F172A;
  background: #FFFFFF;
  font-size: 10.5pt;
  line-height: 1.55;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.page {
  position: relative;
  width: 210mm;
  min-height: 297mm;
  padding: 17mm 16mm 14mm;
  background: #FFFFFF;
  page-break-after: always;
  break-after: page;
}
.page:last-child { page-break-after: auto; break-after: auto; }
h1, h2, h3, h4 {
  font-family: ${headingFont};
  margin: 0;
  line-height: 1.12;
  letter-spacing: -0.02em;
}
p { margin: 0; }
.muted { color: #64748B; }
.lede { color: #475569; font-size: 11.5pt; max-width: 155mm; margin-top: 6mm; overflow-wrap: anywhere; }
.page-footer {
  position: absolute;
  left: 16mm;
  right: 16mm;
  bottom: 9mm;
  display: flex;
  justify-content: space-between;
  gap: 8mm;
  padding-top: 3mm;
  border-top: 1px solid #E2E8F0;
  color: #64748B;
  font-size: 8pt;
  letter-spacing: 0.02em;
}
.status-pill, .permit {
  display: inline-block;
  border-radius: 999px;
  padding: 2mm 4mm;
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.status-pill { position: absolute; top: 12mm; right: 16mm; background: ${alpha(accent, '26')}; color: #78350F; }
.watermark {
  position: absolute;
  top: 118mm;
  left: 0;
  right: 0;
  text-align: center;
  font-family: ${headingFont};
  font-size: 76pt;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: rgba(255,255,255,0.16);
  transform: rotate(-16deg);
  pointer-events: none;
}
.cover { overflow: hidden; padding: 0; color: inherit; }
.cover-head {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16mm 16mm 0;
}
.cover-brand { display: flex; align-items: center; gap: 4mm; }
.brand-logo { max-height: 15mm; max-width: 52mm; object-fit: contain; }
.brand-wordmark { font-family: ${headingFont}; font-size: 17pt; font-weight: 800; letter-spacing: -0.03em; }
.cover-tag {
  border: 1px solid rgba(255,255,255,0.45);
  border-radius: 999px;
  padding: 2mm 4.5mm;
  font-size: 8pt;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.cover-content { position: relative; z-index: 2; padding: 34mm 18mm 0; }
.cover-eyebrow { font-size: 9pt; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.8; }
.cover h1 { font-size: 39pt; max-width: 160mm; margin-top: 5mm; overflow-wrap: anywhere; }
.cover-destination { margin-top: 4mm; font-size: 17pt; opacity: 0.9; overflow-wrap: anywhere; }
.cover-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6mm 8mm;
  margin-top: 16mm;
  max-width: 160mm;
}
.cover-meta span, .cover-quote span { display: block; font-size: 8pt; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.72; }
.cover-meta strong { display: block; margin-top: 1.5mm; font-size: 12pt; overflow-wrap: anywhere; }
.cover-quote {
  display: flex;
  align-items: baseline;
  gap: 8mm;
  margin-top: 12mm;
  padding: 5mm 6mm;
  border: 1px solid rgba(255,255,255,0.28);
  border-radius: 4mm;
  background: rgba(255,255,255,0.08);
  max-width: 160mm;
}
.cover-quote strong { font-size: 16pt; margin-left: auto; }
.cover-footer {
  position: absolute;
  left: 18mm;
  right: 18mm;
  bottom: 15mm;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  gap: 8mm;
  font-size: 8.5pt;
  opacity: 0.86;
}
.cover-footer span { display: block; max-width: 82mm; overflow-wrap: anywhere; }
.cover-footer strong { display: block; margin-bottom: 1mm; font-size: 10pt; }
.cover-orbit { position: absolute; border-radius: 50%; z-index: 1; }
.cover-orbit-one { width: 120mm; height: 120mm; right: -38mm; top: 28mm; }
.cover-orbit-two { width: 190mm; height: 190mm; left: -90mm; bottom: -100mm; }
.mascot {
  position: absolute;
  right: -4mm;
  top: 10mm;
  max-width: 48mm;
  max-height: 58mm;
  object-fit: contain;
  border-radius: 8mm;
}
.section-kicker {
  font-size: 8.5pt;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.section-title { font-size: 26pt; margin-top: 3mm; max-width: 160mm; overflow-wrap: anywhere; }
.stat-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4mm;
  margin-top: 9mm;
}
.stat { border: 1px solid #E2E8F0; border-radius: 3mm; padding: 4mm; background: #F8FAFC; }
.stat span { display: block; color: #64748B; font-size: 7.5pt; letter-spacing: 0.1em; text-transform: uppercase; }
.stat strong { display: block; margin-top: 1.5mm; font-size: 10pt; overflow-wrap: anywhere; }
.highlights, .route-section, .terms-grid, .practical-grid { margin-top: 10mm; }
.highlights h3, .route-section h3, .terms-grid h3, .practical-grid h3, .stay-section h3, .contact-block h3 {
  font-size: 13pt;
  padding-bottom: 2mm;
  border-bottom: 2px solid;
  margin-bottom: 4mm;
}
.highlight-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3mm; }
.highlight {
  display: flex;
  gap: 3mm;
  align-items: flex-start;
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  border-radius: 3mm;
  padding: 3.5mm;
}
.highlight p { font-size: 9.5pt; color: #334155; overflow-wrap: anywhere; }
.highlight-number {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 7mm;
  height: 7mm;
  border-radius: 2mm;
  font-size: 8pt;
  font-weight: 800;
}
.route-list { list-style: none; margin: 0; padding: 0; }
.route-list li {
  display: grid;
  grid-template-columns: 18mm minmax(0, 1fr) 28mm;
  gap: 3mm;
  align-items: center;
  padding: 2.8mm 0;
  border-bottom: 1px solid #E2E8F0;
}
.route-list li:last-child { border-bottom: 0; }
.route-day { display: inline-block; border-radius: 2mm; padding: 1mm 2mm; font-size: 8pt; font-weight: 700; text-align: center; }
.route-title { font-size: 10pt; font-weight: 600; overflow-wrap: anywhere; }
.route-date { color: #64748B; font-size: 8pt; text-align: right; }
.day-page { padding-top: 14mm; }
.day-head { padding-bottom: 5mm; border-bottom: 1px solid #E2E8F0; }
.day-label { display: inline-block; border-radius: 2mm; padding: 1.5mm 3mm; font-size: 8.5pt; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
.day-date { float: right; color: #64748B; font-size: 9pt; margin-top: 1.5mm; }
.day-head h2 { clear: both; font-size: 24pt; margin-top: 3mm; overflow-wrap: anywhere; }
.permit { margin-top: 3mm; }
.day-main { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 7mm; margin-top: 6mm; }
.timeline { list-style: none; margin: 0; padding: 0; }
.activity { display: flex; gap: 3mm; padding: 0 0 4mm; }
.activity-dot { flex: 0 0 auto; width: 3mm; height: 3mm; border-radius: 50%; margin-top: 2mm; background: ${primary}; }
.activity-body { min-width: 0; flex: 1; }
.activity-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2.5mm; }
.activity-head strong { font-size: 10.5pt; overflow-wrap: anywhere; }
.activity-time { font-size: 8pt; font-weight: 700; color: ${primary}; letter-spacing: 0.04em; }
.activity-cost { font-size: 8pt; color: #64748B; margin-left: auto; }
.activity-location { display: block; color: #64748B; font-size: 8.5pt; margin-top: 0.5mm; overflow-wrap: anywhere; }
.activity-description { color: #475569; font-size: 9.2pt; margin-top: 1mm; overflow-wrap: anywhere; }
.day-side { min-width: 0; }
.mini { margin-bottom: 4mm; padding: 3mm; border-radius: 3mm; background: #F8FAFC; border: 1px solid #E2E8F0; }
.mini h4 { font-size: 9.5pt; margin-bottom: 2mm; }
.mini.tip { background: ${alpha(accent, '14')}; border-color: ${alpha(accent, '44')}; }
.bullets, .check-list, .cross-list { margin: 0; padding-left: 4.5mm; }
.bullets li, .check-list li, .cross-list li { margin-bottom: 1.6mm; overflow-wrap: anywhere; }
.check-list li::marker { color: ${primary}; }
.cross-list li::marker { color: #94A3B8; }
.stay-section { margin-top: 4mm; }
.stay-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3mm; }
.stay-card { border: 1px solid #E2E8F0; border-radius: 3mm; padding: 3.5mm; min-width: 0; }
.stay-card strong { display: block; font-size: 10pt; overflow-wrap: anywhere; }
.stay-card span { display: block; color: #64748B; font-size: 8.5pt; margin-top: 1mm; overflow-wrap: anywhere; }
.stay-card em { display: block; margin-top: 1mm; font-size: 8.5pt; color: #475569; }
.stay-card p { margin-top: 1.5mm; font-size: 8.8pt; color: #475569; overflow-wrap: anywhere; }
.stay-price { font-weight: 700; color: #0F172A !important; }
.price-hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 8mm;
  border-radius: 4mm;
  padding: 8mm;
  margin-top: 8mm;
}
.price-hero span { display: block; font-size: 8pt; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.78; }
.price-hero strong { display: block; font-size: 25pt; margin-top: 2mm; }
.per-person { border-radius: 3mm; padding: 3.5mm 4.5mm; }
.per-person strong { font-size: 14pt; }
.quote-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4mm;
  margin-top: 4mm;
  color: #64748B;
  font-size: 8.5pt;
  letter-spacing: 0.04em;
}
.terms-grid, .practical-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10mm; }
.assurance {
  margin-top: 12mm;
  border: 1px solid #E2E8F0;
  border-radius: 3mm;
  padding: 5mm;
  background: #F8FAFC;
}
.assurance strong { display: block; font-size: 10pt; margin-bottom: 1.5mm; }
.assurance p { color: #475569; font-size: 9.5pt; }
.draft-panel {
  margin-top: 12mm;
  border: 1px dashed;
  border-radius: 4mm;
  padding: 10mm;
  background: #FFFBEB;
}
.draft-panel span { font-size: 8pt; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
.draft-panel h3 { font-size: 16pt; margin-top: 2mm; }
.draft-panel p { margin-top: 2mm; }
.contact-block { margin-top: 12mm; border-radius: 4mm; padding: 6mm; }
.contact-rows { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3mm 8mm; }
.contact-rows span { display: block; color: #64748B; font-size: 7.5pt; letter-spacing: 0.1em; text-transform: uppercase; }
.contact-rows strong { display: block; font-size: 10pt; overflow-wrap: anywhere; }
.gstin { margin-top: 4mm; color: #64748B; font-size: 8pt; letter-spacing: 0.08em; }
`;
}

export function renderExportHtml(
  doc: ExportDocument,
  template: ExportRenderTemplate,
  brand: ExportRenderBrand = {}
): RenderedExport {
  if (!['brochure', 'internal-summary'].includes(template.builtinKey)) {
    throw new AppError('That document template is not supported yet.', 400);
  }

  const primary = safeHexColour(doc.agency.primaryColor, DEFAULT_PRIMARY);
  const accent = safeHexColour(doc.agency.accentColor, DEFAULT_ACCENT);
  const inks = inkFor(primary);
  const headingFamily = safeFontFamily(doc.agency.fontHeading);
  const bodyFamily = safeFontFamily(doc.agency.fontBody);
  const headingFont = headingFamily
    ? `'${headingFamily}', 'Segoe UI', Arial, sans-serif`
    : `'Segoe UI', Arial, sans-serif`;
  const bodyFont = bodyFamily
    ? `'${bodyFamily}', 'Segoe UI', Arial, sans-serif`
    : `'Segoe UI', Arial, sans-serif`;
  const logo = imageDataUrl(brand.logoDataUrl);
  const mascot = imageDataUrl(brand.mascotDataUrl);
  const internal = template.audience === 'internal';
  const contactFooter = [doc.agency.name, doc.contact.phone, doc.contact.email]
    .filter(Boolean)
    .map(String)
    .join('  ·  ');

  const watermark = !doc.quote
    ? internal
      ? ''
      : 'DRAFT'
    : doc.quote.status === 'draft'
      ? 'DRAFT'
      : doc.quote.status === 'expired'
        ? 'EXPIRED'
        : doc.quote.status === 'cancelled'
          ? 'CANCELLED'
          : '';
  const statusLabel = internal
    ? `Internal · ${template.name}`
    : doc.quote
      ? `${doc.quote.number} · ${doc.quote.status.toUpperCase()}`
      : 'Pricing on request';
  const statusBadge = `<span class="status-pill">${escapeHtml(statusLabel)}</span>`;

  const pages = [
    coverPage(doc, primary, accent, inks, logo ?? '', mascot ?? '', statusBadge, watermark),
    overviewPage(doc, primary, accent, contactFooter, statusBadge),
    ...doc.trip.days.map((day, index) =>
      dayPage(
        day,
        index,
        doc.trip.days.length,
        internal,
        primary,
        accent,
        contactFooter,
        statusBadge
      )
    ),
    pricingPage(doc, primary, accent, contactFooter, statusBadge),
    practicalPage(doc, primary, accent, contactFooter, statusBadge),
  ];

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" />
<title>${escapeHtml(doc.trip.title)} · ${escapeHtml(doc.agency.name)}</title>
<style>${styles(doc, primary, accent, headingFont, bodyFont, brand)}</style>
</head>
<body>${pages.join('\n')}</body>
</html>`;

  return { html, pageCount: pages.length };
}

export function countExportPages(html: string): number {
  return (html.match(/<section class="page(?:\s[^"]*)?"/g) ?? []).length;
}
