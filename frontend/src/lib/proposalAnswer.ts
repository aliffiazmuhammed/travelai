import type { AgencyProposalSummary } from '@/types/agency';

/**
 * The one freshness contract for a traveller's proposal.
 *
 * A version is answerable only while its quote is still waiting and nothing
 * else has settled the trip. Each surface previously re-derived this by hand,
 * which is how the thread, the conversation and the proposals board drifted.
 */
export interface ProposalAnswerState {
  accepted: boolean;
  declined: boolean;
  /** Another version of this trip already won, so this one cannot be answered. */
  settled: boolean;
  /** Still waiting on the traveller. */
  open: boolean;
}

export function proposalAnswerState(
  proposal: Pick<
    AgencyProposalSummary,
    'acceptedAt' | 'declinedAt' | 'settledByAcceptedTrip' | 'quote'
  >
): ProposalAnswerState {
  const accepted =
    Boolean(proposal.acceptedAt) || proposal.quote?.status === 'accepted';
  const declined = Boolean(proposal.declinedAt);
  const settled =
    Boolean(proposal.settledByAcceptedTrip) && !accepted && !declined;
  const open =
    proposal.quote?.status === 'sent' && !accepted && !declined && !settled;
  return { accepted, declined, settled, open };
}

/** True while the traveller still has a decision to make on this version. */
export function proposalIsLive(
  proposal: Pick<
    AgencyProposalSummary,
    'acceptedAt' | 'declinedAt' | 'settledByAcceptedTrip' | 'quote'
  >
): boolean {
  return proposalAnswerState(proposal).open;
}
