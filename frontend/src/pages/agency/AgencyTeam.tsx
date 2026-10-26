import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Check,
  Clock3,
  Copy,
  Link2,
  Loader2,
  Mail,
  RefreshCw,
  Shield,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { api } from '@/services/api';
import { useAgency } from '@/context/AgencyContext';
import { avatarSrc, initialsFor } from '@/lib/avatar';
import {
  AGENCY_INVITABLE_ROLES,
  agencyRoleBadgeClass,
  agencyRoleLabel,
  formatAgencyDate,
} from '@/lib/agency';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { AgencyInvite, AgencyInvitableRole, AgencyMember, AgencyRole } from '@/types';

const AgencyTeam: React.FC = () => {
  const {
    activeAgency,
    activeAgencyId,
    canManage,
    loading: contextLoading,
    replaceAgency,
  } = useAgency();

  const [members, setMembers] = useState<AgencyMember[]>([]);
  const [invites, setInvites] = useState<AgencyInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AgencyMember | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<AgencyInvitableRole>('planner');
  const [inviteKind, setInviteKind] = useState<'link' | 'email'>('email');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMaxUses, setInviteMaxUses] = useState('1');
  const [inviteTtl, setInviteTtl] = useState('168');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!activeAgencyId) return;
    setLoading(true);
    try {
      const results = await Promise.all([
        api.getAgencyMembers(activeAgencyId),
        canManage ? api.getAgencyInvites(activeAgencyId) : Promise.resolve({ invites: [] }),
      ]);
      setMembers(results[0].members ?? []);
      setInvites(results[1].invites ?? []);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'We could not load the agency team.'
      );
    } finally {
      setLoading(false);
    }
  }, [activeAgencyId, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  const ownerCount = useMemo(
    () => members.filter((member) => member.role === 'owner').length,
    [members]
  );

  const isOwner = activeAgency?.role === 'owner';
  const myId = members.find((member) => member.isYou)?.userId;

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const changeRole = async (member: AgencyMember, role: AgencyRole) => {
    if (!activeAgencyId || role === member.role) return;
    setBusyUserId(member.userId);
    try {
      const result = await api.changeAgencyMemberRole(
        activeAgencyId,
        member.userId,
        role
      );
      setMembers(result.members ?? []);
      if (member.isYou && activeAgency) {
        replaceAgency({ ...activeAgency, role });
      }
      toast.success(`${member.label} is now ${agencyRoleLabel(role).toLowerCase()}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Role change failed.');
    } finally {
      setBusyUserId(null);
    }
  };

  const removeMember = async () => {
    if (!activeAgencyId || !removeTarget) return;
    setBusyUserId(removeTarget.userId);
    try {
      const result = await api.removeAgencyMember(
        activeAgencyId,
        removeTarget.userId
      );
      setMembers(result.members ?? []);
      toast.success(`${removeTarget.label} was removed from the agency.`);
      setRemoveTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove that person.');
    } finally {
      setBusyUserId(null);
    }
  };

  const createInvite = async () => {
    if (!activeAgencyId) return;
    if (inviteKind === 'email' && !inviteEmail.trim()) {
      toast.error('Enter the email address for this invitation.');
      return;
    }
    setInviteBusy(true);
    try {
      const result = await api.createAgencyInvite(activeAgencyId, {
        role: inviteRole,
        kind: inviteKind,
        ...(inviteKind === 'email' ? { email: inviteEmail.trim() } : {}),
        maxUses: inviteKind === 'link' ? Number(inviteMaxUses) || 1 : 1,
        ttlHours: Number(inviteTtl) || 168,
      });
      setInvites((current) => [result.invite, ...current]);
      setGeneratedLink(result.link);
      setCopied(false);
      toast.success('Invitation created.');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'We could not create the invitation.'
      );
    } finally {
      setInviteBusy(false);
    }
  };

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success('Invitation link copied.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed. Select the link and copy it manually.');
    }
  };

  const revokeInvite = async (invite: AgencyInvite) => {
    if (!activeAgencyId) return;
    try {
      await api.revokeAgencyInvite(activeAgencyId, invite._id);
      setInvites((current) => current.filter((item) => item._id !== invite._id));
      toast.success('Invitation revoked.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not revoke the invitation.');
    }
  };

  if (contextLoading && !activeAgency) {
    return <LoadingRow label="Opening agency…" />;
  }
  if (!activeAgencyId) {
    return <Navigate to="/agency" replace />;
  }
  if (loading) {
    return <LoadingRow label="Loading team…" />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
            <Badge variant="outline" className="text-[10px]">
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Agency roles are separate from the roles people have on individual trips.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw className={cn('mr-1.5 h-4 w-4', refreshing && 'animate-spin')} />
            Refresh
          </Button>
          {canManage ? (
            <Button
              size="sm"
              onClick={() => {
                setGeneratedLink('');
                setInviteOpen(true);
              }}
            >
              <UserPlus className="mr-1.5 h-4 w-4" />
              Invite teammate
            </Button>
          ) : null}
        </div>
      </div>

      {!canManage ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          You have read-only access to the team. Owners and admins can invite people
          and change roles.
        </div>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Members
          </CardTitle>
          <CardDescription>
            {isOwner
              ? 'As an owner you can promote another owner, but the last owner can never be removed or demoted.'
              : 'Admins manage planners and viewers. Only an owner can change another owner.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-slate-100 p-0 dark:divide-slate-800">
          {members.map((member) => {
            const soleOwner = member.role === 'owner' && ownerCount <= 1;
            const ownerTarget = member.role === 'owner';
            const canEditRole =
              canManage && !soleOwner && (!ownerTarget || isOwner);
            const canRemove =
              canManage && !soleOwner && (!ownerTarget || isOwner);
            const busy = busyUserId === member.userId;

            return (
              <div
                key={member.userId}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center"
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={avatarSrc(member.avatarUrl)} alt="" />
                  <AvatarFallback className="bg-slate-100 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {initialsFor(member.label)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{member.label}</span>
                    {member.isYou ? (
                      <Badge variant="outline" className="text-[9px]">
                        You
                      </Badge>
                    ) : null}
                    {soleOwner ? (
                      <Badge
                        variant="outline"
                        className="border-amber-200 bg-amber-50 text-[9px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                      >
                        Last owner
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    {member.email ? (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {member.email}
                      </span>
                    ) : null}
                    <span>Joined {formatAgencyDate(member.joinedAt)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:justify-end">
                  {canEditRole ? (
                    <Select
                      value={member.role}
                      onValueChange={(value) => void changeRole(member, value as AgencyRole)}
                      disabled={busy}
                    >
                      <SelectTrigger className="h-8 w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {isOwner ? <SelectItem value="owner">Owner</SelectItem> : null}
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="planner">Planner</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge
                      variant="outline"
                      className={cn('text-[10px]', agencyRoleBadgeClass(member.role))}
                    >
                      {agencyRoleLabel(member.role)}
                    </Badge>
                  )}

                  {canRemove && member.userId !== myId ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-rose-600"
                      onClick={() => setRemoveTarget(member)}
                      disabled={busy}
                      title={`Remove ${member.label}`}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserMinus className="h-4 w-4" />
                      )}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4" />
              Pending invitations
            </CardTitle>
            <CardDescription>
              Tokens are hashed at rest, single-use by default, and revocable here.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {invites.length === 0 ? (
              <div className="px-4 pb-5 pt-1 text-sm text-slate-500 dark:text-slate-400">
                No pending invitations. Invite a teammate to get started.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {invites.map((invite) => (
                  <div
                    key={invite._id}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn('text-[10px]', agencyRoleBadgeClass(invite.role))}
                        >
                          {agencyRoleLabel(invite.role)}
                        </Badge>
                        <span className="text-xs text-slate-500">
                          {invite.kind === 'email'
                            ? invite.email || 'Email invitation'
                            : `Link · ${invite.usedCount}/${invite.maxUses} used`}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <span className="font-mono">…{invite.tokenHint}</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3 w-3" />
                          Expires {formatAgencyDate(invite.expiresAt)}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="self-start text-slate-500 hover:text-rose-600"
                      onClick={() => void revokeInvite(invite)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Invite a teammate</DialogTitle>
            <DialogDescription>
              They join this agency only. Their personal workspace stays theirs.
            </DialogDescription>
          </DialogHeader>

          {generatedLink ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
                Invitation ready. Copy this link and send it directly.
              </div>
              <div className="space-y-2">
                <Label>Invitation link</Label>
                <div className="flex gap-2">
                  <Input value={generatedLink} readOnly className="font-mono text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void copyLink(generatedLink)}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setGeneratedLink('');
                    setInviteEmail('');
                  }}
                >
                  Create another
                </Button>
                <Button onClick={() => setInviteOpen(false)}>Done</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(value) => setInviteRole(value as AgencyInvitableRole)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AGENCY_INVITABLE_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {agencyRoleLabel(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={inviteKind}
                    onValueChange={(value) => setInviteKind(value as 'link' | 'email')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email-bound</SelectItem>
                      <SelectItem value="link">Copyable link</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {inviteKind === 'email' ? (
                <div className="space-y-2">
                  <Label htmlFor="team-invite-email">Teammate email</Label>
                  <Input
                    id="team-invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="teammate@agency.com"
                  />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Maximum uses</Label>
                    <Input
                      type="number"
                      min={1}
                      max={25}
                      value={inviteMaxUses}
                      onChange={(event) => setInviteMaxUses(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Expires in</Label>
                    <Select value={inviteTtl} onValueChange={setInviteTtl}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24">24 hours</SelectItem>
                        <SelectItem value="72">3 days</SelectItem>
                        <SelectItem value="168">1 week</SelectItem>
                        <SelectItem value="720">30 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                <Shield className="mr-1 inline h-3.5 w-3.5" />
                Invitations never grant ownership. An owner can promote someone later.
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setInviteOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => void createInvite()} disabled={inviteBusy}>
                  {inviteBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Create invitation
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose agency staff access immediately. Their personal trips and
              account are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => void removeMember()}
            >
              Remove from agency
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const LoadingRow: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
    <Loader2 className="h-4 w-4 animate-spin" />
    {label}
  </div>
);

export default AgencyTeam;
