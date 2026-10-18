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
  }, []);

  const loadTrips = async () => {
    try {
      setLoading(true);
      const data = await api.getTrips();
      setTrips(data);

      // If passed state from TripPlanner, find or construct selected trip
      if (location.state?.itinerary) {
        const found = data.find(
          (t) =>
            t.tripDetails?.trip_title === location.state.itinerary.trip_title
        );
        if (found) {
          setSelectedTrip(found);
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
      }
    } catch (err: any) {
      console.error("Failed to fetch trips:", err);
      toast.error("Failed to load your trips. Please check your connection.");
    } finally {
      setLoading(false);
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
      toast.error("Could not update trip status.");
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
      toast.error("Could not save changes. Please try again.");
      throw err;
    } finally {
      setIsSaving(false);
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
            onSelectTrip={(trip) => setSelectedTrip(trip)}
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
