/**
 * Strips fields from a Trip document before it is sent to the client, based on
 * the caller's role (`docs/roadmap-milestone-6-collaboration.md` §3.2/F6).
 *
 * `versions` is `select: false` in the schema but is present on documents
 * loaded with `.select('+versions')`, so it must always be removed.
 *
 * Privacy rules (why each removal exists):
 * - `shareId`/`isPublic` — knowing the share id is what it takes to re-share a
 *   private trip, so only the owner may see it (F6);
 * - member emails — the members list only ever carries ids + roles, but a
 *   defensively dropped field list documents the intent;
 * - `generationMeta` contains AI cost/quality data that is owner-facing
 *   (F17); other roles get it stripped.
 */
export function sanitizeTrip(trip: any): Record<string, any> {
  const obj = typeof trip?.toObject === 'function' ? trip.toObject() : { ...trip };
  delete obj.versions;
  return obj;
}

/** Fields that only the trip owner may see. */
const OWNER_ONLY_FIELDS = ['shareId', 'isPublic', 'generationMeta'];

/**
 * Role-aware sanitizer. Behaviour is identical to `sanitizeTrip` for owners,
 * so existing owner flows are unchanged. `members[]` user ids are visible to
 * every member (needed to render "who is on this trip"), but a non-owner's
 * view never carries the share link, its flag or AI metadata.
 */
export function sanitizeTripFor(trip: any, role?: string | null): Record<string, any> {
  const obj = sanitizeTrip(trip);
  if (role === 'owner' || role == null) return obj;

  for (const field of OWNER_ONLY_FIELDS) {
    delete obj[field];
  }
  return obj;
}
