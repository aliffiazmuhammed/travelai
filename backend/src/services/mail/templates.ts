import { env } from '../../config/env.js';
import { pickLinkOrigin } from '../collab/invites.js';
import { escapeHtml } from '../../utils/html.js';

/**
 * Transactional email templates (P0).
 *
 * Every function is pure: it takes already-loaded rows and returns the subject
 * plus both bodies. That keeps the copy reviewable and the tests free of a
 * database. The HTML is a single inline-styled layout because that is what
 * survives Gmail, Outlook and Apple Mail; the text part carries the same words
 * for clients that refuse HTML.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface EmailFact {
  label: string;
  value: string;
}

interface LayoutInput {
  heading: string;
  paragraphs: string[];
  facts?: EmailFact[];
  quote?: string;
  cta?: { label: string; url: string };
  footnote?: string;
}

const BODY_FONT =
  "Cabin,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** The SPA origin server-triggered mail should link to. */
export function appUrl(path: string): string {
  const base = pickLinkOrigin({}, env.FRONTEND_URL);
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Collapses whitespace so a subject can never contain a newline header. */
function oneLine(value: unknown, limit = 140): string {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/** A short, readable hint of a message body. */
export function excerpt(value: unknown, limit = 240): string {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatDateRange(
  start: Date | string | null | undefined,
  end?: Date | string | null
): string {
  const from = formatDate(start);
  const to = formatDate(end);
  if (!from) return '';
  if (!to || to === from) return from;
  return `${from} – ${to}`;
}

export function formatMoney(amount: unknown, currency: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  const integer = Number.isInteger(value);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      minimumFractionDigits: integer ? 0 : 2,
      maximumFractionDigits: integer ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency || 'INR'} ${value.toFixed(integer ? 0 : 2)}`;
  }
}

const BUDGET_LABELS: Record<string, string> = {
  under_25k: 'Under ₹25,000 per person',
  '25k_50k': '₹25,000–₹50,000 per person',
  '50k_1l': '₹50,000–₹1,00,000 per person',
  above_1l: 'Above ₹1,00,000 per person',
  not_sure: 'Still working it out',
};

function factRows(facts: EmailFact[] | undefined): string {
  if (!facts?.length) return '';
  const rows = facts
    .filter((fact) => fact.value)
    .map(
      (fact) => `<tr>
        <td style="padding:9px 15px;font-size:12px;color:#52665f;border-bottom:1px solid #d9e1dc;">${escapeHtml(fact.label)}</td>
        <td style="padding:9px 15px;font-size:13px;font-weight:600;color:#173f35;text-align:right;border-bottom:1px solid #d9e1dc;">${escapeHtml(fact.value)}</td>
      </tr>`
    )
    .join('');
  if (!rows) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 20px;background:#f7f3ea;border:1px solid #d9e1dc;border-radius:12px;border-collapse:separate;overflow:hidden;">${rows}</table>`;
}

function layout(input: LayoutInput): string {
  const paragraphs = input.paragraphs
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 13px;font-size:14px;line-height:1.65;color:#1d2925;">${escapeHtml(paragraph)}</p>`
    )
    .join('');

  const quote = input.quote
    ? `<div style="margin:4px 0 18px;padding:12px 16px;border-left:3px solid #9dbcb4;background:#edf3ef;border-radius:0 10px 10px 0;font-size:13px;line-height:1.6;color:#1d2925;">${escapeHtml(input.quote)}</div>`
    : '';

  const cta = input.cta
    ? `<div style="margin:22px 0 4px;"><a href="${escapeHtml(input.cta.url)}" style="display:inline-block;background:#173f35;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:10px;">${escapeHtml(input.cta.label)}</a></div>`
    : '';

  const footnote = input.footnote
    ? `<p style="margin:22px 0 0;font-size:11px;line-height:1.6;color:#52665f;">${escapeHtml(input.footnote)}</p>`
    : '';

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f7f3ea;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f3ea;padding:26px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #d9e1dc;border-radius:16px;">
      <tr><td style="padding:22px 28px 0;">
        <div style="font-family:${BODY_FONT};font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:lowercase;color:#173f35;">waytowalk</div>
      </td></tr>
      <tr><td style="padding:16px 28px 30px;font-family:${BODY_FONT};">
        <h1 style="margin:0 0 14px;font-size:20px;line-height:1.35;font-weight:650;color:#173f35;">${escapeHtml(input.heading)}</h1>
        ${paragraphs}
        ${quote}
        ${factRows(input.facts)}
        ${cta}
        ${footnote}
      </td></tr>
    </table>
    <p style="max-width:560px;margin:16px auto 0;font-family:${BODY_FONT};font-size:11px;line-height:1.6;color:#52665f;text-align:center;">waytowalk · Real journeys. Your way.</p>
  </td></tr>
</table>
</body></html>`;
}

function textBody(input: LayoutInput): string {
  const lines: string[] = [input.heading, ''];
  for (const paragraph of input.paragraphs.filter(Boolean)) lines.push(paragraph, '');
  if (input.quote) lines.push(input.quote, '');
  for (const fact of input.facts ?? []) {
    if (fact.value) lines.push(`${fact.label}: ${fact.value}`);
  }
  if (input.facts?.length) lines.push('');
  if (input.cta) lines.push(input.cta.label, input.cta.url, '');
  if (input.footnote) lines.push(input.footnote, '');
  lines.push('—', 'waytowalk');
  return `${lines.join('\n').trim()}\n`;
}

function render(input: LayoutInput, subject: string): RenderedEmail {
  return {
    subject: oneLine(subject),
    html: layout(input),
    text: textBody(input),
  };
}

/* -------------------------------------------------------------------------- */
/*  P0 templates                                                              */
/* -------------------------------------------------------------------------- */

export interface AgencyNewEnquiryData {
  agencyName: string;
  travellerName: string;
  message?: string;
  dates?: string;
  party?: string;
  budgetBand?: string | null;
  inboxUrl: string;
}

export function renderAgencyNewEnquiry(data: AgencyNewEnquiryData): RenderedEmail {
  const facts: EmailFact[] = [];
  if (data.dates) facts.push({ label: 'When', value: data.dates });
  if (data.party) facts.push({ label: 'Travellers', value: data.party });
  const budget = data.budgetBand ? BUDGET_LABELS[data.budgetBand] : undefined;
  if (budget) facts.push({ label: 'Budget', value: budget });

  return render(
    {
      heading: `${data.travellerName} sent you an enquiry`,
      paragraphs: [
        `${data.travellerName} found ${data.agencyName} in the waytowalk directory and wrote to you directly. A reply while it is fresh is what usually turns an enquiry into a trip.`,
      ],
      quote: data.message,
      facts,
      cta: { label: 'Open the enquiry', url: data.inboxUrl },
      footnote: `You are getting this because you are on the ${data.agencyName} team in waytowalk.`,
    },
    `New enquiry from ${data.travellerName}`
  );
}

export interface TravellerAgencyReplyData {
  agencyName: string;
  travellerName: string;
  message?: string;
  threadUrl: string;
}

export function renderTravellerAgencyReply(data: TravellerAgencyReplyData): RenderedEmail {
  return render(
    {
      heading: `${data.agencyName} replied to you`,
      paragraphs: [
        `${data.agencyName} answered your enquiry. You can read the whole thread and reply from your waytowalk inbox.`,
      ],
      quote: data.message,
      cta: { label: 'Read the reply', url: data.threadUrl },
      footnote: 'You are getting this because you sent an enquiry through waytowalk.',
    },
    `${data.agencyName} replied to your enquiry`
  );
}

export interface AgencyTravellerReplyData {
  agencyName: string;
  travellerName: string;
  message?: string;
  inboxUrl: string;
}

export function renderAgencyTravellerReply(data: AgencyTravellerReplyData): RenderedEmail {
  return render(
    {
      heading: `${data.travellerName} replied`,
      paragraphs: [
        `${data.travellerName} added a message to their enquiry with ${data.agencyName}.`,
      ],
      quote: data.message,
      cta: { label: 'Open the thread', url: data.inboxUrl },
      footnote: `You are getting this because you are on the ${data.agencyName} team in waytowalk.`,
    },
    `${data.travellerName} replied on your enquiry`
  );
}

export interface TravellerQuoteSentData {
  agencyName: string;
  travellerName: string;
  quoteNumber: string;
  total: string;
  validUntil?: string;
  threadUrl: string;
}

export function renderTravellerQuoteSent(data: TravellerQuoteSentData): RenderedEmail {
  const facts: EmailFact[] = [
    { label: 'Proposal', value: data.quoteNumber },
    { label: 'Total', value: data.total },
  ];
  if (data.validUntil) facts.push({ label: 'Valid until', value: data.validUntil });

  return render(
    {
      heading: `Your proposal from ${data.agencyName} is ready`,
      paragraphs: [
        `${data.agencyName} put together a proposal for your trip. Open it to see the plan and the price, then accept it or keep the conversation going from the same thread.`,
      ],
      facts,
      cta: { label: 'View your proposal', url: data.threadUrl },
      footnote: 'You are getting this because you are planning this trip with an agency on waytowalk.',
    },
    `Your ${data.agencyName} proposal is ready`
  );
}

export interface TravellerProposalSharedData {
  agencyName: string;
  clientName: string;
  quoteNumber: string;
  total: string;
  expiresOn?: string;
  proposalUrl: string;
}

export function renderTravellerProposalShared(data: TravellerProposalSharedData): RenderedEmail {
  const facts: EmailFact[] = [
    { label: 'Proposal', value: data.quoteNumber },
    { label: 'Total', value: data.total },
  ];
  if (data.expiresOn) facts.push({ label: 'Link valid until', value: data.expiresOn });

  return render(
    {
      heading: `${data.agencyName} sent you a proposal`,
      paragraphs: [
        `Hi ${data.clientName}, ${data.agencyName} shared a proposal for your trip. The link below opens the document they prepared — no account needed.`,
      ],
      facts,
      cta: { label: 'Open the proposal', url: data.proposalUrl },
      footnote: `You are getting this because ${data.agencyName} prepared this proposal for you.`,
    },
    `${data.agencyName} sent you a proposal`
  );
}

export interface AgencyProposalAnswerData {
  agencyName: string;
  travellerName: string;
  quoteNumber: string;
  total: string;
  answer: 'accepted' | 'declined';
  inboxUrl: string;
}

export function renderAgencyProposalAccepted(data: AgencyProposalAnswerData): RenderedEmail {
  return render(
    {
      heading: `${data.travellerName} accepted your proposal`,
      paragraphs: [
        `Good news — ${data.travellerName} said yes to the proposal you sent. The lead is marked won in your inbox, and the thread is still open for the practical details.`,
      ],
      facts: [
        { label: 'Proposal', value: data.quoteNumber },
        { label: 'Total', value: data.total },
      ],
      cta: { label: 'Open the lead', url: data.inboxUrl },
      footnote: `You are getting this because you are on the ${data.agencyName} team in waytowalk.`,
    },
    `${data.travellerName} accepted proposal ${data.quoteNumber}`
  );
}

export function renderAgencyProposalDeclined(data: AgencyProposalAnswerData): RenderedEmail {
  return render(
    {
      heading: `${data.travellerName} declined this proposal`,
      paragraphs: [
        `${data.travellerName} passed on the version you sent. The conversation is still open, so a different plan or a quick note about what did not fit is often all it takes.`,
      ],
      facts: [
        { label: 'Proposal', value: data.quoteNumber },
        { label: 'Total', value: data.total },
      ],
      cta: { label: 'Open the thread', url: data.inboxUrl },
      footnote: `You are getting this because you are on the ${data.agencyName} team in waytowalk.`,
    },
    `${data.travellerName} declined proposal ${data.quoteNumber}`
  );
}

export interface AgencyEventInterestData {
  agencyName: string;
  travellerName: string;
  eventTitle: string;
  eventDates?: string;
  note?: string;
  rosterUrl: string;
}

export function renderAgencyEventInterest(data: AgencyEventInterestData): RenderedEmail {
  return render(
    {
      heading: `${data.travellerName} is interested in ${data.eventTitle}`,
      paragraphs: [
        `Someone put their hand up for ${data.eventTitle}. Their contact details are on the roster, and confirming a spot is one click.`,
      ],
      quote: data.note,
      facts: data.eventDates ? [{ label: 'When', value: data.eventDates }] : [],
      cta: { label: 'Open the roster', url: data.rosterUrl },
      footnote: `You are getting this because you are on the ${data.agencyName} team in waytowalk.`,
    },
    `${data.travellerName} is interested in ${data.eventTitle}`
  );
}

export interface TravellerEventDecisionData {
  agencyName: string;
  travellerName: string;
  eventTitle: string;
  eventDates?: string;
  status: 'confirmed' | 'declined';
  eventUrl: string;
}

export function renderTravellerEventDecision(data: TravellerEventDecisionData): RenderedEmail {
  const confirmed = data.status === 'confirmed';
  return render(
    {
      heading: confirmed
        ? `You're confirmed for ${data.eventTitle}`
        : `An update on ${data.eventTitle}`,
      paragraphs: confirmed
        ? [
            `Hi ${data.travellerName}, ${data.agencyName} confirmed your spot. They will be in touch with the next steps, and the event page has the details you need.`,
          ]
        : [
            `Hi ${data.travellerName}, ${data.agencyName} could not offer you a spot on this one. If the dates still work, reply to them — agencies often have another departure or a similar trip.`,
          ],
      facts: data.eventDates ? [{ label: 'When', value: data.eventDates }] : [],
      cta: { label: 'View the event', url: data.eventUrl },
      footnote: 'You are getting this because you told this agency you were interested in the event.',
    },
    confirmed ? `You're confirmed for ${data.eventTitle}` : `An update on ${data.eventTitle}`
  );
}

