import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { TripDay, TripItinerary } from '@/api/trips';

/**
 * Purpose-built itinerary PDF, matching the web export (`frontend/src/lib/pdfExport.ts`):
 * a clean A4 document rendered from the data itself rather than a screen dump.
 *
 * `Rs.` is used for money on purpose — it matches the web PDF and sidesteps
 * font coverage for the ₹ glyph in whatever print engine the device ships.
 */

const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Escaped text with line breaks preserved. */
const para = (value: unknown): string => esc(value).replace(/\r?\n/g, '<br />');

const money = (value: unknown): string => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 'Rs. 0';
  return `Rs. ${Math.round(n).toLocaleString('en-IN')}`;
};

type ActivityItem = NonNullable<TripDay['activities']>[number];
type StayItem = NonNullable<TripDay['stay_recommendations']>[number];
type FoodItem = NonNullable<TripDay['food_spots']>[number];
type TipItem = NonNullable<TripDay['pro_tip']>[number];

function activityOf(act: ActivityItem) {
  if (typeof act === 'string') {
    return { title: act, description: '', location: '', time: '', cost: null as number | null };
  }
  const raw = act as unknown as Record<string, unknown>;
  const cost = typeof raw.approx_cost === 'number' ? raw.approx_cost : null;
  return {
    title: String(raw.title ?? raw.name ?? ''),
    description: String(raw.description ?? ''),
    location: String(raw.location_name ?? raw.location ?? ''),
    time: String(raw.time ?? ''),
    cost,
  };
}

function stayOf(item: StayItem): string {
  return typeof item === 'string' ? item : String(item?.name ?? '');
}

function foodOf(item: FoodItem): string {
  return typeof item === 'string' ? item : String(item?.name ?? '');
}

function tipOf(item: TipItem): string {
  return typeof item === 'string' ? item : String(item?.tip ?? item?.text ?? '');
}

function durationLabel(days: number): string {
  if (days <= 0) return '';
  if (days === 1) return '1 Day';
  return `${days} Days / ${days - 1} Nights`;
}

function section(title: string, body: string): string {
  return `<section class="section"><h2>${esc(title)}</h2>${body}</section>`;
}

function renderDay(day: TripDay): string {
  const parts: string[] = [];

  const title = esc(String(day.title ?? '').replace(/^day\s*\d+\s*[:\-–]\s*/i, ''));
  parts.push(
    `<div class="day-head">
      <span class="day-badge">${esc(day.day)}</span>
      <span class="day-title">${title || `Day ${esc(day.day)}`}</span>
    </div>`
  );

  if (day.permit_required) {
    parts.push('<p class="permit">PERMIT REQUIRED</p>');
  }

  const slots = ['Morning', 'Afternoon', 'Sunset / Evening', 'Night'];
  (day.activities ?? []).forEach((act, index) => {
    const item = activityOf(act);
    if (!item.title) return;
    const slot = item.time || slots[index % slots.length];
    parts.push(
      `<div class="activity">
        <div class="act-row">
          <span class="act-slot">${esc(slot.toUpperCase())}</span>
          ${item.cost != null && item.cost > 0 ? `<span class="act-cost">${esc(money(item.cost))}</span>` : ''}
        </div>
        <p class="act-title">${esc(item.title)}</p>
        ${item.description ? `<p class="act-desc">${para(item.description)}</p>` : ''}
        ${item.location ? `<p class="act-loc">@ ${esc(item.location)}</p>` : ''}
      </div>`
    );
  });

  const stay = (day.stay_recommendations ?? []).map(stayOf).filter(Boolean).join(', ');
  const food = (day.food_spots ?? []).map(foodOf).filter(Boolean).join(', ');
  const transport = (day.transport ?? []).filter(Boolean).join(' - ');
  const tips = (day.pro_tip ?? []).map(tipOf).filter(Boolean).join(' ');

  if (stay || food || transport || tips) {
    const rows: string[] = [];
    if (stay) rows.push(`<div class="log-row"><span class="log-label">STAY</span><span>${esc(stay)}</span></div>`);
    if (food) rows.push(`<div class="log-row"><span class="log-label">FOOD</span><span>${esc(food)}</span></div>`);
    if (transport) {
      rows.push(`<div class="log-row"><span class="log-label">GETTING AROUND</span><span>${esc(transport)}</span></div>`);
    }
    if (tips) rows.push(`<div class="log-row"><span class="log-label tip-label">TIP</span><span class="tip-text">${esc(tips)}</span></div>`);
    parts.push(`<div class="logistics">${rows.join('')}</div>`);
  }

  return `<div class="day">${parts.join('')}</div>`;
}

