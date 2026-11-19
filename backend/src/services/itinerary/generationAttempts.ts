import Trip from '../../models/Trip.js';

/**
 * Idempotency lookups for streaming generation (C-03).
 *
 * They live in a service rather than the controller to keep the structural
 * invariant that controllers never resolve trips themselves — the router's
 * authorization choke point owns trip lookups.
 */

export async function findTripByGenerationAttempt(
  userId: string | undefined,
  attemptId: string
) {
  // Fail closed rather than letting an absent id widen the query to everyone.
  if (!userId) return null;
  return Trip.findOne({ userId, generationAttemptId: attemptId });
}

/**
 * Removes a trip that was written while the traveller was cancelling. The UI
 * promises "nothing is saved", so a write that lost the race must not linger.
 */
export async function discardGenerationAttemptTrip(tripId: unknown): Promise<void> {
  await Trip.deleteOne({ _id: tripId });
}
