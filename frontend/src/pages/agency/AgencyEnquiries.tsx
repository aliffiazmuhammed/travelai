import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Inbox,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCw,
  Receipt,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import ConversationThread from '@/components/directory/ConversationThread';
import { useAgency } from '@/context/AgencyContext';
import { useAgencyAuth } from '@/context/AgencyAuthContext';
import { useEnquiryLiveRefresh } from '@/hooks/useEnquiryEvents';
import {
  AGENCY_ENQUIRY_BUDGET_LABELS,
  AGENCY_ENQUIRY_STATUSES,
  AGENCY_ENQUIRY_STATUS_LABELS,
  agencyEnquiryStatusBadgeClass,
  formatAgencyDate,
} from '@/lib/agency';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';
import type {
  AgencyEnquiry,
  AgencyEnquiryStatus,
  AgencyEnquirySummaryView,
  AgencyEnquiryUpdateInput,
  AgencyMember,
} from '@/types/agency';
import { toast } from 'sonner';

/**
 * `/agency/enquiries` (Milestone 9 D5/D6).
 *
 * The lead inbox: reads are D5, the actions are D6. A member claims a lead,
 * moves it through `new → replied → quoted → won/lost`, and converts a won lead
 * into a directory client. Conversion is idempotent server-side, so double
 * clicking is safe; the quote hand-off deep-links to the package's trip with the
 * client and party size prefilled.
 *
 * The list is workspace-addressed, so the tenant comes from the agency session
 * rather than the URL. The server scopes every read and write by `agencyId`.
 */

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

type Filter = 'all' | AgencyEnquiryStatus;

const LOST_REASON_PRESETS = [
  'Budget too high',
  'Dates did not work',
  'Chose another agency',
  'No response',
];

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  ...AGENCY_ENQUIRY_STATUSES.map((status) => ({
    value: status as Filter,
    label: AGENCY_ENQUIRY_STATUS_LABELS[status],
  })),
];

function partyLabel(enquiry: AgencyEnquiry): string {
  const { adults, children } = enquiry.party;
  const parts = [`${adults} ${adults === 1 ? 'adult' : 'adults'}`];
  if (children > 0) {
    parts.push(`${children} ${children === 1 ? 'child' : 'children'}`);
  }
  return parts.join(' · ');
}

function datesLabel(enquiry: AgencyEnquiry): string {
  const { start, end, flexible } = enquiry.dates;
  if (flexible && !start) return 'Flexible dates';
  if (start && end) return `${formatAgencyDate(start)} → ${formatAgencyDate(end)}`;
  if (start) return `From ${formatAgencyDate(start)}`;
  return 'No dates given';
}

function percent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

