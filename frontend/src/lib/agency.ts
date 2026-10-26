import type { AgencyInvitableRole, AgencyRole } from '@/types/agency';
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
