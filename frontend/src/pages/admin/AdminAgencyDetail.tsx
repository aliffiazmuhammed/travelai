import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Building2,
  CheckCircle2,
  ClipboardList,
  Copy,
  CreditCard,
  Crown,
  ExternalLink,
  EyeOff,
  Gauge,
  Globe2,
  KeyRound,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserPlus,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { api } from '@/services/api';
import type {
  PlatformAgencyDetail,
  PlatformAgencyDirectoryPackage,
  PlatformAgencyMember,
  PlatformAgencyRole,
  PlatformAgencyStatus,
  PlatformPlanTier,
} from '@/types';
import { toast } from 'sonner';
import AdminTemporaryPassword from './AdminTemporaryPassword';
import { formatAdminDate } from './accountMeta';

interface AdminAgencyDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyId: string | null;
  plans: PlatformPlanTier[];
  /** Refreshes the parent list after a lifecycle change. */
  onChanged?: () => void;
}

const roleOptions: PlatformAgencyRole[] = ['owner', 'admin', 'planner', 'viewer'];

type DirectoryHideTarget =
  | { kind: 'profile' }
  | { kind: 'package'; id: string; title: string };

/**
 * `/admin/agencies` detail drawer (PA4).
 *
 * This is the support surface for one tenant: status, plan, live usage,
 * billing metadata, owners/members and platform audit. It never renders trip,
 * client, quote or export content. Every mutation is confirmed where it is
 * destructive and the server re-checks the last-owner rules.
 */
