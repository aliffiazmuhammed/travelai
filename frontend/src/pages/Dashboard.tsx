import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { api } from "@/services/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import ItineraryDisplay from "@/components/ItineraryDisplay";
import { MyTripsView } from "@/components/dashboard/MyTripsView";
import { TripsGridSkeleton } from "@/components/dashboard/TripSkeletons";
import { useAuth } from "@/context/UserContext";
import { useTripAccess } from "@/hooks/useTripAccess";
import { isRevConflict, toastConflict } from "@/lib/conflicts";
import type { Trip, ItineraryData, TripFeedback } from "@/types/trip";

const Dashboard: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Milestone 6 §3.8: role → UI gating. Cosmetic only — the server enforces.
  const access = useTripAccess(selectedTrip, user?._id);

  // Fetch all user trips on mount
  useEffect(() => {
    loadTrips();
    // E4a (F10): collaborators' writes surface without a manual refresh —
    // refetch on tab focus/visibility plus a gentle poll while this screen
    // is mounted. Failures stay silent; the last known list remains shown.
    const refetchQuietly = () => {
      if (!document.hidden) void refreshTripsQuietly();
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

      // If passed state from TripPlanner, find or construct selected trip
      if (location.state?.itinerary) {
        const found = data.find(
          (t) =>
            t.tripDetails?.trip_title === location.state.itinerary.trip_title
        );
        if (found) {
          // E5 (F16): list rows are summaries — fetch the full document.
          setSelectedTrip(await api.getTrip(found._id));
        } else {
          // Fallback constructed representation
          setSelectedTrip({
            _id: "temp-" + Date.now(),
            title: location.state.itinerary.trip_title,
            status: "planned",
            tripDetails: location.state.itinerary,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
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
      toast.success("Trip deleted successfully.");
      setTrips((prev) => prev.filter((t) => t._id !== tripId));
      if (selectedTrip?._id === tripId) {
        setSelectedTrip(null);
      }
    } catch (err: any) {
      console.error("Failed to delete trip:", err);
      toast.error(err.message || "Failed to delete trip.");
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
      const updated = await api.updateTrip(selectedTrip._id, {
        tripDetails: updatedDetails,
      });
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
        {/* E5 (F16): opening a card fetches the full document — keep the list
            visible under a lightweight veil instead of flashing a skeleton. */}
        {openingDetail && (
          <div className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm flex items-center justify-center">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
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
            onSelectTrip={handleSelectTrip}
            onDuplicateTrip={handleDuplicateTrip}
            onDeleteTrip={handleDeleteTrip}
            onNewPlan={() => navigate("/plan")}
          />
        )}
      </main>
    </div>
  );
};

export default Dashboard;
