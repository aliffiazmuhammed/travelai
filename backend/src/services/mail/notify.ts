import mongoose from 'mongoose';
import Agency from '../../models/Agency.js';
import AgencyEnquiry from '../../models/AgencyEnquiry.js';
import Trip from '../../models/Trip.js';
import User from '../../models/User.js';
import { mailIsConfigured } from './mailer.js';
import { enqueueEmail, replyDedupeKey } from './outbox.js';
import {
  agencyBillingRecipients,
  agencyTeamRecipients,
  platformAdminRecipients,
  recipientForAddress,
  recipientForEventInterest,
  recipientForQuoteClient,
  travellerRecipientForEnquiry,
} from './recipients.js';
import {
  appUrl,
  formatDateRange,
  formatMoney,
  renderAgencyApplicationApproved,
  renderAgencyApplicationReceived,
  renderAgencyApplicationRejected,
  renderAgencyCredentials,
  renderAgencyEventInterest,
  renderAgencyInvite,
  renderAgencyNewEnquiry,
  renderAgencyPlanChanged,
  renderAgencyProposalAccepted,
  renderAgencyProposalDeclined,
  renderAgencyStatusChanged,
  renderAgencyTravellerReply,
  renderPasswordReset,
  renderPlatformApplicationReceived,
  renderTravellerAgencyReply,
  renderTravellerEventDecision,
  renderTravellerProposalShared,
  renderTravellerQuoteSent,
  renderTripInvite,
} from './templates.js';

/**
 * The seven P0 notifications (9 templates).
 *
 * Each helper loads what the template needs, resolves recipients, and queues
 * one row per address. They never throw: a mail problem must not undo an
 * enquiry, a send or an acceptance, so failures are logged and the request's
 * real work has already been committed by the time these run.
 */

async function safely(label: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.warn(`Could not queue the ${label} email:`, error);
  }
}

interface AgencyIdentity {
  name: string;
  fallbackEmail?: string;
}

async function loadAgency(agencyId: unknown): Promise<AgencyIdentity | null> {
  if (!mongoose.isValidObjectId(String(agencyId ?? ''))) return null;
  const row = (await Agency.findById(agencyId)
    .select('name branding.contactEmail')
    .lean()) as any;
  if (!row) return null;
  const name = String(row.name ?? '').trim();
  if (!name) return null;
  const fallbackEmail = String(row.branding?.contactEmail ?? '').trim() || undefined;
  return { name, fallbackEmail };
}

/** The last message in a pushed thread; the row is the one just written. */
export function latestMessageBody(enquiry: any): string {
  const messages = Array.isArray(enquiry?.messages) ? enquiry.messages : [];
  const last = messages[messages.length - 1];
  return String(last?.body ?? '');
}

export function enquiryPartyLabel(party: any): string {
  const adults = Math.max(0, Number(party?.adults) || 0);
  const children = Math.max(0, Number(party?.children) || 0);
  const parts: string[] = [];
  if (adults) parts.push(`${adults} ${adults === 1 ? 'adult' : 'adults'}`);
  if (children) parts.push(`${children} ${children === 1 ? 'child' : 'children'}`);
  return parts.join(', ');
}

export function enquiryDatesLabel(enquiry: any): string {
  const range = formatDateRange(enquiry?.dates?.start, enquiry?.dates?.end);
  if (range) return range;
  return enquiry?.dates?.flexible ? 'Dates are flexible' : '';
}

/* -------------------------------------------------------------------------- */
/*  Enquiries                                                                 */
/* -------------------------------------------------------------------------- */

