import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Loader2,
  MessageSquare,
  Users,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import ConversationThread from '@/components/directory/ConversationThread';
import ProposalComparison from '@/components/directory/ProposalComparison';
import ProposalPreviewDialog from '@/components/directory/ProposalPreviewDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AGENCY_ENQUIRY_BUDGET_LABELS,
  travellerEnquiryStatusLabel,
  travellerEnquiryStatusBadgeClass,
  formatAgencyDate,
} from '@/lib/agency';
import { cn } from '@/lib/utils';
import { notifyEnquiryBadgeChanged } from '@/lib/enquiryBadge';
import { useEnquiryLiveRefresh } from '@/hooks/useEnquiryEvents';
import { api } from '@/services/api';
import type { AgencyConversation, AgencyProposalSummary } from '@/types/agency';

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
          onRead?.();
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
    [enquiryId, onRead]
  );

  useEffect(() => {
    announcedRead.current = null;
    void load();
  }, [load]);

  const liveMode = useEnquiryLiveRefresh(
    useCallback(() => load(true), [load]),
    { enabled: true, enquiryId }
  );

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
      <div className={cn('flex min-h-[320px] items-center justify-center rounded-2xl border border-border/70 bg-card', className)}>
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs">Opening the conversation…</p>
        </div>
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <div className={cn('rounded-2xl border border-border/70 bg-card p-8 text-center', className)}>
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
          className="mt-4 rounded-xl text-xs font-semibold"
        >
          Back to enquiries
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="rounded-2xl border border-border/70 bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="-ml-2 mb-1 h-8 rounded-lg px-2 text-[11px] font-semibold text-muted-foreground lg:hidden"
            >
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              All enquiries
            </Button>
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
              {conversation.agency.slug ? (
                <Link
                  to={`/agencies/${encodeURIComponent(conversation.agency.slug)}`}
                  className="hover:text-primary hover:underline"
                >
                  {conversation.agency.name}
                </Link>
              ) : (
                conversation.agency.name
              )}
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px]',
                  travellerEnquiryStatusBadgeClass(conversation.status, hasLiveProposal)
                )}
              >
                {travellerEnquiryStatusLabel(conversation.status, hasLiveProposal)}
              </Badge>
              {liveMode === 'live' ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
                  title="Replies appear here as they arrive"
                >
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  Live
                </span>
              ) : null}
            </h2>
            <p className="text-xs text-muted-foreground">
              {conversation.enquiry.packageTitle
                ? `${conversation.enquiry.packageTitle} · `
                : ''}
              Sent{' '}
              {conversation.enquiry.createdAt
                ? formatAgencyDate(conversation.enquiry.createdAt)
                : 'recently'}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" />
            {conversation.enquiry.party.adults}{' '}
            {conversation.enquiry.party.adults === 1 ? 'adult' : 'adults'}
            {conversation.enquiry.party.children > 0
              ? ` · ${conversation.enquiry.party.children} ${
                  conversation.enquiry.party.children === 1 ? 'child' : 'children'
                }`
              : ''}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            {datesLabel}
          </span>
          {conversation.enquiry.budgetBand ? (
            <span className="inline-flex items-center gap-1">
              <Wallet className="h-3 w-3" />
              {AGENCY_ENQUIRY_BUDGET_LABELS[conversation.enquiry.budgetBand]}
            </span>
          ) : null}
        </div>
      </div>

      <Card className="rounded-2xl border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquare className="h-4 w-4 text-primary" />
            Messages
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ConversationThread
            messages={conversation.messages}
            viewer="traveller"
            opening={{
              authorName: conversation.traveller.name,
              body: conversation.enquiry.message,
              createdAt: conversation.enquiry.createdAt,
            }}
            canReply={conversation.canReply}
            onSend={send}
            placeholder={`Message ${conversation.agency.name}…`}
          />
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Proposals to compare</CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Open a document, ask about the price or inclusions on the thread,
            then accept the one you want.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <ProposalComparison
            proposals={proposals}
            className="xl:grid-cols-1"
            onPreview={(proposal) => {
              setPreview(proposal);
              setPreviewOpen(true);
            }}
            onMessage={async (_proposal, body) => {
              await send(body);
            }}
            onAccept={acceptProposal}
            onDecline={declineProposal}
            empty="No proposal has been sent for this enquiry yet. The agency will send one to this thread."
          />
        </CardContent>
      </Card>

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
