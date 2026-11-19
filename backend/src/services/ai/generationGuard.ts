/**
 * Cancellation guards shared by the streaming generation path (C-03).
 *
 * "Stop generating" must mean the server stops working and saves nothing, so
 * the abort signal is threaded from the HTTP request all the way into the AI
 * SDK call. These helpers keep the provider-specific error shapes (an
 * `AbortError` from the platform fetch, a Groq `APIUserAbortError`, or our own
 * sentinel) behind one predicate.
 */

export class GenerationAbortedError extends Error {
  constructor(message = 'Generation was cancelled before completion.') {
    super(message);
    this.name = 'GenerationAbortedError';
  }
}

/** True when `error` represents a cancelled stream rather than a real failure. */
export function isAbortError(error: unknown): boolean {
  if (error instanceof GenerationAbortedError) return true;
  if (!error || typeof error !== 'object') return false;

  const candidate = error as { name?: unknown; code?: unknown };
  return candidate.name === 'AbortError' || candidate.code === 'ABORT_ERR';
}

/** Throws before starting or between stream chunks once the caller cancelled. */
export function throwIfAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) {
    throw new GenerationAbortedError();
  }
}

/**
 * The single rule for persisting a generated trip: only when the request is
 * still alive and the client has not cancelled. A disconnected response must
 * never leave a trip behind that the user was told was discarded.
 */
export function shouldPersistGeneration(options: {
  aborted: boolean;
  clientGone: boolean;
}): boolean {
  return !options.aborted && !options.clientGone;
}
