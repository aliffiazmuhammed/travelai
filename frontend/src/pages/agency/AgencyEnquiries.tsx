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
import { AgencyEmptyState } from '@/components/agency/AgencyEmptyState';
import { AgencyPageHeader } from '@/components/agency/AgencyPageHeader';
import { AgencySegmented } from '@/components/agency/AgencySegmented';
import ConversationThread from '@/components/directory/ConversationThread';
import { useAgency } from '@/context/AgencyContext';
import { useAgencyAuth } from '@/context/AgencyAuthContext';
import { useEnquiryLiveRefresh } from '@/hooks/useEnquiryEvents';
import { useIsMobile } from '@/hooks/use-mobile';
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

interface EnquiryDetailProps {
  enquiry: AgencyEnquiry;
  myId: string | null;
  canPlan: boolean;
  canAssign: boolean;
  members: AgencyMember[];
  detailLoading: boolean;
  detailError: string | null;
  busy: string | null;
  quoteHref: string | null;
  onChangeStatus: (status: AgencyEnquiryStatus) => void;
  onClaim: () => void;
  onRelease: () => void;
  onAssign: (value: string) => void;
  onConvert: () => void;
  onStartTrip: () => void;
  onSendReply: (body: string) => Promise<void>;
}

/**
 * One lead, opened: contact details, the thread, and the moves a member can
 * make. The desktop pane and the mobile sheet share this so the two can never
 * drift apart.
 */
