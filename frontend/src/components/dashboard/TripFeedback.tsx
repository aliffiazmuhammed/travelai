import React, { useState } from "react";
import { ThumbsUp, ThumbsDown, Sparkles, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";
import type { TripFeedback as TripFeedbackType } from "@/types/trip";

interface TripFeedbackProps {
  tripId: string;
  initialFeedback?: TripFeedbackType;
  /** Optional AI quality score (0-100) shown as a confidence hint. */
  qualityScore?: number;
  /** Rating is owner-only on the server (F12); the widget renders read-only otherwise. */
  canRate?: boolean;
  onSubmitted?: (feedback: TripFeedbackType) => void;
}

/**
 * Compact thumbs up/down widget for a generated itinerary. Ratings are stored
 * server-side and feed future personalization + A/B variant insights.
 */
export const TripFeedback: React.FC<TripFeedbackProps> = ({
  tripId,
  initialFeedback,
  qualityScore,
  canRate = true,
  onSubmitted,
}) => {
  const [rating, setRating] = useState<"up" | "down" | undefined>(
    initialFeedback?.rating
  );
  const [submitting, setSubmitting] = useState<"up" | "down" | null>(null);

  const handleSubmit = async (value: "up" | "down") => {
    if (submitting) return;
    setSubmitting(value);
    try {
      const res = await api.submitFeedback(tripId, { rating: value });
      setRating(res.feedback.rating);
      onSubmitted?.(res.feedback);
      toast.success(
        value === "up"
          ? "Thanks! We'll tailor future trips to your taste."
          : "Thanks for the feedback — we'll keep improving your plans."
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not submit your feedback. Please try again."
      );
    } finally {
      setSubmitting(null);
    }
  };

  const renderButton = (value: "up" | "down") => {
    const isActive = rating === value;
    const isBusy = submitting === value;
    const Icon = value === "up" ? ThumbsUp : ThumbsDown;
    const label = value === "up" ? "Helpful" : "Not quite";

    return (
      <button
        type="button"
        onClick={() => handleSubmit(value)}
        disabled={submitting !== null}
        className={cn(
          "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-bold transition-all disabled:opacity-60",
          isActive
            ? value === "up"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400"
            : "border-border/70 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
        )}
      >
        {isBusy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : isActive ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          <Icon className="w-3.5 h-3.5" />
        )}
        <span>{label}</span>
      </button>
    );
  };

  return (
    <Card className="rounded-3xl border border-border/70 bg-card/60 backdrop-blur-sm shadow-xs overflow-hidden">
      <CardContent className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-foreground">
            Was this itinerary helpful?
          </span>
          {typeof qualityScore === "number" && (
            <span className="text-[11px] font-semibold text-muted-foreground">
              · AI confidence {qualityScore}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canRate ? (
            <>
              {renderButton("up")}
              {renderButton("down")}
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground font-medium">
              Only the trip owner can rate this itinerary
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
