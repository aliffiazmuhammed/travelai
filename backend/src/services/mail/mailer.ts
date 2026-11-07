import { env } from '../../config/env.js';

/**
 * Resend adapter (P0).
 *
 * The provider is deliberately the only thing here that knows about HTTP.
 * Everything else works with a rendered email, so swapping providers later
 * touches this file alone.
 *
 * Dark by default: without `EMAIL_ENABLED` and `RESEND_API_KEY` the transport
 * refuses to send, and the queue never writes a row. That keeps local dev,
 * tests and a half-configured deploy from pretending to deliver mail.
 */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 15_000;

export interface OutgoingEmail {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
}

/** A send failure with the retry decision already made by the provider layer. */
export class MailSendError extends Error {
  readonly retryable: boolean;
  readonly status?: number;

  constructor(message: string, retryable: boolean, status?: number) {
    super(message);
    this.name = 'MailSendError';
    this.retryable = retryable;
    this.status = status;
  }
}

export function mailIsConfigured(): boolean {
  return Boolean(env.EMAIL_ENABLED && env.RESEND_API_KEY);
}

export function mailFrom(): string {
  return env.EMAIL_FROM;
}

/**
 * Sends one email and returns the provider id, when it gives one.
 *
 * 429 and 5xx are transient (retry); a 4xx validation error never fixes itself,
 * so the queue marks it failed instead of burning attempts.
 */
export async function sendEmailWithProvider(email: OutgoingEmail): Promise<string | null> {
  if (!mailIsConfigured()) {
    throw new MailSendError('Transactional email is not configured.', false);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const payload: Record<string, unknown> = {
    from: mailFrom(),
    to: [email.to],
    subject: email.subject,
    html: email.html,
    text: email.text,
  };
  if (env.EMAIL_REPLY_TO) payload.reply_to = env.EMAIL_REPLY_TO;

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (error: any) {
    // Network failures and timeouts are worth another attempt.
    throw new MailSendError(
      `Could not reach the email provider: ${error?.message ?? 'network error'}`,
      true
    );
  }

  const body = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    const message = String(
      body?.message || body?.error || `The email provider answered ${response.status}.`
    ).slice(0, 400);
    const retryable = response.status === 429 || response.status >= 500;
    throw new MailSendError(message, retryable, response.status);
  }

  return typeof body?.id === 'string' ? body.id : null;
}
