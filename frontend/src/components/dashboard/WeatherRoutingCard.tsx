import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeftRight,
  CheckCircle2,
  Clock3,
  CloudRain,
  Home,
  Loader2,
  Route,
} from "lucide-react";
import { formatDistance, formatDuration } from "@/lib/geo";
import { riskMeta } from "@/lib/weather";
import { suggestionActionLabel } from "@/lib/weatherRouting";
import { cn } from "@/lib/utils";
import type { WeatherRoutingAnalysis, WeatherRoutingSuggestion } from "@/types/trip";

interface WeatherRoutingCardProps {
  analysis: WeatherRoutingAnalysis;
  /** Refreshing in the background (keeps the last analysis visible). */
  loading?: boolean;
  /**
   * False when no forecast could be resolved (no located activity or no trip
   * window) — the "all clear" copy would otherwise be misleading.
   */
  weatherAvailable?: boolean;
  /** When false the action buttons are hidden (shared/read-only view). */
  canEdit?: boolean;
  onSwapDays?: (fromDay: number, toDay: number) => void;
  onSuggestIndoor?: (day: number) => void;
}

const SUGGESTION_ICONS: Record<WeatherRoutingSuggestion["type"], React.ReactNode> = {
  swap_days: <ArrowLeftRight className="w-3.5 h-3.5" />,
  indoor_swap: <Home className="w-3.5 h-3.5" />,
  buffer_time: <Clock3 className="w-3.5 h-3.5" />,
};

/**
 * Weather-aware routing summary (Milestone 4.6).
 *
 * Renders the backend analysis — which days are exposed, which legs run through
 * bad weather, and the concrete fixes (swap days, go indoors, pad travel time).
 * Nothing is applied automatically: each suggestion is an explicit user action.
 */
export const WeatherRoutingCard: React.FC<WeatherRoutingCardProps> = ({
  analysis,
  loading,
  weatherAvailable = true,
  canEdit,
  onSwapDays,
  onSuggestIndoor,
}) => {
  const { summary, dayFlags, riskyLegs, suggestions } = analysis;
  const riskyDays = dayFlags.filter((flag) => !flag.weatherSafe);
  const allClear = riskyDays.length === 0;
  const hasWeatherData = weatherAvailable && dayFlags.length > 0;

  const handleAction = (suggestion: WeatherRoutingSuggestion) => {
    if (suggestion.action?.kind === "swap_days") {
      onSwapDays?.(suggestion.action.fromDay, suggestion.action.toDay);
    } else if (suggestion.action?.kind === "indoor_swap") {
      onSuggestIndoor?.(suggestion.action.day);
    }
  };

  return (
    <Card className="rounded-3xl border-border/70 bg-card/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-black flex items-center gap-2">
          <CloudRain className="w-4 h-4 text-primary" />
          Weather-Aware Plan Check
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription className="text-xs">{summary.headline}</CardDescription>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {!hasWeatherData ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <CloudRain className="w-4 h-4" />
            <span>
              No forecast available for these dates yet — add activities with locations, or check
              back closer to departure.
            </span>
          </div>
        ) : allClear ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>No travel legs are exposed to poor weather.</span>
          </div>
        ) : (
          <>
            {/* Days that carry risk */}
            <div className="flex flex-wrap items-center gap-2">
              {riskyDays.map((flag) => {
                const meta = riskMeta(flag.riskLevel);
                return (
                  <Badge
                    key={flag.day}
                    variant="outline"
                    className={cn("text-[11px] px-2.5 py-1 rounded-full gap-1.5", meta.badgeClass)}
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full", meta.dotClass)} />
                    Day {flag.day} · {meta.label}
                    {flag.travelExposureKm > 0 && (
                      <span className="font-bold">{formatDistance(flag.travelExposureKm)}</span>
                    )}
                  </Badge>
                );
              })}
            </div>

            {/* Legs sitting in bad weather */}
            {riskyLegs.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Route className="w-3.5 h-3.5 text-primary" />
                  Exposed travel
                  <span className="text-muted-foreground font-semibold">
                    · {summary.totalRiskyLegs} leg{summary.totalRiskyLegs === 1 ? "" : "s"} ·{" "}
                    {formatDistance(summary.exposureKm)}
                  </span>
                </p>
                <div className="space-y-1.5">
                  {riskyLegs.slice(0, 4).map((leg) => (
                    <div
                      key={`${leg.day}-${leg.fromIndex}-${leg.toIndex}`}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-border/60 bg-background/60"
                    >
                      <span className="text-[11px] font-semibold text-foreground truncate">
                        Day {leg.day} · stop {leg.fromIndex + 1} → {leg.toIndex + 1}
                      </span>
                      <span className="text-[11px] font-bold text-muted-foreground shrink-0">
                        {formatDistance(leg.km)} · {formatDuration(leg.minutes)}
                      </span>
                    </div>
                  ))}
                  {riskyLegs.length > 4 && (
                    <p className="text-[11px] text-muted-foreground">
                      +{riskyLegs.length - 4} more exposed leg
                      {riskyLegs.length - 4 === 1 ? "" : "s"}.
                    </p>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground italic">{riskyLegs[0].reason}</p>
              </div>
            )}

            {/* Suggested fixes */}
            {suggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-foreground">Suggested adjustments</p>
                {suggestions.map((suggestion, index) => {
                  const meta = riskMeta(suggestion.severity);
                  const actionLabel = suggestionActionLabel(suggestion);
                  return (
                    <div
                      key={`${suggestion.type}-${suggestion.day}-${index}`}
                      className="p-3 rounded-2xl border border-border/60 bg-background/60 space-y-1.5"
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0 text-primary">
                          {SUGGESTION_ICONS[suggestion.type]}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-foreground">{suggestion.title}</p>
                          <p className="text-[11px] text-muted-foreground">{suggestion.detail}</p>
                        </div>
                      </div>
                      {canEdit && actionLabel && (
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-xl text-[11px] font-bold h-8 gap-1.5"
                            onClick={() => handleAction(suggestion)}
                          >
                            {SUGGESTION_ICONS[suggestion.type]}
                            <span>{actionLabel}</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default WeatherRoutingCard;
