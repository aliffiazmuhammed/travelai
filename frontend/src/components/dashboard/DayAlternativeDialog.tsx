import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, RefreshCw, Sparkles, Clock, MapPin, Wand2 } from "lucide-react";
import { WeatherBadge } from "./WeatherAdvisory";
import { formatMoney } from "@/lib/currency";
import type { ActivityItem, DayAlternative } from "@/types/trip";

interface DayAlternativeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dayNumber: number;
  suggestion: DayAlternative | null;
  loading: boolean;
  error?: string | null;
  onApply: (activities: ActivityItem[]) => void;
  onRetry?: () => void;
}

/** Presents an AI-proposed weather-safe replacement for a single day. */
export const DayAlternativeDialog: React.FC<DayAlternativeDialogProps> = ({
  open,
  onOpenChange,
  dayNumber,
  suggestion,
  loading,
  error,
  onApply,
  onRetry,
}) => {
  const activities = suggestion?.activities ?? [];
  const canApply = !loading && activities.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-lg w-[94vw] sm:w-full p-5 sm:p-6 max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-black flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-primary" />
            Indoor Alternative for Day {dayNumber}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {suggestion?.weather
              ? "Planned around this day's weather risk. Nothing changes until you apply it."
              : "A fresh plan for this day. Nothing changes until you apply it."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {suggestion?.weather && (
            <div className="flex items-center gap-2 flex-wrap">
              <WeatherBadge day={suggestion.weather} />
              <span className="text-[11px] text-muted-foreground font-semibold">
                {new Date(`${suggestion.weather.date}T00:00:00Z`).toDateString()}
              </span>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>Reworking Day {dayNumber} around the weather…</span>
            </div>
          )}

          {!loading && error && (
            <p className="text-xs font-semibold text-destructive bg-destructive/10 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          {!loading && !error && suggestion && (
            <>
              {suggestion.rationale && (
                <div className="p-3 rounded-2xl bg-primary/5 border border-primary/20 flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold text-foreground/85 leading-relaxed">
                    {suggestion.rationale}
                  </p>
                </div>
              )}

              {activities.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  The assistant did not return any activities. Try regenerating.
                </p>
              ) : (
                <ul className="space-y-2">
                  {activities.map((activity, index) => (
                    <li
                      key={index}
                      className="p-3 rounded-2xl border border-border/60 bg-background/60 space-y-1"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-foreground">
                          {activity.title || activity.name || `Activity ${index + 1}`}
                        </span>
                        {activity.time && (
                          <Badge variant="outline" className="text-[10px] px-2 py-0 border-border/60">
                            <Clock className="w-2.5 h-2.5 mr-1 text-primary" />
                            {activity.time}
                          </Badge>
                        )}
                        {activity.approx_cost != null && Number(activity.approx_cost) > 0 && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-2 py-0 text-emerald-600 dark:text-emerald-400"
                          >
                            {formatMoney(Number(activity.approx_cost))}
                          </Badge>
                        )}
                      </div>
                      {activity.description && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {activity.description}
                        </p>
                      )}
                      {activity.location_name && (
                        <p className="text-[11px] font-semibold text-muted-foreground inline-flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5 text-primary" />
                          {activity.location_name}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl text-xs font-semibold h-10"
          >
            Cancel
          </Button>
          {onRetry && (
            <Button
              type="button"
              variant="ghost"
              onClick={onRetry}
              disabled={loading}
              className="rounded-xl text-xs font-bold h-10 gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Regenerate</span>
            </Button>
          )}
          <Button
            type="button"
            variant="hero"
            disabled={!canApply}
            onClick={() => {
              onApply(activities);
              onOpenChange(false);
            }}
            className="rounded-xl text-xs font-bold h-10 gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply to Day {dayNumber}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DayAlternativeDialog;
