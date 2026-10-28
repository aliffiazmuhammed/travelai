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
