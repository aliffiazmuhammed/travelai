import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  MapPin,
  Calendar,
  Users,
  IndianRupee,
  Search,
  LayoutGrid,
  List,
  Copy,
  Trash2,
  PlusCircle,
  ExternalLink,
  Sparkles,
  Compass,
  CheckCircle2,
  Clock,
  Archive,
  ArchiveRestore,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/date";
import type { Trip } from "@/types/trip";
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
  /** M7.7: owner-only soft-deleted trips. */
  deletedTrips: Trip[];
  onSelectTrip: (trip: Trip) => void;
  onDuplicateTrip: (tripId: string) => Promise<void>;
  onDeleteTrip: (tripId: string) => Promise<void>;
  onRestoreTrip: (tripId: string) => Promise<void>;
  onPurgeTrip: (tripId: string) => Promise<void>;
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
}

const DESTINATION_IMAGES: Record<string, string> = {
  // Hill stations & mountains
  wayanad: "https://images.unsplash.com/photo-1630938819488-ba7d1440d48b?auto=format&fit=crop&w=600&q=80",
  munnar: "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&w=600&q=80",
  coorg: "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=600&q=80",
  ooty: "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=600&q=80",
  manali: "https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?auto=format&fit=crop&w=600&q=80",
  shimla: "https://images.unsplash.com/photo-1600683796695-103347b7fe70?auto=format&fit=crop&w=600&q=80",
  kashmir: "https://images.unsplash.com/photo-1595815771614-ade9d652a65d?auto=format&fit=crop&w=600&q=80",
  ladakh: "https://images.unsplash.com/photo-1581793745862-99fde7fa73d2?auto=format&fit=crop&w=600&q=80",
  rishikesh: "https://images.unsplash.com/photo-1609137144822-263a238fb065?auto=format&fit=crop&w=600&q=80",
  // Backwaters, coasts & heritage
  alleppey: "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=600&q=80",
  alappuzha: "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=600&q=80",
  goa: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=600&q=80",
  andaman: "https://images.unsplash.com/photo-1589182373726-e4f658ab50f0?auto=format&fit=crop&w=600&q=80",
  jaipur: "https://images.unsplash.com/photo-1603262110263-fb010d6e75dc?auto=format&fit=crop&w=600&q=80",
  udaipur: "https://images.unsplash.com/photo-1615836245337-f5b9b2303f10?auto=format&fit=crop&w=600&q=80",
  varanasi: "https://images.unsplash.com/photo-1561359313-0639aad49ca6?auto=format&fit=crop&w=600&q=80",
  // Regional fallbacks
  kerala: "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=600&q=80",
};

const DEFAULT_THUMB =
  "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=600&q=80";

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

