import { apiRequest } from '@/api/client';
import type { SessionUser } from '@/api/auth';
import { setSessionToken } from '@/auth/tokenStorage';

interface UserResponse {
  success: true;
  user: SessionUser;
}

interface HandleResponse {
  success: true;
  handle: string;
  available: boolean;
  reason?: 'invalid' | 'reserved' | 'taken';
}

interface PasswordResponse {
  success: true;
  message?: string;
  token?: string;
}

export interface ProfileChanges {
  name?: string;
  handle?: string;
  bio?: string;
}

export interface HandleAvailability {
  handle: string;
  available: boolean;
  reason?: 'invalid' | 'reserved' | 'taken';
}

/** Sends only the fields that changed; an empty string clears the field. */
export async function updateProfile(changes: ProfileChanges): Promise<SessionUser> {
  const response = await apiRequest<UserResponse>('/auth/profile', {
    method: 'PATCH',
    body: changes,
  });
  return response.user;
}

export async function checkHandle(handle: string): Promise<HandleAvailability> {
  return apiRequest<HandleResponse>(
    `/auth/profile/handle-available?handle=${encodeURIComponent(handle)}`
  );
}

export interface AvatarPick {
  uri: string;
  name: string;
  type: string;
  /** The browser's File object; React Native sends the uri shape instead. */
  file?: Blob;
}

export async function uploadAvatar(pick: AvatarPick): Promise<SessionUser> {
  const body = new FormData();
  if (pick.file) {
    body.append('avatar', pick.file, pick.name);
  } else {
    body.append('avatar', {
      uri: pick.uri,
      name: pick.name,
      type: pick.type,
    } as unknown as Blob);
  }
  const response = await apiRequest<UserResponse>('/auth/avatar', { method: 'POST', body });
  return response.user;
}

export async function removeAvatar(): Promise<SessionUser> {
  const response = await apiRequest<UserResponse>('/auth/avatar', { method: 'DELETE' });
  return response.user;
}

/**
 * A password change bumps the account's token version, so the server hands this
 * device a fresh Bearer; storing it keeps the user signed in while every other
 * device is signed out on its next request.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<string | undefined> {
  const response = await apiRequest<PasswordResponse>('/auth/password', {
    method: 'POST',
    body: { currentPassword, newPassword },
    handleUnauthorized: false,
  });
  if (response.token) await setSessionToken(response.token);
  return response.message;
}
