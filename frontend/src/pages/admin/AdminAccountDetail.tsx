import React from 'react';
import {
  ArrowRight,
  Building2,
  ClipboardList,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PlatformAccountDetail } from '@/types';
import { AdminEmptyState, AdminLoadingPanel } from '@/components/admin/AdminEmptyState';
import { AdminNotice } from '@/components/admin/AdminNotice';
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
  /** Jump to another realm's row for the same email without leaving the sheet. */
  onOpenAccount?: (accountId: string) => void;
}

/**
 * Account detail drawer (PA2). Shows identity, realm/tenant, status, dates,
 * agency membership and platform audit events only. There is deliberately no
 * trip, client, quote or export data here: platform support needs identity
 * context, not tenant content.
 */
const AdminAccountDetail: React.FC<AdminAccountDetailProps> = ({
  open,
  onOpenChange,
  account,
  loading,
  error,
  onOpenAccount,
}) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Portalled content leaves the console tree, so it carries the dark scope. */}
      <SheetContent
        side="right"
        className="dark flex w-full flex-col gap-0 border-border bg-card p-0 text-card-foreground sm:max-w-lg"
      >
        <SheetHeader className="shrink-0 space-y-2 border-b border-border px-6 py-5 pr-12 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="flex items-center gap-2 text-base">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-500/15 text-indigo-300">
                <UserRound className="h-4 w-4" aria-hidden />
              </span>
              {account ? accountDisplayName(account) : 'Account detail'}
            </SheetTitle>
            {account ? <RealmBadge realm={account.accountType} /> : null}
            {account ? <StatusBadge status={account.status} /> : null}
          </div>
          <SheetDescription className="break-all">
            {account?.email ?? 'Identity and platform audit metadata.'}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <AdminLoadingPanel label="Loading account…" />
          ) : error ? (
            <AdminNotice tone="error" title="This account did not load">
              {error}
            </AdminNotice>
          ) : account ? (
            <div className="space-y-6">
              <section className="grid gap-2.5 sm:grid-cols-2">
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
                  <SectionTitle icon={Building2} tone="text-emerald-300">
                    Tenant
                  </SectionTitle>
                  <div className="mt-2 rounded-xl border border-border bg-muted/30 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{account.agency.name}</span>
                      <Badge
                        variant="outline"
                        className={
                          account.agency.status === 'active'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-[10px] uppercase text-emerald-300'
                            : 'border-amber-500/40 bg-amber-500/10 text-[10px] uppercase text-amber-300'
                        }
                      >
                        {account.agency.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Workspace slug:{' '}
                      <code className="rounded bg-background px-1 py-0.5 text-foreground/80">
                        {account.agency.slug}
                      </code>
                    </p>
                  </div>
                </section>
              ) : null}

              <section>
                <SectionTitle icon={ShieldCheck} tone="text-indigo-300">
                  Memberships
                </SectionTitle>
                {account.memberships.length === 0 ? (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    No agency membership. Personal and platform accounts are never
                    attached to a tenant.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {account.memberships.map((membership) => (
                      <li
                        key={`${membership.agency._id}-${membership.role}`}
                        className="rounded-xl border border-border bg-muted/30 px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm">
                            {membership.agency.name}{' '}
                            <span className="text-xs text-muted-foreground">
                              ({membership.agency.slug})
                            </span>
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase tracking-wide text-muted-foreground"
                          >
                            {membership.role}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Joined {formatAdminDate(membership.joinedAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <SectionTitle icon={UserRound} tone="text-indigo-300">
                  Related accounts with this email
                </SectionTitle>
                {account.relatedAccounts.length === 0 ? (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    No other realm or tenant uses this email.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {account.relatedAccounts.map((related) => (
                      <li key={related._id}>
                        <button
                          type="button"
                          onClick={() => onOpenAccount?.(related._id)}
                          disabled={!onOpenAccount}
                          className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-left transition hover:border-indigo-500/40 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-default disabled:hover:border-border disabled:hover:bg-muted/30"
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <RealmBadge realm={related.accountType} />
                            <StatusBadge status={related.status} />
                            <span className="text-xs text-muted-foreground">
                              {related.accountType === 'agency' && related.agency
                                ? `${related.agency.name} (${related.agency.slug})`
                                : related.name ?? 'No display name'}
                            </span>
                            {onOpenAccount ? (
                              <ArrowRight
                                className="ml-auto h-3.5 w-3.5 text-muted-foreground"
                                aria-hidden
                              />
                            ) : null}
                          </span>
                          <span className="mt-1 block break-all font-mono text-[10px] text-muted-foreground">
                            {related._id}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            Last sign-in {formatAdminDate(related.lastLoginAt)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <SectionTitle icon={ClipboardList} tone="text-indigo-300">
                  Recent platform audit
                </SectionTitle>
                {account.recentAudit.length === 0 ? (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    No platform audit events for this account yet.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-border/70 overflow-hidden rounded-xl border border-border">
                    {account.recentAudit.map((event) => (
                      <li key={event._id} className="px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <code className="text-xs font-medium text-indigo-300">
                            {event.action}
                          </code>
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            {formatAdminDate(event.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {event.actorEmail ?? 'system'} · {event.targetType}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
                <p className="text-[11px] leading-5 text-muted-foreground">
                  Tenant content is out of scope here by design. Use the agency
                  record for plan, members and public-directory state.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-7 rounded-full px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => onOpenChange(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <AdminEmptyState
              icon={UserRound}
              title="No account selected"
              description="Pick a row in the directory to see its identity and audit trail."
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

const SectionTitle: React.FC<{
  icon: React.ElementType;
  tone?: string;
  children: React.ReactNode;
}> = ({ icon: Icon, tone = 'text-muted-foreground', children }) => (
  <h3 className="flex items-center gap-2 text-sm font-semibold">
    <Icon className={`h-4 w-4 ${tone}`} aria-hidden />
    {children}
  </h3>
);

const Detail: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
    <p className={`mt-0.5 break-all text-sm ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
  </div>
);

export default AdminAccountDetail;
