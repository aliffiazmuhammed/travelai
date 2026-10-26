import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/date';
import type { PlatformAccountStatus, PlatformAccountType } from '@/types';

/**
 * Shared presentation helpers for the PA2 console. Realm labels are always
 * explicit so two rows for the same email are never mistaken for one account.
 */

export function realmLabel(realm: PlatformAccountType): string {
  if (realm === 'agency') return 'Agency';
  if (realm === 'platform') return 'Platform';
  return 'Personal';
}

const realmClass: Record<PlatformAccountType, string> = {
  personal: 'border-sky-800 bg-sky-950/40 text-sky-300',
  agency: 'border-emerald-800 bg-emerald-950/40 text-emerald-300',
  platform: 'border-indigo-800 bg-indigo-950/40 text-indigo-300',
};

export const RealmBadge: React.FC<{ realm: PlatformAccountType }> = ({ realm }) => (
  <Badge
    variant="outline"
    className={cn('px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide', realmClass[realm])}
  >
    {realmLabel(realm)}
  </Badge>
);

export const StatusBadge: React.FC<{ status: PlatformAccountStatus }> = ({ status }) => (
  <Badge
    variant="outline"
    className={cn(
      'px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide',
      status === 'active'
        ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
        : 'border-rose-900 bg-rose-950/40 text-rose-300'
    )}
  >
    {status === 'active' ? 'Active' : 'Disabled'}
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
