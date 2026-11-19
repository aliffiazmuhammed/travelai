import { test } from 'node:test';
import assert from 'node:assert/strict';
import Trip from '../../models/Trip.js';
import {
  applyMetaToHtml,
  resolveHtmlMeta,
  type PageMetaTags,
} from './shareMeta.js';

const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>waytowalk — Real journeys. Your way.</title>
    <meta name="description" content="Site description" />
    <meta property="og:title" content="waytowalk — Real journeys. Your way." />
    <meta property="og:description" content="Site description" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="theme-color" content="#173F35" />
    <script src="/theme-init.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>`;

const META: PageMetaTags = {
  title: 'Wayanad Wander · Shared itinerary · waytowalk',
  description: 'A 3-day itinerary shared on waytowalk.',
  image: 'https://waytowalk.example/brand/og-default.png',
  imageWidth: 1200,
  imageHeight: 630,
  canonical: 'https://waytowalk.example/shared/abc',
  robots: 'noindex, nofollow',
  type: 'article',
};

test('injects the share title, description, image and robots', () => {
  const html = applyMetaToHtml(SHELL, META);

  assert.match(html, /<title>Wayanad Wander · Shared itinerary · waytowalk<\/title>/);
  assert.match(html, /<meta name="description" content="A 3-day itinerary shared on waytowalk\." \/>/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/);
  assert.match(html, /<meta property="og:type" content="article" \/>/);
  assert.match(
    html,
    /<meta property="og:image" content="https:\/\/waytowalk\.example\/brand\/og-default\.png" \/>/
  );
  assert.match(html, /<meta property="og:image:width" content="1200" \/>/);
  assert.match(html, /<meta property="og:image:height" content="630" \/>/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/waytowalk\.example\/brand\/og-default\.png" \/>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/waytowalk\.example\/shared\/abc" \/>/);
  // Existing shell tags survive.
  assert.match(html, /<script src="\/theme-init\.js"><\/script>/);
  assert.match(html, /<meta name="theme-color" content="#173F35" \/>/);
});

test('never emits duplicate description, robots or canonical tags', () => {
  const once = applyMetaToHtml(SHELL, META);
  const twice = applyMetaToHtml(once, { ...META, title: 'Second pass' });

  assert.equal((twice.match(/name="description"/g) ?? []).length, 1);
  assert.equal((twice.match(/name="robots"/g) ?? []).length, 1);
  assert.equal((twice.match(/rel="canonical"/g) ?? []).length, 1);
  assert.match(twice, /<title>Second pass<\/title>/);
});

test('escapes quotes and markup in injected attributes', () => {
  const html = applyMetaToHtml(SHELL, {
    ...META,
    title: 'Trip "quoted" <script>',
    description: '5 > 3 & <b>safe</b>',
  });

  assert.match(html, /<title>Trip &quot;quoted&quot; &lt;script&gt;<\/title>/);
  assert.match(html, /content="5 &gt; 3 &amp; &lt;b&gt;safe&lt;\/b&gt;"/);
  assert.doesNotMatch(html, /<title>Trip "quoted"/);
});

test('public routes stay indexable and private or unknown routes do not', async () => {
  const publicMeta = await resolveHtmlMeta('/explore', 'https://waytowalk.example');
  assert.equal(publicMeta.robots, 'index, follow');

  const terms = await resolveHtmlMeta('/terms', 'https://waytowalk.example');
  assert.equal(terms.robots, 'index, follow');

  for (const privatePath of ['/dashboard', '/plan', '/admin/reports', '/agency/trips']) {
    const meta = await resolveHtmlMeta(privatePath, 'https://waytowalk.example');
    assert.equal(meta.robots, 'noindex, nofollow', `${privatePath} must be noindex`);
  }

  // Unknown paths render NotFound client-side; crawlers must not index the shell.
  const unknown = await resolveHtmlMeta('/no-such-page', 'https://waytowalk.example');
  assert.equal(unknown.robots, 'noindex, nofollow');
});

test('/agencies is public even though /agency is private', async () => {
  const publicMeta = await resolveHtmlMeta('/agencies', 'https://waytowalk.example');
  assert.equal(publicMeta.robots, 'index, follow');

  const privateMeta = await resolveHtmlMeta('/agency', 'https://waytowalk.example');
  assert.equal(privateMeta.robots, 'noindex, nofollow');
});

test('the canonical URL keeps the requested path', async () => {
  const meta = await resolveHtmlMeta('/agencies/wayanad-trails/', 'https://waytowalk.example');
  assert.equal(meta.canonical, 'https://waytowalk.example/agencies/wayanad-trails');
});

/* -------------------------------------------------------------------------- */
/* Capability routes: the shared trip's own title, day count and cover.       */
/* -------------------------------------------------------------------------- */

const originalTripFindOne = Trip.findOne;
let sharedTrip: Record<string, unknown> | null = null;
(Trip as any).findOne = async () => sharedTrip;

test.after(() => {
  (Trip as any).findOne = originalTripFindOne;
});

test('a shared trip contributes its title, day count and cover image', async () => {
  sharedTrip = {
    _id: 't1',
    shareId: 'share-cover',
    isPublic: true,
    title: 'Wayanad Wander',
    tripDetails: {
      trip_title: 'Wayanad Wander',
      duration_days: 3,
      day_by_day_itinerary: [
        { day: 1, title: 'Arrive', image: { id: 'a'.repeat(24) } },
      ],
    },
  };

  const meta = await resolveHtmlMeta(
    '/shared/share-cover',
    'https://waytowalk.example'
  );

  assert.equal(
    meta.title,
    'Wayanad Wander · Shared itinerary · waytowalk'
  );
  assert.match(meta.description, /A 1-day itinerary shared on waytowalk/);
  assert.equal(
    meta.image,
    `https://waytowalk.example/api/itinerary/shared/share-cover/media/${'a'.repeat(24)}/content`
  );
  // A share link is unlisted: previews only, never an indexed page.
  assert.equal(meta.robots, 'noindex, nofollow');
  assert.equal(meta.type, 'article');
});

test('a missing or revoked share falls back to the not-found card', async () => {
  sharedTrip = null;

  const meta = await resolveHtmlMeta(
    '/shared/share-revoked',
    'https://waytowalk.example'
  );

  assert.equal(meta.title, 'Page not found · waytowalk');
  assert.equal(meta.robots, 'noindex, nofollow');
  assert.equal(meta.image, 'https://waytowalk.example/brand/og-default.png');
});
