import { getSessionToken } from '@/auth/tokenStorage';
import { API_URL } from '@/config';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface ApiEnvelope {
  success?: boolean;
  error?: string;
  message?: string;
}

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/** The session provider subscribes here so a rejected token lands on sign-in. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** Defaults to true; sign-in/sign-up run without a token. */
  auth?: boolean;
  /**
   * Defaults to true. Set false where a 401 is a form-level answer (a wrong
   * current password) rather than an expired session.
   */
  handleUnauthorized?: boolean;
  signal?: AbortSignal;
}

/**
 * Single entry point for the REST API: attaches the Bearer session, marks the
 * caller as the mobile client, and normalizes the `{ success, error }` envelope.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, auth = true, handleUnauthorized = true, signal } =
    options;
  const token = auth ? await getSessionToken() : null;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        'X-Client': 'mobile',
        ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body === undefined
        ? {}
        : { body: isForm ? (body as FormData) : JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as (T & ApiEnvelope) | null;
  if (!response.ok || payload === null || payload.success === false) {
    if (response.status === 401 && token && handleUnauthorized) unauthorizedHandler?.();
    const message =
      payload?.error || payload?.message || `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return payload;
}
