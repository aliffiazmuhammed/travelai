import { createContext, useContext, useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

import type { User, AuthContextType } from '@/types';

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

  const signup = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
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
