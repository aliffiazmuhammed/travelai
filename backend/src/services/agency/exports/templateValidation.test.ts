import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { Types } from 'mongoose';
import { AppError } from '../../../utils/AppError.js';
import {
  AGENCY_TEMPLATE_MAX_BYTES,
  buildTemplateValidationView,
  countTemplatePages,
  renderAgencyTemplateFragment,
  templateSourceChecksum,
  validateAgencyTemplateSource,
} from './templateValidation.js';
import {
  agencyTemplateFilePath,
  buildAgencyTemplateStorageKey,
  readAgencyTemplateFile,
  removeAgencyTemplateFile,
  writeAgencyTemplateFile,
} from './templateStorage.js';

/**
 * A6 authoring contract:
 * - a safe fragment with static CSS and allowlisted tokens is accepted;
 * - scripts, event handlers, remote assets, forms, unsafe CSS and dynamic
 *   styles are rejected before anything is stored;
 * - unknown or internal-only tokens cannot leak into a client template;
 * - template sources use private, server-generated storage keys.
 */

function expectAppError(fn: () => unknown, status: number): void {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, status);
    return true;
  });
}

const SAFE_TEMPLATE = `
<style>
  @page { size: A4; margin: 0; }
  .page { page-break-after: always; padding: 12mm; }
  h1 { font-family: var(--font-heading); color: var(--brand-primary); }
</style>
<section class="page cover">
  <img src="{{assets.logoDataUrl}}" alt="{{agency.name}}" width="40mm">
  <h1>{{trip.title}}</h1>
  <p>{{trip.destination}} · {{trip.durationDays}} days</p>
  {{#quote}}<p>{{quote.number}} · {{quote.totalFormatted}}</p>{{/quote}}
  {{^quote}}<p>Pricing on request</p>{{/quote}}
  {{#client}}<p>Prepared for {{name}}</p>{{/client}}
</section>
{{#days}}
<section class="page day">
  <h2>Day {{day}} · {{title}}</h2>
  {{#imageDataUrl}}<img src="{{.}}" alt="{{title}}" width="100%">{{/imageDataUrl}}
  <p>{{summary}}</p>
  {{#permitRequired}}<p>Permit required.</p>{{/permitRequired}}
  <ul>{{#activities}}<li>{{time}} {{title}} — {{location}}</li>{{/activities}}</ul>
  <ul>{{#stays}}<li>{{name}} — {{vibe}}</li>{{/stays}}</ul>
  <ul>{{#food}}<li>{{.}}</li>{{/food}}</ul>
</section>
{{/days}}
<section class="page practical">
  <h2>Good to know</h2>
  <ul>{{#recommendations}}<li>{{.}}</li>{{/recommendations}}</ul>
  <ul>{{#thingsToCarry}}<li>{{.}}</li>{{/thingsToCarry}}</ul>
  <ul>{{#cancellationPolicy}}<li>{{.}}</li>{{/cancellationPolicy}}</ul>
  <p>{{contact.email}} · {{contact.website}}</p>
</section>
`;

// Mirrors docs/agency-template-contract.md so the published example cannot
// drift away from what the uploader accepts.
const DOCUMENTED_EXAMPLE = `
<style>
  .page { page-break-after: always; padding: 14mm; font-family: var(--font-body); }
  h1, h2 { font-family: var(--font-heading); color: var(--brand-primary); }
</style>

<section class="page">
  {{#assets.logoDataUrl}}
    <img src="{{.}}" alt="{{agency.name}}" width="40mm">
  {{/assets.logoDataUrl}}
  <h1>{{trip.title}}</h1>
  <p>{{agency.name}} · {{trip.destination}} · {{trip.durationDays}} days</p>
  {{#quote}}<p>{{quote.number}} · {{quote.totalFormatted}}</p>{{/quote}}
  {{^quote}}<p>Pricing on request</p>{{/quote}}
</section>

{{#days}}
<section class="page">
  <h2>Day {{day}} — {{title}}</h2>
  {{#imageDataUrl}}<img src="{{.}}" alt="{{title}}" width="100%">{{/imageDataUrl}}
  <p>{{summary}}</p>
  <ul>{{#activities}}<li>{{time}} {{title}}</li>{{/activities}}</ul>
  <ul>{{#stays}}<li>{{name}} — {{vibe}}</li>{{/stays}}</ul>
</section>
{{/days}}
`;

