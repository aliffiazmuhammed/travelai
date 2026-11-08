import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  MapPin,
  Bed,
  ShieldCheck,
  Sparkles,
  Receipt,
  Users,
  History,
  UserPlus,
  Maximize2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/services/api";
import { isRevConflict, toastConflict } from "@/lib/conflicts";
import { withItineraryDefaults } from "@/lib/itineraryDefaults";
import { cn } from "@/lib/utils";
import { TripHeader } from "./dashboard/TripHeader";
import { DayTimeline } from "./dashboard/DayTimeline";
import { TripMap } from "./dashboard/TripMap";
import { StayAndCuisine } from "./dashboard/StayAndCuisine";
import { TravelGuideSafety } from "./dashboard/TravelGuideSafety";
import { TripFeedback } from "./dashboard/TripFeedback";
import { ExpenseTracker } from "./dashboard/ExpenseTracker";
import { NearbyExplorer } from "./dashboard/NearbyExplorer";
import { WeatherRoutingCard } from "./dashboard/WeatherRoutingCard";
import { DayAlternativeDialog } from "./dashboard/DayAlternativeDialog";
import { TripMembers } from "./dashboard/TripMembers";
import { InviteDialog } from "./dashboard/InviteDialog";
import { TripVersions } from "./dashboard/TripVersions";
import { DiscussionDrawer } from "./dashboard/DiscussionDrawer";
import { useTripComments } from "@/hooks/useTripComments";
import { useTripChatCrypto } from "@/hooks/useTripChatCrypto";
import { roleLabel } from "@/hooks/useTripAccess";
import type { ChatRealm } from "@/lib/chatCrypto";
import { useTripEvents, type PresenceUser } from "@/hooks/useTripEvents";
import { endDateFromStart, itineraryAnchor, zipWeatherToDays } from "@/lib/weather";
import {
  formatDistance,
  formatDuration,
  isValidCoord,
  totalRoute,
} from "@/lib/geo";
import type { LatLng } from "@/lib/geo";
import { avatarSrc } from "@/lib/avatar";
import { swapDayPlans } from "@/lib/weatherRouting";
import { applyActivityEdit } from "@/lib/proposalApply";
import type {
  ActivityItem,
  CustomRoute,
  DailyWeather,
  DayAlternative,
  ItineraryData,
  AssistantProposal,
  NearbyPlace,
  Trip,
  TripExpense,
  TripFeedback as TripFeedbackType,
  TripFinance,
  TripGenerationMeta,
  TripMember,
  TripMemberSummary,
  TripParticipant,
  TripRole,
  WeatherRoutingAnalysis,
} from "@/types/trip";
import type {
  TripPublicationSnapshot,
  TripPublicationState,
} from "@/types/gallery";
export type { ItineraryData } from "@/types/trip";

interface ItineraryDisplayProps {
  data: ItineraryData;
  tripId?: string;
  status?: "draft" | "planned" | "ongoing" | "completed";
  /** Current version number of the trip (shown in the history tab). */
  version?: number;
  /** Whether the trip has ever been edited. */
  hasEdited?: boolean;
  /** Owner-only public share token; absent for editors/viewers (M6 F6). */
  shareId?: string;
  onShareIdChange?: (shareId?: string) => void;
  /** The caller's role on this trip (Milestone 6 §3.8; undefined = legacy payload). */
  role?: TripRole;
  /** Embedded member list from the trip payload (renders the People tab). */
  members?: TripMemberSummary[];
  /** Live roster for the avatar stack (E4b, empty when the tier is off). */
  presence?: PresenceUser[];
  /** The viewer's user id — used to drop their own entry from the stack. */
  currentUserId?: string;
  onStatusChange?: (newStatus: "draft" | "planned" | "ongoing" | "completed") => void;
  onSave?: (updatedDetails: ItineraryData) => Promise<void>;
  isSaving?: boolean;
  /** Called whenever the server returns an updated trip (granular edit or version restore). */
  onTripUpdated?: (trip: Trip) => void;
  /** Persisted user rating of the generated itinerary, if any. */
  feedback?: TripFeedbackType;
  /** AI generation metadata (quality score, variant, language, ...). */
  generationMeta?: TripGenerationMeta;
  /** Actual logged expenses (Milestone 5). */
  expenses?: TripExpense[];
  /** Group travellers used for expense splitting (Milestone 5). */
  participants?: TripParticipant[];
  /** Base currency + cached FX rates (Milestone 5). */
  finance?: TripFinance;
  /** User-drawn custom routes shown on the map (Milestone 4). */
  customRoutes?: CustomRoute[];
  /** Planned trip start date — drives per-day weather advisories (Milestone 4.4). */
  startDate?: string;
  /** Whether the feedback/rating cards may render (defaults to true). */
  canRate?: boolean;
  /** Called after the user rates the itinerary. */
  onFeedbackSubmitted?: (feedback: TripFeedbackType) => void;
  onBackToList?: () => void;
  onNewPlan?: () => void;
  /** M8 G2: the owner's current gallery state for the publish form. */
  publication?: TripPublicationSnapshot;
  onPublicationChange?: (state: TripPublicationState) => void;
  /** A2: agency trips hide ownership transfer; staff never "leave" a tenant trip. */
  agencyTrip?: boolean;
  agencyStaff?: boolean;
  /**
   * PA0: which account realm owns this trip's E2EE chat identity. Agency trips
   * pass `agency` so device keys are stored per tenant and published to
   * `/api/agency/auth/chat-key`; personal trips keep the original key.
   */
  chatRealm?: ChatRealm;
  /** Tenant scope for agency chat identities (`agency:<agencyId>`). */
  chatIdentityScope?: string;
}