export function notifyAgencyNewEnquiry(enquiry: any): Promise<void> {
  return safely('new-enquiry', async () => {
    if (!mailIsConfigured()) return;
    const agency = await loadAgency(enquiry?.agencyId);
    if (!agency) return;

    const recipients = await agencyTeamRecipients(enquiry.agencyId, {
      minRole: 'planner',
      fallbackEmail: agency.fallbackEmail,
    });
    if (recipients.length === 0) return;

    const rendered = renderAgencyNewEnquiry({
      agencyName: agency.name,
      travellerName: String(enquiry?.contact?.name ?? 'A traveller'),
      message: String(enquiry?.message ?? ''),
      dates: enquiryDatesLabel(enquiry),
      party: enquiryPartyLabel(enquiry?.party),
      budgetBand: enquiry?.budgetBand ?? null,
      inboxUrl: appUrl('/agency/enquiries'),
    });

    for (const recipient of recipients) {
      await enqueueEmail({
        kind: 'enquiry.new',
        to: recipient.email,
        toName: recipient.name,
        ...rendered,
        dedupeKey: `enquiry:${enquiry._id}:new:${recipient.email}`,
        agencyId: String(enquiry.agencyId),
      });
    }
  });
}

export function notifyTravellerAgencyReply(input: {
  enquiry: any;
  messageBody: string;
}): Promise<void> {
  return safely('agency-reply', async () => {
    if (!mailIsConfigured()) return;
    const { enquiry } = input;
    // A guest conversation has no account page to link to; the raw token only
    // existed in the link the guest already holds.
    if (!enquiry?.userId) return;

    const agency = await loadAgency(enquiry.agencyId);
    if (!agency) return;
    const recipient = await travellerRecipientForEnquiry(enquiry);
    if (!recipient) return;

    const rendered = renderTravellerAgencyReply({
      agencyName: agency.name,
      travellerName: String(enquiry?.contact?.name ?? 'there'),
      message: input.messageBody,
      threadUrl: appUrl(`/enquiry/${enquiry._id}`),
    });

    await enqueueEmail({
      kind: 'enquiry.agency_reply',
      to: recipient.email,
      toName: recipient.name,
      ...rendered,
      dedupeKey: replyDedupeKey({
        enquiryId: String(enquiry._id),
        direction: 'agency',
        recipient: recipient.email,
      }),
      agencyId: String(enquiry.agencyId),
    });
  });
}

export function notifyAgencyTravellerReply(input: {
  enquiry: any;
  messageBody: string;
}): Promise<void> {
  return safely('traveller-reply', async () => {
    if (!mailIsConfigured()) return;
    const { enquiry } = input;
    const agency = await loadAgency(enquiry?.agencyId);
    if (!agency) return;

    const recipients = await agencyTeamRecipients(enquiry.agencyId, {
      minRole: 'planner',
      fallbackEmail: agency.fallbackEmail,
    });
    if (recipients.length === 0) return;

    const rendered = renderAgencyTravellerReply({
      agencyName: agency.name,
      travellerName: String(enquiry?.contact?.name ?? 'A traveller'),
      message: input.messageBody,
      inboxUrl: appUrl('/agency/enquiries'),
    });

    for (const recipient of recipients) {
      await enqueueEmail({
        kind: 'enquiry.traveller_reply',
        to: recipient.email,
        toName: recipient.name,
        ...rendered,
        dedupeKey: replyDedupeKey({
          enquiryId: String(enquiry._id),
          direction: 'traveller',
          recipient: recipient.email,
        }),
        agencyId: String(enquiry.agencyId),
      });
    }
  });
}

/* -------------------------------------------------------------------------- */
/*  Quotes and proposals                                                      */
/* -------------------------------------------------------------------------- */

async function loadEnquiryForQuote(agencyId: unknown, enquiryId: unknown): Promise<any | null> {
  if (!enquiryId || !mongoose.isValidObjectId(String(enquiryId))) return null;
  return AgencyEnquiry.findOne({
    _id: enquiryId,
    agencyId,
  })
    .select('userId contact')
    .lean();
}