function invalid(source: string, audience: 'client' | 'internal' = 'client'): void {
  expectAppError(() => validateAgencyTemplateSource(source, { audience }), 400);
}

test('the documented example validates and renders', () => {
  const result = validateAgencyTemplateSource(DOCUMENTED_EXAMPLE, {
    audience: 'client',
  });
  assert.equal(result.pageCount, 3);
  assert.ok(result.tokens.includes('assets.logoDataUrl'));

  const html = renderAgencyTemplateFragment(
    DOCUMENTED_EXAMPLE,
    buildTemplateValidationView()
  );
  assert.equal(countTemplatePages(html), 3);
  assert.match(html, /Day 2 — Slow day in Kaza/);
});

test('a safe fragment renders pages, loops, conditionals and escaped values', () => {
  const result = validateAgencyTemplateSource(SAFE_TEMPLATE, {
    audience: 'client',
  });

  assert.equal(result.bytes, Buffer.byteLength(SAFE_TEMPLATE, 'utf8'));
  assert.equal(result.checksum, templateSourceChecksum(SAFE_TEMPLATE));
  assert.match(result.checksum, /^[a-f0-9]{64}$/);
  assert.equal(result.pageCount, 4);
  assert.ok(result.tokens.includes('trip.title'));
  assert.ok(result.tokens.includes('days.title'));
  assert.ok(result.tokens.includes('days.activities.location'));
  assert.ok(result.tokens.includes('assets.logoDataUrl'));
  assert.ok(result.sections.includes('days'));

  const view = buildTemplateValidationView();
  const html = renderAgencyTemplateFragment(SAFE_TEMPLATE, view);
  assert.equal(countTemplatePages(html), 4);
  assert.match(html, /Day 1 · Arrive in Kaza/);
  assert.match(html, /<li>Sol Cafe<\/li>/);
  assert.match(html, /Q-2026-0042 · INR 1,268\.89/);
  assert.doesNotMatch(html, /Pricing on request/);
});

test('Mustache interpolation is escaped and inverted sections hide the quote block', () => {
  const view = buildTemplateValidationView() as any;
  view.trip.title = '<script>alert(1)</script>';
  view.quote = null;

  const html = renderAgencyTemplateFragment(SAFE_TEMPLATE, view);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;&#x2F;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /Pricing on request/);
});

test('internal costs are accepted only for internal templates', () => {
  const source = `
    <section class="page">{{#days}}{{#activities}}{{costFormatted}}{{/activities}}{{/days}}</section>
  `;
  assert.equal(
    validateAgencyTemplateSource(source, { audience: 'internal' }).pageCount,
    1
  );
  invalid(source, 'client');
});

test('unsafe markup is rejected', () => {
  const cases = [
    '<script>alert(1)</script>',
    '<iframe src="https://evil.test"></iframe>',
    '<form action="https://evil.test"><input></form>',
    '<a href="https://evil.test">click</a>',
    '<svg><circle /></svg>',
    '<html><body><section class="page"></section></body></html>',
  ];
  for (const markup of cases) {
    invalid(`{{#days}}${markup}{{/days}}`);
  }
});

test('event handlers and non-allowlisted attributes are rejected', () => {
  invalid('<section class="page" onclick="alert(1)">{{#days}}{{/days}}</section>');
  invalid('<section class="page" data-x="1">{{#days}}{{/days}}</section>');
  invalid('<section class="page" href="https://evil.test">{{#days}}{{/days}}</section>');
});

test('images may only use embedded data or known image tokens', () => {
  invalid(
    '<section class="page"><img src="https://evil.test/x.png">{{#days}}{{/days}}</section>'
  );
  invalid(
    '<section class="page"><img src="//evil.test/x.png">{{#days}}{{/days}}</section>'
  );
  invalid(
    '<section class="page"><img src="{{client.name}}">{{#days}}{{/days}}</section>'
  );
  invalid(
    '<section class="page"><img src="{{markupPct}}">{{#days}}{{/days}}</section>'
  );
});

