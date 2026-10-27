import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Calendar,
  Users,
  IndianRupee,
  Sun,
  Share2,
  Printer,
  Sparkles,
  Check,
  MapPin,
  ShieldCheck,
  TrendingUp,
  ArrowLeft,
  Save,
  Loader2,
  GitBranch,
} from "lucide-react";
import { toast } from "sonner";
import { ShareExportModal } from "./ShareExportModal";
import { avatarSrc } from "@/lib/avatar";
import type { PresenceUser } from "@/hooks/useTripEvents";
import type { ItineraryData } from "@/types/trip";
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
  onStatusChange?: (newStatus: "draft" | "planned" | "ongoing" | "completed") => void;
  onSave?: () => void;
  isSaving?: boolean;
  hasUnsavedChanges?: boolean;
  onBackToList?: () => void;
  onNewPlan?: () => void;
  /** Agency trips share through proposal links only; hides the personal share modal. */
  hideShare?: boolean;
  /** Current gallery publication state for the owner's publish form (M8 G2). */
  publication?: TripPublicationSnapshot;
  onPublicationChange?: (state: TripPublicationState) => void;
}

// Curated high quality imagery mapping for destinations (specific hill stations prioritized before broad regions)
const DESTINATION_IMAGES: Record<string, string> = {
  // Hill Stations & Mountain Ranges (Western Ghats & Himalayas)
  wayanad: "https://images.unsplash.com/photo-1630938819488-ba7d1440d48b?auto=format&fit=crop&w=1600&q=80",
  munnar: "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&w=1600&q=80",
  coorg: "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1600&q=80",
  ooty: "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=1600&q=80",
  manali: "https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?auto=format&fit=crop&w=1600&q=80",
  shimla: "https://images.unsplash.com/photo-1600683796695-103347b7fe70?auto=format&fit=crop&w=1600&q=80",
  kashmir: "https://images.unsplash.com/photo-1595815771614-ade9d652a65d?auto=format&fit=crop&w=1600&q=80",
  ladakh: "https://images.unsplash.com/photo-1581793745862-99fde7fa73d2?auto=format&fit=crop&w=1600&q=80",
  rishikesh: "https://images.unsplash.com/photo-1609137144822-263a238fb065?auto=format&fit=crop&w=1600&q=80",

  // Coastal, Backwaters & Island destinations
  alleppey: "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=1600&q=80",
  alappuzha: "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=1600&q=80",
  goa: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1600&q=80",
  andaman: "https://images.unsplash.com/photo-1589182373726-e4f658ab50f0?auto=format&fit=crop&w=1600&q=80",

  // Heritage & Cultural Cities
  jaipur: "https://images.unsplash.com/photo-1603262110263-fb010d6e75dc?auto=format&fit=crop&w=1600&q=80",
  udaipur: "https://images.unsplash.com/photo-1615836245337-f5b9b2303f10?auto=format&fit=crop&w=1600&q=80",
  varanasi: "https://images.unsplash.com/photo-1561359313-0639aad49ca6?auto=format&fit=crop&w=1600&q=80",

  // Broad state/region fallbacks (evaluated only if specific hill stations or cities are not matched)
  kerala: "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=1600&q=80",
};

