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
import type {
  AgencyEnquirySummaryView,
  AgencyEventInterestSummary,
} from '@/types/agency';

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
  /** Leads that still need a person: the badge on the inbox nav item. */
  enquiryNeedsAttention: number;
  refreshEnquiryBadge: () => Promise<AgencyEnquirySummaryView | null>;
  /** Travellers waiting on a spot: the badge on the Events nav item. */
  eventNeedsAttention: number;
  refreshEventBadge: () => Promise<AgencyEventInterestSummary | null>;
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
  const [enquiryNeedsAttention, setEnquiryNeedsAttention] = useState(0);
  const [eventNeedsAttention, setEventNeedsAttention] = useState(0);

  /**
   * The inbox badge lives here, not in the layout, because reading a thread
   * clears an unread reply and the inbox is where that happens. One shared
   * count keeps the nav item and the inbox telling the same story.
   */
  const refreshEnquiryBadge = useCallback(async (): Promise<AgencyEnquirySummaryView | null> => {
    if (!isAuthenticated || !sessionAgencyId || mustChangePassword) {
      setEnquiryNeedsAttention(0);
      return null;
    }
    const result = await api.getAgencyEnquirySummary();
    setEnquiryNeedsAttention(result.summary.needsAttention);
    return result.summary;
  }, [isAuthenticated, mustChangePassword, sessionAgencyId]);

  /**
   * Same idea for the Events item: a stranger asking for a spot is a person
   * waiting on an answer, so the badge follows pending interests across every
   * event rather than the one roster someone happens to open. Deciding a row
   * refreshes it, so confirming from the desk clears the nudge immediately.
   */
  const refreshEventBadge = useCallback(async (): Promise<AgencyEventInterestSummary | null> => {
    if (!isAuthenticated || !sessionAgencyId || mustChangePassword) {
      setEventNeedsAttention(0);
      return null;
    }
    const result = await api.getAgencyEventSummary(sessionAgencyId);
    setEventNeedsAttention(result.summary.pending);
    return result.summary;
  }, [isAuthenticated, mustChangePassword, sessionAgencyId]);

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
      setEnquiryNeedsAttention(0);
      setEventNeedsAttention(0);
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
      enquiryNeedsAttention,
      refreshEnquiryBadge,
      eventNeedsAttention,
      refreshEventBadge,
      refreshAgencies,
      replaceAgency,
    }),
    [
      agency,
      loading,
      error,
      canManage,
      enquiryNeedsAttention,
      refreshEnquiryBadge,
      eventNeedsAttention,
      refreshEventBadge,
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