const EnquiryDetail: React.FC<EnquiryDetailProps> = ({
  enquiry,
  myId,
  canPlan,
  canAssign,
  members,
  detailLoading,
  detailError,
  busy,
  quoteHref,
  onChangeStatus,
  onClaim,
  onRelease,
  onAssign,
  onConvert,
  onStartTrip,
  onSendReply,
}) => (
  <div className="space-y-5">
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
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
          <Badge variant="secondary" className="text-[10px]">
            {enquiry.package.title}
          </Badge>
        ) : null}
        {enquiry.proposals?.lastDeclinedAt ? (
          <Badge
            variant="outline"
            className="gap-1 border-rose-300 bg-rose-50 text-[10px] text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
          >
            <XCircle className="h-2.5 w-2.5" />
            Proposal declined {formatAgencyDate(enquiry.proposals.lastDeclinedAt)}
          </Badge>
        ) : null}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {enquiry.createdAt
          ? `Received ${formatAgencyDate(enquiry.createdAt)}`
          : 'Received'}
        {enquiry.source === 'package' ? ' from a package card' : ' from your profile'}
        {enquiry.consentAt
          ? ` · consent recorded ${formatAgencyDate(enquiry.consentAt)}`
          : ''}
      </p>
    </div>

    <div className="grid gap-2 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800 sm:grid-cols-2">
      <a
        href={`mailto:${enquiry.contact.email}`}
        className="inline-flex items-center gap-1.5 text-slate-700 hover:text-teal-700 dark:text-slate-200 dark:hover:text-teal-300"
      >
        <Mail className="h-3.5 w-3.5 text-slate-400" />
        {enquiry.contact.email}
      </a>
      {enquiry.contact.phone ? (
        <a
          href={`tel:${enquiry.contact.phone}`}
          className="inline-flex items-center gap-1.5 text-slate-700 hover:text-teal-700 dark:text-slate-200 dark:hover:text-teal-300"
        >
          <Phone className="h-3.5 w-3.5 text-slate-400" />
          {enquiry.contact.phone}
        </a>
      ) : null}
      <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
        <Users className="h-3.5 w-3.5 text-slate-400" />
        {partyLabel(enquiry)}
      </span>
      <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
        <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
        {datesLabel(enquiry)}
      </span>
      {enquiry.budgetBand ? (
        <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
          <Wallet className="h-3.5 w-3.5 text-slate-400" />
          {AGENCY_ENQUIRY_BUDGET_LABELS[enquiry.budgetBand]}
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
        <UserCheck className="h-3.5 w-3.5 text-slate-400" />
        {enquiry.assignee
          ? enquiry.assignee.id === myId
            ? 'Claimed by you'
            : `Claimed by ${enquiry.assignee.name}`
          : 'Unclaimed'}
      </span>
    </div>

    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <MessageSquare className="h-3.5 w-3.5" />
          Conversation
        </p>
        {enquiry.unread.agency > 0 ? (
          <Badge variant="secondary" className="text-[10px]">
            {enquiry.unread.agency} unread
          </Badge>
        ) : enquiry.replyCount > 0 ? (
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            {enquiry.replyCount} {enquiry.replyCount === 1 ? 'reply' : 'replies'}
          </span>
        ) : null}
      </div>

      {detailLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-10 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading the thread…
        </div>
      ) : detailError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {detailError}
        </p>
      ) : (
        <ConversationThread
          messages={enquiry.messages ?? []}
          viewer="agency"
          opening={{
            authorName: enquiry.contact.name,
            body: enquiry.message,
            createdAt: enquiry.createdAt,
          }}
          canReply={canPlan}
          onSend={onSendReply}
          placeholder={`Reply to ${enquiry.contact.name}…`}
          emptyHint="No reply yet. The traveller sees your answer in their conversation."
        />
      )}

      {enquiry.conversationExpiresAt ? (
        <p className="text-[10px] text-slate-500 dark:text-slate-400">
          The traveller's private guest link works until{' '}
          {formatAgencyDate(enquiry.conversationExpiresAt)}.
        </p>
      ) : null}
    </div>

    {enquiry.status === 'lost' && enquiry.lostReason ? (
      <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <span className="font-semibold">Lost:</span> {enquiry.lostReason}
        </span>
      </div>
    ) : null}

    <div className="space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
      <p className="font-medium text-slate-600 dark:text-slate-300">Timeline</p>
      {enquiry.repliedAt ? <p>Replied {formatAgencyDate(enquiry.repliedAt)}</p> : null}
      {enquiry.convertedAt ? (
        <p>Converted {formatAgencyDate(enquiry.convertedAt)}</p>
      ) : null}
      <p className="flex items-center gap-1">
        <MapPin className="h-3 w-3" />
        Contact details are visible to this workspace only.
      </p>
    </div>

    {canPlan ? (
      <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold">Status</p>
          <Select
            value={enquiry.status}
            onValueChange={(value) => onChangeStatus(value as AgencyEnquiryStatus)}
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
          {!enquiry.assignedTo ? (
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={onClaim}
              disabled={busy !== null || !myId}
            >
              {busy === 'claim' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              Claim
            </Button>
          ) : enquiry.assignedTo === myId || canAssign ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRelease}
              disabled={busy !== null}
            >
              Release
            </Button>
          ) : null}

          {canAssign ? (
            <Select
              value={enquiry.assignedTo ?? 'unassigned'}
              onValueChange={onAssign}
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

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          {enquiry.client ? (
            <Badge
              variant="outline"
              className="gap-1 border-teal-300 bg-teal-50 text-[10px] text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300"
            >
              <BriefcaseBusiness className="h-3 w-3" />
              {enquiry.client.name}
            </Badge>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={onConvert}
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
            <Button asChild size="sm" className="gap-1.5">
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
              className="gap-1.5"
              onClick={onStartTrip}
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
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {enquiry.client
              ? 'No trip is linked to this lead yet. Starting one opens a blank trip with these dates, ready to quote.'
              : 'Starting a trip turns this lead into a client and opens a blank trip with these dates, ready to quote.'}
          </p>
        ) : null}
      </div>
    ) : (
      <p className="rounded-xl border border-dashed border-slate-300 p-3 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Viewers can read the inbox. Ask an owner, admin or planner to reply,
        claim or quote a lead.
      </p>
    )}
  </div>
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
  const isMobile = useIsMobile();

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
  // The thread is on screen when a lead is open: always in the desktop pane,
  // and in the sheet on mobile.
  const detailOpen = Boolean(selected) && (!isMobile || sheetOpen);
  // Read by the live callback, which runs outside React's render cycle.
  const selectedIdRef = useRef<string | null>(null);
  const detailOpenRef = useRef(false);
  selectedIdRef.current = selected?.id ?? null;
  detailOpenRef.current = detailOpen;

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
        if (isMobile) setSheetOpen(true);
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
  }, [deepLinkEnquiryId, activeAgencyId, isMobile, searchParams, setSearchParams]);

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
    if (!detailOpen || !selected?.id) return;
    void loadDetail(selected.id, false);
    // `selected` is replaced by this effect's own result, so only its identity
    // should trigger a reload.
  }, [detailOpen, selected?.id, loadDetail]);

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
  // as frames. One quiet resync covers the counters and the list; a thread that
  // is on screen re-reads itself, which is also what clears its unread badge.
  const refreshLive = useCallback(async () => {
    const openId = detailOpenRef.current ? selectedIdRef.current : null;
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
    if (isMobile) setSheetOpen(true);
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
      iconClass: 'text-sky-600 dark:text-sky-400',
    },
    {
      label: 'Open leads',
      value: summary ? String(summary.open) : '—',
      hint: 'New, replied or quoted',
      icon: MessageSquare,
      iconClass: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Replied this week',
      value: summary ? String(summary.repliedThisWeek) : '—',
      hint: 'Rolling 7 days',
      icon: CheckCircle2,
      iconClass: 'text-teal-600 dark:text-teal-400',
    },
    {
      label: 'Conversion rate',
      value: summary ? percent(summary.conversionRate) : '—',
      hint: summary
        ? `${summary.byStatus.won} won of ${summary.total}`
        : 'Won ÷ all leads',
      icon: Trophy,
      iconClass: 'text-violet-600 dark:text-violet-400',
    },
  ];

  return (
    <div className="space-y-5">
      <AgencyPageHeader
        title="Enquiries"
        description="Leads from your public directory page and package cards. Claim one, reply in the thread, quote, then convert it into a client — the traveller reads every reply in their own conversation, and the workspace keeps the whole history."
        actions={
          <>
            {liveMode === 'live' ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[10px] font-medium text-teal-700 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300"
                title="New leads and replies appear here as they arrive"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-500" />
                Live
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReloadKey((key) => key + 1)}
              disabled={loading || summaryLoading}
            >
              {loading || summaryLoading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </>
        }
      />

      <section
        aria-label="Enquiry summary"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {summaryCards.map(({ label, value, hint, icon: Icon, iconClass }) => (
          <div
            key={label}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <Icon className={cn('h-3.5 w-3.5', iconClass)} />
              {label}
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
              {value}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>
          </div>
        ))}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <section
          aria-label="Enquiry inbox"
          className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
            <AgencySegmented
              ariaLabel="Filter enquiries by status"
              value={filter}
              onChange={(value) => setFilter(value)}
              options={FILTERS.map((option) => ({
                ...option,
                count:
                  option.value === 'all'
                    ? summary?.total ?? total
                    : summary?.byStatus[option.value],
              }))}
            />
          </div>

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-xs font-medium text-rose-700 dark:text-rose-300">{error}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Try again
          </Button>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Opening the inbox…
        </div>
      ) : enquiries.length === 0 ? (
        <AgencyEmptyState
          className="m-4"
          icon={Inbox}
          title={filter === 'all' ? 'No enquiries yet' : 'Nothing in this status'}
          body="Publish your directory profile and package cards; the enquiry button on both feeds this inbox. Every submission is rate-limited and consented."
          action={
            filter === 'all' ? undefined : (
              <Button size="sm" variant="outline" onClick={() => setFilter('all')}>
                Show all enquiries
              </Button>
            )
          }
        />
      ) : (
        <div className="divide-y divide-slate-100 lg:max-h-[calc(100vh-24rem)] lg:overflow-y-auto dark:divide-slate-800">
          {enquiries.map((enquiry) => {
            const active = selected?.id === enquiry.id;
            const unread = enquiry.unread.agency;
            const stamp = enquiry.lastMessageAt || enquiry.createdAt;
            return (
              <button
                key={enquiry.id}
                type="button"
                onClick={() => openEnquiry(enquiry)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'block w-full px-4 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600 dark:hover:bg-slate-800/60',
                  active &&
                    'bg-teal-50/70 hover:bg-teal-50 dark:bg-teal-950/30 dark:hover:bg-teal-950/40'
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'truncate text-sm',
                      unread > 0
                        ? 'font-semibold text-slate-900 dark:text-slate-50'
                        : 'font-medium text-slate-800 dark:text-slate-200'
                    )}
                  >
                    {enquiry.contact.name}
                  </span>
                  {unread > 0 ? (
                    <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-teal-600 px-1 text-[10px] font-semibold text-white">
                      {unread}
                    </span>
                  ) : null}
                  {stamp ? (
                    <span className="ml-auto shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
                      {formatAgencyDate(stamp)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                  {enquiry.message}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge
                    variant="outline"
                    className={cn('text-[10px]', agencyEnquiryStatusBadgeClass(enquiry.status))}
                  >
                    {AGENCY_ENQUIRY_STATUS_LABELS[enquiry.status]}
                  </Badge>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {partyLabel(enquiry)} · {datesLabel(enquiry)}
                  </span>
                </div>
                {enquiry.package ||
                enquiry.client ||
                enquiry.proposals?.lastDeclinedAt ||
                enquiry.assignee ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {enquiry.package ? (
                      <Badge
                        variant="secondary"
                        className="max-w-full truncate text-[10px]"
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
                    {enquiry.assignee ? (
                      <Badge variant="outline" className="text-[10px]">
                        {enquiry.assignee.id === myId ? 'You' : enquiry.assignee.name}
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
              </button>
            );
          })}

          {hasMore ? (
            <div className="p-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      )}
        </section>

        <section
          aria-label="Selected enquiry"
          className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900"
        >
          {selected ? (
            <div className="max-h-[calc(100vh-24rem)] overflow-y-auto p-5">
              <EnquiryDetail
                enquiry={selected}
                myId={myId}
                canPlan={canPlan}
                canAssign={canAssign}
                members={members}
                detailLoading={detailLoading}
                detailError={detailError}
                busy={busy}
                quoteHref={quoteHref}
                onChangeStatus={changeStatus}
                onClaim={claim}
                onRelease={release}
                onAssign={assignTo}
                onConvert={() => void convert(selected)}
                onStartTrip={() => void startTrip(selected)}
                onSendReply={sendReply}
              />
            </div>
          ) : (
            <AgencyEmptyState
              className="m-5"
              icon={MessageSquare}
              title="Pick a conversation"
              body="Leads open here beside the inbox, so you can read the thread without losing your place. New leads appear on the left as they arrive."
            />
          )}
        </section>
      </div>

      <Sheet open={sheetOpen && isMobile} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto p-0 sm:max-w-xl"
        >
          {selected ? (
            <>
              <SheetHeader className="sr-only">
                <SheetTitle>Enquiry from {selected.contact.name}</SheetTitle>
                <SheetDescription>
                  Conversation, contact details and lead actions.
                </SheetDescription>
              </SheetHeader>
              <div className="p-5 sm:p-6">
                <EnquiryDetail
                  enquiry={selected}
                  myId={myId}
                  canPlan={canPlan}
                  canAssign={canAssign}
                  members={members}
                  detailLoading={detailLoading}
                  detailError={detailError}
                  busy={busy}
                  quoteHref={quoteHref}
                  onChangeStatus={changeStatus}
                  onClaim={claim}
                  onRelease={release}
                  onAssign={assignTo}
                  onConvert={() => void convert(selected)}
                  onStartTrip={() => void startTrip(selected)}
                  onSendReply={sendReply}
                />
              </div>
            </>
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