export function notifyQuoteSent(input: {
  agencyId: string;
  quote: any;
  enquiryId: string | null;
}): Promise<void> {
  return safely('quote-sent', async () => {
    if (!mailIsConfigured()) return;
    const enquiry = await loadEnquiryForQuote(input.agencyId, input.enquiryId);
    // A quote without a lead has no traveller account to open it in; that
    // client is reached by the explicit PDF share instead.
    if (!enquiry) return;

    const agency = await loadAgency(input.agencyId);
    if (!agency) return;
    const recipient = await travellerRecipientForEnquiry(enquiry);
    if (!recipient) return;

    const quote = input.quote;
    const rendered = renderTravellerQuoteSent({
      agencyName: agency.name,
      travellerName: String(enquiry?.contact?.name ?? 'there'),
      quoteNumber: String(quote?.number ?? ''),
      total: formatMoney(quote?.total, String(quote?.currency ?? 'INR')),
      validUntil: formatDateRange(quote?.validUntil),
      threadUrl: appUrl(`/enquiry/${input.enquiryId}`),
    });

    await enqueueEmail({
      kind: 'quote.sent',
      to: recipient.email,
      toName: recipient.name,
      ...rendered,
      dedupeKey: `quote:${quote?._id}:sent:${recipient.email}`,
      agencyId: input.agencyId,
    });
  });
}

export function notifyProposalShared(input: {
  agencyId: string;
  quote: any;
  enquiryId: string | null;
  linkId: string;
  url: string;
  expiresAt?: Date | null;
}): Promise<void> {
  return safely('proposal-shared', async () => {
    if (!mailIsConfigured()) return;
    const agency = await loadAgency(input.agencyId);
    if (!agency) return;

    const enquiry = await loadEnquiryForQuote(input.agencyId, input.enquiryId);
    const recipient = await recipientForQuoteClient(input.quote, enquiry);
    if (!recipient) return;

    const rendered = renderTravellerProposalShared({
      agencyName: agency.name,
      clientName: String(input.quote?.client?.name ?? recipient.name ?? 'there'),
      quoteNumber: String(input.quote?.number ?? ''),
      total: formatMoney(input.quote?.total, String(input.quote?.currency ?? 'INR')),
      expiresOn: formatDateRange(input.expiresAt),
      proposalUrl: input.url,
    });

    await enqueueEmail({
      kind: 'proposal.shared',
      to: recipient.email,
      toName: recipient.name,
      ...rendered,
      dedupeKey: `proposal:${input.linkId}:shared:${recipient.email}`,
      agencyId: input.agencyId,
    });
  });
}

export function notifyAgencyProposalAnswer(input: {
  agencyId: string;
  quote: any;
  linkId: string;
  answer: 'accepted' | 'declined';
}): Promise<void> {
  return safely(`proposal-${input.answer}`, async () => {
    if (!mailIsConfigured()) return;
    const agency = await loadAgency(input.agencyId);
    if (!agency) return;

    const recipients = await agencyTeamRecipients(input.agencyId, {
      minRole: 'planner',
      fallbackEmail: agency.fallbackEmail,
    });
    if (recipients.length === 0) return;

    const data = {
      agencyName: agency.name,
      travellerName: String(input.quote?.client?.name ?? 'Your traveller'),
      quoteNumber: String(input.quote?.number ?? ''),
      total: formatMoney(input.quote?.total, String(input.quote?.currency ?? 'INR')),
      answer: input.answer,
      inboxUrl: appUrl('/agency/enquiries'),
    };
    const rendered =
      input.answer === 'accepted'
        ? renderAgencyProposalAccepted(data)
        : renderAgencyProposalDeclined(data);

    for (const recipient of recipients) {
      await enqueueEmail({
        kind: `proposal.${input.answer}`,
        to: recipient.email,
        toName: recipient.name,
        ...rendered,
        dedupeKey: `proposal:${input.linkId}:${input.answer}:${recipient.email}`,
        agencyId: input.agencyId,
      });
    }
  });
}

/* -------------------------------------------------------------------------- */
/*  Events                                                                    */
/* -------------------------------------------------------------------------- */

