import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
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
import { AdminEmptyState, AdminLoadingPanel } from '@/components/admin/AdminEmptyState';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminSectionTabs } from '@/components/admin/AdminSectionTabs';
import { AdminStatTile } from '@/components/admin/AdminStatTile';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { AgencyStatusBadge, formatAdminDate, TierBadge } from './accountMeta';

const roleOptions: PlatformAgencyRole[] = ['owner', 'admin', 'planner', 'viewer'];

type DirectoryHideTarget =
  | { kind: 'profile' }
  | { kind: 'package'; id: string; title: string };

type RecordTab = 'overview' | 'plan' | 'directory' | 'members' | 'audit';

const panelId = 'agency-record-panel';

const tabs = [
  { value: 'overview' as const, label: 'Overview', icon: Building2 },
  { value: 'plan' as const, label: 'Plan', icon: Gauge },
  { value: 'directory' as const, label: 'Directory', icon: Globe2 },
  { value: 'members' as const, label: 'Members', icon: Users },
  { value: 'audit' as const, label: 'Audit', icon: ClipboardList },
];

/**
 * `/admin/agencies/:agencyId` (PA4).
 *
 * This is the support surface for one tenant: status, plan, live usage, billing
 * metadata, owners/members, public-directory state and platform audit. It never
 * renders trip, client, quote or export content. Every mutation is confirmed
 * where it is destructive and the server re-checks the last-owner rules.
 */
