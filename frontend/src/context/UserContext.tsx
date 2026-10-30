import { createContext, useContext, useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { queryClient } from '../lib/queryClient';
import { api } from '../services/api';

import type { User, AuthContextType, ProfileUpdateInput } from '@/types';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function extractErrorMessage(data: any, status: number): string {
  if (data?.details && Array.isArray(data.details) && data.details.length > 0) {
    return data.details[0];
  }
  if (data?.error && typeof data.error === 'string') {
    return data.error;
  }
  if (data?.message && typeof data.message === 'string') {
    return data.message;
  }
  if (status === 409 || (data?.error && typeof data.error === 'string' && data.error.toLowerCase().includes('already exists'))) {
    return 'An account with this email already exists. Please sign in instead.';
  }
  if (status === 401) {
    return 'Incorrect email or password. Please check your credentials and try again.';
  }
  if (status === 429) {
    return 'Too many attempts. Please try again after a few minutes.';
  }
  if (status >= 500) {
    return 'Our servers are experiencing high demand. Please try again in a few moments.';
  }
  return 'Something went wrong. Please check your connection and try again.';
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => setError(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      }
    } catch (err) {
      console.warn("Session check inactive:", err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * F14: re-reads the session's own profile. Used after a profile edit so every
   * `useAuth()` consumer (navbar chip, chat composer) sees the new name/photo
   * without a reload.
   */
  const refreshUser = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      }
    } catch (err) {
      console.warn("Profile refresh inactive:", err);
    }
  };

  const updateProfile = async (input: ProfileUpdateInput) => {
    const data = await api.updateProfile(input);
    setUser(data.user);
  };

  const uploadAvatar = async (file: File) => {
    const data = await api.uploadAvatar(file);
    setUser(data.user);
  };

  const removeAvatar = async () => {
    const data = await api.removeAvatar();
    setUser(data.user);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await api.changePassword(currentPassword, newPassword);
  };

  const signup = async (email: string, password: string, name?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          ...(name?.trim() ? { name: name.trim() } : {}),
        }),
        credentials: 'include',
      });

      let data: any = {};
      try {
        data = await response.json();
      } catch {
        // Fallback for non-JSON
      }

      if (!response.ok) {
        const errorMsg = extractErrorMessage(data, response.status);
        throw new Error(errorMsg);
      }
      // Identity change → drop any cached trips of the previous session (F21).
      queryClient.clear();
      setUser(data.user);
    } catch (err: any) {
      const friendlyMsg = err.message || 'Unable to create account. Please try again.';
      setError(friendlyMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signin = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        credentials: 'include',
      });

      let data: any = {};
      try {
        data = await response.json();
      } catch {
        // Fallback for non-JSON
      }

      if (!response.ok) {
        const errorMsg = extractErrorMessage(data, response.status);
        throw new Error(errorMsg);
      }
      // Identity change → drop any cached trips of the previous session (F21).
      queryClient.clear();
      setUser(data.user);
    } catch (err: any) {
      const friendlyMsg = err.message || 'Unable to sign in. Please try again.';
      setError(friendlyMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    setError(null);
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      // F21: a signed-out app must not keep the user's trips in memory.
      queryClient.clear();
      setUser(null);
    } catch (err: any) {
      setError(err.message || 'Logout failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        error,
        signup,
        signin,
        logout,
        clearError,
        refreshUser,
        updateProfile,
        uploadAvatar,
        removeAvatar,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
