import { test } from 'node:test';
import assert from 'node:assert/strict';
import Trip from '../../models/Trip.js';
import User from '../../models/User.js';
import {
  isTripOwner,
  normalizeGallerySummary,
  normalizeGalleryTags,
  setTripPublication,
} from './publish.js';

/**
 * Milestone 8 G1 — the publish contract. The route guard makes these
 * unreachable for non-owners, but the service must refuse on its own too:
 * ownership, agency rows and the handle requirement are all enforced here.
 */

let currentTrip: any = null;
let currentUser: any = null;

const originalTripFindOne = Trip.findOne;
const originalUserFindById = User.findById;

(Trip as any).findOne = async () => currentTrip;
(User as any).findById = () => ({
  select: async () => currentUser,
});

test.after(() => {
  (Trip as any).findOne = originalTripFindOne;
  (User as any).findById = originalUserFindById;
});

function trip(overrides: Record<string, unknown> = {}): any {
  const doc: any = {
    _id: 't1',
    workspace: 'personal',
    isPublic: false,
    shareId: undefined,
    visibility: 'private',
    publishedAt: undefined,
    gallery: undefined,
    members: [{ userId: 'owner1', role: 'owner' }],
    saved: 0,
    ...overrides,
  };
  doc.save = async () => {
    doc.saved += 1;
  };
  return doc;
}

function user(handle?: string): any {
  return handle ? { profile: { handle } } : { profile: {} };
}

function reset(overrides: Record<string, unknown> = {}): any {
  currentTrip = trip(overrides);
  currentUser = user('ada');
  return currentTrip;
}

test('publishing an owned personal trip sets visibility, date and metadata', async () => {
  const doc = reset();
  const state = await setTripPublication('owner1', {
    tripId: 't1',
    published: true,
    hideExactDates: true,
    summary: '  Six   slow days  ',
    tags: ['#Hills', 'Slow Travel', 'hills'],
  });

  assert.equal(doc.saved, 1);
  assert.equal(doc.visibility, 'public');
  assert.ok(doc.publishedAt instanceof Date);
  assert.deepEqual(doc.gallery, {
    hideExactDates: true,
    summary: 'Six slow days',
    tags: ['hills', 'slow-travel'],
  });
  assert.equal(state.visibility, 'public');
  assert.equal(state.gallery.summary, 'Six slow days');
  assert.ok(state.publishedAt);
});

test('a metadata-only publish keeps the previous gallery values', async () => {
  const doc = reset({
    visibility: 'public',
    publishedAt: new Date('2026-10-01T00:00:00.000Z'),
    gallery: { hideExactDates: false, summary: 'Kept', tags: ['kept'] },
  });

  const state = await setTripPublication('owner1', { tripId: 't1', published: true });

  assert.equal(doc.publishedAt.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.deepEqual(doc.gallery, { hideExactDates: false, summary: 'Kept', tags: ['kept'] });
  assert.equal(state.publishedAt, '2026-10-01T00:00:00.000Z');
});

test('publishing without a traveler handle is refused before any write', async () => {
  const doc = reset();
  currentUser = user(undefined);

  await assert.rejects(
    () => setTripPublication('owner1', { tripId: 't1', published: true }),
    /traveler handle/
  );
  assert.equal(doc.saved, 0);
  assert.equal(doc.visibility, 'private');
});

test('an agency trip can never be published', async () => {
  const doc = reset({ workspace: 'agency', agencyId: 'a1' });

  await assert.rejects(
    () => setTripPublication('owner1', { tripId: 't1', published: true }),
    /Agency trips cannot be published/
  );
  assert.equal(doc.saved, 0);
  assert.equal(doc.visibility, 'private');
});

test('a row carrying an agencyId is treated as agency content too', async () => {
  const doc = reset({ agencyId: 'a1' });
  await assert.rejects(
    () => setTripPublication('owner1', { tripId: 't1', published: true }),
    /Agency trips cannot be published/
  );
  assert.equal(doc.saved, 0);
});

test('only an owner may publish or unpublish', async () => {
  const doc = reset({ members: [{ userId: 'editor1', role: 'editor' }] });

  await assert.rejects(
    () => setTripPublication('editor1', { tripId: 't1', published: true }),
    /Only the trip owner/
  );
  assert.equal(doc.saved, 0);

  await assert.rejects(
    () => setTripPublication('editor1', { tripId: 't1', published: false }),
    /Only the trip owner/
  );
  assert.equal(doc.saved, 0);
});

test('a missing trip is a 404', async () => {
  currentTrip = null;
  await assert.rejects(
    () => setTripPublication('owner1', { tripId: 'gone', published: true }),
    /Trip not found/
  );
});

test('unpublishing with an active share link returns to unlisted', async () => {
  const doc = reset({
    visibility: 'public',
    publishedAt: new Date(),
    isPublic: true,
    shareId: 'abc123',
    gallery: { hideExactDates: false, summary: 'Saved', tags: ['saved'] },
  });

  const state = await setTripPublication('owner1', { tripId: 't1', published: false });

  assert.equal(doc.visibility, 'unlisted');
  assert.equal(doc.publishedAt, undefined);
  // The gallery metadata survives so re-publishing does not lose the copy.
  assert.deepEqual(doc.gallery, { hideExactDates: false, summary: 'Saved', tags: ['saved'] });
  assert.equal(state.publishedAt, null);
});

test('unpublishing without a share link returns to private', async () => {
  const doc = reset({ visibility: 'public', publishedAt: new Date() });

  await setTripPublication('owner1', { tripId: 't1', published: false });

  assert.equal(doc.visibility, 'private');
  assert.equal(doc.publishedAt, undefined);
});

test('gallery tags are normalized, deduped and bounded', () => {
  assert.deepEqual(normalizeGalleryTags(['  Hills ', '#hills', 'Slow Travel']), [
    'hills',
    'slow-travel',
  ]);
  assert.deepEqual(normalizeGalleryTags([]), []);
  assert.throws(() => normalizeGalleryTags('hills'), /must be a list/);
  assert.throws(() => normalizeGalleryTags(['a', 'b', 'c', 'd', 'e', 'f', 'g']), /6 tags or fewer/);
  assert.throws(() => normalizeGalleryTags(['x'.repeat(25)]), /24 characters/);
  assert.throws(() => normalizeGalleryTags(['bad!tag']), /letters, numbers/);
});

test('gallery summaries collapse whitespace and respect the cap', () => {
  assert.equal(normalizeGallerySummary('  six\n slow   days '), 'six slow days');
  assert.equal(normalizeGallerySummary(''), '');
  assert.throws(() => normalizeGallerySummary('x'.repeat(281)), /280 characters/);
});

test('isTripOwner matches the members[] role, never userId alone', () => {
  assert.equal(isTripOwner({ members: [{ userId: 'u1', role: 'owner' }] }, 'u1'), true);
  assert.equal(isTripOwner({ members: [{ userId: 'u1', role: 'editor' }] }, 'u1'), false);
  assert.equal(isTripOwner({ members: [] }, 'u1'), false);
  assert.equal(isTripOwner({}, 'u1'), false);
});