export const MyTripsView: React.FC<MyTripsViewProps> = ({
  trips,
  deletedTrips,
  onSelectTrip,
  onDuplicateTrip,
  onDeleteTrip,
  onRestoreTrip,
  onPurgeTrip,
  onNewPlan,
  variant = "personal",
  heading,
  eyebrow,
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
}) => {
  const isAgency = variant === "agency";
  const showingArchived = archivedValue === "archived";
  const planLabel = newPlanLabel ?? (isAgency ? "Create Agency Trip" : "Plan New Trip");
  const [internalSearch, setInternalSearch] = useState("");
  const [internalStatusFilter, setInternalStatusFilter] = useState<string>("all");
  const search = searchValue ?? internalSearch;
  const statusFilter = statusValue ?? internalStatusFilter;
  const setSearch = (value: string) =>
    onSearchChange ? onSearchChange(value) : setInternalSearch(value);
  const setStatusFilter = (value: string) =>
    onStatusChange ? onStatusChange(value) : setInternalStatusFilter(value);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null);
  const [tripToPurge, setTripToPurge] = useState<Trip | null>(null);
  const [showDeleted, setShowDeleted] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const getTripCover = (title: string): string => {
    const lower = title.toLowerCase();
    const priorityDestinations = [
      "wayanad", "munnar", "coorg", "ooty", "manali", "shimla",
      "kashmir", "ladakh", "rishikesh", "alleppey", "alappuzha",
      "goa", "andaman", "jaipur", "udaipur", "varanasi"
    ];
    for (const key of priorityDestinations) {
      if (lower.includes(key)) return DESTINATION_IMAGES[key];
    }
    for (const [key, url] of Object.entries(DESTINATION_IMAGES)) {
      if (lower.includes(key)) return url;
    }
    return DEFAULT_THUMB;
  };

  const filteredTrips = useMemo(() => {
    return trips.filter((trip) => {
      const title = trip.title || trip.tripDetails?.trip_title || "";
      const matchesSearch =
        !search.trim() || title.toLowerCase().includes(search.toLowerCase());
      const tripStatus = trip.status || "planned";
      const matchesStatus =
        statusFilter === "all" || tripStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [trips, search, statusFilter]);

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

  const handleDuplicate = async (e: React.MouseEvent, tripId: string) => {
    e.stopPropagation();
    try {
      setActionLoadingId(tripId);
      await onDuplicateTrip(tripId);
    } finally {
      setActionLoadingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!tripToDelete) return;
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
    if (!tripToPurge) return;
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

  const deletedDate = (trip: Trip): string =>
    formatDate(trip.deletedAt || trip.updatedAt || "") || "recently";

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
      {/* Top Controls Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-card border border-border/70 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              {eyebrow ?? (isAgency ? "Agency Trip Library" : "Trip Library")}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {trips.length} {isAgency ? "Agency" : "Total"} Trips
            </Badge>
          </div>
          <h2 className="text-2xl font-black text-foreground">
            {heading ?? (isAgency ? "Agency trips" : "My Adventures")}
          </h2>
        </div>

        <Button
          type="button"
          variant="hero"
          onClick={onNewPlan}
          className="rounded-2xl h-11 px-5 text-xs font-bold gap-2 shadow-sm self-start md:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>{planLabel}</span>
        </Button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by destination or title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-11 rounded-2xl bg-card border-border/70 text-xs shadow-2xs"
          />
        </div>

        {/* View Switcher & Status Pills */}
        <div className="flex items-center gap-2 justify-between sm:justify-end overflow-x-auto pb-1 scrollbar-none">
          {isAgency && onAssigneeChange && assigneeOptions ? (
            <Select value={assigneeValue || "all"} onValueChange={onAssigneeChange}>
              <SelectTrigger className="h-8 w-[150px] rounded-xl text-xs">
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

          {isAgency && onArchivedChange ? (
            <div className="inline-flex p-1 bg-muted/60 rounded-2xl border border-border/60">
              {(["active", "archived"] as const).map((view) => (
                <Button
                  key={view}
                  type="button"
                  size="sm"
                  variant={showingArchived === (view === "archived") ? "hero" : "ghost"}
                  onClick={() => onArchivedChange(view)}
                  className="rounded-xl text-xs font-bold h-8 px-3 capitalize"
                >
                  {view}
                </Button>
              ))}
            </div>
          ) : null}

          <div className="inline-flex p-1 bg-muted/60 rounded-2xl border border-border/60">
            {["all", "planned", "ongoing", "completed", "draft"].map((status) => (
              <Button
                key={status}
                type="button"
                size="sm"
                variant={statusFilter === status ? "hero" : "ghost"}
                onClick={() => setStatusFilter(status)}
                className="rounded-xl text-xs font-bold h-8 px-3 capitalize"
              >
                {status}
              </Button>
            ))}
          </div>

          <div className="inline-flex p-1 bg-muted/60 rounded-2xl border border-border/60">
            <Button
              type="button"
              size="icon"
              variant={viewMode === "grid" ? "default" : "ghost"}
              onClick={() => setViewMode("grid")}
              className="h-8 w-8 rounded-xl"
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={viewMode === "list" ? "default" : "ghost"}
              onClick={() => setViewMode("list")}
              className="h-8 w-8 rounded-xl"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Trips Content */}
      {ownedTrips.length === 0 && sharedTrips.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-card/60 backdrop-blur-sm border border-dashed border-border/80 space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-inner">
            <Compass className="w-8 h-8 animate-pulse" />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h3 className="text-lg font-bold text-foreground">
              {showingArchived
                ? "No archived trips"
                : search ||
                  statusFilter !== "all" ||
                  (assigneeValue && assigneeValue !== "all")
                ? "No matching trips found"
                : emptyTitle ??
                  (isAgency ? "No agency trips yet" : "No saved trips yet")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {showingArchived
                ? "Archive a trip from the active list to keep the library tidy; pinned exports and client links keep working."
                : search ||
                  statusFilter !== "all" ||
                  (assigneeValue && assigneeValue !== "all")
                ? "Try adjusting your search keywords or filters."
                : deletedTrips.length > 0
                ? "Restore a trip from Recently deleted below, or start a new plan."
                : emptyBody ??
                  (isAgency
                    ? "Plan a client trip with AI, then refine it with your team and invite the client from the People tab."
                    : "Plan your first trip and it will show up here.")}
            </p>
          </div>
          <Button
            type="button"
            variant="hero"
            onClick={onNewPlan}
            className="rounded-2xl px-5 text-xs font-bold gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{isAgency ? planLabel : "Create Itinerary"}</span>
          </Button>
        </div>
      ) : viewMode === "grid" ? (
        /* GRID VIEW */
        <div className="space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ownedTrips.map((trip) => {
            const title =
              trip.title || trip.tripDetails?.trip_title || "Custom Trip";
            const cover = getTripCover(title);
            const statusKey =
              (trip.status as keyof typeof STATUS_CONFIG) || "planned";
            const statusInfo = STATUS_CONFIG[statusKey] || STATUS_CONFIG.planned;
            const days = trip.tripDetails?.duration_days || 5;
            const budget = trip.tripDetails?.budget_per_person || 15000;
            const isActing = actionLoadingId === trip._id;

            return (
              <Card
                key={trip._id}
                onClick={() => onSelectTrip(trip)}
                className="group rounded-3xl border border-border/70 hover:border-primary/50 bg-card overflow-hidden shadow-card hover:shadow-hover transition-all duration-300 cursor-pointer flex flex-col justify-between"
              >
                <div>
                  {/* Card Thumbnail */}
                  <div className="relative h-44 w-full overflow-hidden">
                    <img
                      src={cover}
                      alt={title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                    {/* Status Badge */}
                    <div className="absolute top-3 left-3">
                      <Badge
                        className={cn(
                          "backdrop-blur-md px-2.5 py-1 text-[11px] font-bold gap-1 shadow-sm",
                          statusInfo.badgeClass
                        )}
                      >
                        {statusInfo.icon}
                        <span>{statusInfo.label}</span>
                      </Badge>
                    </div>

                    {/* Days Count Overlay */}
                    <div className="absolute bottom-3 left-3 text-white text-xs font-bold flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-primary" />
                      <span>{days} Days</span>
                      <span>•</span>
                      <span className="text-white/80">
                        ₹{budget.toLocaleString("en-IN")}/person
                      </span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <CardContent className="p-5 space-y-3">
                    <h3 className="font-extrabold text-base text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                      {title}
                    </h3>
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/60">
                      <span>Created {formatDate(trip.createdAt)}</span>
                      {isAgency ? (
                        <span
                          className="max-w-[45%] truncate font-semibold text-foreground"
                          title={`Assigned to ${assigneeName(trip.assignedTo)}`}
                        >
                          {assigneeName(trip.assignedTo)}
                        </span>
                      ) : (
                        <span className="font-semibold text-foreground">
                          {trip.tripDetails?.group_type || "Traveler"}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </div>

                {/* Card Actions Footer */}
                <div className="px-5 pb-5 pt-0 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1 rounded-xl text-xs font-bold gap-1.5 h-9"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTrip(trip);
                    }}
                  >
                    <span>View Itinerary</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>

                  {!showingArchived && (!canDuplicateTrip || canDuplicateTrip(trip)) && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title="Duplicate as draft"
                      disabled={isActing}
                      onClick={(e) => handleDuplicate(e, trip._id)}
                      className="h-9 w-9 text-muted-foreground hover:text-primary rounded-xl"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  )}

                  {!showingArchived && (!canDeleteTrip || canDeleteTrip(trip)) && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title="Delete trip"
                      disabled={isActing}
                      onClick={(e) => {
                        e.stopPropagation();
                        setTripToDelete(trip);
                      }}
                      className="h-9 w-9 text-muted-foreground hover:text-destructive rounded-xl"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}

                  {isAgency &&
                    !showingArchived &&
                    onArchiveTrip &&
                    (!canArchiveTrip || canArchiveTrip(trip)) && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Archive trip"
                        disabled={isActing}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleArchive(trip);
                        }}
                        className="h-9 w-9 text-muted-foreground hover:text-amber-600 rounded-xl"
                      >
                        <Archive className="w-4 h-4" />
                      </Button>
                    )}

                  {isAgency &&
                    showingArchived &&
                    onUnarchiveTrip &&
                    (!canArchiveTrip || canArchiveTrip(trip)) && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Restore to the active list"
                        disabled={isActing}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleUnarchive(trip);
                        }}
                        className="h-9 w-9 text-muted-foreground hover:text-emerald-600 rounded-xl"
                      >
                        <ArchiveRestore className="w-4 h-4" />
                      </Button>
                    )}
                </div>
              </Card>
            );
          })}
        </div>
        </div>
      ) : (
        /* LIST VIEW */
        <div className="space-y-3">
          {ownedTrips.map((trip) => {
            const title =
              trip.title || trip.tripDetails?.trip_title || "Custom Trip";
            const cover = getTripCover(title);
            const statusKey =
              (trip.status as keyof typeof STATUS_CONFIG) || "planned";
            const statusInfo = STATUS_CONFIG[statusKey] || STATUS_CONFIG.planned;
            const days = trip.tripDetails?.duration_days || 5;
            const budget = trip.tripDetails?.budget_per_person || 15000;
            const isActing = actionLoadingId === trip._id;

            return (
              <div
                key={trip._id}
                onClick={() => onSelectTrip(trip)}
                className="p-4 rounded-3xl bg-card border border-border/70 hover:border-primary/50 shadow-xs hover:shadow-card transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer group"
              >
                <div className="flex items-center gap-4">
                  <img
                    src={cover}
                    alt={title}
                    className="w-16 h-16 rounded-2xl object-cover shrink-0 shadow-xs"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={cn(
                          "px-2 py-0.5 text-[10px] font-bold gap-1",
                          statusInfo.badgeClass
                        )}
                      >
                        {statusInfo.icon}
                        <span>{statusInfo.label}</span>
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(trip.createdAt)}
                      </span>
                    </div>
                    <h4 className="font-extrabold text-sm sm:text-base text-foreground group-hover:text-primary transition-colors line-clamp-1">
                      {title}
                    </h4>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{days} Days</span>
                      <span>•</span>
                      <span>₹{budget.toLocaleString("en-IN")}/person</span>
                      <span>•</span>
                      <span>{trip.tripDetails?.group_type || "Couple"}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl text-xs font-bold h-9 px-3 gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTrip(trip);
                    }}
                  >
                    <span>Open</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                  {!showingArchived && (!canDuplicateTrip || canDuplicateTrip(trip)) && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title="Duplicate as draft"
                      disabled={isActing}
                      onClick={(e) => handleDuplicate(e, trip._id)}
                      className="h-9 w-9 text-muted-foreground hover:text-primary rounded-xl"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  )}
                  {!showingArchived && (!canDeleteTrip || canDeleteTrip(trip)) && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title="Delete trip"
                      disabled={isActing}
                      onClick={(e) => {
                        e.stopPropagation();
                        setTripToDelete(trip);
                      }}
                      className="h-9 w-9 text-muted-foreground hover:text-destructive rounded-xl"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                  {isAgency &&
                    !showingArchived &&
                    onArchiveTrip &&
                    (!canArchiveTrip || canArchiveTrip(trip)) && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Archive trip"
                        disabled={isActing}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleArchive(trip);
                        }}
                        className="h-9 w-9 text-muted-foreground hover:text-amber-600 rounded-xl"
                      >
                        <Archive className="w-4 h-4" />
                      </Button>
                    )}
                  {isAgency &&
                    showingArchived &&
                    onUnarchiveTrip &&
                    (!canArchiveTrip || canArchiveTrip(trip)) && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Restore to the active list"
                        disabled={isActing}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleUnarchive(trip);
                        }}
                        className="h-9 w-9 text-muted-foreground hover:text-emerald-600 rounded-xl"
                      >
                        <ArchiveRestore className="w-4 h-4" />
                      </Button>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* "Shared with me" (Milestone 6 §3.8): trips owned by someone else.
          Deletion is never offered — only the owner can delete on the server. */}
      {sharedTrips.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 pt-2">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-wide text-foreground">
              Shared with me
            </h3>
            <Badge variant="outline" className="text-[10px]">
              {sharedTrips.length}
            </Badge>
          </div>
          {sharedTrips.map((trip) => {
            const title =
              trip.title || trip.tripDetails?.trip_title || "Shared trip";
            const cover = getTripCover(title);
            const days = trip.tripDetails?.duration_days || 5;
            const budget = trip.tripDetails?.budget_per_person || 15000;
            const isActing = actionLoadingId === trip._id;
            const roleStyle =
              trip.role === "editor"
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-800"
                : trip.role === "commenter"
                ? "bg-sky-500/10 text-sky-600 border-sky-200 dark:border-sky-800"
                : "bg-muted text-muted-foreground border-border";

            return (
              <div
                key={trip._id}
                onClick={() => onSelectTrip(trip)}
                className="p-4 rounded-3xl bg-card border border-border/70 hover:border-primary/50 shadow-xs hover:shadow-card transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer group"
              >
                <div className="flex items-center gap-4">
                  <img
                    src={cover}
                    alt={title}
                    className="w-16 h-16 rounded-2xl object-cover shrink-0 shadow-xs"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={cn(
                          "px-2 py-0.5 text-[10px] font-bold capitalize",
                          roleStyle
                        )}
                      >
                        {trip.role}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(trip.createdAt)}
                      </span>
                    </div>
                    <h4 className="font-extrabold text-sm sm:text-base text-foreground group-hover:text-primary transition-colors line-clamp-1">
                      {title}
                    </h4>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{days} Days</span>
                      <span>•</span>
                      <span>₹{budget.toLocaleString("en-IN")}/person</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl text-xs font-bold h-9 px-3 gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTrip(trip);
                    }}
                  >
                    <span>Open</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                  {(!canDuplicateTrip || canDuplicateTrip(trip)) && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title="Duplicate this trip into your own library"
                      disabled={isActing}
                      onClick={(e) => handleDuplicate(e, trip._id)}
                      className="h-9 w-9 text-muted-foreground hover:text-primary rounded-xl"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* M7.7: Recently deleted. Only current owners ever receive these rows;
          members without the owner role have no restore action. */}
      {deletedTrips.length > 0 && (
        <div className="space-y-3 pt-3">
          <button
            type="button"
            onClick={() => setShowDeleted((open) => !open)}
            className="flex w-full items-center gap-2 rounded-2xl border border-border/70 bg-card px-4 py-3 text-left transition-colors hover:border-primary/40"
            aria-expanded={showDeleted}
          >
            <Archive className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold tracking-wide text-foreground">
              Recently deleted
            </span>
            <Badge variant="outline" className="text-[10px]">
              {deletedTrips.length}
            </Badge>
            <span className="ml-auto text-muted-foreground">
              {showDeleted ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          </button>

          {showDeleted && (
            <>
              <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
                {deletedHelpText ??
                  "Only owners see this list. Restoring brings back the itinerary and chat; old share links and invites stay revoked."}
              </p>
              <div className="space-y-2">
                {deletedTrips.map((trip) => {
                  const title =
                    trip.title || trip.tripDetails?.trip_title || "Deleted trip";
                  const cover = getTripCover(title);
                  const days = trip.tripDetails?.duration_days || 5;
                  const isActing = actionLoadingId === trip._id;
                  return (
                    <div
                      key={trip._id}
                      className="flex flex-col gap-3 rounded-3xl border border-border/70 bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <img
                          src={cover}
                          alt={title}
                          className="h-12 w-12 shrink-0 rounded-xl object-cover opacity-70"
                        />
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-extrabold text-foreground">
                            {title}
                          </h4>
                          <p className="text-[11px] text-muted-foreground">
                            Deleted {deletedDate(trip)} · {days} days
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isActing}
                          onClick={() => handleRestore(trip)}
                          className="h-9 rounded-xl px-3 text-xs font-bold gap-1.5"
                        >
                          {isActing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5" />
                          )}
                          Restore
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          title="Delete forever"
                          disabled={isActing}
                          onClick={() => setTripToPurge(trip)}
                          className="h-9 w-9 rounded-xl text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog
        open={!!tripToDelete}
        onOpenChange={(open) => {
          if (!open) setTripToDelete(null);
        }}
      >
        <AlertDialogContent className="rounded-3xl max-w-md w-[92vw] sm:w-full p-5 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">
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
        <AlertDialogContent className="rounded-3xl max-w-md w-[92vw] sm:w-full p-5 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">
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
