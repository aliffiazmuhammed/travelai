import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  ClipboardList,
  Flag,
  Newspaper,
  RefreshCw,
  ShieldCheck,
  UserRoundCog,
  Users,
  UsersRound,
} from 'lucide-react';
import { AdminEmptyState, AdminLoadingPanel } from '@/components/admin/AdminEmptyState';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminStatTile } from '@/components/admin/AdminStatTile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/services/api';
import type { PlatformOverview } from '@/types';
import { usePlatformAuth } from '@/context/PlatformAuthContext';
import { formatAdminDate } from './accountMeta';

/**
 * `/admin` overview (PA2).
 *
 * Live realm/tenant counts and the newest platform audit events. Every number is
 * computed from identity metadata only; no tenant or personal trip content is
 * read for this page.
 */
const AdminOverview: React.FC = () => {
  const { user } = usePlatformAuth();
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [openReports, setOpenReports] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .getPlatformOverview()
      .then((result) => {
        if (!cancelled) setOverview(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load the overview.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // A queued report is the one number here that implies pending work, so it is
    // allowed to fail on its own without blanking the page.
    api
      .listModerationQueue('open', 1)
      .then((result) => {
        if (!cancelled) setOpenReports(result.totals.open);
      })
      .catch(() => {
        if (!cancelled) setOpenReports(null);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  const accounts = overview?.accounts;
  const agencies = overview?.agencies;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Overview"
        description={`Signed in as ${user?.email ?? 'an administrator'} in the isolated platform realm. Counts come from identity metadata only.`}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-2 rounded-full px-3 text-xs"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              aria-hidden
            />
            Refresh
          </Button>
        }
      />

      {error ? (
        <AdminNotice tone="error" title="The overview did not load">
          {error}
        </AdminNotice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStatTile
          icon={Users}
          tone="sky"
          label="Accounts"
          value={accounts?.total}
          hint={
            accounts
              ? `${accounts.personal} personal · ${accounts.agency} agency · ${accounts.platform} platform`
              : 'Across all three realms.'
          }
          to="/admin/accounts"
        />
        <AdminStatTile
          icon={Building2}
          tone="emerald"
          label="Agencies"
          value={agencies?.total}
          hint={
            agencies
              ? `${agencies.active} active · ${agencies.suspended} suspended`
              : 'Tenant records on the platform.'
          }
          to="/admin/agencies"
        />
        <AdminStatTile
          icon={Flag}
          tone={openReports === 0 ? 'slate' : 'amber'}
          label="Open reports"
          value={openReports}
          hint={
            openReports === null
              ? 'Queue unavailable right now.'
              : openReports === 0
                ? 'Nothing waiting for a decision.'
                : 'Reported content awaiting triage.'
          }
          to="/admin/reports"
        />
        <AdminStatTile
          icon={ShieldCheck}
          tone={accounts?.disabled ? 'rose' : 'slate'}
          label="Disabled accounts"
          value={accounts?.disabled}
          hint="Sessions stop on the next request. Data stays in its realm."
          to="/admin/accounts?status=disabled"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl border-border bg-card shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="min-w-0 space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4 text-indigo-400" aria-hidden />
                Recent platform audit
              </CardTitle>
              <CardDescription>
                Sign-ins, password changes and account management. Secrets are
                stripped before write; tenant content is never recorded here.
              </CardDescription>
            </div>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Link to="/admin/audit">Open audit</Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {loading && !overview ? (
              <AdminLoadingPanel label="Loading platform counts…" className="py-10" />
            ) : !overview || overview.recentAudit.length === 0 ? (
              <AdminEmptyState
                icon={ClipboardList}
                title="No platform events yet"
                description="The first sign-in, provisioning or account change will appear here."
                className="py-10"
              />
            ) : (
              <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border">
                {overview.recentAudit.map((event) => (
                  <li
                    key={event._id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <code className="text-xs font-medium text-indigo-300">
                        {event.action}
                      </code>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {event.actorEmail ?? 'system'} · {event.targetType}
                        {event.targetId ? ` · ${event.targetId}` : ''}
                      </p>
                    </div>
                    <span className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
                      {formatAdminDate(event.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-card shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Directory shortcuts</CardTitle>
            <CardDescription>
              The places an operator usually needs next.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Shortcut
              to="/admin/accounts"
              icon={Users}
              title="Account directory"
              description="Search all three realms and manage status."
            />
            <Shortcut
              to="/admin/agencies"
              icon={Building2}
              title="Agencies"
              description="Provision a tenant or review plan and members."
            />
            <Shortcut
              to="/admin/reports"
              icon={Flag}
              title="Reported content"
              description="De-list a public page or dismiss the report."
            />
            <Shortcut
              to="/admin/platform-admins"
              icon={UserRoundCog}
              title="Platform admins"
              description="Manage the small super-admin set."
            />
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">Running the platform</CardTitle>
            <CardDescription>
              The console is an isolated realm: personal and agency sessions never
              open it, and every action is attributed to your platform account.
            </CardDescription>
          </div>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 shrink-0 rounded-full px-3 text-xs"
          >
            <Link to="/admin/account">
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Your account
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 pt-0 sm:grid-cols-3">
          <Fact
            icon={UsersRound}
            title="Three realms, one directory"
            body="Personal, agency and platform accounts stay separate even when an email appears in more than one."
          />
          <Fact
            icon={Newspaper}
            title="Tenant content stays out"
            body="Audit rows name the actor and target id; trip, enquiry and document content is never copied in."
          />
          <Fact
            icon={ShieldCheck}
            title="Destructive actions ask twice"
            body="Suspending, disabling and resetting are confirmed, and the server refuses the last owner or last admin."
          />
        </CardContent>
      </Card>
    </div>
  );
};

const Shortcut: React.FC<{
  to: string;
  icon: React.ElementType;
  title: string;
  description: string;
}> = ({ to, icon: Icon, title, description }) => (
  <Link
    to={to}
    className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/30 px-3 py-2.5 transition hover:border-indigo-500/40 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
  >
    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-indigo-500/10 text-indigo-300">
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </span>
    <span className="min-w-0">
      <span className="block text-sm font-medium text-foreground">{title}</span>
      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
        {description}
      </span>
    </span>
  </Link>
);

const Fact: React.FC<{
  icon: React.ElementType;
  title: string;
  body: string;
}> = ({ icon: Icon, title, body }) => (
  <div className="rounded-xl border border-border/70 px-3 py-3">
    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
      <Icon className="h-3.5 w-3.5 text-indigo-300" aria-hidden />
      {title}
    </p>
    <p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p>
  </div>
);

export default AdminOverview;
