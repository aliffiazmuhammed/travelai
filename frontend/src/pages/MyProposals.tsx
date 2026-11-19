import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  Inbox,
  Link2,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Tag,
  X,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { TravellerPageHeader } from '@/components/traveller/TravellerPageHeader';
import { TravellerSegmented } from '@/components/traveller/TravellerSegmented';
import { FilterBar } from '@/components/ui/filter-bar';
import { AgencyLogoTile } from '@/components/directory/AgencyLogoTile';
import ProposalPreviewDialog from '@/components/directory/ProposalPreviewDialog';
import ProposalAnswer from '@/components/proposals/ProposalAnswer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useEnquiryLiveRefresh } from '@/hooks/useEnquiryEvents';
import { notifyEnquiryBadgeChanged } from '@/lib/enquiryBadge';
import { formatMoney } from '@/lib/currency';
import { formatDate, formatDateOnly } from '@/lib/date';
import { proposalAnswerState } from '@/lib/proposalAnswer';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';
import { AsyncErrorPanel, AsyncLiveStatus } from '@/components/states/AsyncState';
import type { AgencyProposalSummary } from '@/types/agency';
import { toast } from 'sonner';

const FILTERS = ['all', 'live', 'accepted', 'declined'] as const;
type ProposalFilter = (typeof FILTERS)[number];

function proposalState(proposal: AgencyProposalSummary): Exclude<ProposalFilter, 'all'> {
  const state = proposalAnswerState(proposal);
  if (state.accepted) return 'accepted';
  if (state.declined) return 'declined';
  if (state.settled) return 'accepted';
  return 'live';
}

/**
 * `/proposals` (Milestone 9 D8).
 *
 * The traveller's comparison surface: every live proposal that answers one of
 * their own enquiries, side by side. There is no merge and no trip creation —
 * the only actions are opening the pinned document and messaging the agency on
 * the thread that proposal belongs to.
 */
