import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api } from '@/services/api';
import { useAgencyAuth } from '@/context/AgencyAuthContext';
import type { Agency } from '@/types';

/**
 * Tenant context for the `/agency` shell (PA0).
 *
 * An agency account belongs to exactly one tenant, so this context holds one
 * agency. There is no switcher, no `travelai.agencyId` localStorage state, and
 * no way to load a different tenant: the session's `agencyId` is the only
 * tenant this shell can read.
 *
 * The auth session carries the tenant id, name, slug and role; the full agency
 * projection (branding, terms, member count) is loaded from the tenant-scoped
 * `GET /api/agency/:agencyId` route, which re-checks membership server-side.
 */
interface AgencyContextValue {
  agencies: Agency[];
  activeAgency: Agency | null;
  activeAgencyId: string | null;
  loading: boolean;
  error: string | null;
  canManage: boolean;
  refreshAgencies: () => Promise<Agency[]>;
  replaceAgency: (agency: Agency) => void;
}

const AgencyContext = createContext<AgencyContextValue | undefined>(undefined);

export const AgencyProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const {
    agency: sessionAgency,
    isAuthenticated,
    loading: authLoading,
    mustChangePassword,
  } = useAgencyAuth();

  const sessionAgencyId = sessionAgency?._id ?? null;

  const [agency, setAgency] = useState<Agency | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshAgencies = useCallback(async (): Promise<Agency[]> => {
    if (!sessionAgencyId) {
      setAgency(null);
      setLoading(false);
      return [];
    }

    setLoading(true);
    setError(null);
    try {
      const result = await api.getAgency(sessionAgencyId);
      setAgency(result.agency);
      return [result.agency];
    } catch (err) {
      setAgency(null);
      setError(
        err instanceof Error
          ? err.message
          : 'We could not load your agency workspace.'
      );
      return [];
    } finally {
      setLoading(false);
    }
  }, [sessionAgencyId]);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }
    // A temporary password must be replaced before the tenant API is reachable
    // (the server answers 403 PASSWORD_CHANGE_REQUIRED), so do not probe it.
    if (!isAuthenticated || !sessionAgencyId || mustChangePassword) {
      setAgency(null);
      setError(null);
      setLoading(false);
      return;
    }
    void refreshAgencies();
  }, [authLoading, isAuthenticated, sessionAgencyId, mustChangePassword, refreshAgencies]);

  const replaceAgency = useCallback((next: Agency) => {
    setAgency((current) => (current && current._id === next._id ? next : current));
  }, []);

  const canManage =
    agency?.role === 'owner' || agency?.role === 'admin';

  const value = useMemo<AgencyContextValue>(
    () => ({
      agencies: agency ? [agency] : [],
      activeAgency: agency,
      activeAgencyId: agency?._id ?? null,
      loading,
      error,
      canManage,
      refreshAgencies,
      replaceAgency,
    }),
    [agency, loading, error, canManage, refreshAgencies, replaceAgency]
  );

  return <AgencyContext.Provider value={value}>{children}</AgencyContext.Provider>;
};

export function useAgency(): AgencyContextValue {
  const context = useContext(AgencyContext);
  if (!context) {
    throw new Error('useAgency must be used inside an AgencyProvider');
  }
  return context;
}
