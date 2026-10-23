import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { AppError } from '../../../utils/AppError.js';
import { buildExportDocument } from './document.js';
import {
  buildAgencyTemplateView,
  renderCustomTemplateHtml,
} from './customTemplate.js';
import { assertTemplateVersionIntegrity } from './templateResolver.js';
import { templateSourceChecksum } from './templateValidation.js';
import type { ResolvedTemplateAssets } from './templateAssets.js';

/**
 * A6 renderer guarantees:
 * - the view matches the v1 token contract and omits internal costs for clients;
 * - dates, money and missing values render predictably;
 * - the wrapper carries CSP, print geometry, brand variables, fonts and watermark;
 * - rendered content is escaped and audited against the template audience.
 */

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const WOFF2 = `data:font/woff2;base64,${Buffer.from(
  'wOF2test-font-bytes'
).toString('base64')}`;

function expectAppError(fn: () => unknown, status: number): void {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, status);
    return true;
  });
}

/** Intl uses a non-breaking space between the currency code and amount. */
function plain(value: unknown): string {
  return String(value ?? '').replace(/\u00a0/g, ' ');
}

function agencyFixture() {
  return {
    _id: new Types.ObjectId(),
    name: 'Himalaya Trails',
    gstin: '27AAPFU0939F1ZV',
    branding: {
      primaryColor: '#0F766E',
      accentColor: '#F59E0B',
      fontHeading: 'Fraunces',
      fontBody: 'Inter',
      contactPhone: '+91 99999 00000',
      contactEmail: 'hello@himalaya.test',
      website: 'https://himalaya.test',
      instagram: '@himalayatrails',
      address: '12 Camp Road, Pune',
    },
  };
}

function quoteFixture(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    number: 'Q-2026-0042',
    version: 2,
    status: 'sent',
    currency: 'INR',
    total: 1268.89,
    perPerson: 422.96,
    validUntil: new Date('2099-12-31T23:59:59.999Z'),
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    inclusions: ['Airport transfers', 'All stays'],
    exclusions: ['Lunch on day 2'],
    terms: ['50% deposit confirms the booking.'],
    client: {
      name: 'Asha Rao',
      email: 'asha@example.com',
      phone: '+91 88888 11111',
      adults: 2,
      children: 1,
      rooms: 1,
    },
    markupPct: 47.31,
    markupAmount: 9876.54,
    preparedBy: 'secret-agent',
    expenses: [{ amount: 777, note: 'secret-expense' }],
    chat: [{ ciphertext: 'secret-chat' }],
    ...overrides,
  };
}

function tripFixture() {
  return {
    _id: new Types.ObjectId(),
    title: 'Working title',
    workspace: 'agency',
    startDate: new Date('2026-11-05T00:00:00.000Z'),
    endDate: new Date('2026-11-06T00:00:00.000Z'),
    tripDetails: {
      trip_title: 'Spiti Valley Slow Road',
      destination: 'Spiti Valley',
      duration_days: 2,
      group_type: 'Family',
      season: 'Autumn',
      highlights: ['Key Monastery at dawn', 'Chandratal under the stars'],
      things_to_carry: ['Down jacket', 'Reusable bottle'],
      weather_advisory: { packing_tips: ['Sunscreen'] },
      day_by_day_itinerary: [
        {
          day: 1,
          title: 'Arrive in Kaza',
          summary: 'A measured day with time to acclimatise.',
          activities: [
            {
              title: 'Morning walk',
              time: '08:30',
              location: 'Kaza',
              description: 'A gentle walk through the bazaar.',
              approx_cost: 450,
            },
          ],
          stay_recommendations: [
            {
              name: 'Hotel Kaza',
              location: 'Kaza',
              vibe: 'Quiet and warm',
              price_per_night: 3200,
              description: 'A small family-run property.',
            },
          ],
          food_spots: ['Sol Cafe', 'Taste of Spiti'],
          transport: ['Private Innova'],
          pro_tip: ['Carry cash above Kaza.'],
        },
        {
          day: 2,
          title: 'Slow day in Kaza',
          summary: 'Time to look around and acclimatise.',
          activities: [{ title: 'Long lunch', time: '13:00' }],
          stay_recommendations: [{ name: 'Hotel Kaza', vibe: 'Quiet' }],
          food_spots: ['Sol Cafe'],
          permit_required: true,
        },
      ],
    },
  };
}