function renderBudget(itinerary: TripItinerary): string {
  const breakdown = itinerary.budget_breakdown;
  if (!breakdown) return '';

  const rows: [string, unknown][] = [
    ['Accommodation', breakdown.accommodation],
    ['Food & Drinks', breakdown.food_and_drinks],
    ['Activities & Entry', breakdown.activities_and_entry],
    ['Local Transport', breakdown.local_transport],
    ['Emergency Buffer', breakdown.miscellaneous_buffer],
  ];
  const sum = rows.reduce((total, [, value]) => total + (Number(value) || 0), 0);
  const total = Number(breakdown.total) || sum;

  const body = rows
    .map(
      ([label, value], index) =>
        `<tr class="${index % 2 === 0 ? 'even' : ''}"><td>${esc(label)}</td><td class="amount">${esc(money(value))}</td></tr>`
    )
    .join('');

  return section(
    'Budget Breakdown',
    `<table class="budget">${body}
      <tr class="total"><td>Total Estimated</td><td class="amount">${esc(money(total))}</td></tr>
    </table>`
  );
}

function renderPayment(itinerary: TripItinerary): string {
  const payment = itinerary.footnotes_safety_tips?.payment;
  if (!payment || (!payment.upi && !payment.cash)) return '';
  return `<div class="payment">
    <p class="payment-head">PAYMENT ADVICE</p>
    ${payment.upi ? `<p><strong>UPI:</strong> ${esc(payment.upi)}</p>` : ''}
    ${payment.cash ? `<p><strong>Cash:</strong> ${esc(payment.cash)}</p>` : ''}
  </div>`;
}

function renderWeather(itinerary: TripItinerary): string {
  const weather = itinerary.weather_advisory;
  if (!weather) return '';
  const packing = weather.packing_tips ?? [];
  const risks = weather.risks ?? [];
  if (!weather.expected_weather && packing.length === 0 && risks.length === 0) return '';

  const list = (items: string[], prefix: string) =>
    items.length === 0
      ? ''
      : `<ul class="muted-list">${items
          .map((item) => `<li>${esc(prefix)}${esc(item)}</li>`)
          .join('')}</ul>`;

  return section(
    'Weather & Packing',
    `${weather.expected_weather ? `<p class="muted">${para(weather.expected_weather)}</p>` : ''}
     ${list(packing, 'Pack: ')}
     ${list(risks, 'Risk: ')}`
  );
}

