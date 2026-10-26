import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
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
import { Card, CardContent } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
const AdminPlatformAdmins: React.FC = () => {
  const { user } = usePlatformAuth();

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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <UserRoundCog className="h-5 w-5 text-indigo-400" />
            Platform admins
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            The internal super-admin accounts that can open this console. They are
            separate from every personal and agency account.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <Button
            type="button"
            className="bg-indigo-500 text-white hover:bg-indigo-400"
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add platform admin
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          {activeTotal} active super-admin{activeTotal === 1 ? '' : 's'}
          {activeTotal === 1 ? (
            <span className="text-amber-400">
              · the last active admin cannot be disabled
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search email or name"
              className="h-9 w-64 border-slate-700 bg-slate-950 pl-9 text-sm text-slate-100 placeholder:text-slate-500"
              aria-label="Search platform admins"
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
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 font-semibold">Administrator</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">First login</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Last sign-in</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && admins.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-14 text-center text-sm text-slate-400">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading platform admins…
                      </span>
                    </td>
                  </tr>
                ) : admins.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-14 text-center text-sm text-slate-400">
                      No platform admins match this search.
                    </td>
                  </tr>
                ) : (
                  admins.map((account) => {
                    const isSelf = account._id === user?._id;
                    const disableBlocked =
                      account.status === 'active' && (isSelf || activeTotal <= 1);

                    return (
                      <tr
                        key={account._id}
                        className="border-b border-slate-800/70 last:border-0 hover:bg-slate-900/70"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 truncate font-medium text-slate-100">
                                {accountDisplayName(account)}
                                {isSelf ? (
                                  <Badge
                                    variant="outline"
                                    className="border-indigo-800 bg-indigo-950/40 text-[10px] text-indigo-300"
                                  >
                                    You
                                  </Badge>
                                ) : null}
                              </p>
                              <p className="truncate text-xs text-slate-500">{account.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={account.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">
                          {account.mustChangePassword ? (
                            <span className="text-amber-300">Password change required</span>
                          ) : (
                            'Completed'
                          )}
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
                              size="sm"
                              variant="ghost"
                              className="h-8 text-slate-400 hover:bg-slate-800 hover:text-white"
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
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-4 py-3">
            <p className="text-xs text-slate-500">
              {data
                ? `${data.total} platform admin${data.total === 1 ? '' : 's'} · page ${data.page} of ${data.totalPages}`
                : 'Loading admins…'}
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

      <Dialog open={createOpen} onOpenChange={(open) => !createBusy && setCreateOpen(open)}>
        <DialogContent className="border-slate-800 bg-slate-900 text-slate-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-indigo-400" />
              Add platform admin
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Creates a third-realm super-admin with a one-time password. No personal
              or agency account is created or attached, even if the email already
              exists in those realms.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={submitCreate}>
            {createError ? (
              <div className="rounded-xl border border-rose-900 bg-rose-950/40 px-3.5 py-3 text-sm text-rose-200">
                {createError}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="platform-admin-email" className="text-slate-300">
                Email
              </Label>
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
                className="border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="platform-admin-name" className="text-slate-300">
                Display name <span className="text-slate-500">(optional)</span>
              </Label>
              <Input
                id="platform-admin-name"
                value={name}
                maxLength={40}
                onChange={(event) => setName(event.target.value)}
                placeholder="Operations"
                className="border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                onClick={() => setCreateOpen(false)}
                disabled={createBusy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-indigo-500 text-white hover:bg-indigo-400"
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
        <AlertDialogContent className="border-slate-800 bg-slate-900 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusTarget?.next === 'disabled' ? 'Disable platform admin?' : 'Enable platform admin?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {statusTarget?.next === 'disabled'
                ? 'This immediately blocks the account from the console. Platform audit records are kept.'
                : 'This restores access to the console for this administrator.'}
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
