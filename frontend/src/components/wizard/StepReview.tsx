import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Calendar,
  Users,
  IndianRupee,
  Sparkles,
  Edit2,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  AlertCircle,
  Gauge,
  Languages,
  UtensilsCrossed,
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import type { TripLanguage, TravelPace } from "@/types/trip";

const LANGUAGE_LABELS: Record<TripLanguage, string> = {
  en: "English",
  hi: "हिन्दी (Hindi)",
  ta: "தமிழ் (Tamil)",
  bn: "বাংলা (Bengali)",
  te: "తెలుగు (Telugu)",
  mr: "मराठी (Marathi)",
  kn: "ಕನ್ನಡ (Kannada)",
  ml: "മലയാളം (Malayalam)",
  gu: "ગુજરાતી (Gujarati)",
};

const PACE_LABELS: Record<TravelPace, string> = {
  relaxed: "Relaxed",
  balanced: "Balanced",
  packed: "Action-packed",
};

interface StepReviewProps {
  destination: string;
  startDate: Date | undefined;
  endDate: Date | undefined;
  groupType: string;
  adultsCount: number;
  childrenCount: number;
  budgetPerPerson: number;
  interests: string[];
  language: TripLanguage;
  pace: TravelPace;
  dietary: string[];
  loading: boolean;
  error: string | null;
  onEditStep: (stepId: number) => void;
  onSubmit: () => void;
}

export const StepReview: React.FC<StepReviewProps> = ({
  destination,
  startDate,
  endDate,
  groupType,
  adultsCount,
  childrenCount,
  budgetPerPerson,
  interests,
  language,
  pace,
  dietary,
  loading,
  error,
  onEditStep,
  onSubmit,
}) => {
  const totalTravelers = adultsCount + childrenCount;
  const durationDays =
    startDate && endDate
      ? differenceInCalendarDays(endDate, startDate) + 1
      : 0;

  const totalBudget = budgetPerPerson * Math.max(1, totalTravelers);

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center justify-center gap-2">
          <span>Review your trip details</span>
          <span className="text-2xl">📋</span>
        </h2>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          Everything is set! Check your preferences below before our AI crafts your personalized day-by-day itinerary.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl text-xs font-medium">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold">Generation Failed</h4>
            <p className="text-destructive/90">{error}</p>
          </div>
        </div>
      )}

      {/* Review Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Destination Card */}
        <div className="p-5 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-sm relative group hover:border-primary/40 transition-all">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs uppercase font-semibold text-muted-foreground">
                  Destination
                </span>
                <h3 className="text-base font-bold text-foreground">
                  {destination || "Not set"}
                </h3>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onEditStep(1)}
              className="h-8 w-8 text-muted-foreground hover:text-primary"
            >
              <Edit2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Dates Card */}
        <div className="p-5 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-sm relative group hover:border-primary/40 transition-all">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs uppercase font-semibold text-muted-foreground">
                  Duration & Dates
                </span>
                <h3 className="text-base font-bold text-foreground">
                  {durationDays} Days / {durationDays > 1 ? durationDays - 1 : 1} Nights
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {startDate && format(startDate, "dd MMM")} →{" "}
                  {endDate && format(endDate, "dd MMM yyyy")}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onEditStep(2)}
              className="h-8 w-8 text-muted-foreground hover:text-primary"
            >
              <Edit2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Travelers Card */}
        <div className="p-5 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-sm relative group hover:border-primary/40 transition-all">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs uppercase font-semibold text-muted-foreground">
                  Group & Travelers
                </span>
                <h3 className="text-base font-bold text-foreground">
                  {groupType} ({totalTravelers} {totalTravelers === 1 ? "Person" : "People"})
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {adultsCount} Adults {childrenCount > 0 && `• ${childrenCount} Children`}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onEditStep(3)}
              className="h-8 w-8 text-muted-foreground hover:text-primary"
            >
              <Edit2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Budget Card */}
        <div className="p-5 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-sm relative group hover:border-primary/40 transition-all">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <IndianRupee className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs uppercase font-semibold text-muted-foreground">
                  Budget Allocation
                </span>
                <h3 className="text-base font-bold text-primary">
                  ₹{budgetPerPerson.toLocaleString("en-IN")}{" "}
                  <span className="text-xs text-muted-foreground font-normal">/ person</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Approx. ₹{totalBudget.toLocaleString("en-IN")} total trip budget
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onEditStep(4)}
              className="h-8 w-8 text-muted-foreground hover:text-primary"
            >
              <Edit2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Style & Preferences Card */}
      <div className="p-5 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-semibold text-muted-foreground">
            Travel Style & Interests
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onEditStep(5)}
            className="h-7 text-xs text-primary"
          >
            Edit
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {interests.map((interest) => (
            <Badge
              key={interest}
              variant="secondary"
              className="px-3 py-1 text-xs font-semibold bg-primary/10 text-primary border border-primary/20"
            >
              {interest}
            </Badge>
          ))}
        </div>

        {/* Pace, dietary & language summary */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 border-t border-border/50 text-xs">
          <div className="flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-primary" />
            <span className="text-muted-foreground font-semibold">Pace:</span>
            <span className="font-bold text-foreground">{PACE_LABELS[pace]}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Languages className="w-3.5 h-3.5 text-primary" />
            <span className="text-muted-foreground font-semibold">Language:</span>
            <span className="font-bold text-foreground">{LANGUAGE_LABELS[language]}</span>
          </div>
          {dietary.length > 0 && (
            <div className="flex items-center gap-1.5">
              <UtensilsCrossed className="w-3.5 h-3.5 text-primary" />
              <span className="text-muted-foreground font-semibold">Diet:</span>
              <span className="font-bold text-foreground">{dietary.join(", ")}</span>
            </div>
          )}
        </div>
      </div>

      {/* AI Features Notice */}
      <div className="p-4 rounded-2xl bg-muted/40 border border-border/60 flex items-start gap-3 text-xs text-muted-foreground">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Our AI synthesizes local travel timing, verified stay options, regional dhabas & restaurants, transit tips (cabs vs buses), weather advisories, and UPI/cash recommendations.
        </p>
      </div>

      {/* Generate CTA Button */}
      <div className="pt-2">
        <Button
          type="button"
          size="xl"
          variant="hero"
          disabled={loading}
          onClick={onSubmit}
          className="w-full text-base font-bold h-14 rounded-2xl shadow-card"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Crafting Your Custom Itinerary with AI...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              Generate My Travel Itinerary ✨
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
