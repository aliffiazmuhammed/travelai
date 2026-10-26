import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Eye,
  KeyRound,
  Loader2,
  Power,
  RefreshCw,
  Search,
  ShieldOff,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/services/api';
import type {
  PlatformAccountDetail,
  PlatformAccountList,
  PlatformAccountRow,
  PlatformAccountStatus,
  PlatformRealmFilter,
  PlatformStatusFilter,
} from '@/types';
import { toast } from 'sonner';
import AdminAccountDetail from './AdminAccountDetail';
import AdminTemporaryPassword from './AdminTemporaryPassword';
import {
  accountDisplayName,
  formatAdminDate,
  RealmBadge,
  StatusBadge,
} from './accountMeta';

/**
 * `/admin/accounts` (PA2).
 *
 * One directory across three realms. The same email may appear more than once
 * (personal + one agency account per tenant + platform); each row keeps its own
 * realm and tenant labels. Actions apply to exactly one account id, so the row
 * for another realm is unaffected.
 */
const AdminAccounts: React.FC = () => {
  const [realm, setRealm] = useState<PlatformRealmFilter>('all');
  const [status, setStatus] = useState<PlatformStatusFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [data, setData] = useState<PlatformAccountList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusTarget, setStatusTarget] = useState<{
    account: PlatformAccountRow;
    next: PlatformAccountStatus;
  } | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const [resetTarget, setResetTarget] = useState<PlatformAccountRow | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [credential, setCredential] = useState<{
    email: string;
    password: string;
    workspace?: string;
  } | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [detail, setDetail] = useState<PlatformAccountDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const reload = () => setReloadKey((key) => key + 1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .listPlatformAccounts({
        q: debouncedSearch,
        realm,
        status,
        page,
        limit: 25,
      })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load accounts.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, realm, status, page, reloadKey]);

  const openDetail = async (accountId: string) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const result = await api.getPlatformAccount(accountId);
      setDetail(result.account);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Could not load this account.');
    } finally {
      setDetailLoading(false);
    }
  };

  // Deep link from the platform audit console (`?account=<id>`).
  useEffect(() => {
    const requested = searchParams.get('account');
    if (requested) void openDetail(requested);
  }, [searchParams]);

  const confirmStatusChange = async () => {
    if (!statusTarget) return;
    setStatusBusy(true);
    try {
      await api.updatePlatformAccountStatus(statusTarget.account._id, statusTarget.next);
      toast.success(
        statusTarget.next === 'disabled'
          ? 'Account disabled. Existing sessions stop working on their next request.'
          : 'Account enabled. The user can sign in again.'
      );
      setStatusTarget(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change the account status.');
    } finally {
      setStatusBusy(false);
    }
  };

  const confirmReset = async () => {
    if (!resetTarget) return;
    setResetBusy(true);
    try {
      const result = await api.resetPlatformAccountPassword(resetTarget._id);
      setCredential({
        email: result.email,
        password: result.temporaryPassword,
        workspace: result.workspace,
      });
      setResetTarget(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reset the password.');
    } finally {
      setResetBusy(false);
    }
  };

  const counts = data?.counts ?? { all: 0, personal: 0, agency: 0, platform: 0 };
  const accounts = data?.accounts ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Users className="h-5 w-5 text-indigo-400" />
            Accounts
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Personal, agency and platform identities. The same email can exist once
            per realm and tenant.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
          onClick={reload}
          disabled={loading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={realm}
          onValueChange={(value) => {
            setRealm(value as PlatformRealmFilter);
            setPage(1);
          }}
        >
          <TabsList className="h-auto flex-wrap gap-1 border border-slate-800 bg-slate-900 p-1">
            <TabsTrigger value="all" className="text-slate-300 data-[state=active]:bg-slate-800 data-[state=active]:text-white">
              All <span className="ml-1.5 text-[10px] text-slate-500">{counts.all}</span>
            </TabsTrigger>
            <TabsTrigger value="personal" className="text-slate-300 data-[state=active]:bg-slate-800 data-[state=active]:text-white">
              Personal <span className="ml-1.5 text-[10px] text-slate-500">{counts.personal}</span>
            </TabsTrigger>
            <TabsTrigger value="agency" className="text-slate-300 data-[state=active]:bg-slate-800 data-[state=active]:text-white">
              Agency <span className="ml-1.5 text-[10px] text-slate-500">{counts.agency}</span>
            </TabsTrigger>
            <TabsTrigger value="platform" className="text-slate-300 data-[state=active]:bg-slate-800 data-[state=active]:text-white">
              Platform <span className="ml-1.5 text-[10px] text-slate-500">{counts.platform}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search email or name"
              className="h-9 w-64 border-slate-700 bg-slate-950 pl-9 text-sm text-slate-100 placeholder:text-slate-500"
              aria-label="Search accounts"
            />
          </div>

          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as PlatformStatusFilter);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-36 border-slate-700 bg-slate-950 text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-900 bg-rose-950/40 p-3.5 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      <Card className="border-slate-800 bg-slate-900/60">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 font-semibold">Account</th>
                  <th className="px-4 py-3 font-semibold">Realm</th>
                  <th className="px-4 py-3 font-semibold">Tenant</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Last sign-in</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && accounts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-14 text-center text-sm text-slate-400">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading accounts…
                      </span>
                    </td>
                  </tr>
                ) : accounts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-14 text-center text-sm text-slate-400">
                      No accounts match this search.
                    </td>
                  </tr>
                ) : (
                  accounts.map((account) => (
                    <tr
                      key={account._id}
                      className="border-b border-slate-800/70 last:border-0 hover:bg-slate-900/70"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-100">
                              {accountDisplayName(account)}
                            </p>
                            <p className="truncate text-xs text-slate-500">{account.email}</p>
                          </div>
                          {account.mustChangePassword ? (
                            <Badge
                              variant="outline"
                              className="border-amber-800 bg-amber-950/40 text-[10px] text-amber-300"
                            >
                              Temp password
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RealmBadge realm={account.accountType} />
                      </td>
                      <td className="px-4 py-3">
                        {account.agency ? (
                          <div>
                            <p className="text-sm text-slate-200">{account.agency.name}</p>
                            <p className="text-xs text-slate-500">
                              {account.agency.slug} · {account.agency.status}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={account.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">
                        {formatAdminDate(account.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">
                        {formatAdminDate(account.lastLoginAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-slate-400 hover:bg-slate-800 hover:text-white"
                            onClick={() => void openDetail(account._id)}
                            title="View account detail"
                            aria-label={`View ${account.email}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-slate-400 hover:bg-slate-800 hover:text-white"
                            onClick={() =>
                              setStatusTarget({
                                account,
                                next: account.status === 'active' ? 'disabled' : 'active',
                              })
                            }
                            title={account.status === 'active' ? 'Disable account' : 'Enable account'}
                            aria-label={`${account.status === 'active' ? 'Disable' : 'Enable'} ${account.email}`}
                          >
                            {account.status === 'active' ? (
                              <ShieldOff className="h-4 w-4" />
                            ) : (
                              <ShieldCheck className="h-4 w-4" />
                            )}
                          </Button>

                          {account.accountType === 'agency' ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-slate-400 hover:bg-slate-800 hover:text-white"
                              onClick={() => setResetTarget(account)}
                              title="Reset workspace password"
                              aria-label={`Reset password for ${account.email}`}
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-4 py-3">
            <p className="text-xs text-slate-500">
              {data
                ? `${data.total} account${data.total === 1 ? '' : 's'} · page ${data.page} of ${data.totalPages}`
                : 'Loading accounts…'}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={!data || data.page <= 1 || loading}
              >
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                onClick={() => setPage((value) => value + 1)}
                disabled={!data || data.page >= data.totalPages || loading}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={statusTarget !== null}
        onOpenChange={(open) => {
          if (!open && !statusBusy) setStatusTarget(null);
        }}
      >
        <AlertDialogContent className="border-slate-800 bg-slate-900 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Power className="h-4 w-4 text-indigo-400" />
              {statusTarget?.next === 'disabled' ? 'Disable account?' : 'Enable account?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {statusTarget?.next === 'disabled'
                ? 'This signs the account out on its next request. Only this realm/tenant account is affected — the same email in another realm keeps working.'
                : 'This restores the account and lets the user sign in again.'}
              {statusTarget ? (
                <span className="mt-2 block break-all text-slate-300">
                  {statusTarget.account.email}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={statusBusy}
              className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={statusBusy}
              onClick={(event) => {
                event.preventDefault();
                void confirmStatusChange();
              }}
              className={
                statusTarget?.next === 'disabled'
                  ? 'bg-rose-600 text-white hover:bg-rose-500'
                  : 'bg-indigo-500 text-white hover:bg-indigo-400'
              }
            >
              {statusBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {statusTarget?.next === 'disabled' ? 'Disable account' : 'Enable account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open && !resetBusy) setResetTarget(null);
        }}
      >
        <AlertDialogContent className="border-slate-800 bg-slate-900 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-400" />
              Reset workspace password?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              A new one-time password will be issued and the account will be forced
              to change it at the next sign-in. Every existing session for this
              account is signed out. The personal account with the same email is not
              touched.
              {resetTarget ? (
                <span className="mt-2 block break-all text-slate-300">
                  {resetTarget.email}
                  {resetTarget.agency ? ` · ${resetTarget.agency.slug}` : ''}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={resetBusy}
              className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={resetBusy}
              onClick={(event) => {
                event.preventDefault();
                void confirmReset();
              }}
              className="bg-amber-600 text-white hover:bg-amber-500"
            >
              {resetBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Issue temporary password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AdminAccountDetail
        open={detailOpen}
        onOpenChange={(next) => {
          setDetailOpen(next);
          if (!next && searchParams.has('account')) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete('account');
            setSearchParams(nextParams, { replace: true });
          }
        }}
        account={detail}
        loading={detailLoading}
        error={detailError}
      />

      <AdminTemporaryPassword
        open={credential !== null}
        onOpenChange={(open) => {
          if (!open) setCredential(null);
        }}
        email={credential?.email ?? ''}
        temporaryPassword={credential?.password ?? ''}
        workspace={credential?.workspace}
      />
    </div>
  );
};

export default AdminAccounts;
