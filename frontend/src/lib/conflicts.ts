import { toast } from 'sonner';
import { ApiError } from '@/services/api';

/**
 * Milestone 6 §3.6 — 409 REV_CONFLICT UX: optimistic rollback happens at the
 * call site; this shards the "someone else changed the trip" experience into
 * one place. Every consumer offers the same medicines: reload the trip, or
 * browse version history to see what the other person did.
 */
export function isRevConflict(err: unknown): err is ApiError {
  return err instanceof ApiError && err.code === 'REV_CONFLICT';
}

export function toastConflict(err: unknown, reload: () => void | Promise<void>): void {
  toast.warning(
    err instanceof Error ? err.message : 'This trip changed while you were working.',
    {
      action: {
        label: 'Reload latest',
        onClick: () => {
          void reload();
        },
      },
      duration: 12000,
    }
  );
}
