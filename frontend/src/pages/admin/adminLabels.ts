/**
 * One vocabulary for the console. Audit rows store machine names such as
 * `agency.application_approved`; the operator should read "Agency application
 * approved" everywhere, not a different casing per page.
 */

const AUDIT_ACTIONS: Record<string, string> = {
  'platform.signin': 'Platform sign-in',
  'platform.password_changed': 'Platform password changed',
  'account.disabled': 'Account disabled',
  'account.enabled': 'Account enabled',
  'account.password_reset': 'Account password reset',
  'member.password_reset': 'Member password reset',
  'platform_account.created': 'Platform account created',
  'platform_account.updated': 'Platform account updated',
  'plan.changed': 'Plan changed',
  'agency.plan_changed': 'Agency plan changed',
  'agency.member_invited': 'Agency member invited',
  'member.invited': 'Member invited',
  'agency.member_role_changed': 'Agency member role changed',
  'member.role_changed': 'Member role changed',
  'agency.member_removed': 'Agency member removed',
  'member.removed': 'Member removed',
  'agency.owner_transferred': 'Agency owner transferred',
  'agency.application_approved': 'Agency application approved',
  'agency.application_rejected': 'Agency application rejected',
  'agency.created': 'Agency created',
  'agency.owner_assigned': 'Agency owner assigned',
};

const TARGET_TYPES: Record<string, string> = {
  account: 'Account',
  platform_account: 'Platform account',
  agency: 'Agency',
  agency_application: 'Agency application',
  agencyinvite: 'Agency invite',
  agency_invite: 'Agency invite',
  user: 'User',
  trip: 'Trip',
  profile: 'Profile',
  package: 'Package',
  report: 'Report',
};

/** `some_machine_name` → `Some machine name`. */
export function humaniseLabel(value: string): string {
  const text = value
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return value;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function auditActionLabel(action: string): string {
  return AUDIT_ACTIONS[action.toLowerCase()] ?? humaniseLabel(action);
}

export function auditTargetLabel(targetType: string): string {
  return TARGET_TYPES[targetType.toLowerCase()] ?? humaniseLabel(targetType);
}

/** Agency lifecycle states are stored lowercase; show them capitalised. */
export function agencyStatusLabel(status: string): string {
  return humaniseLabel(status);
}

/** Membership states (`active`, `invited`, `removed`) read as one word. */
export function memberStatusLabel(status: string): string {
  return humaniseLabel(status);
}