/* -------------------------------------------------------------------------- */
/*  P1: account and access                                                    */
/* -------------------------------------------------------------------------- */

const ROLE_LABELS: Record<string, string> = {
  admin: 'admin',
  planner: 'planner',
  editor: 'editor',
  commenter: 'commenter',
  viewer: 'viewer',
};

function roleLabel(role: unknown): string {
  return ROLE_LABELS[String(role ?? '')] ?? 'member';
}

export interface TripInviteData {
  inviterName: string;
  tripTitle: string;
  destination?: string;
  role: string;
  expiresOn?: string;
  inviteUrl: string;
}

export function renderTripInvite(data: TripInviteData): RenderedEmail {
  const facts: EmailFact[] = [{ label: 'Your role', value: roleLabel(data.role) }];
  if (data.destination) facts.push({ label: 'Destination', value: data.destination });
  if (data.expiresOn) facts.push({ label: 'Invite expires', value: data.expiresOn });

  return render(
    {
      heading: `${data.inviterName} invited you to ${data.tripTitle}`,
      paragraphs: [
        `${data.inviterName} is planning this trip on waytowalk and would like you in it. Open the invitation to see the plan and join the group.`,
      ],
      facts,
      cta: { label: 'Open the invitation', url: data.inviteUrl },
      footnote: 'You are getting this because someone invited this email address to a trip on waytowalk.',
    },
    `${data.inviterName} invited you to ${data.tripTitle}`
  );
}

