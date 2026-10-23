import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Building2,
  CalendarPlus,
  FileText,
  Link2,
  Loader2,
  Map as MapIcon,
  PlusCircle,
  Receipt,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import ItineraryDisplay from '@/components/ItineraryDisplay';
import AgencyExportPanel from '@/components/agency/AgencyExportPanel';
import AgencyQuotePanel from '@/components/agency/AgencyQuotePanel';
import { MyTripsView } from '@/components/dashboard/MyTripsView';
import { useAgency } from '@/context/AgencyContext';
import { useAuth } from '@/context/UserContext';
import { useTripAccess } from '@/hooks/useTripAccess';
import { agencyRoleBadgeClass, agencyRoleLabel } from '@/lib/agency';
import { isRevConflict, toastConflict } from '@/lib/conflicts';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';
import type {
  AgencyMember,
  ItineraryData,
  Trip,
  TripFeedback,
} from '@/types';
import { toast } from 'sonner';

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

/**
 * Agency trip library (A2).
 *
 * The personal Dashboard and this page intentionally share the presentation
 * components (`MyTripsView`, `ItineraryDisplay`) but not their data source.
 * Every call here is tenant-scoped; the server resolves the caller's agency
 * role and hides client-only projections.
 */
const AgencyTrips: React.FC = () => {
  const navigate = useNavigate();
  const { tripId } = useParams<{ tripId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { activeAgency, activeAgencyId, canManage } = useAgency();

  const tabParam = searchParams.get('tab');
  const activeTab: 'itinerary' | 'quote' | 'export' =
    tabParam === 'quote' ? 'quote' : tabParam === 'export' ? 'export' : 'itinerary';
  const [quoteTabOpened, setQuoteTabOpened] = useState(activeTab === 'quote');
  const [exportTabOpened, setExportTabOpened] = useState(
    activeTab === 'export'
  );

  useEffect(() => {
    if (activeTab === 'quote') setQuoteTabOpened(true);
    if (activeTab === 'export') setExportTabOpened(true);
  }, [activeTab]);

  const switchTab = (next: 'itinerary' | 'quote' | 'export') => {
    if (next === 'quote') setQuoteTabOpened(true);
    if (next === 'export') setExportTabOpened(true);
    const params = new URLSearchParams(searchParams);
    if (next === 'itinerary') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  const [trips, setTrips] = useState<Trip[]>([]);
  const [deletedTrips, setDeletedTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [assignees, setAssignees] = useState<AgencyMember[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [blankOpen, setBlankOpen] = useState(false);
  const [blankTitle, setBlankTitle] = useState('');
  const [blankStart, setBlankStart] = useState('');
  const [blankEnd, setBlankEnd] = useState('');
  const [creatingBlank, setCreatingBlank] = useState(false);
  const listRequestRef = useRef(0);

  const role = activeAgency?.role;
  const canPlan = role === 'owner' || role === 'admin' || role === 'planner';
  const canAssign = canPlan;

  const loadTrips = useCallback(
    async (showSpinner = true) => {
      if (!activeAgencyId) return;
      const requestId = ++listRequestRef.current;
      try {
        if (showSpinner) setLoading(true);
        const result = await api.getAgencyTrips(activeAgencyId, {
          search: debouncedSearch.trim() || undefined,
          status: statusFilter,
        });
        if (requestId === listRequestRef.current) {
          setTrips(result.trips || []);
        }
      } catch (err) {
        console.error('Failed to load agency trips:', err);
        if (showSpinner && requestId === listRequestRef.current) {
          toast.error(errorMessage(err, 'Could not load the agency trip library.'));
        }
      } finally {
        if (showSpinner && requestId === listRequestRef.current) {
          setLoading(false);
        }
      }
    },
    [activeAgencyId, debouncedSearch, statusFilter]
  );

  const loadDeletedTrips = useCallback(async () => {
    if (!activeAgencyId || !canManage) {
      setDeletedTrips([]);
      return;
    }
    try {
      const result = await api.getAgencyDeletedTrips(activeAgencyId);
      setDeletedTrips(result.trips || []);
    } catch (err) {
      // Trash is additive; a failure must not hide the live library.
      console.error('Failed to load agency trash:', err);
    }
  }, [activeAgencyId, canManage]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setTrips([]);
    setDeletedTrips([]);
    if (!activeAgencyId) {
      setLoading(false);
      return;
    }
    void loadDeletedTrips();
  }, [activeAgencyId, loadDeletedTrips]);

  useEffect(() => {
    if (!activeAgencyId) {
      setLoading(false);
      return;
    }
    void loadTrips(true);
  }, [activeAgencyId, loadTrips]);

  // Deep link: the route param owns the open trip, so a generated or shared
  // link can always reproduce the same detail view.
  useEffect(() => {
    if (!activeAgencyId || !tripId) {
      setSelectedTrip(null);
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setSelectedTrip(null);
    setDetailLoading(true);
    void (async () => {
      try {
        const full = await api.getAgencyTrip(activeAgencyId, tripId);
        if (!cancelled) setSelectedTrip(full);
      } catch (err) {
        if (!cancelled) {
          toast.error(errorMessage(err, 'Could not open this trip.'));
          navigate('/agency/trips', { replace: true });
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeAgencyId, tripId, navigate]);

  // A quiet refresh keeps the library fresh without flashing the skeleton.
  useEffect(() => {
    if (!activeAgencyId) return;
    const refresh = () => {
      void loadTrips(false);
      void loadDeletedTrips();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    const interval = setInterval(refresh, 20000);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, [activeAgencyId, loadTrips, loadDeletedTrips]);

  // Assignment labels come from the agency roster, not a client-side name map.
  const selectedTripId = selectedTrip?._id;
  useEffect(() => {
    if (!activeAgencyId || !selectedTripId || !canAssign) return;
    void api
      .getAgencyMembers(activeAgencyId)
      .then((result) => setAssignees(result.members || []))
      .catch(() => {
        /* the trip still opens; only the picker is unavailable */
      });
  }, [activeAgencyId, selectedTripId, canAssign]);

  const access = useTripAccess(selectedTrip, user?._id);
  const assigneeLabel = useMemo(() => {
    if (!selectedTrip?.assignedTo) return 'Unassigned';
    const match = assignees.find(
      (member) => member.userId === selectedTrip.assignedTo
    );
    return match?.label || match?.email || 'Agency team member';
  }, [assignees, selectedTrip?.assignedTo]);

  const handleSelectTrip = (trip: Trip) => {
    navigate(`/agency/trips/${trip._id}`);
  };

  const handleCreateBlankTrip = async () => {
    if (!activeAgencyId) return;
    try {
      setCreatingBlank(true);
      const result = await api.createAgencyTrip(activeAgencyId, {
        title: blankTitle.trim() || 'Untitled agency trip',
        startDate: blankStart || undefined,
        endDate: blankEnd || undefined,
      });
      setBlankOpen(false);
      setBlankTitle('');
      setBlankStart('');
      setBlankEnd('');
      setTrips((prev) => [result.trip, ...prev]);
      navigate(`/agency/trips/${result.trip._id}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not create the blank trip.'));
    } finally {
      setCreatingBlank(false);
    }
  };

  const handleDuplicateTrip = async (tripId: string) => {
    try {
      const duplicated = await api.duplicateTrip(tripId);
      setTrips((prev) => [duplicated, ...prev]);
      toast.success('Agency trip duplicated as a new draft.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not duplicate this trip.'));
    }
  };

  const handleDeleteTrip = async (tripIdToDelete: string) => {
    if (!activeAgencyId) return;
    try {
      await api.deleteAgencyTrip(activeAgencyId, tripIdToDelete);
      const removed = trips.find((trip) => trip._id === tripIdToDelete);
      setTrips((prev) => prev.filter((trip) => trip._id !== tripIdToDelete));
      if (removed) {
        setDeletedTrips((prev) => [
          {
            ...removed,
            isDeleted: true,
            deletedAt: new Date().toISOString(),
            shareId: undefined,
            isPublic: false,
          },
          ...prev.filter((trip) => trip._id !== tripIdToDelete),
        ]);
      } else {
        void loadDeletedTrips();
      }
      if (tripId === tripIdToDelete) {
        navigate('/agency/trips', { replace: true });
      }
      toast.success('Trip moved to the agency trash.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete this trip.'));
      throw err;
    }
  };

  const handleRestoreTrip = async (tripIdToRestore: string) => {
    if (!activeAgencyId) return;
    try {
      const restored = await api.restoreAgencyTrip(activeAgencyId, tripIdToRestore);
      setDeletedTrips((prev) => prev.filter((trip) => trip._id !== tripIdToRestore));
      setTrips((prev) => [
        restored,
        ...prev.filter((trip) => trip._id !== tripIdToRestore),
      ]);
      toast.success('Trip restored to the agency library.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not restore this trip.'));
      throw err;
    }
  };

  const handlePurgeTrip = async (tripIdToPurge: string) => {
    if (!activeAgencyId) return;
    try {
      await api.purgeAgencyTrip(activeAgencyId, tripIdToPurge);
      setDeletedTrips((prev) => prev.filter((trip) => trip._id !== tripIdToPurge));
      toast.success('Trip permanently deleted.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not permanently delete this trip.'));
      throw err;
    }
  };

  const handleStatusChange = async (
    newStatus: 'draft' | 'planned' | 'ongoing' | 'completed'
  ) => {
    if (!selectedTrip) return;
    try {
      const updated = await api.updateTrip(selectedTrip._id, { status: newStatus });
      setSelectedTrip(updated);
      setTrips((prev) =>
        prev.map((trip) => (trip._id === updated._id ? updated : trip))
      );
      toast.success(`Trip status updated to "${newStatus}".`);
    } catch (err) {
      if (isRevConflict(err)) {
        toastConflict(err, () => void reloadSelectedTrip());
      } else {
        toast.error(errorMessage(err, 'Could not update the trip status.'));
      }
    }
  };

  const handleSaveTrip = async (updatedDetails: ItineraryData) => {
    if (!selectedTrip) return;
    try {
      setIsSaving(true);
      const updated = await api.saveTripItinerary(
        selectedTrip._id,
        updatedDetails
      );
      setSelectedTrip(updated);
      setTrips((prev) =>
        prev.map((trip) => (trip._id === updated._id ? updated : trip))
      );
      toast.success('Changes saved to the agency trip.');
    } catch (err) {
      if (isRevConflict(err)) {
        toastConflict(err, () => void reloadSelectedTrip());
      } else {
        toast.error(errorMessage(err, 'Could not save changes.'));
      }
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const reloadSelectedTrip = async () => {
    if (!selectedTrip || !activeAgencyId) return;
    try {
      const fresh = await api.getAgencyTrip(activeAgencyId, selectedTrip._id);
      handleTripUpdated(fresh);
      toast.success('Reloaded the latest version of this trip.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not reload the trip.'));
    }
  };

  const handleTripUpdated = (updated: Trip) => {
    setSelectedTrip(updated);
    setTrips((prev) =>
      prev.map((trip) => (trip._id === updated._id ? updated : trip))
    );
  };

  const handleShareIdChange = (shareId?: string) => {
    if (!selectedTrip) return;
    setSelectedTrip((prev) => (prev ? { ...prev, shareId } : prev));
    setTrips((prev) =>
      prev.map((trip) => (trip._id === selectedTrip._id ? { ...trip, shareId } : trip))
    );
  };

  const handleFeedbackSubmitted = (feedback: TripFeedback) => {
    setSelectedTrip((prev) => (prev ? { ...prev, feedback } : prev));
    setTrips((prev) =>
      prev.map((trip) =>
        trip._id === selectedTrip?._id ? { ...trip, feedback } : trip
      )
    );
  };

  const handleAssignment = async (value: string) => {
    if (!activeAgencyId || !selectedTrip) return;
    try {
      setAssigning(true);
      const result = await api.updateAgencyTrip(activeAgencyId, selectedTrip._id, {
        assignedTo: value === 'unassigned' ? null : value,
      });
      setSelectedTrip(result.trip);
      setTrips((prev) =>
        prev.map((trip) =>
          trip._id === result.trip._id ? { ...trip, ...result.trip } : trip
        )
      );
      toast.success('Trip assignment updated.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update the assignment.'));
    } finally {
      setAssigning(false);
    }
  };

  if (!activeAgencyId) {
    return (
      <Card className="rounded-3xl border-border/70">
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          Create or join an agency to start planning trips.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {tripId ? (
        detailLoading || !selectedTrip ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading trip...
          </div>
        ) : (
        <div className="space-y-4">
          <AgencyTripBanner
            agencyName={activeAgency?.name || 'Agency'}
            role={role}
            assignedLabel={assigneeLabel}
            assignedTo={selectedTrip.assignedTo}
            assignees={assignees}
            canAssign={canAssign}
            assigning={assigning}
            onAssignmentChange={handleAssignment}
          />

          <div className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => switchTab('itinerary')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition',
                activeTab === 'itinerary'
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              )}
            >
              <MapIcon className="h-3.5 w-3.5" />
              Itinerary
            </button>
            <button
              type="button"
              onClick={() => switchTab('quote')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition',
                activeTab === 'quote'
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              )}
            >
              <Receipt className="h-3.5 w-3.5" />
              Quote
            </button>
            <button
              type="button"
              onClick={() => switchTab('export')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition',
                activeTab === 'export'
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              )}
            >
              <FileText className="h-3.5 w-3.5" />
              Export
            </button>
          </div>

          {/* Both panels stay mounted so switching tabs never loses edits. */}
          <div className={activeTab === 'itinerary' ? undefined : 'hidden'}>
            <ItineraryDisplay
              data={selectedTrip.tripDetails}
              tripId={selectedTrip._id}
              status={selectedTrip.status || 'planned'}
              version={selectedTrip.version}
              hasEdited={selectedTrip.hasEdited}
              shareId={selectedTrip.shareId}
              onShareIdChange={handleShareIdChange}
              role={access.role ?? undefined}
              members={selectedTrip.members}
              currentUserId={user?._id}
              onStatusChange={access.isOwner ? handleStatusChange : undefined}
              onSave={access.canEdit ? handleSaveTrip : undefined}
              canRate={access.isOwner}
              isSaving={isSaving}
              onTripUpdated={handleTripUpdated}
              feedback={selectedTrip.feedback}
              generationMeta={selectedTrip.generationMeta}
              expenses={selectedTrip.expenses}
              participants={selectedTrip.participants}
              finance={selectedTrip.finance}
              customRoutes={selectedTrip.customRoutes}
              startDate={selectedTrip.startDate}
              onFeedbackSubmitted={handleFeedbackSubmitted}
              onBackToList={() => navigate('/agency/trips')}
              onNewPlan={
                canPlan ? () => navigate('/agency/trips/new') : undefined
              }
              agencyTrip
              agencyStaff={Boolean(selectedTrip.agencyRole)}
            />
          </div>

          {quoteTabOpened ? (
            <div className={activeTab === 'quote' ? undefined : 'hidden'}>
              <AgencyQuotePanel
                agencyId={activeAgencyId}
                tripId={selectedTrip._id}
                tripTitle={selectedTrip.title}
                tripStartDate={selectedTrip.startDate}
                tripEndDate={selectedTrip.endDate}
              />
            </div>
          ) : null}

          {exportTabOpened ? (
            <div className={activeTab === 'export' ? undefined : 'hidden'}>
              <AgencyExportPanel
                agencyId={activeAgencyId}
                tripId={selectedTrip._id}
                tripTitle={selectedTrip.title}
                onOpenQuoteTab={() => switchTab('quote')}
              />
            </div>
          ) : null}
        </div>
        )
      ) : loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading agency trips...
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-3xl border border-teal-200/70 bg-gradient-to-r from-teal-50 via-white to-sky-50 p-5 dark:border-teal-900/60 dark:from-teal-950/40 dark:via-slate-950 dark:to-sky-950/30 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-teal-600 text-white">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
                    Plan with AI, refine as an agency
                  </h2>
                  <Badge className={cn('text-[10px]', agencyRoleBadgeClass(role || 'viewer'))}>
                    {agencyRoleLabel(role || 'viewer')}
                  </Badge>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Generate a draft, assign a planner, then invite the client from
                  the People tab. Client access stays trip-scoped.
                </p>
              </div>
            </div>
            {canPlan && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setBlankOpen(true)}
                  className="rounded-2xl text-xs font-bold gap-2"
                >
                  <CalendarPlus className="h-4 w-4" />
                  Start blank
                </Button>
                <Button
                  type="button"
                  variant="hero"
                  onClick={() => navigate('/agency/trips/new')}
                  className="rounded-2xl text-xs font-bold gap-2"
                >
                  <PlusCircle className="h-4 w-4" />
                  Plan a client trip
                </Button>
              </div>
            )}
          </div>

          <MyTripsView
            variant="agency"
            trips={trips}
            deletedTrips={canManage ? deletedTrips : []}
            onSelectTrip={handleSelectTrip}
            onDuplicateTrip={handleDuplicateTrip}
            onDeleteTrip={handleDeleteTrip}
            onRestoreTrip={handleRestoreTrip}
            onPurgeTrip={handlePurgeTrip}
            onNewPlan={() => navigate('/agency/trips/new')}
            heading="Agency trips"
            eyebrow="Agency Trip Library"
            newPlanLabel="Plan with AI"
            emptyTitle="No agency trips yet"
            emptyBody="Generate a client draft with AI, then refine it with your team and invite the client."
            deletedHelpText="Only agency owners and admins see this list. Restoring brings back the itinerary and discussion; old share links and invites stay revoked."
            canDuplicateTrip={() => canPlan}
            canDeleteTrip={() => canManage}
            searchValue={search}
            onSearchChange={setSearch}
            statusValue={statusFilter}
            onStatusChange={setStatusFilter}
          />
        </>
      )}

      <Dialog open={blankOpen} onOpenChange={setBlankOpen}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start a blank agency trip</DialogTitle>
            <DialogDescription>
              Create the trip shell now and fill in the itinerary manually. You
              can also generate a draft with AI at any time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="blank-trip-title">Working title</Label>
              <Input
                id="blank-trip-title"
                value={blankTitle}
                onChange={(event) => setBlankTitle(event.target.value)}
                placeholder="Untitled agency trip"
                maxLength={120}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="blank-trip-start">Start date</Label>
                <Input
                  id="blank-trip-start"
                  type="date"
                  value={blankStart}
                  onChange={(event) => setBlankStart(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="blank-trip-end">End date</Label>
                <Input
                  id="blank-trip-end"
                  type="date"
                  value={blankEnd}
                  onChange={(event) => setBlankEnd(event.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBlankOpen(false)}
              disabled={creatingBlank}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreateBlankTrip()}
              disabled={creatingBlank}
            >
              {creatingBlank ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CalendarPlus className="mr-2 h-4 w-4" />
              )}
              Create trip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface AgencyTripBannerProps {
  agencyName: string;
  role?: string;
  assignedLabel: string;
  assignedTo?: string;
  assignees: AgencyMember[];
  canAssign: boolean;
  assigning: boolean;
  onAssignmentChange: (value: string) => void;
}

const AgencyTripBanner: React.FC<AgencyTripBannerProps> = ({
  agencyName,
  role,
  assignedLabel,
  assignedTo,
  assignees,
  canAssign,
  assigning,
  onAssignmentChange,
}) => (
  <Card className="rounded-3xl border-teal-200/70 bg-gradient-to-r from-teal-50 via-white to-sky-50 dark:border-teal-900/60 dark:from-teal-950/40 dark:via-slate-950 dark:to-sky-950/30">
    <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-teal-600 text-white">
          <Building2 className="h-5 w-5" />
        </span>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              Agency trip
            </Badge>
            <Badge className={cn('text-[10px]', agencyRoleBadgeClass(role || 'viewer'))}>
              {agencyRoleLabel(role || 'viewer')}
            </Badge>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">-</span>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <UserRound className="h-3.5 w-3.5" />
            Assigned to <strong className="text-slate-800 dark:text-slate-200">{assignedLabel}</strong>
            <span className="mx-1 text-slate-300">-</span>
            <Link2 className="h-3.5 w-3.5" />
            Client access via the People tab
          </p>
        </div>
      </div>

      {canAssign ? (
        <Select
          value={assignedTo || 'unassigned'}
          onValueChange={onAssignmentChange}
          disabled={assigning}
        >
          <SelectTrigger className="h-9 w-full rounded-xl text-xs sm:w-[210px]">
            <SelectValue placeholder="Assign a planner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned" className="text-xs">
              Unassigned
            </SelectItem>
            {assignees.map((member) => (
              <SelectItem
                key={member.userId}
                value={member.userId}
                className="text-xs"
              >
                {member.label || member.email || 'Agency member'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </CardContent>
  </Card>
);

export default AgencyTrips;
