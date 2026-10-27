import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { api } from "@/services/api";
import { toast } from "sonner";
import ItineraryDisplay from "@/components/ItineraryDisplay";
import { MyTripsView } from "@/components/dashboard/MyTripsView";
import { TripsGridSkeleton, ItinerarySkeleton } from "@/components/dashboard/TripSkeletons";
import { useAuth } from "@/context/UserContext";
import { useTripAccess } from "@/hooks/useTripAccess";
import { isRevConflict, toastConflict } from "@/lib/conflicts";
import type { Trip, ItineraryData, TripFeedback } from "@/types/trip";
import type { TripPublicationState } from "@/types/gallery";

const Dashboard: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [deletedTrips, setDeletedTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Milestone 6 §3.8: role → UI gating. Cosmetic only — the server enforces.
  const access = useTripAccess(selectedTrip, user?._id);

  // Fetch all user trips on mount
  useEffect(() => {
    loadTrips();
    void loadDeletedTrips();
    // E4a (F10): collaborators' writes surface without a manual refresh —
    // refetch on tab focus/visibility plus a gentle poll while this screen
    // is mounted. Failures stay silent; the last known list remains shown.
    const refetchQuietly = () => {
      if (!document.hidden) {
        void refreshTripsQuietly();
        void refreshTrashQuietly();
      }
    };
    window.addEventListener("focus", refetchQuietly);
    document.addEventListener("visibilitychange", refetchQuietly);
    const interval = setInterval(refetchQuietly, 20000);
    return () => {
      window.removeEventListener("focus", refetchQuietly);
      document.removeEventListener("visibilitychange", refetchQuietly);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTrips = async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true);
      const data = await api.getTrips();
      setTrips(data);

      // If passed state from TripPlanner, open the EXACT trip it created.
      // The old title match could open a different trip with the same title.
      const handoff = location.state as
        | { tripId?: string; itinerary?: ItineraryData }
        | null;
      const handoffTripId = handoff?.tripId;
      const handoffItinerary = handoff?.itinerary;

      if (handoffTripId || handoffItinerary) {
        let opened = false;

        if (handoffTripId) {
          try {
            // E5 (F16): list rows are summaries — fetch the full document.
            setSelectedTrip(await api.getTrip(handoffTripId));
            opened = true;
          } catch (err) {
            console.error("Failed to open the generated trip by id:", err);
          }
        }

        // Compatibility fallback for hand-offs created before tripId existed.
        if (!opened && handoffItinerary) {
          const found = data.find(
            (t) => t.tripDetails?.trip_title === handoffItinerary.trip_title
          );
          if (found) {
            try {
              setSelectedTrip(await api.getTrip(found._id));
              opened = true;
            } catch (err) {
              console.error("Failed to open the generated trip by title:", err);
            }
          }
        }

        if (!opened && handoffItinerary) {
          // Last-resort read-only preview: never leave the user staring at
          // nothing if the follow-up fetch failed.
          setSelectedTrip({
            _id: "temp-" + Date.now(),
            title: handoffItinerary.trip_title,
            status: "planned",
            tripDetails: handoffItinerary,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          opened = true;
        }

        if (!opened) {
          toast.error(
            "Your trip was created, but it could not be opened. Refresh your library."
          );
        }

        // Consume the hand-off so a later quiet refresh doesn't reselect.
        // URL-only navigate (`Partial<Path>` has no `state`); the hand-off is
        // one-shot so a refresh arriving with no state is legitimate too.
        navigate(`${location.pathname}${location.search}${location.hash}`, {
          replace: true,
        });
      }
    } catch (err: any) {
      console.error("Failed to fetch trips:", err);
      if (showSpinner) toast.error("Failed to load your trips. Please check your connection.");
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  /** M7.7: trash is an additive section; a failure must not hide the library. */
  const loadDeletedTrips = async () => {
    try {
      setDeletedTrips(await api.getDeletedTrips());
    } catch (err) {
      console.error("Failed to fetch Recently deleted:", err);
    }
  };

  const refreshTrashQuietly = async () => {
    try {
      setDeletedTrips(await api.getDeletedTrips());
    } catch {
      /* silent — keep the last known trash list */
    }
  };

  /** E5 (F16): open a trip from the library via the full-document fetch. */
  const [openingDetail, setOpeningDetail] = useState<boolean>(false);
  const handleSelectTrip = async (trip: Trip) => {
    setOpeningDetail(true);
    try {
      setSelectedTrip(await api.getTrip(trip._id));
    } catch (err: any) {
      console.error("Failed to open trip:", err);
      toast.error(err.message || "Could not open this trip. Please try again.");
    } finally {
      setOpeningDetail(false);
    }
  };

  /**
   * E4a: silent refresh — list, plus (if a trip is open) its fresh `rev` and
   * role. E5 (F16) note: list rows are LEAN summaries with no
   * `day_by_day_itinerary`/`budget_breakdown`, so they must never be swapped
   * wholesale into the open trip — only the freshness fields are merged onto
   * the full document already held in state. (This was the "details vanish
   * after ~20s" bug.)
   */
  const refreshTripsQuietly = async () => {
    try {
      const data = await api.getTrips();
      setTrips(data);
      setSelectedTrip((prev) => {
        if (!prev || prev._id.startsWith("temp-")) return prev;
        const fresh = data.find((t) => t._id === prev._id);
        if (!fresh) return prev;
        return {
          ...prev,
          rev: typeof fresh.rev === "number" ? fresh.rev : prev.rev,
          role: fresh.role ?? prev.role,
          members: fresh.members ?? prev.members,
          status: fresh.status ?? prev.status,
          startDate: fresh.startDate ?? prev.startDate,
          hasEdited: fresh.hasEdited ?? prev.hasEdited,
          version: fresh.version ?? prev.version,
        };
      });
    } catch {
      /* silent — offline polishing */
    }
  };

  // Duplicate Trip Handler
  const handleDuplicateTrip = async (tripId: string) => {
    try {
      const duplicated = await api.duplicateTrip(tripId);
      toast.success("Trip duplicated successfully as a new draft!");
      setTrips((prev) => [duplicated, ...prev]);
    } catch (err: any) {
      console.error("Failed to duplicate trip:", err);
      toast.error(err.message || "Failed to duplicate trip.");
    }
  };

  // Delete Trip Handler — owner-only on the server; mirrored here so a shared
  // member never sees a doomed confirm dialog.
  const handleDeleteTrip = async (tripId: string) => {
    const trip = trips.find((t) => t._id === tripId);
    if (trip?.role && trip.role !== "owner") {
      toast.error("Only the trip owner can delete it. Use “Duplicate” for your own copy.");
      return;
    }
    try {
      await api.deleteTrip(tripId);
      toast.success("Trip moved to Recently deleted.");
      setTrips((prev) => prev.filter((t) => t._id !== tripId));
      if (trip) {
        setDeletedTrips((prev) => [
          {
            ...trip,
            isDeleted: true,
            deletedAt: new Date().toISOString(),
            shareId: undefined,
            isPublic: false,
          },
          ...prev.filter((t) => t._id !== tripId),
        ]);
      } else {
        void loadDeletedTrips();
      }
      if (selectedTrip?._id === tripId) {
        setSelectedTrip(null);
      }
    } catch (err: any) {
      console.error("Failed to delete trip:", err);
      toast.error(err.message || "Failed to delete trip.");
    }
  };

  // M7.7: restore a deleted trip. The server keeps the old share link/invites
  // revoked, so the owner must deliberately share again if they want that.
  const handleRestoreTrip = async (tripId: string) => {
    try {
      const restored = await api.restoreTrip(tripId);
      setDeletedTrips((prev) => prev.filter((t) => t._id !== tripId));
      setTrips((prev) => [restored, ...prev.filter((t) => t._id !== tripId)]);
      toast.success("Trip restored to your library.");
    } catch (err: any) {
      console.error("Failed to restore trip:", err);
      toast.error(err.message || "Failed to restore trip.");
      throw err;
    }
  };

  // M7.7: permanent delete. The server cascades chat, polls, decisions and
  // receipts; this cannot be undone.
  const handlePurgeTrip = async (tripId: string) => {
    try {
      await api.purgeTrip(tripId);
      setDeletedTrips((prev) => prev.filter((t) => t._id !== tripId));
      toast.success("Trip permanently deleted.");
    } catch (err: any) {
      console.error("Failed to permanently delete trip:", err);
      toast.error(err.message || "Failed to permanently delete trip.");
      throw err;
    }
  };

  // Status Change Handler in Itinerary View
  const handleStatusChange = async (
    newStatus: "draft" | "planned" | "ongoing" | "completed"
  ) => {
    if (!selectedTrip || selectedTrip._id.startsWith("temp-")) return;
    try {
      const updated = await api.updateTrip(selectedTrip._id, {
        status: newStatus,
      });
      setSelectedTrip(updated);
      setTrips((prev) =>
        prev.map((t) => (t._id === updated._id ? updated : t))
      );
      toast.success(`Trip status updated to "${newStatus}"`);
    } catch (err: any) {
      console.error("Failed to update status:", err);
      if (isRevConflict(err)) {
        toastConflict(err, () => reloadSelectedTrip());
      } else {
        toast.error("Could not update trip status.");
      }
    }
  };

  // Save Changes Handler for edited itinerary details
  const handleSaveTrip = async (updatedDetails: ItineraryData) => {
    if (!selectedTrip || selectedTrip._id.startsWith("temp-")) return;
    try {
      setIsSaving(true);
      // M7.2: editors save content through the editor-ranked endpoint; the
      // owner-only `PUT /:id` remains reserved for title/status changes.
      const updated = await api.saveTripItinerary(selectedTrip._id, updatedDetails);
      setSelectedTrip(updated);
      setTrips((prev) =>
        prev.map((t) => (t._id === updated._id ? updated : t))
      );
      toast.success("Changes saved successfully to your trip!");
    } catch (err: any) {
      console.error("Failed to save trip:", err);
      if (isRevConflict(err)) {
        toastConflict(err, () => reloadSelectedTrip());
      } else {
        toast.error("Could not save changes. Please try again.");
      }
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  /** E4: 409 recovery — refetch the selected trip and swap it in wholesale. */
  const reloadSelectedTrip = async () => {
    if (!selectedTrip || selectedTrip._id.startsWith("temp-")) return;
    try {
      const fresh = await api.getTrip(selectedTrip._id);
      handleTripUpdated(fresh);
      toast.success("Reloaded the latest version of this trip.");
    } catch (err: any) {
      console.error("Failed to reload trip:", err);
      toast.error(err.message || "Could not reload the trip.");
    }
  };

  // Sync a server-updated trip (granular edit or version restore) into local state
  const handleTripUpdated = (updated: Trip) => {
    setSelectedTrip(updated);
    setTrips((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
  };

  /** M7.2: keep the open trip's share token in sync after generate/revoke. */
  const handleShareIdChange = (shareId?: string) => {
    const id = selectedTrip?._id;
    if (!id) return;
    setSelectedTrip((prev) =>
      prev && prev._id === id ? { ...prev, shareId } : prev
    );
    setTrips((prev) =>
      prev.map((t) => (t._id === id ? { ...t, shareId } : t))
    );
  };

  /** M8 G2: keep the open trip's gallery state in sync after publish/unpublish. */
  const handlePublicationChange = (state: TripPublicationState) => {
    const id = selectedTrip?._id;
    if (!id) return;
    const patch = {
      visibility: state.visibility,
      publishedAt: state.publishedAt,
      gallery: state.gallery,
    };
    setSelectedTrip((prev) => (prev && prev._id === id ? { ...prev, ...patch } : prev));
    setTrips((prev) => prev.map((t) => (t._id === id ? { ...t, ...patch } : t)));
  };

  // Merge a submitted rating into local state (feedback endpoint returns just the rating)
  const handleFeedbackSubmitted = (feedback: TripFeedback) => {
    setSelectedTrip((prev) => (prev ? { ...prev, feedback } : prev));
    setTrips((prev) =>
      prev.map((t) => (t._id === selectedTrip?._id ? { ...t, feedback } : t))
    );
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 pt-24 pb-16">
        {/* E5 (F16): opening a card fetches the full document. Show the shape
            of the itinerary that is about to render instead of a spinner veil,
            so the transition feels like the page loading, not a stall. */}
        {openingDetail && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-background/80 backdrop-blur-sm px-4 pt-24">
            <ItinerarySkeleton />
          </div>
        )}
        {loading ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-6 rounded-3xl bg-card border border-border/70 shadow-xs">
              <div className="space-y-2">
                <div className="h-4 w-28 bg-muted rounded-md animate-pulse" />
                <div className="h-7 w-48 bg-muted rounded-md animate-pulse" />
              </div>
            </div>
            <TripsGridSkeleton />
          </div>
        ) : selectedTrip ? (
          /* SINGLE TRIP DETAIL VIEW */
          <div className="space-y-6">
            <ItineraryDisplay
              data={selectedTrip.tripDetails}
              tripId={selectedTrip._id}
              status={selectedTrip.status || "planned"}
              version={selectedTrip.version}
              hasEdited={selectedTrip.hasEdited}
              shareId={selectedTrip.shareId}
              onShareIdChange={handleShareIdChange}
              publication={{
                visibility: selectedTrip.visibility ?? "private",
                publishedAt: selectedTrip.publishedAt ?? null,
                gallery: selectedTrip.gallery,
                startDate: selectedTrip.startDate,
                endDate: selectedTrip.endDate,
                destination: selectedTrip.generationMeta?.request?.destination,
                durationDays: selectedTrip.tripDetails?.duration_days,
              }}
              onPublicationChange={handlePublicationChange}
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
              onBackToList={() => setSelectedTrip(null)}
              onNewPlan={() => navigate("/plan")}
            />
          </div>
        ) : (
          /* ALL TRIPS LIBRARY (GRID & LIST) VIEW */
          <MyTripsView
            trips={trips}
            deletedTrips={deletedTrips}
            onSelectTrip={handleSelectTrip}
            onDuplicateTrip={handleDuplicateTrip}
            onDeleteTrip={handleDeleteTrip}
            onRestoreTrip={handleRestoreTrip}
            onPurgeTrip={handlePurgeTrip}
            onNewPlan={() => navigate("/plan")}
            canDuplicateTrip={(trip) => trip.workspace !== "agency"}
          />
        )}
      </main>
    </div>
  );
};

export default Dashboard;