function assetsFixture(): ResolvedTemplateAssets {
  return {
    images: {
      logo: PNG,
      mascot: PNG,
      cover: PNG,
      'day-1': PNG,
      'day-2': PNG,
    },
    headingFont: {
      dataUrl: WOFF2,
      mime: 'font/woff2',
      family: 'Fraunces',
    },
    bodyFont: {
      dataUrl: WOFF2,
      mime: 'font/woff2',
      family: 'Inter',
    },
  };
}

function documentFixture(quote: any = quoteFixture()) {
  return buildExportDocument({
    agency: agencyFixture(),
    trip: tripFixture(),
    quote,
    now: new Date('2026-10-22T10:00:00.000Z'),
  });
}

const TEMPLATE = {
  name: 'Himalaya brochure',
  audience: 'client',
  version: 3,
} as const;

const SOURCE = `
<style>
  .page { padding: 14mm; }
  h1, h2 { font-family: var(--font-heading); color: var(--brand-primary); }
</style>
<section class="page cover">
  {{#assets.logoDataUrl}}<img src="{{.}}" alt="{{agency.name}}" width="40mm">{{/assets.logoDataUrl}}
  <h1>{{trip.title}}</h1>
  <p>{{trip.destination}} · {{trip.durationDays}} days</p>
  {{#quote}}<p>{{quote.number}} · {{quote.totalFormatted}}</p>{{/quote}}
</section>
{{#days}}
<section class="page day">
  <h2>Day {{day}} · {{title}}</h2>
  {{#imageDataUrl}}<img src="{{.}}" alt="{{title}}" width="100%">{{/imageDataUrl}}
  <p>{{summary}}</p>
  <ul>{{#activities}}<li>{{time}} {{title}}</li>{{/activities}}</ul>
</section>
{{/days}}
`;

test('the client view exposes contract values but no internal cost fields', () => {
  const view = buildAgencyTemplateView({
    doc: documentFixture(),
    templateName: TEMPLATE.name,
    audience: 'client',
    assets: assetsFixture(),
  }) as any;

  assert.equal(view.agency.name, 'Himalaya Trails');
  assert.equal(view.agency.primaryColor, '#0F766E');
  assert.equal(view.agency.instagram, '@himalayatrails');
  assert.equal(view.trip.startDate, '05 Nov 2026');
  assert.equal(view.trip.endDate, '06 Nov 2026');
  assert.equal(view.trip.durationDays, 2);
  assert.equal(view.client.name, 'Asha Rao');
  assert.equal(view.quote.number, 'Q-2026-0042');
  assert.equal(view.quote.statusLabel, 'Q-2026-0042 · SENT');
  assert.equal(plain(view.quote.totalFormatted), 'INR 1,268.89');
  assert.equal(plain(view.quote.perPersonFormatted), 'INR 422.96');
  assert.equal(view.watermark, '');
  assert.equal(view.statusLabel, 'Q-2026-0042 · SENT');
  assert.equal(view.internal, false);
  assert.equal(view.generatedAt, '22 Oct 2026, 10:00');

  assert.equal(view.assets.logoDataUrl, PNG);
  assert.equal(view.assets.coverImageDataUrl, PNG);
  assert.equal(view.assets.headingFontFamily, 'Fraunces');
  assert.equal(view.days[0].pageNumber, 1);
  assert.equal(view.days[0].imageDataUrl, PNG);
  assert.equal(view.days[1].permitRequired, true);
  assert.equal('costFormatted' in view.days[0].activities[0], false);
  assert.equal('pricePerNightFormatted' in view.days[0].stays[0], false);

  // Staff-only values never enter the view at all.
  const serialized = JSON.stringify(view);
  assert.doesNotMatch(serialized, /47\.31|9876\.54|secret-/);
});

test('internal templates receive formatted estimates and an internal label', () => {
  const view = buildAgencyTemplateView({
    doc: documentFixture(quoteFixture({ status: 'draft' })),
    templateName: TEMPLATE.name,
    audience: 'internal',
    assets: assetsFixture(),
  }) as any;

  assert.equal(view.internal, true);
  assert.equal(view.statusLabel, 'Internal · Himalaya brochure');
  assert.equal(view.quote.statusLabel, 'Q-2026-0042 · DRAFT');
  assert.equal(view.watermark, 'DRAFT');
  assert.equal(plain(view.days[0].activities[0].costFormatted), 'INR 450.00');
  assert.equal(
    plain(view.days[0].stays[0].pricePerNightFormatted),
    'INR 3,200.00'
  );
});

