import React from "react";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  CalendarDays,
  Users,
  IndianRupee,
  Sparkles,
  Edit2,
  ShieldCheck,
  Loader2,
  AlertCircle,
  Gauge,
  Languages,
  UtensilsCrossed,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { formatDate, formatDateShort } from "@/lib/date";
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

interface ReviewRowProps {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
  editLabel: string;
  onEdit: () => void;
}

const ReviewRow: React.FC<ReviewRowProps> = ({
  icon: Icon,
  label,
  value,
  detail,
  editLabel,
  onEdit,
}) => (
  <div className="flex items-start justify-between gap-3 px-4 py-4 sm:px-5">
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 break-words text-sm font-semibold text-foreground">
          {value}
        </p>
        {detail && (
          <p className="mt-0.5 break-words text-xs text-muted-foreground">
            {detail}
          </p>
        )}
      </div>
    </div>
    <button
      type="button"
      onClick={onEdit}
      aria-label={editLabel}
      className="shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  </div>
);

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
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Everything look right?
        </h2>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Check the details, then generate your plan
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Generation failed</p>
            <p className="mt-0.5 text-destructive/90">{error}</p>
          </div>
        </div>
      )}

      {/* Trip Summary */}
      <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/80">
        <ReviewRow
          icon={MapPin}
          label="Destination"
          value={destination || "Not set"}
          editLabel="Edit destination"
          onEdit={() => onEditStep(1)}
        />
        <ReviewRow
          icon={CalendarDays}
          label="Dates"
          value={`${durationDays} ${durationDays === 1 ? "day" : "days"} / ${
            durationDays > 1 ? durationDays - 1 : 1
          } ${durationDays > 1 ? "nights" : "night"}`}
          detail={`${startDate && formatDateShort(startDate)} – ${
            endDate && formatDate(endDate)
          }`}
          editLabel="Edit dates"
          onEdit={() => onEditStep(2)}
        />
        <ReviewRow
          icon={Users}
          label="Travelers"
          value={`${groupType} · ${totalTravelers} ${
            totalTravelers === 1 ? "person" : "people"
          }`}
          detail={`${adultsCount} ${
            adultsCount === 1 ? "adult" : "adults"
          }${childrenCount > 0 ? ` · ${childrenCount} children` : ""}`}
          editLabel="Edit travelers"
          onEdit={() => onEditStep(3)}
        />
        <ReviewRow
          icon={IndianRupee}
          label="Budget"
          value={`₹${budgetPerPerson.toLocaleString("en-IN")} per person`}
          detail={`Approx. ₹${totalBudget.toLocaleString("en-IN")} for the whole trip`}
          editLabel="Edit budget"
          onEdit={() => onEditStep(4)}
        />
      </div>

      {/* Style & Preferences */}
      <div className="space-y-3 rounded-2xl border border-border/80 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold text-muted-foreground">
            Travel style &amp; preferences
          </h3>
          <button
            type="button"
            onClick={() => onEditStep(5)}
            className="text-xs font-semibold text-primary transition-colors hover:underline"
          >
            Edit
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {interests.map((interest) => (
            <span
              key={interest}
              className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
            >
              {interest}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border/60 pt-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span className="text-muted-foreground">Pace</span>
            <span className="font-semibold text-foreground">
              {PACE_LABELS[pace]}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Languages className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span className="text-muted-foreground">Language</span>
            <span className="font-semibold text-foreground">
              {LANGUAGE_LABELS[language]}
            </span>
          </span>
          {dietary.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <UtensilsCrossed
                className="h-3.5 w-3.5 text-primary"
                aria-hidden="true"
              />
              <span className="text-muted-foreground">Diet</span>
              <span className="font-semibold text-foreground">
                {dietary.join(", ")}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* AI Features Notice */}
      <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground">
        <ShieldCheck
          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
          aria-hidden="true"
        />
        <p className="leading-relaxed">
          Our AI synthesizes local travel timing, verified stay options, regional
          dhabas &amp; restaurants, transit tips (cabs vs buses), weather
          advisories, and UPI/cash recommendations.
        </p>
      </div>

      {/* Generate CTA */}
      <Button
        type="button"
        size="xl"
        variant="hero"
        disabled={loading}
        onClick={onSubmit}
        className="h-14 w-full rounded-2xl text-base font-semibold shadow-card"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
            Crafting your itinerary...
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-5 w-5" aria-hidden="true" />
            Generate my travel itinerary
          </>
        )}
      </Button>
    </div>
  );
};