const StatCard: React.FC<{
  label: string;
  value: string;
  hint: string;
  icon: React.ElementType;
  tone?: string;
}> = ({ label, value, hint, icon: Icon, tone }) => (
  <Card className="rounded-2xl border-border/70">
    <CardContent className="flex items-start gap-3 p-4">
      <span
        className={cn(
          'mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary',
          tone
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-xl font-semibold leading-tight">{value}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </CardContent>
  </Card>
);

const AgencyEnquiries: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeAgency, activeAgencyId, refreshEnquiryBadge } = useAgency();
  const { user } = useAgencyAuth();
  const role = activeAgency?.role;
  const canPlan = role === 'owner' || role === 'admin' || role === 'planner';
  const canAssign = role === 'owner' || role === 'admin';
  const myId = user?._id ?? null;

  const [enquiries, setEnquiries] = useState<AgencyEnquiry[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [summary, setSummary] = useState<AgencyEnquirySummaryView | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [selected, setSelected] = useState<AgencyEnquiry | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [members, setMembers] = useState<AgencyMember[]>([]);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');

  // Newer reads win: a quiet live refresh can overlap the first page load, and
  // an older response must never overwrite a fresher list or thread.
  const requestSeq = useRef(0);
  const detailSeq = useRef(0);
  // Read by the live callback, which runs outside React's render cycle.
  const selectedIdRef = useRef<string | null>(null);
  const sheetOpenRef = useRef(false);
  selectedIdRef.current = selected?.id ?? null;
  sheetOpenRef.current = sheetOpen;

  /**
   * `quiet` is the live/poll path: it refreshes the counters in place without
   * the spinner and keeps the last known numbers when the read fails. The read
   * also feeds the nav badge, which shares this count with the context.
   */
  const loadSummary = useCallback(
    async (quiet = false) => {
      if (!quiet) setSummaryLoading(true);
      try {
        const next = await refreshEnquiryBadge();
        if (next) setSummary(next);
      } catch {
        // Counters are secondary: a failed summary must not hide the inbox.
      } finally {
        if (!quiet) setSummaryLoading(false);
      }
    },
    [refreshEnquiryBadge]
  );

  useEffect(() => {
    void loadSummary();
  }, [loadSummary, reloadKey]);

  /**
   * `quiet` keeps the rows already on screen: a live refresh that fails must not
   * replace a working inbox with an error card.
   */
  const loadFirstPage = useCallback(
    async (quiet: boolean) => {
      const seq = ++requestSeq.current;
      if (!quiet) {
        setLoading(true);
        setError(null);
      }
      try {
        const page = await api.getAgencyEnquiries({
          status: filter === 'all' ? undefined : filter,
          limit: 20,
        });
        if (seq !== requestSeq.current) return;
        setEnquiries(page.enquiries);
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setTotal(page.total);
        setError(null);
      } catch (err) {
        if (seq !== requestSeq.current || quiet) return;
        setError(errorMessage(err, 'Could not load enquiries right now.'));
        setEnquiries([]);
      } finally {
        // Clear the spinner even when a fresher quiet read already won the race.
        if (!quiet) setLoading(false);
      }
    },
    [filter]
  );

  useEffect(() => {
    void loadFirstPage(false);
  }, [loadFirstPage, reloadKey]);

  useEffect(() => {
    if (!canAssign || !activeAgencyId) return;
    let cancelled = false;
    void api
      .getAgencyMembers(activeAgencyId)
      .then((result) => {
        if (!cancelled) setMembers(result.members || []);
      })
      .catch(() => {
        /* the claim button still works without the assignee picker */
      });
    return () => {
      cancelled = true;
    };
  }, [activeAgencyId, canAssign]);

  // A client row links back to the lead it came from: `/agency/enquiries?enquiry=<id>`
  // opens that thread straight away, then drops the parameter so a reload lands
  // on a plain inbox.
  const deepLinkEnquiryId = searchParams.get('enquiry');
  useEffect(() => {
    if (!deepLinkEnquiryId || !activeAgencyId) return;
    let cancelled = false;
    void api
      .getAgencyEnquiry(deepLinkEnquiryId)
      .then((result) => {
        if (cancelled) return;
        setSelected(result.enquiry);
        setSheetOpen(true);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('That enquiry is no longer in this inbox.');
        }
      })
      .finally(() => {
        if (cancelled) return;
        const next = new URLSearchParams(searchParams);
        next.delete('enquiry');
        setSearchParams(next, { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [deepLinkEnquiryId, activeAgencyId, searchParams, setSearchParams]);

  // Reading a lead's thread is reading it (D8): the detail GET returns the
  // messages and stamps the agency's read receipts, so the badge clears as the
  // sheet opens — and again when a live frame says the traveller replied while
  // the thread is on screen.
  const loadDetail = useCallback(async (id: string, quiet: boolean) => {
    const seq = ++detailSeq.current;
    if (!quiet) {
      setDetailLoading(true);
      setDetailError(null);
    }
    try {
      const result = await api.getAgencyEnquiry(id);
      if (seq !== detailSeq.current || selectedIdRef.current !== id) return;
      setSelected((prev) =>
        prev && prev.id === result.enquiry.id ? result.enquiry : prev
      );
      setEnquiries((prev) =>
        prev.map((row) =>
          row.id === result.enquiry.id
            ? {
                ...row,
                status: result.enquiry.status,
                unread: result.enquiry.unread,
                replyCount: result.enquiry.replyCount,
                lastMessageAt: result.enquiry.lastMessageAt,
                lastMessageBy: result.enquiry.lastMessageBy,
              }
            : row
        )
      );
      if (quiet) setDetailError(null);
      // Reading the thread clears its unread reply, which is part of what the
      // badge counts. Quiet refreshes are followed by `refreshLive`'s own
      // summary read, so only the open itself needs to ask again.
      if (!quiet) void loadSummary(true);
    } catch (err) {
      if (seq !== detailSeq.current || quiet) return;
      setDetailError(errorMessage(err, 'Could not open this conversation.'));
    } finally {
      if (!quiet) setDetailLoading(false);
    }
  }, [loadSummary]);

  useEffect(() => {
    if (!sheetOpen || !selected?.id) return;
    void loadDetail(selected.id, false);
    // `selected` is replaced by this effect's own result, so only its identity
    // should trigger a reload.
  }, [sheetOpen, selected?.id, loadDetail]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    const seq = requestSeq.current;
    setLoadingMore(true);
    try {
      const page = await api.getAgencyEnquiries({
        status: filter === 'all' ? undefined : filter,
        cursor,
        limit: 20,
      });
      // A live refresh that landed first already replaced the list.
      if (seq !== requestSeq.current) return;
      setEnquiries((prev) => [...prev, ...page.enquiries]);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setTotal(page.total);
    } catch (err) {
      if (seq === requestSeq.current) {
        toast.error(errorMessage(err, 'Could not load more enquiries.'));
      }
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, filter, loadingMore]);

  // R3: new leads, traveller replies, read receipts and status changes arrive
  // as frames. One quiet resync covers the counters and the list; an open sheet
  // re-reads its thread, which is also what clears its unread badge.
  const refreshLive = useCallback(async () => {
    const openId = sheetOpenRef.current ? selectedIdRef.current : null;
    // Read the open thread first: that GET stamps the receipts, so the list
    // read that follows cannot put a stale unread badge back on the row.
    if (openId) await loadDetail(openId, true);
    await Promise.all([loadFirstPage(true), loadSummary(true)]);
  }, [loadFirstPage, loadSummary, loadDetail]);

  const liveMode = useEnquiryLiveRefresh(refreshLive, {
    enabled: Boolean(activeAgencyId),
    channel: 'agency',
    streamKey: activeAgencyId ?? undefined,
  });

  const applyUpdate = useCallback(
    async (enquiry: AgencyEnquiry, payload: AgencyEnquiryUpdateInput, label: string) => {
      setBusy(label);
      try {
        const result = await api.updateAgencyEnquiry(enquiry.id, payload);
        const updated = result.enquiry;
        // A claim or conversion answers with the lead, not always with its
        // thread: merge so the open sheet keeps what it is already showing.
        setSelected((prev) =>
          prev && prev.id === updated.id ? { ...prev, ...updated } : updated
        );
        setEnquiries((prev) => {
          const next = prev.map((row) => (row.id === updated.id ? updated : row));
          if (filter !== 'all' && updated.status !== filter) {
            return next.filter((row) => row.id !== updated.id);
          }
          return next;
        });
        if (filter !== 'all' && updated.status !== filter) {
          setTotal((count) => Math.max(0, count - 1));
        }
        if (result.claimed) toast.success('Enquiry claimed.');
        await loadSummary();
      } catch (err) {
        toast.error(errorMessage(err, 'Could not update this enquiry.'));
      } finally {
        setBusy(null);
      }
    },
    [filter, loadSummary]
  );

  const convert = useCallback(
    async (enquiry: AgencyEnquiry) => {
      setBusy('convert');
      try {
        const result = await api.convertAgencyEnquiry(enquiry.id);
        const updated = result.enquiry;
        setSelected((prev) =>
          prev && prev.id === updated.id ? { ...prev, ...updated } : updated
        );
        setEnquiries((prev) => {
          const next = prev.map((row) => (row.id === updated.id ? updated : row));
          if (filter !== 'all' && updated.status !== filter) {
            return next.filter((row) => row.id !== updated.id);
          }
          return next;
        });
        toast.success(
          result.created
            ? 'Client created from this enquiry.'
            : 'Existing client linked to this enquiry.'
        );
        await loadSummary();
      } catch (err) {
        toast.error(errorMessage(err, 'Could not convert this enquiry.'));
      } finally {
        setBusy(null);
      }
    },
    [filter, loadSummary]
  );

  const openEnquiry = (enquiry: AgencyEnquiry) => {
    setSelected(enquiry);
    setLostOpen(false);
    setLostReason('');
    setSheetOpen(true);
  };

  const startTrip = useCallback(
    async (enquiry: AgencyEnquiry) => {
      setBusy('trip');
      try {
        const result = await api.startAgencyEnquiryTrip(enquiry.id);
        setSelected(result.enquiry);
        setEnquiries((prev) =>
          prev.map((row) =>
            row.id === result.enquiry.id ? result.enquiry : row
          )
        );
        await loadSummary();
        const params = new URLSearchParams({
          tab: 'quote',
          ...(result.clientId ? { client: result.clientId } : {}),
          adults: String(result.enquiry.party.adults),
          children: String(result.enquiry.party.children),
        });
        navigate(`/agency/trips/${result.tripId}?${params.toString()}`);
      } catch (err) {
        toast.error(
          errorMessage(err, 'Could not start a trip from this enquiry.')
        );
      } finally {
        setBusy(null);
      }
    },
    [loadSummary, navigate]
  );

  const changeStatus = (status: AgencyEnquiryStatus) => {
    if (!selected) return;
    if (status === 'lost') {
      setLostReason(selected.lostReason ?? '');
      setLostOpen(true);
      return;
    }
    void applyUpdate(selected, { status }, `status-${status}`);
  };

  const confirmLost = () => {
    if (!selected) return;
    const reason = lostReason.trim();
    if (!reason) return;
    setLostOpen(false);
    void applyUpdate(selected, { status: 'lost', lostReason: reason }, 'status-lost');
  };

  const claim = () => {
    if (!selected || !myId) return;
    void applyUpdate(selected, { assigneeId: myId }, 'claim');
  };

  const release = () => {
    if (!selected) return;
    void applyUpdate(selected, { assigneeId: null }, 'release');
  };

  const assignTo = (value: string) => {
    if (!selected) return;
    void applyUpdate(
      selected,
      { assigneeId: value === 'unassigned' ? null : value },
      'assign'
    );
  };

  const sendReply = useCallback(
    async (body: string) => {
      if (!selected) return;
      const result = await api.sendAgencyEnquiryMessage(selected.id, body);
      const conversation = result.conversation;
      const patch = {
        status: conversation.status,
        repliedAt: conversation.repliedAt,
        messages: conversation.messages,
        unread: conversation.unread,
        lastMessageAt: conversation.lastMessageAt,
        lastMessageBy: conversation.lastMessageBy,
        replyCount: conversation.messages.length,
      };
      setSelected((prev) =>
        prev && prev.id === conversation.id ? { ...prev, ...patch } : prev
      );
      setEnquiries((prev) => {
        const next = prev.map((row) =>
          row.id === conversation.id ? { ...row, ...patch } : row
        );
        if (filter !== 'all' && conversation.status !== filter) {
          return next.filter((row) => row.id !== conversation.id);
        }
        return next;
      });
      if (filter !== 'all' && conversation.status !== filter) {
        setTotal((count) => Math.max(0, count - 1));
      }
      await loadSummary();
    },
    [filter, loadSummary, selected]
  );

  const quoteHref = useMemo(() => {
    if (!selected?.client) return null;
    const tripId = selected.package?.tripId ?? selected.tripId;
    if (!tripId) return null;
    const params = new URLSearchParams({
      tab: 'quote',
      client: selected.client.id,
      adults: String(selected.party.adults),
      children: String(selected.party.children),
    });
    return `/agency/trips/${tripId}?${params.toString()}`;
  }, [selected]);

  const summaryCards = [
    {
      label: 'New leads',
      value: summary ? String(summary.byStatus.new) : '—',
      hint: 'Waiting for a first reply',
      icon: Inbox,
      tone: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
    },
    {
      label: 'Open leads',
      value: summary ? String(summary.open) : '—',
      hint: 'New, replied or quoted',
      icon: MessageSquare,
      tone: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    },
    {
      label: 'Replied this week',
      value: summary ? String(summary.repliedThisWeek) : '—',
      hint: 'Rolling 7 days',
      icon: CheckCircle2,
      tone: 'bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300',
    },
    {
      label: 'Conversion rate',
      value: summary ? percent(summary.conversionRate) : '—',
      hint: summary
        ? `${summary.byStatus.won} won of ${summary.total}`
        : 'Won ÷ all leads',
      icon: Trophy,
      tone: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Enquiries</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Leads from your public directory page and package cards. Claim one,
            reply in the thread, quote, then convert it into a client — the
            traveller reads every reply in their own conversation, and the
            workspace keeps the whole history.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {liveMode === 'live' ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary"
              title="New leads and replies appear here as they arrive"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Live
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl text-xs font-bold gap-1.5"
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={loading || summaryLoading}
          >
            {loading || summaryLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-[11px] font-bold transition-colors',
              filter === option.value
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border/70 bg-card text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {total} {total === 1 ? 'enquiry' : 'enquiries'}
        </span>
      </div>

      {error ? (
        <Card className="rounded-3xl border-destructive/30">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-xs font-semibold text-destructive">{error}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl text-xs font-bold"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Opening the inbox…
        </div>
      ) : enquiries.length === 0 ? (
        <Card className="rounded-3xl border-dashed border-border/80">
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Inbox className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">
                {filter === 'all' ? 'No enquiries yet' : 'Nothing in this status'}
              </p>
              <p className="mx-auto max-w-md text-xs text-muted-foreground">
                Publish your directory profile and package cards; the enquiry
                button on both feeds this inbox. Every submission is rate-limited
                and consented.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {enquiries.map((enquiry) => (
            <Card
              key={enquiry.id}
              className="cursor-pointer rounded-3xl border-border/70 transition hover:border-primary/40"
              onClick={() => openEnquiry(enquiry)}
            >
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-bold text-foreground">
                        {enquiry.contact.name}
                      </h2>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px]',
                          agencyEnquiryStatusBadgeClass(enquiry.status)
                        )}
                      >
                        {AGENCY_ENQUIRY_STATUS_LABELS[enquiry.status]}
                      </Badge>
                      {enquiry.package ? (
                        <Badge
                          variant="secondary"
                          className="max-w-[240px] truncate text-[10px]"
                        >
                          {enquiry.package.title}
                        </Badge>
                      ) : null}
                      {enquiry.client ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-teal-700 dark:text-teal-300"
                        >
                          Client
                        </Badge>
                      ) : null}
                      {enquiry.proposals?.lastDeclinedAt ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-rose-300 bg-rose-50 text-[10px] text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                          title={`Traveller declined the proposal on ${formatAgencyDate(
                            enquiry.proposals.lastDeclinedAt
                          )}`}
                        >
                          <XCircle className="h-2.5 w-2.5" />
                          Proposal declined
                        </Badge>
                      ) : null}
                      {enquiry.unread.agency > 0 ? (
                        <Badge className="gap-1 text-[10px]">
                          <MessageSquare className="h-2.5 w-2.5" />
                          {enquiry.unread.agency} new
                        </Badge>
                      ) : null}
                      {enquiry.assignee ? (
                        <Badge variant="outline" className="text-[10px]">
                          {enquiry.assignee.id === myId
                            ? 'You'
                            : enquiry.assignee.name}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {enquiry.createdAt
                        ? `Received ${formatAgencyDate(enquiry.createdAt)}`
                        : 'Received'}
                      {enquiry.source === 'package' ? ' · from a package card' : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl text-xs font-bold"
                    onClick={(event) => {
                      event.stopPropagation();
                      openEnquiry(enquiry);
                    }}
                  >
                    Open
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {enquiry.contact.email}
                  </span>
                  {enquiry.contact.phone ? (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {enquiry.contact.phone}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {partyLabel(enquiry)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {datesLabel(enquiry)}
                  </span>
                  {enquiry.budgetBand ? (
                    <span className="inline-flex items-center gap-1">
                      <Wallet className="h-3 w-3" />
                      {AGENCY_ENQUIRY_BUDGET_LABELS[enquiry.budgetBand]}
                    </span>
                  ) : null}
                </div>

                <p className="line-clamp-2 whitespace-pre-line text-xs leading-relaxed text-foreground">
                  {enquiry.message}
                </p>
              </CardContent>
            </Card>
          ))}

          {hasMore ? (
            <div className="flex justify-center pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl text-xs font-bold gap-1.5"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto p-0 sm:max-w-xl"
        >
          {selected ? (
            <div className="space-y-5 p-5 sm:p-6">
              <SheetHeader className="space-y-2 text-left">
                <div className="flex flex-wrap items-center gap-2 pr-8">
                  <SheetTitle className="text-lg">
                    {selected.contact.name}
                  </SheetTitle>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px]',
                      agencyEnquiryStatusBadgeClass(selected.status)
                    )}
                  >
                    {AGENCY_ENQUIRY_STATUS_LABELS[selected.status]}
                  </Badge>
                  {selected.package ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {selected.package.title}
                    </Badge>
                  ) : null}
                  {selected.proposals?.lastDeclinedAt ? (
                    <Badge
                      variant="outline"
                      className="gap-1 border-rose-300 bg-rose-50 text-[10px] text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                    >
                      <XCircle className="h-2.5 w-2.5" />
                      Proposal declined {formatAgencyDate(selected.proposals.lastDeclinedAt)}
                    </Badge>
                  ) : null}
                </div>
                <SheetDescription>
                  {selected.createdAt
                    ? `Received ${formatAgencyDate(selected.createdAt)}`
                    : 'Received'}
                  {selected.source === 'package' ? ' from a package card' : ' from your profile'}
                  {selected.consentAt
                    ? ` · consent recorded ${formatAgencyDate(selected.consentAt)}`
                    : ''}
                </SheetDescription>
              </SheetHeader>

              <div className="grid gap-2 rounded-2xl border border-border/70 p-3 text-xs sm:grid-cols-2">
                <a
                  href={`mailto:${selected.contact.email}`}
                  className="inline-flex items-center gap-1.5 text-foreground hover:text-primary"
                >
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  {selected.contact.email}
                </a>
                {selected.contact.phone ? (
                  <a
                    href={`tel:${selected.contact.phone}`}
                    className="inline-flex items-center gap-1.5 text-foreground hover:text-primary"
                  >
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    {selected.contact.phone}
                  </a>
                ) : null}
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  {partyLabel(selected)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  {datesLabel(selected)}
                </span>
                {selected.budgetBand ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                    {AGENCY_ENQUIRY_BUDGET_LABELS[selected.budgetBand]}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  {selected.assignee
                    ? selected.assignee.id === myId
                      ? 'Claimed by you'
                      : `Claimed by ${selected.assignee.name}`
                    : 'Unclaimed'}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5 text-primary" />
                    Conversation
                  </p>
                  {selected.unread.agency > 0 ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {selected.unread.agency} unread
                    </Badge>
                  ) : selected.replyCount > 0 ? (
                    <span className="text-[10px] text-muted-foreground">
                      {selected.replyCount}{' '}
                      {selected.replyCount === 1 ? 'reply' : 'replies'}
                    </span>
                  ) : null}
                </div>

                {detailLoading ? (
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-border/70 py-10 text-[11px] text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading the thread…
                  </div>
                ) : detailError ? (
                  <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-[11px] font-semibold text-destructive">
                    {detailError}
                  </p>
                ) : (
                  <ConversationThread
                    messages={selected.messages ?? []}
                    viewer="agency"
                    opening={{
                      authorName: selected.contact.name,
                      body: selected.message,
                      createdAt: selected.createdAt,
                    }}
                    canReply={canPlan}
                    onSend={sendReply}
                    placeholder={`Reply to ${selected.contact.name}…`}
                    emptyHint="No reply yet. The traveller sees your answer in their conversation."
                  />
                )}

                {selected.conversationExpiresAt ? (
                  <p className="text-[10px] text-muted-foreground">
                    The traveller's private guest link works until{' '}
                    {formatAgencyDate(selected.conversationExpiresAt)}.
                  </p>
                ) : null}
              </div>

              {selected.status === 'lost' && selected.lostReason ? (
                <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <span className="font-semibold">Lost:</span>{' '}
                    {selected.lostReason}
                  </span>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Timeline
                </p>
                <div className="space-y-1 text-[11px] text-muted-foreground">
                  {selected.repliedAt ? (
                    <p>Replied {formatAgencyDate(selected.repliedAt)}</p>
                  ) : null}
                  {selected.convertedAt ? (
                    <p>Converted {formatAgencyDate(selected.convertedAt)}</p>
                  ) : null}
                  <p>
                    <MapPin className="mr-1 inline h-3 w-3" />
                    Contact details are visible to this workspace only.
                  </p>
                </div>
              </div>

              {canPlan ? (
                <div className="space-y-3 rounded-2xl border border-border/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold">Status</p>
                    <Select
                      value={selected.status}
                      onValueChange={(value) =>
                        changeStatus(value as AgencyEnquiryStatus)
                      }
                      disabled={busy !== null}
                    >
                      <SelectTrigger className="h-8 w-[150px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AGENCY_ENQUIRY_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {AGENCY_ENQUIRY_STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!selected.assignedTo ? (
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-xl text-xs font-bold gap-1.5"
                        onClick={claim}
                        disabled={busy !== null || !myId}
                      >
                        {busy === 'claim' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserPlus className="h-3.5 w-3.5" />
                        )}
                        Claim
                      </Button>
                    ) : selected.assignedTo === myId || canAssign ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-xl text-xs font-bold"
                        onClick={release}
                        disabled={busy !== null}
                      >
                        Release
                      </Button>
                    ) : null}

                    {canAssign ? (
                      <Select
                        value={selected.assignedTo ?? 'unassigned'}
                        onValueChange={assignTo}
                        disabled={busy !== null}
                      >
                        <SelectTrigger className="h-8 w-[180px] text-xs">
                          <SelectValue placeholder="Assign to…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {members.map((member) => (
                            <SelectItem key={member.userId} value={member.userId}>
                              {member.userId === myId ? 'You' : member.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                    {selected.client ? (
                      <Badge
                        variant="outline"
                        className="gap-1 border-teal-300 bg-teal-50 text-[10px] text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300"
                      >
                        <BriefcaseBusiness className="h-3 w-3" />
                        {selected.client.name}
                      </Badge>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-xl text-xs font-bold gap-1.5"
                        onClick={() => void convert(selected)}
                        disabled={busy !== null}
                      >
                        {busy === 'convert' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserCheck className="h-3.5 w-3.5" />
                        )}
                        Convert to client
                      </Button>
                    )}

                    {quoteHref ? (
                      <Button
                        asChild
                        size="sm"
                        className="rounded-xl text-xs font-bold gap-1.5"
                      >
                        <Link to={quoteHref}>
                          <Receipt className="h-3.5 w-3.5" />
                          Quote this trip
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-xl text-xs font-bold gap-1.5"
                        onClick={() => void startTrip(selected)}
                        disabled={busy !== null}
                      >
                        {busy === 'trip' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Receipt className="h-3.5 w-3.5" />
                        )}
                        Start a trip
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {!quoteHref ? (
                    <p className="text-[11px] text-muted-foreground">
                      {selected.client
                        ? 'No trip is linked to this lead yet. Starting one opens a blank trip with these dates, ready to quote.'
                        : 'Starting a trip turns this lead into a client and opens a blank trip with these dates, ready to quote.'}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-border/70 p-3 text-[11px] text-muted-foreground">
                  Viewers can read the inbox. Ask an owner, admin or planner to
                  reply, claim or quote a lead.
                </p>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark this enquiry lost</DialogTitle>
            <DialogDescription>
              A short reason keeps the pipeline honest. It stays inside the
              workspace and can be cleared by reopening the lead.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {LOST_REASON_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setLostReason(preset)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  lostReason === preset
                    ? 'border-destructive/40 bg-destructive/10 text-destructive'
                    : 'border-border/70 text-muted-foreground hover:text-foreground'
                )}
              >
                {preset}
              </button>
            ))}
          </div>
          <Textarea
            value={lostReason}
            onChange={(event) => setLostReason(event.target.value)}
            placeholder="Budget, dates, chose another agency…"
            maxLength={200}
            rows={3}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLostOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmLost}
              disabled={!lostReason.trim() || busy !== null}
            >
              {busy === 'status-lost' ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Mark lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AgencyEnquiries;
