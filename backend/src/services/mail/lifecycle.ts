import Agency from '../../models/Agency.js';
import AgencyEnquiry from '../../models/AgencyEnquiry.js';
import AgencyEvent from '../../models/AgencyEvent.js';
import AgencyEventInterest from '../../models/AgencyEventInterest.js';
import AgencyProposalLink from '../../models/AgencyProposalLink.js';
import AgencyQuote from '../../models/AgencyQuote.js';
import { env } from '../../config/env.js';
import { mailIsConfigured } from './mailer.js';
import { enqueueEmail } from './outbox.js';
import {
  agencyBillingRecipients,
  agencyTeamRecipients,
  recipientForAddress,
} from './recipients.js';
import {
  appUrl,
  formatDateRange,
  planLabel,
  renderAgencyRenewalReminder,
  renderAgencyWeeklyDigest,
  renderTravellerEventReminder,
} from './templates.js';

/**
 * Lifecycle email (P2): event reminders, renewal heads-ups and the weekly
 * digest.
 *
 * None of these are triggered by a user action, and the free host has no cron.
 * A small sweep runs at boot and on an interval inside the web process, which
 * is best effort: a sleeping instance sends nothing while asleep, and the boot
 * sweep catches the backlog when it wakes. Every send is dedupe-keyed, so a
 * late or repeated sweep cannot double-mail anyone.
 */

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
/** The digest goes out at 06:00 UTC on Monday at the earliest. */
const DIGEST_GATE_HOUR = 6;

