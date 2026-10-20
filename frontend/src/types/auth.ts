export interface User {
  _id: string;
  email: string;
  /** F14 display name; absent means the email local part is shown. */
  name?: string;
  /** F14 managed profile-photo URL (Cloudinary CDN or `/uploads/avatar-*`). */
  avatarUrl?: string;
  /** The label other members see (server-computed: name, else email local part). */
  label?: string;
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
  /** F14: save (or clear, with an empty string) the display name. */
  updateProfile: (name: string) => Promise<void>;
  /** F14: upload a new profile photo (image files only, capped server-side). */
  uploadAvatar: (file: File) => Promise<void>;
  /** F14: remove the photo and fall back to initials. */
  removeAvatar: () => Promise<void>;
  /** F14: change the password (current + new); keeps this session signed in. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}
