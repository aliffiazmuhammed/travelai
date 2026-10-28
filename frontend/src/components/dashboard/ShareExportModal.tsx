import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Share2,
  Copy,
  Check,
  FileText,
  FileDown,
  Download,
  Printer,
  Globe,
  ExternalLink,
  Loader2,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api";
import { useAuth } from "@/context/UserContext";
import { avatarSrc, initialsFor } from "@/lib/avatar";
import type { ItineraryData } from "@/types/trip";
import type { TripPublicationSnapshot, TripPublicationState } from "@/types/gallery";

interface ShareExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId?: string;
  data: ItineraryData;
  initialShareId?: string;
  /** Keeps the dashboard's open trip in sync after generate/revoke (M7.2). */
  onShareIdChange?: (shareId?: string) => void;
  /** Creating/reading the share link is owner-only on the server (Milestone 6 §3.3). */
  canManageShare?: boolean;
  /** Current publication state, so the form prefills on open (Milestone 8 G2). */
  publication?: TripPublicationSnapshot;
  /** Keeps the dashboard's trip in sync after publish/unpublish. */
  onPublicationChange?: (state: TripPublicationState) => void;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Mirrors the server's date label. Hidden mode shows the month and duration
 * only; exact mode shows the concrete range so the owner sees what is exposed.
 * Duration follows the same precedence as `projection.durationOf` so the
 * preview cannot claim a different day count than the published card.
 */
function previewDateLabel(
  startDate: string | undefined,
  endDate: string | undefined,
  declaredDays: number | undefined,
  itineraryDays: number | undefined,
  hideExactDates: boolean
): string {
  if (!startDate) return "Dates flexible";
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return "Dates flexible";

  const declared = Number(declaredDays);
  const listed = Number(itineraryDays);
  let duration = 0;
  if (Number.isFinite(declared) && declared > 0) duration = Math.round(declared);
  else if (Number.isFinite(listed) && listed > 0) duration = Math.round(listed);
  else if (endDate) {
    const end = new Date(endDate);
    if (!Number.isNaN(end.getTime())) {
      duration = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    }
  }
  duration = Math.max(1, duration);

  const unit = duration === 1 ? "day" : "days";
  const monthLabel = `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
  if (hideExactDates) return `${monthLabel} · ${duration} ${unit}`;

  const end = new Date(start.getTime() + (duration - 1) * 86_400_000);
  const formatDay = (date: Date) =>
    `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  return `${formatDay(start)} → ${formatDay(end)} · ${duration} ${unit}`;
}

