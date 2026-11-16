import { useEffect, useRef, useState } from 'react';

import type { TripPoll } from '@/api/discussion';
import type { DiscussionCrypto } from '@/hooks/useDiscussionCrypto';

/**
 * Reading half of polls, ported from the web client: the question and every
 * option label arrive sealed in one ciphertext, and each vote is a sealed
 * option index. The per-device tally is computed here, so the server never
 * learns what was asked or who chose what.
 *
 * Decoding is cached by the ciphertexts themselves; one changed vote re-decodes
 * one poll.
 */
export interface DecodedPoll {
  question: string;
  options: string[];
  counts: number[];
  total: number;
  myChoice: number | null;
  voters: { userId: string; label: string; choice: number | null }[];
}

interface CacheEntry {
  signature: string;
  value: DecodedPoll;
}

/** The composer caps a poll at 5 options; this is a hostile-input wall. */
const MAX_OPTIONS = 8;

export function useDecodedPolls(
  polls: TripPoll[],
  crypto: DiscussionCrypto,
  currentUserId?: string
): Map<string, DecodedPoll> {
  const [decoded, setDecoded] = useState<Map<string, DecodedPoll>>(new Map());
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const { status, openJson } = crypto;

  useEffect(() => {
    if (status !== 'ready' || polls.length === 0) return;
    let alive = true;

    void (async () => {
      let changed = false;
      for (const poll of polls) {
        const signature = `${poll.body}|${poll.votes.map((vote) => vote.choice).join('|')}`;
        if (cacheRef.current.get(poll._id)?.signature === signature) continue;

        const payload = await openJson<{ q?: unknown; o?: unknown }>(poll.body);
        const options = Array.isArray(payload?.o)
          ? payload.o.slice(0, MAX_OPTIONS).map((option) => String(option))
          : [];
        const sealedChoices = await Promise.all(
          poll.votes.map((vote) => openJson<number>(vote.choice))
        );

        const counts = options.map(() => 0);
        const voters = poll.votes.map((vote, index) => {
          const raw = sealedChoices[index];
          // An index the publisher did not offer, or one we cannot read, is not
          // a vote for anything.
          const choice =
            typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < options.length
              ? raw
              : null;
          if (choice !== null) counts[choice] += 1;
          return { userId: vote.userId, label: vote.label, choice };
        });

        const mine = currentUserId
          ? voters.find((voter) => voter.userId === currentUserId)
          : undefined;

        cacheRef.current.set(poll._id, {
          signature,
          value: {
            question: typeof payload?.q === 'string' ? payload.q : '',
            options,
            counts,
            total: voters.length,
            myChoice: mine?.choice ?? null,
            voters,
          },
        });
        changed = true;
      }

      if (!alive || !changed) return;
      const next = new Map<string, DecodedPoll>();
      for (const poll of polls) {
        const cached = cacheRef.current.get(poll._id);
        if (cached) next.set(poll._id, cached.value);
      }
      setDecoded(next);
    })();

    return () => {
      alive = false;
    };
  }, [polls, currentUserId, status, openJson]);

  return decoded;
}
