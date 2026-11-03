import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  FileText,
  Loader2,
  MessageSquare,
  Paperclip,
  Send,
  Users,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import ProposalPreviewDialog from '@/components/directory/ProposalPreviewDialog';
import { AgencyLogoTile } from '@/components/directory/AgencyLogoTile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AGENCY_ENQUIRY_BUDGET_LABELS,
  travellerEnquiryStatusLabel,
  travellerEnquiryStatusBadgeClass,
  formatAgencyDate,
} from '@/lib/agency';
import { formatMoney } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { notifyEnquiryBadgeChanged } from '@/lib/enquiryBadge';
import { useEnquiryLiveRefresh } from '@/hooks/useEnquiryEvents';
import { api } from '@/services/api';
import type {
  AgencyConversation,
  AgencyConversationAuthor,
  AgencyConversationMessage,
  AgencyEnquiryDateView,
  AgencyProposalSummary,
} from '@/types/agency';

/* -------------------------------------------------------------------------- */
/*  Agency facts shared by the inbox thread and the conversation page         */
/* -------------------------------------------------------------------------- */

export interface EnquiryAgencyProfile {
  logoUrl: string | null;
  verified: boolean;
  /** Median first-response hours; null until the agency has a real sample. */
  replyTimeHours: number | null;
}

/**
 * The public directory card for the agency in a thread. It is the only source
 * of a logo, a verified mark and a median response time, and an unpublished
 * profile simply answers 404 — the thread keeps its name and nothing else.
 */
