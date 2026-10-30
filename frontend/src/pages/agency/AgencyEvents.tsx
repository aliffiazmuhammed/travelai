import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarRange,
  CalendarX,
  Check,
  EyeOff,
  ImagePlus,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  Undo2,
  Users,
  X,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAgency } from '@/context/AgencyContext';
import { useAgencyAssetUrl } from '@/hooks/useAgencyAssetUrl';
import { agencyRoleBadgeClass, agencyRoleLabel, formatAgencyDate } from '@/lib/agency';
import { EVENT_KIND_LABELS } from '@/lib/events';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';
import type {
  AgencyAsset,
  AgencyEvent,
  AgencyEventInput,
  AgencyEventInterest,
  AgencyEventInterestStatus,
  AgencyEventKind,
} from '@/types';
import { toast } from 'sonner';

/**
 * M10 E2 — the agency event library and interest roster.
 *
 * An event is a dated, capped gathering with its own public page, not a trip
 * snapshot. Planners draft and edit; admins publish, close and delete because
 * each of those changes what travellers see. Closing is not unpublishing: the
 * page stays readable for whoever already holds a spot, so edits are refused
 * until the team reopens it.
 */

const EVENT_KINDS = Object.keys(EVENT_KIND_LABELS) as AgencyEventKind[];
const HIGHLIGHTS_MAX = 6;
const LIST_ITEM_MAX = 80;
const COVER_MAX_BYTES = 2 * 1024 * 1024;
const COVER_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const CAPACITY_MAX = 500;
const PRICE_MAX = 10_000_000;

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

type EventForm = {
  title: string;
  summary: string;
  kind: AgencyEventKind;
  destination: string;
  venue: string;
  startDate: string;
  endDate: string;
  capacity: string;
  price: string;
  highlights: string[];
};

const emptyForm: EventForm = {
  title: '',
  summary: '',
  kind: 'camp',
  destination: '',
  venue: '',
  startDate: '',
  endDate: '',
  capacity: '',
  price: '',
  highlights: [],
};