/** ISO-8601 week key, so the digest sends once per week even from a late sweep. */
export function isoWeekKey(date: Date): string {
  const day = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((day.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** The first sweep that may send this week's digest (Monday 06:00 UTC). */
export function digestOpensAt(now: Date): Date {
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysSinceMonday,
      DIGEST_GATE_HOUR
    )
  );
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function dateKey(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

async function agencyNameFor(agencyId: unknown): Promise<string> {
  const row = (await (Agency as any)
    .findById(agencyId)
    .select('name')
    .lean()) as any;
  return String(row?.name ?? '').trim();
}

/**
 * Reminds every confirmed guest that an event they signed up for is close.
 * Only published, unclosed, visible events are considered, and the window is
 * deliberately wider than one sweep so a sleeping instance still catches up.
 */
export async function sendEventReminders(now: Date = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + env.EMAIL_EVENT_REMINDER_HOURS * HOUR_MS);
  const events = (await AgencyEvent.find({
    state: 'published',
    closedAt: null,
    'moderation.hiddenAt': null,
    startDate: { $gt: now, $lte: horizon },
  })
    .select('agencyId title startDate endDate destination')
    .lean()) as any[];

  let queued = 0;
  for (const event of events) {
    const interests = (await AgencyEventInterest.find({
      eventId: event._id,
      status: 'confirmed',
    })
      .select('name email')
      .lean()) as any[];
    if (interests.length === 0) continue;

    const agencyName = await agencyNameFor(event.agencyId);
    if (!agencyName) continue;

    const eventDates = formatDateRange(event.startDate, event.endDate);
    const eventUrl = appUrl(`/explore/events/${event._id}`);
    const reminderDate = dateKey(event.startDate);

    for (const interest of interests) {
      const recipient = recipientForAddress(interest?.email, interest?.name);
      if (!recipient) continue;

      const rendered = renderTravellerEventReminder({
        agencyName,
        travellerName: recipient.name || 'there',
        eventTitle: String(event.title ?? 'the event'),
        eventDates,
        destination: String(event.destination ?? '').trim() || undefined,
        eventUrl,
      });

      const created = await enqueueEmail({
        kind: 'event.reminder',
        to: recipient.email,
        toName: recipient.name,
        ...rendered,
        // A rescheduled event deserves a fresh reminder; the date is the bucket.
        dedupeKey: `event-reminder:${event._id}:${interest._id}:${reminderDate}`,
        agencyId: String(event.agencyId),
      });
      if (created) queued += 1;
    }
  }
  return queued;
}

/** Heads-up inside the renewal window; one mail per renewal date and address. */
export async function sendRenewalReminders(now: Date = new Date()): Promise<number> {
  const from = startOfUtcDay(now);
  const until = new Date(now.getTime() + env.EMAIL_RENEWAL_REMINDER_DAYS * DAY_MS);
  const agencies = (await Agency.find({
    status: 'active',
    'billing.renewalDate': { $gte: from, $lte: until },
  })
    .select('name slug plan billing branding.contactEmail')
    .lean()) as any[];

  let queued = 0;
  for (const agency of agencies) {
    const renewalOn = formatDateRange(agency?.billing?.renewalDate);
    if (!renewalOn) continue;

    const recipients = await agencyBillingRecipients(
      agency._id,
      agency.billing,
      agency?.branding?.contactEmail
    );
    if (recipients.length === 0) continue;

    const rendered = renderAgencyRenewalReminder({
      agencyName: String(agency.name ?? 'your agency'),
      workspace: String(agency.slug ?? ''),
      renewalOn,
      plan: planLabel(agency?.plan?.tierId || env.AGENCY_PLAN_DEFAULT),
    });
    const keyDate = dateKey(agency.billing.renewalDate);

    for (const recipient of recipients) {
      const created = await enqueueEmail({
        kind: 'agency.renewal_reminder',
        to: recipient.email,
        toName: recipient.name,
        ...rendered,
        dedupeKey: `agency-renewal:${agency._id}:${keyDate}:${recipient.email}`,
        agencyId: String(agency._id),
      });
      if (created) queued += 1;
    }
  }
  return queued;
}

/**
 * One summary per active agency per ISO week, and only when the week contains
 * something to report. A quiet agency gets silence, not a zero-filled email.
 */
export async function sendWeeklyDigests(now: Date = new Date()): Promise<number> {
  if (now < digestOpensAt(now)) return 0;

  const windowStart = new Date(now.getTime() - 7 * DAY_MS);
  const upcomingUntil = new Date(now.getTime() + 7 * DAY_MS);
  const week = isoWeekKey(now);
  const weekLabel = formatDateRange(windowStart, now);

  const agencies = (await Agency.find({ status: 'active' })
    .select('name slug branding.contactEmail')
    .lean()) as any[];

  let queued = 0;
  for (const agency of agencies) {
    const [newEnquiries, quotesSent, proposalsAccepted, proposalsDeclined, upcomingEvents] =
      await Promise.all([
        AgencyEnquiry.countDocuments({
          agencyId: agency._id,
          createdAt: { $gte: windowStart },
        }),
        AgencyQuote.countDocuments({
          agencyId: agency._id,
          sentAt: { $gte: windowStart },
        }),
        AgencyProposalLink.countDocuments({
          agencyId: agency._id,
          acceptedAt: { $gte: windowStart },
        }),
        AgencyProposalLink.countDocuments({
          agencyId: agency._id,
          declinedAt: { $gte: windowStart },
        }),
        AgencyEvent.countDocuments({
          agencyId: agency._id,
          state: 'published',
          closedAt: null,
          'moderation.hiddenAt': null,
          startDate: { $gte: now, $lte: upcomingUntil },
        }),
      ]);

    const activity =
      newEnquiries + quotesSent + proposalsAccepted + proposalsDeclined + upcomingEvents;
    if (activity === 0) continue;

    const recipients = await agencyTeamRecipients(agency._id, {
      minRole: 'planner',
      fallbackEmail: agency?.branding?.contactEmail,
    });
    if (recipients.length === 0) continue;

    const rendered = renderAgencyWeeklyDigest({
      agencyName: String(agency.name ?? 'your agency'),
      weekLabel,
      inboxUrl: appUrl('/agency/enquiries'),
      newEnquiries,
      quotesSent,
      proposalsAccepted,
      proposalsDeclined,
      upcomingEvents,
    });

    for (const recipient of recipients) {
      const created = await enqueueEmail({
        kind: 'agency.weekly_digest',
        to: recipient.email,
        toName: recipient.name,
        ...rendered,
        dedupeKey: `agency-digest:${agency._id}:${week}:${recipient.email}`,
        agencyId: String(agency._id),
      });
      if (created) queued += 1;
    }
  }
  return queued;
}

export interface LifecycleResult {
  eventReminders: number;
  renewalReminders: number;
  digests: number;
}

let sweeping = false;

/** Runs every sweep; one failing sweep never stops the others. */
export async function runEmailLifecycle(now: Date = new Date()): Promise<LifecycleResult> {
  const result: LifecycleResult = { eventReminders: 0, renewalReminders: 0, digests: 0 };
  if (!mailIsConfigured() || sweeping) return result;

  sweeping = true;
  try {
    try {
      result.eventReminders = await sendEventReminders(now);
    } catch (error) {
      console.warn('Event reminder sweep failed:', error);
    }
    try {
      result.renewalReminders = await sendRenewalReminders(now);
    } catch (error) {
      console.warn('Renewal reminder sweep failed:', error);
    }
    try {
      result.digests = await sendWeeklyDigests(now);
    } catch (error) {
      console.warn('Weekly digest sweep failed:', error);
    }
  } finally {
    sweeping = false;
  }
  return result;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Starts the boot sweep and the periodic lifecycle pass. Safe to call twice. */
export function startEmailLifecycle(intervalMs = env.EMAIL_LIFECYCLE_INTERVAL_MS): void {
  if (timer || !mailIsConfigured()) return;

  void runEmailLifecycle().catch((error) =>
    console.warn('Email lifecycle boot sweep failed:', error)
  );

  timer = setInterval(() => {
    void runEmailLifecycle().catch((error) =>
      console.warn('Email lifecycle sweep failed:', error)
    );
  }, intervalMs);
  timer.unref?.();
}

export function stopEmailLifecycle(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
