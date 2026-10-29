import type {
  AgencyEnquiryBudgetBand,
  AgencyEnquiryStatus,
  AgencyInvitableRole,
  AgencyRole,
} from '@/types/agency';
import { formatDate } from '@/lib/date';

export const AGENCY_ROLE_LABELS: Record<AgencyRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  planner: 'Planner',
  viewer: 'Viewer',
};

export const AGENCY_INVITABLE_ROLES: AgencyInvitableRole[] = [
  'admin',
  'planner',
  'viewer',
];

export function agencyRoleLabel(role: AgencyRole | AgencyInvitableRole | string): string {
  return AGENCY_ROLE_LABELS[role as AgencyRole] ?? role;
}

export function agencyRoleBadgeClass(role: AgencyRole | AgencyInvitableRole | string): string {
  switch (role) {
    case 'owner':
      return 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
    case 'admin':
      return 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300';
    case 'planner':
      return 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-300';
    default:
      return 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300';
  }
}

export function formatAgencyDate(value: string | Date): string {
  return formatDate(value);
}

/* -------------------------------------------------------------------------- */
/*  Enquiry vocabulary (M9 D5)                                                */
/* -------------------------------------------------------------------------- */

export const AGENCY_ENQUIRY_STATUS_LABELS: Record<AgencyEnquiryStatus, string> = {
  new: 'New',
  replied: 'Replied',
  quoted: 'Quoted',
  won: 'Won',
  lost: 'Lost',
};

export const AGENCY_ENQUIRY_STATUSES: AgencyEnquiryStatus[] = [
  'new',
  'replied',
  'quoted',
  'won',
  'lost',
];

export function agencyEnquiryStatusBadgeClass(status: AgencyEnquiryStatus): string {
  switch (status) {
    case 'new':
      return 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300';
    case 'replied':
      return 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-300';
    case 'quoted':
      return 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300';
    case 'won':
      return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
    default:
      return 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300';
  }
}

export const AGENCY_ENQUIRY_BUDGET_LABELS: Record<AgencyEnquiryBudgetBand, string> = {
  under_25k: 'Under ₹25,000 per person',
  '25k_50k': '₹25,000 – ₹50,000 per person',
  '50k_1l': '₹50,000 – ₹1,00,000 per person',
  above_1l: 'Above ₹1,00,000 per person',
  not_sure: 'Not sure yet',
};

/**
 * The same funnel, in the traveller's words (M9 R6).
 *
 * The agency vocabulary describes its own pipeline (`new` = work to pick up,
 * `won` = revenue), which reads as an internal status on the traveller's
 * screens. These labels say what the traveller is waiting for instead, and
 * "Accepted" deliberately avoids implying a booking: accepting a proposal
 * confirms the quote, it does not take a payment.
 */
export const TRAVELLER_ENQUIRY_STATUS_LABELS: Record<AgencyEnquiryStatus, string> = {
  new: 'Sent',
  replied: 'Replied',
  quoted: 'Proposal ready',
  won: 'Accepted',
  lost: 'Closed',
};

/**
 * "Proposal ready" is a promise about the thread, not about the funnel: the
 * agency can send a quote before sharing the proposal document, and the
 * traveller must not go looking for something that is not there yet.
 */
export function travellerEnquiryStatusLabel(
  status: AgencyEnquiryStatus,
  hasLiveProposal: boolean
): string {
  if (status === 'quoted' && !hasLiveProposal) return 'In progress';
  return TRAVELLER_ENQUIRY_STATUS_LABELS[status];
}

export function travellerEnquiryStatusBadgeClass(
  status: AgencyEnquiryStatus,
  hasLiveProposal = true
): string {
  if (status === 'quoted' && !hasLiveProposal) {
    return 'border-border bg-muted text-foreground/75';
  }
  switch (status) {
    case 'replied':
      return 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-300';
    case 'quoted':
      return 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300';
    case 'won':
      return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
    default:
      return 'border-border bg-muted text-foreground/75';
  }
}
