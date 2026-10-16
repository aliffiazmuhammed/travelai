import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/services/api";
import ItineraryDisplay from "@/components/ItineraryDisplay";
import {
  Sparkles,
  Compass,
  ArrowRight,
  Loader2,
  AlertCircle,
  Globe,
  Share2,
} from "lucide-react";
import type { Trip } from "@/types/trip";

const SharedTrip: React.FC = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareId) {
      setError("No share ID provided.");
      setLoading(false);
      return;
    }

    const fetchShared = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getSharedTrip(shareId);
        setTrip(data);
      } catch (err: any) {
        console.error("Failed to load shared trip:", err);
        setError(
          err.message ||
            "This shared itinerary could not be found or may have been revoked by the author."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchShared();
  }, [shareId]);

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 pt-24 pb-20 max-w-6xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[450px] space-y-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-foreground">
                Loading Shared Adventure...
              </h3>
              <p className="text-xs text-muted-foreground">
                Retrieving itinerary details and maps
              </p>
            </div>
          </div>
        ) : error || !trip ? (
          <div className="p-8 sm:p-12 text-center rounded-3xl bg-card/80 backdrop-blur-md border border-border/80 shadow-card max-w-lg mx-auto my-12 space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-black text-foreground">
                Itinerary Not Found
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {error || "The link you followed may be invalid or expired."}
              </p>
            </div>
            <Button
              type="button"
              variant="hero"
              onClick={() => navigate("/plan")}
              className="rounded-2xl h-11 px-6 text-xs font-bold gap-2 shadow-sm"
            >
              <Sparkles className="w-4 h-4" />
              <span>Create Your Own Trip</span>
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Public Viewer Notice Banner */}
            <div className="p-4 rounded-3xl bg-primary/10 border border-primary/20 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-primary/20 text-primary flex items-center justify-center shrink-0">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-foreground">
                    Public View: Shared Itinerary
                  </span>
                  <p className="text-[11px] text-muted-foreground">
                    You are viewing a travel plan shared with TravelAI.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="hero"
                size="sm"
                onClick={() => navigate("/plan")}
                className="rounded-xl text-xs font-bold gap-1.5 h-9 shrink-0 shadow-xs"
              >
                <span>Plan Your Free Trip</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Read-Only Itinerary View */}
            <ItineraryDisplay
              data={trip.tripDetails}
              onNewPlan={() => navigate("/plan")}
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default SharedTrip;