function renderSafety(itinerary: TripItinerary): string {
  const notes = itinerary.footnotes_safety_tips;
  if (!notes) return '';

  const group = (label: string, items: string[] | undefined) => {
    if (!items || items.length === 0) return '';
    return `<p class="group-label">${esc(label.toUpperCase())}</p>
      <ul class="muted-list">${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
  };

  const body = [
    group('Safety', notes.safety),
    group('Cultural etiquette', notes.cultural_etiquette),
  ].join('');
  if (!body.trim()) return '';

  return section('Safety & Etiquette', body);
}

export function buildItineraryHtml(itinerary: TripItinerary, overrideTitle?: string): string {
  const days = itinerary.day_by_day_itinerary ?? [];
  const duration = Number(itinerary.duration_days) || days.length;
  const total = Number(itinerary.budget_breakdown?.total) || 0;
  const perDay = duration > 0 ? Math.round(total / duration) : 0;

  const meta = [durationLabel(duration), itinerary.group_type, itinerary.season ? `${itinerary.season} Season` : '']
    .filter(Boolean)
    .map((part) => esc(part))
    .join(' &nbsp;·&nbsp; ');

  const stats: [string, string][] = [
    ['Total (est.)', money(total)],
    ['Per person', money(itinerary.budget_per_person)],
    ['Per day', money(perDay)],
    ['Stay', durationLabel(duration).replace(' Days', 'D').replace(' Nights', 'N').replace(' Day', 'D')],
  ];

  const highlights = (itinerary.highlights ?? []).filter(Boolean);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 16mm 16mm 20mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #1d2925;
    font-size: 10pt;
    line-height: 1.45;
  }
  p { margin: 0; }
  .band {
    background: #173f35;
    color: #f7f3ea;
    border-radius: 10px;
    padding: 18px 20px 16px;
  }
  .wordmark {
    text-align: right;
    font-size: 7.5pt;
    letter-spacing: 2px;
    color: #b9d2c8;
    margin-bottom: 10px;
  }
  h1 { margin: 0 0 8px; font-size: 20pt; line-height: 1.15; letter-spacing: -0.3px; }
  .meta { font-size: 9.5pt; color: #d7e5df; }
  .stats { display: table; width: 100%; border-spacing: 6px 0; margin: 12px -6px 0; }
  .stat { display: table-cell; width: 25%; background: #eef1ec; border-radius: 6px; padding: 8px 10px; }
  .stat-label { font-size: 6.5pt; letter-spacing: 1px; color: #52665f; font-weight: 700; }
  .stat-value { margin-top: 2px; font-size: 10pt; font-weight: 700; }
  .section { margin-top: 16px; }
  h2 {
    font-size: 13pt;
    color: #173f35;
    border-bottom: 2px solid #e87656;
    padding-bottom: 3px;
    margin: 0 0 10px;
    page-break-after: avoid;
  }
  .highlights { margin: 0; padding-left: 16px; }
  .highlights li { margin-bottom: 4px; }
  .day { margin-bottom: 14px; page-break-inside: avoid; }
  .day-head { display: table; width: 100%; margin-bottom: 6px; page-break-after: avoid; }
  .day-badge {
    display: table-cell;
    width: 22px;
    height: 22px;
    border-radius: 11px;
    background: #173f35;
    color: #ffffff;
    font-weight: 700;
    font-size: 9.5pt;
    text-align: center;
    vertical-align: middle;
  }
  .day-title {
    display: table-cell;
    vertical-align: middle;
    padding-left: 8px;
    font-size: 12pt;
    font-weight: 700;
  }
  .permit {
    display: inline-block;
    background: #fde68a;
    color: #b45309;
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.5px;
    border-radius: 10px;
    padding: 2px 10px;
    margin-bottom: 6px;
  }
  .activity { margin-bottom: 8px; page-break-inside: avoid; }
  .act-row { display: table; width: 100%; }
  .act-slot {
    display: table-cell;
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 0.8px;
    color: #52665f;
  }
  .act-cost { display: table-cell; text-align: right; font-size: 8pt; font-weight: 700; color: #057864; }
  .act-title { font-size: 10.5pt; font-weight: 700; }
  .act-desc { font-size: 9pt; color: #52665f; margin-top: 1px; }
  .act-loc { font-size: 8.5pt; font-weight: 700; color: #173f35; margin-top: 1px; }
  .logistics {
    background: #f7f3ea;
    border: 1px solid #e2e3da;
    border-radius: 6px;
    padding: 8px 10px;
    margin-top: 8px;
  }
  .log-row { display: table; width: 100%; margin-bottom: 3px; }
  .log-label {
    display: table-cell;
    width: 92px;
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 0.6px;
    color: #173f35;
    vertical-align: top;
  }
  .log-row span:last-child { display: table-cell; font-size: 9pt; }
  .tip-label, .tip-text { color: #b45309 !important; }
  table.budget { width: 100%; border-collapse: collapse; }
  table.budget td { padding: 6px 8px; font-size: 9.5pt; }
  table.budget tr.even td { background: #eef1ec; }
  table.budget td.amount { text-align: right; font-weight: 700; width: 34%; }
  table.budget tr.total td {
    background: #173f35;
    color: #ffffff;
    font-weight: 700;
    font-size: 10pt;
  }
  .payment {
    margin-top: 12px;
    background: #ecfdf5;
    border: 1px solid #a7e9d4;
    border-radius: 6px;
    padding: 10px 12px;
  }
  .payment-head { font-size: 8pt; font-weight: 700; letter-spacing: 1px; color: #057864; margin-bottom: 4px; }
  .payment p { font-size: 9pt; margin-bottom: 2px; }
  .muted { font-size: 9pt; color: #52665f; margin-bottom: 4px; }
  .muted-list { margin: 0 0 4px; padding-left: 16px; font-size: 9pt; }
  .group-label { font-size: 8pt; font-weight: 700; letter-spacing: 1px; color: #173f35; margin: 6px 0 2px; }
  .footer {
    margin-top: 20px;
    padding-top: 8px;
    border-top: 1px solid #d9e1dc;
    font-size: 8pt;
    color: #52665f;
  }
</style>
</head>
<body>
  <header class="band">
    <p class="wordmark">WAYTOWALK &nbsp;·&nbsp; ASSISTANT</p>
    <h1>${esc(overrideTitle || itinerary.trip_title || 'Your Trip')}</h1>
    ${meta ? `<p class="meta">${meta}</p>` : ''}
  </header>

  <div class="stats">
    ${stats
      .map(
        ([label, value]) =>
          `<div class="stat"><p class="stat-label">${esc(label.toUpperCase())}</p><p class="stat-value">${esc(value)}</p></div>`
      )
      .join('')}
  </div>

  ${
    highlights.length
      ? section('Trip Highlights', `<ul class="highlights">${highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>`)
      : ''
  }

  ${days.length ? section('Day by Day', days.map(renderDay).join('')) : ''}

  ${renderBudget(itinerary)}
  ${renderPayment(itinerary)}
  ${renderWeather(itinerary)}
  ${renderSafety(itinerary)}

  <p class="footer">Generated with waytowalk &nbsp;·&nbsp; ${esc(
    new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  )}</p>
</body>
</html>`;

  return html;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'travelai-trip'
  );
}

/**
 * Renders the itinerary and hands the PDF to the OS share sheet. On web the
 * browser print dialog stands in — the same `printAsync` path the web app uses.
 */
export async function exportItineraryPdf(
  itinerary: TripItinerary,
  overrideTitle?: string
): Promise<void> {
  const html = buildItineraryHtml(itinerary, overrideTitle);

  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }

  const { uri } = await Print.printToFileAsync({ html });

  // Print writes to a random cache name; copy to a recognisable one so the
  // share sheet shows the trip instead of "Print.pdf".
  let shareUri = uri;
  try {
    const target = new File(Paths.cache, `${slugify(overrideTitle || itinerary.trip_title || '')}-itinerary.pdf`);
    new File(uri).copy(target, { overwrite: true });
    shareUri = target.uri;
  } catch {
    // Keep the temp file name rather than failing the export.
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(shareUri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Share itinerary',
      UTI: 'com.adobe.pdf',
    });
    return;
  }

  await Print.printAsync({ html });
}