const MyProposals: React.FC = () => {
  const [proposals, setProposals] = useState<AgencyProposalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [preview, setPreview] = useState<AgencyProposalSummary | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [filter, setFilter] = useState<ProposalFilter>('all');
  // Newer reads win: a live refresh can start while the first load is in
  // flight, and an older response must never overwrite a fresher list.
  const requestSeq = useRef(0);

  /**
   * `quiet` is the live/poll path: it refreshes in place without the spinner
   * and, on failure, leaves the cards already on screen alone.
   */
  const load = useCallback(async (quiet: boolean) => {
    const seq = ++requestSeq.current;
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await api.getMyProposals();
      if (seq !== requestSeq.current) return;
      setProposals(result.proposals ?? []);
      setError(null);
    } catch (err) {
      if (seq !== requestSeq.current || quiet) return;
      setError(err);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load, reloadKey]);

  // A new proposal or a revised quote reaches this page as it happens (R7).
  const liveMode = useEnquiryLiveRefresh(
    useCallback(() => load(true), [load])
  );

  const send = useCallback(async (proposal: AgencyProposalSummary, body: string) => {
    if (!proposal.enquiryId) {
      throw new Error('This proposal is not linked to a conversation.');
    }
    await api.sendMyEnquiryMessage(proposal.enquiryId, body);
    toast.success(`Message sent to ${proposal.agency.name}.`);
  }, []);

  const accept = useCallback(async (proposal: AgencyProposalSummary) => {
    const result = await api.acceptMyProposal(proposal.id);
    setProposals((rows) =>
      rows.map((row) => {
        if (row.id === proposal.id) {
          return {
            ...row,
            acceptedAt: result.acceptance.acceptedAt,
            quote: row.quote ? { ...row.quote, status: 'accepted' } : row.quote,
          };
        }
        // The trip is settled for its other versions too, exactly as the
        // server will project it on the next read.
        if (row.trip.id === proposal.trip.id) {
          return { ...row, settledByAcceptedTrip: true };
        }
        return row;
      })
    );
    notifyEnquiryBadgeChanged();
    toast.success(`${proposal.agency.name} has your acceptance.`);
  }, []);

  const decline = useCallback(async (proposal: AgencyProposalSummary) => {
    const result = await api.declineMyProposal(proposal.id);
    setProposals((rows) =>
      rows.map((row) =>
        row.id === proposal.id
          ? { ...row, declinedAt: result.decline.declinedAt }
          : row
      )
    );
    notifyEnquiryBadgeChanged();
    toast.success('Proposal declined. The conversation stays open.');
  }, []);

  const agencies = useMemo(
    () =>
      new Set(
        proposals.map((proposal) => proposal.agency.slug || proposal.agency.name)
      ),
    [proposals]
  );

  const counts = useMemo(() => {
    const tally = { all: proposals.length, live: 0, accepted: 0, declined: 0 };
    for (const proposal of proposals) {
      tally[proposalState(proposal)] += 1;
    }
    return tally;
  }, [proposals]);

  const visibleProposals = useMemo(
    () =>
      filter === 'all'
        ? proposals
        : proposals.filter((proposal) => proposalState(proposal) === filter),
    [proposals, filter]
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main-content" tabIndex={-1} className="container mx-auto max-w-6xl px-4 pb-20 pt-24">
        <TravellerPageHeader
          className="mb-8"
          title="Your proposals"
          description="Quotes agencies sent you, in one place."
          crumbs={[{ label: 'Proposals' }]}
          meta={
            liveMode === 'live' ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-semibold text-primary"
                title="New proposals appear here as they arrive"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                Live
              </span>
            ) : null
          }
          actions={
            <>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs font-semibold"
              >
                <Link to="/enquiries">
                  <Inbox className="h-3.5 w-3.5" />
                  Your enquiries
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs font-semibold"
                onClick={() => setReloadKey((key) => key + 1)}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Refresh
              </Button>
            </>
          }
        />

        {!loading && proposals.length > 0 ? (
          <FilterBar
            label="Filter proposals"
            className="mb-6"
            actions={
              <p className="text-xs font-medium text-muted-foreground">
                {proposals.length} proposal{proposals.length === 1 ? '' : 's'} from{' '}
                {agencies.size} agenc{agencies.size === 1 ? 'y' : 'ies'}
              </p>
            }
          >
            <TravellerSegmented<ProposalFilter>
              ariaLabel="Filter proposals"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: counts.all },
                { value: 'live', label: 'Waiting on you', count: counts.live },
                { value: 'accepted', label: 'Accepted', count: counts.accepted },
                { value: 'declined', label: 'Declined', count: counts.declined },
              ]}
            />
          </FilterBar>
        ) : null}

        <AsyncLiveStatus message={loading ? "Loading your proposals…" : null} />

        {error ? (
          <AsyncErrorPanel
            error={error}
            subject="your proposals"
            onRetry={() => setReloadKey((key) => key + 1)}
          />
        ) : loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((card) => (
              <div
                key={card}
                className="h-64 skeleton-shimmer rounded-2xl border border-border/60"
              />
            ))}
          </div>
        ) : proposals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 bg-card p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Inbox className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">No proposals yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
              Send an enquiry from an agency profile. When the agency prepares a
              proposal, it appears here and in the conversation.
            </p>
            <Button asChild size="sm" className="mt-4 gap-1.5 text-xs font-semibold">
              <Link to="/agencies">
                Browse agencies
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        ) : visibleProposals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 bg-card p-10 text-center">
            <p className="text-sm font-semibold text-foreground">
              Nothing waiting in this view
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Accepted and declined proposals stay on the All tab as history.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4 text-xs font-semibold"
              onClick={() => setFilter('all')}
            >
              Show every proposal
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {visibleProposals.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  onPreview={(row) => {
                    setPreview(row);
                    setPreviewOpen(true);
                  }}
                  onMessage={send}
                  onAccept={accept}
                  onDecline={decline}
                />
              ))}
            </div>

            <p className="mt-10 flex items-center justify-center gap-2 border-t border-border/60 pt-6 text-xs text-muted-foreground">
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              Proposals stay linked to their enquiry thread.
            </p>
          </>
        )}
      </main>

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

interface ProposalCardProps {
  proposal: AgencyProposalSummary;
  onPreview: (proposal: AgencyProposalSummary) => void;
  onMessage?: (proposal: AgencyProposalSummary, body: string) => Promise<void>;
  onAccept?: (proposal: AgencyProposalSummary) => Promise<void>;
  onDecline?: (proposal: AgencyProposalSummary) => Promise<void>;
}

/**
 * One proposal as the traveller reads it: who sent it, what it costs, and the
 * one decision that matters. The answer is two-step (ask, then confirm) for
 * both accept and decline, exactly as before.
 */
