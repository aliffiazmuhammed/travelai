import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  ClipboardList,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserRoundCog,
  Users,
} from 'lucide-react';
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

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const accounts = overview?.accounts;
  const agencies = overview?.agencies;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-slate-400">
            Signed in as {user?.email} in the isolated platform realm.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
          onClick={() => setReloadKey((key) => key + 1)}
          disabled={loading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-900 bg-rose-950/40 p-3.5 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      {loading && !overview ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-10 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading platform counts…
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-slate-800 bg-slate-900/70">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5 text-slate-400">
                <Users className="h-3.5 w-3.5" />
                Accounts
              </CardDescription>
              <CardTitle className="text-2xl text-slate-100">
                {accounts?.total ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5 text-[11px] text-slate-400">
              <span>{accounts?.personal ?? 0} personal</span>
              <span className="text-slate-600">·</span>
              <span>{accounts?.agency ?? 0} agency</span>
              <span className="text-slate-600">·</span>
              <span>{accounts?.platform ?? 0} platform</span>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/70">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5 text-slate-400">
                <Building2 className="h-3.5 w-3.5" />
                Agencies
              </CardDescription>
              <CardTitle className="text-2xl text-slate-100">
                {agencies?.total ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5 text-[11px] text-slate-400">
              <span className="text-emerald-400">{agencies?.active ?? 0} active</span>
              <span className="text-slate-600">·</span>
              <span className="text-amber-400">{agencies?.suspended ?? 0} suspended</span>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/70">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5 text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                Disabled accounts
              </CardDescription>
              <CardTitle className="text-2xl text-slate-100">
                {accounts?.disabled ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-[11px] text-slate-500">
              Sessions stop on the next request for a disabled account. Data is
              retained in its own realm.
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/70">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5 text-slate-400">
                <UserRoundCog className="h-3.5 w-3.5" />
                Platform admins
              </CardDescription>
              <CardTitle className="text-2xl text-slate-100">
                {accounts?.platform ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-[11px] text-slate-500">
              <Link to="/admin/platform-admins" className="text-indigo-300 hover:text-indigo-200">
                Manage super-admins →
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-slate-800 bg-slate-900/70 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-slate-100">
              <ClipboardList className="h-4 w-4 text-indigo-400" />
              Recent platform audit
            </CardTitle>
            <CardDescription className="text-slate-400">
              Sign-ins, password changes and account management. Secrets are stripped
              before write; tenant content is never recorded here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!overview || overview.recentAudit.length === 0 ? (
              <p className="text-xs text-slate-500">No platform audit events yet.</p>
            ) : (
              <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950/50">
                {overview.recentAudit.map((event) => (
                  <li
                    key={event._id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <code className="text-xs text-indigo-300">{event.action}</code>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {event.actorEmail ?? 'system'} · {event.targetType}
                        {event.targetId ? ` · ${event.targetId}` : ''}
                      </p>
                    </div>
                    <span className="whitespace-nowrap text-[11px] text-slate-500">
                      {formatAdminDate(event.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/70">
          <CardHeader>
            <CardTitle className="text-base text-slate-100">Directory shortcuts</CardTitle>
            <CardDescription className="text-slate-400">
              Identity metadata only — no tenant content.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Shortcut
              to="/admin/accounts"
              icon={<Users className="h-4 w-4" />}
              title="Account directory"
              description="Search all three realms and manage status."
            />
            <Shortcut
              to="/admin/platform-admins"
              icon={<UserRoundCog className="h-4 w-4" />}
              title="Platform admins"
              description="Add or disable the small super-admin set."
            />
            <Shortcut
              to="/admin/account"
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Your platform account"
              description="Rotate your own console password."
            />
            <Shortcut
              to="/admin/agencies"
              icon={<Building2 className="h-4 w-4" />}
              title="Agency provisioning"
              description="Create a tenant, owner login and forced first-login password."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const Shortcut: React.FC<{
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}> = ({ to, icon, title, description }) => (
  <Link
    to={to}
    className="block rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3 transition hover:border-slate-700 hover:bg-slate-950"
  >
    <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
      <span className="text-indigo-400">{icon}</span>
      {title}
    </div>
    <p className="mt-1 text-xs text-slate-500">{description}</p>
  </Link>
);

export default AdminOverview;