const AdminAgencyDetail: React.FC<AdminAgencyDetailProps> = ({
  open,
  onOpenChange,
  agencyId,
  plans,
  onChanged,
}) => {
  const [agency, setAgency] = useState<PlatformAgencyDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const [planTierId, setPlanTierId] = useState('');
  const [planSeats, setPlanSeats] = useState('');
  const [planExports, setPlanExports] = useState('');
  const [planStorage, setPlanStorage] = useState('');

  const [inviteRole, setInviteRole] = useState<Exclude<PlatformAgencyRole, 'owner'>>(
    'planner'
  );
  const [inviteKind, setInviteKind] = useState<'link' | 'email'>('email');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState('');

  const [fromUserId, setFromUserId] = useState('');
  const [toUserId, setToUserId] = useState('');

  const [statusTarget, setStatusTarget] = useState<PlatformAgencyStatus | null>(null);
  const [removeTarget, setRemoveTarget] = useState<PlatformAgencyMember | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<PlatformAgencyMember | null>(null);
  const [directoryHideTarget, setDirectoryHideTarget] =
    useState<DirectoryHideTarget | null>(null);
  const [directoryHideReason, setDirectoryHideReason] = useState('');
  const [credential, setCredential] = useState<{
    email: string;
    password: string;
    workspace?: string;
  } | null>(null);

  const load = () => setReloadKey((key) => key + 1);

  useEffect(() => {
    if (!open || !agencyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .getAdminAgency(agencyId)
      .then((result) => {
        if (cancelled) return;
        setAgency(result.agency);
        setPlanTierId(result.agency.plan.tierId);
        setPlanSeats(
          result.agency.planOverrides?.seats !== undefined
            ? String(result.agency.planOverrides.seats)
            : ''
        );
        setPlanExports(
          result.agency.planOverrides?.monthlyExports !== undefined
            ? String(result.agency.planOverrides.monthlyExports)
            : ''
        );
        setPlanStorage(
          result.agency.planOverrides?.storageMb !== undefined
            ? String(result.agency.planOverrides.storageMb)
            : ''
        );
        setFromUserId(result.agency.owners[0]?.accountId ?? '');
        setToUserId(
          result.agency.members.find((member) => member.role !== 'owner')?.userId ?? ''
        );
        setInviteLink('');
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load this agency.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, agencyId, reloadKey]);

  const nonOwners = useMemo(
    () => (agency?.members ?? []).filter((member) => member.role !== 'owner'),
    [agency]
  );

  const finish = (next: PlatformAgencyDetail) => {
    setAgency(next);
    onChanged?.();
  };

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    try {
      await action();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The action could not be completed.');
    } finally {
      setBusy(null);
    }
  };

  const applyPlan = () =>
    run('plan', async () => {
      if (!agency) return;
      const plan: {
        tierId: string;
        seats?: number;
        monthlyExports?: number;
        storageMb?: number;
      } = { tierId: planTierId };

      const parse = (value: string, label: string): number | undefined => {
        if (!value.trim()) return undefined;
        const number = Number(value);
        if (!Number.isInteger(number) || number < 0) {
          throw new Error(`${label} must be a whole number of at least 0.`);
        }
        return number;
      };

      const seats = parse(planSeats, 'Seats');
      const exports = parse(planExports, 'Monthly exports');
      const storage = parse(planStorage, 'Storage');
      if (seats !== undefined && seats < 1) {
        throw new Error('Seats must be a whole number of at least 1.');
      }
      if (seats !== undefined) plan.seats = seats;
      if (exports !== undefined) plan.monthlyExports = exports;
      if (storage !== undefined) plan.storageMb = storage;

      const result = await api.updateAdminAgencyPlan(agency._id, plan);
      finish(result.agency);
      toast.success(`Plan changed from ${result.previous.tierId} to ${result.agency.plan.tierId}.`);
    });

  const changeStatus = () =>
    run('status', async () => {
      if (!agency || !statusTarget) return;
      const result = await api.updateAdminAgencyStatus(agency._id, statusTarget);
      finish(result.agency);
      setStatusTarget(null);
      toast.success(
        statusTarget === 'suspended'
          ? 'Tenant suspended. Agency logins, staff routes and public proposal links now fail closed.'
          : 'Tenant reactivated. Agency staff can sign in again.'
      );
    });

  const changeRole = (member: PlatformAgencyMember, role: PlatformAgencyRole) =>
    run(`role-${member.userId}`, async () => {
      if (!agency) return;
      const result = await api.updateAdminAgencyMemberRole(
        agency._id,
        member.userId,
        role
      );
      finish(result.agency);
      toast.success(`${member.email} is now ${role}.`);
    });

  const removeMember = () =>
    run('remove', async () => {
      if (!agency || !removeTarget) return;
      const result = await api.removeAdminAgencyMember(agency._id, removeTarget.userId);
      finish(result.agency);
      toast.success(`${removeTarget.email} was removed from the workspace.`);
      setRemoveTarget(null);
    });

  const transferOwner = () =>
    run('transfer', async () => {
      if (!agency || !toUserId) return;
      const result = await api.transferAdminAgencyOwner(
        agency._id,
        toUserId,
        fromUserId || undefined
      );
      finish(result.agency);
      setTransferOpen(false);
      toast.success('Ownership transferred. The previous owner is now an admin.');
    });

  const createInvite = () =>
    run('invite', async () => {
      if (!agency) return;
      const result = await api.inviteAdminAgencyMember(agency._id, {
        role: inviteRole,
        kind: inviteKind,
        ...(inviteKind === 'email' ? { email: inviteEmail.trim() } : {}),
      });
      finish(result.agency);
      setInviteLink(result.link);
      setInviteEmail('');
      toast.success('Invitation created. The link is shown once; share it securely.');
    });

  const resetPassword = () =>
    run('reset', async () => {
      if (!agency || !resetTarget) return;
      const result = await api.resetAdminAgencyMemberPassword(
        agency._id,
        resetTarget.userId
      );
      setCredential({
        email: result.email,
        password: result.temporaryPassword,
        workspace: result.workspace,
      });
      setResetTarget(null);
    });

  const applyDirectory = (directory: PlatformAgencyDetail['directory']) => {
    setAgency((current) => (current ? { ...current, directory } : current));
    onChanged?.();
  };

  const changeVerification = (verified: boolean) =>
    run(verified ? 'directory-verify' : 'directory-unverify', async () => {
      if (!agency) return;
      const result = verified
        ? await api.verifyAdminAgencyProfile(agency._id)
        : await api.unverifyAdminAgencyProfile(agency._id);
      applyDirectory(result.directory);
      toast.success(
        verified
          ? 'Verified badge granted. The public profile updates immediately.'
          : 'Verified badge removed. The profile stays listed.'
      );
    });

  const restoreProfile = () =>
    run('directory-restore', async () => {
      if (!agency) return;
      const result = await api.restoreAdminAgencyProfile(agency._id);
      applyDirectory(result.directory);
      toast.success('Profile restored to the public directory.');
    });

  const confirmDirectoryHide = () =>
    run('directory-hide', async () => {
      if (!agency || !directoryHideTarget) return;
      const reason = directoryHideReason.trim();
      const result =
        directoryHideTarget.kind === 'profile'
          ? await api.hideAdminAgencyProfile(agency._id, reason)
          : await api.hideAdminAgencyPackage(
              agency._id,
              directoryHideTarget.id,
              reason
            );
      applyDirectory(result.directory);
      setDirectoryHideTarget(null);
      setDirectoryHideReason('');
      toast.success(
        directoryHideTarget.kind === 'profile'
          ? 'Profile hidden from every public surface.'
          : 'Package hidden from the public profile.'
      );
    });

  const restorePackage = (pkg: PlatformAgencyDirectoryPackage) =>
    run(`directory-package-${pkg.id}`, async () => {
      if (!agency) return;
      const result = await api.restoreAdminAgencyPackage(agency._id, pkg.id);
      applyDirectory(result.directory);
      toast.success('Package restored to the public profile.');
    });

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast.success('Invite link copied.');
    } catch {
      toast.error('Could not copy automatically. Select the link and copy it manually.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-slate-800 bg-slate-900 text-slate-100 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Building2 className="h-4 w-4 text-indigo-400" />
            {agency?.name ?? 'Agency detail'}
            {agency ? <AgencyStatusBadge status={agency.status} /> : null}
            {agency ? (
              <Badge
                variant="outline"
                className="border-slate-700 text-[10px] uppercase tracking-wide text-slate-300"
              >
                {agency.plan.tierId}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription className="break-all text-slate-400">
            {agency ? (
              <>
                Workspace{' '}
                <code className="rounded bg-slate-950 px-1 py-0.5 text-slate-300">
                  {agency.slug}
                </code>{' '}
                · identity, plan, usage and platform audit. No tenant content.
              </>
            ) : (
              'Plan, usage, owners, members and platform audit for one tenant.'
            )}
          </DialogDescription>
        </DialogHeader>

        {loading && !agency ? (
          <div className="flex items-center gap-2 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading agency…
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-xl border border-rose-900 bg-rose-950/40 px-3.5 py-3 text-sm text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : agency ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                onClick={load}
                disabled={loading}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                type="button"
                variant={agency.status === 'active' ? 'destructive' : 'default'}
                className={
                  agency.status === 'active'
                    ? 'bg-rose-600 text-white hover:bg-rose-500'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500'
                }
                onClick={() =>
                  setStatusTarget(agency.status === 'active' ? 'suspended' : 'active')
                }
              >
                {agency.status === 'active' ? (
                  <ShieldOff className="mr-2 h-4 w-4" />
                ) : (
                  <ShieldCheck className="mr-2 h-4 w-4" />
                )}
                {agency.status === 'active' ? 'Suspend tenant' : 'Reactivate tenant'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                onClick={() => setTransferOpen(true)}
                disabled={agency.owners.length === 0 || nonOwners.length === 0}
              >
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                Transfer owner
              </Button>
            </div>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                icon={<Crown className="h-3.5 w-3.5 text-amber-400" />}
                label="Owner"
                value={agency.owner?.email ?? 'No owner'}
                hint={agency.owner?.name}
              />
              <Stat
                icon={<Users className="h-3.5 w-3.5 text-indigo-400" />}
                label="Members"
                value={`${agency.usage.seats} / ${agency.plan.seats}`}
                hint={`${agency.ownerCount} owner${agency.ownerCount === 1 ? '' : 's'} · ${agency.pendingInvites} pending invite${agency.pendingInvites === 1 ? '' : 's'}`}
              />
              <Stat
                icon={<Gauge className="h-3.5 w-3.5 text-emerald-400" />}
                label="Exports this month"
                value={`${agency.usage.exportsThisMonth} / ${agency.plan.monthlyExports}`}
                hint={`Storage ${formatMb(agency.usage.storageBytes)} / ${agency.plan.storageMb} MB`}
              />
              <Stat
                icon={<CreditCard className="h-3.5 w-3.5 text-sky-400" />}
                label="Renewal"
                value={formatAdminDate(agency.billing?.renewalDate)}
                hint={agency.billing?.contactEmail ?? agency.billing?.contactName ?? 'No billing contact'}
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                <SectionTitle icon={<Gauge className="h-4 w-4 text-indigo-400" />}>
                  Plan and live usage
                </SectionTitle>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <MiniStat label="Tier" value={agency.plan.tierId} />
                  <MiniStat label="Seats" value={`${agency.usage.seats} / ${agency.plan.seats}`} />
                  <MiniStat
                    label="Exports"
                    value={`${agency.usage.exportsThisMonth} / ${agency.plan.monthlyExports}`}
                  />
                  <MiniStat
                    label="Storage"
                    value={`${formatMb(agency.usage.storageBytes)} / ${agency.plan.storageMb} MB`}
                  />
                </div>

                <div className="mt-4 space-y-3 border-t border-slate-800 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Change plan
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-400">Tier</Label>
                      <Select value={planTierId} onValueChange={setPlanTierId}>
                        <SelectTrigger className="border-slate-700 bg-slate-950 text-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {plans.map((plan) => (
                            <SelectItem key={plan.tierId} value={plan.tierId}>
                              {plan.tierId} — {plan.seats} seats
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-400">Seat override</Label>
                      <Input
                        type="number"
                        min={1}
                        value={planSeats}
                        onChange={(event) => setPlanSeats(event.target.value)}
                        className="border-slate-700 bg-slate-950 text-slate-100"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-400">
                        Monthly export override
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={planExports}
                        onChange={(event) => setPlanExports(event.target.value)}
                        className="border-slate-700 bg-slate-950 text-slate-100"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-slate-400">
                        Storage MB override
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={planStorage}
                        onChange={(event) => setPlanStorage(event.target.value)}
                        className="border-slate-700 bg-slate-950 text-slate-100"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Overrides replace that tier's limit. Clearing a field returns it to the
                    tier default.
                  </p>
                  <Button
                    type="button"
                    className="bg-indigo-500 text-white hover:bg-indigo-400"
                    onClick={() => void applyPlan()}
                    disabled={busy === 'plan' || !planTierId}
                  >
                    {busy === 'plan' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Apply plan
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                <SectionTitle icon={<Building2 className="h-4 w-4 text-emerald-400" />}>
                  Tenant metadata
                </SectionTitle>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <MiniStat label="Agency id" value={agency._id} mono />
                  <MiniStat label="Workspace" value={agency.slug} mono />
                  <MiniStat label="Provisioned" value={formatAdminDate(agency.provisionedAt)} />
                  <MiniStat label="Created" value={formatAdminDate(agency.createdAt)} />
                  <MiniStat
                    label="Billing contact"
                    value={agency.billing?.contactName ?? '—'}
                  />
                  <MiniStat
                    label="Billing email"
                    value={agency.billing?.contactEmail ?? '—'}
                  />
                </div>
                {agency.billing?.notes ? (
                  <p className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-2 text-xs text-slate-400">
                    {agency.billing.notes}
                  </p>
                ) : null}
              </div>
            </section>

            <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionTitle icon={<Globe2 className="h-4 w-4 text-teal-400" />}>
                  Public directory
                </SectionTitle>
                {agency.directory.slug ? (
                  <a
                    href={`/agencies/${agency.directory.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-300 hover:text-teal-200"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open public page
                  </a>
                ) : null}
              </div>

              {agency.directory.profile ? (
                <>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <MiniStat label="State" value={agency.directory.profile.state} />
                    <MiniStat
                      label="Verified"
                      value={agency.directory.profile.verifiedAt ? 'Verified' : 'Not verified'}
                    />
                    <MiniStat
                      label="Reply time"
                      value={
                        agency.directory.profile.replyTimeHours
                          ? `~${agency.directory.profile.replyTimeHours} h`
                          : 'Hidden (<5 replies)'
                      }
                    />
                    <MiniStat
                      label="Published"
                      value={formatAdminDate(
                        agency.directory.profile.publishedAt ?? undefined
                      )}
                    />
                  </div>

                  {agency.directory.profile.hiddenAt ? (
                    <p className="mt-2 rounded-lg border border-rose-900/70 bg-rose-950/30 px-2.5 py-2 text-xs text-rose-200">
                      <EyeOff className="mr-1 inline h-3.5 w-3.5" />
                      Hidden {formatAdminDate(agency.directory.profile.hiddenAt ?? undefined)}
                      {agency.directory.profile.hiddenReason
                        ? ` — ${agency.directory.profile.hiddenReason}`
                        : ''}
                    </p>
                  ) : null}

                  {!agency.directory.profile.ready ? (
                    <p className="mt-2 rounded-lg border border-amber-900/70 bg-amber-950/20 px-2.5 py-2 text-xs text-amber-200">
                      <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                      Not publishable yet: {agency.directory.profile.missing.join(' ')}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                      onClick={() =>
                        void changeVerification(!agency.directory.profile?.verifiedAt)
                      }
                      disabled={busy !== null}
                    >
                      {agency.directory.profile.verifiedAt ? (
                        <ShieldOff className="mr-2 h-3.5 w-3.5" />
                      ) : (
                        <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                      )}
                      {agency.directory.profile.verifiedAt ? 'Remove badge' : 'Verify badge'}
                    </Button>
                    {agency.directory.profile.hiddenAt ? (
                      <Button
                        type="button"
                        size="sm"
                        className="bg-emerald-600 text-white hover:bg-emerald-500"
                        onClick={() => void restoreProfile()}
                        disabled={busy !== null}
                      >
                        <RotateCcw className="mr-2 h-3.5 w-3.5" />
                        Restore profile
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-rose-900 bg-slate-900 text-rose-300 hover:bg-rose-950/40"
                        onClick={() => {
                          setDirectoryHideReason('');
                          setDirectoryHideTarget({ kind: 'profile' });
                        }}
                        disabled={busy !== null}
                      >
                        <EyeOff className="mr-2 h-3.5 w-3.5" />
                        Hide profile
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  This agency has not saved a public profile yet. Nothing is listed.
                </p>
              )}

              <div className="mt-4 border-t border-slate-800 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Packages
                </p>
                {agency.directory.packages.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">No packages created yet.</p>
                ) : (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                          <th className="px-2 py-2 font-semibold">Package</th>
                          <th className="px-2 py-2 font-semibold">State</th>
                          <th className="px-2 py-2 font-semibold">Price</th>
                          <th className="px-2 py-2 text-right font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agency.directory.packages.map((pkg) => (
                          <tr
                            key={pkg.id}
                            className="border-b border-slate-800/70 last:border-0"
                          >
                            <td className="px-2 py-2">
                              <p className="font-medium text-slate-200">
                                {pkg.title || 'Untitled package'}
                              </p>
                              {pkg.hiddenAt ? (
                                <p className="text-[11px] text-rose-300">
                                  Hidden {formatAdminDate(pkg.hiddenAt)}
                                  {pkg.hiddenReason ? ` — ${pkg.hiddenReason}` : ''}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-2 py-2">
                              <Badge
                                variant="outline"
                                className={
                                  pkg.hiddenAt
                                    ? 'border-rose-900 bg-rose-950/40 text-[10px] text-rose-300'
                                    : pkg.state === 'published'
                                      ? 'border-emerald-800 bg-emerald-950/40 text-[10px] text-emerald-300'
                                      : 'border-slate-700 text-[10px] text-slate-400'
                                }
                              >
                                {pkg.hiddenAt ? 'hidden' : pkg.state}
                              </Badge>
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-400">
                              {pkg.pricePerPerson === null
                                ? 'On request'
                                : `${pkg.currency} ${pkg.pricePerPerson.toLocaleString('en-IN')}`}
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex items-center justify-end">
                                {pkg.hiddenAt ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 text-xs text-emerald-300 hover:bg-slate-800"
                                    onClick={() => void restorePackage(pkg)}
                                    disabled={busy !== null}
                                  >
                                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                                    Restore
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 text-xs text-rose-300 hover:bg-rose-950/40"
                                    onClick={() => {
                                      setDirectoryHideReason('');
                                      setDirectoryHideTarget({
                                        kind: 'package',
                                        id: pkg.id,
                                        title: pkg.title,
                                      });
                                    }}
                                    disabled={busy !== null}
                                  >
                                    <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                                    Hide
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionTitle icon={<Users className="h-4 w-4 text-indigo-400" />}>
                  Members
                </SectionTitle>
                <span className="text-[11px] text-slate-500">
                  {agency.members.length} account{agency.members.length === 1 ? '' : 's'} ·{' '}
                  {agency.owners.length} owner{agency.owners.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                      <th className="px-2 py-2 font-semibold">Member</th>
                      <th className="px-2 py-2 font-semibold">Role</th>
                      <th className="px-2 py-2 font-semibold">Account</th>
                      <th className="px-2 py-2 font-semibold">Joined</th>
                      <th className="px-2 py-2 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agency.members.map((member) => (
                      <tr key={member.userId} className="border-b border-slate-800/70 last:border-0">
                        <td className="px-2 py-2">
                          <p className="font-medium text-slate-200">
                            {member.name?.trim() || member.email.split('@')[0]}
                          </p>
                          <p className="break-all text-xs text-slate-500">{member.email}</p>
                        </td>
                        <td className="px-2 py-2">
                          <Select
                            value={member.role}
                            onValueChange={(value) =>
                              void changeRole(member, value as PlatformAgencyRole)
                            }
                            disabled={busy === `role-${member.userId}`}
                          >
                            <SelectTrigger className="h-8 w-28 border-slate-700 bg-slate-950 text-xs text-slate-200">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {roleOptions.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {role}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-2 text-xs">
                          <Badge
                            variant="outline"
                            className={
                              member.status === 'active'
                                ? 'border-emerald-800 bg-emerald-950/40 text-[10px] text-emerald-300'
                                : 'border-rose-900 bg-rose-950/40 text-[10px] text-rose-300'
                            }
                          >
                            {member.status}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-400">
                          {formatAdminDate(member.joinedAt)}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-slate-400 hover:bg-slate-800 hover:text-white"
                              onClick={() => setResetTarget(member)}
                              title="Reset workspace password"
                              aria-label={`Reset password for ${member.email}`}
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-rose-400 hover:bg-rose-950/50 hover:text-rose-300"
                              onClick={() => setRemoveTarget(member)}
                              title="Remove member"
                              aria-label={`Remove ${member.email}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 border-t border-slate-800 pt-3">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <UserPlus className="h-3.5 w-3.5" />
                  Invite member
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-4">
                  <Select
                    value={inviteRole}
                    onValueChange={(value) =>
                      setInviteRole(value as Exclude<PlatformAgencyRole, 'owner'>)
                    }
                  >
                    <SelectTrigger className="border-slate-700 bg-slate-950 text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">admin</SelectItem>
                      <SelectItem value="planner">planner</SelectItem>
                      <SelectItem value="viewer">viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={inviteKind}
                    onValueChange={(value) => setInviteKind(value as 'link' | 'email')}
                  >
                    <SelectTrigger className="border-slate-700 bg-slate-950 text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email-bound</SelectItem>
                      <SelectItem value="link">Shareable link</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder={
                      inviteKind === 'email' ? 'member@example.com' : 'Email not required'
                    }
                    disabled={inviteKind !== 'email'}
                    className="border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                  <Button
                    type="button"
                    className="bg-indigo-500 text-white hover:bg-indigo-400"
                    onClick={() => void createInvite()}
                    disabled={
                      busy === 'invite' ||
                      (inviteKind === 'email' && !inviteEmail.trim())
                    }
                  >
                    {busy === 'invite' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="mr-2 h-4 w-4" />
                    )}
                    Create invite
                  </Button>
                </div>
                {inviteLink ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-900/70 bg-emerald-950/20 px-2.5 py-2">
                    <Input
                      readOnly
                      value={inviteLink}
                      className="h-8 min-w-0 flex-1 border-slate-700 bg-slate-950 font-mono text-[11px] text-emerald-200"
                      aria-label="Invitation link"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                      onClick={() => void copyInvite()}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Copy
                    </Button>
                  </div>
                ) : null}
              </div>
            </section>

            <section>
              <SectionTitle icon={<ClipboardList className="h-4 w-4 text-indigo-400" />}>
                Recent platform audit
              </SectionTitle>
              {agency.recentAudit.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  No platform audit events for this tenant yet.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950/50">
                  {agency.recentAudit.map((event) => (
                    <li key={event._id} className="px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <code className="text-xs text-indigo-300">{event.action}</code>
                        <span className="text-[11px] text-slate-500">
                          {formatAdminDate(event.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {event.actorEmail ?? 'system'} · {event.targetType}
                        {auditSummary(event.metadata)
                          ? ` · ${auditSummary(event.metadata)}`
                          : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </DialogContent>

      <AlertDialog
        open={statusTarget !== null}
        onOpenChange={(next) => {
          if (!next && busy !== 'status') setStatusTarget(null);
        }}
      >
        <AlertDialogContent className="border-slate-800 bg-slate-900 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {statusTarget === 'suspended' ? (
                <ShieldOff className="h-4 w-4 text-rose-400" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
              )}
              {statusTarget === 'suspended' ? 'Suspend this tenant?' : 'Reactivate this tenant?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {statusTarget === 'suspended'
                ? 'Agency sign-in, every staff route and every public proposal link will fail closed immediately. Personal accounts and other tenants are unaffected.'
                : 'Agency staff can sign in again. Previously invalidated sessions stay invalid; users sign in fresh.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={busy === 'status'}
              className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy === 'status'}
              onClick={(event) => {
                event.preventDefault();
                void changeStatus();
              }}
              className={
                statusTarget === 'suspended'
                  ? 'bg-rose-600 text-white hover:bg-rose-500'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500'
              }
            >
              {busy === 'status' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {statusTarget === 'suspended' ? 'Suspend tenant' : 'Reactivate tenant'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(next) => {
          if (!next && busy !== 'remove') setRemoveTarget(null);
        }}
      >
        <AlertDialogContent className="border-slate-800 bg-slate-900 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-rose-400" />
              Remove this member?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              The membership is deleted and the account's current session stops on its next
              request. The account row remains for a future re-invite. The last owner can
              never be removed.
              {removeTarget ? (
                <span className="mt-2 block break-all text-slate-300">
                  {removeTarget.email} · {removeTarget.role}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={busy === 'remove'}
              className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy === 'remove'}
              onClick={(event) => {
                event.preventDefault();
                void removeMember();
              }}
              className="bg-rose-600 text-white hover:bg-rose-500"
            >
              {busy === 'remove' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={resetTarget !== null}
        onOpenChange={(next) => {
          if (!next && busy !== 'reset') setResetTarget(null);
        }}
      >
        <AlertDialogContent className="border-slate-800 bg-slate-900 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-400" />
              Reset workspace password?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              A one-time password is issued and the account must change it at the next
              sign-in. Every existing session for this agency account is invalidated. A
              personal account with the same email is never touched.
              {resetTarget ? (
                <span className="mt-2 block break-all text-slate-300">
                  {resetTarget.email}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={busy === 'reset'}
              className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy === 'reset'}
              onClick={(event) => {
                event.preventDefault();
                void resetPassword();
              }}
              className="bg-amber-600 text-white hover:bg-amber-500"
            >
              {busy === 'reset' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Issue temporary password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="border-slate-800 bg-slate-900 text-slate-100 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-400" />
              Transfer ownership
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              The new owner is promoted first, then the previous owner becomes an admin. The
              workspace always keeps at least one owner.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Current owner</Label>
              <Select value={fromUserId} onValueChange={setFromUserId}>
                <SelectTrigger className="border-slate-700 bg-slate-950 text-slate-200">
                  <SelectValue placeholder="Choose an owner" />
                </SelectTrigger>
                <SelectContent>
                  {agency?.owners.map((owner) => (
                    <SelectItem key={owner.accountId} value={owner.accountId}>
                      {owner.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">New owner</Label>
              <Select value={toUserId} onValueChange={setToUserId}>
                <SelectTrigger className="border-slate-700 bg-slate-950 text-slate-200">
                  <SelectValue placeholder="Choose a member" />
                </SelectTrigger>
                <SelectContent>
                  {nonOwners.map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>
                      {member.email} ({member.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              className="w-full bg-amber-600 text-white hover:bg-amber-500"
              onClick={() => void transferOwner()}
              disabled={busy === 'transfer' || !fromUserId || !toUserId}
            >
              {busy === 'transfer' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="mr-2 h-4 w-4" />
              )}
              Transfer owner
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={directoryHideTarget !== null}
        onOpenChange={(next) => {
          if (!next && busy !== 'directory-hide') {
            setDirectoryHideTarget(null);
            setDirectoryHideReason('');
          }
        }}
      >
        <DialogContent className="border-slate-800 bg-slate-900 text-slate-100 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <EyeOff className="h-4 w-4 text-rose-400" />
              {directoryHideTarget?.kind === 'package'
                ? 'Hide this package?'
                : 'Hide this profile?'}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {directoryHideTarget?.kind === 'package'
                ? `"${
                    directoryHideTarget.title || 'Untitled package'
                  }" disappears from the public profile and its cover route. The agency keeps its draft/published choice and you can restore it here.`
                : 'The profile disappears from the listing, facets, its direct URL, package covers and every enquiry entry point. The publish date is kept, so a restore returns it to the directory.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300">
                Reason (audited and shown to the agency)
              </Label>
              <Input
                value={directoryHideReason}
                onChange={(event) => setDirectoryHideReason(event.target.value)}
                maxLength={500}
                placeholder="Why is it coming down?"
                className="border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
              />
            </div>
            <Button
              type="button"
              className="w-full bg-rose-600 text-white hover:bg-rose-500"
              onClick={() => void confirmDirectoryHide()}
              disabled={busy === 'directory-hide' || !directoryHideReason.trim()}
            >
              {busy === 'directory-hide' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <EyeOff className="mr-2 h-4 w-4" />
              )}
              Hide from directory
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AdminTemporaryPassword
        open={credential !== null}
        onOpenChange={(next) => {
          if (!next) setCredential(null);
        }}
        email={credential?.email ?? ''}
        temporaryPassword={credential?.password ?? ''}
        workspace={credential?.workspace}
        description="This one-time agency password is shown once. Share it securely; the member must change it before the workspace opens."
      />
    </Dialog>
  );
};

const AgencyStatusBadge: React.FC<{ status: PlatformAgencyStatus }> = ({ status }) => (
  <Badge
    variant="outline"
    className={
      status === 'active'
        ? 'border-emerald-800 bg-emerald-950/40 text-[10px] uppercase tracking-wide text-emerald-300'
        : 'border-rose-900 bg-rose-950/40 text-[10px] uppercase tracking-wide text-rose-300'
    }
  >
    {status}
  </Badge>
);

const SectionTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({
  icon,
  children,
}) => (
  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
    {icon}
    {children}
  </h3>
);

const Stat: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}> = ({ icon, label, value, hint }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2.5">
    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
      {icon}
      {label}
    </p>
    <p className="mt-1 break-all text-sm font-medium text-slate-200">{value}</p>
    {hint ? <p className="mt-0.5 break-all text-[11px] text-slate-500">{hint}</p> : null}
  </div>
);

const MiniStat: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-2">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
      {label}
    </p>
    <p
      className={`mt-0.5 break-all text-xs text-slate-200 ${mono ? 'font-mono text-[11px]' : ''}`}
    >
      {value}
    </p>
  </div>
);

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function auditSummary(metadata?: Record<string, unknown>): string {
  if (!metadata) return '';
  const keys = ['email', 'role', 'workspace', 'status', 'tierId', 'kind', 'fromEmail', 'toEmail'];
  return keys
    .filter((key) => metadata[key] !== undefined && metadata[key] !== null)
    .map((key) => `${key}: ${String(metadata[key])}`)
    .join(' · ');
}

export default AdminAgencyDetail;