export function notifyAgencyEventInterest(input: {
  agencyId: string;
  event: any;
  interest: any;
}): Promise<void> {
  return safely('event-interest', async () => {
    if (!mailIsConfigured()) return;
    const agency = await loadAgency(input.agencyId);
    if (!agency) return;

    const recipients = await agencyTeamRecipients(input.agencyId, {
      minRole: 'planner',
      fallbackEmail: agency.fallbackEmail,
    });
    if (recipients.length === 0) return;

    const rendered = renderAgencyEventInterest({
      agencyName: agency.name,
      travellerName: String(input.interest?.name ?? 'Someone'),
      eventTitle: String(input.event?.title ?? 'your event'),
      eventDates: formatDateRange(input.event?.startDate, input.event?.endDate),
      note: String(input.interest?.note ?? ''),
      rosterUrl: appUrl('/agency/events'),
    });

    for (const recipient of recipients) {
      await enqueueEmail({
        kind: 'event.interest',
        to: recipient.email,
        toName: recipient.name,
        ...rendered,
        dedupeKey: `event-interest:${input.interest?._id}:received:${recipient.email}`,
        agencyId: input.agencyId,
      });
    }
  });
}

export function notifyTravellerEventDecision(input: {
  agencyId: string;
  event: any;
  interest: any;
  status: 'confirmed' | 'declined';
}): Promise<void> {
  return safely('event-decision', async () => {
    if (!mailIsConfigured()) return;
    const agency = await loadAgency(input.agencyId);
    if (!agency) return;
    const recipient = recipientForEventInterest(input.interest);
    if (!recipient) return;

    const rendered = renderTravellerEventDecision({
      agencyName: agency.name,
      travellerName: String(input.interest?.name ?? 'there'),
      eventTitle: String(input.event?.title ?? 'the event'),
      eventDates: formatDateRange(input.event?.startDate, input.event?.endDate),
      status: input.status,
      eventUrl: appUrl(`/explore/events/${input.event?._id ?? ''}`),
    });

    await enqueueEmail({
      kind: `event.${input.status}`,
      to: recipient.email,
      toName: recipient.name,
      ...rendered,
      dedupeKey: `event-interest:${input.interest?._id}:decision:${input.status}:${recipient.email}`,
      agencyId: input.agencyId,
    });
  });
}

/* -------------------------------------------------------------------------- */
/*  P1: account and access                                                    */
/* -------------------------------------------------------------------------- */

/**
 * An email-bound invite already names its recipient, so the link that the
 * owner would otherwise copy is delivered for them. Link invites stay
 * copy-link: there is no address to send to.
 */
export function notifyTripInvite(input: { invite: any; link: string }): Promise<void> {
  return safely('trip-invite', async () => {
    if (!mailIsConfigured()) return;
    const invite = input.invite;
    const email = String(invite?.email ?? '').trim();
    if (invite?.kind !== 'email' || !email) return;

    const trip = (await Trip.findById(invite.tripId)
      .select('title tripDetails.trip_title generationMeta.request.destination')
      .lean()) as any;
    if (!trip) return;

    const inviter = (await User.findById(invite.createdBy)
      .select('name email')
      .lean()) as any;
    const inviterName =
      String(inviter?.name ?? '').trim() ||
      String(inviter?.email ?? '').split('@')[0] ||
      'Someone';

    const rendered = renderTripInvite({
      inviterName,
      tripTitle: String(trip.title || trip.tripDetails?.trip_title || 'a trip'),
      destination: trip.generationMeta?.request?.destination
        ? String(trip.generationMeta.request.destination)
        : undefined,
      role: String(invite.role ?? ''),
      expiresOn: formatDateRange(invite.expiresAt),
      inviteUrl: input.link,
    });

    await enqueueEmail({
      kind: 'trip.invite',
      to: email,
      ...rendered,
      dedupeKey: `trip-invite:${invite._id}:sent:${email.toLowerCase()}`,
    });
  });
}

export function notifyAgencyInvite(input: { invite: any; link: string }): Promise<void> {
  return safely('agency-invite', async () => {
    if (!mailIsConfigured()) return;
    const invite = input.invite;
    const email = String(invite?.email ?? '').trim();
    if (invite?.kind !== 'email' || !email) return;

    const agency = await loadAgency(invite.agencyId);
    if (!agency) return;

    const rendered = renderAgencyInvite({
      agencyName: agency.name,
      role: String(invite.role ?? ''),
      expiresOn: formatDateRange(invite.expiresAt),
      inviteUrl: input.link,
    });

    await enqueueEmail({
      kind: 'agency.invite',
      to: email,
      ...rendered,
      dedupeKey: `agency-invite:${invite._id}:sent:${email.toLowerCase()}`,
      agencyId: String(invite.agencyId),
    });
  });
}