export interface AgencyInviteData {
  agencyName: string;
  role: string;
  expiresOn?: string;
  inviteUrl: string;
}

export function renderAgencyInvite(data: AgencyInviteData): RenderedEmail {
  const facts: EmailFact[] = [{ label: 'Your role', value: roleLabel(data.role) }];
  if (data.expiresOn) facts.push({ label: 'Invite expires', value: data.expiresOn });

  return render(
    {
      heading: `${data.agencyName} invited you to their workspace`,
      paragraphs: [
        `${data.agencyName} uses waytowalk to plan trips and answer enquiries. Accept the invitation to open the workspace with the access they chose for you.`,
      ],
      facts,
      cta: { label: 'Open the invitation', url: data.inviteUrl },
      footnote: `You are getting this because ${data.agencyName} invited this email address to their workspace.`,
    },
    `You're invited to the ${data.agencyName} workspace`
  );
}

export interface AgencyApplicationReceivedData {
  agencyName: string;
}

export function renderAgencyApplicationReceived(
  data: AgencyApplicationReceivedData
): RenderedEmail {
  return render(
    {
      heading: `We have your application, ${data.agencyName}`,
      paragraphs: [
        'Thanks for applying to bring your agency onto waytowalk. A person reviews every application, so this is not an automated yes or no.',
        'You do not need to do anything else right now. We will email you at this address once there is a decision.',
      ],
      cta: { label: 'See how waytowalk works for agencies', url: appUrl('/agencies') },
      footnote: 'You are getting this because this email address was used on a waytowalk agency application.',
    },
    `We received your waytowalk application`
  );
}

