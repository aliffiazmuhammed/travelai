import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api } from '@/services/api';
import { useAuth } from '@/context/UserContext';
import type { Agency } from '@/types';

const ACTIVE_AGENCY_KEY = 'travelai.agencyId';

interface AgencyContextValue {
  agencies: Agency[];
  activeAgency: Agency | null;
  activeAgencyId: string | null;
  loading: boolean;
  error: string | null;
  canManage: boolean;
  setActiveAgency: (id: string) => void;
  refreshAgencies: (preferredId?: string) => Promise<Agency[]>;
  replaceAgency: (agency: Agency) => void;
}

const AgencyContext = createContext<AgencyContextValue | undefined>(undefined);

function readStoredAgencyId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_AGENCY_KEY);
  } catch {
    return null;
  }
}

/**
 * Tenant context for the `/agency` shell. The active agency id is deliberately
 * client-side state only; every server call still carries the id in the path
 * and is re-authorized by the agency guard.
 */
export const AgencyProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isAuthenticated } = useAuth();
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [activeAgencyId, setActiveAgencyId] = useState<string | null>(
    readStoredAgencyId
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshAgencies = useCallback(
    async (preferredId?: string): Promise<Agency[]> => {
      setLoading(true);
      setError(null);
      try {
        const result = await api.getAgencies();
        const list = result.agencies ?? [];
        setAgencies(list);
        setActiveAgencyId((current) => {
          const wanted = preferredId ?? current;
          if (wanted && list.some((agency) => agency._id === wanted)) {
            return wanted;
          }
          return list[0]?._id ?? null;
        });
        return list;
      } catch (err) {
        setAgencies([]);
        setError(
          err instanceof Error
            ? err.message
            : 'We could not load your agency workspace.'
        );
        return [];
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setAgencies([]);
      setActiveAgencyId(null);
      setLoading(false);
      return;
    }
    void refreshAgencies();
  }, [isAuthenticated, refreshAgencies]);

  useEffect(() => {
    try {
      if (activeAgencyId) {
        localStorage.setItem(ACTIVE_AGENCY_KEY, activeAgencyId);
      } else {
        localStorage.removeItem(ACTIVE_AGENCY_KEY);
      }
    } catch {
      /* localStorage can be unavailable in private modes */
    }
  }, [activeAgencyId]);

  const activeAgency = useMemo(
    () => agencies.find((agency) => agency._id === activeAgencyId) ?? null,
    [agencies, activeAgencyId]
  );

  const setActiveAgency = useCallback((id: string) => {
    setActiveAgencyId(id);
  }, []);

  const replaceAgency = useCallback((agency: Agency) => {
    setAgencies((current) =>
      current.map((entry) => (entry._id === agency._id ? agency : entry))
    );
  }, []);

  const canManage =
    activeAgency?.role === 'owner' || activeAgency?.role === 'admin';

  const value = useMemo<AgencyContextValue>(
    () => ({
      agencies,
      activeAgency,
      activeAgencyId,
      loading,
      error,
      canManage,
      setActiveAgency,
      refreshAgencies,
      replaceAgency,
    }),
    [
      agencies,
      activeAgency,
      activeAgencyId,
      loading,
      error,
      canManage,
      setActiveAgency,
      refreshAgencies,
      replaceAgency,
    ]
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