export function useEnquiryAgencyProfile(
  slug: string | null | undefined
): EnquiryAgencyProfile | null {
  const [profile, setProfile] = useState<EnquiryAgencyProfile | null>(null);

  useEffect(() => {
    setProfile(null);
    if (!slug) return;
    let cancelled = false;
    void api
      .getPublicAgencyProfile(slug)
      .then((result) => {
        if (cancelled || !result.profile) return;
        setProfile({
          logoUrl: result.profile.logoUrl ?? null,
          verified: Boolean(result.profile.verified),
          replyTimeHours: result.profile.replyTimeHours ?? null,
        });
      })
      .catch(() => {
        // A missing profile costs the thread its logo, never the conversation.
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return profile;
}

/**
 * "Usually replies within a day" from the agency's own median. Null when the
 * sample is too small, so no surface ever promises a response time it cannot
 * back with data.
 */
export function agencyReplyTimeLabel(hours: number | null | undefined): string | null {
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0) return null;
  if (hours < 1) return 'Usually replies within the hour';
  if (hours <= 24) return 'Usually replies within a day';
  const days = Math.round(hours / 24);
  return `Usually replies within ${days} ${days === 1 ? 'day' : 'days'}`;
}

/* -------------------------------------------------------------------------- */
/*  Copy helpers                                                              */
/* -------------------------------------------------------------------------- */

const MAX_BODY = 2000;

function travellersLabel(party: { adults: number; children: number }): string {
  const travellers = party.adults + party.children;
  return `${travellers} ${travellers === 1 ? 'traveller' : 'travellers'}`;
}

function datesText(dates: AgencyEnquiryDateView | null | undefined): string {
  if (!dates) return '';
  if (dates.flexible && !dates.start) return 'Flexible dates';
  if (dates.start && dates.end) {
    return `${formatAgencyDate(dates.start)} – ${formatAgencyDate(dates.end)}`;
  }
  return dates.start ? `From ${formatAgencyDate(dates.start)}` : '';
}

function nightsBetween(dates: AgencyEnquiryDateView | null | undefined): number | null {
  if (!dates?.start || !dates.end) return null;
  const start = new Date(dates.start).getTime();
  const end = new Date(dates.end).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return Math.round((end - start) / 86400000);
}

const dayKey = (value: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toDateString();
};

const dayLabel = (key: string): string => {
  const date = new Date(key);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return formatAgencyDate(date);
};

const timeLabel = (value: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

/* -------------------------------------------------------------------------- */
/*  Proposal attachment card                                                  */
/* -------------------------------------------------------------------------- */

const ProposalAttachment: React.FC<{
  proposal: AgencyProposalSummary;
  party: { adults: number; children: number };
  dates: AgencyEnquiryDateView | null | undefined;
  onPreview: (proposal: AgencyProposalSummary) => void;
  onAsk?: () => void;
  onAccept?: (proposal: AgencyProposalSummary) => Promise<void>;
  onDecline?: (proposal: AgencyProposalSummary) => Promise<void>;
}> = ({ proposal, party, dates, onPreview, onAsk, onAccept, onDecline }) => {
  const [answering, setAnswering] = useState<'accept' | 'decline' | null>(null);
  const [working, setWorking] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);

  const quote = proposal.quote;
  const accepted = Boolean(proposal.acceptedAt) || quote?.status === 'accepted';
  const declined = Boolean(proposal.declinedAt);
  const settled = Boolean(proposal.settledByAcceptedTrip) && !accepted && !declined;
  const open = quote?.status === 'sent' && !accepted && !declined && !settled;
  const canAnswer = Boolean(onAccept && onDecline) && open;

  const status = accepted
    ? { label: 'Accepted', tone: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' }
    : declined
      ? { label: 'Declined', tone: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300' }
      : settled
        ? { label: 'Another version accepted', tone: 'border-border bg-muted text-muted-foreground' }
        : quote?.status === 'expired'
          ? { label: 'Expired', tone: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300' }
          : quote?.status === 'cancelled'
            ? { label: 'Withdrawn', tone: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300' }
            : open
              ? { label: 'Awaiting you', tone: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300' }
              : { label: 'Proposal', tone: 'border-border bg-muted text-muted-foreground' };

  const nights = nightsBetween(dates);
  const summary = [
    nights === null ? null : `${nights} ${nights === 1 ? 'night' : 'nights'}`,
    travellersLabel(party),
    datesText(dates) || null,
  ]
    .filter(Boolean)
    .join(' · ');

  const confirm = async () => {
    const handler = answering === 'accept' ? onAccept : onDecline;
    if (!answering || !handler) return;
    setWorking(true);
    setAnswerError(null);
    try {
      await handler(proposal);
      setAnswering(null);
    } catch (err) {
      setAnswerError(
        err instanceof Error && err.message ? err.message : 'Your answer could not be sent.'
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-3.5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border/60 bg-card text-primary">
          <FileText className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {quote ? `Proposal ${quote.number}` : 'Proposal'}
                {quote ? ` · version ${quote.version}` : ''}
              </p>
              <p className="truncate text-sm font-semibold text-foreground">
                {proposal.trip.title}
              </p>
            </div>
            <Badge variant="outline" className={cn('shrink-0 text-[10px]', status.tone)}>
              {status.label}
            </Badge>
          </div>

          {summary ? (
            <p className="mt-1 text-[11px] text-muted-foreground">{summary}</p>
          ) : null}

          {quote ? (
            <div className="mt-2.5 border-t border-border/60 pt-2.5">
              <p className="text-[10px] text-muted-foreground">
                Total (for {travellersLabel(party)})
              </p>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {formatMoney(quote.total, quote.currency)}
              </p>
            </div>
          ) : null}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-full border-primary/40 px-3 text-[11px] font-semibold text-primary hover:bg-primary/10 hover:text-primary"
              onClick={() => onPreview(proposal)}
            >
              View proposal
            </Button>
            {canAnswer && !answering ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px] font-semibold"
                  onClick={() => {
                    setAnswerError(null);
                    setAnswering('accept');
                  }}
                >
                  Accept
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 rounded-full px-3 text-[11px] font-semibold text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    setAnswerError(null);
                    setAnswering('decline');
                  }}
                >
                  Decline
                </Button>
              </>
            ) : null}
            {onAsk ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 rounded-full px-3 text-[11px] font-semibold text-muted-foreground"
                onClick={onAsk}
              >
                Ask about this
              </Button>
            ) : null}
          </div>

          {answering ? (
            <div className="mt-2.5 space-y-1.5 border-t border-border/60 pt-2.5">
              <p className="text-[11px] font-medium text-foreground">
                {answering === 'accept'
                  ? 'Accepting confirms this quote and tells the agency. No payment is taken here.'
                  : 'Declining closes this version. The conversation stays open.'}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={answering === 'decline' ? 'destructive' : 'default'}
                  className="h-8 rounded-full px-3 text-[11px] font-semibold"
                  onClick={() => void confirm()}
                  disabled={working}
                >
                  {working ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  {answering === 'accept' ? 'Confirm acceptance' : 'Confirm decline'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 rounded-full px-3 text-[11px] font-semibold"
                  onClick={() => setAnswering(null)}
                  disabled={working}
                >
                  Cancel
                </Button>
              </div>
              {answerError ? (
                <p className="text-[11px] font-semibold text-destructive">{answerError}</p>
              ) : null}
            </div>
          ) : null}

          {declined ? (
            <p className="mt-2 text-[10px] text-muted-foreground">
              You declined this version. It stays in this conversation — message{' '}
              {proposal.agency.name} if you want a new one.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  Timeline + composer                                                       */
/* -------------------------------------------------------------------------- */

export interface EnquiryTimelineProps {
  messages: AgencyConversationMessage[];
  viewer: AgencyConversationAuthor;
  opening?: { authorName: string; body: string; createdAt: string | null };
  agency: { name: string; logoUrl?: string | null };
  canReply: boolean;
  placeholder: string;
  onSend?: (body: string) => Promise<void>;
  proposals?: AgencyProposalSummary[];
  party: { adults: number; children: number };
  dates: AgencyEnquiryDateView | null | undefined;
  onPreviewProposal: (proposal: AgencyProposalSummary) => void;
  onAcceptProposal?: (proposal: AgencyProposalSummary) => Promise<void>;
  onDeclineProposal?: (proposal: AgencyProposalSummary) => Promise<void>;
  emptyHint?: string;
  /** A quiet line under the composer: privacy note, link expiry. */
  footer?: React.ReactNode;
  className?: string;
}

interface TimelineEntry {
  id: string;
  at: string | null;
  mine: boolean;
  author: string;
  body: string;
  read?: boolean;
  label?: string;
}

/**
 * The traveller's side of one enquiry: date-separated bubbles, the proposals
 * that arrived on the thread and the reply box. Shared by the signed-in inbox
 * and the public conversation page so both read as the same conversation.
 */
export const EnquiryTimeline: React.FC<EnquiryTimelineProps> = ({
  messages,
  viewer,
  opening,
  agency,
  canReply,
  placeholder,
  onSend,
  proposals = [],
  party,
  dates,
  onPreviewProposal,
  onAcceptProposal,
  onDeclineProposal,
  emptyHint = 'No replies yet. Start the conversation below.',
  footer,
  className,
}) => {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length]);

  const days = useMemo(() => {
    const entries: TimelineEntry[] = [];
    if (opening) {
      entries.push({
        id: 'opening',
        at: opening.createdAt,
        mine: viewer === 'traveller',
        author: opening.authorName || 'Traveller',
        body: opening.body,
        label: 'Enquiry',
      });
    }
    messages.forEach((message) => {
      const mine = message.author === viewer;
      const read =
        viewer === 'traveller'
          ? Boolean(message.readByAgencyAt)
          : Boolean(message.readByTravellerAt);
      entries.push({
        id: message.id,
        at: message.createdAt,
        mine,
        author:
          message.authorName || (message.author === 'agency' ? 'The agency' : 'Traveller'),
        body: message.body,
        read: mine ? read : undefined,
      });
    });

    const groups: Array<{ key: string | null; entries: TimelineEntry[] }> = [];
    entries.forEach((entry) => {
      const key = dayKey(entry.at);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.entries.push(entry);
      else groups.push({ key, entries: [entry] });
    });
    return groups;
  }, [messages, opening, viewer]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (!text || !onSend || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(text);
      setBody('');
    } catch (err) {
      setError(
        err instanceof Error && err.message ? err.message : 'Your message could not be sent.'
      );
    } finally {
      setSending(false);
    }
  };

  const askAbout = (proposal: AgencyProposalSummary) => {
    if (!canReply || !onSend) return;
    const reference = proposal.quote?.number ?? proposal.trip.title;
    setBody((current) => (current.trim() ? current : `A question about ${reference}: `));
    inputRef.current?.focus();
  };

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="max-h-[55vh] min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 lg:max-h-none">
        {days.map((group, index) => (
          <React.Fragment key={`${group.key ?? 'undated'}-${index}`}>
            {group.key ? (
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border/70" aria-hidden />
                <span className="text-[11px] font-medium text-muted-foreground">
                  {dayLabel(group.key)}
                </span>
                <span className="h-px flex-1 bg-border/70" aria-hidden />
              </div>
            ) : null}

            {group.entries.map((entry) => (
              <div
                key={entry.id}
                className={cn('flex items-start gap-2', entry.mine ? 'justify-end' : 'justify-start')}
              >
                {!entry.mine ? (
                  <AgencyLogoTile
                    name={agency.name}
                    logoUrl={agency.logoUrl ?? null}
                    className="mt-0.5 h-8 w-8 rounded-lg text-[11px]"
                  />
                ) : null}
                <div className={cn('min-w-0 max-w-[85%] sm:max-w-[75%]', entry.mine && 'text-right')}>
                  <div
                    className={cn(
                      'rounded-2xl px-3.5 py-2.5 text-left text-xs leading-relaxed',
                      entry.mine
                        ? 'bg-primary/10 text-foreground'
                        : 'border border-border/60 bg-muted/70 text-foreground'
                    )}
                  >
                    <p className="whitespace-pre-line break-words">{entry.body}</p>
                  </div>
                  <div
                    className={cn(
                      'mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground',
                      entry.mine ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {!entry.mine ? (
                      <span className="font-semibold text-foreground/70">{entry.author}</span>
                    ) : null}
                    {entry.label ? (
                      <span className="rounded-full border border-border/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
                        {entry.label}
                      </span>
                    ) : null}
                    {entry.at ? <span>{timeLabel(entry.at)}</span> : null}
                    {entry.read !== undefined ? (
                      <span className="inline-flex items-center gap-1">
                        {entry.read ? (
                          <>
                            <CheckCheck className="h-3 w-3 text-primary" aria-hidden />
                            <span>Seen</span>
                          </>
                        ) : (
                          <>
                            <Check className="h-3 w-3" aria-hidden />
                            <span>Sent</span>
                          </>
                        )}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </React.Fragment>
        ))}

        {messages.length === 0 ? (
          <p className="flex items-center justify-center gap-1.5 py-6 text-[11px] text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            {emptyHint}
          </p>
        ) : null}

        {proposals.length > 0 ? (
          <div className="space-y-2 sm:pl-10">
            {proposals.map((proposal) => (
              <ProposalAttachment
                key={proposal.id}
                proposal={proposal}
                party={party}
                dates={dates}
                onPreview={onPreviewProposal}
                onAsk={canReply && onSend ? () => askAbout(proposal) : undefined}
                onAccept={onAcceptProposal}
                onDecline={onDeclineProposal}
              />
            ))}
          </div>
        ) : null}

        <div ref={endRef} />
      </div>

      {canReply && onSend ? (
        <form
          className="shrink-0 border-t border-border/70 bg-card px-3 py-3 sm:px-4"
          onSubmit={submit}
        >
          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled
              title="Attachments are not available on enquiries yet"
              aria-label="Attachments are not available on enquiries yet"
              className="h-10 w-10 shrink-0 rounded-full border-border/70 text-muted-foreground"
            >
              <Paperclip className="h-4 w-4" aria-hidden />
            </Button>
            <Textarea
              ref={inputRef}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={placeholder}
              aria-label={placeholder}
              maxLength={MAX_BODY}
              rows={1}
              disabled={sending}
              className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl border-border/70 py-2.5 text-xs"
            />
            <Button
              type="submit"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full"
              aria-label="Send message"
              disabled={sending || !body.trim()}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
            </Button>
          </div>
          {body.length > 0 || error ? (
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 px-1">
              {error ? (
                <p className="text-[11px] font-semibold text-destructive">{error}</p>
              ) : (
                <span />
              )}
              {body.length > 0 ? (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {body.length}/{MAX_BODY}
                </span>
              ) : null}
            </div>
          ) : null}
        </form>
      ) : (
        <p className="shrink-0 border-t border-border/70 px-4 py-3 text-[11px] text-muted-foreground">
          This conversation no longer accepts new replies.
        </p>
      )}

      {footer}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  The signed-in thread pane                                                 */
/* -------------------------------------------------------------------------- */

interface EnquiryThreadPaneProps {
  enquiryId: string;
  /** Mobile-only: closes the pane and returns to the list. */
  onClose: () => void;
  /** The thread cleared its unread count; the list can refresh quietly. */
  onRead?: () => void;
  className?: string;
}

/**
 * One signed-in enquiry thread, rendered beside the inbox list on desktop and
 * on its own on phones. It owns the thread, the proposals and the answer
 * actions, so the page around it only has to remember which row is open.
 */
export const EnquiryThreadPane: React.FC<EnquiryThreadPaneProps> = ({
  enquiryId,
  onClose,
  onRead,
  className,
}) => {
  const [conversation, setConversation] = useState<AgencyConversation | null>(null);
  const [proposals, setProposals] = useState<AgencyProposalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AgencyProposalSummary | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const requestSeq = useRef(0);
  const announcedRead = useRef<string | null>(null);
  // The parent refreshes its list after a read; keeping the callback in a ref
  // means a parent render cannot recreate `load` and re-trigger the fetch.
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  const load = useCallback(
    async (quiet = false) => {
      const seq = ++requestSeq.current;
      if (!quiet) {
        setLoading(true);
        setError(null);
      }
      try {
        const [thread, list] = await Promise.all([
          api.getMyEnquiry(enquiryId),
          api.getMyProposals().catch(() => ({ proposals: [] })),
        ]);
        if (seq !== requestSeq.current) return;
        setConversation(thread.conversation);
        setProposals(
          (list.proposals ?? []).filter((proposal) => proposal.enquiryId === enquiryId)
        );
        setError(null);

        const unread = thread.conversation.unread?.traveller ?? 0;
        if (unread > 0 || announcedRead.current !== enquiryId) {
          notifyEnquiryBadgeChanged();
          announcedRead.current = enquiryId;
          onReadRef.current?.();
        }
      } catch (err) {
        if (seq !== requestSeq.current || quiet) return;
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'This conversation could not be opened.'
        );
        setConversation(null);
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [enquiryId]
  );

  useEffect(() => {
    announcedRead.current = null;
    void load();
  }, [load]);

  useEnquiryLiveRefresh(useCallback(() => load(true), [load]), {
    enabled: true,
    enquiryId,
  });

  const send = async (body: string) => {
    const result = await api.sendMyEnquiryMessage(enquiryId, body);
    setConversation(result.conversation);
    toast.success('Message sent.');
  };

  const acceptProposal = useCallback(
    async (proposal: AgencyProposalSummary) => {
      await api.acceptMyProposal(proposal.id);
      await load(true);
      notifyEnquiryBadgeChanged();
      toast.success(`${proposal.agency.name} has your acceptance.`);
    },
    [load]
  );

  const declineProposal = useCallback(
    async (proposal: AgencyProposalSummary) => {
      await api.declineMyProposal(proposal.id);
      await load(true);
      notifyEnquiryBadgeChanged();
      toast.success('Proposal declined. The conversation stays open.');
    },
    [load]
  );

  const hasLiveProposal = useMemo(
    () =>
      proposals.some(
        (proposal) =>
          !proposal.acceptedAt &&
          !proposal.declinedAt &&
          !proposal.settledByAcceptedTrip
      ),
    [proposals]
  );

  const agencyProfile = useEnquiryAgencyProfile(conversation?.agency.slug);

  const datesLabel = useMemo(() => {
    const dates = conversation?.enquiry.dates;
    if (!dates) return '';
    if (dates.flexible && !dates.start) return 'Flexible dates';
    if (dates.start && dates.end) {
      return `${formatAgencyDate(dates.start)} → ${formatAgencyDate(dates.end)}`;
    }
    return dates.start ? `From ${formatAgencyDate(dates.start)}` : 'No dates given';
  }, [conversation]);

  if (loading) {
    return (
      <div
        className={cn(
          'flex min-h-[320px] items-center justify-center bg-card',
          className
        )}
      >
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs">Opening the conversation…</p>
        </div>
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <div className={cn('bg-card p-8 text-center', className)}>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertCircle className="h-6 w-6" />
        </div>
        <p className="mt-3 text-sm font-semibold text-foreground">Conversation not available</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {error ?? 'This conversation could not be found on your account.'}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          className="mt-4 rounded-full text-xs font-semibold"
        >
          Back to enquiries
        </Button>
      </div>
    );
  }

  const replyTime = agencyReplyTimeLabel(agencyProfile?.replyTimeHours);

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-card', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <AgencyLogoTile
            name={conversation.agency.name}
            logoUrl={agencyProfile?.logoUrl ?? null}
            className="h-10 w-10 rounded-xl text-sm"
          />
          <div className="min-w-0 space-y-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="-ml-2 h-7 rounded-full px-2 text-[11px] font-semibold text-muted-foreground lg:hidden"
            >
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              All enquiries
            </Button>
            <h2 className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold leading-tight tracking-tight text-foreground">
              {conversation.agency.slug ? (
                <Link
                  to={`/agencies/${encodeURIComponent(conversation.agency.slug)}`}
                  className="min-w-0 truncate hover:text-primary hover:underline"
                >
                  {conversation.agency.name}
                </Link>
              ) : (
                <span className="min-w-0 truncate">{conversation.agency.name}</span>
              )}
              <Badge
                variant="outline"
                className={cn(
                  'shrink-0 text-[10px]',
                  travellerEnquiryStatusBadgeClass(conversation.status, hasLiveProposal)
                )}
              >
                {travellerEnquiryStatusLabel(conversation.status, hasLiveProposal)}
              </Badge>
            </h2>
            {replyTime ? (
              <p className="text-[11px] text-muted-foreground">{replyTime}</p>
            ) : null}
            <p className="truncate text-[11px] text-muted-foreground">
              {conversation.enquiry.packageTitle ?? 'General enquiry'} · Sent{' '}
              {conversation.enquiry.createdAt
                ? formatAgencyDate(conversation.enquiry.createdAt)
                : 'recently'}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" aria-hidden />
                {travellersLabel(conversation.enquiry.party)}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" aria-hidden />
                {datesLabel}
              </span>
              {conversation.enquiry.budgetBand ? (
                <span className="inline-flex items-center gap-1">
                  <Wallet className="h-3 w-3" aria-hidden />
                  {AGENCY_ENQUIRY_BUDGET_LABELS[conversation.enquiry.budgetBand]}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {conversation.agency.slug ? (
          <Link
            to={`/agencies/${encodeURIComponent(conversation.agency.slug)}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-1 py-0.5 text-[11px] font-semibold text-primary transition-colors hover:underline"
          >
            View agency
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>

      <EnquiryTimeline
        className="min-h-0 flex-1"
        messages={conversation.messages}
        viewer="traveller"
        opening={{
          authorName: conversation.traveller.name,
          body: conversation.enquiry.message,
          createdAt: conversation.enquiry.createdAt,
        }}
        agency={{
          name: conversation.agency.name,
          logoUrl: agencyProfile?.logoUrl ?? null,
        }}
        canReply={conversation.canReply}
        onSend={send}
        placeholder={`Message ${conversation.agency.name}…`}
        proposals={proposals}
        party={conversation.enquiry.party}
        dates={conversation.enquiry.dates}
        onPreviewProposal={(proposal) => {
          setPreview(proposal);
          setPreviewOpen(true);
        }}
        onAcceptProposal={acceptProposal}
        onDeclineProposal={declineProposal}
        emptyHint="No replies yet. Your message is with the agency."
      />

      {preview ? (
        <ProposalPreviewDialog
          open={previewOpen}
          onOpenChange={(open) => {
            setPreviewOpen(open);
            if (!open) setPreview(null);
          }}
          load={() => api.getMyProposal(preview.id).then((result) => result.proposal)}
          loadPdf={() => api.getMyProposalPdfBlob(preview.id)}
          downloadUrl={api.getMyProposalPdfUrl(preview.id)}
        />
      ) : null}
    </div>
  );
};

export default EnquiryThreadPane;
