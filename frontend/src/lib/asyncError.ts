import { ApiError } from "@/services/api";

/**
 * C-05: one reading of a failed request for every list surface. Pages render
 * the panel instead of guessing from a toast, and never fall through to their
 * empty state while an error is live.
 */
export type AsyncErrorKind = "auth" | "forbidden" | "server" | "offline" | "unknown";

export interface AsyncErrorCopy {
  kind: AsyncErrorKind;
  /** Forbidden is terminal — retrying cannot change the answer. */
  forbidden: boolean;
  title: string;
  description: string;
}

const OFFLINE = /unable to connect|failed to fetch|network|timed? ?out/i;

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function describeAsyncError(
  error: unknown,
  subject = "this page"
): AsyncErrorCopy {
  const status = error instanceof ApiError ? error.status : undefined;
  const message = error instanceof Error ? error.message : "";

  if (status === 401) {
    return {
      kind: "auth",
      forbidden: false,
      title: "Your session has ended",
      description: `Sign in again to load ${subject}.`,
    };
  }

  if (status === 403) {
    return {
      kind: "forbidden",
      forbidden: true,
      title: "You don't have access to this",
      description: `Ask an owner or administrator for access to ${subject}. Retrying won't change this.`,
    };
  }

  if (typeof status === "number" && status >= 500) {
    return {
      kind: "server",
      forbidden: false,
      title: "The server could not finish that request",
      description: `${sentence(subject)} could not be loaded. Try again in a moment.`,
    };
  }

  if (!status || status === 0 || OFFLINE.test(message)) {
    return {
      kind: "offline",
      forbidden: false,
      title: "We couldn't reach the server",
      description: `Check your connection, then try loading ${subject} again.`,
    };
  }

  return {
    kind: "unknown",
    forbidden: false,
    title: "Something went wrong",
    description: message || `${sentence(subject)} could not be loaded. Try again.`,
  };
}