export interface PlatformApplicationReceivedData {
  agencyName: string;
  email: string;
  phone: string;
  note?: string;
}

export function renderPlatformApplicationReceived(
  data: PlatformApplicationReceivedData
): RenderedEmail {
  return render(
    {
      heading: `${data.agencyName} applied to join waytowalk`,
      paragraphs: ['A new agency application is waiting for review.'],
      facts: [
        { label: 'Agency', value: data.agencyName },
        { label: 'Contact email', value: data.email },
        { label: 'Phone', value: data.phone },
      ],
      quote: data.note,
      cta: { label: 'Review applications', url: appUrl('/admin/applications') },
      footnote: 'You are getting this because you are a waytowalk platform admin.',
    },
    `New agency application: ${data.agencyName}`
  );
}

export interface AgencyApplicationApprovedData {
  agencyName: string;
  workspace: string;
  email: string;
  credentialsIssued: boolean;
}

export function renderAgencyApplicationApproved(
  data: AgencyApplicationApprovedData
): RenderedEmail {
  return render(
    {
      heading: `Your ${data.agencyName} workspace is ready`,
      paragraphs: [
        `Your application was approved and the ${data.agencyName} workspace has been created.`,
        data.credentialsIssued
          ? 'We sent your sign-in details in a separate email. Use them at the workspace sign-in page, and choose your own password when asked.'
          : 'Sign in with the workspace password you already use.',
      ],
      facts: [
        { label: 'Workspace', value: data.workspace },
        { label: 'Sign-in email', value: data.email },
      ],
      cta: { label: 'Open the workspace', url: appUrl('/agency/login') },
      footnote: 'You are getting this because your waytowalk agency application was approved.',
    },
    `${data.agencyName}: your waytowalk workspace is ready`
  );
}

