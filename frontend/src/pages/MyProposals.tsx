import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Inbox, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { TravellerPageHeader } from '@/components/traveller/TravellerPageHeader';
import { TravellerSegmented } from '@/components/traveller/TravellerSegmented';
import ProposalComparison from '@/components/directory/ProposalComparison';
import ProposalPreviewDialog from '@/components/directory/ProposalPreviewDialog';
import { Button } from '@/components/ui/button';
import { useEnquiryLiveRefresh } from '@/hooks/useEnquiryEvents';
import { notifyEnquiryBadgeChanged } from '@/lib/enquiryBadge';
import { api } from '@/services/api';
import type { AgencyProposalSummary } from '@/types/agency';
import { toast } from 'sonner';

const FILTERS = ['all', 'live', 'accepted', 'declined'] as const;
type ProposalFilter = (typeof FILTERS)[number];

function proposalState(proposal: AgencyProposalSummary): Exclude<ProposalFilter, 'all'> {
  if (proposal.acceptedAt) return 'accepted';
  if (proposal.declinedAt) return 'declined';
  if (proposal.settledByAcceptedTrip) return 'accepted';
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
  const [error, setError] = useState<string | null>(null);
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
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Your proposals could not be loaded right now.'
      );
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
      <main className="container mx-auto max-w-6xl px-4 pb-20 pt-24">
        <TravellerPageHeader
          eyebrow="Compare and choose"
          icon={Sparkles}
          title="Your proposals"
          description="Every proposal an agency sent in answer to your enquiries, side by side. Compare the price and what is included, open the full document, ask a question, then accept the one you want — nothing is booked or charged here."
          crumbs={[{ label: 'Proposals' }]}
          meta={
            liveMode === 'live' ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
                title="New proposals appear here as they arrive"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                Live
              </span>
            ) : null
          }
          actions={
            <>
              <Button asChild variant="outline" size="sm" className="rounded-xl text-xs font-semibold gap-1.5">
                <Link to="/enquiries">
                  <Inbox className="h-3.5 w-3.5" />
                  Your enquiries
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl text-xs font-semibold gap-1.5"
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
          className="mb-5"
        />

        {!loading && proposals.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
            <p className="text-[11px] font-semibold text-muted-foreground">
              {proposals.length} proposal{proposals.length === 1 ? '' : 's'} from{' '}
              {agencies.size} agenc{agencies.size === 1 ? 'y' : 'ies'} · nothing is
              booked or merged
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold text-destructive">{error}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-xl text-xs font-semibold"
                onClick={() => setReloadKey((key) => key + 1)}
              >
                Try again
              </Button>
            </div>
          </div>
        ) : loading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {[0, 1].map((card) => (
              <div
                key={card}
                className="h-56 animate-pulse rounded-2xl border border-border/60 bg-card"
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
            <Button asChild size="sm" className="mt-4 rounded-xl text-xs font-semibold gap-1.5">
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
              className="mt-4 rounded-xl text-xs font-semibold"
              onClick={() => setFilter('all')}
            >
              Show every proposal
            </Button>
          </div>
        ) : (
          <ProposalComparison
            proposals={visibleProposals}
            onPreview={(proposal) => {
              setPreview(proposal);
              setPreviewOpen(true);
            }}
            onMessage={send}
            onAccept={accept}
            onDecline={decline}
          />
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

export default MyProposals;