function formFromEvent(event: AgencyEvent): EventForm {
  return {
    title: event.title,
    summary: event.summary,
    kind: event.kind,
    destination: event.destination,
    venue: event.venue,
    startDate: event.startDate,
    endDate: event.endDate,
    capacity: event.capacity === null ? '' : String(event.capacity),
    price: event.pricePerPerson === null ? '' : String(event.pricePerPerson),
    highlights: [...event.highlights],
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Upcoming soonest-first, then everything already over. The library answers
 * "what's next", so a finished gathering belongs at the bottom rather than at
 * the top, where a descending date sort used to leave it.
 */
function sortEvents(rows: AgencyEvent[]): AgencyEvent[] {
  const today = todayIso();
  const hasFinished = (row: AgencyEvent) => Boolean(row.endDate) && row.endDate < today;
  return [...rows].sort((a, b) => {
    const aFinished = hasFinished(a);
    const bFinished = hasFinished(b);
    if (aFinished !== bFinished) return aFinished ? 1 : -1;
    if (a.startDate === b.startDate) return a.id.localeCompare(b.id);
    // Inside the finished group the most recent leads; upcoming ascends.
    return aFinished
      ? b.startDate.localeCompare(a.startDate)
      : a.startDate.localeCompare(b.startDate);
  });
}

const ROSTER_STATUS_RANK: Record<AgencyEventInterestStatus, number> = {
  pending: 0,
  confirmed: 1,
  declined: 2,
};

/**
 * The roster reads as a queue: whoever still needs a decision leads, then the
 * confirmed, then the declined. This mirrors the server's sort so a reload does
 * not reshuffle the list under the reader.
 */
function sortRoster(rows: AgencyEventInterest[]): AgencyEventInterest[] {
  return [...rows].sort((a, b) => {
    const rank = ROSTER_STATUS_RANK[a.status] - ROSTER_STATUS_RANK[b.status];
    if (rank !== 0) return rank;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * Why this event cannot go live right now, in the order the server enforces.
 * `null` means the row is publishable, so the Publish control only carries a
 * title and an extended description when it has a reason to give (QA-12).
 */
function publishBlocker(event: AgencyEvent): string | null {
  if (event.hidden) {
    return 'This event is under review. Contact support before publishing it again.';
  }
  if (event.closedAt) return 'Reopen this event before publishing it again.';
  if (event.endDate && event.endDate < todayIso()) {
    return 'This event has already finished. Move its dates forward before publishing it.';
  }
  if (!event.readiness.ready) return event.readiness.missing.join(' ');
  return null;
}

function statusOf(event: AgencyEvent): { label: string; className: string } {
  if (event.hidden) {
    return {
      label: 'Under review',
      className:
        'bg-rose-100 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300',
    };
  }
  // Draft before closed: unpublishing a closed event leaves `closedAt` on the
  // row, and once its page is gone it reads as a draft (reopen or publish from
  // there), not as something travellers can still see.
  if (event.state === 'draft') {
    return {
      label: 'Draft',
      className:
        'bg-slate-100 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300',
    };
  }
  if (event.closedAt) {
    return {
      label: 'Closed',
      className:
        'bg-slate-200 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300',
    };
  }
  if (event.endDate && event.endDate < todayIso()) {
    return {
      label: 'Finished',
      className:
        'bg-sky-100 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/60 dark:text-sky-300',
    };
  }
  return { label: 'Live', className: 'bg-teal-600 text-white hover:bg-teal-600' };
}

function capacityLine(event: AgencyEvent): string {
  const confirmed = event.interests.confirmed;
  if (event.capacity === null) return `${confirmed} confirmed · no cap`;
  const left = Math.max(0, event.capacity - confirmed);
  return `${confirmed} confirmed · ${left} of ${event.capacity} spots left`;
}

function priceLine(event: AgencyEvent): string {
  if (event.pricePerPerson === null) return 'Price on request';
  return `₹${event.pricePerPerson.toLocaleString('en-IN')} per person`;
}

/** Uploaded covers live behind the agency guard, so they load as blobs. */
const EventCover: React.FC<{ url: string | null; className?: string }> = ({
  url,
  className,
}) => {
  const resolved = useAgencyAssetUrl(url);
  if (!resolved) {
    return (
      <span
        className={cn(
          'grid shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300',
          className
        )}
      >
        <CalendarRange className="h-5 w-5" />
      </span>
    );
  }
  return (
    <img
      src={resolved}
      alt=""
      className={cn('shrink-0 rounded-xl object-cover', className)}
    />
  );
};

const HighlightEditor: React.FC<{
  values: string[];
  onChange: (values: string[]) => void;
}> = ({ values, onChange }) => {
  const [text, setText] = useState('');

  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) return;

    let next = values;
    for (const part of parts) {
      if (part.length > LIST_ITEM_MAX) {
        toast.error(`Keep each highlight under ${LIST_ITEM_MAX} characters.`);
        continue;
      }
      if (next.some((entry) => entry.toLowerCase() === part.toLowerCase())) {
        continue;
      }
      if (next.length >= HIGHLIGHTS_MAX) {
        toast.error(`Add at most ${HIGHLIGHTS_MAX} highlights.`);
        break;
      }
      next = [...next, part];
    }
    if (next !== values) onChange(next);
    setText('');
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="event-highlights">What makes it special</Label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-950">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {value}
            <button
              type="button"
              onClick={() => onChange(values.filter((entry) => entry !== value))}
              className="rounded-full p-0.5 text-slate-400 transition-colors hover:text-destructive"
              aria-label={`Remove ${value}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id="event-highlights"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add(event.currentTarget.value);
            } else if (
              event.key === 'Backspace' &&
              !event.currentTarget.value &&
              values.length > 0
            ) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={(event) => {
            if (event.target.value.trim()) add(event.target.value);
          }}
          maxLength={LIST_ITEM_MAX}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-slate-400"
          placeholder={values.length ? 'Add another' : 'Sunrise boat ride'}
        />
      </div>
      <p className="text-[11px] text-slate-500">
        Up to {HIGHLIGHTS_MAX}. Enter or a comma adds a line.
      </p>
    </div>
  );
};

const ROSTER_FILTERS: Array<{ value: 'all' | AgencyEventInterestStatus; label: string }> = [
  { value: 'all', label: 'Everyone' },
  { value: 'pending', label: 'Waiting' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'declined', label: 'Declined' },
];

const AgencyEvents: React.FC = () => {
  const { activeAgency, activeAgencyId, canManage, refreshEventBadge } = useAgency();
  const role = activeAgency?.role;
  const canPlan = canManage || role === 'planner';

  const [events, setEvents] = useState<AgencyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AgencyEvent | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<{ id: string; action: string } | null>(null);
  const listRequestRef = useRef(0);

  // `undefined` means "leave the saved cover alone"; null removes it.
  const [coverChoice, setCoverChoice] = useState<string | null | undefined>(
    undefined
  );
  const [uploadedCover, setUploadedCover] = useState<AgencyAsset | null>(null);
  // `EventCover` resolves a stored asset path into a blob itself, so hand it the
  // raw URL — resolving here too would leave it a `blob:` it cannot re-resolve.
  const coverUrl =
    coverChoice === undefined
      ? editing?.coverUrl ?? null
      : coverChoice === null
        ? null
        : uploadedCover?.url ?? null;

  const [rosterEvent, setRosterEvent] = useState<AgencyEvent | null>(null);
  const [roster, setRoster] = useState<AgencyEventInterest[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterFilter, setRosterFilter] = useState<'all' | AgencyEventInterestStatus>(
    'all'
  );
  const [rosterBusyId, setRosterBusyId] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    if (!activeAgencyId) return;
    const requestId = ++listRequestRef.current;
    try {
      setLoading(true);
      const result = await api.listAgencyEvents(activeAgencyId);
      if (requestId === listRequestRef.current) {
        setEvents(sortEvents(result.events || []));
      }
    } catch (err) {
      if (requestId === listRequestRef.current) {
        toast.error(errorMessage(err, 'Could not load your events.'));
      }
    } finally {
      if (requestId === listRequestRef.current) setLoading(false);
    }
  }, [activeAgencyId]);

  useEffect(() => {
    setEvents([]);
    if (!activeAgencyId) {
      setLoading(false);
      return;
    }
    void loadEvents();
  }, [activeAgencyId, loadEvents]);

  const replaceEvent = (next: AgencyEvent) => {
    setEvents((prev) => sortEvents(prev.map((row) => (row.id === next.id ? next : row))));
    setRosterEvent((prev) => (prev && prev.id === next.id ? next : prev));
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setCoverChoice(undefined);
    setUploadedCover(null);
    setDialogOpen(true);
  };

  const openEdit = (event: AgencyEvent) => {
    setEditing(event);
    setForm(formFromEvent(event));
    setCoverChoice(undefined);
    setUploadedCover(null);
    setDialogOpen(true);
  };

  const update = (patch: Partial<EventForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const dateOrderInvalid =
    Boolean(form.startDate) && Boolean(form.endDate) && form.endDate < form.startDate;
  const canSave =
    !saving &&
    form.title.trim().length >= 2 &&
    Boolean(form.startDate) &&
    Boolean(form.endDate) &&
    !dateOrderInvalid;

  const handleCoverFile = async (file: File | undefined) => {
    if (!file || !activeAgencyId || saving) return;
    if (!COVER_MIME_TYPES.includes(file.type)) {
      toast.error('Choose a JPEG, PNG or WebP image.');
      return;
    }
    if (file.size > COVER_MAX_BYTES) {
      toast.error('Cover images must be smaller than 2 MB.');
      return;
    }
    setSaving(true);
    try {
      const result = await api.uploadAgencyAsset(activeAgencyId, file, {
        kind: 'image',
      });
      setUploadedCover(result.asset);
      setCoverChoice(result.asset._id);
      toast.success('Cover uploaded. Save to put it on the event.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not upload that image.'));
    } finally {
      setSaving(false);
    }
  };

  const saveEvent = async () => {
    if (!activeAgencyId || !canSave) return;
    if (form.title.trim().length < 2) {
      toast.error('Give the event a title first.');
      return;
    }
    if (!form.startDate || !form.endDate) {
      toast.error('Add the start and end dates.');
      return;
    }
    if (form.endDate < form.startDate) {
      toast.error("The end date can't come before the start date.");
      return;
    }

    const capacity = form.capacity.trim() === '' ? null : Number(form.capacity);
    if (
      capacity !== null &&
      (!Number.isInteger(capacity) || capacity < 1 || capacity > CAPACITY_MAX)
    ) {
      toast.error(`Capacity must be a whole number between 1 and ${CAPACITY_MAX}.`);
      return;
    }
    if (editing && capacity !== null) {
      const live = events.find((row) => row.id === editing.id) ?? editing;
      const confirmed = live.interests.confirmed;
      if (confirmed > capacity) {
        toast.error(
          `You already have ${confirmed} confirmed ${
            confirmed === 1 ? 'traveller' : 'travellers'
          }. Keep the capacity at ${confirmed} or more, or release a spot first.`
        );
        return;
      }
    }
    const price = form.price.trim() === '' ? null : Number(form.price);
    if (
      price !== null &&
      (!Number.isInteger(price) || price < 0 || price > PRICE_MAX)
    ) {
      toast.error('Enter a per-person price in whole rupees, or leave it blank.');
      return;
    }

    const payload: AgencyEventInput = {
      title: form.title.trim(),
      summary: form.summary.trim(),
      kind: form.kind,
      destination: form.destination.trim(),
      venue: form.venue.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      capacity,
      pricePerPerson: price,
      highlights: form.highlights,
    };
    if (coverChoice !== undefined) payload.coverAssetId = coverChoice;

    setSaving(true);
    try {
      if (editing) {
        const result = await api.updateAgencyEvent(
          activeAgencyId,
          editing.id,
          payload
        );
        replaceEvent(result.event);
        toast.success('Event updated.');
      } else {
        const result = await api.createAgencyEvent(activeAgencyId, payload);
        setEvents((prev) => sortEvents([...prev, result.event]));
        toast.success('Draft saved. Publish it when the details are ready.');
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
      setCoverChoice(undefined);
      setUploadedCover(null);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save this event.'));
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (
    event: AgencyEvent,
    action: 'publish' | 'unpublish' | 'close' | 'reopen',
    success: string
  ) => {
    if (!activeAgencyId) return;
    setBusy({ id: event.id, action });
    try {
      const call = {
        publish: () => api.publishAgencyEvent(activeAgencyId, event.id),
        unpublish: () => api.unpublishAgencyEvent(activeAgencyId, event.id),
        close: () => api.closeAgencyEvent(activeAgencyId, event.id),
        reopen: () => api.reopenAgencyEvent(activeAgencyId, event.id),
      }[action];
      const result = await call();
      replaceEvent(result.event);
      toast.success(success);
    } catch (err) {
      toast.error(errorMessage(err, 'That did not go through. Try again.'));
    } finally {
      setBusy(null);
    }
  };

  const deleteEvent = async (event: AgencyEvent) => {
    if (!activeAgencyId) return;
    setBusy({ id: event.id, action: 'delete' });
    try {
      const result = await api.deleteAgencyEvent(activeAgencyId, event.id);
      setEvents((prev) => prev.filter((row) => row.id !== event.id));
      toast.success(result.message || 'Event deleted.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete this event.'));
    } finally {
      setBusy(null);
    }
  };

  const openRoster = async (event: AgencyEvent) => {
    if (!activeAgencyId) return;
    setRosterEvent(event);
    setRoster([]);
    setRosterFilter('all');
    setRosterLoading(true);
    try {
      const result = await api.listAgencyEventInterests(activeAgencyId, event.id);
      setRoster(sortRoster(result.interests || []));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load this roster.'));
    } finally {
      setRosterLoading(false);
    }
  };

  const rosterCounts = useMemo(
    () => ({
      pending: roster.filter((entry) => entry.status === 'pending').length,
      confirmed: roster.filter((entry) => entry.status === 'confirmed').length,
      declined: roster.filter((entry) => entry.status === 'declined').length,
    }),
    [roster]
  );

  const filteredRoster = useMemo(
    () =>
      rosterFilter === 'all'
        ? roster
        : roster.filter((entry) => entry.status === rosterFilter),
    [roster, rosterFilter]
  );

  const canConfirmMore =
    rosterEvent?.capacity === null ||
    rosterEvent?.capacity === undefined ||
    rosterCounts.confirmed < rosterEvent.capacity;

  const decideInterest = async (
    interest: AgencyEventInterest,
    status: 'confirmed' | 'declined'
  ) => {
    if (!activeAgencyId || !rosterEvent) return;
    setRosterBusyId(interest.id);
    try {
      const result = await api.decideAgencyEventInterest(
        activeAgencyId,
        rosterEvent.id,
        interest.id,
        status
      );
      setRoster((prev) =>
        sortRoster(prev.map((row) => (row.id === interest.id ? result.interest : row)))
      );
      if (interest.status !== status) {
        setEvents((prev) =>
          prev.map((event) => {
            if (event.id !== rosterEvent.id) return event;
            return {
              ...event,
              interests: {
                ...event.interests,
                [interest.status]: Math.max(
                  0,
                  event.interests[interest.status] - 1
                ),
                [status]: event.interests[status] + 1,
              },
            };
          })
        );
      }
      toast.success(
        status === 'confirmed'
          ? `${interest.name} is confirmed.`
          : `${interest.name}'s spot is released.`
      );
      // One row decided is one row off the queue: recompute rather than guess,
      // so the nav chip matches what the next reader will see.
      void refreshEventBadge().catch(() => {
        /* badge only */
      });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update this person.'));
    } finally {
      setRosterBusyId(null);
    }
  };

  if (!activeAgencyId) {
    return (
      <Card className="rounded-3xl border-border/70">
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          Create or join an agency to host events.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
            <Badge
              variant="outline"
              className={cn('text-[10px]', agencyRoleBadgeClass(role || 'viewer'))}
            >
              {agencyRoleLabel(role || 'viewer')}
            </Badge>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Camps, group trips and retreats on a real date. Publish one and
            travellers can raise their hand from its page; the roster here is
            where you confirm who is coming.
          </p>
        </div>
        {canPlan ? (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New event
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading events...
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-14 text-center dark:border-slate-800">
              <CalendarRange className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700" />
              <h3 className="mt-3 text-sm font-semibold">No events yet</h3>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                Give a gathering a date, a place and a headcount. You can save it
                as a draft and publish when the details settle.
              </p>
              {canPlan ? (
                <Button className="mt-4" size="sm" onClick={openCreate}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Create your first event
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => {
                const status = statusOf(event);
                const totalInterests =
                  event.interests.pending +
                  event.interests.confirmed +
                  event.interests.declined;
                const actionBusy = busy?.id === event.id ? busy.action : null;
                const blocker = publishBlocker(event);
                return (
                  <div
                    key={event.id}
                    className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
                  >
                    <div className="flex flex-wrap items-start gap-4">
                      <EventCover
                        url={event.coverUrl}
                        className="h-20 w-28 sm:h-24 sm:w-36"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold">
                            {event.title || 'Untitled event'}
                          </h3>
                          <Badge className={cn('text-[10px]', status.className)}>
                            {status.label}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {EVENT_KIND_LABELS[event.kind]}
                          </Badge>
                          {event.interests.pending > 0 ? (
                            <Badge
                              variant="outline"
                              className="border-teal-300 text-[10px] text-teal-700 dark:border-teal-700 dark:text-teal-300"
                            >
                              {event.interests.pending} waiting
                            </Badge>
                          ) : null}
                          {actionBusy ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Working...
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                          {event.dateLabel || 'Dates to be set'}
                          {event.destination ? (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="ml-2 h-3 w-3" />
                              {event.destination}
                              {event.venue ? ` · ${event.venue}` : ''}
                            </span>
                          ) : null}
                        </p>

                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {priceLine(event)} · {capacityLine(event)}
                          {event.interests.declined > 0
                            ? ` · ${event.interests.declined} declined`
                            : ''}
                        </p>

                        {event.hidden ? (
                          <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                            Under review{event.hiddenReason ? `: ${event.hiddenReason}` : ''}.
                            Contact support before publishing it again.
                          </p>
                        ) : event.state === 'draft' && !event.readiness.ready ? (
                          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                            Before publishing: {event.readiness.missing.join(' ')}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-1">
                        {event.state !== 'draft' || totalInterests > 0 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void openRoster(event)}
                            aria-label={`Roster for ${event.title || 'event'}${
                              totalInterests > 0
                                ? `, ${totalInterests} ${
                                    totalInterests === 1 ? 'person' : 'people'
                                  } on the list`
                                : ''
                            }`}
                          >
                            <Users className="mr-1.5 h-3.5 w-3.5" />
                            Roster
                            {totalInterests > 0 ? (
                              <span
                                className="ml-1 text-xs text-slate-500"
                                title={`${totalInterests} ${
                                  totalInterests === 1 ? 'person' : 'people'
                                } on this roster`}
                              >
                                {totalInterests}
                              </span>
                            ) : null}
                          </Button>
                        ) : null}

                        {canPlan && !event.closedAt ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(event)}
                            disabled={Boolean(actionBusy)}
                            aria-label={`Edit ${event.title || 'event'}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}

                        {canManage ? (
                          event.state === 'published' ? (
                            // Closing and unpublishing are separate ideas: a
                            // closed page can come down without reopening it
                            // (it restores no interest), but a taken-down row
                            // waits for support.
                            event.hidden ? null : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  void runAction(
                                    event,
                                    'unpublish',
                                    'Event hidden from your public profile.'
                                  )
                                }
                                disabled={Boolean(actionBusy)}
                              >
                                <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                                Unpublish
                              </Button>
                            )
                          ) : (
                            <>
                              <Button
                                size="sm"
                                onClick={() =>
                                  void runAction(
                                    event,
                                    'publish',
                                    'Event is live. Travellers can raise their hand.'
                                  )
                                }
                                disabled={Boolean(actionBusy) || Boolean(blocker)}
                                title={blocker ?? undefined}
                                aria-describedby={
                                  blocker ? `publish-blocked-${event.id}` : undefined
                                }
                              >
                                <Send className="mr-1.5 h-3.5 w-3.5" />
                                Publish
                              </Button>
                              {blocker ? (
                                <span
                                  id={`publish-blocked-${event.id}`}
                                  className="sr-only"
                                >
                                  Publishing is on hold: {blocker}
                                </span>
                              ) : null}
                            </>
                          )
                        ) : null}

                        {canManage && event.closedAt && !event.hidden ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void runAction(
                                event,
                                'reopen',
                                'Reopened. The same page takes interest again.'
                              )
                            }
                            disabled={Boolean(actionBusy)}
                          >
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            Reopen
                          </Button>
                        ) : null}

                        {canManage && !event.closedAt && !event.hidden && event.state === 'published' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void runAction(
                                event,
                                'close',
                                'Closed. The page stays up for anyone holding a spot.'
                              )
                            }
                            disabled={Boolean(actionBusy)}
                          >
                            <CalendarX className="mr-1.5 h-3.5 w-3.5" />
                            Close
                          </Button>
                        ) : null}

                        {canManage &&
                        event.state === 'draft' &&
                        !event.hidden &&
                        totalInterests === 0 ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-destructive"
                                disabled={Boolean(actionBusy)}
                                aria-label={`Delete ${event.title || 'event'}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-3xl">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  The draft and its cover reference are removed.
                                  Nothing was public yet, so no traveller loses a
                                  page.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="rounded-xl text-xs font-bold">
                                  Keep it
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  className="rounded-xl bg-destructive text-xs font-bold text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => void deleteEvent(event)}
                                >
                                  Delete event
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            setUploadedCover(null);
            setCoverChoice(undefined);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit event' : 'New event'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Changes reach the public page as soon as you save. A closed event is reopened first so the page stays stable for travellers already on the list.'
                : 'Start with the essentials and save it as a draft. You can publish once the title, summary, destination and dates are in place.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="event-title">Title</Label>
              <Input
                id="event-title"
                value={form.title}
                onChange={(event) => update({ title: event.target.value })}
                placeholder="Monsoon nature camp"
                maxLength={120}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-kind">Type</Label>
              <Select
                value={form.kind}
                onValueChange={(value) => update({ kind: value as AgencyEventKind })}
              >
                <SelectTrigger id="event-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {EVENT_KIND_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-capacity">Capacity</Label>
              <Input
                id="event-capacity"
                type="number"
                min={1}
                max={CAPACITY_MAX}
                step={1}
                value={form.capacity}
                onChange={(event) => update({ capacity: event.target.value })}
                placeholder="Leave blank for no cap"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="event-summary">Card summary</Label>
              <Textarea
                id="event-summary"
                value={form.summary}
                onChange={(event) => update({ summary: event.target.value })}
                rows={2}
                placeholder="Forest walks, river dips and a night of stars, with naturalists who live nearby."
                maxLength={280}
              />
              <p className="text-[11px] text-slate-500">
                One or two lines. This is what a traveller reads on the event
                card.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-destination">Destination</Label>
              <Input
                id="event-destination"
                value={form.destination}
                onChange={(event) => update({ destination: event.target.value })}
                placeholder="Coorg"
                maxLength={80}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-venue">Venue</Label>
              <Input
                id="event-venue"
                value={form.venue}
                onChange={(event) => update({ venue: event.target.value })}
                placeholder="Kaveri riverside"
                maxLength={120}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-start">Starts</Label>
              <Input
                id="event-start"
                type="date"
                value={form.startDate}
                onChange={(event) => update({ startDate: event.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-end">Ends</Label>
              <Input
                id="event-end"
                type="date"
                value={form.endDate}
                min={form.startDate || undefined}
                onChange={(event) => update({ endDate: event.target.value })}
              />
            </div>

            {dateOrderInvalid ? (
              <p className="text-[11px] text-rose-600 sm:col-span-2 dark:text-rose-400">
                The end date can't come before the start date.
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="event-price">Per person (₹)</Label>
              <Input
                id="event-price"
                type="number"
                min={0}
                step={1}
                value={form.price}
                onChange={(event) => update({ price: event.target.value })}
                placeholder="Leave blank for price on request"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <HighlightEditor
                values={form.highlights}
                onChange={(values) => update({ highlights: values })}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="event-cover">Cover image</Label>
              <div className="flex flex-wrap items-center gap-2">
                <EventCover url={coverUrl} className="h-16 w-24" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-bold"
                  disabled={saving}
                  onClick={() => document.getElementById('event-cover-file')?.click()}
                >
                  <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                  Upload image
                </Button>
                {coverUrl || coverChoice === null ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-xl text-xs font-bold text-muted-foreground"
                    disabled={saving}
                    onClick={() => {
                      setUploadedCover(null);
                      setCoverChoice(null);
                    }}
                  >
                    <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                    Remove
                  </Button>
                ) : null}
                <input
                  id="event-cover-file"
                  type="file"
                  accept={COVER_MIME_TYPES.join(',')}
                  className="hidden"
                  onChange={(event) => {
                    void handleCoverFile(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </div>
              <p className="text-[11px] text-slate-500">
                JPEG, PNG or WebP up to 2 MB. Images come from your agency asset
                library, so you can reuse them elsewhere.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveEvent()} disabled={!canSave}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              {editing ? 'Save changes' : 'Save draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(rosterEvent)}
        onOpenChange={(open) => {
          if (!open) {
            setRosterEvent(null);
            setRoster([]);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {rosterEvent?.title || 'Event'} · roster
            </DialogTitle>
            <DialogDescription>
              {rosterEvent?.dateLabel || 'Dates to be set'}
              {rosterEvent?.capacity
                ? ` · ${rosterCounts.confirmed} of ${rosterEvent.capacity} spots confirmed`
                : ' · no cap, confirm as many as you can host'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-1.5">
            {ROSTER_FILTERS.map((filter) => {
              const count =
                filter.value === 'all' ? roster.length : rosterCounts[filter.value];
              return (
                <Button
                  key={filter.value}
                  type="button"
                  variant={rosterFilter === filter.value ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full text-xs"
                  onClick={() => setRosterFilter(filter.value)}
                >
                  {filter.label}
                  <span className="ml-1 opacity-70">{count}</span>
                </Button>
              );
            })}
          </div>

          {rosterLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading the roster...
            </div>
          ) : filteredRoster.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center dark:border-slate-800">
              <Users className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700" />
              <h3 className="mt-3 text-sm font-semibold">
                {roster.length === 0 ? 'No one on the list yet' : 'Nobody in this view'}
              </h3>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                {roster.length === 0
                  ? 'When a traveller raises their hand on the event page, they appear here with their contact details.'
                  : 'Try another filter to see the rest of the list.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {filteredRoster.map((interest) => {
                const deciding = rosterBusyId === interest.id;
                return (
                  <div key={interest.id} className="space-y-2 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{interest.name}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px]',
                          interest.status === 'confirmed'
                            ? 'border-teal-300 text-teal-700 dark:border-teal-700 dark:text-teal-300'
                            : interest.status === 'declined'
                              ? 'border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300'
                              : 'border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-300'
                        )}
                      >
                        {interest.status === 'confirmed'
                          ? 'Confirmed'
                          : interest.status === 'declined'
                            ? 'Declined'
                            : 'Waiting'}
                      </Badge>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {interest.createdAt
                          ? `Asked ${formatAgencyDate(interest.createdAt)}`
                          : ''}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                      {interest.email ? (
                        <a
                          href={`mailto:${interest.email}`}
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          <Mail className="h-3 w-3" />
                          {interest.email}
                        </a>
                      ) : null}
                      {interest.phone ? (
                        <a
                          href={`tel:${interest.phone}`}
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          <Phone className="h-3 w-3" />
                          {interest.phone}
                        </a>
                      ) : null}
                    </div>

                    {interest.note ? (
                      <p className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                        {interest.note}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant={interest.status === 'confirmed' ? 'outline' : 'default'}
                        size="sm"
                        className="h-7 rounded-lg px-2.5 text-xs"
                        disabled={
                          deciding ||
                          interest.status === 'confirmed' ||
                          !canConfirmMore
                        }
                        title={
                          interest.status !== 'confirmed' && !canConfirmMore
                            ? 'Every spot is confirmed. Decline someone or raise the capacity.'
                            : undefined
                        }
                        onClick={() => void decideInterest(interest, 'confirmed')}
                      >
                        {deciding ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="mr-1 h-3 w-3" />
                        )}
                        Confirm
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-lg px-2.5 text-xs text-muted-foreground hover:text-destructive"
                        disabled={deciding || interest.status === 'declined'}
                        onClick={() => void decideInterest(interest, 'declined')}
                      >
                        <X className="mr-1 h-3 w-3" />
                        Decline
                      </Button>
                      {interest.status !== 'pending' && interest.decidedAt ? (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          Decided {formatAgencyDate(interest.decidedAt)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRosterEvent(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AgencyEvents;