export function notifyAgencyApplicationReceived(input: {
  application: any;
}): Promise<void> {
  return safely('agency-application-received', async () => {
    if (!mailIsConfigured()) return;
    const application = input.application;
    if (!application) return;
    const agencyName = String(application.name ?? 'your agency');

    const applicant = recipientForAddress(application.email);
    if (applicant) {
      const rendered = renderAgencyApplicationReceived({ agencyName });
      await enqueueEmail({
        kind: 'agency.application_received',
        to: applicant.email,
        ...rendered,
        dedupeKey: `agency-application:${application._id}:received:${applicant.email}`,
      });
    }

    const admins = await platformAdminRecipients();
    if (admins.length === 0) return;

    const rendered = renderPlatformApplicationReceived({
      agencyName,
      email: String(application.email ?? ''),
      phone: String(application.phone ?? ''),
      note: String(application.note ?? ''),
    });
    for (const admin of admins) {
      await enqueueEmail({
        kind: 'agency.application_received_admin',
        to: admin.email,
        toName: admin.name,
        ...rendered,
        dedupeKey: `agency-application:${application._id}:admin:${admin.email}`,
      });
    }
  });
}

export function notifyAgencyApplicationApproved(input: {
  applicationId: string;
  agencyName: string;
  workspace: string;
  email: string;
  credentialsIssued: boolean;
}): Promise<void> {
  return safely('agency-application-approved', async () => {
    if (!mailIsConfigured()) return;
    const recipient = recipientForAddress(input.email);
    if (!recipient) return;

    const rendered = renderAgencyApplicationApproved({
      agencyName: input.agencyName,
      workspace: input.workspace,
      email: recipient.email,
      credentialsIssued: input.credentialsIssued,
    });

    await enqueueEmail({
      kind: 'agency.application_approved',
      to: recipient.email,
      ...rendered,
      dedupeKey: `agency-application:${input.applicationId}:approved:${recipient.email}`,
    });
  });
}

export function notifyAgencyApplicationRejected(input: {
  applicationId: string;
  agencyName: string;
  email: string;
}): Promise<void> {
  return safely('agency-application-rejected', async () => {
    if (!mailIsConfigured()) return;
    const recipient = recipientForAddress(input.email);
    if (!recipient) return;

    const rendered = renderAgencyApplicationRejected({
      agencyName: input.agencyName,
    });

    await enqueueEmail({
      kind: 'agency.application_rejected',
      to: recipient.email,
      ...rendered,
      dedupeKey: `agency-application:${input.applicationId}:rejected:${recipient.email}`,
    });
  });
}

/** One email per owner account: the temporary password exists only once. */
export function notifyAgencyOwnerCredentials(input: {
  accountId: string;
  email: string;
  name?: string;
  agencyName: string;
  workspace: string;
  temporaryPassword: string;
}): Promise<void> {
  return safely('owner-credentials', async () => {
    if (!mailIsConfigured()) return;
    const recipient = recipientForAddress(input.email, input.name);
    if (!recipient) return;

    const rendered = renderAgencyCredentials({
      agencyName: input.agencyName,
      workspace: input.workspace,
      email: recipient.email,
      temporaryPassword: input.temporaryPassword,
      reset: false,
    });

    await enqueueEmail({
      kind: 'agency.owner_credentials',
      to: recipient.email,
      toName: recipient.name,
      ...rendered,
      dedupeKey: `agency-owner:${input.accountId}:credentials:${recipient.email}`,
    });
  });
}

export function notifyAgencyPasswordReset(input: {
  accountId: string;
  email: string;
  name?: string;
  agencyName: string;
  workspace: string;
  temporaryPassword: string;
  issuedAt: number;
}): Promise<void> {
  return safely('agency-password-reset', async () => {
    if (!mailIsConfigured()) return;
    const recipient = recipientForAddress(input.email, input.name);
    if (!recipient) return;

    const rendered = renderAgencyCredentials({
      agencyName: input.agencyName,
      workspace: input.workspace,
      email: recipient.email,
      temporaryPassword: input.temporaryPassword,
      reset: true,
    });

    await enqueueEmail({
      kind: 'agency.password_reset',
      to: recipient.email,
      toName: recipient.name,
      ...rendered,
      // A later reset must send a fresh mail, so the issuance time is the key.
      dedupeKey: `agency-reset:${input.accountId}:${input.issuedAt}:${recipient.email}`,
    });
  });
}