test('remote or dynamic CSS is rejected', () => {
  invalid(
    '<style>@import url("https://evil.test/x.css");</style><section class="page">{{#days}}{{/days}}</section>'
  );
  invalid(
    '<style>.x{background:url(https://evil.test/x.png)}</style><section class="page">{{#days}}{{/days}}</section>'
  );
  invalid(
    '<style>.x{color:{{agency.primaryColor}}}</style><section class="page">{{#days}}{{/days}}</section>'
  );
  invalid(
    '<section class="page" style="background:url(https://evil.test/x.png)">{{#days}}{{/days}}</section>'
  );
  invalid(
    '<section class="page" style="color:{{agency.primaryColor}}">{{#days}}{{/days}}</section>'
  );
  invalid(
    '<style>.x{width:expression(alert(1))}</style><section class="page">{{#days}}{{/days}}</section>'
  );
  invalid(
    '<style>.x{background:url(javascript:alert(1))}</style><section class="page">{{#days}}{{/days}}</section>'
  );
  invalid(
    '<style>.x{background:url(vbscript:msgbox(1))}</style><section class="page">{{#days}}{{/days}}</section>'
  );
  invalid(
    '<style>.x{background:url(data:text/html;base64,PGI+Ym9vbTwvYj4=)}</style><section class="page">{{#days}}{{/days}}</section>'
  );
});

test('unknown tokens, unescaped values and partials are rejected', () => {
  invalid(
    '<section class="page">{{trip.titel}}{{#days}}{{/days}}</section>'
  );
  invalid('<section class="page">{{markupPct}}{{#days}}{{/days}}</section>');
  invalid(
    '<section class="page">{{{trip.title}}}{{#days}}{{/days}}</section>'
  );
  invalid('<section class="page">{{>shared}}{{#days}}{{/days}}</section>');
  invalid(
    '<section class="page">{{#days}}{{/days}}{{/days}}</section>'
  );
  invalid(
    '<section class="page">{{#days}}{{title}}</section>'
  );
});

test('a template must include a day section and render at least one page', () => {
  invalid('<section class="page">{{trip.title}}</section>');
  invalid('{{#days}}<div>{{title}}</div>{{/days}}');
});

test('size, encoding and emptiness are enforced', () => {
  expectAppError(
    () => validateAgencyTemplateSource(Buffer.alloc(AGENCY_TEMPLATE_MAX_BYTES + 1, 0x61)),
    400
  );
  expectAppError(
    () => validateAgencyTemplateSource(Buffer.from([0xff, 0xfe, 0x80])),
    400
  );
  expectAppError(() => validateAgencyTemplateSource('   '), 400);
});

test('storage keys are server-generated and traversal-safe', async () => {
  const agencyId = new Types.ObjectId().toString();
  const versionId = new Types.ObjectId().toString();
  const key = buildAgencyTemplateStorageKey(agencyId, versionId);
  assert.equal(key, `${agencyId}/${versionId}.html`);

  expectAppError(() => buildAgencyTemplateStorageKey('nope', versionId), 400);
  expectAppError(() => buildAgencyTemplateStorageKey(agencyId, '../x'), 400);
  expectAppError(() => agencyTemplateFilePath('../escape.html'), 400);
  expectAppError(() => agencyTemplateFilePath('/absolute.html'), 400);
  expectAppError(() => agencyTemplateFilePath('agency/source.txt'), 400);

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'travelai-template-'));
  const previous = process.env.AGENCY_TEMPLATE_DIR;
  process.env.AGENCY_TEMPLATE_DIR = root;
  try {
    const source = `${SAFE_TEMPLATE}\n<!-- non-ascii: ₹ -->`;
    await writeAgencyTemplateFile(key, source);
    assert.equal(await readAgencyTemplateFile(key), source);

    const missing = `${agencyId}/${new Types.ObjectId().toString()}.html`;
    await assert.rejects(
      () => readAgencyTemplateFile(missing),
      (error) =>
        error instanceof AppError && error.statusCode === 404
    );

    await removeAgencyTemplateFile(key);
    await assert.rejects(
      () => readAgencyTemplateFile(key),
      (error) => error instanceof AppError && error.statusCode === 404
    );
  } finally {
    if (previous === undefined) delete process.env.AGENCY_TEMPLATE_DIR;
    else process.env.AGENCY_TEMPLATE_DIR = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
});