/** Same normalization the server applies, so the preview matches the payload. */
function parseGalleryTags(raw: string): { tags: string[]; error?: string } {
  const tags: string[] = [];
  for (const entry of raw.split(",")) {
    const tag = entry
      .trim()
      .replace(/^#+/, "")
      .replace(/\s+/g, "-")
      .toLowerCase();
    if (!tag) continue;
    if (tag.length > 24) return { tags, error: "Tags can be 24 characters or fewer." };
    if (!/^[a-z0-9_-]+$/.test(tag)) {
      return { tags, error: "Tags can use letters, numbers, hyphens and underscores only." };
    }
    if (!tags.includes(tag)) tags.push(tag);
  }
  if (tags.length > 6) return { tags, error: "Add 6 tags or fewer." };
  return { tags };
}

export const ShareExportModal: React.FC<ShareExportModalProps> = ({
  isOpen,
  onClose,
  tripId,
  data,
  initialShareId,
  onShareIdChange,
  canManageShare = true,
  publication,
  onPublicationChange,
}) => {
  const { user } = useAuth();
  const [shareId, setShareId] = useState<string | undefined>(initialShareId);
  const [loadingShare, setLoadingShare] = useState(false);

  /**
   * M7.2: the modal stays mounted while trips change, so the initial state
   * alone is not enough. Re-sync whenever it opens (or the trip changes) from
   * the owner's freshest `shareId`, which is what makes an active link render
   * as active instead of "Not yet generated".
   */
  useEffect(() => {
    if (isOpen) setShareId(initialShareId);
  }, [isOpen, initialShareId, tripId]);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  /* ------------------------------------------------------------------------ */
  /*  Publish to gallery (Milestone 8 G2)                                      */
  /* ------------------------------------------------------------------------ */

  const initialVisibility = publication?.visibility ?? "private";
  const initialPublishedAt = publication?.publishedAt ?? null;
  const initialHideExactDates = publication?.gallery?.hideExactDates === true;
  const initialSummary = publication?.gallery?.summary ?? "";
  const initialTagInput = (publication?.gallery?.tags ?? []).join(", ");

  const [published, setPublished] = useState(initialVisibility === "public");
  const [publishedAt, setPublishedAt] = useState<string | null>(initialPublishedAt);
  const [hideExactDates, setHideExactDates] = useState(initialHideExactDates);
  const [summary, setSummary] = useState(initialSummary);
  const [tagInput, setTagInput] = useState(initialTagInput);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [confirmUnpublishOpen, setConfirmUnpublishOpen] = useState(false);

  // Re-open with the owner's freshest state; the modal stays mounted as trips
  // change, so the initial values alone are not enough.
  useEffect(() => {
    if (!isOpen) return;
    setPublished(initialVisibility === "public");
    setPublishedAt(initialPublishedAt);
    setHideExactDates(initialHideExactDates);
    setSummary(initialSummary);
    setTagInput(initialTagInput);
    setPublishError(null);
  }, [
    isOpen,
    tripId,
    initialVisibility,
    initialPublishedAt,
    initialHideExactDates,
    initialSummary,
    initialTagInput,
  ]);

  const handle = user?.handle ?? "";
  const publisherName =
    user?.name?.trim() || user?.label || user?.email?.split("@")[0] || "Traveler";
  const destination =
    publication?.destination?.trim() || data.trip_title || "Untitled trip";
  // `data` is normalized for display; the snapshot carries the persisted value
  // so the preview uses the same duration the published card will.
  const declaredDays = publication ? publication.durationDays : data.duration_days;
  const datePreview = previewDateLabel(
    publication?.startDate,
    publication?.endDate,
    declaredDays,
    Array.isArray(data.day_by_day_itinerary) ? data.day_by_day_itinerary.length : undefined,
    hideExactDates
  );
  const parsedTags = parseGalleryTags(tagInput);
  const publishedOn = publishedAt
    ? new Date(publishedAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;
  // G6: a hidden trip keeps its data and publication settings; only public
  // reads drop it, so the owner sees this banner instead of a lost trip.
  const moderation = publication?.moderation;
  const hiddenOn = moderation?.hiddenAt
    ? new Date(moderation.hiddenAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const handleSaveGallery = async (nextPublished: boolean) => {
    if (!tripId) {
      toast.error("Save the trip before publishing it.");
      return;
    }
    setPublishError(null);
    if (parsedTags.error) {
      setPublishError(parsedTags.error);
      return;
    }
    if (summary.trim().length > 280) {
      setPublishError("Keep the summary to 280 characters or fewer.");
      return;
    }

    setPublishBusy(true);
    try {
      const res = await api.setTripPublication(tripId, {
        published: nextPublished,
        hideExactDates,
        summary: summary.trim(),
        tags: parsedTags.tags,
      });
      const state = res.publication;
      setPublished(state.visibility === "public");
      setPublishedAt(state.publishedAt);
      setHideExactDates(state.gallery.hideExactDates);
      setSummary(state.gallery.summary);
      setTagInput(state.gallery.tags.join(", "));
      onPublicationChange?.(state);
      setConfirmUnpublishOpen(false);
      toast.success(
        nextPublished
          ? "Trip published to your traveler page."
          : "Trip removed from the gallery."
      );
    } catch (err: any) {
      console.error("Failed to update gallery publication:", err);
      setPublishError(
        err?.message ||
          (nextPublished
            ? "We could not publish this trip. Please try again."
            : "We could not unpublish this trip. Please try again.")
      );
    } finally {
      setPublishBusy(false);
    }
  };

  /** Purpose-built A4 PDF (lib/pdfExport) — replaces the old print-screen dump. */
  const handleDownloadPdf = async () => {
    setPdfBusy(true);
    try {
      const { exportItineraryPdf } = await import("@/lib/pdfExport");
      exportItineraryPdf(data);
      toast.success("Itinerary PDF downloaded!");
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      toast.error("Could not generate the PDF. Please try again.");
    } finally {
      setPdfBusy(false);
    }
  };

  const publicUrl = shareId
    ? `${window.location.origin}/shared/${shareId}`
    : "";

  const [revokingShare, setRevokingShare] = useState(false);
  const [confirmRevokeOpen, setConfirmRevokeOpen] = useState(false);

  /** F7 (E5): taking the link back down — old URLs die permanently. */
  const handleRevokeShare = async () => {
    if (!tripId) return;
    try {
      setRevokingShare(true);
      await api.revokeShare(tripId);
      setShareId(undefined);
      onShareIdChange?.(undefined);
      setConfirmRevokeOpen(false);
      toast.success("Public link revoked — old URLs no longer work.");
    } catch (err: any) {
      console.error("Failed to revoke share link:", err);
      toast.error(err.message || "Failed to revoke the public link.");
    } finally {
      setRevokingShare(false);
    }
  };

  const handleGenerateLink = async () => {
    if (!tripId) {
      toast.error("Trip must be saved to generate a shareable link.");
      return;
    }
    try {
      setLoadingShare(true);
      const res = await api.shareTrip(tripId);
      setShareId(res.shareId);
      onShareIdChange?.(res.shareId);
      toast.success("Shareable link generated successfully!");
    } catch (err: any) {
      console.error("Failed to generate share link:", err);
      toast.error(err.message || "Failed to generate link.");
    } finally {
      setLoadingShare(false);
    }
  };

  const handleCopyLink = () => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    setCopiedLink(true);
    toast.success("Public link copied to clipboard!");
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Generate plain-text structured summary for WhatsApp / Telegram / Email
  const handleCopyFormattedText = () => {
    const textLines = [
      `🌍 Travel Itinerary: ${data.trip_title}`,
      `⏳ Duration: ${data.duration_days} Days / ${Math.max(1, data.duration_days - 1)} Nights`,
      `👥 Group: ${data.group_type} | 🌤️ Season: ${data.season}`,
      `💰 Budget: ₹${data.budget_per_person.toLocaleString("en-IN")}/person (Total: ₹${data.budget_breakdown.total.toLocaleString("en-IN")})`,
      "",
      `✨ Highlights:`,
      ...data.highlights.map((h) => `• ${h}`),
      "",
      `📅 Day-by-Day Schedule:`,
      ...data.day_by_day_itinerary.map(
        (day) =>
          `Day ${day.day}: ${day.title}\n` +
          `  Activities: ${day.activities.map((a) => (typeof a === "object" && a !== null ? (a.title || a.name) : a)).join(" • ")}\n` +
          `  Stay: ${day.stay_recommendations.map((s) => (typeof s === "object" && s !== null ? s.name : s)).join(", ") || "Local stay"}\n` +
          `  Food Spots: ${day.food_spots.map((f) => (typeof f === "object" && f !== null ? f.name : f)).join(", ") || "Regional dining"}`
      ),
      "",
      `💸 Budget Allocation:`,
      `• Accommodation: ₹${data.budget_breakdown.accommodation.toLocaleString("en-IN")}`,
      `• Food & Drinks: ₹${data.budget_breakdown.food_and_drinks.toLocaleString("en-IN")}`,
      `• Activities: ₹${data.budget_breakdown.activities_and_entry.toLocaleString("en-IN")}`,
      `• Local Transport: ₹${data.budget_breakdown.local_transport.toLocaleString("en-IN")}`,
      `• Emergency Buffer: ₹${data.budget_breakdown.miscellaneous_buffer.toLocaleString("en-IN")}`,
      "",
      publicUrl ? `🔗 View interactive itinerary online: ${publicUrl}` : `Crafted with TravelAI`,
    ];

    const formatted = textLines.join("\n");
    navigator.clipboard.writeText(formatted);
    setCopiedText(true);
    toast.success("Formatted summary copied! Ready to paste into chat or email.");
    setTimeout(() => setCopiedText(false), 2500);
  };

  // Download JSON export
  const handleDownloadJson = () => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeTitle = data.trip_title.toLowerCase().replace(/[^a-z0-9]/g, "-");
    link.href = url;
    link.download = `${safeTitle}-itinerary.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Itinerary JSON downloaded!");
  };

  const handlePrint = () => {
    onClose();
    setTimeout(() => {
      window.print();
    }, 200);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-3xl max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden w-[95vw] sm:w-full p-4 sm:p-8 space-y-4 sm:space-y-6">
        <DialogHeader className="text-left space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary w-fit">
            <Share2 className="w-3.5 h-3.5" />
            <span>Share & Export</span>
          </div>
          <DialogTitle className="text-xl sm:text-2xl font-black text-foreground">
            Share Your Travel Itinerary
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Distribute your trip with friends, download files, or print a travel guide.
          </DialogDescription>
        </DialogHeader>

        {/* 1. Public Share Link Section (owner-only — link creation is a server gate) */}
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/70 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-primary" />
              <span>Public Read-Only Web Link</span>
            </span>
            <span className="text-[10px] text-muted-foreground">
              {shareId ? "Active" : canManageShare ? "Not yet generated" : "Owner only"}
            </span>
          </div>

          {canManageShare ? (
            shareId ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={publicUrl}
                  className="h-10 text-xs bg-card rounded-xl border-border/80 font-mono"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="hero"
                  onClick={handleCopyLink}
                  className="h-10 px-3.5 rounded-xl text-xs font-bold gap-1.5 shrink-0"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedLink ? "Copied" : "Copy"}</span>
                </Button>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={revokingShare}
                onClick={() => setConfirmRevokeOpen(true)}
                className="h-8 px-2.5 rounded-lg text-[11px] font-bold text-destructive hover:text-destructive gap-1.5"
              >
                {revokingShare ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Globe className="w-3.5 h-3.5" />
                )}
                <span>Stop sharing (revoke link)</span>
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={loadingShare}
              onClick={handleGenerateLink}
              className="w-full h-10 rounded-xl text-xs font-bold gap-2"
            >
              {loadingShare ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-primary" />
              )}
              <span>{loadingShare ? "Creating Public Link..." : "Create Public Share Link"}</span>
            </Button>
            )
          ) : (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Only the trip owner can create or see the share link.
            </p>
          )}
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Anyone with this link can view the interactive itinerary without needing an account.
          </p>
        </div>

        {/* 1b. Publish to gallery (Milestone 8 G2) — owner only */}
        {canManageShare && (
          <div className="p-4 rounded-2xl bg-muted/30 border border-border/70 space-y-3">
            {hiddenOn && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                <p className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                  Hidden from the gallery{hiddenOn ? ` since ${hiddenOn}` : ""}
                </p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {moderation?.source === "admin"
                    ? "A platform admin de-listed this trip after a review."
                    : "This trip was hidden automatically after several reports."}{" "}
                  Your itinerary, budget and travelers are untouched and the trip
                  is still yours to edit. A platform admin will review the
                  reports; if the listing is restored it reappears without you
                  re-publishing.
                </p>
                <Link
                  to="/guidelines"
                  className="inline-block text-[11px] font-bold text-primary hover:underline"
                >
                  Read the community guidelines
                </Link>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-primary" />
                <span>Publish to gallery</span>
              </span>
              <span className="text-[10px] text-muted-foreground">
                {published
                  ? publishedOn
                    ? `Published ${publishedOn}`
                    : "Published"
                  : "Not published"}
              </span>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Lists this trip on your public traveler page. The day-by-day places,
              stays, transport and tips become public; budget, expenses, members,
              chat and your email never do.
            </p>

            {!handle && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                <p className="text-[11px] font-bold text-foreground">
                  Choose a traveler handle first
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  A published trip needs a public @handle so it has a profile to
                  live on.
                </p>
                <Button asChild variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-bold">
                  <Link to="/profile">Open profile settings</Link>
                </Button>
              </div>
            )}

            {/* Exactly what the public card shows */}
            <div className="rounded-2xl border border-border/70 bg-card p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Public preview
              </p>
              <div className="flex items-center gap-2">
                <Avatar className="h-7 w-7 ring-1 ring-primary/20">
                  {user?.avatarUrl && (
                    <AvatarImage src={avatarSrc(user.avatarUrl)} alt={publisherName} />
                  )}
                  <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                    {initialsFor(publisherName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate text-foreground">{publisherName}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {handle ? `@${handle}` : "No handle yet"}
                  </p>
                </div>
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-black text-foreground leading-snug">{destination}</p>
                <p className="text-[11px] text-muted-foreground">
                  {datePreview}
                  {data.season ? ` · ${data.season}` : ""}
                  {data.group_type ? ` · ${data.group_type}` : ""}
                </p>
              </div>
              {summary.trim() && (
                <p className="text-[11px] leading-relaxed text-foreground/80 line-clamp-3">
                  {summary.trim()}
                </p>
              )}
              {parsedTags.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {parsedTags.tags.slice(0, 6).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="gallery-summary" className="text-xs font-bold">
                Short summary
              </Label>
              <Textarea
                id="gallery-summary"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                maxLength={280}
                rows={2}
                placeholder="What makes this trip worth copying?"
                className="rounded-xl text-xs resize-none bg-card"
              />
              <p className="text-right text-[10px] text-muted-foreground">
                {summary.length}/280
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="gallery-tags" className="text-xs font-bold">
                Tags
              </Label>
              <Input
                id="gallery-tags"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                placeholder="hills, slow-travel, weekend"
                className="h-9 rounded-xl text-xs bg-card"
              />
              <p className="text-[10px] text-muted-foreground">
                Comma separated, up to 6.
              </p>
            </div>

            <div className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5">
              <div className="space-y-0.5">
                <Label htmlFor="hide-exact-dates" className="text-xs font-bold">
                  Hide exact dates
                </Label>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {hideExactDates
                    ? `Shows “${datePreview}” with no start or end date.`
                    : `Shows the exact dates: ${datePreview}.`}
                </p>
              </div>
              <Switch
                id="hide-exact-dates"
                checked={hideExactDates}
                onCheckedChange={setHideExactDates}
                className="mt-0.5"
              />
            </div>

            {publishError && (
              <p className="text-[11px] font-semibold text-destructive">{publishError}</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="hero"
                size="sm"
                disabled={publishBusy || !handle || !tripId}
                onClick={() => void handleSaveGallery(true)}
                className="h-9 rounded-xl text-xs font-bold gap-1.5"
              >
                {publishBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Globe className="w-3.5 h-3.5" />
                )}
                <span>{published ? "Save gallery details" : "Publish to gallery"}</span>
              </Button>

              {published && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={publishBusy}
                  onClick={() => setConfirmUnpublishOpen(true)}
                  className="h-9 rounded-xl text-[11px] font-bold text-destructive hover:text-destructive gap-1.5"
                >
                  Unpublish
                </Button>
              )}

              {handle && (
                <Link
                  to={`/travelers/${handle}`}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                >
                  View traveler page
                  <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>
          </div>
        )}

        {/* 2. Export Actions Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Download PDF — purpose-built A4 document */}
          <Button
            type="button"
            variant="hero"
            disabled={pdfBusy}
            onClick={handleDownloadPdf}
            className="flex flex-col items-center justify-center p-3 h-auto rounded-2xl space-y-1.5 text-center shadow-sm"
          >
            <div className="w-8 h-8 rounded-xl bg-primary-foreground/20 text-primary-foreground flex items-center justify-center">
              {pdfBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
            </div>
            <span className="text-xs font-bold text-primary-foreground">
              {pdfBusy ? "Building PDF..." : "Download PDF"}
            </span>
            <span className="text-[10px] text-primary-foreground/80">
              Clean A4 itinerary
            </span>
          </Button>

          {/* Copy Plain Text */}
          <Button
            type="button"
            variant="outline"
            onClick={handleCopyFormattedText}
            className="flex flex-col items-center justify-center p-3 h-auto rounded-2xl border-border/70 hover:border-primary/40 space-y-1.5 text-center"
          >
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              {copiedText ? <Check className="w-4 h-4 text-emerald-500" /> : <FileText className="w-4 h-4" />}
            </div>
            <span className="text-xs font-bold text-foreground">
              {copiedText ? "Copied Text" : "Copy as Text"}
            </span>
            <span className="text-[10px] text-muted-foreground">For WhatsApp / Email</span>
          </Button>

          {/* Download JSON */}
          <Button
            type="button"
            variant="outline"
            onClick={handleDownloadJson}
            className="flex flex-col items-center justify-center p-3 h-auto rounded-2xl border-border/70 hover:border-primary/40 space-y-1.5 text-center"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Download className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-foreground">Export JSON</span>
            <span className="text-[10px] text-muted-foreground">Full data backup</span>
          </Button>
        </div>

        {/* Browser print — kept for users who want the full interactive view on paper */}
        <div className="flex justify-center pb-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handlePrint}
            className="rounded-xl text-[11px] font-semibold text-muted-foreground hover:text-foreground gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Or use browser print (full screen view)</span>
          </Button>
        </div>
      </DialogContent>

      {/* Revoking is irreversible for the old URL — confirm before taking it down */}
      <AlertDialog open={confirmRevokeOpen} onOpenChange={setConfirmRevokeOpen}>
        <AlertDialogContent className="rounded-3xl max-w-md w-[92vw] sm:w-full p-5 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">Stop sharing this trip?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              The public link stops working immediately. Anyone who bookmarked
              the old URL loses access, and you will need to create a new link
              to share it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl text-xs font-semibold h-10">
              Keep sharing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleRevokeShare();
              }}
              className="rounded-xl text-xs font-bold h-10 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokingShare ? "Revoking…" : "Stop sharing"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unpublishing hides the trip from the gallery immediately; the unlisted
          share link, if any, keeps working. */}
      <AlertDialog open={confirmUnpublishOpen} onOpenChange={setConfirmUnpublishOpen}>
        <AlertDialogContent className="rounded-3xl max-w-md w-[92vw] sm:w-full p-5 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">
              Remove this trip from the gallery?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              Your traveler page stops listing it right away. If you have an
              unlisted share link it keeps working, and you can publish the trip
              again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl text-xs font-semibold h-10">
              Keep it published
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleSaveGallery(false);
              }}
              className="rounded-xl text-xs font-bold h-10 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {publishBusy ? "Unpublishing…" : "Unpublish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};