export function notifyPasswordReset(input: {
  userId: string;
  email: string;
  name?: string;
  resetTokenId: string;
  resetUrl: string;
  expiresMinutes: number;
}): Promise<void> {
  return safely('password-reset', async () => {
    if (!mailIsConfigured()) return;
    const recipient = recipientForAddress(input.email, input.name);
    if (!recipient) return;

    const rendered = renderPasswordReset({
      name: recipient.name,
      resetUrl: input.resetUrl,
      expiresMinutes: input.expiresMinutes,
    });

    await enqueueEmail({
      kind: 'auth.password_reset',
      to: recipient.email,
      toName: recipient.name,
      ...rendered,
      dedupeKey: `password-reset:${input.resetTokenId}:${recipient.email}`,
    });
  });
}

/* -------------------------------------------------------------------------- */
/*  P2: lifecycle and operations                                              */
/* -------------------------------------------------------------------------- */

/**
 * A tenant that changes state tells its owners. The key carries the moment of
 * the change so a later suspend/reactivate cycle still sends, while a repeated
 * click on the same change is absorbed by the change check in the caller.
 */
export function notifyAgencyStatusChanged(input: {
  agencyId: string;
  agencyName: string;
  workspace: string;
  status: 'suspended' | 'reactivated';
  occurredAt?: Date;
}): Promise<void> {
  return safely(`agency-${input.status}`, async () => {
    if (!mailIsConfigured()) return;
    const agency = await loadAgency(input.agencyId);
    const recipients = await agencyTeamRecipients(input.agencyId, {
      minRole: 'owner',
      fallbackEmail: agency?.fallbackEmail,
    });
    if (recipients.length === 0) return;

    const rendered = renderAgencyStatusChanged({
      agencyName: input.agencyName,
      workspace: input.workspace,
      status: input.status,
    });
    const occurredAt = (input.occurredAt ?? new Date()).toISOString();

    for (const recipient of recipients) {
      await enqueueEmail({
        kind: `agency.${input.status}`,
        to: recipient.email,
        toName: recipient.name,
        ...rendered,
        dedupeKey: `agency-status:${input.agencyId}:${input.status}:${occurredAt}:${recipient.email}`,
        agencyId: input.agencyId,
      });
    }
  });
}

/** Plan mail goes to the billing contact, or the owners when none is named. */
export function notifyAgencyPlanChanged(input: {
  agencyId: string;
  agencyName: string;
  workspace: string;
  previousTierId: string;
  tierId: string;
  seats: number;
  monthlyExports: number;
  storageMb: number;
  billing?: { contactEmail?: string | null; contactName?: string | null } | null;
  fallbackEmail?: string | null;
  occurredAt?: Date;
}): Promise<void> {
  return safely('agency-plan-changed', async () => {
    if (!mailIsConfigured()) return;
    const recipients = await agencyBillingRecipients(
      input.agencyId,
      input.billing,
      input.fallbackEmail
    );
    if (recipients.length === 0) return;

    const rendered = renderAgencyPlanChanged({
      agencyName: input.agencyName,
      workspace: input.workspace,
      previousTierId: input.previousTierId,
      tierId: input.tierId,
      seats: input.seats,
      monthlyExports: input.monthlyExports,
      storageMb: input.storageMb,
    });
    const occurredAt = (input.occurredAt ?? new Date()).toISOString();

    for (const recipient of recipients) {
      await enqueueEmail({
        kind: 'agency.plan_changed',
        to: recipient.email,
        toName: recipient.name,
        ...rendered,
        dedupeKey: `agency-plan:${input.agencyId}:${input.tierId}:${occurredAt}:${recipient.email}`,
        agencyId: input.agencyId,
      });
    }
  });
}
