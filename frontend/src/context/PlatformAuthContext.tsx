import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, ApiError } from '@/services/api';
import type { PlatformSessionUser } from '@/types';

/**
 * PA1 platform realm session.
 *
 * Deliberately separate from `UserContext` and `AgencyAuthContext`: the
 * `platform_token` cookie is independent, and signing into `/admin` must never
 * touch a personal or agency session.
 */

interface PlatformAuthContextValue {
  user: PlatformSessionUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  /** A bootstrapped admin must replace their temporary password first. */
  mustChangePassword: boolean;
  signin: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const PlatformAuthContext = createContext<PlatformAuthContextValue | undefined>(
  undefined
);

export const PlatformAuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<PlatformSessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const session = await api.getPlatformMe();
      setUser(session.user);
    } catch (error) {
      // No platform session is the normal signed-out state. A 404 here means
      // the flag is off; the page-level gate renders that separately.
      if (!(error instanceof ApiError) || ![401, 404].includes(error.status)) {
        console.warn('Platform session check failed:', error);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signin = useCallback(async (email: string, password: string) => {
    const session = await api.signinPlatform(email, password);
    setUser(session.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logoutPlatform();
    } catch (error) {
      // The cookie may already be gone or the flag may have been turned off;
      // clear local state regardless so the operator is never stuck.
      console.warn('Platform logout failed:', error);
    } finally {
      setUser(null);
    }
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await api.changePlatformPassword(currentPassword, newPassword);
      // The server reissues the platform cookie and clears `mustChangePassword`.
      await refresh();
    },
    [refresh]
  );

  const value = useMemo<PlatformAuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      loading,
      mustChangePassword: user?.mustChangePassword === true,
      signin,
      logout,
      refresh,
      changePassword,
    }),
    [user, loading, signin, logout, refresh, changePassword]
  );

  return (
    <PlatformAuthContext.Provider value={value}>
      {children}
    </PlatformAuthContext.Provider>
  );
};

export function usePlatformAuth(): PlatformAuthContextValue {
  const context = useContext(PlatformAuthContext);
  if (!context) {
    throw new Error('usePlatformAuth must be used inside a PlatformAuthProvider');
  }
  return context;
}
