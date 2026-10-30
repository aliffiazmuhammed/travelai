import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  UserRoundCog,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { AdminSegmented } from '@/components/admin/AdminSegmented';
import {
  AdminTableFrame,
  adminTableHeadClass,
  adminTableRowClass,
} from '@/components/admin/AdminTableFrame';
import { usePlatformAuth } from '@/context/PlatformAuthContext';
import { api } from '@/services/api';
import type {
  PlatformAccountStatus,
  PlatformAdminList,
  PlatformAccountRow,
  PlatformStatusFilter,
} from '@/types';
import { toast } from 'sonner';
import AdminTemporaryPassword from './AdminTemporaryPassword';
import {
  accountDisplayName,
  formatAdminDate,
  StatusBadge,
} from './accountMeta';

/**
 * `/admin/platform-admins` (PA2).
 *
 * The platform realm has no public signup, so this page is the only way to add
 * another super-admin after the bootstrap CLI. Two invariants are enforced by
 * the server and mirrored here: you cannot disable yourself, and the last
 * active super-admin cannot be disabled.
 */

const STATUS_OPTIONS: Array<{ value: PlatformStatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
];

const AdminPlatformAdmins: React.FC = () => {
  const { user } = usePlatformAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<PlatformStatusFilter>('all');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [data, setData] = useState<PlatformAdminList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [credential, setCredential] = useState<{
    email: string;
    password: string;
  } | null>(null);

  const [statusTarget, setStatusTarget] = useState<{
    account: PlatformAccountRow;
    next: PlatformAccountStatus;
  } | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const reload = () => setReloadKey((key) => key + 1);

  // The ⌘K palette opens this dialog with `?new=1`; the param is consumed so a
  // refresh or back-navigation does not reopen it.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setCreateError(null);
    setCreateOpen(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('new');
        return next;
      },
      { replace: true }
    );
  }, [searchParams, setSearchParams]);

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
      .listPlatformAdmins({ q: debouncedSearch, status, page, limit: 25 })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load platform admins.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, status, page, reloadKey]);

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError(null);
    if (!email.trim()) {
      setCreateError('Enter an email address.');
      return;
    }

    setCreateBusy(true);
    try {
      const result = await api.createPlatformAdmin({ email, name });
      setCredential({ email: result.account.email, password: result.temporaryPassword });
      setCreateOpen(false);
      setEmail('');
      setName('');
      reload();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'Could not create the platform account.'
      );
    } finally {
      setCreateBusy(false);
    }
  };

  const confirmStatusChange = async () => {
    if (!statusTarget) return;
    setStatusBusy(true);
    try {
      await api.updatePlatformAdmin(statusTarget.account._id, {
        status: statusTarget.next,
      });
      toast.success(
        statusTarget.next === 'disabled'
          ? 'Platform admin disabled.'
          : 'Platform admin enabled.'
      );
      setStatusTarget(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change the account status.');
    } finally {
      setStatusBusy(false);
    }
  };

  const admins = data?.accounts ?? [];
  const activeTotal = data?.activeTotal ?? 0;
  const lastAdmin = activeTotal <= 1;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={
          <>
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-xl border border-border bg-card text-indigo-300"
            >
              <UserRoundCog className="h-4 w-4" />
            </span>
            Platform admins
          </>
        }
        description="The internal super-admin accounts that can open this console. They are separate from every personal and agency account."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={reload}
              disabled={loading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              type="button"
              className="rounded-full bg-indigo-500 text-white hover:bg-indigo-400"
              onClick={() => {
                setCreateError(null);
                setCreateOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add platform admin
            </Button>
          </>
        }
      />

      {lastAdmin ? (
        <AdminNotice tone="warning" title="This is the last active super-admin.">
          Keep at least one more active admin before disabling this one, or the
          console becomes unreachable until the bootstrap CLI is used.
        </AdminNotice>
      ) : (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden />
          {activeTotal} active super-admin{activeTotal === 1 ? '' : 's'}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminSegmented
          ariaLabel="Admin status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search email or name"
            className="h-9 rounded-full pl-9"
            aria-label="Search platform admins"
          />
        </div>
      </div>

      {error ? (
        <AdminNotice tone="error" title="Could not load platform admins">
          {error}
        </AdminNotice>
      ) : null}

      <AdminTableFrame
        minWidth="860px"
        footer={
          <AdminPagination
            page={data?.page ?? page}
            totalPages={data?.totalPages ?? 1}
            total={data?.total}
            noun="platform admin"
            loading={loading}
            onChange={setPage}
          />
        }
      >
        <thead>
          <tr>
            <th className={adminTableHeadClass}>Administrator</th>
            <th className={adminTableHeadClass}>Status</th>
            <th className={adminTableHeadClass}>First login</th>
            <th className={adminTableHeadClass}>Created</th>
            <th className={adminTableHeadClass}>Last sign-in</th>
            <th className={`${adminTableHeadClass} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && admins.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-14 text-center text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading platform admins…
                </span>
              </td>
            </tr>
          ) : admins.length === 0 ? (
            <tr>
              <td colSpan={6}>
                <AdminEmptyState
                  icon={UserRoundCog}
                  title="No platform admins match this search."
                  description="Add another super-admin to give a teammate console access."
                />
              </td>
            </tr>
          ) : (
            admins.map((account) => {
              const isSelf = account._id === user?._id;
              const disableBlocked =
                account.status === 'active' && (isSelf || activeTotal <= 1);

              return (
                <tr key={account._id} className={adminTableRowClass}>
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-foreground">
                          {accountDisplayName(account)}
                        </p>
                        {isSelf ? (
                          <Badge
                            variant="outline"
                            className="border-indigo-500/40 bg-indigo-500/10 text-[10px] text-indigo-300"
                          >
                            You
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{account.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={account.status} />
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {account.mustChangePassword ? (
                      <span className="text-amber-300">Password change required</span>
                    ) : (
                      <span className="text-muted-foreground">Completed</span>
                    )}
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
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-full"
                        disabled={disableBlocked}
                        title={
                          isSelf
                            ? 'You cannot disable your own account'
                            : account.status === 'active' && activeTotal <= 1
                              ? 'The last active super-admin cannot be disabled'
                              : undefined
                        }
                        onClick={() =>
                          setStatusTarget({
                            account,
                            next: account.status === 'active' ? 'disabled' : 'active',
                          })
                        }
                      >
                        {account.status === 'active' ? (
                          <ShieldOff className="mr-1.5 h-4 w-4" />
                        ) : (
                          <ShieldCheck className="mr-1.5 h-4 w-4" />
                        )}
                        {account.status === 'active' ? 'Disable' : 'Enable'}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </AdminTableFrame>

      <Dialog open={createOpen} onOpenChange={(open) => !createBusy && setCreateOpen(open)}>
        {/* Portalled content leaves the console tree, so it carries the dark scope. */}
        <DialogContent className="dark rounded-2xl border-border bg-card text-card-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-indigo-400" />
              Add platform admin
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Creates a third-realm super-admin with a one-time password. No personal
              or agency account is created or attached, even if the email already
              exists in those realms.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={submitCreate}>
            {createError ? (
              <AdminNotice tone="error">{createError}</AdminNotice>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="platform-admin-email">Email</Label>
              <Input
                id="platform-admin-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (createError) setCreateError(null);
                }}
                placeholder="ops@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="platform-admin-name">
                Display name <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="platform-admin-name"
                value={name}
                maxLength={40}
                onChange={(event) => setName(event.target.value)}
                placeholder="Operations"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => setCreateOpen(false)}
                disabled={createBusy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="rounded-full bg-indigo-500 text-white hover:bg-indigo-400"
                disabled={createBusy}
              >
                {createBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create admin
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={statusTarget !== null}
        onOpenChange={(open) => {
          if (!open && !statusBusy) setStatusTarget(null);
        }}
      >
        {/* Portalled content leaves the console tree, so it carries the dark scope. */}
        <AlertDialogContent className="dark rounded-2xl border-border bg-card text-card-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusTarget?.next === 'disabled'
                ? 'Disable platform admin?'
                : 'Enable platform admin?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {statusTarget?.next === 'disabled'
                ? 'This immediately blocks the account from the console. Platform audit records are kept.'
                : 'This restores access to the console for this administrator.'}
              {statusTarget ? (
                <span className="mt-2 block break-all text-foreground">
                  {statusTarget.account.email}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusBusy} className="rounded-full">
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
                  ? 'rounded-full bg-rose-600 text-white hover:bg-rose-500'
                  : 'rounded-full bg-indigo-500 text-white hover:bg-indigo-400'
              }
            >
              {statusBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {statusTarget?.next === 'disabled' ? 'Disable admin' : 'Enable admin'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AdminTemporaryPassword
        open={credential !== null}
        onOpenChange={(open) => {
          if (!open) setCredential(null);
        }}
        email={credential?.email ?? ''}
        temporaryPassword={credential?.password ?? ''}
        description="A new platform super-admin was created. Share this one-time password securely; they must change it at /admin/login before the console opens."
      />
    </div>
  );
};

export default AdminPlatformAdmins;
