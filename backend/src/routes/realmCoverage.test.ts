import { test } from 'node:test';
import assert from 'node:assert/strict';
import authRouter from './auth.routes.js';
import invitesRouter from './invites.routes.js';
import itineraryRouter from './itinerary.routes.js';
import geoRouter from './geo.routes.js';
import travelersRouter from './travelers.routes.js';
import exploreRouter from './explore.routes.js';
import blocksRouter from './blocks.routes.js';
import reportsRouter from './reports.routes.js';
import enquiriesRouter from './enquiries.routes.js';
import proposalsRouter from './proposals.routes.js';
import conversationsRouter from './conversations.routes.js';
import agenciesRouter from './agencies.routes.js';
import { AUTH_GUARD_TAG } from '../middleware/auth.middleware.js';

/**
 * Realm guard coverage (`docs/roadmap-platform-admin.md` §10).
 *
 * Every personal route must run `protectPersonal`; every shared trip route must
 * run `protectSession`. Public allow-lists are explicit, so a new route cannot
 * quietly land outside both categories.
 */

type Layer = { route?: { path: unknown; methods: Record<string, boolean>; stack: any[] } };

function routeLayers(router: any): Layer[] {
  return router.stack.filter((layer: Layer) => layer.route) as Layer[];
}

function pathOf(layer: Layer): string {
  const path = layer.route?.path as any;
  return Array.isArray(path) ? String(path[0]) : String(path);
}

function guardKind(layer: Layer): string | undefined {
  for (const handler of layer.route?.stack ?? []) {
    const tag = handler?.handle?.[AUTH_GUARD_TAG];
    if (tag?.realm) return String(tag.realm);
  }
  return undefined;
}

function guarded(layer: Layer): boolean {
  return guardKind(layer) !== undefined;
}

test('every non-public personal auth route uses protectPersonal', () => {
  const PUBLIC = new Set(['/signup', '/signin', '/logout', '/csrf']);
  const layers = routeLayers(authRouter);

  for (const path of PUBLIC) {
    assert.ok(
      layers.some((layer) => pathOf(layer) === path),
      `expected the public auth route ${path} to exist`
    );
  }

  const offenders = layers.filter(
    (layer) => !PUBLIC.has(pathOf(layer)) && guardKind(layer) !== 'personal'
  );
  assert.deepEqual(
    offenders.map((layer) => pathOf(layer)),
    [],
    'Personal auth routes must use protectPersonal'
  );
});

test('every trip-invite route uses protectPersonal', () => {
  const offenders = routeLayers(invitesRouter).filter(
    (layer) => guardKind(layer) !== 'personal'
  );
  assert.deepEqual(
    offenders.map((layer) => pathOf(layer)),
    [],
    'Invite routes are personal-realm only'
  );
});

test('every shared trip route uses protectSession', () => {
  const PUBLIC = new Set(['/shared/:shareId']);
  const PERSONAL = new Set(['/', '/insights', '/trash', '/:id/clone', '/:id/join-request']);
  const SESSION = new Set(['/generate', '/generate-stream']);

  const offenders: string[] = [];
  const unclassified: string[] = [];

  for (const layer of routeLayers(itineraryRouter)) {
    const path = pathOf(layer);
    const expected = PUBLIC.has(path)
      ? undefined
      : PERSONAL.has(path)
        ? 'personal'
        : SESSION.has(path) || path.startsWith('/:id')
          ? 'session'
          : 'unclassified';

    if (expected === 'unclassified') {
      unclassified.push(path);
    } else if (guardKind(layer) !== expected) {
      offenders.push(`${path} expected ${expected ?? 'no guard'}, got ${guardKind(layer) ?? 'none'}`);
    }
  }

  assert.deepEqual(unclassified, [], 'Classify every new itinerary route in this test');
  assert.deepEqual(offenders, [], 'Shared trip routes must use protectSession');
});

test('personal collection routes never accept a platform session', () => {
  const platformSafe = ['/', '/insights', '/trash'];
  const layers = routeLayers(itineraryRouter);

  for (const path of platformSafe) {
    const layer = layers.find((candidate) => pathOf(candidate) === path);
    assert.ok(layer, `expected ${path} to exist`);
    assert.equal(guardKind(layer!), 'personal', `${path} must use protectPersonal`);
    assert.ok(guarded(layer!), `${path} must carry a realm guard`);
  }
});

test('traveler profile routes are anonymous and classified', () => {
  const layers = routeLayers(travelersRouter);
  assert.equal(layers.length, 1, 'The traveler surface is a single public read');
  assert.equal(pathOf(layers[0]), '/:handle');
  assert.deepEqual(
    layers.filter((layer) => guardKind(layer) !== undefined).map(pathOf),
    [],
    'Gallery profiles must never inherit a session or platform guard'
  );
});