const AdminAgencyRecord: React.FC = () => {
  const { agencyId } = useParams<{ agencyId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [plans, setPlans] = useState<PlatformPlanTier[]>([]);
  const [agency, setAgency] = useState<PlatformAgencyDetail | null>(null);
  const [loading, setLoading] = useState(true);
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

  const requestedTab = searchParams.get('tab');
  const tab: RecordTab = tabs.some((entry) => entry.value === requestedTab)
    ? (requestedTab as RecordTab)
    : 'overview';

  const changeTab = (next: RecordTab) => {
    setSearchParams(
      (params) => {
        const copy = new URLSearchParams(params);
        if (next === 'overview') copy.delete('tab');
        else copy.set('tab', next);
        return copy;
      },
      { replace: true }
    );
  };

  const load = () => setReloadKey((key) => key + 1);

  useEffect(() => {
    let cancelled = false;
    api
      .getAgencyPlanTiers()
      .then((result) => {
        if (!cancelled) setPlans(result.tiers);
      })
      .catch(() => {
        // The plan form simply offers no tiers; the rest of the record still works.
        if (!cancelled) setPlans([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!agencyId) return;
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
  }, [agencyId, reloadKey]);

  const nonOwners = useMemo(
    () => (agency?.members ?? []).filter((member) => member.role !== 'owner'),
    [agency]
  );

  const finish = (next: PlatformAgencyDetail) => setAgency(next);

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
      toast.success(
        `Plan changed from ${result.previous.tierId} to ${result.agency.plan.tierId}.`
      );
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
          : await api.hideAdminAgencyPackage(agency._id, directoryHideTarget.id, reason);
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

  if (!agencyId) {
    return (
      <AdminNotice tone="error" title="No agency selected">
        Open a tenant from the{' '}
        <Link to="/admin/agencies" className="underline underline-offset-2">
          agency directory
        </Link>
        .
      </AdminNotice>
    );
  }

  if (loading && !agency) {
    return (
      <div className="rounded-2xl border border-border bg-card">
        <AdminLoadingPanel label="Loading the agency record…" className="py-20" />
      </div>
    );
  }

  if (error && !agency) {
    return (
      <div className="space-y-4">
        <AdminNotice
          tone="error"
          title="This agency record did not load"
          action={
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={load}>
                Try again
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link to="/admin/agencies">Back to agencies</Link>
              </Button>
            </div>
          }
        >
          {error}
        </AdminNotice>
      </div>
    );
  }

  if (!agency) return null;

  const directorySlug = agency.directory.slug;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={agency.name}
        meta={
          <>
            <AgencyStatusBadge status={agency.status} />
            <TierBadge tier={agency.plan.tierId} />
          </>
        }
        description={
          <>
            Workspace{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground/80">
              {agency.slug}
            </code>{' '}
            · identity, plan, usage and platform audit. No tenant content is read here.
          </>
        }
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 rounded-full px-3 text-xs"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                aria-hidden
              />
              Refresh
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 rounded-full px-3 text-xs"
            >
              <Link to="/admin/agencies">All agencies</Link>
            </Button>
            {directorySlug ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 rounded-full px-3 text-xs"
              >
                <a href={`/agencies/${directorySlug}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Public page
                </a>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 rounded-full px-3 text-xs"
              onClick={() => setTransferOpen(true)}
              disabled={busy !== null || agency.owners.length === 0 || nonOwners.length === 0}
            >
              <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />
              Transfer owner
            </Button>
            <Button
              type="button"
              size="sm"
              className={`h-9 gap-1.5 rounded-full px-3 text-xs text-white ${
                agency.status === 'active'
                  ? 'bg-rose-600 hover:bg-rose-500'
                  : 'bg-emerald-600 hover:bg-emerald-500'
              }`}
              onClick={() =>
                setStatusTarget(agency.status === 'active' ? 'suspended' : 'active')
              }
              disabled={busy !== null}
            >
              {agency.status === 'active' ? (
                <ShieldOff className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              )}
              {agency.status === 'active' ? 'Suspend tenant' : 'Reactivate tenant'}
            </Button>
          </>
        }
      />

      {error ? (
        <AdminNotice tone="error" title="Showing the last loaded copy">
          {error}
        </AdminNotice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStatTile
          icon={Users}
          tone="indigo"
          label="Members"
          value={`${agency.usage.seats} / ${agency.plan.seats}`}
          hint={`${agency.ownerCount} owner${agency.ownerCount === 1 ? '' : 's'} · ${agency.pendingInvites} pending invite${agency.pendingInvites === 1 ? '' : 's'}`}
        />
        <AdminStatTile
          icon={Gauge}
          tone="emerald"
          label="Exports this month"
          value={`${agency.usage.exportsThisMonth} / ${agency.plan.monthlyExports}`}
          hint="Calendar month, tenant-wide."
        />
        <AdminStatTile
          icon={CreditCard}
          tone="sky"
          label="Storage"
          value={`${formatMb(agency.usage.storageBytes)} MB`}
          hint={`of ${agency.plan.storageMb} MB in this tier.`}
        />
        <AdminStatTile
          icon={Crown}
          tone="amber"
          label="Renewal"
          value={formatAdminDate(agency.billing?.renewalDate)}
          hint={
            agency.billing?.contactEmail ??
            agency.billing?.contactName ??
            'No billing contact on file.'
          }
        />
      </div>

      <AdminSectionTabs
        ariaLabel="Agency record sections"
        panelId={panelId}
        value={tab}
        options={tabs}
        onChange={changeTab}
      />

      <div id={panelId} role="tabpanel" aria-label={tabs.find((t) => t.value === tab)?.label}>
        {tab === 'overview' ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-2xl border-border bg-card shadow-sm">
              <CardHeader className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4 text-indigo-300" aria-hidden />
                  Tenant
                </CardTitle>
                <CardDescription>
                  Who the workspace belongs to and how it was provisioned.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2.5 pt-0 sm:grid-cols-2">
                <MiniStat label="Agency id" value={agency._id} mono />
                <MiniStat label="Workspace" value={agency.slug} mono />
                <MiniStat label="Provisioned" value={formatAdminDate(agency.provisionedAt)} />
                <MiniStat label="Created" value={formatAdminDate(agency.createdAt)} />
                <MiniStat label="Billing contact" value={agency.billing?.contactName ?? '—'} />
                <MiniStat label="Billing email" value={agency.billing?.contactEmail ?? '—'} />
                {agency.billing?.notes ? (
                  <div className="sm:col-span-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Notes
                    </p>
                    <p className="mt-1 whitespace-pre-line text-xs leading-5 text-foreground/80">
                      {agency.billing.notes}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border bg-card shadow-sm">
              <CardHeader className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Crown className="h-4 w-4 text-amber-300" aria-hidden />
                  Owners
                </CardTitle>
                <CardDescription>
                  A tenant always keeps at least one owner; the server refuses the last
                  removal.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {agency.owners.length === 0 ? (
                  <AdminEmptyState
                    icon={Crown}
                    title="No owner on this tenant"
                    description="Transfer ownership from the header once a member exists."
                    className="py-8"
                  />
                ) : (
                  <ul className="space-y-2">
                    {agency.owners.map((owner) => (
                      <li
                        key={owner.accountId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {owner.name?.trim() || owner.email.split('@')[0]}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {owner.email}
                          </span>
                        </span>
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-500/10 text-[10px] uppercase tracking-wide text-amber-300"
                        >
                          Owner
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 h-8 gap-1.5 rounded-full px-3 text-xs"
                  onClick={() => setTransferOpen(true)}
                  disabled={busy !== null || agency.owners.length === 0 || nonOwners.length === 0}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />
                  Transfer ownership
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {tab === 'plan' ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-2xl border-border bg-card shadow-sm">
              <CardHeader className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Gauge className="h-4 w-4 text-indigo-300" aria-hidden />
                  Current plan and usage
                </CardTitle>
                <CardDescription>
                  Overrides replace that tier's limit until you clear them.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2.5 pt-0 sm:grid-cols-2">
                <MiniStat label="Tier" value={agency.plan.tierId} />
                <MiniStat label="Seats" value={`${agency.usage.seats} / ${agency.plan.seats}`} />
                <MiniStat
                  label="Exports this month"
                  value={`${agency.usage.exportsThisMonth} / ${agency.plan.monthlyExports}`}
                />
                <MiniStat
                  label="Storage"
                  value={`${formatMb(agency.usage.storageBytes)} / ${agency.plan.storageMb} MB`}
                />
                <MiniStat
                  label="Seat override"
                  value={
                    agency.planOverrides?.seats !== undefined
                      ? String(agency.planOverrides.seats)
                      : 'Tier default'
                  }
                />
                <MiniStat
                  label="Export override"
                  value={
                    agency.planOverrides?.monthlyExports !== undefined
                      ? String(agency.planOverrides.monthlyExports)
                      : 'Tier default'
                  }
                />
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border bg-card shadow-sm">
              <CardHeader className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden />
                  Change plan
                </CardTitle>
                <CardDescription>
                  Pick a tier, then set only the limits this tenant needs overridden.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="plan-tier" className="text-xs">
                      Tier
                    </Label>
                    <Select value={planTierId} onValueChange={setPlanTierId}>
                      <SelectTrigger id="plan-tier" className="h-9">
                        <SelectValue placeholder="Choose a tier" />
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
                  <div className="space-y-1.5">
                    <Label htmlFor="plan-seats" className="text-xs">
                      Seat override
                    </Label>
                    <Input
                      id="plan-seats"
                      type="number"
                      min={1}
                      value={planSeats}
                      onChange={(event) => setPlanSeats(event.target.value)}
                      className="h-9"
                      placeholder="Tier default"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="plan-exports" className="text-xs">
                      Monthly export override
                    </Label>
                    <Input
                      id="plan-exports"
                      type="number"
                      min={0}
                      value={planExports}
                      onChange={(event) => setPlanExports(event.target.value)}
                      className="h-9"
                      placeholder="Tier default"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="plan-storage" className="text-xs">
                      Storage MB override
                    </Label>
                    <Input
                      id="plan-storage"
                      type="number"
                      min={0}
                      value={planStorage}
                      onChange={(event) => setPlanStorage(event.target.value)}
                      className="h-9"
                      placeholder="Tier default"
                    />
                  </div>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  Clearing a field returns that limit to the tier default. The change is
                  written to the platform audit trail.
                </p>
                <Button
                  type="button"
                  className="h-9 bg-indigo-500 text-white hover:bg-indigo-400"
                  onClick={() => void applyPlan()}
                  disabled={busy === 'plan' || !planTierId}
                >
                  {busy === 'plan' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  Apply plan
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {tab === 'directory' ? (
          <div className="space-y-4">
            <Card className="rounded-2xl border-border bg-card shadow-sm">
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Globe2 className="h-4 w-4 text-sky-300" aria-hidden />
                    Public profile
                  </CardTitle>
                  <CardDescription>
                    What travellers can find today, and every ops action taken on it.
                  </CardDescription>
                </div>
                {directorySlug ? (
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <a href={`/agencies/${directorySlug}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      Open public page
                    </a>
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {agency.directory.profile ? (
                  <>
                    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
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
                      <AdminNotice tone="error" title="Hidden from every public surface">
                        Hidden {formatAdminDate(agency.directory.profile.hiddenAt)}
                        {agency.directory.profile.hiddenReason
                          ? ` — ${agency.directory.profile.hiddenReason}`
                          : ''}
                      </AdminNotice>
                    ) : null}

                    {!agency.directory.profile.ready ? (
                      <AdminNotice tone="warning" title="Not publishable yet">
                        Missing: {agency.directory.profile.missing.join(' ')}
                      </AdminNotice>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 rounded-full px-3 text-xs"
                        onClick={() =>
                          void changeVerification(!agency.directory.profile?.verifiedAt)
                        }
                        disabled={busy !== null}
                      >
                        {agency.directory.profile.verifiedAt ? (
                          <ShieldOff className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {agency.directory.profile.verifiedAt ? 'Remove badge' : 'Verify badge'}
                      </Button>
                      {agency.directory.profile.hiddenAt ? (
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 gap-1.5 rounded-full bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-500"
                          onClick={() => void restoreProfile()}
                          disabled={busy !== null}
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                          Restore profile
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5 rounded-full border-rose-500/40 px-3 text-xs text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                          onClick={() => {
                            setDirectoryHideReason('');
                            setDirectoryHideTarget({ kind: 'profile' });
                          }}
                          disabled={busy !== null}
                        >
                          <EyeOff className="h-3.5 w-3.5" aria-hidden />
                          Hide profile
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <AdminEmptyState
                    icon={Globe2}
                    title="No public profile yet"
                    description="This agency has not saved a directory profile, so nothing is listed."
                    className="py-8"
                  />
                )}
              </CardContent>
            </Card>

            <AdminTableFrame
              title="Packages"
              description="Public package snapshots, including anything you have hidden."
              minWidth="620px"
            >
              <thead>
                <tr>
                  <th className={adminTableHeadClass}>Package</th>
                  <th className={adminTableHeadClass}>State</th>
                  <th className={adminTableHeadClass}>Price</th>
                  <th className={`${adminTableHeadClass} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {agency.directory.packages.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <AdminEmptyState
                        icon={Globe2}
                        title="No packages yet"
                        description="Packages appear here once the agency builds one."
                      />
                    </td>
                  </tr>
                ) : (
                  agency.directory.packages.map((pkg) => (
                    <tr key={pkg.id} className={adminTableRowClass}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{pkg.title || 'Untitled package'}</p>
                        {pkg.hiddenAt ? (
                          <p className="text-[11px] text-rose-300">
                            Hidden {formatAdminDate(pkg.hiddenAt)}
                            {pkg.hiddenReason ? ` — ${pkg.hiddenReason}` : ''}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            pkg.hiddenAt
                              ? 'border-rose-500/40 bg-rose-500/10 text-[10px] text-rose-300'
                              : pkg.state === 'published'
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-300'
                                : 'text-[10px] text-muted-foreground'
                          }
                        >
                          {pkg.hiddenAt ? 'hidden' : pkg.state}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {pkg.pricePerPerson === null
                          ? 'On request'
                          : `${pkg.currency} ${pkg.pricePerPerson.toLocaleString('en-IN')}`}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          {pkg.hiddenAt ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 gap-1.5 rounded-full px-3 text-xs text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
                              onClick={() => void restorePackage(pkg)}
                              disabled={busy !== null}
                            >
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                              Restore
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 gap-1.5 rounded-full px-3 text-xs text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
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
                              <EyeOff className="h-3.5 w-3.5" aria-hidden />
                              Hide
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </AdminTableFrame>
          </div>
        ) : null}

        {tab === 'members' ? (
          <div className="space-y-4">
            <AdminTableFrame
              title="Members"
              description={`${agency.members.length} account${agency.members.length === 1 ? '' : 's'} · ${agency.owners.length} owner${agency.owners.length === 1 ? '' : 's'} · ${agency.plan.seats} seats`}
              minWidth="720px"
            >
              <thead>
                <tr>
                  <th className={adminTableHeadClass}>Member</th>
                  <th className={adminTableHeadClass}>Role</th>
                  <th className={adminTableHeadClass}>Account</th>
                  <th className={adminTableHeadClass}>Joined</th>
                  <th className={`${adminTableHeadClass} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {agency.members.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <AdminEmptyState
                        icon={Users}
                        title="No members yet"
                        description="Invite the first teammate below."
                      />
                    </td>
                  </tr>
                ) : (
                  agency.members.map((member) => (
                    <tr key={member.userId} className={adminTableRowClass}>
                      <td className="px-4 py-3">
                        <p className="font-medium">
                          {member.name?.trim() || member.email.split('@')[0]}
                        </p>
                        <p className="break-all text-xs text-muted-foreground">
                          {member.email}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={member.role}
                          onValueChange={(value) =>
                            void changeRole(member, value as PlatformAgencyRole)
                          }
                          disabled={busy === `role-${member.userId}`}
                        >
                          <SelectTrigger
                            className="h-8 w-28 text-xs"
                            aria-label={`Role for ${member.email}`}
                          >
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
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            member.status === 'active'
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-300'
                              : 'border-rose-500/40 bg-rose-500/10 text-[10px] text-rose-300'
                          }
                        >
                          {member.status}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {formatAdminDate(member.joinedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => setResetTarget(member)}
                            title="Reset workspace password"
                            aria-label={`Reset password for ${member.email}`}
                          >
                            <KeyRound className="h-4 w-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                            onClick={() => setRemoveTarget(member)}
                            title="Remove member"
                            aria-label={`Remove ${member.email}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </AdminTableFrame>

            <Card className="rounded-2xl border-border bg-card shadow-sm">
              <CardHeader className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserPlus className="h-4 w-4 text-indigo-300" aria-hidden />
                  Invite a member
                </CardTitle>
                <CardDescription>
                  An email-bound invite only works for that address; a shareable link works
                  for whoever opens it first.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Select
                    value={inviteRole}
                    onValueChange={(value) =>
                      setInviteRole(value as Exclude<PlatformAgencyRole, 'owner'>)
                    }
                  >
                    <SelectTrigger className="h-9" aria-label="Invite role">
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
                    <SelectTrigger className="h-9" aria-label="Invite kind">
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
                    aria-label="Invite email"
                    className="h-9"
                  />
                  <Button
                    type="button"
                    className="h-9 bg-indigo-500 text-white hover:bg-indigo-400"
                    onClick={() => void createInvite()}
                    disabled={busy === 'invite' || (inviteKind === 'email' && !inviteEmail.trim())}
                  >
                    {busy === 'invite' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <UserPlus className="mr-2 h-4 w-4" aria-hidden />
                    )}
                    Create invite
                  </Button>
                </div>

                {inviteLink ? (
                  <AdminNotice
                    tone="success"
                    title="Invitation link — shown once"
                    action={
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 rounded-full px-3 text-xs"
                        onClick={() => void copyInvite()}
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        Copy
                      </Button>
                    }
                  >
                    <span className="break-all font-mono text-[11px]">{inviteLink}</span>
                  </AdminNotice>
                ) : null}
              </CardContent>
            </Card>
          </div>
        ) : null}

        {tab === 'audit' ? (
          <Card className="rounded-2xl border-border bg-card shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
              <div className="min-w-0 space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="h-4 w-4 text-indigo-300" aria-hidden />
                  Recent platform audit
                </CardTitle>
                <CardDescription>
                  Provisioning, plan, member and directory changes. Tenant content is never
                  recorded.
                </CardDescription>
              </div>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Link to={`/admin/audit?targetId=${encodeURIComponent(agency._id)}`}>
                  Filter the audit log
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              {agency.recentAudit.length === 0 ? (
                <AdminEmptyState
                  icon={ClipboardList}
                  title="No platform events for this tenant"
                  description="Provisioning and every ops action will be listed here."
                  className="py-10"
                />
              ) : (
                <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border">
                  {agency.recentAudit.map((event) => (
                    <li key={event._id} className="px-3.5 py-2.5">
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
                        {auditSummary(event.metadata)
                          ? ` · ${auditSummary(event.metadata)}`
                          : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <AlertDialog
        open={statusTarget !== null}
        onOpenChange={(next) => {
          if (!next && busy !== 'status') setStatusTarget(null);
        }}
      >
        <AlertDialogContent className="dark rounded-2xl border-border bg-card text-card-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {statusTarget === 'suspended' ? (
                <ShieldOff className="h-4 w-4 text-rose-400" aria-hidden />
              ) : (
                <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden />
              )}
              {statusTarget === 'suspended' ? 'Suspend this tenant?' : 'Reactivate this tenant?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              {statusTarget === 'suspended'
                ? 'Agency sign-in, every staff route and every public proposal link will fail closed immediately. Personal accounts and other tenants are unaffected.'
                : 'Agency staff can sign in again. Previously invalidated sessions stay invalid; users sign in fresh.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === 'status'}>Cancel</AlertDialogCancel>
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
              {busy === 'status' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
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
        <AlertDialogContent className="dark rounded-2xl border-border bg-card text-card-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-rose-400" aria-hidden />
              Remove this member?
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              The membership is deleted and the account's current session stops on its next
              request. The account row remains for a future re-invite. The last owner can
              never be removed.
              {removeTarget ? (
                <span className="mt-2 block break-all text-foreground/80">
                  {removeTarget.email} · {removeTarget.role}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === 'remove'}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy === 'remove'}
              onClick={(event) => {
                event.preventDefault();
                void removeMember();
              }}
              className="bg-rose-600 text-white hover:bg-rose-500"
            >
              {busy === 'remove' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
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
        <AlertDialogContent className="dark rounded-2xl border-border bg-card text-card-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-400" aria-hidden />
              Reset workspace password?
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              A one-time password is issued and the account must change it at the next
              sign-in. Every existing session for this agency account is invalidated. A
              personal account with the same email is never touched.
              {resetTarget ? (
                <span className="mt-2 block break-all text-foreground/80">
                  {resetTarget.email}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === 'reset'}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy === 'reset'}
              onClick={(event) => {
                event.preventDefault();
                void resetPassword();
              }}
              className="bg-amber-600 text-white hover:bg-amber-500"
            >
              {busy === 'reset' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Issue temporary password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="dark rounded-2xl border-border bg-card text-card-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-400" aria-hidden />
              Transfer ownership
            </DialogTitle>
            <DialogDescription className="leading-6">
              The new owner is promoted first, then the previous owner becomes an admin. The
              workspace always keeps at least one owner.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Current owner</Label>
              <Select value={fromUserId} onValueChange={setFromUserId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Choose an owner" />
                </SelectTrigger>
                <SelectContent>
                  {agency.owners.map((owner) => (
                    <SelectItem key={owner.accountId} value={owner.accountId}>
                      {owner.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>New owner</Label>
              <Select value={toUserId} onValueChange={setToUserId}>
                <SelectTrigger className="h-9">
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
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ArrowRightLeft className="mr-2 h-4 w-4" aria-hidden />
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
        <DialogContent className="dark rounded-2xl border-border bg-card text-card-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <EyeOff className="h-4 w-4 text-rose-400" aria-hidden />
              {directoryHideTarget?.kind === 'package'
                ? 'Hide this package?'
                : 'Hide this profile?'}
            </DialogTitle>
            <DialogDescription className="leading-6">
              {directoryHideTarget?.kind === 'package'
                ? `"${
                    directoryHideTarget.title || 'Untitled package'
                  }" disappears from the public profile and its cover route. The agency keeps its draft/published choice and you can restore it here.`
                : 'The profile disappears from the listing, facets, its direct URL, package covers and every enquiry entry point. The publish date is kept, so a restore returns it to the directory.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="hide-reason">Reason (audited and shown to the agency)</Label>
              <Input
                id="hide-reason"
                value={directoryHideReason}
                onChange={(event) => setDirectoryHideReason(event.target.value)}
                maxLength={500}
                placeholder="Why is it coming down?"
                className="h-9"
              />
            </div>
            <Button
              type="button"
              className="w-full bg-rose-600 text-white hover:bg-rose-500"
              onClick={() => void confirmDirectoryHide()}
              disabled={busy === 'directory-hide' || !directoryHideReason.trim()}
            >
              {busy === 'directory-hide' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <EyeOff className="mr-2 h-4 w-4" aria-hidden />
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
    </div>
  );
};

const MiniStat: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
    <p
      className={`mt-0.5 break-all text-sm text-foreground/90 ${mono ? 'font-mono text-xs' : ''}`}
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

export default AdminAgencyRecord;
