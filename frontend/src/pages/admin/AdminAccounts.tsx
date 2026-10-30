import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  KeyRound,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Users,
} from 'lucide-react';
import { AdminEmptyState, AdminLoadingPanel } from '@/components/admin/AdminEmptyState';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { AdminSegmented } from '@/components/admin/AdminSegmented';
import {
  AdminTableFrame,
  adminTableHeadClass,
  adminTableRowClass,
} from '@/components/admin/AdminTableFrame';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const realmOptions: Array<{ value: PlatformRealmFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'personal', label: 'Personal' },
  { value: 'agency', label: 'Agency' },
  { value: 'platform', label: 'Platform' },
];

/**
 * `/admin/accounts` (PA2).
 *
 * One directory across three realms. The same email may appear more than once
 * (personal + one agency account per tenant + platform); each row keeps its own
 * realm and tenant labels. Actions apply to exactly one account id, so the row
 * for another realm is unaffected.
 */
const AdminAccounts: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [realm, setRealm] = useState<PlatformRealmFilter>(() => {
    const value = searchParams.get('realm');
    return value === 'personal' || value === 'agency' || value === 'platform'
      ? value
      : 'all';
  });
  const [status, setStatus] = useState<PlatformStatusFilter>(() =>
    searchParams.get('status') === 'disabled' || searchParams.get('status') === 'active'
      ? (searchParams.get('status') as PlatformStatusFilter)
      : 'all'
  );
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
  const [detail, setDetail] = useState<PlatformAccountDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const openedAccount = useRef<string | null>(null);

  const reload = () => setReloadKey((key) => key + 1);

  /** Filters are mirrored into the URL minus the `account` deep link. */
  const writeFilters = (next: { realm?: PlatformRealmFilter; status?: PlatformStatusFilter }) => {
    setSearchParams(
      (params) => {
        const copy = new URLSearchParams(params);
        const nextRealm = next.realm ?? realm;
        const nextStatus = next.status ?? status;
        if (nextRealm === 'all') copy.delete('realm');
        else copy.set('realm', nextRealm);
        if (nextStatus === 'all') copy.delete('status');
        else copy.set('status', nextStatus);
        return copy;
      },
      { replace: true }
    );
  };

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

  const openDetail = useCallback(
    async (accountId: string) => {
      openedAccount.current = accountId;
      setDetailOpen(true);
      setDetailError(null);
      setDetailLoading(true);
      setDetail((current) => (current?._id === accountId ? current : null));
      setSearchParams(
        (params) => {
          const copy = new URLSearchParams(params);
          copy.set('account', accountId);
          return copy;
        },
        { replace: true }
      );
      try {
        const result = await api.getPlatformAccount(accountId);
        setDetail(result.account);
      } catch (err) {
        setDetailError(err instanceof Error ? err.message : 'Could not load this account.');
      } finally {
        setDetailLoading(false);
      }
    },
    [setSearchParams]
  );

  const requestedAccount = searchParams.get('account');
  useEffect(() => {
    if (!requestedAccount) {
      openedAccount.current = null;
      return;
    }
    if (openedAccount.current === requestedAccount) return;
    void openDetail(requestedAccount);
  }, [requestedAccount, openDetail]);

  const closeDetail = (open: boolean) => {
    setDetailOpen(open);
    if (open) return;
    openedAccount.current = null;
    setSearchParams(
      (params) => {
        if (!params.has('account')) return params;
        const copy = new URLSearchParams(params);
        copy.delete('account');
        return copy;
      },
      { replace: true }
    );
  };

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
      <AdminPageHeader
        title="Accounts"
        description="Personal, agency and platform identities. The same email can exist once per realm and tenant, and each row is managed on its own."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-2 rounded-full px-3 text-xs"
            onClick={reload}
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

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <AdminSegmented
          ariaLabel="Filter accounts by realm"
          value={realm}
          options={realmOptions.map((option) => ({
            ...option,
            count: counts[option.value],
          }))}
          onChange={(value) => {
            setRealm(value);
            setPage(1);
            writeFilters({ realm: value });
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search email or name"
              className="h-9 w-full rounded-full pl-9 text-sm sm:w-64"
              aria-label="Search accounts"
            />
          </div>

          <Select
            value={status}
            onValueChange={(value) => {
              const next = value as PlatformStatusFilter;
              setStatus(next);
              setPage(1);
              writeFilters({ status: next });
            }}
          >
            <SelectTrigger className="h-9 w-36 rounded-full" aria-label="Filter by status">
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
        <AdminNotice tone="error" title="The directory did not load">
          {error}
        </AdminNotice>
      ) : null}

      <AdminTableFrame
        title="Directory"
        description="Click a name to open the full identity record."
        minWidth="880px"
        footer={
          <AdminPagination
            page={data?.page ?? page}
            totalPages={data?.totalPages ?? 1}
            total={data?.total}
            noun="account"
            loading={loading}
            onChange={setPage}
          />
        }
      >
        <thead>
          <tr>
            <th className={adminTableHeadClass}>Account</th>
            <th className={adminTableHeadClass}>Realm</th>
            <th className={adminTableHeadClass}>Tenant</th>
            <th className={adminTableHeadClass}>Status</th>
            <th className={adminTableHeadClass}>Created</th>
            <th className={adminTableHeadClass}>Last sign-in</th>
            <th className={`${adminTableHeadClass} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && accounts.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <AdminLoadingPanel label="Loading accounts…" />
              </td>
            </tr>
          ) : accounts.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <AdminEmptyState
                  icon={Users}
                  title="No accounts match these filters"
                  description="Try a different realm, status or search term."
                />
              </td>
            </tr>
          ) : (
            accounts.map((account) => (
              <tr key={account._id} className={adminTableRowClass}>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => void openDetail(account._id)}
                    className="group inline-flex flex-wrap items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    aria-label={`Open the record for ${account.email}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium group-hover:text-indigo-300 group-hover:underline group-hover:underline-offset-2">
                        {accountDisplayName(account)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {account.email}
                      </span>
                    </span>
                    {account.mustChangePassword ? (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300"
                      >
                        Temp password
                      </Badge>
                    ) : null}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <RealmBadge realm={account.accountType} />
                </td>
                <td className="px-4 py-3">
                  {account.agency ? (
                    <div>
                      <p className="text-sm">{account.agency.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {account.agency.slug} · {account.agency.status}
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={account.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                  {formatAdminDate(account.createdAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                  {formatAdminDate(account.lastLoginAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setStatusTarget({
                          account,
                          next: account.status === 'active' ? 'disabled' : 'active',
                        })
                      }
                      title={
                        account.status === 'active' ? 'Disable account' : 'Enable account'
                      }
                      aria-label={`${account.status === 'active' ? 'Disable' : 'Enable'} ${account.email}`}
                    >
                      {account.status === 'active' ? (
                        <ShieldOff className="h-4 w-4" aria-hidden />
                      ) : (
                        <ShieldCheck className="h-4 w-4" aria-hidden />
                      )}
                    </Button>

                    {account.accountType === 'agency' ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => setResetTarget(account)}
                        title="Reset workspace password"
                        aria-label={`Reset password for ${account.email}`}
                      >
                        <KeyRound className="h-4 w-4" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </AdminTableFrame>

      <AlertDialog
        open={statusTarget !== null}
        onOpenChange={(open) => {
          if (!open && !statusBusy) setStatusTarget(null);
        }}
      >
        <AlertDialogContent className="dark rounded-2xl border-border bg-card text-card-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Power className="h-4 w-4 text-indigo-400" aria-hidden />
              {statusTarget?.next === 'disabled' ? 'Disable account?' : 'Enable account?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              {statusTarget?.next === 'disabled'
                ? 'This signs the account out on its next request. Only this realm/tenant account is affected — the same email in another realm keeps working.'
                : 'This restores the account and lets the user sign in again.'}
              {statusTarget ? (
                <span className="mt-2 block break-all text-foreground/80">
                  {statusTarget.account.email}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusBusy}>Cancel</AlertDialogCancel>
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
              {statusBusy ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
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
        <AlertDialogContent className="dark rounded-2xl border-border bg-card text-card-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-400" aria-hidden />
              Reset workspace password?
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              A new one-time password will be issued and the account will be forced to
              change it at the next sign-in. Every existing session for this account is
              signed out. The personal account with the same email is not touched.
              {resetTarget ? (
                <span className="mt-2 block break-all text-foreground/80">
                  {resetTarget.email}
                  {resetTarget.agency ? ` · ${resetTarget.agency.slug}` : ''}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={resetBusy}
              onClick={(event) => {
                event.preventDefault();
                void confirmReset();
              }}
              className="bg-amber-600 text-white hover:bg-amber-500"
            >
              {resetBusy ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              Issue temporary password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AdminAccountDetail
        open={detailOpen}
        onOpenChange={closeDetail}
        account={detail}
        loading={detailLoading}
        error={detailError}
        onOpenAccount={(accountId) => void openDetail(accountId)}
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
