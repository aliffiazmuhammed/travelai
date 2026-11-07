import AgencyMember from '../../models/AgencyMember.js';
import User from '../../models/User.js';
import { agencyCan, isAgencyRole, type AgencyRole } from '../agency/access.js';

/**
 * Who receives which transactional email (P0).
 *
 * Agency mail goes to the team inbox (planner and above), never to the public
 * `branding.contactEmail` unless the team has no usable address. Traveller mail
 * prefers the signed-in personal account and falls back to the contact card on
 * the enquiry or quote, which is what older rows carry.
 */
export interface EmailRecipient {
  email: string;
  name?: string;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanRecipient(email: unknown, name?: unknown): EmailRecipient | null {
  const value = String(email ?? '').trim().toLowerCase();
  if (!EMAIL_SHAPE.test(value)) return null;
  const label = String(name ?? '').trim();
  return label ? { email: value, name: label } : { email: value };
}

/** One row per address, first name wins, order preserved. */
export function dedupeRecipients(rows: Array<EmailRecipient | null>): EmailRecipient[] {
  const seen = new Set<string>();
  const out: EmailRecipient[] = [];
  for (const row of rows) {
    if (!row || seen.has(row.email)) continue;
    seen.add(row.email);
    out.push(row);
  }
  return out;
}

export interface AgencyRecipientOptions {
  /** Defaults to planner: viewers are read-only and never asked to act. */
  minRole?: AgencyRole;
  excludeUserIds?: string[];
  fallbackEmail?: string | null;
}

export async function agencyTeamRecipients(
  agencyId: unknown,
  options: AgencyRecipientOptions = {}
): Promise<EmailRecipient[]> {
  const minRole = options.minRole ?? 'planner';
  const excluded = new Set((options.excludeUserIds ?? []).map(String));

  const members = (await AgencyMember.find({ agencyId })
    .select('userId role')
    .lean()) as any[];

  const userIds = members
    .filter((member) => isAgencyRole(member?.role) && agencyCan(member.role, minRole))
    .map((member) => member?.userId)
    .filter((id) => id && !excluded.has(String(id)));

  if (userIds.length === 0) {
    const fallback = cleanRecipient(options.fallbackEmail);
    return fallback ? [fallback] : [];
  }

  const users = (await User.find({
    _id: { $in: userIds },
    accountType: 'agency',
    status: 'active',
  })
    .select('email name')
    .lean()) as any[];

  return dedupeRecipients(users.map((user) => cleanRecipient(user?.email, user?.name)));
}

/**
 * Billing mail goes to the named billing contact when there is one; otherwise
 * the owner team stands in, because money and plan changes are owner business.
 */
export async function agencyBillingRecipients(
  agencyId: unknown,
  billing: { contactEmail?: string | null; contactName?: string | null } | null | undefined,
  fallbackEmail?: string | null
): Promise<EmailRecipient[]> {
  const direct = cleanRecipient(billing?.contactEmail, billing?.contactName);
  if (direct) return [direct];
  return agencyTeamRecipients(agencyId, { minRole: 'owner', fallbackEmail });
}

export async function travellerRecipientForEnquiry(enquiry: any): Promise<EmailRecipient | null> {
  if (enquiry?.userId) {
    const user = (await User.findOne({
      _id: enquiry.userId,
      accountType: 'personal',
    })
      .select('email name')
      .lean()) as any;
    const recipient = cleanRecipient(user?.email, user?.name || enquiry?.contact?.name);
    if (recipient) return recipient;
  }
  return cleanRecipient(enquiry?.contact?.email, enquiry?.contact?.name);
}

/** The client on a quote: a signed-in traveller when linked, else the snapshot. */
export async function recipientForQuoteClient(
  quote: any,
  enquiry: any
): Promise<EmailRecipient | null> {
  const fromEnquiry = await travellerRecipientForEnquiry(enquiry);
  if (fromEnquiry) return fromEnquiry;
  return cleanRecipient(quote?.client?.email, quote?.client?.name);
}

export function recipientForEventInterest(interest: any): EmailRecipient | null {
  return cleanRecipient(interest?.email, interest?.name);
}

/** A plain address, used for applicants and other non-member recipients. */
export function recipientForAddress(
  email: unknown,
  name?: unknown
): EmailRecipient | null {
  return cleanRecipient(email, name);
}

/** Every active platform super-admin, one row per address. */
export async function platformAdminRecipients(): Promise<EmailRecipient[]> {
  const admins = (await User.find({
    accountType: 'platform',
    platformRole: 'super_admin',
    status: 'active',
  })
    .select('email name')
    .lean()) as any[];

  return dedupeRecipients(admins.map((admin) => cleanRecipient(admin?.email, admin?.name)));
}
