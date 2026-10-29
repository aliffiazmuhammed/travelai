import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Inbox, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import Navbar from '@/components/Navbar';
import ProposalComparison from '@/components/directory/ProposalComparison';
import ProposalPreviewDialog from '@/components/directory/ProposalPreviewDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/services/api';
import type { AgencyProposalSummary } from '@/types/agency';
import { toast } from 'sonner';

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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await api.getMyProposals();
        if (!cancelled) setProposals(result.proposals ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error && err.message
              ? err.message
              : 'Your proposals could not be loaded right now.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const send = useCallback(async (proposal: AgencyProposalSummary, body: string) => {
    if (!proposal.enquiryId) {
      throw new Error('This proposal is not linked to a conversation.');
    }
    await api.sendMyEnquiryMessage(proposal.enquiryId, body);
    toast.success(`Message sent to ${proposal.agency.name}.`);
  }, []);

  const agencies = new Set(proposals.map((proposal) => proposal.agency.slug || proposal.agency.name));

  return (
    <div className="min-h-screen bg-gradient-hero">
      <Navbar />
      <main className="container mx-auto max-w-6xl px-4 pb-20 pt-24">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
              Compare and choose
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-black tracking-tight text-foreground">
              <Sparkles className="h-5 w-5 text-primary" />
              Your proposals
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Every proposal an agency sent in answer to your enquiries, side by
              side. Compare the price and what is included, open the full
              document, then message the agency with any question.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-xl text-xs font-bold gap-1.5">
              <Link to="/enquiries">
                <Inbox className="h-3.5 w-3.5" />
                Your enquiries
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl text-xs font-bold gap-1.5"
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
          </div>
        </div>

        {!loading && proposals.length > 0 ? (
          <div className="mb-5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-full border border-border/70 bg-card px-2.5 py-1 font-bold text-foreground">
              {proposals.length} proposal{proposals.length === 1 ? '' : 's'}
            </span>
            <span className="rounded-full border border-border/70 bg-card px-2.5 py-1 font-bold text-foreground">
              {agencies.size} agenc{agencies.size === 1 ? 'y' : 'ies'}
            </span>
            <span>Nothing is booked or merged — compare, ask, then decide.</span>
          </div>
        ) : null}

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
          <div className="flex items-center justify-center gap-2 py-24 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Gathering your proposals…
          </div>
        ) : proposals.length === 0 ? (
          <Card className="rounded-3xl border-dashed border-border/80">
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Inbox className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-foreground">No proposals yet</p>
                <p className="mx-auto max-w-md text-xs text-muted-foreground">
                  Send an enquiry from an agency profile. When the agency
                  prepares a proposal, it appears here and in the conversation.
                </p>
              </div>
              <Button asChild size="sm" className="rounded-xl text-xs font-bold gap-1.5">
                <Link to="/agencies">
                  Browse agencies
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ProposalComparison
            proposals={proposals}
            onPreview={(proposal) => {
              setPreview(proposal);
              setPreviewOpen(true);
            }}
            onMessage={send}
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