export interface AgencyApplicationRejectedData {
  agencyName: string;
}

export function renderAgencyApplicationRejected(
  data: AgencyApplicationRejectedData
): RenderedEmail {
  return render(
    {
      heading: 'An update on your waytowalk application',
      paragraphs: [
        `Thanks for taking the time to apply with ${data.agencyName}. We are not moving forward with this application right now.`,
        'If things change on your side, you are welcome to apply again. In the meantime, the agency directory shows what the workspace is built for.',
      ],
      cta: { label: 'Visit the agency directory', url: appUrl('/agencies') },
      footnote: 'You are getting this because this email address was used on a waytowalk agency application.',
    },
    'An update on your waytowalk application'
  );
}

export interface AgencyCredentialsData {
  agencyName: string;
  workspace: string;
  email: string;
  temporaryPassword: string;
  reset: boolean;
}

export function renderAgencyCredentials(data: AgencyCredentialsData): RenderedEmail {
  const heading = data.reset
    ? `Your ${data.agencyName} password was reset`
    : `Your ${data.agencyName} workspace is ready`;
  const paragraphs = data.reset
    ? [
        'A waytowalk operator issued a new temporary password for your workspace account.',
        'Sign in with it below, then choose your own password when prompted.',
      ]
    : [
        `An account has been created for you as the owner of ${data.agencyName} on waytowalk.`,
        'Sign in with the details below. You will be asked to choose your own password on the first sign-in.',
      ];

  return render(
    {
      heading,
      paragraphs,
      facts: [
        { label: 'Workspace', value: data.workspace },
        { label: 'Email', value: data.email },
        { label: 'Temporary password', value: data.temporaryPassword },
      ],
      cta: { label: 'Sign in to your workspace', url: appUrl('/agency/login') },
      footnote:
        'This temporary password works once and should not be shared. If it no longer works, your waytowalk contact can issue a new one.',
    },
    data.reset
      ? `Your ${data.agencyName} workspace password was reset`
      : `Your ${data.agencyName} workspace sign-in details`
  );
}

