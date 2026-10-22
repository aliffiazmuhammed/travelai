import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  History,
  RotateCcw,
  Loader2,
  Clock,
  CalendarDays,
  IndianRupee,
  AlertCircle,
  GitBranch,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api";
import { isRevConflict, toastConflict } from "@/lib/conflicts";
import type { Trip, TripVersionSummary } from "@/types/trip";

interface TripVersionsProps {
  tripId?: string;
  currentVersion?: number;
  hasEdited?: boolean;
  /** Restore is an editor action on the server (Milestone 6 §3.3). */
  canRestore?: boolean;
  onRestored: (trip: Trip) => void;
}

/** Human friendly relative time (e.g. "3 min ago", "2 days ago"). */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Unknown time";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

export const TripVersions: React.FC<TripVersionsProps> = ({
  tripId,
  currentVersion,
  hasEdited,
  canRestore = true,
  onRestored,
}) => {
  const [versions, setVersions] = useState<TripVersionSummary[]>([]);
  const [current, setCurrent] = useState<number>(currentVersion ?? 1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [targetVersion, setTargetVersion] = useState<TripVersionSummary | null>(null);
  const [restoring, setRestoring] = useState<boolean>(false);

  const isRealTrip = Boolean(tripId && !tripId.startsWith("temp-"));

  const loadVersions = useCallback(async () => {
    if (!isRealTrip || !tripId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await api.getTripVersions(tripId);
      setVersions(data.versions || []);
      setCurrent(data.currentVersion ?? 1);
    } catch (err) {
      console.error("Failed to load versions:", err);
      setError(err instanceof Error ? err.message : "Could not load version history.");
    } finally {
      setLoading(false);
    }
  }, [isRealTrip, tripId]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const confirmRestore = async () => {
    if (!tripId || !targetVersion) return;
    try {
      setRestoring(true);
      const updated = await api.restoreTripVersion(tripId, targetVersion.version);
      toast.success(`Restored to version ${targetVersion.version}.`);
      onRestored(updated);
      await loadVersions();
    } catch (err) {
      console.error("Failed to restore version:", err);
      if (isRevConflict(err)) {
        toastConflict(err, async () => {
          try {
            const fresh = await api.getTrip(tripId!);
            onRestored(fresh);
            await loadVersions();
            toast.success("Reloaded the latest version of this trip.");
          } catch (reloadErr) {
            toast.error(
              reloadErr instanceof Error ? reloadErr.message : "Could not reload the trip."
            );
          }
        });
      } else {
        toast.error(err instanceof Error ? err.message : "Could not restore that version.");
      }
    } finally {
      setRestoring(false);
      setTargetVersion(null);
    }
  };

  if (!isRealTrip) {
    return (
      <div className="p-8 text-center rounded-3xl bg-card/60 border border-dashed border-border/80 space-y-3">
        <div className="w-14 h-14 rounded-3xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
          <History className="w-7 h-7" />
        </div>
        <h3 className="text-base font-bold text-foreground">Version history unavailable</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Save this trip to your library to start tracking edits and restoring previous versions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Version Control
            </span>
            <Badge variant="outline" className="text-[10px]">
              <GitBranch className="w-3 h-3 mr-1" />
              v{current}
            </Badge>
            {hasEdited && (
              <Badge className="bg-amber-500/10 text-amber-600 border-amber-300 dark:border-amber-700 text-[10px] font-semibold">
                Edited
              </Badge>
            )}
          </div>
          <h3 className="text-xl sm:text-2xl font-extrabold text-foreground">
            Itinerary History
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {canRestore
              ? "Every save creates a snapshot. Restore any snapshot to roll back your itinerary."
              : "Every save creates a snapshot. Ask an editor or the owner to restore one."}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={loadVersions}
          disabled={loading}
          className="rounded-xl text-xs font-bold h-9 gap-1.5 self-start sm:self-auto"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RotateCcw className="w-3.5 h-3.5" />
          )}
          <span>Refresh</span>
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-xs text-destructive font-medium">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && versions.length === 0 ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 rounded-3xl bg-muted/50 animate-pulse border border-border/60"
            />
          ))}
        </div>
      ) : versions.length === 0 ? (
        <div className="p-10 text-center rounded-3xl bg-card/60 border border-dashed border-border/80 space-y-3">
          <div className="w-14 h-14 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <History className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-foreground">No previous versions yet</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {canRestore
              ? `You're on version ${current}. Your first edit or reorder will create a restorable snapshot.`
              : `You're on version ${current}. Edits by the owner or editors will appear here.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Current live version (not restorable to itself) */}
          <Card className="rounded-3xl border-primary/40 bg-primary/5 shadow-xs">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <GitBranch className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-foreground">Version {current}</span>
                    <Badge className="bg-primary/15 text-primary border-primary/20 text-[10px] font-bold">
                      Current
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Live itinerary you see now</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {versions.map((v) => (
            <Card
              key={v.version}
              className="rounded-3xl border-border/70 hover:border-primary/40 bg-card/80 backdrop-blur-sm shadow-xs transition-all"
            >
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                    <History className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-foreground">Version {v.version}</span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                        <Clock className="w-3 h-3" />
                        {relativeTime(v.savedAt)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-1 max-w-md">
                      {v.note || "Itinerary snapshot"}
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="w-3 h-3 text-primary" />
                        {v.days} days
                      </span>
                      {v.budget != null && (
                        <span className="inline-flex items-center gap-1">
                          <IndianRupee className="w-3 h-3 text-emerald-500" />
                          {Number(v.budget).toLocaleString("en-IN")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {canRestore ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTargetVersion(v)}
                    className="rounded-xl text-xs font-bold h-9 gap-1.5 self-start sm:self-auto shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restore</span>
                  </Button>
                ) : (
                  <Badge variant="outline" className="text-[10px] self-start sm:self-auto shrink-0">
                    read-only
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Restore Confirmation */}
      <AlertDialog
        open={!!targetVersion}
        onOpenChange={(open) => {
          if (!open) setTargetVersion(null);
        }}
      >
        <AlertDialogContent className="rounded-3xl max-w-md w-[92vw] sm:w-full p-5 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">
              Restore Version {targetVersion?.version}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              This replaces your current itinerary with the{" "}
              <strong className="text-foreground">Version {targetVersion?.version}</strong> snapshot.
              Your current state is backed up automatically, so you can restore forward again if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl text-xs font-semibold h-10" disabled={restoring}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRestore}
              disabled={restoring}
              className="rounded-xl text-xs font-bold h-10 gap-1.5"
            >
              {restoring ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              <span>{restoring ? "Restoring..." : "Restore Version"}</span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TripVersions;
