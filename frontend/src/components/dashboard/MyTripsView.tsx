import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { tripCoverUrl } from "@/lib/tripCover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MapPin,
  Calendar,
  CalendarDays,
  Users,
  Search,
  LayoutGrid,
  List,
  Copy,
  Trash2,
  PlusCircle,
  ExternalLink,
  Compass,
  CheckCircle2,
  Archive,
  ArchiveRestore,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Loader2,
  Globe2,
  Link2,
  MoreHorizontal,
  ArrowRight,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, formatDateShort } from "@/lib/date";
import { TravellerBreadcrumbs } from "@/components/traveller/TravellerBreadcrumbs";
import { TravellerSegmented } from "@/components/traveller/TravellerSegmented";
import type { Trip, TripMemberSummary } from "@/types/trip";
import type { AgencyMember } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MyTripsViewProps {
  trips: Trip[];
  /** M7.7: owner-only soft-deleted trips. The agency library is archive-only and passes nothing. */
  deletedTrips?: Trip[];
  onSelectTrip: (trip: Trip) => void;
  onDuplicateTrip: (tripId: string) => Promise<void>;
  onDeleteTrip?: (tripId: string) => Promise<void>;
  onRestoreTrip?: (tripId: string) => Promise<void>;
  onPurgeTrip?: (tripId: string) => Promise<void>;
  onNewPlan: () => void;
  /** A2: the agency library reuses this view with tenant copy. */
  variant?: "personal" | "agency";
  heading?: string;
  eyebrow?: string;
  newPlanLabel?: string;
  emptyTitle?: string;
  emptyBody?: string;
  deletedHelpText?: string;
  /** Cosmetic role gates; the server enforces both. */
  canDuplicateTrip?: (trip: Trip) => boolean;
  canDeleteTrip?: (trip: Trip) => boolean;
  /** Optional controlled search/status (the agency library filters server-side). */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  statusValue?: string;
  onStatusChange?: (value: string) => void;
  /** A8 agency-only: assignee filter and the archive shelf. */
  assigneeOptions?: AgencyMember[];
  assigneeValue?: string;
  onAssigneeChange?: (value: string) => void;
  archivedValue?: "active" | "archived";
  onArchivedChange?: (value: "active" | "archived") => void;
  onArchiveTrip?: (tripId: string) => Promise<void>;
  onUnarchiveTrip?: (tripId: string) => Promise<void>;
  canArchiveTrip?: (trip: Trip) => boolean;
  /** Personal library: link to the owner's public travel page once they hold a handle. */
  travelPageHandle?: string;
  /** The agency page supplies its own shared page header; the library keeps only its controls. */
  hideHeader?: boolean;
  /** Opt-in paging for long libraries; the personal dashboard leaves it unset. */
  pageSize?: number;
}

const STATUS_CONFIG = {
  planned: {
    label: "Planned",
    badgeClass: "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800",
    icon: <Calendar className="w-3 h-3" />,
  },
  ongoing: {
    label: "Ongoing",
    badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-800",
    icon: <Compass className="w-3 h-3" />,
  },
  completed: {
    label: "Completed",
    badgeClass: "bg-purple-500/10 text-purple-600 border-purple-200 dark:border-purple-800",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  draft: {
    label: "Draft",
    badgeClass: "bg-muted text-muted-foreground border-border",
    icon: <Archive className="w-3 h-3" />,
  },
};

/** Card chip: one dot, one word. Joined reads from the caller's real trip role. */
const STATUS_CHIP: Record<string, { label: string; dotClass: string }> = {
  planned: { label: "Planned", dotClass: "bg-accent" },
  ongoing: { label: "Ongoing", dotClass: "bg-primary" },
  completed: { label: "Completed", dotClass: "bg-foreground/40" },
  draft: { label: "Draft", dotClass: "bg-muted-foreground" },
};

const MEMBER_ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  editor: "Editor",
  commenter: "Commenter",
  viewer: "Viewer",
};

const PACKAGE_STATE_BADGE = {
  none: {
    label: "No package",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
  draft: {
    label: "Draft",
    badgeClass: "bg-amber-500/10 text-amber-700 border-amber-200 dark:border-amber-800",
  },
  published: {
    label: "Published",
    badgeClass: "bg-teal-500/10 text-teal-700 border-teal-200 dark:border-teal-800",
  },
} as const;

const QUOTE_STATE_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  expired: "Expired",
  cancelled: "Cancelled",
};

