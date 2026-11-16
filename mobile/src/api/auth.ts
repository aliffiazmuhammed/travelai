import { apiRequest } from '@/api/client';
import { clearSessionToken, setSessionToken } from '@/auth/tokenStorage';

/** Mirrors `PublicUser` from backend/src/services/user/profile.ts. */
export interface SessionUser {
  _id: string;
  email: string;
  label: string;
  name?: string;
  avatarUrl?: string;
  handle?: string;
  bio?: string;
  createdAt?: string;
}

interface AuthResponse {
  success: true;
  user: SessionUser;
  token?: string;
}

interface MeResponse {
  success: true;
  user: SessionUser;
}

async function startSession(response: AuthResponse): Promise<SessionUser> {
  if (!response.token) {
    throw new Error('The server did not return a mobile session token.');
  }
  await setSessionToken(response.token);
  return response.user;
}

export async function signin(email: string, password: string): Promise<SessionUser> {
  const response = await apiRequest<AuthResponse>('/auth/signin', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
  return startSession(response);
}

export async function signup(
  email: string,
  password: string,
  name?: string
): Promise<SessionUser> {
  const response = await apiRequest<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: { email, password, ...(name ? { name } : {}) },
    auth: false,
  });
  return startSession(response);
}

export function getMe(): Promise<SessionUser> {
  return apiRequest<MeResponse>('/auth/me').then((response) => response.user);
}

/**
 * The Bearer session is stateless, so signing out only needs to drop the
 * stored token — there is no server-side session to revoke (same as the web
 * cookie contract).
 */
export function signOut(): Promise<void> {
  return clearSessionToken();
}
