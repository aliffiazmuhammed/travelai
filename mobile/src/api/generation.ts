import { fetch } from 'expo/fetch';

import { ApiError } from '@/api/client';
import type { MyTripDetail } from '@/api/trips';
import { getSessionToken } from '@/auth/tokenStorage';
import { API_URL } from '@/config';
import { decodeUtf8 } from '@/lib/utf8';

export type TravelPace = 'relaxed' | 'balanced' | 'packed';

export interface GenerateTripInput {
  destination: string;
  days: number;
  budget: number;
  startdate: string;
  enddate: string;
  interests: string[];
  groupType: string;
  preferences?: { pace?: TravelPace };
}

export interface GenerationProgress {
  stage: number;
  progress: number;
  message: string;
}

interface StreamEvent {
  type?: string;
  stage?: number;
  progress?: number;
  message?: string;
  trip?: MyTripDetail;
}

function messageForStatus(status: number): string {
  if (status === 429) {
    return 'You have generated a few plans already. Give it a little while before the next one.';
  }
  if (status >= 500) {
    return 'The planner is busy right now. Try again in a minute.';
  }
  return 'The plan could not be started. Check the brief and try again.';
}

/**
 * Runs generation as a server-sent event stream and resolves with the saved
 * trip. Progress arrives as it happens so the screen can narrate the work.
 */
export async function generateTripStream(
  input: GenerateTripInput,
  handlers: {
    onProgress: (progress: GenerationProgress) => void;
    signal?: AbortSignal;
  }
): Promise<MyTripDetail> {
  const token = await getSessionToken();

  let response: Response;
  try {
    response = await fetch(`${API_URL}/itinerary/generate-stream`, {
      method: 'POST',
      signal: handlers.signal,
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        'X-Client': 'mobile',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
    });
  } catch {
    if (handlers.signal?.aborted) throw new ApiError('Generation stopped.', 0);
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new ApiError(
      payload?.error || payload?.message || messageForStatus(response.status),
      response.status
    );
  }

  if (!response.body) {
    throw new ApiError('This device could not read the live progress. Try again.', 0);
  }

  const reader = response.body.getReader();
  const pending: number[] = [];

  const handleLine = (rawLine: string): MyTripDetail | null => {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) return null;

    let event: StreamEvent;
    try {
      event = JSON.parse(line.slice(5).trim()) as StreamEvent;
    } catch {
      return null;
    }

    if (event.type === 'progress') {
      handlers.onProgress({
        stage: event.stage ?? 1,
        progress: event.progress ?? 10,
        message: event.message || 'Crafting your itinerary…',
      });
      return null;
    }

    if (event.type === 'complete' && event.trip) {
      return event.trip;
    }

    if (event.type === 'error') {
      throw new ApiError(event.message || 'Generation failed. Try again.', 0);
    }

    return null;
  };

  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        if (handlers.signal?.aborted) throw new ApiError('Generation stopped.', 0);
        throw new ApiError('The connection dropped before the plan was ready. Please try again.', 0);
      }
      const { done, value } = chunk;
      if (done) break;

      for (const byte of value) {
        if (byte !== 0x0a) {
          pending.push(byte);
          continue;
        }
        const completed = handleLine(decodeUtf8(Uint8Array.from(pending)));
        pending.length = 0;
        if (completed) return completed;
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }

  throw new ApiError('The plan stopped before it was ready. Please try again.', 0);
}
