import React from 'react';
import { Building2, ClipboardList, Loader2, ShieldCheck, UserRound } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { PlatformAccountDetail } from '@/types';
import {
  accountDisplayName,
  formatAdminDate,
  RealmBadge,
  StatusBadge,
} from './accountMeta';

interface AdminAccountDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: PlatformAccountDetail | null;
  loading: boolean;
  error?: string | null;
}

/**
 * Account detail drawer content (PA2). Shows identity, realm/tenant, status,
 * dates, agency membership and platform audit events only. There is deliberately
 * no trip, client, quote or export data here: platform support needs identity
 * context, not tenant content.
 */
const AdminAccountDetail: React.FC<AdminAccountDetailProps> = ({
  open,
  onOpenChange,
  account,
  loading,
  error,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-slate-800 bg-slate-900 text-slate-100 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <UserRound className="h-4 w-4 text-indigo-400" />
            {account ? accountDisplayName(account) : 'Account detail'}
            {account ? <RealmBadge realm={account.accountType} /> : null}
            {account ? <StatusBadge status={account.status} /> : null}
          </DialogTitle>
          <DialogDescription className="break-all text-slate-400">
            {account?.email ?? 'Identity and platform audit metadata.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading account…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-900 bg-rose-950/40 px-3.5 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : account ? (
          <div className="space-y-6">
            <section className="grid gap-3 sm:grid-cols-2">
              <Detail label="Account id" value={account._id} mono />
              <Detail label="Created" value={formatAdminDate(account.createdAt)} />
              <Detail label="Last sign-in" value={formatAdminDate(account.lastLoginAt)} />
              <Detail
                label="Password changed"
                value={formatAdminDate(account.passwordChangedAt)}
              />
              <Detail
                label="First-login change"
                value={account.mustChangePassword ? 'Required' : 'Completed'}
              />
              {account.platformRole ? (
                <Detail label="Platform role" value={account.platformRole} />
              ) : null}
            </section>

            {account.agency ? (
              <section>
                <SectionTitle icon={<Building2 className="h-4 w-4 text-emerald-400" />}>
                  Tenant
                </SectionTitle>
                <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-200">
                      {account.agency.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        account.agency.status === 'active'
                          ? 'border-emerald-800 bg-emerald-950/40 text-[10px] uppercase text-emerald-300'
                          : 'border-amber-800 bg-amber-950/40 text-[10px] uppercase text-amber-300'
                      }
                    >
                      {account.agency.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Workspace slug:{' '}
                    <code className="rounded bg-slate-900 px-1 py-0.5 text-slate-300">
                      {account.agency.slug}
                    </code>
                  </p>
                </div>
              </section>
            ) : null}

            <section>
              <SectionTitle icon={<ShieldCheck className="h-4 w-4 text-indigo-400" />}>
                Memberships
              </SectionTitle>
              {account.memberships.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  No agency membership. Personal and platform accounts are never
                  attached to a tenant.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {account.memberships.map((membership) => (
                    <li
                      key={`${membership.agency._id}-${membership.role}`}
                      className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm text-slate-200">
                          {membership.agency.name}{' '}
                          <span className="text-xs text-slate-500">
                            ({membership.agency.slug})
                          </span>
                        </span>
                        <Badge
                          variant="outline"
                          className="border-slate-700 text-[10px] uppercase tracking-wide text-slate-300"
                        >
                          {membership.role}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Joined {formatAdminDate(membership.joinedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <SectionTitle icon={<ClipboardList className="h-4 w-4 text-indigo-400" />}>
                Recent platform audit
              </SectionTitle>
              {account.recentAudit.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  No platform audit events for this account yet.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950/50">
                  {account.recentAudit.map((event) => (
                    <li key={event._id} className="px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <code className="text-xs text-indigo-300">{event.action}</code>
                        <span className="text-[11px] text-slate-500">
                          {formatAdminDate(event.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {event.actorEmail ?? 'system'} · {event.targetType}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

const SectionTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({
  icon,
  children,
}) => (
  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
    {icon}
    {children}
  </h3>
);

const Detail: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      {label}
    </p>
    <p className={`mt-0.5 break-all text-sm text-slate-200 ${mono ? 'font-mono text-xs' : ''}`}>
      {value}
    </p>
  </div>
);

export default AdminAccountDetail;
