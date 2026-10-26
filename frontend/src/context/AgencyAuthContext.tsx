import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, ApiError } from '@/services/api';
import type {
  AgencyAuthSession,
  AgencySessionAgency,
  AgencySessionUser,
} from '@/types';

/**
 * PA0 agency realm session.
 *
 * This is deliberately separate from `UserContext`: the personal session stays
 * untouched when someone signs into an agency workspace, and the two cookies
 * (`token` vs `agency_token`) are independent. Nothing here ever writes the
 * personal auth state.
 */

interface AgencyAuthContextValue {
  user: AgencySessionUser | null;
  agency: AgencySessionAgency | null;
  isAuthenticated: boolean;
  loading: boolean;
  /** A provisioned owner must replace their temporary password first. */
  mustChangePassword: boolean;
  signin: (workspace: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Applies a session returned by signin or invite activation. */
  applySession: (session: AgencyAuthSession) => void;
  updateProfile: (name: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AgencyAuthContext = createContext<AgencyAuthContextValue | undefined>(
  undefined
);

export const AgencyAuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AgencySessionUser | null>(null);
  const [agency, setAgency] = useState<AgencySessionAgency | null>(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((session: AgencyAuthSession) => {
    setUser(session.user);
    setAgency(session.agency);
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setAgency(null);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const session = await api.getAgencyMe();
      applySession(session);
    } catch (error) {
      // A missing/expired agency session is the normal signed-out state. Any
      // other failure still leaves the shell signed out rather than guessing.
      if (!(error instanceof ApiError) || error.status !== 401) {
        console.warn('Agency session check failed:', error);
      }
      clearSession();
    } finally {
      setLoading(false);
    }
  }, [applySession, clearSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signin = useCallback(
    async (workspace: string, email: string, password: string) => {
      const session = await api.signinAgency(workspace, email, password);
      applySession(session);
    },
    [applySession]
  );

  const logout = useCallback(async () => {
    try {
      await api.logoutAgency();
    } catch (error) {
      // The cookie may already be gone or the network failed; the UI still
      // signs out locally so the user is never stuck in a stale shell.
      console.warn('Agency logout failed:', error);
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const updateProfile = useCallback(
    async (name: string) => {
      const session = await api.updateAgencyProfile(name);
      applySession(session);
    },
    [applySession]
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await api.changeAgencyPassword(currentPassword, newPassword);
      // The server reissues the agency cookie and clears `mustChangePassword`.
      await refresh();
    },
    [refresh]
  );

  const value = useMemo<AgencyAuthContextValue>(
    () => ({
      user,
      agency,
      isAuthenticated: Boolean(user && agency),
      loading,
      mustChangePassword: user?.mustChangePassword === true,
      signin,
      logout,
      refresh,
      applySession,
      updateProfile,
      changePassword,
    }),
    [
      user,
      agency,
      loading,
      signin,
      logout,
      refresh,
      applySession,
      updateProfile,
      changePassword,
    ]
  );

  return (
    <AgencyAuthContext.Provider value={value}>
      {children}
    </AgencyAuthContext.Provider>
  );
};

export function useAgencyAuth(): AgencyAuthContextValue {
  const context = useContext(AgencyAuthContext);
  if (!context) {
    throw new Error('useAgencyAuth must be used inside an AgencyAuthProvider');
  }
  return context;
}
