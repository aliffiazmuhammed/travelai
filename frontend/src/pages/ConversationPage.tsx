import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  FileText,
  Loader2,
  Lock,
  MessageSquare,
  Users,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import Navbar from '@/components/Navbar';
import { TravellerBreadcrumbs } from '@/components/traveller/TravellerBreadcrumbs';
import {
  EnquiryTimeline,
  agencyReplyTimeLabel,
  useEnquiryAgencyProfile,
} from '@/components/traveller/EnquiryThreadPane';
import { AgencyLogoTile } from '@/components/directory/AgencyLogoTile';
import { TripCover } from '@/components/gallery/TripCover';
import ProposalPreviewDialog from '@/components/directory/ProposalPreviewDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

/**
 * One enquiry conversation (Milestone 9 D8), reached two ways:
 *
 * - `/conversation/:token` — the guest's private link. No account, the token is
 *   the capability, and the page shows the same thread the agency sees.
 * - `/enquiry/:enquiryId` — a signed-in traveller's own thread, linked from the
 *   enquiries list and the proposal comparison.
 *
 * The trip summary sits on the left, the conversation on the right, and the
 * proposals that answer this enquiry sit in the thread itself, so a quote is
 * read where it arrived.
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

  // B3: "Proposal ready" is a promise, so it counts what the traveller can
  // still answer. A declined or already-settled version is history, not an
  // invitation, and counting it left the badge lying after a decline.
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

  const durationLabel = useMemo(() => {
    const dates = conversation?.enquiry.dates;
    if (!dates?.start || !dates.end) return '';
    const start = new Date(dates.start).getTime();
    const end = new Date(dates.end).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return '';
    const nights = Math.round((end - start) / 86400000);
    return `${nights + 1} days`;
  }, [conversation]);

  const agencyProfile = useEnquiryAgencyProfile(conversation?.agency.slug);

  // The newest share is what "Open trip" should show; older versions stay in
  // the thread as history.
  const newestProposal = useMemo(() => {
    if (proposals.length === 0) return null;
    return [...proposals].sort(
      (a, b) =>
        new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
    )[0];
  }, [proposals]);

  const openPreview = (proposal: AgencyProposalSummary) => {
    setPreview(proposal);
    setPreviewOpen(true);
  };

  const replyTime = agencyReplyTimeLabel(agencyProfile?.replyTimeHours);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto max-w-6xl px-4 pb-16 pt-24">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="mt-2 text-xs">Opening the conversation…</p>
          </div>
        ) : error || !conversation ? (
          <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-border/80 bg-card p-8 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertCircle className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h1 className="font-display text-xl font-semibold text-foreground">
                Conversation not available
              </h1>
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
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TravellerBreadcrumbs
                items={
                  guest
                    ? [{ label: 'Private conversation' }]
                    : [
                        { label: 'Enquiries', to: '/enquiries' },
                        { label: conversation.agency.name },
                      ]
                }
              />
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                Secure conversation
              </span>
            </div>

            {!guest ? (
              <Link
                to="/enquiries"
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-primary"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                All enquiries
              </Link>
            ) : null}

            <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-start">
              <aside
                aria-label="Trip summary"
                className="min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm lg:sticky lg:top-24"
              >
                <TripCover
                  title={conversation.enquiry.packageTitle ?? 'Your trip enquiry'}
                  width={800}
                />
                <div className="space-y-3 p-4 sm:p-5">
                  <div className="space-y-1">
                    <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight text-foreground">
                      {conversation.enquiry.packageTitle ?? 'Your trip enquiry'}
                    </h1>
                    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span>
                        {datesLabel}
                        {durationLabel ? ` (${durationLabel})` : ''}
                      </span>
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span>
                        {conversation.enquiry.party.adults}{' '}
                        {conversation.enquiry.party.adults === 1 ? 'adult' : 'adults'}
                        {conversation.enquiry.party.children > 0
                          ? ` · ${conversation.enquiry.party.children} ${
                              conversation.enquiry.party.children === 1
                                ? 'child'
                                : 'children'
                            }`
                          : ''}
                      </span>
                    </p>
                    {conversation.enquiry.budgetBand ? (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span>
                          {AGENCY_ENQUIRY_BUDGET_LABELS[conversation.enquiry.budgetBand]}
                        </span>
                      </p>
                    ) : null}
                    <p className="flex items-start gap-1.5 pt-0.5 text-xs text-muted-foreground">
                      <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0">
                        With{' '}
                        {conversation.agency.slug ? (
                          <Link
                            to={`/agencies/${encodeURIComponent(conversation.agency.slug)}`}
                            className="font-semibold text-foreground hover:text-primary hover:underline"
                          >
                            {conversation.agency.name}
                          </Link>
                        ) : (
                          <span className="font-semibold text-foreground">
                            {conversation.agency.name}
                          </span>
                        )}
                        {agencyProfile?.verified ? (
                          <span className="ml-1 inline-flex align-[-2px] text-primary">
                            <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                            <span className="sr-only">Verified agency</span>
                          </span>
                        ) : null}
                      </span>
                    </p>
                  </div>

                  <div className="border-t border-border/70 pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Enquiry status
                    </p>
                    <Badge
                      variant="outline"
                      className={cn(
                        'mt-2 h-7 gap-1.5 px-3 text-[11px]',
                        travellerEnquiryStatusBadgeClass(
                          conversation.status,
                          hasLiveProposal
                        )
                      )}
                    >
                      <MessageSquare className="h-3 w-3" aria-hidden />
                      {travellerEnquiryStatusLabel(
                        conversation.status,
                        hasLiveProposal
                      )}
                    </Badge>
                  </div>

                  <div className="border-t border-border/70 pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full rounded-xl border-primary/40 text-xs font-semibold text-primary hover:bg-primary/5 hover:text-primary"
                      onClick={() => newestProposal && openPreview(newestProposal)}
                      disabled={!newestProposal}
                      title={
                        newestProposal
                          ? undefined
                          : 'The agency has not shared a trip for this enquiry yet'
                      }
                    >
                      <FileText className="mr-1.5 h-4 w-4" />
                      Open trip
                    </Button>
                  </div>

                  <p className="pt-1 text-center text-[10px] text-muted-foreground">
                    One thread, from first idea to final plan.
                  </p>
                </div>
              </aside>

              <section
                aria-label="Conversation"
                className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm lg:h-[calc(100dvh-13rem)] lg:max-h-[46rem]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-3.5 sm:px-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <AgencyLogoTile
                      name={conversation.agency.name}
                      logoUrl={agencyProfile?.logoUrl ?? null}
                      className="h-10 w-10 rounded-xl text-sm"
                    />
                    <div className="min-w-0 space-y-0.5">
                      <h2 className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold leading-tight tracking-tight text-foreground">
                        {conversation.agency.slug ? (
                          <Link
                            to={`/agencies/${encodeURIComponent(conversation.agency.slug)}`}
                            className="min-w-0 truncate hover:text-primary hover:underline"
                          >
                            {conversation.agency.name}
                          </Link>
                        ) : (
                          <span className="min-w-0 truncate">
                            {conversation.agency.name}
                          </span>
                        )}
                        {!guest && liveMode === 'live' ? (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent"
                            title="Replies appear here as they arrive"
                          >
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                            Live
                          </span>
                        ) : null}
                      </h2>
                      {replyTime ? (
                        <p className="text-[11px] text-muted-foreground">{replyTime}</p>
                      ) : null}
                      <p className="text-[11px] text-muted-foreground">
                        Enquiry sent{' '}
                        {conversation.enquiry.createdAt
                          ? formatAgencyDate(conversation.enquiry.createdAt)
                          : 'recently'}
                        {conversation.enquiry.packageTitle
                          ? ` · ${conversation.enquiry.packageTitle}`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                    {conversation.messages.length}{' '}
                    {conversation.messages.length === 1 ? 'message' : 'messages'}
                  </span>
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
                  placeholder="Write a reply…"
                  proposals={proposals}
                  party={conversation.enquiry.party}
                  dates={conversation.enquiry.dates}
                  onPreviewProposal={openPreview}
                  onAcceptProposal={guest ? undefined : acceptProposal}
                  onDeclineProposal={guest ? undefined : declineProposal}
                  emptyHint="No replies yet. Your enquiry is with the agency."
                  footer={
                    <p className="flex flex-wrap items-center justify-center gap-1.5 px-4 pb-3 text-center text-[10px] text-muted-foreground">
                      <Lock className="h-3 w-3 shrink-0" aria-hidden />
                      Replies are private between you and the agency.
                      {guest && conversation.expiresAt
                        ? ` This link works until ${formatAgencyDate(conversation.expiresAt)}.`
                        : ''}
                    </p>
                  }
                />
              </section>
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