/** Debounce window (ms) for automatic background saving of local edits. */
const AUTOSAVE_DELAY = 1500;

/**
 * One tab voice: a calm white strip where the active tab carries a light-primary
 * fill and a short underline. The row scrolls sideways inside the strip on
 * narrow screens instead of wrapping into cramped cells.
 */
const TAB_TRIGGER_CLASS = cn(
  "group relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors",
  "hover:bg-muted/60 hover:text-foreground",
  "data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none",
  "after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-transparent",
  "data-[state=active]:after:bg-primary",
  "lg:flex-1"
);

/** Role pills for the Going card — the roster's own role, never a guess. */
const ROLE_PILL_CLASS: Record<TripRole, string> = {
  owner: "bg-accent/10 text-accent",
  editor: "bg-primary/10 text-primary",
  commenter: "bg-muted text-muted-foreground",
  viewer: "border border-border text-muted-foreground",
};

/**
 * The rail reuses the full interactive map with its chrome folded away: the
 * filter bar, saved-route list and legend stay in the Map tab, while the
 * viewport (child 2 of the map root, controls off) becomes a quiet preview.
 */
const MAP_PREVIEW_CLASS = cn(
  "[&>div]:!space-y-0",
  "[&>div>*:first-child]:hidden",
  "[&>div>*:nth-child(n+3)]:hidden",
  "[&>div>*:nth-child(2)]:!h-[280px]",
  "[&>div>*:nth-child(2)]:!rounded-none",
  "[&>div>*:nth-child(2)]:!border-0",
  "[&>div>*:nth-child(2)]:!shadow-none",
  "[&_.absolute.bottom-4]:hidden"
);

/** The rail only exists from `xl`; mounting a Leaflet map into a hidden box breaks it. */
function useRailMapVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1280px)");
    const update = () => setVisible(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return visible;
}

