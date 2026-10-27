export interface User {
  _id: string;
  email: string;
  /** F14 display name; absent means the email local part is shown. */
  name?: string;
  /** F14 managed profile-photo URL (Cloudinary CDN or `/uploads/avatar-*`). */
  avatarUrl?: string;
  /** The label other members see (server-computed: name, else email local part). */
  label?: string;
  /** Public traveler handle (Milestone 8); absent until one is claimed. */
  handle?: string;
  /** Public bio shown on `/travelers/:handle` (Milestone 8). */
  bio?: string;
}

/** Fields the personal profile form may save; omitted keys are untouched. */
export interface ProfileUpdateInput {
  name?: string;
  handle?: string;
  bio?: string;
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  signup: (email: string, password: string) => Promise<void>;
  signin: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  /** F14: re-reads `/auth/me` (e.g. after a profile edit on another device). */
  refreshUser: () => Promise<void>;
  /** F14 + M8: save name, handle and/or bio (empty strings clear a field). */
  updateProfile: (input: ProfileUpdateInput) => Promise<void>;
  /** F14: upload a new profile photo (image files only, capped server-side). */
  uploadAvatar: (file: File) => Promise<void>;
  /** F14: remove the photo and fall back to initials. */
  removeAvatar: () => Promise<void>;
  /** F14: change the password (current + new); keeps this session signed in. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}