const ProposalCard: React.FC<ProposalCardProps> = ({
  proposal,
  onPreview,
  onMessage,
  onAccept,
  onDecline,
}) => {
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quote = proposal.quote;
  const { accepted, declined, settled, open } = proposalAnswerState(proposal);
  const canMessage = Boolean(onMessage && proposal.enquiryId);

  const badge = accepted
    ? {
        label: 'Accepted',
        className: 'border-transparent bg-accent/10 text-accent-ink',
        icon: <CheckCircle2 className="h-3 w-3" />,
      }
    : declined
      ? {
          label: 'Declined',
          className: 'border-transparent bg-muted text-muted-foreground',
          icon: <X className="h-3 w-3" />,
        }
      : settled
        ? {
            label: 'Another version accepted',
            className: 'border-border bg-muted text-muted-foreground',
            icon: null,
          }
        : quote?.status === 'expired'
          ? {
              label: 'Expired',
              className: 'border-border bg-muted text-muted-foreground',
              icon: null,
            }
          : quote?.status === 'cancelled'
            ? {
                label: 'Withdrawn',
                className: 'border-border bg-muted text-muted-foreground',
                icon: null,
              }
            : {
                label: 'New',
                className: 'border-transparent bg-primary/10 text-primary',
                icon: <span className="h-1.5 w-1.5 rounded-full bg-primary" />,
              };

  const sendMessage = async () => {
    if (!onMessage || !body.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await onMessage(proposal, body.trim());
      setBody('');
      setComposing(false);
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Your message could not be sent.'
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <article className="flex h-full flex-col gap-4 rounded-2xl border border-border/70 bg-card p-5 shadow-card sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AgencyLogoTile name={proposal.agency.name} className="h-11 w-11 text-sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {proposal.agency.name}
            </p>
            {quote ? (
              <p className="text-xs text-muted-foreground">
                {proposal.kind === 'live' ? 'Live proposal' : 'Proposal document'}
              </p>
            ) : null}
          </div>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
            badge.className
          )}
        >
          {badge.icon}
          {badge.label}
        </span>
      </div>

      <h2 className="font-display text-xl font-semibold leading-snug tracking-tight text-foreground sm:text-2xl">
        {proposal.trip.title}
      </h2>

      {quote ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5" aria-hidden="true" />
            {quote.number} · v{quote.version}
          </span>
          {quote.validUntil && open ? (
            <span>· Price held until {formatDateOnly(quote.validUntil)}</span>
          ) : null}
        </div>
      ) : null}

      <div className="border-t border-border/70 pt-4">
        {quote ? (
          <>
            <p className="text-overline font-semibold text-muted-foreground">
              Total
            </p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
              {formatMoney(quote.total, quote.currency)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatMoney(quote.perPerson, quote.currency)} per person
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Pricing is inside the linked document.
          </p>
        )}
      </div>

      <div className="mt-auto space-y-3">
        {accepted ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/20 bg-accent/10 px-3.5 py-3">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-accent-ink">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {proposal.acceptedAt
                ? `Accepted on ${formatDate(proposal.acceptedAt)}`
                : 'Accepted'}
            </span>
            <button
              type="button"
              onClick={() => onPreview(proposal)}
              className="inline-flex items-center gap-1.5 rounded-md px-1 text-xs font-semibold text-accent-ink transition-colors hover:text-accent-ink/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              See the trip
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : declined ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <X className="h-3.5 w-3.5 shrink-0" />
              You declined this quote
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs font-semibold text-primary hover:text-primary"
              onClick={() => onPreview(proposal)}
            >
              View proposal
            </Button>
          </div>
        ) : settled ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Another version of this trip was accepted.
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs font-semibold text-primary hover:text-primary"
              onClick={() => onPreview(proposal)}
            >
              View proposal
            </Button>
          </div>
        ) : quote?.status === 'expired' || quote?.status === 'cancelled' ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {quote.status === 'expired'
                ? 'This quote has expired.'
                : 'This proposal was withdrawn.'}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs font-semibold text-primary hover:text-primary"
              onClick={() => onPreview(proposal)}
            >
              View proposal
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs font-semibold"
              onClick={() => onPreview(proposal)}
            >
              <Eye className="h-3.5 w-3.5" />
              View proposal
            </Button>
            {canMessage ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn(
                  'ml-auto gap-1.5 text-xs font-semibold text-muted-foreground',
                  composing && 'text-foreground'
                )}
                onClick={() => setComposing((value) => !value)}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {sent ? 'Message sent' : 'Ask a question'}
              </Button>
            ) : null}
          </div>
        )}

        <ProposalAnswer
          proposal={proposal}
          onAccept={onAccept}
          onDecline={onDecline}
        />

        {(accepted || declined || settled) && canMessage && !composing && !sent ? (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Ask {proposal.agency.name} a question
          </button>
        ) : null}

        {sent ? (
          <p className="flex items-center gap-1.5 text-xs text-accent-ink">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Sent in your conversation with {proposal.agency.name}.
          </p>
        ) : null}

        {composing && canMessage ? (
          <div className="space-y-2">
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={`Ask ${proposal.agency.name} about this proposal — dates, inclusions, or the price…`}
              aria-label={`Message ${proposal.agency.name}`}
              maxLength={2000}
              rows={3}
              className="rounded-xl text-xs"
              disabled={sending}
            />
            {error ? (
              <p className="text-xs font-medium text-destructive">{error}</p>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-xs font-semibold text-muted-foreground"
                onClick={() => setComposing(false)}
                disabled={sending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1.5 text-xs font-semibold"
                onClick={() => void sendMessage()}
                disabled={sending || !body.trim()}
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Send message
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
};

export default MyProposals;
