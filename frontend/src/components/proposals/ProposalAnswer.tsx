import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useProposalAnswer,
  type ProposalAnswerHandlers,
} from '@/hooks/useProposalAnswer';
import { cn } from '@/lib/utils';
import type { AgencyProposalSummary } from '@/types/agency';

export interface ProposalAnswerProps extends ProposalAnswerHandlers {
  proposal: AgencyProposalSummary;
  className?: string;
}

/**
 * The single answer control for a proposal.
 *
 * Idle it offers the two answers; after a click it asks for confirmation and
 * keeps the server's refusal beside the buttons. Every traveller surface uses
 * this component so one decision reads and behaves the same everywhere.
 */
export function ProposalAnswer({
  proposal,
  onAccept,
  onDecline,
  className,
}: ProposalAnswerProps) {
  const answer = useProposalAnswer({ proposal, onAccept, onDecline });

  if (!answer.canAnswer) return null;

  if (answer.answering) {
    const accepting = answer.answering === 'accept';
    return (
      <div
        className={cn(
          'w-full space-y-2 rounded-xl border border-border/70 bg-background/60 p-3',
          className
        )}
      >
        <p className="text-xs font-medium leading-5 text-foreground">
          {accepting
            ? 'Accepting confirms this quote and tells the agency. No payment is taken here.'
            : 'Declining closes this version. The conversation stays open.'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={accepting ? 'default' : 'destructive'}
            className="gap-1.5 rounded-xl text-xs font-semibold"
            onClick={() => void answer.confirm()}
            disabled={answer.working}
          >
            {answer.working ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : accepting ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            {accepting ? 'Confirm acceptance' : 'Confirm decline'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-xl text-xs font-semibold"
            onClick={answer.cancel}
            disabled={answer.working}
          >
            Cancel
          </Button>
        </div>
        {answer.error ? (
          <p role="alert" className="text-xs font-semibold text-destructive">
            {answer.error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Button
        type="button"
        size="sm"
        className="gap-1.5 rounded-xl text-xs font-semibold"
        onClick={() => answer.ask('accept')}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Accept proposal
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="gap-1.5 rounded-xl text-xs font-semibold text-muted-foreground hover:text-destructive"
        onClick={() => answer.ask('decline')}
      >
        <XCircle className="h-3.5 w-3.5" />
        Not this one
      </Button>
    </div>
  );
}

export default ProposalAnswer;
