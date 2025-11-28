import { useState } from "react";
import { API_BASE_URL } from "@/config";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, MapPin, Sparkles } from "lucide-react";
import { format } from "date-fns";

const TripPlanner = () => {
  const navigate = useNavigate();
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [budget, setBudget] = useState("");
  const [interests, setInterests] = useState<string[]>([]);

  const interestOptions = [
    "Adventure", "Nature", "Food", "Shopping",
    "Culture", "Luxury", "Budget", "Photography"
  ];

  const toggleInterest = (interest: string) => {
    setInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };

  const [loading, setLoading] = useState(false);

  const handlePlanTrip = async () => {
    if (!destination || !startDate || !endDate || !budget) {
      alert("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      const response = await fetch(`${API_BASE_URL}/api/itinery/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          destination,
          days,
          startdate: format(startDate, "yyyy-MM-dd"),
          enddate: format(endDate, "yyyy-MM-dd"),
          budget,
          interests: interests.join(", "),
          groupType: "Couple" // Defaulting for now, could be added to form
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate itinerary');
      }

      const data = await response.json();
      // The backend now returns the full trip object, so we pass data.tripDetails
      navigate("/dashboard", { state: { itinerary: data.tripDetails } });
    } catch (error) {
      console.error("Error generating trip:", error);
      alert("Failed to generate trip. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero">
      <Navbar />
      <div className="container mx-auto px-4 pt-32 pb-16">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12 space-y-4">
            <div className="inline-flex items-center gap-2 bg-primary/10 backdrop-blur-sm border border-primary/20 rounded-full px-6 py-2 shadow-soft">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">AI Trip Planning</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold">
              Plan Your Perfect
              <span className="block bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Travel Adventure
              </span>
            </h1>
            <p className="text-lg text-muted-foreground">
              Tell us about your dream trip and let AI create a personalized itinerary
            </p>
          </div>

          <Card className="shadow-card border-border/50">
            <CardHeader>
              <CardTitle>Trip Details</CardTitle>
              <CardDescription>
                Fill in the details below to generate your custom itinerary
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="destination">Where do you want to go?</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="destination"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="e.g., Paris, Tokyo, New York"
                    className="h-12 pl-10"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full h-12 justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-card" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full h-12 justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-card" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="budget">Budget (INR)</Label>
                <Input
                  id="budget"
                  type="number"
                  placeholder="e.g., 20000"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label>Interests & Preferences</Label>
                <div className="flex flex-wrap gap-2">
                  {interestOptions.map((interest) => (
                    <Badge
                      key={interest}
                      variant={interests.includes(interest) ? "default" : "outline"}
                      className="cursor-pointer px-4 py-2 text-sm hover-lift"
                      onClick={() => toggleInterest(interest)}
                    >
                      {interest}
                    </Badge>
                  ))}
                </div>
              </div>

              <Button
                variant="hero"
                size="lg"
                className="w-full"
                onClick={handlePlanTrip}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Sparkles className="h-5 w-5 mr-2 animate-spin" />
                    Generating Itinerary...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 mr-2" />
                    Generate My Itinerary
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TripPlanner;
