import React, { useState } from 'react';
import {
  CheckCircle2,
  FileText,
  Loader2,
  MessageSquare,
  Send,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import ProposalAnswer from '@/components/proposals/ProposalAnswer';
import { formatMoney } from '@/lib/currency';
import { formatDate, formatDateOnly } from '@/lib/date';
import { proposalAnswerState } from '@/lib/proposalAnswer';
import { cn } from '@/lib/utils';
import type { AgencyProposalSummary } from '@/types/agency';

/**
 * The traveller's proposal comparison (Milestone 9 D8).
 *
 * Read-only by default: nothing is merged and no trip is created. On the
 * traveller's own surfaces (R6) each open proposal can be accepted or declined
 * in place; the guest link keeps the plain comparison because its capability is
 * the agency's token, not an account.
 */

interface ProposalComparisonProps {
  proposals: AgencyProposalSummary[];
  onPreview: (proposal: AgencyProposalSummary) => void;
  onMessage?: (proposal: AgencyProposalSummary, body: string) => Promise<void>;
  /** Both are passed together on signed-in surfaces; omitted for guests. */
  onAccept?: (proposal: AgencyProposalSummary) => Promise<void>;
  onDecline?: (proposal: AgencyProposalSummary) => Promise<void>;
  empty?: React.ReactNode;
  className?: string;
}

export const ProposalComparison: React.FC<ProposalComparisonProps> = ({
  proposals,
  onPreview,
  onMessage,
  onAccept,
  onDecline,
  empty,
  className,
}) => {
  if (proposals.length === 0) {
    return (
      <div
        className={cn(
          'rounded-3xl border border-dashed border-border/80 p-8 text-center text-xs text-muted-foreground',
          className
        )}
      >
        {empty ?? 'No proposals yet. When an agency sends one, it appears here.'}
      </div>
    );
  }

  return (
    <div className={cn('grid gap-3 md:grid-cols-2 xl:grid-cols-3', className)}>
      {proposals.map((proposal) => (
        <ProposalCard
          key={proposal.id}
          proposal={proposal}
          onPreview={onPreview}
          onMessage={onMessage}
          onAccept={onAccept}
          onDecline={onDecline}
        />
      ))}
    </div>
  );
};

const ProposalCard: React.FC<{
  proposal: AgencyProposalSummary;
  onPreview: (proposal: AgencyProposalSummary) => void;
  onMessage?: (proposal: AgencyProposalSummary, body: string) => Promise<void>;
  onAccept?: (proposal: AgencyProposalSummary) => Promise<void>;
  onDecline?: (proposal: AgencyProposalSummary) => Promise<void>;
}> = ({ proposal, onPreview, onMessage, onAccept, onDecline }) => {
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quote = proposal.quote;
  const { accepted, declined, settled, open } = proposalAnswerState(proposal);

  const statusBadge = accepted
    ? {
        label: 'Accepted',
        tone: 'border-success/30 bg-success/10 text-success-ink dark:border-success/40 dark:bg-success/20',
      }
    : declined
      ? {
          label: 'Declined',
          tone: 'border-destructive/30 bg-destructive/10 text-destructive-ink dark:border-destructive/40 dark:bg-destructive/20',
        }
      : settled
        ? {
            label: 'Another version accepted',
            tone: 'border-border bg-muted text-muted-foreground',
          }
        : quote?.status === 'expired' || quote?.status === 'cancelled'
        ? {
            label: quote.status === 'expired' ? 'Expired' : 'Withdrawn',
            tone: 'border-warning/30 bg-warning/10 text-warning-ink dark:border-warning/40 dark:bg-warning/20',
          }
        : quote?.status === 'sent'
          ? {
              label: 'Awaiting you',
              tone: 'border-info/30 bg-info/10 text-info-ink dark:border-info/40 dark:bg-info/20',
            }
          : { label: 'Proposal', tone: '' };

  const send = async () => {
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
    <div className="flex flex-col gap-3 rounded-3xl border border-border/70 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-overline font-bold text-primary">
            {proposal.agency.name}
          </p>
          <h3 className="truncate text-sm font-bold text-foreground">{proposal.trip.title}</h3>
          {quote ? (
            <p className="text-xs text-muted-foreground">
              {quote.number} · v{quote.version}
            </p>
          ) : null}
        </div>
        <Badge
          variant="outline"
          className={cn('text-xs', statusBadge.tone)}
        >
          {statusBadge.label}
        </Badge>
      </div>

      {quote ? (
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border/60 bg-background/60 p-2.5">
          <div>
            <p className="text-overline font-bold text-muted-foreground">
              Total
            </p>
            <p className="text-sm font-black text-foreground">
              {formatMoney(quote.total, quote.currency)}
            </p>
          </div>
          <div>
            <p className="text-overline font-bold text-muted-foreground">
              Per person
            </p>
            <p className="text-xs font-bold text-foreground">
              {formatMoney(quote.perPerson, quote.currency)}
            </p>
          </div>
          {open ? (
            <div className="col-span-2 text-xs text-muted-foreground">
              {quote.validUntil ? `Price held until ${formatDateOnly(quote.validUntil)}` : 'No expiry given'}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-2 text-xs">
        {quote && quote.inclusions.length > 0 ? (
          <div>
            <p className="text-overline font-bold text-success-ink">
              Included
            </p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {quote.inclusions.slice(0, 4).map((line, index) => (
                <li key={`${line}-${index}`} className="flex gap-1.5">
                  <span className="text-success-ink">✓</span>
                  <span className="line-clamp-2">{line}</span>
                </li>
              ))}
              {quote.inclusions.length > 4 ? (
                <li className="text-xs">+{quote.inclusions.length - 4} more</li>
              ) : null}
            </ul>
          </div>
        ) : null}
        {quote && quote.exclusions.length > 0 ? (
          <div>
            <p className="text-overline font-bold text-destructive-ink">
              Not included
            </p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {quote.exclusions.slice(0, 2).map((line, index) => (
                <li key={`${line}-${index}`} className="flex gap-1.5">
                  <span className="text-destructive-ink">✕</span>
                  <span className="line-clamp-2">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-xl text-xs font-bold gap-1.5"
          onClick={() => onPreview(proposal)}
        >
          <FileText className="h-3.5 w-3.5" />
          {proposal.kind === 'live' ? 'View trip & quote' : 'View document'}
        </Button>
        {onMessage && proposal.enquiryId ? (
          <Button
            type="button"
            size="sm"
            variant={composing ? 'secondary' : 'ghost'}
            className="rounded-xl text-xs font-bold gap-1.5"
            onClick={() => setComposing((value) => !value)}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {sent ? 'Message sent' : 'Ask about this'}
          </Button>
        ) : null}
      </div>

      {declined ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive-ink dark:border-destructive/40 dark:bg-destructive/20">
          You declined this proposal. It stays in this conversation — message{' '}
          {proposal.agency.name} if you want a new version.
        </p>
      ) : null}

      <ProposalAnswer
        proposal={proposal}
        onAccept={onAccept}
        onDecline={onDecline}
        className="border-t border-border/60 pt-2"
      />

      {sent ? (
        <p className="flex items-center gap-1.5 text-xs text-success-ink">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Sent in your conversation with {proposal.agency.name}.
        </p>
      ) : null}

      {composing && onMessage && proposal.enquiryId ? (
        <div className="space-y-2 border-t border-border/60 pt-2">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={`Ask ${proposal.agency.name} about this proposal — dates, inclusions, or the price…`}
            aria-label={`Message ${proposal.agency.name}`}
            maxLength={2000}
            rows={3}
            className="rounded-2xl text-xs"
            disabled={sending}
          />
          {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              className="rounded-xl text-xs font-bold gap-1.5"
              onClick={() => void send()}
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
  );
};

export default ProposalComparison;
