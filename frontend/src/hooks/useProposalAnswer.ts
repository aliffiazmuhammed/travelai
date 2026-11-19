import { useCallback, useState } from 'react';
import type { AgencyProposalSummary } from '@/types/agency';
import {
  proposalAnswerState,
  type ProposalAnswerState,
} from '@/lib/proposalAnswer';

export type ProposalAnswerChoice = 'accept' | 'decline';

export interface ProposalAnswerHandlers {
  onAccept?: (proposal: AgencyProposalSummary) => Promise<void>;
  onDecline?: (proposal: AgencyProposalSummary) => Promise<void>;
}

export interface ProposalAnswerController extends ProposalAnswerState {
  /** The choice waiting for confirmation, or null before the first click. */
  answering: ProposalAnswerChoice | null;
  working: boolean;
  error: string | null;
  /** Both answers are final for this version, so the traveller is asked twice. */
  canAnswer: boolean;
  ask: (choice: ProposalAnswerChoice) => void;
  cancel: () => void;
  confirm: () => Promise<void>;
}

/**
 * Shared two-step answer flow for a proposal.
 *
 * The server refuses a second acceptance for the same trip, so the UI asks
 * before either final action and keeps the error beside the buttons when the
 * request fails.
 */
export function useProposalAnswer({
  proposal,
  onAccept,
  onDecline,
}: {
  proposal: AgencyProposalSummary;
} & ProposalAnswerHandlers): ProposalAnswerController {
  const [answering, setAnswering] = useState<ProposalAnswerChoice | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state = proposalAnswerState(proposal);
  const canAnswer = Boolean(onAccept && onDecline) && state.open;

  const ask = useCallback((choice: ProposalAnswerChoice) => {
    setError(null);
    setAnswering(choice);
  }, []);

  const cancel = useCallback(() => {
    if (working) return;
    setAnswering(null);
    setError(null);
  }, [working]);

  const confirm = useCallback(async () => {
    if (!answering) return;
    const handler = answering === 'accept' ? onAccept : onDecline;
    if (!handler) return;
    setWorking(true);
    setError(null);
    try {
      await handler(proposal);
      setAnswering(null);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Your answer could not be sent.'
      );
    } finally {
      setWorking(false);
    }
  }, [answering, onAccept, onDecline, proposal]);

  return {
    ...state,
    answering,
    working,
    error,
    canAnswer,
    ask,
    cancel,
    confirm,
  };
}
