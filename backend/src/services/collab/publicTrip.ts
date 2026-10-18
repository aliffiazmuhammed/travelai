import Trip from '../../models/Trip.js';

/**
 * Public share access (Milestone 6 E1). Centralizes the one lookup that is
 * intentionally NOT authorization-gated: a shared trip must be explicitly
 * `isPublic` and not soft-deleted. No `userId`/membership involvement — callers
 * are anonymous.
 *
 * Revoking a share flips `isPublic` to false (flaw F7 handling lands in E5 with
 * a proper `shareRevokedAt`/rotation), which immediately makes this return
 * null.
 */
export async function findPublicSharedTrip(shareId: string): Promise<any | null> {
  if (!shareId || typeof shareId !== 'string') return null;
  return Trip.findOne({
    shareId,
    isPublic: true,
    isDeleted: { $ne: true },
  });
}