export interface PasswordResetData {
  name?: string;
  resetUrl: string;
  expiresMinutes: number;
}

export function renderPasswordReset(data: PasswordResetData): RenderedEmail {
  const greeting = data.name ? `Hi ${data.name}` : 'Hi there';
  return render(
    {
      heading: 'Choose a new waytowalk password',
      paragraphs: [
        `${greeting}, we received a request to reset the password for this account. Use the button below to choose a new one. The link works once and expires in ${data.expiresMinutes} minutes.`,
        'If you did not ask for this, you can ignore this email. Your password stays exactly as it is.',
      ],
      cta: { label: 'Reset your password', url: data.resetUrl },
      footnote: 'You are getting this because someone asked to reset the password for this waytowalk account.',
    },
    'Reset your waytowalk password'
  );
}

/* -------------------------------------------------------------------------- */
/*  P2: lifecycle and operations                                              */
/* -------------------------------------------------------------------------- */

/** Turns a tier id such as `pro` or `team_plus` into display copy. */
export function planLabel(tierId: unknown): string {
  const clean = String(tierId ?? '').trim();
  if (!clean) return 'your plan';
  const words = clean.replace(/[_-]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface AgencyStatusChangedData {
  agencyName: string;
  workspace: string;
  status: 'suspended' | 'reactivated';
}

export function renderAgencyStatusChanged(data: AgencyStatusChangedData): RenderedEmail {
  const suspended = data.status === 'suspended';
  return render(
    {
      heading: suspended
        ? `Your ${data.agencyName} workspace is paused`
        : `Your ${data.agencyName} workspace is active again`,
      paragraphs: suspended
        ? [
            `Access to the ${data.agencyName} workspace has been paused. Your trips, enquiries and records are kept exactly as they were, and public links stop serving while the workspace is paused.`,
            'Reply to this email if you need to talk through what happens next.',
          ]
        : [
            `The ${data.agencyName} workspace is active again. Your team can sign in with the same email and password as before.`,
          ],
      facts: [{ label: 'Workspace', value: data.workspace }],
      cta: suspended
        ? undefined
        : { label: 'Sign in to your workspace', url: appUrl('/agency/login') },
      footnote: `You are getting this because you own the ${data.agencyName} workspace on waytowalk.`,
    },
    suspended
      ? `${data.agencyName}: workspace access paused`
      : `${data.agencyName}: workspace access restored`
  );
}

export interface AgencyPlanChangedData {
  agencyName: string;
  workspace: string;
  previousTierId: string;
  tierId: string;
  seats: number;
  monthlyExports: number;
  storageMb: number;
}

export function renderAgencyPlanChanged(data: AgencyPlanChangedData): RenderedEmail {
  const current = planLabel(data.tierId);
  return render(
    {
      heading: `Your ${data.agencyName} plan is now ${current}`,
      paragraphs: [
        `The waytowalk workspace for ${data.agencyName} now runs on the ${current} plan. The limits below apply from your next action; nothing already saved is removed.`,
      ],
      facts: [
        { label: 'Previous plan', value: planLabel(data.previousTierId) },
        { label: 'New plan', value: current },
        { label: 'Seats', value: String(data.seats) },
        { label: 'Exports each month', value: String(data.monthlyExports) },
        { label: 'Storage', value: `${data.storageMb} MB` },
      ],
      cta: { label: 'Open your workspace', url: appUrl('/agency/login') },
      footnote: 'You are getting this because you are the billing contact for this waytowalk workspace.',
    },
    `${data.agencyName}: your plan is now ${current}`
  );
}

export interface AgencyRenewalReminderData {
  agencyName: string;
  workspace: string;
  renewalOn: string;
  plan?: string;
}

export function renderAgencyRenewalReminder(data: AgencyRenewalReminderData): RenderedEmail {
  const facts: EmailFact[] = [{ label: 'Renewal date', value: data.renewalOn }];
  if (data.plan) facts.push({ label: 'Plan', value: data.plan });

  return render(
    {
      heading: `${data.agencyName} renews on ${data.renewalOn}`,
      paragraphs: [
        'This is a heads-up from the renewal date on your waytowalk record. No payment is taken through waytowalk today, so nothing will be charged automatically.',
        'If the date, plan or billing contact is wrong, reply before the renewal date and it can be corrected.',
      ],
      facts,
      cta: { label: 'Open your workspace', url: appUrl('/agency/login') },
      footnote: 'You are getting this because you are the billing contact for this waytowalk workspace.',
    },
    `${data.agencyName}: renewal on ${data.renewalOn}`
  );
}

export interface TravellerEventReminderData {
  agencyName: string;
  travellerName: string;
  eventTitle: string;
  eventDates: string;
  destination?: string;
  eventUrl: string;
}

export function renderTravellerEventReminder(
  data: TravellerEventReminderData
): RenderedEmail {
  const facts: EmailFact[] = [];
  if (data.eventDates) facts.push({ label: 'When', value: data.eventDates });
  if (data.destination) facts.push({ label: 'Where', value: data.destination });

  return render(
    {
      heading: `Your ${data.eventTitle} is almost here`,
      paragraphs: [
        `Hi ${data.travellerName}, ${data.agencyName} has you on the confirmed list and the event starts soon. Keep this email handy for the dates.`,
      ],
      facts,
      cta: { label: 'View the event', url: data.eventUrl },
      footnote: 'You are getting this because you are confirmed for this waytowalk event.',
    },
    `Coming up: ${data.eventTitle}`
  );
}

export interface AgencyWeeklyDigestData {
  agencyName: string;
  weekLabel: string;
  inboxUrl: string;
  newEnquiries: number;
  quotesSent: number;
  proposalsAccepted: number;
  proposalsDeclined: number;
  upcomingEvents: number;
}

export function renderAgencyWeeklyDigest(data: AgencyWeeklyDigestData): RenderedEmail {
  const facts: EmailFact[] = [];
  const add = (label: string, count: number) => {
    if (count > 0) facts.push({ label, value: String(count) });
  };
  add('New enquiries', data.newEnquiries);
  add('Quotes sent', data.quotesSent);
  add('Proposals accepted', data.proposalsAccepted);
  add('Proposals declined', data.proposalsDeclined);
  add('Events in the next 7 days', data.upcomingEvents);

  return render(
    {
      heading: `Your week at ${data.agencyName}`,
      paragraphs: [
        `Here is what moved in your workspace for the week of ${data.weekLabel}. Open the inbox to pick up anything that still needs an answer.`,
      ],
      facts,
      cta: { label: 'Open the enquiry inbox', url: data.inboxUrl },
      footnote: 'You are getting this weekly summary because you are on a waytowalk agency team.',
    },
    `${data.agencyName}: your week on waytowalk`
  );
}