/** Two-letter initials from the roster label (or email local part). */
function memberInitials(member: TripMember): string {
  const source = (member.label || member.email || "Traveler").trim();
  if (source.includes("@")) return source.slice(0, 2).toUpperCase();
  const parts = source.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "T";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

/** Valid `[lat, lng]` from an activity, or null when it has none. */
function activityLatLng(activity: ActivityItem | string): LatLng | null {
  if (typeof activity !== "object" || activity === null) return null;
  const coords = activity.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const pair: [number, number] = [Number(coords[0]), Number(coords[1])];
  return isValidCoord(pair) ? pair : null;
}

/** Immutably replaces a single activity within a day (matched by day number). */
function replaceActivity(
  itinerary: ItineraryData["day_by_day_itinerary"],
  dayNumber: number,
  activityIndex: number,
  activity: ActivityItem
): ItineraryData["day_by_day_itinerary"] {
  return itinerary.map((d) => {
    if (Number(d.day) !== Number(dayNumber)) return d;
    const activities = [...d.activities];
    activities[activityIndex] = activity;
    return { ...d, activities };
  });
}

const ItineraryDisplay: React.FC<ItineraryDisplayProps> = ({
  data,
  tripId,
  status,
  version,
  hasEdited,
  shareId,
  onShareIdChange,
  role,
  members,
  presence,
  currentUserId,
  onStatusChange,
  onSave,
  isSaving,
  onTripUpdated,
  feedback,
  generationMeta,
  expenses,
  participants,
  finance,
  customRoutes,
  startDate,
  canRate = true,
  onFeedbackSubmitted,
  onBackToList,
  onNewPlan,
  publication,
  onPublicationChange,
  agencyTrip = false,
  agencyStaff = false,
  chatRealm = "personal",
  chatIdentityScope,
}) => {
  // Legacy AI payloads miss whole sections of the prompt contract (Milestone 2
  // shape evolved); normalize once here so no downstream read can crash.
  const safeData = useMemo(() => withItineraryDefaults(data), [data]);

  // Allow interactive in-memory customization of itinerary activities
  const [itinerary, setItinerary] = useState<ItineraryData["day_by_day_itinerary"]>(
    safeData.day_by_day_itinerary
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const railMapVisible = useRailMapVisible();

  /**
   * F12b/F12d: compose a TravelAI proposal into the itinerary snapshot and save
   * it through the SAME path manual editing uses (`onSave` → PUT with required
   * `baseRev`, versioned). The bot never writes; this only types what a
   * contributor typed by hand. Structural kinds carry the drift guard: the
   * activity label the model saw must still be exactly where it said it was.
   */
  const applyAssistantProposal = useCallback(
    async (proposal: AssistantProposal): Promise<void> => {
      if (!onSave) throw new Error("Applying needs edit access for this trip.");
      const findDay = (dayNumber: number) =>
        itinerary.find((day) => day.day === dayNumber);

      if (proposal.kind === "swap_days") {
        // Same operation as the weather-routing suggestion: the two plans
        // exchange places and days stay contiguous (1..n display order).
        if (proposal.from_day === proposal.to_day) {
          throw new Error("Pick two different days to exchange.");
        }
        const swapped = swapDayPlans(itinerary, proposal.from_day, proposal.to_day);
        if (swapped === itinerary) {
          throw new Error(
            "This trip no longer has both days — reload the trip and ask again."
          );
        }
        await onSave({ ...safeData, day_by_day_itinerary: swapped });
        return;
      }

      if (proposal.kind === "move_activity" || proposal.kind === "update_activity") {
        await onSave({
          ...safeData,
          day_by_day_itinerary: applyActivityEdit(itinerary, proposal),
        });
        return;
      }

      if (proposal.kind !== "title" && proposal.kind !== "budget" && !findDay(proposal.day)) {
        throw new Error("This trip no longer has that day — reload the trip and ask again.");
      }
      const next: ItineraryData = {
        ...safeData,
        day_by_day_itinerary: itinerary,
        ...(proposal.kind === "title" ? { trip_title: proposal.value } : {}),
        ...(proposal.kind === "budget" ? { budget_per_person: proposal.value } : {}),
      };
      if (proposal.kind === "day_title" || proposal.kind === "day_tip") {
        // Pure replacement — never mutate the live state objects in place.
        next.day_by_day_itinerary = itinerary.map((day) => {
          if (day.day !== proposal.day) return day;
          if (proposal.kind === "day_title") return { ...day, title: proposal.value };
          return {
            ...day,
            pro_tip: [
              ...(Array.isArray(day.pro_tip) ? day.pro_tip : []).slice(-7),
              proposal.value,
            ],
          };
        });
      }
      await onSave(next); // throws on 409 REV_CONFLICT → upstream medicine applies
    },
    [onSave, safeData, itinerary]
  );
  /** Mirror for the live-tier callback (E4b): the SSE hook reads it from a ref. */
  const hasUnsavedChangesRef = useRef<boolean>(false);
  hasUnsavedChangesRef.current = hasUnsavedChanges;
  const [isPersisting, setIsPersisting] = useState<boolean>(false);

  const isRealTrip = Boolean(tripId && !tripId.startsWith("temp-"));
  const autoSaveEnabled = Boolean(onSave && isRealTrip);

  // Milestone 6 — cosmetic role gates (server enforces the real rules).
  const isOwner = role ? role === "owner" : Boolean(onSave);
  // The People tab appears only for real trips with a Milestone 6 payload.
  const showPeopleTab = Boolean(isRealTrip && role);
  // Discussion has one surface only: the floating chat drawer. Same gate as
  // People — the server decides who may write.
  const showDiscussion = showPeopleTab;

  /** E4b: `trip:updated` from another collaborator → silent refetch. Never
   * overwrites state while there are unsaved local edits (the conflict toast
   * is the reconciliation path instead). */
  const liveRefresh = async () => {
    if (!isRealTrip || !tripId || hasUnsavedChangesRef.current) return;
    try {
      const fresh = await api.getTrip(tripId);
      if (hasUnsavedChangesRef.current) return;
      setItinerary(fresh.tripDetails.day_by_day_itinerary);
      onTripUpdated?.(fresh);
    } catch {
      /* the 409 path handles real conflicts; silent here */
    }
  };

  // Live roster + remote-write notifications (no-op when the tier is off).
  //
  // F6b: the comment state is owned HERE (next to the single EventSource) and
  // handed down to the chat drawer — frames land in it while the drawer is
  // closed, and duplicates are impossible because dedupe happens by `_id`.
  // Opening and closing the drawer is what drives the read marker upstream.
  const [activeTab, setActiveTab] = useState<string>("timeline");

  const commentsController = useTripComments(
    showDiscussion ? tripId : undefined,
    currentUserId
  );
  // F10: the E2EE session lives next to the discussion hub so every surface
  // shares one key biography and one decrypt cache.
  const chatCrypto = useTripChatCrypto(
    showDiscussion ? tripId : undefined,
    currentUserId,
    showDiscussion,
    chatRealm,
    chatIdentityScope
  );
  const commentsIngestRef = useRef(commentsController.ingest);
  commentsIngestRef.current = commentsController.ingest;
  const commentsTypingRef = useRef(commentsController.ingestTyping);
  commentsTypingRef.current = commentsController.ingestTyping;
  const commentsDecisionRef = useRef(commentsController.ingestDecision);
  commentsDecisionRef.current = commentsController.ingestDecision;
  const commentsPollRef = useRef(commentsController.ingestPoll);
  commentsPollRef.current = commentsController.ingestPoll;

  const livePresence = useTripEvents(isRealTrip ? tripId : undefined, {
    onTripUpdated: () => {
      void liveRefresh();
    },
    onCommentEvent: (frame) => commentsIngestRef.current(frame),
    onTypingEvent: (frame) => commentsTypingRef.current(frame),
    onDecisionEvent: (frame) => commentsDecisionRef.current(frame),
    onPollEvent: (frame) => commentsPollRef.current(frame),
  });

  // --- Right rail (concept 11): route preview + who is going --------------
  // The roster is read from the same members endpoint the People tab uses:
  // labels and photos for every member, email only when the viewer is the
  // owner. Refreshed whenever the timeline is re-entered so a role change in
  // People is reflected here without a reload.
  const [roster, setRoster] = useState<TripMember[] | null>(null);
  const [rosterFailed, setRosterFailed] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  const sortedRoster = useMemo(() => {
    const rank: Record<TripRole, number> = {
      owner: 0,
      editor: 1,
      commenter: 2,
      viewer: 3,
    };
    return [...(roster ?? [])].sort((a, b) => rank[a.role] - rank[b.role]);
  }, [roster]);

  useEffect(() => {
    if (!showPeopleTab || !tripId || activeTab !== "timeline") return;
    let cancelled = false;
    setRosterFailed(false);
    api
      .getTripMembers(tripId)
      .then((result) => {
        if (!cancelled) setRoster(result.members ?? []);
      })
      .catch(() => {
        if (!cancelled) setRosterFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [showPeopleTab, tripId, activeTab]);

  // Stops and drive time for the rail card — straight-line estimates from the
  // same geo helpers the timeline uses, summed per day.
  const routeSummary = useMemo(() => {
    let stops = 0;
    let km = 0;
    let minutes = 0;
    itinerary.forEach((day) => {
      stops += day.activities.length;
      const points = day.activities
        .map(activityLatLng)
        .filter((point): point is LatLng => point !== null);
      if (points.length >= 2) {
        const totals = totalRoute(points, "drive");
        km += totals.km;
        minutes += totals.minutes;
      }
    });
    return { stops, km, minutes };
  }, [itinerary]);

  const mapMeta = [
    `${itinerary.length} ${itinerary.length === 1 ? "day" : "days"}`,
    `${routeSummary.stops} ${routeSummary.stops === 1 ? "stop" : "stops"}`,
    routeSummary.minutes > 0
      ? `${formatDistance(routeSummary.km)} · ~${formatDuration(routeSummary.minutes)} drive`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  /** Roster count when loaded, the sanitized summary's count until then. */
  const goingCount = sortedRoster.length || members?.length || 0;

  /** "Edit plan" lands on the day cards, where the plan is actually edited. */
  const focusEditor = () => {
    setActiveTab("timeline");
    window.requestAnimationFrame(() => {
      const node = timelineRef.current;
      if (!node) return;
      const top = node.getBoundingClientRect().top + window.scrollY - 128;
      window.scrollTo({ top, behavior: "smooth" });
    });
  };

  // --- Weather advisories (Milestone 4.4) ---
  const [weatherByDay, setWeatherByDay] = useState<Record<number, DailyWeather>>({});
  // Near-constant keys: the forecast is only re-fetched when the window or the
  // anchor coordinate actually changes, not on every activity edit.
  const dayNumbersKey = itinerary.map((d) => d.day).join(",");
  const weatherAnchorKey = useMemo(() => {
    const anchor = itineraryAnchor(itinerary);
    return anchor ? `${anchor[0].toFixed(4)},${anchor[1].toFixed(4)}` : "";
  }, [itinerary]);
  const weatherStart = startDate ? String(startDate).slice(0, 10) : null;
  const weatherEnd = weatherStart ? endDateFromStart(weatherStart, itinerary.length) : null;

  // Always points at the latest itinerary so the forecast effect below does not
  // need to re-run (and re-fetch) on every activity edit.
  const itineraryRef = useRef(itinerary);
  useEffect(() => {
    itineraryRef.current = itinerary;
  }, [itinerary]);

  useEffect(() => {
    if (!isRealTrip || !weatherStart || !weatherEnd || !weatherAnchorKey) {
      setWeatherByDay({});
      return;
    }

    const [lat, lng] = weatherAnchorKey.split(",").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setWeatherByDay({});
      return;
    }

    let cancelled = false;
    api
      .getWeather(lat, lng, weatherStart, weatherEnd)
      .then((response) => {
        if (cancelled) return;
        setWeatherByDay(zipWeatherToDays(response.days, itineraryRef.current));
      })
      .catch(() => {
        if (!cancelled) setWeatherByDay({});
      });

    return () => {
      cancelled = true;
    };
  }, [isRealTrip, weatherStart, weatherEnd, weatherAnchorKey, dayNumbersKey]);

  // Nearby search results are owned here so the map can render them as markers
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);

  // --- Weather-aware routing (Milestone 4.6) ---
  const [routing, setRouting] = useState<WeatherRoutingAnalysis | null>(null);
  const [routingWeatherAvailable, setRoutingWeatherAvailable] = useState(false);
  const [routingLoading, setRoutingLoading] = useState(false);
  // Bumped whenever a suggestion is applied so the analysis is recomputed
  const [routingRefreshKey, setRoutingRefreshKey] = useState(0);

  useEffect(() => {
    if (!isRealTrip || !tripId || !weatherStart) {
      setRouting(null);
      return;
    }

    let cancelled = false;
    setRoutingLoading(true);
    api
      .getWeatherRouting(tripId)
      .then((response) => {
        if (cancelled) return;
        setRouting(response.analysis);
        setRoutingWeatherAvailable((response.weather?.days?.length ?? 0) > 0);
      })
      .catch(() => {
        if (!cancelled) {
          setRouting(null);
          setRoutingWeatherAvailable(false);
        }
      })
      .finally(() => {
        if (!cancelled) setRoutingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isRealTrip, tripId, weatherStart, weatherAnchorKey, dayNumbersKey, routingRefreshKey]);

  // --- Weather-safe day alternative (Milestone 4.4) ---
  // The dialog is owned here (rather than inside DayTimeline) so both the
  // timeline and the routing card can open it.
  const [alternativeDay, setAlternativeDay] = useState<number | null>(null);
  const [alternative, setAlternative] = useState<DayAlternative | null>(null);
  const [alternativeLoading, setAlternativeLoading] = useState(false);
  const [alternativeError, setAlternativeError] = useState<string | null>(null);

  const openDayAlternative = async (dayNumber: number) => {
    if (!tripId || !isRealTrip) return;
    setAlternativeDay(dayNumber);
    setAlternative(null);
    setAlternativeError(null);
    setAlternativeLoading(true);
    try {
      const suggestion = await api.suggestIndoorAlternative(tripId, dayNumber);
      setAlternative(suggestion ?? null);
      if (!suggestion) {
        setAlternativeError("We couldn't build an alternative right now. Please try again.");
      }
    } catch (error) {
      setAlternativeError(
        error instanceof Error && error.message
          ? error.message
          : "We couldn't build an alternative right now. Please try again."
      );
    } finally {
      setAlternativeLoading(false);
    }
  };

  const closeDayAlternative = (open: boolean) => {
    if (open) return;
    setAlternativeDay(null);
    setAlternative(null);
    setAlternativeError(null);
  };

  /** Replaces a day's activities with the accepted suggestion (autosaves). */
  const applyDayAlternative = (dayNumber: number, activities: ActivityItem[]) => {
    const dayIndex = itinerary.findIndex((d) => d.day === dayNumber);
    if (dayIndex === -1) return;

    const next = [...itinerary];
    next[dayIndex] = { ...next[dayIndex], activities: activities.filter(Boolean) };
    handleUpdateItinerary(next);
    setRoutingRefreshKey((key) => key + 1);
    toast.success(`Day ${dayNumber} reworked for the weather`);
  };

  /** Moves one day's plan onto another day's date (Milestone 4.6 suggestion). */
  const handleSwapDays = (fromDay: number, toDay: number) => {
    const swapped = swapDayPlans(itinerary, fromDay, toDay);
    if (swapped === itinerary) return;

    handleUpdateItinerary(swapped);
    setRoutingRefreshKey((key) => key + 1);
    toast.success(`Swapped Day ${fromDay} with Day ${toDay}`);
  };

  /** Appends a nearby place to a day as a new activity (autosaved). */
  const handleAddNearbyToDay = (dayNumber: number, place: NearbyPlace) => {
    const activity: ActivityItem = {
      title: place.name,
      time: "Flexible",
      description: `Nearby ${place.category} just ${place.distanceKm} km away${
        place.tags?.cuisine ? ` (${place.tags.cuisine})` : ""
      }.`,
      location_name: place.name,
      coordinates: place.coordinates,
    };

    handleUpdateItinerary(
      itinerary.map((day) =>
        Number(day.day) === Number(dayNumber)
          ? { ...day, activities: [...day.activities, activity] }
          : day
      )
    );
    toast.success(`Added ${place.name} to Day ${dayNumber}`);
  };

  useEffect(() => {
    setItinerary(safeData.day_by_day_itinerary);
    setHasUnsavedChanges(false);
  }, [safeData]);

  const handleUpdateItinerary = (
    updated: ItineraryData["day_by_day_itinerary"]
  ) => {
    setItinerary(updated);
    setHasUnsavedChanges(true);
  };

  const handleSaveTrigger = async () => {
    if (!onSave) return;
    const updatedDetails: ItineraryData = {
      ...safeData,
      day_by_day_itinerary: itinerary,
    };
    await onSave(updatedDetails);
    setHasUnsavedChanges(false);
  };

  // Debounced autosave for local-only edits (add / delete / rename)
  useEffect(() => {
    if (!hasUnsavedChanges || !autoSaveEnabled || !onSave || isSaving || isPersisting) {
      return;
    }
    const timer = setTimeout(() => {
      onSave({ ...safeData, day_by_day_itinerary: itinerary })
        .then(() => setHasUnsavedChanges(false))
        .catch(() => {
          /* Error toast is raised by the parent save handler */
        });
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [hasUnsavedChanges, itinerary, autoSaveEnabled, onSave, isSaving, isPersisting, data]);

  /**
   * Persists a granular change (single activity / reorder / day move).
   * Flushes any pending local edits first so nothing is lost, applies the
   * optimistic update, then reconciles with the server response.
   */
  const persistGranular = useCallback(
    async (
      previous: ItineraryData["day_by_day_itinerary"],
      call: () => Promise<Trip>,
      successMessage: string
    ) => {
      try {
        setIsPersisting(true);

        // Ensure any pending add/delete/rename changes are saved first
        if (hasUnsavedChanges && onSave) {
          await onSave({ ...safeData, day_by_day_itinerary: itinerary });
          setHasUnsavedChanges(false);
        }

        const trip = await call();
        setItinerary(trip.tripDetails.day_by_day_itinerary);
        setHasUnsavedChanges(false);
        onTripUpdated?.(trip);
        toast.success(successMessage);
      } catch (err) {
        console.error("Failed to persist itinerary change:", err);
        setItinerary(previous);
        if (isRevConflict(err)) {
          toastConflict(err, () => reloadLatest());
        } else {
          toast.error(
            err instanceof Error
              ? err.message
              : "Could not save your changes. Please try again."
          );
        }
      } finally {
        setIsPersisting(false);
      }
    },
    [hasUnsavedChanges, onSave, safeData, itinerary, onTripUpdated]
  );

  /** E4: "Reload latest" for a 409 conflict — replace local state wholesale. */
  const reloadLatest = async () => {
    if (!isRealTrip || !tripId) return;
    try {
      const fresh = await api.getTrip(tripId);
      setItinerary(fresh.tripDetails.day_by_day_itinerary);
      setHasUnsavedChanges(false);
      onTripUpdated?.(fresh);
      toast.success("Reloaded the latest version of this trip.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not reload the trip."
      );
    }
  };

  const handleUpdateActivity = (
    dayNumber: number,
    activityIndex: number,
    activity: ActivityItem
  ) => {
    const previous = itinerary;
    setItinerary((prev) => replaceActivity(prev, dayNumber, activityIndex, activity));

    if (!isRealTrip || !tripId) {
      setHasUnsavedChanges(true);
      return;
    }
    persistGranular(
      previous,
      () => api.updateActivity(tripId, { day: dayNumber, activityIndex, activity }),
      "Activity updated"
    );
  };

  const handleReorderActivities = (dayNumber: number, order: number[]) => {
    const previous = itinerary;
    const next = itinerary.map((d) => {
      if (Number(d.day) !== Number(dayNumber)) return d;
      return { ...d, activities: order.map((i) => d.activities[i]) };
    });
    setItinerary(next);

    if (!isRealTrip || !tripId) {
      setHasUnsavedChanges(true);
      return;
    }
    persistGranular(
      previous,
      () => api.reorderActivities(tripId, { day: dayNumber, order }),
      "Activities reordered"
    );
  };

  const handleMoveDay = (fromIndex: number, toIndex: number) => {
    const previous = itinerary;
    const reordered = [...itinerary];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    const renumbered = reordered.map((d, i) => ({ ...d, day: i + 1 }));
    setItinerary(renumbered);

    if (!isRealTrip || !tripId) {
      setHasUnsavedChanges(true);
      return;
    }
    persistGranular(
      previous,
      () => api.moveTripDay(tripId, { fromIndex, toIndex }),
      "Days reordered"
    );
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto pb-16">
      {/* 1. Enhanced Hero Header with Quick Stats & Share Actions */}
      <TripHeader
        data={safeData}
        tripId={tripId}
        status={status}
        version={version}
        hasEdited={hasEdited}
        shareId={shareId}
        onShareIdChange={onShareIdChange}
        presence={livePresence}
        currentUserId={currentUserId}
        onStatusChange={onStatusChange}
        onSave={onSave ? handleSaveTrigger : undefined}
        isSaving={isSaving || isPersisting}
        hasUnsavedChanges={hasUnsavedChanges}
        onBackToList={onBackToList}
        onNewPlan={onNewPlan}
        hideShare={agencyTrip}
        publication={publication}
        onPublicationChange={onPublicationChange}
        members={sortedRoster}
        memberCount={members?.length}
        startDate={startDate}
        onEditPlan={onSave ? focusEditor : undefined}
      />

      {/* Highlights — one quiet line of chips, not a second hero. */}
      {safeData.highlights && safeData.highlights.length > 0 && (
        <Card className="overflow-hidden rounded-xl border border-border bg-card shadow-none">
          <CardContent className="flex flex-wrap items-center gap-2 px-4 py-3">
            <span className="inline-flex shrink-0 items-center gap-1.5 pr-1 text-[11px] font-semibold text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
              Highlights
            </span>
            <span className="hidden h-3.5 w-px bg-border sm:block" aria-hidden />
            {safeData.highlights.map((h, i) => (
              <Badge
                key={i}
                variant="outline"
                className="rounded-full border-border bg-background px-2.5 py-0.5 text-[11px] font-medium text-foreground/80"
              >
                {h}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Feedback bar — only shown for persisted (non-temp) trips */}
      {isRealTrip && tripId && (
        <TripFeedback
          tripId={tripId}
          initialFeedback={feedback}
          qualityScore={generationMeta?.qualityScore}
          canRate={canRate && isOwner}
          onSubmitted={onFeedbackSubmitted}
        />
      )}

      {/* 2. Main Multi-View Tabs Navigation */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full space-y-4"
      >
        {/* One white strip. Labels stay readable and the row scrolls inside
            the strip on narrow screens instead of wrapping. */}
        <div className="sticky top-16 z-30 bg-background py-2">
          <TabsList className="flex h-auto w-full max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1.5 shadow-xs scrollbar-none">
            <TabsTrigger value="timeline" title="Day Timeline" className={TAB_TRIGGER_CLASS}>
              <Calendar className="h-3.5 w-3.5" aria-hidden />
              <span>Day Timeline</span>
            </TabsTrigger>

            <TabsTrigger value="map" title="Interactive Map" className={TAB_TRIGGER_CLASS}>
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              <span>Interactive Map</span>
            </TabsTrigger>

            <TabsTrigger value="stays" title="Stays & Dining" className={TAB_TRIGGER_CLASS}>
              <Bed className="h-3.5 w-3.5" aria-hidden />
              <span>Stays & Dining</span>
            </TabsTrigger>

            <TabsTrigger value="guide" title="Guide & Safety" className={TAB_TRIGGER_CLASS}>
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              <span>Guide & Safety</span>
            </TabsTrigger>

            <TabsTrigger value="expenses" title="Expenses" className={TAB_TRIGGER_CLASS}>
              <Receipt className="h-3.5 w-3.5" aria-hidden />
              <span>Expenses</span>
            </TabsTrigger>

            {isRealTrip && (
              <TabsTrigger value="history" title="Version History" className={TAB_TRIGGER_CLASS}>
                <History className="h-3.5 w-3.5" aria-hidden />
                <span>History</span>
              </TabsTrigger>
            )}

            {showPeopleTab && (
              <TabsTrigger value="people" title="People" className={TAB_TRIGGER_CLASS}>
                <Users className="h-3.5 w-3.5" aria-hidden />
                <span>People</span>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* TAB 1: Day Timeline View */}
        <TabsContent value="timeline" className="outline-hidden animate-fade-in">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
            <div ref={timelineRef} className="min-w-0">
              <DayTimeline
                itinerary={itinerary}
                onUpdateItinerary={onSave ? handleUpdateItinerary : undefined}
                onUpdateActivity={handleUpdateActivity}
                onReorderActivities={handleReorderActivities}
                onMoveDay={handleMoveDay}
                isPersisting={isPersisting}
                weatherByDay={weatherByDay}
                onSuggestAlternative={isRealTrip && Boolean(onSave) ? openDayAlternative : undefined}
                alternativeLoadingDay={alternativeLoading ? alternativeDay : null}
                commentCounts={showDiscussion ? commentsController.state.dayCounts : undefined}
              />
            </div>

            {/* Rail: the day route plus who is coming. Desktop only — the same
                map and roster live in their own tabs on smaller screens. */}
            <aside className="hidden space-y-4 xl:block" aria-label="Trip at a glance">
              <section className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-semibold leading-tight text-foreground">
                      Route map
                    </h2>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {mapMeta}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setActiveTab("map")}
                    title="Open the interactive map"
                    aria-label="Open the interactive map"
                    className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-primary"
                  >
                    <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
                <div className={cn("border-t border-border", MAP_PREVIEW_CLASS)}>
                  {railMapVisible && (
                    <TripMap
                      destination={safeData.trip_title}
                      itinerary={itinerary}
                      tripId={tripId}
                      customRoutes={customRoutes}
                      canEdit={false}
                      nearbyPlaces={nearbyPlaces}
                      weatherByDay={weatherByDay}
                    />
                  )}
                </div>
              </section>

              {showPeopleTab && (
                <section className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between gap-2 px-4 py-3">
                    <h2 className="font-display text-base font-semibold text-foreground">
                      Going{" "}
                      <span className="font-sans text-xs font-medium text-muted-foreground">
                        ({goingCount})
                      </span>
                    </h2>
                    {isOwner && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setInviteOpen(true)}
                        className="h-8 gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-primary hover:bg-primary/10 hover:text-primary"
                      >
                        <UserPlus className="h-3.5 w-3.5" aria-hidden />
                        Invite
                      </Button>
                    )}
                  </div>

                  {roster === null && !rosterFailed ? (
                    <div className="space-y-2 border-t border-border p-3">
                      {[0, 1, 2].map((row) => (
                        <div
                          key={row}
                          className="h-9 skeleton-shimmer rounded-lg"
                        />
                      ))}
                    </div>
                  ) : sortedRoster.length === 0 ? (
                    <p className="border-t border-border px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
                      {rosterFailed
                        ? "The roster did not load here — open People for the full list."
                        : "No one has joined this trip yet."}
                    </p>
                  ) : (
                    <ul className="max-h-[268px] divide-y divide-border/70 overflow-y-auto border-t border-border">
                      {sortedRoster.map((member) => (
                        <li
                          key={member.userId}
                          className="flex items-center gap-3 px-4 py-2.5"
                        >
                          <Avatar className="h-8 w-8 shrink-0 border border-border">
                            {avatarSrc(member.avatarUrl) && (
                              <AvatarImage
                                src={avatarSrc(member.avatarUrl)}
                                alt={member.label || "Member"}
                              />
                            )}
                            <AvatarFallback className="bg-muted text-[10px] font-semibold text-muted-foreground">
                              {memberInitials(member)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-foreground">
                              {member.label || "Traveler"}
                              {member.isYou ? " (you)" : ""}
                            </p>
                            {member.email && (
                              <p className="truncate text-[11px] text-muted-foreground">
                                {member.email}
                              </p>
                            )}
                          </div>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              ROLE_PILL_CLASS[member.role]
                            )}
                          >
                            {roleLabel(member.role)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </aside>
          </div>
        </TabsContent>

        {/* TAB 2: Interactive Map View */}
        <TabsContent value="map" className="outline-hidden animate-fade-in space-y-4">
          {isRealTrip && routing && (
            <WeatherRoutingCard
              analysis={routing}
              loading={routingLoading}
              weatherAvailable={routingWeatherAvailable}
              canEdit={isRealTrip && Boolean(onSave)}
              onSwapDays={handleSwapDays}
              onSuggestIndoor={openDayAlternative}
            />
          )}
          {isRealTrip && (
            <NearbyExplorer
              itinerary={itinerary}
              canEdit={Boolean(onSave)}
              onResults={setNearbyPlaces}
              onAddToDay={onSave ? handleAddNearbyToDay : undefined}
            />
          )}
          <TripMap
            destination={safeData.trip_title}
            itinerary={itinerary}
            tripId={tripId}
            customRoutes={customRoutes}
            canEdit={isRealTrip && Boolean(onSave)}
            onUpdated={onTripUpdated}
            nearbyPlaces={nearbyPlaces}
            weatherByDay={weatherByDay}
          />
        </TabsContent>

        {/* TAB 3: Stays & Culinary Hotspots View */}
        <TabsContent value="stays" className="outline-hidden animate-fade-in">
          <StayAndCuisine
            itinerary={itinerary}
            onUpdateItinerary={
              isRealTrip && onSave ? handleUpdateItinerary : undefined
            }
          />
        </TabsContent>

        {/* TAB 4: Travel Guide & Safety View */}
        <TabsContent value="guide" className="outline-hidden animate-fade-in">
          <TravelGuideSafety
            guide={safeData.local_transport}
            weather={safeData.weather_advisory}
            footnotes={safeData.footnotes_safety_tips}
          />
        </TabsContent>

        {/* TAB 5: Expense Tracker View */}
        <TabsContent value="expenses" className="outline-hidden animate-fade-in">
          <ExpenseTracker
            tripId={tripId}
            expenses={expenses || []}
            participants={participants || []}
            baseCurrency={finance?.baseCurrency || "INR"}
            exchangeRates={finance?.exchangeRates}
            ratesUpdatedAt={finance?.ratesUpdatedAt}
            plannedBudget={safeData.budget_breakdown}
            daysCount={safeData.duration_days}
            canEdit={isRealTrip && Boolean(onSave)}
            onUpdated={onTripUpdated}
          />
        </TabsContent>

        {/* Version history (M7.2) — viewable by every member; restoring is an
            editor action, mirrored by `canRestore`. */}
        {isRealTrip && (
          <TabsContent value="history" className="outline-hidden animate-fade-in">
            <TripVersions
              tripId={tripId}
              currentVersion={version}
              hasEdited={hasEdited}
              canRestore={Boolean(onSave)}
              onRestored={(updated) => {
                // Legacy snapshots may predate the current itinerary contract.
                setItinerary(withItineraryDefaults(updated.tripDetails).day_by_day_itinerary);
                setHasUnsavedChanges(false);
                onTripUpdated?.(updated);
              }}
            />
          </TabsContent>
        )}

        {/* People & sharing view (Milestone 6 §3.8) */}
        {showPeopleTab && (
          <TabsContent value="people" className="outline-hidden animate-fade-in">
            <TripMembers
              tripId={tripId!}
              myRole={role!}
              agencyTrip={agencyTrip}
              agencyStaff={agencyStaff}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Floating trip chat (Milestone 7, F8b) — the only discussion surface;
          the FAB carries the unread badge. */}
      {showDiscussion && tripId && role && (
        <DiscussionDrawer
          tripId={tripId}
          myRole={role}
          days={safeData.duration_days}
          controller={commentsController}
          crypto={chatCrypto}
          presence={livePresence}
          onApplyProposal={onSave ? applyAssistantProposal : undefined}
          currentUserId={currentUserId}
        />
      )}

      {/* Weather-aware day alternative (Milestone 4.4) */}
      <DayAlternativeDialog
        open={alternativeDay != null}
        onOpenChange={closeDayAlternative}
        dayNumber={alternativeDay ?? 1}
        suggestion={alternative}
        loading={alternativeLoading}
        error={alternativeError}
        onApply={(activities) => {
          if (alternativeDay != null) applyDayAlternative(alternativeDay, activities);
        }}
        onRetry={() => {
          if (alternativeDay != null) void openDayAlternative(alternativeDay);
        }}
      />

      {/* Invite by link, launched from the Going card in the right rail */}
      {showPeopleTab && isOwner && isRealTrip && tripId && (
        <InviteDialog
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          tripId={tripId}
        />
      )}
    </div>
  );
};

export default ItineraryDisplay;
