import React, { useState } from 'react';
import { CheckCircle2, FileText, Loader2, MessageSquare, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatMoney } from '@/lib/currency';
import { formatDate } from '@/lib/date';
import { cn } from '@/lib/utils';
import type { AgencyProposalSummary } from '@/types/agency';

/**
 * The traveller's proposal comparison (Milestone 9 D8).
 *
 * Deliberately read-only and side-by-side: nothing is merged and no trip is
 * created. A row can open the pinned document or start a message on the thread
 * that proposal answers, which is the "the price is high" path the agency sees
 * in its inbox.
 */

interface ProposalComparisonProps {
  proposals: AgencyProposalSummary[];
  onPreview: (proposal: AgencyProposalSummary) => void;
  onMessage?: (proposal: AgencyProposalSummary, body: string) => Promise<void>;
  empty?: React.ReactNode;
  className?: string;
}

export const ProposalComparison: React.FC<ProposalComparisonProps> = ({
  proposals,
  onPreview,
  onMessage,
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
        />
      ))}
    </div>
  );
};

const ProposalCard: React.FC<{
  proposal: AgencyProposalSummary;
  onPreview: (proposal: AgencyProposalSummary) => void;
  onMessage?: (proposal: AgencyProposalSummary, body: string) => Promise<void>;
}> = ({ proposal, onPreview, onMessage }) => {
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quote = proposal.quote;
  const accepted = Boolean(proposal.acceptedAt) || quote?.status === 'accepted';

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
          <p className="text-[10px] font-bold uppercase tracking-wide text-primary">
            {proposal.agency.name}
          </p>
          <h3 className="truncate text-sm font-bold text-foreground">{proposal.trip.title}</h3>
          {quote ? (
            <p className="text-[10px] text-muted-foreground">
              {quote.number} · v{quote.version}
            </p>
          ) : null}
        </div>
        <Badge
          variant="outline"
          className={cn(
            'text-[10px] capitalize',
            accepted
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
              : quote?.status === 'expired' || quote?.status === 'cancelled'
                ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                : ''
          )}
        >
          {accepted ? 'Accepted' : quote?.status ?? 'Proposal'}
        </Badge>
      </div>

      {quote ? (
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border/60 bg-background/60 p-2.5">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
              Total
            </p>
            <p className="text-sm font-black text-foreground">
              {formatMoney(quote.total, quote.currency)}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
              Per person
            </p>
            <p className="text-xs font-bold text-foreground">
              {formatMoney(quote.perPerson, quote.currency)}
            </p>
          </div>
          <div className="col-span-2 text-[10px] text-muted-foreground">
            {quote.validUntil ? `Valid until ${formatDate(quote.validUntil)}` : 'No expiry given'}
            {proposal.expiresAt ? ` · link until ${formatDate(proposal.expiresAt)}` : ''}
          </div>
        </div>
      ) : null}

      <div className="grid gap-2 text-[11px]">
        {quote && quote.inclusions.length > 0 ? (
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              Included
            </p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {quote.inclusions.slice(0, 4).map((line, index) => (
                <li key={`${line}-${index}`} className="flex gap-1.5">
                  <span className="text-emerald-500">✓</span>
                  <span className="line-clamp-2">{line}</span>
                </li>
              ))}
              {quote.inclusions.length > 4 ? (
                <li className="text-[10px]">+{quote.inclusions.length - 4} more</li>
              ) : null}
            </ul>
          </div>
        ) : null}
        {quote && quote.exclusions.length > 0 ? (
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400">
              Not included
            </p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {quote.exclusions.slice(0, 2).map((line, index) => (
                <li key={`${line}-${index}`} className="flex gap-1.5">
                  <span className="text-rose-500">✕</span>
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
          View document
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

      {sent ? (
        <p className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
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
            maxLength={2000}
            rows={3}
            className="rounded-2xl text-xs"
            disabled={sending}
          />
          {error ? <p className="text-[10px] font-semibold text-destructive">{error}</p> : null}
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
