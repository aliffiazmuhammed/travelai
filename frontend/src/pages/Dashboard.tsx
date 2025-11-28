import { useState, useEffect } from "react";
import { API_BASE_URL } from "@/config";
import { useLocation, useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { PlusCircle, Map, ChevronRight, Loader2 } from "lucide-react";
import ItineraryDisplay, { ItineraryData } from "@/components/ItineraryDisplay";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Menu } from "lucide-react";

interface Trip {
  _id: string;
  tripDetails: ItineraryData;
  createdAt: string;
}

const Dashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<ItineraryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrips();
  }, []);

  useEffect(() => {
    // If passed from TripPlanner, select it immediately
    if (location.state?.itinerary) {
      setSelectedTrip(location.state.itinerary);
    } else if (trips.length > 0 && !selectedTrip) {
      // Otherwise select the most recent one
      setSelectedTrip(trips[0].tripDetails);
    }
  }, [location.state, trips]);



  // ... existing imports

  const fetchTrips = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/itinery`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setTrips(data);
      }
    } catch (error) {
      console.error("Failed to fetch trips", error);
    } finally {
      setLoading(false);
    }
  };

  // ... existing imports

  const TripList = ({ mobile = false }) => (
    <ScrollArea className={cn("rounded-xl border bg-white/50 backdrop-blur-sm shadow-sm", mobile ? "h-[calc(100vh-100px)]" : "h-[calc(100vh-200px)]")}>
      <div className="p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : trips.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No trips yet. Start planning!
          </div>
        ) : (
          trips.map((trip) => (
            <div
              key={trip._id}
              onClick={() => {
                setSelectedTrip(trip.tripDetails);
                // Close sheet if on mobile (we can't easily do this without a controlled state for sheet, 
                // but for now let's just set the trip. The sheet needs to be controlled to close it.)
              }}
              className={cn(
                "p-4 rounded-lg cursor-pointer transition-all hover:bg-white hover:shadow-md border border-transparent",
                selectedTrip?.trip_title === trip.tripDetails.trip_title
                  ? "bg-white shadow-md border-primary/20 ring-1 ring-primary/20"
                  : "bg-white/40"
              )}
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-medium line-clamp-1 text-primary">
                  {trip.tripDetails.trip_title}
                </h3>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Map className="h-3 w-3" />
                <span>{trip.tripDetails.duration_days} Days</span>
                <span>•</span>
                <span>{new Date(trip.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </ScrollArea>
  );

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <Navbar />

      <div className="flex-1 container mx-auto px-4 pt-24 pb-12 flex flex-col md:flex-row gap-8">
        {/* Mobile Trip Toggle */}
        <div className="md:hidden">
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full justify-start">
                <Menu className="mr-2 h-4 w-4" />
                View My Trips
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] sm:w-[400px]">
              <SheetHeader className="mb-4">
                <SheetTitle>My Trips</SheetTitle>
              </SheetHeader>
              <div onClick={() => setIsMobileMenuOpen(false)}>
                <TripList mobile />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Desktop Sidebar */}
        <div className="w-full md:w-80 shrink-0 space-y-4 hidden md:block">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">My Trips</h2>
            <Button size="sm" variant="outline" onClick={() => navigate("/plan")}>
              <PlusCircle className="h-4 w-4 mr-2" /> New
            </Button>
          </div>
          <TripList />
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Mobile Header */}
          <div className="md:hidden mb-6 flex justify-between items-center">
            <h1 className="text-2xl font-bold">Your Trip</h1>
            <Button size="sm" onClick={() => navigate("/plan")}>
              <PlusCircle className="h-4 w-4 mr-2" /> New
            </Button>
          </div>

          {selectedTrip ? (
            <ItineraryDisplay data={selectedTrip} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-white/30 backdrop-blur-sm rounded-3xl border border-dashed border-gray-300 min-h-[400px]">
              <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Map className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Ready for your next adventure?</h3>
              <p className="mt-2 text-gray-500 max-w-sm">
                Create a personalized travel itinerary powered by AI in seconds.
              </p>
              <Button size="lg" className="mt-8" onClick={() => navigate("/plan")}>
                <PlusCircle className="h-5 w-5 mr-2" />
                Plan a New Trip
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
