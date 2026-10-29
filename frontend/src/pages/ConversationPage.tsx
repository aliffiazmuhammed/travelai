import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowUpRight, CalendarDays, Loader2, MessageSquare, ShieldCheck, Users, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import Navbar from '@/components/Navbar';
import ConversationThread from '@/components/directory/ConversationThread';
import ProposalComparison from '@/components/directory/ProposalComparison';
import ProposalPreviewDialog from '@/components/directory/ProposalPreviewDialog';
import { Badge } from '@/components/ui/badge';
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
import type {
  AgencyConversation,
  AgencyProposalSummary,
} from '@/types/agency';

/**
 * One enquiry conversation (Milestone 9 D8), reached two ways:
 *
 * - `/conversation/:token` — the guest's private link. No account, the token is
 *   the capability, and the page shows the same thread the agency sees.
 * - `/enquiry/:enquiryId` — a signed-in traveller's own thread, linked from the
 *   enquiries list and the proposal comparison.
 *
 * Both modes share the comparison surface: proposals tied to this enquiry sit
 * beside the thread, and a question about one is sent into the same thread.
 */
const ConversationPage: React.FC = () => {
  const { token, enquiryId } = useParams<{ token?: string; enquiryId?: string }>();
  const guest = Boolean(token);

  const [conversation, setConversation] = useState<AgencyConversation | null>(null);
  const [proposals, setProposals] = useState<AgencyProposalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AgencyProposalSummary | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  // A quiet live refresh may overlap the first load; an older read must not
  // overwrite a newer thread.
  const requestSeq = useRef(0);
  // Opening this thread clears its unread count server-side; the navbar badge
  // is told once per transition instead of on every quiet poll.
  const unreadRef = useRef<number | null>(null);

  const load = useCallback(async (quiet = false) => {
    const seq = ++requestSeq.current;
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    try {
      let next: {
        conversation: AgencyConversation;
        proposals: AgencyProposalSummary[];
      };
      if (guest && token) {
        const [thread, list] = await Promise.all([
          api.getConversation(token),
          api.getConversationProposals(token).catch(() => ({ proposals: [] })),
        ]);
        next = {
          conversation: thread.conversation,
          proposals: list.proposals ?? [],
        };
      } else if (enquiryId) {
        const [thread, list] = await Promise.all([
          api.getMyEnquiry(enquiryId),
          api.getMyProposals().catch(() => ({ proposals: [] })),
        ]);
        next = {
          conversation: thread.conversation,
          proposals: (list.proposals ?? []).filter(
            (proposal) => proposal.enquiryId === enquiryId
          ),
        };
      } else {
        throw new Error('This conversation link is incomplete.');
      }
      if (seq !== requestSeq.current) return;
      setConversation(next.conversation);
      setProposals(next.proposals);
      if (quiet) setError(null);
      if (!guest) {
        const unread = next.conversation.unread?.traveller ?? 0;
        // `null` on the first read: the navbar may have counted before this
        // request's receipt landed, so its pill needs one catch-up read.
        if (unreadRef.current !== 0) notifyEnquiryBadgeChanged();
        unreadRef.current = unread;
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
      // Clear the spinner even when a fresher quiet read already won the race.
      if (!quiet) setLoading(false);
    }
  }, [enquiryId, guest, token]);

  useEffect(() => {
    void load();
  }, [load]);

  // M9 R2: replies, receipts, status changes and new proposals arrive live.
  // The guest link has no account channel, so it keeps its plain reads.
  const liveMode = useEnquiryLiveRefresh(
    useCallback(() => load(true), [load]),
    { enabled: !guest && Boolean(enquiryId), enquiryId }
  );

  const send = async (body: string) => {
    const result =
      guest && token
        ? await api.sendConversationMessage(token, body)
        : await api.sendMyEnquiryMessage(String(enquiryId), body);
    setConversation(result.conversation);
    toast.success('Message sent.');
  };

  // R6: the thread answers a proposal in place, then re-reads the thread so the
  // status badge and the proposal card agree with the server.
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

  const datesLabel = useMemo(() => {
    const dates = conversation?.enquiry.dates;
    if (!dates) return '';
    if (dates.flexible && !dates.start) return 'Flexible dates';
    if (dates.start && dates.end) {
      return `${formatAgencyDate(dates.start)} → ${formatAgencyDate(dates.end)}`;
    }
    return dates.start ? `From ${formatAgencyDate(dates.start)}` : 'No dates given';
  }, [conversation]);

  return (
    <div className="min-h-screen bg-gradient-hero">
      <Navbar />
      <main className="container mx-auto max-w-6xl px-4 pb-20 pt-24">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="mt-2 text-xs">Opening the conversation…</p>
          </div>
        ) : error || !conversation ? (
          <div className="mx-auto max-w-lg space-y-4 rounded-3xl border border-border/80 bg-card/80 p-8 text-center shadow-card">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertCircle className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-black text-foreground">Conversation not available</h1>
              <p className="text-xs text-muted-foreground">
                {error ??
                  (guest
                    ? 'This private link may have expired. Ask the agency to send a fresh one from your enquiry.'
                    : 'This conversation could not be found on your account.')}
              </p>
            </div>
            <Link
              to={guest ? '/agencies' : '/enquiries'}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
            >
              {guest ? 'Browse agencies' : 'Back to your enquiries'}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {!guest ? (
              <Link
                to="/enquiries"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground transition-colors hover:text-primary"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                All enquiries
              </Link>
            ) : null}
            <div className="flex flex-col gap-3 rounded-3xl border border-border/80 bg-card/80 p-5 shadow-card sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                  {guest ? 'Private conversation' : 'Your conversation'}
                </p>
                <h1 className="flex flex-wrap items-center gap-2 text-2xl font-black text-foreground">
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
                      travellerEnquiryStatusBadgeClass(
                        conversation.status,
                        proposals.length > 0
                      )
                    )}
                  >
                    {travellerEnquiryStatusLabel(
                      conversation.status,
                      proposals.length > 0
                    )}
                  </Badge>
                  {liveMode === 'live' ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary"
                      title="Replies appear here as they arrive"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                      Live
                    </span>
                  ) : null}
                </h1>
                <p className="text-xs text-muted-foreground">
                  Enquiry sent{' '}
                  {conversation.enquiry.createdAt
                    ? formatAgencyDate(conversation.enquiry.createdAt)
                    : 'recently'}{' '}
                  · replies stay on this thread
                </p>
              </div>
              {guest ? (
                <div className="max-w-xs rounded-2xl border border-primary/20 bg-primary/5 p-3 text-[11px] text-muted-foreground">
                  <p className="flex items-center gap-1.5 font-bold text-primary">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Keep this link private
                  </p>
                  <p className="mt-1">
                    Anyone with it can read and reply to this conversation.
                    {conversation.expiresAt
                      ? ` It works until ${formatAgencyDate(conversation.expiresAt)}.`
                      : ''}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <Card className="rounded-3xl border-border/70">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    Messages
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
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
                    {conversation.enquiry.packageTitle ? (
                      <Badge variant="secondary" className="max-w-[220px] truncate text-[10px]">
                        {conversation.enquiry.packageTitle}
                      </Badge>
                    ) : null}
                  </div>

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

              <Card className="rounded-3xl border-border/70">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Proposals to compare</CardTitle>
                  <p className="text-[11px] text-muted-foreground">
                    Nothing is merged automatically. Open a document, ask about
                    the price or inclusions on the thread, then accept the one
                    you want.
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
                    onAccept={guest ? undefined : acceptProposal}
                    onDecline={guest ? undefined : declineProposal}
                    empty="No proposal has been sent for this enquiry yet. The agency will send one to this thread."
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>

      {preview ? (
        <ProposalPreviewDialog
          open={previewOpen}
          onOpenChange={(open) => {
            setPreviewOpen(open);
            if (!open) setPreview(null);
          }}
          load={() =>
            guest && token
              ? api.getConversationProposal(token, preview.id).then((result) => result.proposal)
              : api.getMyProposal(preview.id).then((result) => result.proposal)
          }
          loadPdf={() =>
            guest && token
              ? api.getConversationProposalPdfBlob(token, preview.id)
              : api.getMyProposalPdfBlob(preview.id)
          }
          downloadUrl={
            guest && token
              ? api.getConversationProposalPdfUrl(token, preview.id)
              : api.getMyProposalPdfUrl(preview.id)
          }
        />
      ) : null}
    </div>
  );
};

export default ConversationPage;