test('missing quotes and images produce empty, renderable values', () => {
  const assets = assetsFixture();
  delete assets.images.cover;
  delete assets.images['day-1'];
  const doc = documentFixture(null);
  doc.trip.days[0].summary = null;

  const client = buildAgencyTemplateView({
    doc,
    templateName: TEMPLATE.name,
    audience: 'client',
    assets,
  }) as any;
  assert.equal(client.quote, null);
  assert.equal(client.statusLabel, 'Pricing on request');
  assert.equal(client.watermark, 'DRAFT');
  assert.equal(client.days[0].summary, '');
  assert.equal(client.days[0].imageDataUrl, '');
  assert.equal(client.assets.coverImageDataUrl, '');

  const internal = buildAgencyTemplateView({
    doc,
    templateName: TEMPLATE.name,
    audience: 'internal',
    assets,
  }) as any;
  assert.equal(internal.quote, null);
  assert.equal(internal.watermark, '');
});

test('the renderer wraps the fragment with print CSS, fonts, CSP and escaping', () => {
  const doc = documentFixture();
  doc.trip.title = '<script>alert(1)</script>';
  const rendered = renderCustomTemplateHtml({
    doc,
    template: TEMPLATE,
    source: SOURCE,
    assets: assetsFixture(),
  });

  assert.equal(rendered.pageCount, 3);
  assert.match(rendered.html, /^<!doctype html>/);
  assert.match(rendered.html, /default-src 'none'/);
  assert.match(rendered.html, /img-src data:/);
  assert.match(rendered.html, /font-src data:/);
  assert.match(rendered.html, /script-src 'none'/);
  assert.match(rendered.html, /--brand-primary: #0F766E/);
  assert.match(rendered.html, /--brand-accent: #F59E0B/);
  assert.match(rendered.html, /--font-heading: 'Fraunces'/);
  assert.match(rendered.html, /@font-face\{font-family:'Fraunces'/);
  assert.match(rendered.html, /@font-face\{font-family:'Inter'/);
  assert.match(rendered.html, /Day 1 · Arrive in Kaza/);
  assert.match(rendered.html, /data:image(?:\/|&#x2F;)png;base64/);
  assert.doesNotMatch(rendered.html, /<script>alert/);
  assert.match(rendered.html, /&lt;script&gt;alert\(1\)&lt;&#x2F;script&gt;/);
  assert.doesNotMatch(rendered.html, /<div class="export-watermark"/);
  assert.doesNotMatch(rendered.html, />DRAFT<\/div>/);
});

test('draft proposals get a print watermark and unsafe fonts are ignored', () => {
  const assets = assetsFixture();
  assets.headingFont = {
    dataUrl: 'data:text/html;base64,PHNjcmlwdD4=',
    mime: 'font/woff2',
    family: 'Fraunces',
  };

  const rendered = renderCustomTemplateHtml({
    doc: documentFixture(quoteFixture({ status: 'draft' })),
    template: TEMPLATE,
    source: SOURCE,
    assets,
  });

  assert.match(rendered.html, /class="export-watermark"/);
  assert.match(rendered.html, />DRAFT<\/div>/);
  assert.doesNotMatch(rendered.html, /@font-face\{font-family:'Fraunces'/);
  assert.doesNotMatch(rendered.html, /data:text\/html/);
});

test('a client template cannot reference internal costs', () => {
  const source = `<section class="page">{{#days}}{{#activities}}{{costFormatted}}{{/activities}}{{/days}}</section>`;
  expectAppError(
    () =>
      renderCustomTemplateHtml({
        doc: documentFixture(),
        template: TEMPLATE,
        source,
        assets: assetsFixture(),
      }),
    400
  );
});

test('a template that renders no page for this trip is rejected', () => {
  const source = `{{#quote}}<section class="page">{{quote.number}}</section>{{/quote}}{{#days}}{{title}}{{/days}}`;
  expectAppError(
    () =>
      renderCustomTemplateHtml({
        doc: documentFixture(null),
        template: TEMPLATE,
        source,
        assets: assetsFixture(),
      }),
    400
  );
});

test('pinned versions must match their approved checksum and schema', () => {
  const source = '<section class="page">{{#days}}{{/days}}</section>';
  const version = {
    engine: 'html',
    schemaVersion: 1,
    checksum: templateSourceChecksum(source),
    sourceBytes: Buffer.byteLength(source, 'utf8'),
  };
  assert.doesNotThrow(() => assertTemplateVersionIntegrity(version, source));

  expectAppError(
    () => assertTemplateVersionIntegrity(version, `${source}\n<!-- edited -->`),
    409
  );
  expectAppError(
    () =>
      assertTemplateVersionIntegrity({ ...version, schemaVersion: 2 }, source),
    409
  );
  expectAppError(
    () =>
      assertTemplateVersionIntegrity(
        { ...version, engine: 'pdf-background' },
        source
      ),
    400
  );
});
