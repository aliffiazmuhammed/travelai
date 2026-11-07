import { env } from '../../config/env.js';
import EmailOutbox from '../../models/EmailOutbox.js';
import { MailSendError, mailIsConfigured, sendEmailWithProvider } from './mailer.js';

/**
 * Outbox queue and dispatcher (P0).
 *
 * Hooks call {@link enqueueEmail} after their database write. Delivery runs in
 * the web process because Render's free tier has no cron: a kick after enqueue
 * handles the happy path, and the interval catches retries and anything queued
 * while the service was asleep.
 */

const STUCK_SENDING_MS = 5 * 60_000;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 60 * 60_000;

/** One reply email per thread per recipient per window (keeps chat from spamming). */
export const REPLY_THROTTLE_MS = 15 * 60_000;

export interface EnqueueEmailInput {
  kind: string;
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  dedupeKey?: string;
  agencyId?: string | null;
}

export interface DispatchResult {
  sent: number;
  failed: number;
  deferred: number;
}

/**
 * The dedupe key for a throttled thread reply. Pure so the window behaviour is
 * testable: two messages inside the same window collapse into one email, and a
 * message after the boundary is allowed through again.
 */
export function replyDedupeKey(input: {
  enquiryId: string;
  direction: 'agency' | 'traveller';
  recipient: string;
  now?: number;
}): string {
  const bucket = Math.floor((input.now ?? Date.now()) / REPLY_THROTTLE_MS);
  return `enquiry:${input.enquiryId}:${input.direction}-reply:${bucket}:${input.recipient}`;
}

/** Exponential backoff after the Nth failed attempt (30s, 60s, 2m, … capped at 1h). */
export function retryDelayMs(attempts: number): number {
  const step = Math.max(1, Math.floor(attempts));
  return Math.min(RETRY_BASE_MS * 2 ** (step - 1), RETRY_MAX_MS);
}

/**
 * Queues one email.
 *
 * Returns false when mail is off, the address is unusable, or the dedupe key
 * already exists. Duplicates are an expected outcome, not an error: every
 * caller retries other work around this call.
 */
export async function enqueueEmail(input: EnqueueEmailInput): Promise<boolean> {
  if (!mailIsConfigured()) return false;

  const recipient = String(input.to ?? '').trim().toLowerCase();
  if (!recipient) return false;

  try {
    await EmailOutbox.create({
      kind: input.kind,
      recipient,
      recipientName: input.toName?.trim() || undefined,
      subject: input.subject,
      html: input.html,
      text: input.text,
      dedupeKey: input.dedupeKey,
      agencyId: input.agencyId ?? null,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(),
    });
  } catch (error: any) {
    if (error?.code === 11000) return false;
    console.warn('Could not queue a transactional email:', error);
    return false;
  }

  // Fire and forget: the request that caused this must not wait on delivery.
  void dispatchOutbox(5).catch((error) => {
    console.warn('Email dispatch failed:', error);
  });
  return true;
}

let dispatching = false;

/**
 * Drains due rows. A single in-process lock is enough: one web instance owns
 * the queue, and a second caller simply returns while the first is working.
 */
export async function dispatchOutbox(limit = 20): Promise<DispatchResult> {
  const result: DispatchResult = { sent: 0, failed: 0, deferred: 0 };
  if (dispatching || !mailIsConfigured()) return result;

  dispatching = true;
  try {
    for (let index = 0; index < limit; index += 1) {
      const row = (await EmailOutbox.findOneAndUpdate(
        {
          status: { $in: ['pending', 'failed'] },
          nextAttemptAt: { $lte: new Date() },
        },
        { $set: { status: 'sending' } },
        { new: true, sort: { nextAttemptAt: 1 } }
      ).lean()) as any;
      if (!row) break;

      try {
        await sendEmailWithProvider({
          to: row.recipient,
          toName: row.recipientName,
          subject: row.subject,
          html: row.html,
          text: row.text,
        });
        await EmailOutbox.updateOne(
          { _id: row._id },
          { $set: { status: 'sent', sentAt: new Date(), lastError: null } }
        );
        result.sent += 1;
      } catch (error: any) {
        const attempts = Number(row.attempts ?? 0) + 1;
        const retryable = error instanceof MailSendError ? error.retryable : true;
        const exhausted = attempts >= env.EMAIL_MAX_ATTEMPTS;
        const terminal = !retryable || exhausted;

        await EmailOutbox.updateOne(
          { _id: row._id },
          {
            $set: {
              status: terminal ? 'failed' : 'pending',
              attempts,
              lastError: String(error?.message ?? error).slice(0, 500),
              nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)),
            },
          }
        );

        if (terminal) {
          result.failed += 1;
          console.warn(
            `Email ${row.kind} to ${row.recipient} failed permanently:`,
            error?.message ?? error
          );
        } else {
          result.deferred += 1;
        }
      }
    }
  } finally {
    dispatching = false;
  }

  return result;
}

/**
 * A crash mid-send leaves a row in `sending` forever. At boot (and on each
 * interval tick) anything older than the cutoff goes back to `pending`.
 */
export async function recoverStuckEmails(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STUCK_SENDING_MS);
  const result = await EmailOutbox.updateMany(
    { status: 'sending', updatedAt: { $lt: cutoff } },
    { $set: { status: 'pending', nextAttemptAt: new Date() } }
  );
  return Number(result.modifiedCount ?? 0);
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Starts the boot sweep and the periodic drain. Safe to call twice. */
export function startEmailDispatcher(intervalMs = env.EMAIL_OUTBOX_INTERVAL_MS): void {
  if (timer || !mailIsConfigured()) return;

  void recoverStuckEmails()
    .then(() => dispatchOutbox(25))
    .catch((error) => console.warn('Email boot drain failed:', error));

  timer = setInterval(() => {
    void recoverStuckEmails()
      .then(() => dispatchOutbox(25))
      .catch((error) => console.warn('Email dispatch failed:', error));
  }, intervalMs);
  timer.unref?.();
}

export function stopEmailDispatcher(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
