import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/date';
import type {
  PlatformAccountStatus,
  PlatformAccountType,
  PlatformAgencyStatus,
} from '@/types';

/**
 * Shared presentation helpers for the console. Realm labels are always explicit
 * so two rows for the same email are never mistaken for one account, and tenant
 * status uses the same colour in the list, the record and every dialog.
 */

export function realmLabel(realm: PlatformAccountType): string {
  if (realm === 'agency') return 'Agency';
  if (realm === 'platform') return 'Platform';
  return 'Personal';
}

const realmClass: Record<PlatformAccountType, string> = {
  personal: 'border-info/40 bg-info/10 text-info-ink',
  agency: 'border-success/40 bg-success/10 text-success-ink',
  platform: 'border-admin-accent/40 bg-admin-accent/10 text-admin-accent-ink',
};

export const RealmBadge: React.FC<{ realm: PlatformAccountType }> = ({ realm }) => (
  <Badge
    variant="outline"
    className={cn('px-1.5 py-0 text-overline font-semibold', realmClass[realm])}
  >
    {realmLabel(realm)}
  </Badge>
);

export const StatusBadge: React.FC<{ status: PlatformAccountStatus }> = ({ status }) => (
  <Badge
    variant="outline"
    className={cn(
      'px-1.5 py-0 text-overline font-semibold',
      status === 'active'
        ? 'border-success/40 bg-success/10 text-success-ink'
        : 'border-destructive/40 bg-destructive/10 text-destructive-ink'
    )}
  >
    {status === 'active' ? 'Active' : 'Disabled'}
  </Badge>
);

export const AgencyStatusBadge: React.FC<{ status: PlatformAgencyStatus }> = ({
  status,
}) => (
  <Badge
    variant="outline"
    className={cn(
      'px-1.5 py-0 text-overline font-semibold',
      status === 'active'
        ? 'border-success/40 bg-success/10 text-success-ink'
        : 'border-destructive/40 bg-destructive/10 text-destructive-ink'
    )}
  >
    {status}
  </Badge>
);

/** Plan tier is metadata, not a status, so it stays neutral. */
export const TierBadge: React.FC<{ tier: string }> = ({ tier }) => (
  <Badge
    variant="outline"
    className="px-1.5 py-0 text-overline font-semibold text-muted-foreground"
  >
    {tier}
  </Badge>
);

/** Locale date/time for the console; an em dash when the value is absent. */
export function formatAdminDate(value?: string): string {
  if (!value) return '—';
  return formatDateTime(value) || '—';
}

export function accountDisplayName(account: {
  name?: string;
  email: string;
}): string {
  return account.name?.trim() || account.email.split('@')[0] || account.email;
}