const DEFAULT_COVER =
  "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1600&q=80";

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
  onStatusChange,
  onSave,
  isSaving,
  hasUnsavedChanges,
  onBackToList,
  onNewPlan,
  hideShare,
  publication,
  onPublicationChange,
}) => {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // E4b — other people currently viewing this trip (never ourselves).
  const others = (presence ?? []).filter(
    (person) => !currentUserId || String(person.userId) !== String(currentUserId)
  );

  // Match cover image prioritizing specific destinations before regional keywords
  const getCoverImage = (): string => {
    const textToMatch = [
      data.trip_title || "",
      ...(data.highlights || []),
    ].join(" ").toLowerCase();

    // Specific hill stations & cities take precedence over generic state names
    const priorityDestinations = [
      "wayanad", "munnar", "coorg", "ooty", "manali", "shimla",
      "kashmir", "ladakh", "rishikesh", "alleppey", "alappuzha",
      "goa", "andaman", "jaipur", "udaipur", "varanasi"
    ];

    for (const key of priorityDestinations) {
      if (textToMatch.includes(key)) {
        return DESTINATION_IMAGES[key];
      }
    }

    // Fall back to broader region tags (e.g. 'kerala' backwaters)
    for (const [key, url] of Object.entries(DESTINATION_IMAGES)) {
      if (textToMatch.includes(key)) return url;
    }

    return DEFAULT_COVER;
  };

  const handleShare = () => {
    setIsShareModalOpen(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const dailyAvg = Math.round(data.budget_breakdown.total / Math.max(1, data.duration_days));
  const coverUrl = getCoverImage();

  return (
    <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-border/60 bg-card">
      {/* Cover Image Background with Gradient Overlay */}
      <div className="relative min-h-[340px] sm:min-h-[360px] md:h-96 w-full overflow-hidden flex flex-col justify-between">
        <img
          src={coverUrl}
          alt={data.trip_title}
          className="absolute inset-0 w-full h-full object-cover object-center filter brightness-[0.8] contrast-[1.05] transition-transform duration-700 hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/30" />

        {/* Top Floating Actions */}
        <div className="relative p-3 sm:p-4 flex items-center justify-between z-10 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {onBackToList && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onBackToList}
                className="bg-black/60 hover:bg-black/80 text-white border-white/20 backdrop-blur-md rounded-xl text-xs font-bold gap-1 sm:gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">All Trips</span>
                <span className="sm:hidden">Trips</span>
              </Button>
            )}

            <Badge className="bg-black/60 backdrop-blur-md text-white border-white/20 px-2.5 py-1 text-[11px] sm:text-xs font-semibold gap-1 sm:gap-1.5 shadow-md hidden sm:inline-flex">
              <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
              <span>AI Optimized</span>
            </Badge>

            {version != null && (
              <Badge className="bg-black/60 backdrop-blur-md text-white border-white/20 px-2.5 py-1 text-[11px] sm:text-xs font-semibold gap-1 sm:gap-1.5 shadow-md">
                <GitBranch className="w-3 h-3 text-sky-300" />
                <span>
                  v{version}
                  {hasEdited ? " · edited" : ""}
                </span>
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {/* E4b — live collaborators right now (empty when the tier is off) */}
            {others.length > 0 && (
              <div className="flex items-center gap-1.5 mr-1">
                <div className="flex -space-x-2">
                  {others.slice(0, 4).map((person) => (
                    <Avatar key={person.userId} className="h-8 w-8 ring-2 ring-white/40 shadow-md">
                      {avatarSrc(person.avatarUrl) && (
                        <AvatarImage src={avatarSrc(person.avatarUrl)} alt={person.label} />
                      )}
                      <AvatarFallback
                        className="bg-primary text-primary-foreground text-[10px] font-bold"
                        title={`${person.label} (${person.role}) is viewing this trip`}
                      >
                        {person.label.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
                {others.length > 4 && (
                  <span className="text-[10px] font-bold text-white/90 bg-black/60 backdrop-blur-md rounded-full px-2 py-0.5">
                    +{others.length - 4}
                  </span>
                )}
                <span className="hidden lg:inline text-[10px] font-semibold text-white/80">
                  {others.length === 1 ? "is here" : "are here"}
                </span>
              </div>
            )}

            {/* Save Changes Button if unsaved changes exist */}
            {onSave && (
              <Button
                type="button"
                size="sm"
                variant={hasUnsavedChanges ? "hero" : "outline"}
                disabled={isSaving}
                onClick={onSave}
                className={`rounded-xl text-xs font-bold gap-1 sm:gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3 backdrop-blur-md shadow-md ${
                  hasUnsavedChanges
                    ? "animate-pulse"
                    : "bg-black/50 hover:bg-black/75 text-white border-white/20"
                }`}
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{isSaving ? "Saving..." : hasUnsavedChanges ? "Save*" : "Saved"}</span>
              </Button>
            )}

            {!hideShare && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleShare}
                className="bg-black/50 hover:bg-black/75 text-white border-white/20 backdrop-blur-md rounded-xl text-xs font-semibold gap-1 sm:gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Share & Export</span>
                <span className="sm:hidden">Share</span>
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="bg-black/50 hover:bg-black/75 text-white border-white/20 backdrop-blur-md rounded-xl text-xs font-semibold gap-1.5 h-9 hidden md:inline-flex"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </Button>

            {onNewPlan && (
              <Button
                type="button"
                size="sm"
                onClick={onNewPlan}
                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-bold gap-1 sm:gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3 shadow-md"
              >
                <span>Plan New</span>
              </Button>
            )}
          </div>
        </div>

        {/* Bottom Banner Title & Badges */}
        <div className="relative p-4 sm:p-6 z-10 text-white space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <Badge className="bg-primary/90 text-primary-foreground font-bold px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[11px] sm:text-xs">
              <MapPin className="w-3 h-3 mr-1" /> {data.group_type || "Traveler"}
            </Badge>
            <Badge className="bg-white/20 backdrop-blur-md text-white font-medium px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[11px] sm:text-xs border-white/20">
              <Sun className="w-3 h-3 mr-1 text-yellow-300" /> {data.season}
            </Badge>

            {/* Status Change Selector */}
            {onStatusChange && (
              <div className="inline-flex items-center gap-1 bg-black/50 backdrop-blur-md rounded-full px-2 py-0.5 border border-white/20 text-xs">
                <span className="text-white/70 text-[10px] pl-1 uppercase font-semibold">Status:</span>
                <select
                  value={status}
                  onChange={(e) =>
                    onStatusChange(e.target.value as "draft" | "planned" | "ongoing" | "completed")
                  }
                  className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer pr-1"
                >
                  <option value="planned" className="text-black">Planned</option>
                  <option value="ongoing" className="text-black">Ongoing</option>
                  <option value="completed" className="text-black">Completed</option>
                  <option value="draft" className="text-black">Draft</option>
                </select>
              </div>
            )}
          </div>

          <h1 className="text-xl sm:text-3xl md:text-5xl font-extrabold tracking-tight drop-shadow-md leading-tight line-clamp-2 sm:line-clamp-none">
            {data.trip_title}
          </h1>
        </div>
      </div>

      {/* Quick Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border/60 bg-card/90 backdrop-blur-sm p-2 sm:p-6">
        {/* Total Cost */}
        <div className="p-2 sm:p-3 text-center sm:text-left space-y-1">
          <div className="flex items-center justify-center sm:justify-start gap-1.5 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            <IndianRupee className="w-3.5 h-3.5 text-primary" />
            <span>Total Estimated</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-foreground">
            ₹{data.budget_breakdown.total.toLocaleString("en-IN")}
          </div>
          <p className="text-[11px] text-muted-foreground">All inclusions & buffers</p>
        </div>

        {/* Budget Per Person */}
        <div className="p-3 text-center sm:text-left space-y-1">
          <div className="flex items-center justify-center sm:justify-start gap-1.5 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            <Users className="w-3.5 h-3.5 text-emerald-500" />
            <span>Per Person</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">
            ₹{data.budget_per_person.toLocaleString("en-IN")}
          </div>
          <p className="text-[11px] text-muted-foreground">Based on {data.group_type}</p>
        </div>

        {/* Daily Average */}
        <div className="p-3 text-center sm:text-left space-y-1">
          <div className="flex items-center justify-center sm:justify-start gap-1.5 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
            <span>Daily Average</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-foreground">
            ₹{dailyAvg.toLocaleString("en-IN")}
          </div>
          <p className="text-[11px] text-muted-foreground">Across {data.duration_days} days</p>
        </div>

        {/* Duration & Season */}
        <div className="p-3 text-center sm:text-left space-y-1">
          <div className="flex items-center justify-center sm:justify-start gap-1.5 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            <Calendar className="w-3.5 h-3.5 text-purple-500" />
            <span>Duration</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-foreground">
            {data.duration_days} Days / {Math.max(1, data.duration_days - 1)} Nights
          </div>
          <p className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">
            Optimal {data.season} Season
          </p>
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
