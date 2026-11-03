import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronDown,
  FileDown,
  GitBranch,
  IndianRupee,
  Loader2,
  Pencil,
  Printer,
  Share2,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { ShareExportModal } from "./ShareExportModal";
import { avatarSrc } from "@/lib/avatar";
import { tripCoverUrl } from "@/lib/tripCover";
import { formatDateOnly } from "@/lib/date";
import { endDateFromStart } from "@/lib/weather";
import { cn } from "@/lib/utils";
import type { PresenceUser } from "@/hooks/useTripEvents";
import type { ItineraryData, TripMember } from "@/types/trip";
import type {
  TripPublicationSnapshot,
  TripPublicationState,
} from "@/types/gallery";

interface TripHeaderProps {
  data: ItineraryData;
  tripId?: string;
  status?: "draft" | "planned" | "ongoing" | "completed";
  version?: number;
  hasEdited?: boolean;
  /** Owner-only public share token; absent for editors/viewers (M6 F6). */
  shareId?: string;
  onShareIdChange?: (shareId?: string) => void;
  /** Live roster for the avatar stack (E4b; empty when the tier is off). */
  presence?: PresenceUser[];
  /** The viewer's user id — their own presence entry is not shown back to them. */
  currentUserId?: string;
  /** Member roster (People data), used for the avatar stack and the count. */
  members?: TripMember[];
  /** Count from the sanitized trip summary, used before the roster arrives. */
  memberCount?: number;
  /** Planned trip start date (ISO) — renders the date range under the title. */
  startDate?: string;
  onStatusChange?: (newStatus: "draft" | "planned" | "ongoing" | "completed") => void;
  onSave?: () => void;
  isSaving?: boolean;
  hasUnsavedChanges?: boolean;
  /** Takes an editor to the surface where the plan is edited. */
  onEditPlan?: () => void;
  onBackToList?: () => void;
  onNewPlan?: () => void;
  /** Agency trips share through proposal links only; hides the personal share modal. */
  hideShare?: boolean;
  /** Current gallery publication state for the owner's publish form (M8 G2). */
  publication?: TripPublicationSnapshot;
  onPublicationChange?: (state: TripPublicationState) => void;
}

type TripStatus = NonNullable<TripHeaderProps["status"]>;