const QUOTE_STATE_BADGE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  sent: "bg-sky-500/10 text-sky-700 border-sky-200 dark:border-sky-800",
  accepted: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:border-emerald-800",
  expired: "bg-amber-500/10 text-amber-700 border-amber-200 dark:border-amber-800",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const PROPOSAL_STATE = {
  none: {
    label: "Not shared",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
  active: {
    label: "Awaiting reply",
    badgeClass: "bg-sky-500/10 text-sky-700 border-sky-200 dark:border-sky-800",
  },
  accepted: {
    label: "Accepted",
    badgeClass: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:border-emerald-800",
  },
  declined: {
    label: "Declined",
    badgeClass: "bg-rose-500/10 text-rose-700 border-rose-200 dark:border-rose-800",
  },
  expired: {
    label: "Closed",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
} as const;

/** Personal library tabs. They group the four real statuses plus the trash. */
type PersonalTab = "upcoming" | "drafts" | "past" | "trash";

const matchesPersonalTab = (trip: Trip, tab: PersonalTab): boolean => {
  const status = trip.status || "planned";
  if (tab === "drafts") return status === "draft";
  if (tab === "past") return status === "completed";
  if (tab === "upcoming") return status === "planned" || status === "ongoing";
  return false;
};

const tripTitleOf = (trip: Trip): string =>
  trip.title || trip.tripDetails?.trip_title || "Custom Trip";

/** The list projection carries no destination today, so use it only when it is really there. */
const tripDestinationOf = (trip: Trip): string => {
  const value = trip.generationMeta?.request?.destination;
  return typeof value === "string" ? value.trim() : "";
};

/** "12 Jun – 20 Jun 2025" when the window is known; otherwise null (never a made-up date). */
const tripScheduleLabel = (trip: Trip): string | null => {
  if (!trip.startDate) return null;
  const start = new Date(trip.startDate);
  if (Number.isNaN(start.getTime())) return null;
  if (!trip.endDate) return formatDate(trip.startDate);
  const end = new Date(trip.endDate);
  if (Number.isNaN(end.getTime()) || trip.startDate === trip.endDate) {
    return formatDate(trip.startDate);
  }
  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${formatDateShort(trip.startDate)} – ${formatDate(trip.endDate)}`;
  }
  return `${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`;
};

const statusChipFor = (trip: Trip, joined: boolean) => {
  if (joined) return { label: "Joined", dotClass: "bg-primary" };
  return STATUS_CHIP[trip.status || "planned"] ?? STATUS_CHIP.planned;
};

const searchHaystack = (trip: Trip): string => {
  const days = trip.tripDetails?.duration_days;
  return [
    tripTitleOf(trip),
    tripDestinationOf(trip),
    tripScheduleLabel(trip) ?? "",
    trip.startDate ? formatDate(trip.startDate) : "",
    days ? `${days} days` : "",
    trip.tripDetails?.group_type ?? "",
    trip.createdAt ? formatDate(trip.createdAt) : "",
  ]
    .join(" ")
    .toLowerCase();
};

/**
 * Avatar row for the people who really are on the trip. The list payload ships
 * role-only member rows, so the stack stays anonymous instead of inventing names
 * or photos; the role rides along in the tooltip.
 */
const MemberStack: React.FC<{ members?: TripMemberSummary[] }> = ({ members }) => {
  const rows = (members ?? []).filter((member) => member?.userId);
  if (rows.length === 0) return null;
  const shown = rows.slice(0, 4);
  const extra = rows.length - shown.length;

  return (
    <div className="flex items-center">
      <div className="flex items-center">
        {shown.map((member, index) => (
          <span
            key={member.userId}
            title={`${MEMBER_ROLE_LABEL[member.role] ?? "Member"} on this trip`}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-muted text-muted-foreground",
              index > 0 && "-ml-2"
            )}
          >
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        ))}
        {extra > 0 ? (
          <span className="-ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-bold text-muted-foreground">
            +{extra}
          </span>
        ) : null}
      </div>
      <span className="sr-only">
        {rows.length === 1 ? "1 person is on this trip" : `${rows.length} people are on this trip`}
      </span>
    </div>
  );
};

const TripActionsMenu: React.FC<{
  label: string;
  acting?: boolean;
  children: React.ReactNode;
}> = ({ label, acting, children }) => {
  if (acting) {
    return (
      <span className="grid h-8 w-8 place-items-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </span>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`More actions for ${label}`}
          onClick={(event) => event.stopPropagation()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-xl border-border/80 p-1">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const MenuItem: React.FC<{
  onSelect: () => void;
  children: React.ReactNode;
  destructive?: boolean;
}> = ({ onSelect, children, destructive }) => (
  <DropdownMenuItem
    onSelect={onSelect}
    className={cn(
      "gap-2 rounded-lg text-xs font-medium",
      destructive && "text-destructive focus:bg-destructive/10 focus:text-destructive"
    )}
  >
    {children}
  </DropdownMenuItem>
);

/** One photo card for the library grid. */
const TripCard: React.FC<{
  trip: Trip;
  joined?: boolean;
  onOpen: () => void;
  menuItems?: React.ReactNode;
  acting?: boolean;
  note?: string;
}> = ({ trip, joined = false, onOpen, menuItems, acting, note }) => {
  const title = tripTitleOf(trip);
  const destination = tripDestinationOf(trip);
  const schedule = tripScheduleLabel(trip);
  const days = trip.tripDetails?.duration_days;
  const chip = statusChipFor(trip, joined);
  const cover = tripCoverUrl(`${destination} ${title}`, 800);
  const scheduleText =
    schedule ??
    (days
      ? `${days} ${days === 1 ? "day" : "days"}`
      : trip.createdAt
      ? `Created ${formatDate(trip.createdAt)}`
      : "");

  return (
    <article
      onClick={onOpen}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xs transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        <img
          src={cover}
          alt={destination ? `${title} in ${destination}` : title}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-[10px] font-bold text-foreground shadow-xs backdrop-blur">
          <span className={cn("h-1.5 w-1.5 rounded-full", chip.dotClass)} aria-hidden="true" />
          {chip.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h3 className="line-clamp-2 font-display text-lg font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">
          {title}
        </h3>
        <div className="space-y-1 text-[11px] text-muted-foreground">
          {destination ? (
            <p className="flex min-w-0 items-center gap-1.5">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{destination}</span>
            </p>
          ) : null}
          <p className="flex min-w-0 items-center gap-1.5">
            <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{scheduleText}</span>
          </p>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <MemberStack members={trip.members} />
          {note ? (
            <span
              className="min-w-0 truncate text-[10px] text-muted-foreground"
              title={note}
            >
              {note}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
        >
          Open trip
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        {menuItems ? (
          <TripActionsMenu label={title} acting={acting}>
            {menuItems}
          </TripActionsMenu>
        ) : null}
      </div>
    </article>
  );
};

const EmptyState: React.FC<{
  title: string;
  body: string;
  action?: React.ReactNode;
}> = ({ title, body, action }) => (
  <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 px-6 py-14 text-center">
    <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
      <Compass className="h-5 w-5" aria-hidden="true" />
    </span>
    <h3 className="mt-4 font-display text-xl font-semibold tracking-tight text-foreground">
      {title}
    </h3>
    <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
      {body}
    </p>
    {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
  </div>
);

export const MyTripsView: React.FC<MyTripsViewProps> = ({
  trips,
  deletedTrips = [],
  onSelectTrip,
  onDuplicateTrip,
  onDeleteTrip,
  onRestoreTrip,
  onPurgeTrip,
  onNewPlan,
  variant = "personal",
  heading,
  eyebrow,
  hideHeader = false,
  newPlanLabel,
  emptyTitle,
  emptyBody,
  deletedHelpText,
  canDuplicateTrip,
  canDeleteTrip,
  searchValue,
  onSearchChange,
  statusValue,
  onStatusChange,
  assigneeOptions,
  assigneeValue,
  onAssigneeChange,
  archivedValue,
  onArchivedChange,
  onArchiveTrip,
  onUnarchiveTrip,
  canArchiveTrip,
  travelPageHandle,
  pageSize,
}) => {
  const isAgency = variant === "agency";
  const showingArchived = archivedValue === "archived";
  const planLabel = newPlanLabel ?? (isAgency ? "Create Agency Trip" : "Plan a new trip");
  const [internalSearch, setInternalSearch] = useState("");
  const [internalStatusFilter, setInternalStatusFilter] = useState<string>("all");
  const search = searchValue ?? internalSearch;
  const statusFilter = statusValue ?? internalStatusFilter;
  const setSearch = (value: string) =>
    onSearchChange ? onSearchChange(value) : setInternalSearch(value);
  const setStatusFilter = (value: string) =>
    onStatusChange ? onStatusChange(value) : setInternalStatusFilter(value);
  const [personalTab, setPersonalTab] = useState<PersonalTab>("upcoming");
  const [viewMode, setViewMode] = useState<"grid" | "list">(
    variant === "agency" ? "list" : "grid"
  );
  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null);
  const [tripToPurge, setTripToPurge] = useState<Trip | null>(null);
  const [showDeleted, setShowDeleted] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [tripPage, setTripPage] = useState(1);

  const searchedTrips = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return trips;
    return trips.filter((trip) => searchHaystack(trip).includes(query));
  }, [trips, search]);

  const filteredTrips = useMemo(() => {
    if (!isAgency) {
      return searchedTrips.filter((trip) => matchesPersonalTab(trip, personalTab));
    }
    return searchedTrips.filter((trip) => {
      const tripStatus = trip.status || "planned";
      return statusFilter === "all" || tripStatus === statusFilter;
    });
  }, [searchedTrips, isAgency, personalTab, statusFilter]);

  // Milestone 6 (F9): trips the user owns vs trips shared with them. The role
  // annotation comes with every trip row; a missing role reads as owned
  // (legacy payloads / freshly generated previews).
  const ownedTrips = useMemo(
    () =>
      isAgency
        ? filteredTrips
        : filteredTrips.filter((trip) => !trip.role || trip.role === "owner"),
    [filteredTrips, isAgency]
  );
  const sharedTrips = useMemo(
    () =>
      isAgency
        ? []
        : filteredTrips.filter((trip) => trip.role && trip.role !== "owner"),
    [filteredTrips, isAgency]
  );

  const pageLength = pageSize && pageSize > 0 ? pageSize : 0;
  const tripTotalPages = pageLength
    ? Math.max(1, Math.ceil(ownedTrips.length / pageLength))
    : 1;
  const pagedOwnedTrips = pageLength
    ? ownedTrips.slice((tripPage - 1) * pageLength, tripPage * pageLength)
    : ownedTrips;

  // A new search, filter or layout starts back at the first page; deleting
  // rows off the last page steps back instead of leaving an empty table.
  useEffect(() => {
    setTripPage(1);
  }, [search, statusFilter, personalTab, assigneeValue, archivedValue, viewMode, pageSize]);

  useEffect(() => {
    if (tripPage > tripTotalPages) setTripPage(tripTotalPages);
  }, [tripPage, tripTotalPages]);

  const runDuplicate = async (tripId: string) => {
    try {
      setActionLoadingId(tripId);
      await onDuplicateTrip(tripId);
    } finally {
      setActionLoadingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!tripToDelete || !onDeleteTrip) return;
    try {
      setActionLoadingId(tripToDelete._id);
      await onDeleteTrip(tripToDelete._id);
    } catch {
      // The caller already showed the error toast.
    } finally {
      setActionLoadingId(null);
      setTripToDelete(null);
    }
  };

  const handleRestore = async (trip: Trip) => {
    if (!onRestoreTrip) return;
    try {
      setActionLoadingId(trip._id);
      await onRestoreTrip(trip._id);
    } catch {
      // The dashboard already showed the error toast.
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleArchive = async (trip: Trip) => {
    if (!onArchiveTrip) return;
    try {
      setActionLoadingId(trip._id);
      await onArchiveTrip(trip._id);
    } catch {
      // The caller already showed the error toast.
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUnarchive = async (trip: Trip) => {
    if (!onUnarchiveTrip) return;
    try {
      setActionLoadingId(trip._id);
      await onUnarchiveTrip(trip._id);
    } catch {
      // The caller already showed the error toast.
    } finally {
      setActionLoadingId(null);
    }
  };

  const assigneeName = (userId?: string): string => {
    if (!userId) return "Unassigned";
    const match = assigneeOptions?.find((member) => member.userId === userId);
    return match?.label || match?.email || "Agency member";
  };

  const confirmPurge = async () => {
    if (!tripToPurge || !onPurgeTrip) return;
    try {
      setActionLoadingId(tripToPurge._id);
      await onPurgeTrip(tripToPurge._id);
      setTripToPurge(null);
    } catch {
      // Keep the dialog open so the owner can retry or cancel.
    } finally {
      setActionLoadingId(null);
    }
  };

  /** The owner's own share token is the only copyable link; members never receive it. */
  const copyShareLink = async (trip: Trip) => {
    if (!trip.shareId) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/shared/${trip.shareId}`);
      toast.success("Share link copied.");
    } catch {
      toast.error("Could not copy the share link.");
    }
  };

  const deletedDate = (trip: Trip): string =>
    formatDate(trip.deletedAt || trip.updatedAt || "") || "recently";

  const deletedRow = (trip: Trip) => {
    const title = trip.title || trip.tripDetails?.trip_title || "Deleted trip";
    const days = trip.tripDetails?.duration_days;
    const schedule = tripScheduleLabel(trip);
    const destination = tripDestinationOf(trip);
    const cover = tripCoverUrl(`${destination} ${title}`, 320);
    const isActing = actionLoadingId === trip._id;
    const detail = schedule ?? (days ? `${days} ${days === 1 ? "day" : "days"}` : null);

    return (
      <div
        key={trip._id}
        className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={cover}
            alt={title}
            loading="lazy"
            className="h-12 w-16 shrink-0 rounded-lg object-cover opacity-80"
          />
          <div className="min-w-0">
            <h4 className="truncate font-display text-sm font-semibold tracking-tight text-foreground">
              {title}
            </h4>
            <p className="truncate text-[11px] text-muted-foreground">
              {[detail, `Deleted ${deletedDate(trip)}`].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 self-end sm:self-center">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isActing}
            onClick={() => handleRestore(trip)}
            className="h-8 gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary"
          >
            {isActing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Restore
          </Button>
          {onPurgeTrip ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              title="Delete forever"
              disabled={isActing}
              onClick={() => setTripToPurge(trip)}
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
    );
  };

  const deletedShelf = (expanded: boolean) => (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xs">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base font-semibold tracking-tight text-foreground">
                Recently deleted
              </h2>
              <Badge variant="outline" className="text-[10px]">
                {deletedTrips.length}
              </Badge>
            </div>
            <p className="mt-0.5 max-w-xl text-[11px] leading-relaxed text-muted-foreground">
              {deletedHelpText ??
                "Trips you removed. Restore one to bring back the itinerary and chat; old share links and invites stay revoked."}
            </p>
          </div>
        </div>
        {personalTab === "trash" ? null : (
          <button
            type="button"
            onClick={() => setShowDeleted((open) => !open)}
            aria-expanded={showDeleted}
            aria-label={showDeleted ? "Hide recently deleted trips" : "Show recently deleted trips"}
            className="self-start rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:self-auto"
          >
            {showDeleted ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {expanded ? (
        <div className="space-y-2 border-t border-border/60 p-3">
          {deletedTrips.map((trip) => deletedRow(trip))}
        </div>
      ) : null}
    </section>
  );

  const ownedMenu = (trip: Trip) => (
    <>
      <MenuItem onSelect={() => onSelectTrip(trip)}>Open trip</MenuItem>
      {(!canDuplicateTrip || canDuplicateTrip(trip)) && (
        <MenuItem onSelect={() => void runDuplicate(trip._id)}>
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          Duplicate as draft
        </MenuItem>
      )}
      {trip.shareId ? (
        <MenuItem onSelect={() => void copyShareLink(trip)}>
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          Copy share link
        </MenuItem>
      ) : null}
      {onDeleteTrip && (!canDeleteTrip || canDeleteTrip(trip)) ? (
        <>
          <DropdownMenuSeparator />
          <MenuItem destructive onSelect={() => setTripToDelete(trip)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Move to Recently deleted
          </MenuItem>
        </>
      ) : null}
    </>
  );

  const sharedMenu = (trip: Trip) => (
    <>
      <MenuItem onSelect={() => onSelectTrip(trip)}>Open trip</MenuItem>
      {(!canDuplicateTrip || canDuplicateTrip(trip)) && (
        <MenuItem onSelect={() => void runDuplicate(trip._id)}>
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          Copy to my trips
        </MenuItem>
      )}
    </>
  );

  const agencyMenu = (trip: Trip) => (
    <>
      <MenuItem onSelect={() => onSelectTrip(trip)}>Open trip</MenuItem>
      {!showingArchived && (!canDuplicateTrip || canDuplicateTrip(trip)) && (
        <MenuItem onSelect={() => void runDuplicate(trip._id)}>
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          Duplicate as draft
        </MenuItem>
      )}
      {!showingArchived &&
      onArchiveTrip &&
      (!canArchiveTrip || canArchiveTrip(trip)) ? (
        <MenuItem onSelect={() => void handleArchive(trip)}>
          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
          Archive trip
        </MenuItem>
      ) : null}
      {showingArchived &&
      onUnarchiveTrip &&
      (!canArchiveTrip || canArchiveTrip(trip)) ? (
        <MenuItem onSelect={() => void handleUnarchive(trip)}>
          <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
          Restore to active list
        </MenuItem>
      ) : null}
    </>
  );

  const hasQuery =
    Boolean(search.trim()) ||
    (isAgency ? statusFilter !== "all" : false) ||
    Boolean(assigneeValue && assigneeValue !== "all");

  const emptyCopy = (() => {
    if (showingArchived) {
      return {
        title: "No archived trips",
        body:
          "Archive a trip from the active list to keep the library tidy; pinned exports and client links keep working.",
      };
    }
    if (hasQuery) {
      return {
        title: "No matching trips found",
        body: "Try a different word, a destination, or another tab.",
      };
    }
    if (isAgency) {
      return {
        title: emptyTitle ?? "No agency trips yet",
        body:
          emptyBody ??
          "Plan a client trip with AI, then refine it with your team and invite the client from the People tab.",
      };
    }
    if (personalTab === "drafts") {
      return {
        title: emptyTitle ?? "No drafts",
        body: emptyBody ?? "Drafts are trips still taking shape. Start one and it will wait for you here.",
      };
    }
    if (personalTab === "past") {
      return {
        title: emptyTitle ?? "No past trips yet",
        body:
          emptyBody ??
          "Set a trip to completed when you are back and it will move here so the upcoming list stays current.",
      };
    }
    if (deletedTrips.length > 0) {
      return {
        title: emptyTitle ?? "No trips here right now",
        body: "Restore a trip from Recently deleted below, or start a new plan.",
      };
    }
    return {
      title: emptyTitle ?? "No upcoming trips yet",
      body: emptyBody ?? "Plan a trip and it will show up here.",
    };
  })();

  const emptyAction = (
    <Button
      type="button"
      variant="hero"
      onClick={onNewPlan}
      className="h-10 gap-2 rounded-xl px-4 text-xs font-semibold"
    >
      <PlusCircle className="h-4 w-4" aria-hidden="true" />
      <span>{planLabel}</span>
    </Button>
  );

  const personalListRow = (trip: Trip) => {
    const title = tripTitleOf(trip);
    const destination = tripDestinationOf(trip);
    const schedule = tripScheduleLabel(trip);
    const days = trip.tripDetails?.duration_days;
    const chip = statusChipFor(trip, Boolean(trip.role && trip.role !== "owner"));
    const cover = tripCoverUrl(`${destination} ${title}`, 320);
    const isActing = actionLoadingId === trip._id;
    const scheduleText =
      schedule ??
      (days
        ? `${days} ${days === 1 ? "day" : "days"}`
        : trip.createdAt
        ? `Created ${formatDate(trip.createdAt)}`
        : "");

    return (
      <article
        key={trip._id}
        onClick={() => onSelectTrip(trip)}
        className="group flex cursor-pointer flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-xs transition-colors hover:border-primary/30 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={cover}
            alt={title}
            loading="lazy"
            className="h-16 w-24 shrink-0 rounded-xl object-cover"
          />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground">
                <span className={cn("h-1.5 w-1.5 rounded-full", chip.dotClass)} aria-hidden="true" />
                {chip.label}
              </span>
              <span className="text-[11px] text-muted-foreground">{scheduleText}</span>
            </div>
            <h3 className="truncate font-display text-base font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
              {title}
            </h3>
            {destination ? (
              <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{destination}</span>
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1.5 self-end sm:self-center">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 rounded-xl px-3 text-xs font-semibold"
            onClick={(event) => {
              event.stopPropagation();
              onSelectTrip(trip);
            }}
          >
            <span>Open trip</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <TripActionsMenu label={title} acting={isActing}>
            {trip.role && trip.role !== "owner" ? sharedMenu(trip) : ownedMenu(trip)}
          </TripActionsMenu>
        </div>
      </article>
    );
  };

  return (
    <div className={cn("animate-fade-in space-y-6", hideHeader ? "" : "mx-auto max-w-6xl")}>
      {/* Top Controls Header */}
      {hideHeader ? null : isAgency ? (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-card border border-border/70 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-primary">
                {eyebrow ?? "Agency Trip Library"}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {trips.length} Agency Trips
              </Badge>
            </div>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
              {heading ?? "Agency trips"}
            </h2>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            {travelPageHandle && (
              <Button
                asChild
                variant="outline"
                className="rounded-xl h-11 px-4 text-xs font-bold gap-2"
              >
                <Link to={`/travelers/${encodeURIComponent(travelPageHandle)}`}>
                  <Globe2 className="h-4 w-4" />
                  Your travel page
                </Link>
              </Button>
            )}
            <Button
              type="button"
              variant="hero"
              onClick={onNewPlan}
              className="rounded-xl h-11 px-5 text-xs font-bold gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{planLabel}</span>
            </Button>
          </div>
        </div>
      ) : (
        <header className="space-y-4">
          <TravellerBreadcrumbs items={[{ label: "Dashboard" }]} />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
                {heading ?? "My trips"}
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Your plans, drafts and the trips you joined.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {travelPageHandle ? (
                <Button
                  asChild
                  variant="outline"
                  className="h-11 gap-2 rounded-xl px-4 text-sm font-semibold"
                >
                  <Link to={`/travelers/${encodeURIComponent(travelPageHandle)}`}>
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                    My public page
                  </Link>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="hero"
                onClick={onNewPlan}
                className="h-11 gap-2 rounded-xl px-5 text-sm font-semibold"
              >
                <PlusCircle className="h-4 w-4" aria-hidden="true" />
                <span>{planLabel}</span>
              </Button>
            </div>
          </div>
        </header>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {isAgency ? (
          <div className="flex flex-wrap items-center gap-2">
            {onAssigneeChange && assigneeOptions ? (
              <Select value={assigneeValue || "all"} onValueChange={onAssigneeChange}>
                <SelectTrigger className="h-9 w-[150px] rounded-xl text-xs">
                  <SelectValue placeholder="Assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">
                    All assignees
                  </SelectItem>
                  <SelectItem value="unassigned" className="text-xs">
                    Unassigned
                  </SelectItem>
                  {assigneeOptions.map((member) => (
                    <SelectItem key={member.userId} value={member.userId} className="text-xs">
                      {member.label || member.email || "Agency member"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {onArchivedChange ? (
              <div className="inline-flex rounded-full border border-border/70 bg-card p-1">
                {(["active", "archived"] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    aria-pressed={showingArchived === (view === "archived")}
                    onClick={() => onArchivedChange(view)}
                    className={cn(
                      "inline-flex min-h-[30px] items-center rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors",
                      showingArchived === (view === "archived")
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {view}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="inline-flex flex-wrap rounded-full border border-border/70 bg-card p-1">
              {["all", "planned", "ongoing", "completed", "draft"].map((status) => (
                <button
                  key={status}
                  type="button"
                  aria-pressed={statusFilter === status}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "inline-flex min-h-[30px] items-center rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors",
                    statusFilter === status
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <TravellerSegmented<PersonalTab>
            ariaLabel="Filter trips"
            value={personalTab}
            onChange={(value) => setPersonalTab(value)}
            options={[
              { value: "upcoming", label: "Upcoming" },
              { value: "drafts", label: "Drafts" },
              { value: "past", label: "Past" },
              { value: "trash", label: "Trash" },
            ]}
            className="border-border/70 bg-muted/50 [&>button]:min-h-[34px] [&>button]:px-4"
          />
        )}

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 lg:w-[340px] lg:flex-none">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={
                isAgency
                  ? "Search by destination or title…"
                  : "Search trips, destinations or dates…"
              }
              aria-label="Search trips"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 rounded-xl border-border/70 bg-card pl-10 text-xs shadow-xs"
            />
          </div>
          <div className="inline-flex shrink-0 rounded-xl border border-border/70 bg-card p-0.5">
            <Button
              type="button"
              size="icon"
              variant={viewMode === "grid" ? "default" : "ghost"}
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
              onClick={() => setViewMode("grid")}
              className="h-9 w-9 rounded-lg"
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={viewMode === "list" ? "default" : "ghost"}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
              onClick={() => setViewMode("list")}
              className="h-9 w-9 rounded-lg"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Trips Content */}
      {!isAgency && personalTab === "trash" ? (
        deletedTrips.length > 0 ? (
          deletedShelf(true)
        ) : (
          <EmptyState
            title="Trash is empty"
            body="Trips you remove from your library wait here, so you can restore one if you change your mind."
            action={emptyAction}
          />
        )
      ) : ownedTrips.length === 0 && sharedTrips.length === 0 ? (
        <EmptyState title={emptyCopy.title} body={emptyCopy.body} action={emptyAction} />
      ) : viewMode === "grid" ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {pagedOwnedTrips.map((trip) => (
            <TripCard
              key={trip._id}
              trip={trip}
              onOpen={() => onSelectTrip(trip)}
              acting={actionLoadingId === trip._id}
              note={isAgency ? `Assigned to ${assigneeName(trip.assignedTo)}` : undefined}
              menuItems={isAgency ? agencyMenu(trip) : ownedMenu(trip)}
            />
          ))}
        </div>
      ) : isAgency ? (
        /* AGENCY LIST VIEW: one row per trip, so package, quote and proposal
           state line up instead of hiding in separate tabs. */
        <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-xs">
          <table className="w-full min-w-[880px] text-left text-xs">
            <thead className="border-b border-border/70 bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Trip</th>
                <th className="px-3 py-3">Client</th>
                <th className="px-3 py-3">Planner</th>
                <th className="px-3 py-3">Package</th>
                <th className="px-3 py-3">Quote</th>
                <th className="px-3 py-3">Proposal</th>
                <th className="px-3 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {pagedOwnedTrips.map((trip) => {
                const title =
                  trip.title || trip.tripDetails?.trip_title || "Custom Trip";
                const statusKey =
                  (trip.status as keyof typeof STATUS_CONFIG) || "planned";
                const statusInfo =
                  STATUS_CONFIG[statusKey] || STATUS_CONFIG.planned;
                const days = trip.tripDetails?.duration_days || 5;
                const isActing = actionLoadingId === trip._id;
                const summary = trip.agencySummary;
                const packageBadge =
                  PACKAGE_STATE_BADGE[summary?.packageState ?? "none"];
                const quoteStatus = summary?.quoteStatus ?? null;
                const proposalBadge =
                  PROPOSAL_STATE[summary?.proposalState ?? "none"];

                return (
                  <tr
                    key={trip._id}
                    className="transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onSelectTrip(trip)}
                        className="text-left font-extrabold text-foreground transition-colors hover:text-primary"
                      >
                        {title}
                      </button>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <Badge
                          className={cn(
                            "px-2 py-0.5 text-[10px] font-bold gap-1",
                            statusInfo.badgeClass
                          )}
                        >
                          {statusInfo.icon}
                          <span>{statusInfo.label}</span>
                        </Badge>
                        <span>
                          {days} {days === 1 ? "day" : "days"}
                        </span>
                      </div>
                    </td>
                    <td className="max-w-[160px] px-3 py-3">
                      {summary?.clientName ? (
                        <span
                          className="block truncate font-semibold text-foreground"
                          title={summary.clientName}
                        >
                          {summary.clientName}
                        </span>
                      ) : trip.clientId ? (
                        <span className="text-muted-foreground">Linked client</span>
                      ) : (
                        <span className="text-muted-foreground">No client</span>
                      )}
                    </td>
                    <td className="max-w-[140px] px-3 py-3">
                      <span
                        className={cn(
                          "block truncate",
                          trip.assignedTo
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground"
                        )}
                        title={assigneeName(trip.assignedTo)}
                      >
                        {assigneeName(trip.assignedTo)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-bold",
                          packageBadge.badgeClass
                        )}
                      >
                        {packageBadge.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      {quoteStatus ? (
                        <div className="space-y-0.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-bold",
                              QUOTE_STATE_BADGE[quoteStatus] ??
                                QUOTE_STATE_BADGE.draft
                            )}
                          >
                            {QUOTE_STATE_LABEL[quoteStatus] ?? quoteStatus}
                          </Badge>
                          {summary?.quoteNumber ? (
                            <p className="text-[10px] text-muted-foreground">
                              {summary.quoteNumber}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-bold",
                          proposalBadge.badgeClass
                        )}
                      >
                        {proposalBadge.label}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                      {formatDate(trip.updatedAt || trip.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-lg px-2.5 text-[11px] font-bold gap-1"
                          onClick={() => onSelectTrip(trip)}
                        >
                          Open
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                        {!showingArchived &&
                          (!canDuplicateTrip || canDuplicateTrip(trip)) && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              title="Duplicate as draft"
                              disabled={isActing}
                              onClick={() => void runDuplicate(trip._id)}
                              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        {!showingArchived &&
                          onArchiveTrip &&
                          (!canArchiveTrip || canArchiveTrip(trip)) && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              title="Archive trip"
                              disabled={isActing}
                              onClick={() => void handleArchive(trip)}
                              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-amber-600"
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        {showingArchived &&
                          onUnarchiveTrip &&
                          (!canArchiveTrip || canArchiveTrip(trip)) && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              title="Restore to the active list"
                              disabled={isActing}
                              onClick={() => void handleUnarchive(trip)}
                              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-emerald-600"
                            >
                              <ArchiveRestore className="h-3.5 w-3.5" />
                            </Button>
                          )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* PERSONAL LIST VIEW */
        <div className="space-y-3">{pagedOwnedTrips.map((trip) => personalListRow(trip))}</div>
      )}

      {pageLength > 0 && ownedTrips.length > 0 ? (
        <AdminPagination
          page={tripPage}
          totalPages={tripTotalPages}
          total={ownedTrips.length}
          noun="trip"
          onChange={setTripPage}
          className="rounded-xl border border-border/70 bg-card"
        />
      ) : null}

      {/* "Shared with me" (Milestone 6 §3.8): trips owned by someone else.
          Deletion is never offered — only the owner can delete on the server. */}
      {sharedTrips.length > 0 && (
        <section className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
              Shared with me
            </h2>
            <Badge variant="outline" className="text-[10px]">
              {sharedTrips.length}
            </Badge>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sharedTrips.map((trip) => (
              <TripCard
                key={trip._id}
                trip={trip}
                joined
                onOpen={() => onSelectTrip(trip)}
                acting={actionLoadingId === trip._id}
                menuItems={sharedMenu(trip)}
              />
            ))}
          </div>
        </section>
      )}

      {/* M7.7: Recently deleted. Only current owners ever receive these rows;
          members without the owner role have no restore action. The agency
          library is archive-only and never renders this shelf. */}
      {!isAgency && personalTab !== "trash" && deletedTrips.length > 0
        ? deletedShelf(showDeleted)
        : null}

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog
        open={!!tripToDelete}
        onOpenChange={(open) => {
          if (!open) setTripToDelete(null);
        }}
      >
        <AlertDialogContent className="rounded-2xl max-w-md w-[92vw] sm:w-full p-5 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-lg font-semibold">
              Move to Recently deleted?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              This removes{" "}
              <strong className="text-foreground">
                "{tripToDelete?.title || tripToDelete?.tripDetails?.trip_title}"
              </strong>{" "}
              from your library and revokes its share link and pending invites.
              Only the owner can see it in Recently deleted; you can restore it
              later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl text-xs font-semibold h-10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="rounded-xl text-xs font-bold h-10 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Move to trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent-delete confirmation. Sharper copy than the soft delete. */}
      <AlertDialog
        open={!!tripToPurge}
        onOpenChange={(open) => {
          if (!open) setTripToPurge(null);
        }}
      >
        <AlertDialogContent className="rounded-2xl max-w-md w-[92vw] sm:w-full p-5 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-lg font-semibold">
              Delete this trip forever?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              <strong className="text-foreground">
                "{tripToPurge?.title || tripToPurge?.tripDetails?.trip_title}"
              </strong>{" "}
              will be permanently deleted, including its itinerary and history,
              chat, polls, decisions, expenses and receipt files. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl text-xs font-semibold h-10">
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmPurge}
              className="rounded-xl text-xs font-bold h-10 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
