import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, Loader2, MessageCircle, Route } from "lucide-react";
import { DayTimeline } from "@/components/dashboard/DayTimeline";
import { TravelGuideSafety } from "@/components/dashboard/TravelGuideSafety";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/currency";
import { withItineraryDefaults } from "@/lib/itineraryDefaults";
import { api, ApiError } from "@/services/api";
import type {
  AgencyDirectoryPackage,
  AgencyDirectoryPackageDetail,
} from "@/types/agency";

/**
 * The day-by-day plan behind a published package (M9 follow-up).
 *
 * The plan is read from the same public endpoint as the card, so it carries no
 * costs, budgets or client details by construction. It is a snapshot: editing
 * the agency's trip does not change it until the package is published again.
 *
 * The enquiry button hands the package back to the profile page so the visitor
 * finishes in the one form the agency already knows.
 */

interface AgencyPackageDialogProps {
  open: boolean;
  onClose: () => void;
  slug: string;
  pkg: AgencyDirectoryPackage | null;
  onEnquire: (pkg: AgencyDirectoryPackage) => void;
}

const nightsLabel = (nights: number): string =>
  nights <= 0 ? "Day trip" : `${nights} ${nights === 1 ? "night" : "nights"}`;

const AgencyPackageDialog: React.FC<AgencyPackageDialogProps> = ({
  open,
  onClose,
  slug,
  pkg,
  onEnquire,
}) => {
  const [detail, setDetail] = useState<AgencyDirectoryPackageDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const packageId = pkg?.id ?? null;

  useEffect(() => {
    if (!open || !packageId) {
      setDetail(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getPublicAgencyPackage(slug, packageId);
        if (!cancelled) setDetail(data.package);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load the package plan:", err);
        setDetail(null);
        setError(
          err instanceof ApiError && err.status === 404
            ? "This package is no longer published. The agency may have hidden it."
            : err instanceof ApiError && err.message
              ? err.message
              : "This plan could not be loaded right now."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, slug, packageId, reloadKey]);

  const itinerary = useMemo(
    () => (detail?.itinerary ? withItineraryDefaults(detail.itinerary) : null),
    [detail]
  );

  const title = detail?.title || pkg?.title || "Trip package";
  const price =
    detail?.pricePerPerson === null || detail?.pricePerPerson === undefined
      ? "Price on request"
      : `From ${formatMoney(detail.pricePerPerson, detail.currency)} per person`;

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">{title}</DialogTitle>
          <DialogDescription className="text-xs">
            {detail?.summary ||
              "The day-by-day plan this agency published, without prices."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-14">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Opening the plan…</p>
          </div>
        ) : error ? (
          <div className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <AlertCircle className="mx-auto h-5 w-5 text-destructive" />
            <p className="text-xs text-muted-foreground">{error}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl text-xs font-bold"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Try again
            </Button>
          </div>
        ) : detail ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1 text-[11px]">
                <CalendarDays className="h-3 w-3" />
                {nightsLabel(detail.nights)}
              </Badge>
              <span className="text-xs font-bold text-foreground">{price}</span>
            </div>

            {detail.highlights.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {detail.highlights.map((highlight) => (
                  <span
                    key={highlight}
                    className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                  >
                    {highlight}
                  </span>
                ))}
              </div>
            ) : null}

            {itinerary ? (
              <div className="space-y-6">
                <section className="space-y-3">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                    <Route className="h-4 w-4 text-primary" />
                    Day by day
                  </h3>
                  <DayTimeline itinerary={itinerary.day_by_day_itinerary} />
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-bold text-foreground">
                    Practicalities &amp; safety
                  </h3>
                  <TravelGuideSafety
                    guide={itinerary.local_transport}
                    weather={itinerary.weather_advisory}
                    footnotes={itinerary.footnotes_safety_tips}
                  />
                </section>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/80 bg-muted/30 p-6 text-center">
                <p className="text-xs font-bold text-foreground">
                  No day-by-day plan was attached
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The agency published this package without the daily details.
                  Ask them about the itinerary and they will send one.
                </p>
              </div>
            )}

            {detail.inclusions.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-sm font-bold text-foreground">
                  What&apos;s included
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {detail.inclusions.map((inclusion) => (
                    <Badge
                      key={inclusion}
                      variant="secondary"
                      className="bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-200"
                    >
                      {inclusion}
                    </Badge>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {pkg ? (
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              className="rounded-xl text-xs font-bold"
              onClick={onClose}
            >
              Close
            </Button>
            <Button
              type="button"
              className="rounded-xl text-xs font-bold gap-1.5"
              onClick={() => onEnquire(pkg)}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Ask about this trip
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

export default AgencyPackageDialog;