const STATUS_STYLES: Record<TripStatus, { label: string; pill: string; dot: string }> = {
  planned: {
    label: "Planned",
    pill: "border-accent/25 bg-accent/10 text-accent",
    dot: "bg-accent",
  },
  ongoing: {
    label: "Ongoing",
    pill: "border-primary/25 bg-primary/10 text-primary",
    dot: "bg-primary",
  },
  completed: {
    label: "Completed",
    pill: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  draft: {
    label: "Draft",
    pill: "border-border bg-background text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
};

const STATUS_OPTIONS: Array<{ value: TripStatus; label: string }> = [
  { value: "planned", label: "Planned" },
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
  { value: "draft", label: "Draft" },
];

/** "AS" for a name, "ad" for an email local part — never a guessed face. */
const initialsFor = (label: string): string => {
  const clean = (label || "Traveler").trim();
  if (clean.includes("@")) return clean.slice(0, 2).toUpperCase();
  const parts = clean.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "T";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
};

export const TripHeader: React.FC<TripHeaderProps> = ({
  data,
  tripId,
  status = "planned",
  version,
  hasEdited,
  shareId,
  onShareIdChange,
  presence,
  currentUserId,
  members,
  memberCount,
  startDate,
  onStatusChange,
  onSave,
  isSaving,
  hasUnsavedChanges,
  onEditPlan,
  onBackToList,
  onNewPlan,
  hideShare,
  publication,
  onPublicationChange,
}) => {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // E4b — other people currently viewing this trip (never ourselves).
  const others = (presence ?? []).filter(
    (person) => !currentUserId || String(person.userId) !== String(currentUserId)
  );
  const liveIds = new Set(others.map((person) => String(person.userId)));

  // Match cover image from the trip title and highlights; a named place wins
  // over a region mentioned in the same text.
  const getCoverImage = (): string => {
    const textToMatch = [
      data.trip_title || "",
      ...(data.highlights || []),
    ].join(" ");

    return tripCoverUrl(textToMatch, 1600);
  };

  const handleShare = () => {
    setIsShareModalOpen(true);
  };

  const handlePrint = () => {
    window.print();
  };

  /** Same A4 document the share modal builds, one click from the header. */
  const handleExportPdf = async () => {
    try {
      setIsExporting(true);
      const { exportItineraryPdf } = await import("@/lib/pdfExport");
      exportItineraryPdf(data);
      toast.success("Itinerary PDF downloaded");
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      toast.error("Could not build the PDF. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const dailyAvg = Math.round(data.budget_breakdown.total / Math.max(1, data.duration_days));
  const coverUrl = getCoverImage();
  const statusTone = STATUS_STYLES[status] ?? STATUS_STYLES.planned;

  // Date range works from the planned start; without one, the length is still
  // a true fact from the plan.
  const dayCount = Math.max(
    1,
    data.day_by_day_itinerary?.length || data.duration_days || 1
  );
  const start = startDate ? String(startDate).slice(0, 10) : null;
  const end = start ? endDateFromStart(start, dayCount) : null;
  const dateLabel = start
    ? end
      ? `${formatDateOnly(start)} – ${formatDateOnly(end)}`
      : formatDateOnly(start)
    : `${dayCount} ${dayCount === 1 ? "day" : "days"} · ${Math.max(1, dayCount - 1)} ${
        Math.max(1, dayCount - 1) === 1 ? "night" : "nights"
      }`;

  // Roster avatars when the roster is loaded, live presence until then.
  const roster = members ?? [];
  const stack = (roster.length
    ? roster.map((member) => ({
        userId: member.userId,
        label: member.label || member.email || "Traveler",
        avatarUrl: member.avatarUrl,
      }))
    : others.map((person) => ({
        userId: person.userId,
        label: person.label,
        avatarUrl: person.avatarUrl,
      }))
  ).slice(0, 4);
  const stackOverflow = Math.max(0, (roster.length || others.length) - stack.length);
  const goingCount = roster.length || memberCount || 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          {onBackToList && (
            <button
              type="button"
              onClick={onBackToList}
              className="inline-flex items-center gap-1.5 rounded-md text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              All trips
            </button>
          )}

          <div className="flex items-start gap-3 sm:gap-4">
            <img
              src={coverUrl}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="hidden h-14 w-14 shrink-0 rounded-xl border border-border object-cover shadow-xs sm:block lg:h-16 lg:w-16"
            />

            <div className="min-w-0 space-y-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="min-w-0 font-display text-[1.75rem] font-semibold leading-[1.1] tracking-tight text-foreground sm:text-4xl lg:text-[2.6rem]">
                  {data.trip_title}
                </h1>

                {onStatusChange ? (
                  <span className="relative inline-flex shrink-0 rounded-full focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                        statusTone.pill
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", statusTone.dot)} />
                      {statusTone.label}
                      <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
                    </span>
                    <select
                      aria-label="Trip status"
                      title="Change trip status"
                      value={status}
                      onChange={(e) => onStatusChange(e.target.value as TripStatus)}
                      className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full opacity-0"
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </span>
                ) : (
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                      statusTone.pill
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", statusTone.dot)} />
                    {statusTone.label}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" aria-hidden />
                  {dateLabel}
                </span>

                {goingCount > 0 && (
                  <>
                    <span className="hidden h-3 w-px bg-border sm:block" aria-hidden />
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" aria-hidden />
                      <span className="font-semibold text-foreground">{goingCount}</span>
                      {goingCount === 1 ? "member" : "members"}
                    </span>
                    {stack.length > 0 && (
                      <span className="flex -space-x-2">
                        {stack.map((person) => (
                          <span key={person.userId} className="relative">
                            <Avatar className="h-7 w-7 border border-card ring-1 ring-border">
                              {avatarSrc(person.avatarUrl) && (
                                <AvatarImage
                                  src={avatarSrc(person.avatarUrl)}
                                  alt={person.label}
                                />
                              )}
                              <AvatarFallback
                                className="bg-muted text-[10px] font-semibold text-muted-foreground"
                                title={person.label}
                              >
                                {initialsFor(person.label)}
                              </AvatarFallback>
                            </Avatar>
                            {liveIds.has(String(person.userId)) && (
                              <span
                                className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-card"
                                title={`${person.label} is viewing this trip`}
                              />
                            )}
                          </span>
                        ))}
                        {stackOverflow > 0 && (
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-[10px] font-semibold text-muted-foreground">
                            +{stackOverflow}
                          </span>
                        )}
                      </span>
                    )}
                  </>
                )}

                {others.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-accent">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                    {others.length === 1 ? "1 here now" : `${others.length} here now`}
                  </span>
                )}

                {version != null && (
                  <>
                    <span className="hidden h-3 w-px bg-border sm:block" aria-hidden />
                    <span className="inline-flex items-center gap-1.5">
                      <GitBranch className="h-3.5 w-3.5" aria-hidden />v{version}
                      {hasEdited ? " · edited" : ""}
                    </span>
                  </>
                )}

                {onSave && (
                  <>
                    <span className="hidden h-3 w-px bg-border sm:block" aria-hidden />
                    {isSaving ? (
                      <span className="inline-flex items-center gap-1.5 text-primary">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        Saving…
                      </span>
                    ) : hasUnsavedChanges ? (
                      <button
                        type="button"
                        onClick={onSave}
                        className="rounded-md font-semibold text-primary underline-offset-4 hover:underline"
                      >
                        Unsaved changes — save now
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5 text-accent" aria-hidden />
                        Saved
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Actions — the three concept actions first, quieter extras after. */}
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
          {!hideShare && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="h-9 rounded-lg border-border bg-card px-3 text-xs font-semibold text-foreground"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden />
              <span>Share</span>
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleExportPdf()}
            disabled={isExporting}
            className="h-9 rounded-lg border-border bg-card px-3 text-xs font-semibold text-foreground"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <FileDown className="h-3.5 w-3.5" aria-hidden />
            )}
            <span>{isExporting ? "Preparing…" : "Export PDF"}</span>
          </Button>

          {onSave && onEditPlan && (
            <Button
              type="button"
              size="sm"
              onClick={onEditPlan}
              className="h-9 rounded-lg px-3 text-xs font-semibold"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              <span>Edit plan</span>
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handlePrint}
            title="Print this itinerary"
            aria-label="Print this itinerary"
            className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
          >
            <Printer className="h-4 w-4" aria-hidden />
          </Button>

          {onNewPlan && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onNewPlan}
              aria-label="Plan a new trip"
              className="h-9 rounded-lg px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">New plan</span>
            </Button>
          )}
        </div>
      </div>

      {/* Quieter version of the old stat strip: hairline-tiled figures. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
        <div className="bg-card px-4 py-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <IndianRupee className="h-3 w-3" aria-hidden />
            Total for the group
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            ₹{data.budget_breakdown.total.toLocaleString("en-IN")}
          </div>
          <p className="text-[11px] text-muted-foreground">Planned budget</p>
        </div>

        <div className="bg-card px-4 py-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Users className="h-3 w-3" aria-hidden />
            Per person
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            ₹{data.budget_per_person.toLocaleString("en-IN")}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            Based on {data.group_type}
          </p>
        </div>

        <div className="bg-card px-4 py-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <TrendingUp className="h-3 w-3" aria-hidden />
            Daily average
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            ₹{dailyAvg.toLocaleString("en-IN")}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Across {data.duration_days} {data.duration_days === 1 ? "day" : "days"}
          </p>
        </div>

        <div className="bg-card px-4 py-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Calendar className="h-3 w-3" aria-hidden />
            Duration
          </div>
          <div className="mt-1 text-lg font-semibold text-foreground">
            {data.duration_days} {data.duration_days === 1 ? "Day" : "Days"} /{" "}
            {Math.max(1, data.duration_days - 1)}{" "}
            {Math.max(1, data.duration_days - 1) === 1 ? "Night" : "Nights"}
          </div>
          {data.season ? (
            <p className="text-[11px] text-muted-foreground">{data.season} season</p>
          ) : null}
        </div>
      </div>

      {/* Share & Export Modal */}
      {!hideShare && (
        <ShareExportModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          tripId={tripId}
          data={data}
          initialShareId={shareId}
          onShareIdChange={onShareIdChange}
          canManageShare={Boolean(onStatusChange)}
          publication={publication}
          onPublicationChange={onPublicationChange}
        />
      )}
    </div>
  );
};
