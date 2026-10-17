/**
 * Strips heavy/private internal fields from a Trip document before it is sent
 * to the client. `versions` is `select: false` in the schema but is present on
 * documents loaded with `.select('+versions')`, so it must always be removed.
 */
export function sanitizeTrip(trip: any): Record<string, any> {
  const obj = typeof trip?.toObject === 'function' ? trip.toObject() : { ...trip };
  delete obj.versions;
  return obj;
}