test('gallery explore routes are anonymous and classified', () => {
  const layers = routeLayers(exploreRouter);
  assert.deepEqual(
    layers.map(pathOf).sort(),
    ['/', '/:tripId'],
    'The gallery surface is the listing plus one public trip page'
  );
  assert.deepEqual(
    layers.filter((layer) => guardKind(layer) !== undefined).map(pathOf),
    [],
    'Gallery browse must never inherit a session or platform guard'
  );
});

test('public agency directory pages are anonymous; the enquiry write is personal-realm', () => {
  const layers = routeLayers(agenciesRouter);
  assert.deepEqual(
    layers.map(pathOf),
    [
      '/',
      '/facets',
      '/:slug/logo',
      '/:slug/packages/:packageId/cover',
      '/:slug/enquiries',
      '/:slug',
    ],
    'D3 adds the listing, facets and public logo; D4 package covers; D5 the one write'
  );
  assert.deepEqual(
    layers.filter((layer) => guarded(layer)).map((layer) => `${pathOf(layer)} ${guardKind(layer)}`),
    ['/:slug/enquiries personal'],
    'Browsing stays anonymous, but an enquiry must belong to a personal account so the thread and its replies have somewhere to live'
  );
});

test('a traveller’s own enquiry history and thread are personal-realm only', () => {
  const layers = routeLayers(enquiriesRouter);
  assert.deepEqual(
    layers.map((layer) => `${pathOf(layer)} ${Object.keys(layer.route?.methods ?? {})}`),
    ['/ get', '/summary get', '/events get', '/:id/read post', '/:id get', '/:id/messages post'],
    'The consumer side owns the history, its badge summary, the live stream, the thread and one read receipt; the write is public and lives on the directory router, guest replies on the conversation router'
  );
  assert.deepEqual(
    layers.filter((layer) => guardKind(layer) !== 'personal').map(pathOf),
    [],
    'An enquiry history carries contact details, so agency and platform sessions must be refused'
  );
});

test('a traveller’s proposal comparison is personal-realm only', () => {
  const layers = routeLayers(proposalsRouter);
  assert.deepEqual(
    layers.map((layer) => `${pathOf(layer)} ${Object.keys(layer.route?.methods ?? {})}`),
    [
      '/ get',
      '/:linkId get',
      '/:linkId/pdf get',
      '/:linkId/accept post',
      '/:linkId/decline post',
    ],
    'The comparison surface is the list, one pinned document, its PDF, and the two in-app answers'
  );
  assert.deepEqual(
    layers.filter((layer) => guardKind(layer) !== 'personal').map(pathOf),
    [],
    'Proposal links are the agency’s capability; the personal page proves ownership instead'
  );
});

test('guest conversation links are anonymous and classified', () => {
  const layers = routeLayers(conversationsRouter);
  assert.deepEqual(
    layers.map((layer) => `${pathOf(layer)} ${Object.keys(layer.route?.methods ?? {})}`),
    ['/:token get', '/:token/proposals get', '/:token/proposals/:linkId get', '/:token/proposals/:linkId/pdf get', '/:token/messages post'],
    'The guest thread is one read, one proposal list, one pinned document, its PDF and one reply'
  );
  assert.deepEqual(
    layers.filter((layer) => guardKind(layer) !== undefined).map(pathOf),
    [],
    'The private token is the capability; a conversation link must never require a session'
  );
});

test('block routes are personal-realm only', () => {
  const layers = routeLayers(blocksRouter);
  assert.deepEqual(
    [...new Set(layers.map(pathOf))].sort(),
    ['/', '/:userId'],
    'The block surface is the list plus block/unblock'
  );
  assert.deepEqual(
    layers.filter((layer) => guardKind(layer) !== 'personal').map(pathOf),
    [],
    'A personal block list must never accept an agency or platform session'
  );
});

test('report routes are personal-realm only', () => {
  const layers = routeLayers(reportsRouter);
  assert.deepEqual(
    layers.map((layer) => `${pathOf(layer)} ${Object.keys(layer.route?.methods ?? {})}`),
    ['/ post'],
    'The safety surface is one authenticated report write'
  );
  assert.deepEqual(
    layers.filter((layer) => guardKind(layer) !== 'personal').map(pathOf),
    [],
    'Reporting is an accountable personal action, never an agency/platform one'
  );
});

test('requester join-request routes are personal, owner queue is session', () => {
  const layers = routeLayers(itineraryRouter);

  for (const layer of layers) {
    if (pathOf(layer) === '/:id/join-request') {
      assert.equal(
        guardKind(layer),
        'personal',
        'Asking to join a public trip is a personal-realm action'
      );
    }
    if (pathOf(layer).startsWith('/:id/join-requests')) {
      assert.equal(
        guardKind(layer),
        'session',
        'The owner queue belongs to the shared trip surface'
      );
    }
  }
});

test('geo routes use the shared session guard, never the platform realm', () => {
  const offenders = routeLayers(geoRouter).filter(
    (layer) => guardKind(layer) !== 'session'
  );
  assert.deepEqual(
    offenders.map((layer) => pathOf(layer)),
    [],
    'Geo endpoints are part of the shared trip surface'
  );
});
