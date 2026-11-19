import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Check,
  Clock3,
  Copy,
  Crown,
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
import { AgencyPageHeader } from '@/components/agency/AgencyPageHeader';
import { AsyncErrorPanel } from '@/components/states/AsyncState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { ConfirmDestructive } from '@/components/ui/confirm-destructive';
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
  const [loadError, setLoadError] = useState<unknown | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AgencyMember | null>(null);
  /** Ownership is never granted from the inline role select. */
  const [promoteTarget, setPromoteTarget] = useState<AgencyMember | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AgencyInvite | null>(null);

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
      setLoadError(null);
    } catch (err) {
      // Shown in the content area; with a list already on screen the last
      // known roster stays and only the next refresh can change it.
      setLoadError(err);
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
    const previousRole = member.role;
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
      // A role change is reversible; a promotion to owner is confirmed first.
      toast.success(`${member.label} is now ${agencyRoleLabel(role).toLowerCase()}.`, {
        action: member.isYou
          ? undefined
          : {
              label: 'Undo',
              onClick: () => {
                void api
                  .changeAgencyMemberRole(activeAgencyId, member.userId, previousRole)
                  .then((reverted) => {
                    setMembers(reverted.members ?? []);
                    toast.success(`${member.label} is back to ${agencyRoleLabel(previousRole).toLowerCase()}.`);
                  })
                  .catch(() => toast.error('Could not undo that role change.'));
              },
            },
      });
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Role change failed.');
      return false;
    } finally {
      setBusyUserId(null);
    }
  };

  const promoteToOwner = async () => {
    if (!promoteTarget) return;
    const promoted = await changeRole(promoteTarget, 'owner');
    if (promoted) setPromoteTarget(null);
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

  const revokeInvite = async () => {
    if (!activeAgencyId || !revokeTarget) return;
    try {
      await api.revokeAgencyInvite(activeAgencyId, revokeTarget._id);
      setInvites((current) => current.filter((item) => item._id !== revokeTarget._id));
      setRevokeTarget(null);
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
      <AgencyPageHeader
        title="Team"
        meta={
          <Badge variant="outline" className="text-xs">
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </Badge>
        }
        description="Agency roles are separate from the roles people have on individual trips."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              <RefreshCw
                className={cn('mr-1.5 h-4 w-4', refreshing && 'animate-spin')}
              />
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
          </>
        }
      />

      {!canManage ? (
        <div className="rounded-xl border border-agency-line bg-agency-panel px-4 py-3 text-sm text-agency-muted">
          You have read-only access to the team. Owners and admins can invite people
          and change roles.
        </div>
      ) : null}

      {loadError && members.length === 0 ? (
        <AsyncErrorPanel
          error={loadError}
          subject="the agency team"
          onRetry={() => void load()}
        />
      ) : (
      <>
      <Card className="rounded-2xl border-agency-line bg-agency-panel shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-agency-ink">
            <Users className="h-4 w-4" />
            Members
          </CardTitle>
          <CardDescription className="text-xs leading-5 text-agency-muted">
            {isOwner
              ? 'As an owner you can promote another owner, but the last owner can never be removed or demoted.'
              : 'Admins manage planners and viewers. Only an owner can change another owner.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:block">
            <Table>
              <TableHeader className="bg-agency-panel">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-10 text-overline font-semibold text-agency-muted">Member</TableHead>
                  <TableHead className="h-10 text-overline font-semibold text-agency-muted">Contact</TableHead>
                  <TableHead className="h-10 text-overline font-semibold text-agency-muted">Role</TableHead>
                  <TableHead className="h-10 text-overline font-semibold text-agency-muted">Joined</TableHead>
                  <TableHead className="h-10 text-right text-overline font-semibold text-agency-muted">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const soleOwner = member.role === 'owner' && ownerCount <= 1;
                  const ownerTarget = member.role === 'owner';
                  const canEditRole =
                    canManage && !soleOwner && (!ownerTarget || isOwner);
                  const canRemove =
                    canManage && !soleOwner && (!ownerTarget || isOwner);
                  /** Ownership appears as its own guarded action, never inline. */
                  const canPromote =
                    isOwner && canManage && !ownerTarget && !member.isYou;
                  const busy = busyUserId === member.userId;

                  return (
                    <TableRow
                      key={member.userId}
                      className="hover:bg-agency-soft/60"
                    >
                      <TableCell className="py-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={avatarSrc(member.avatarUrl)} alt="" />
                            <AvatarFallback className="bg-agency-accent-soft text-xs font-semibold text-agency-accent-ink">
                              {initialsFor(member.label)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-medium text-agency-ink">
                              {member.label}
                            </span>
                            {member.isYou ? (
                              <Badge variant="outline" className="text-xs">
                                You
                              </Badge>
                            ) : null}
                            {soleOwner ? (
                              <Badge
                                variant="outline"
                                className="border-warning/30 bg-warning/10 text-xs text-warning-ink dark:border-warning/40 dark:bg-warning/20"
                              >
                                Last owner
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-agency-muted">
                        {member.email || '—'}
                      </TableCell>
                      <TableCell className="py-3">
                        {canEditRole ? (
                          <Select
                            value={member.role}
                            onValueChange={(value) =>
                              void changeRole(member, value as AgencyRole)
                            }
                            disabled={busy}
                          >
                            <SelectTrigger className="h-8 w-32 border-agency-line" aria-label={`Role for ${member.label}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="planner">Planner</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            variant="outline"
                            className={cn('text-xs', agencyRoleBadgeClass(member.role))}
                          >
                            {agencyRoleLabel(member.role)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-3 text-xs text-agency-muted">
                        {formatAgencyDate(member.joinedAt)}
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex justify-end gap-1">
                          {canPromote ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-agency-muted hover:text-warning-ink"
                              onClick={() => setPromoteTarget(member)}
                              disabled={busy}
                              title={`Make ${member.label} an owner`}
                              aria-label={`Make ${member.label} an owner`}
                            >
                              <Crown className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {canRemove && member.userId !== myId ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-agency-muted hover:text-destructive-ink"
                              onClick={() => setRemoveTarget(member)}
                              disabled={busy}
                              title={`Remove ${member.label}`}
                              aria-label={`Remove ${member.label}`}
                            >
                              {busy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <UserMinus className="h-4 w-4" />
                              )}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="divide-y divide-agency-line md:hidden">
          {members.map((member) => {
            const soleOwner = member.role === 'owner' && ownerCount <= 1;
            const ownerTarget = member.role === 'owner';
            const canEditRole =
              canManage && !soleOwner && (!ownerTarget || isOwner);
            const canRemove =
              canManage && !soleOwner && (!ownerTarget || isOwner);
            const canPromote =
              isOwner && canManage && !ownerTarget && !member.isYou;
            const busy = busyUserId === member.userId;

            return (
              <div
                key={member.userId}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center"
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={avatarSrc(member.avatarUrl)} alt="" />
                  <AvatarFallback className="bg-agency-accent-soft text-xs font-semibold text-agency-accent-ink">
                    {initialsFor(member.label)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-agency-ink">{member.label}</span>
                    {member.isYou ? (
                      <Badge variant="outline" className="text-xs">
                        You
                      </Badge>
                    ) : null}
                    {soleOwner ? (
                      <Badge
                        variant="outline"
                        className="border-warning/30 bg-warning/10 text-xs text-warning-ink dark:border-warning/40 dark:bg-warning/20"
                      >
                        Last owner
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-agency-muted">
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
                      <SelectTrigger className="h-8 w-32 border-agency-line" aria-label={`Role for ${member.label}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="planner">Planner</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge
                      variant="outline"
                      className={cn('text-xs', agencyRoleBadgeClass(member.role))}
                    >
                      {agencyRoleLabel(member.role)}
                    </Badge>
                  )}

                  {canPromote ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-agency-muted hover:text-warning-ink"
                      onClick={() => setPromoteTarget(member)}
                      disabled={busy}
                      title={`Make ${member.label} an owner`}
                      aria-label={`Make ${member.label} an owner`}
                    >
                      <Crown className="h-4 w-4" />
                    </Button>
                  ) : null}

                  {canRemove && member.userId !== myId ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-agency-muted hover:text-destructive-ink"
                      onClick={() => setRemoveTarget(member)}
                      disabled={busy}
                      title={`Remove ${member.label}`}
                      aria-label={`Remove ${member.label}`}
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
          </div>
        </CardContent>
      </Card>

      {canManage ? (
        <Card className="rounded-2xl border-agency-line bg-agency-panel shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-agency-ink">
              <Link2 className="h-4 w-4" />
              Pending invitations
            </CardTitle>
            <CardDescription className="text-xs leading-5 text-agency-muted">
              Tokens are hashed at rest, single-use by default, and revocable here.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {invites.length === 0 ? (
              <div className="px-4 pb-5 pt-1 text-sm text-agency-muted">
                No pending invitations. Invite a teammate to get started.
              </div>
            ) : (
              <div className="divide-y divide-agency-line">
                {invites.map((invite) => (
                  <div
                    key={invite._id}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn('text-xs', agencyRoleBadgeClass(invite.role))}
                        >
                          {agencyRoleLabel(invite.role)}
                        </Badge>
                        <span className="text-xs text-agency-muted">
                          {invite.kind === 'email'
                            ? invite.email || 'Email invitation'
                            : `Link · ${invite.usedCount}/${invite.maxUses} used`}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-agency-muted/80">
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
                      className="self-start text-agency-muted hover:text-destructive-ink"
                      onClick={() => setRevokeTarget(invite)}
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
      </>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="rounded-2xl sm:rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Invite a teammate</DialogTitle>
            <DialogDescription>
              They join this agency only. Their personal workspace stays theirs.
            </DialogDescription>
          </DialogHeader>

          {generatedLink ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-agency-line bg-agency-soft p-3 text-sm text-agency-ink">
                Invitation ready. Copy this link and send it directly.
              </div>
              <div className="space-y-2">
                <Label htmlFor="team-invite-link">Invitation link</Label>
                <div className="flex gap-2">
                  <Input id="team-invite-link" name="inviteLink" value={generatedLink} readOnly className="font-mono text-xs" />
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
                  <Label htmlFor="team-invite-role">Role</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(value) => setInviteRole(value as AgencyInvitableRole)}
                  >
                    <SelectTrigger id="team-invite-role">
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
                  <Label htmlFor="team-invite-kind">Type</Label>
                  <Select
                    value={inviteKind}
                    onValueChange={(value) => setInviteKind(value as 'link' | 'email')}
                  >
                    <SelectTrigger id="team-invite-kind">
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
                    name="email"
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="teammate@agency.com"
                  />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="team-invite-max-uses">Maximum uses</Label>
                    <Input
                      id="team-invite-max-uses"
                      name="maxUses"
                      type="number"
                      min={1}
                      max={25}
                      value={inviteMaxUses}
                      onChange={(event) => setInviteMaxUses(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="team-invite-ttl">Expires in</Label>
                    <Select value={inviteTtl} onValueChange={setInviteTtl}>
                      <SelectTrigger id="team-invite-ttl">
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

              <div className="rounded-lg border border-agency-line bg-agency-soft/60 p-3 text-xs text-agency-muted">
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

      <ConfirmDestructive
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title={`Remove ${removeTarget?.label ?? "this teammate"}?`}
        description="They lose agency staff access immediately. Their personal trips and account are not affected, and an owner can invite them again later."
        confirmLabel="Remove from agency"
        onConfirm={removeMember}
        busy={Boolean(removeTarget && busyUserId === removeTarget.userId)}
        detail={
          removeTarget ? (
            <>
              <span className="font-semibold">{removeTarget.email || removeTarget.label}</span>{" "}
              · {agencyRoleLabel(removeTarget.role).toLowerCase()}
            </>
          ) : null
        }
      />

      <ConfirmDestructive
        open={Boolean(promoteTarget)}
        onOpenChange={(open) => {
          if (!open) setPromoteTarget(null);
        }}
        tone="warning"
        icon={Crown}
        title={`Make ${promoteTarget?.label ?? "this teammate"} an owner?`}
        description="Owners can change every role, remove teammates and manage the workspace. The last owner can never be demoted or removed."
        confirmLabel="Make owner"
        onConfirm={promoteToOwner}
        busy={Boolean(promoteTarget && busyUserId === promoteTarget.userId)}
        detail={
          promoteTarget ? (
            <>
              <span className="font-semibold">
                {promoteTarget.email || promoteTarget.label}
              </span>{" "}
              becomes an owner alongside you.
            </>
          ) : null
        }
        typedConfirmation={{
          phrase: promoteTarget?.email || promoteTarget?.label || "",
          label: "Type their email to confirm",
          placeholder: promoteTarget?.email || promoteTarget?.label || "",
        }}
      />

      <ConfirmDestructive
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title="Revoke this invitation?"
        description="The link stops working immediately. Anyone already in the agency is unaffected; you can create a new invitation at any time."
        confirmLabel="Revoke invitation"
        onConfirm={revokeInvite}
        detail={
          revokeTarget ? (
            <>
              {revokeTarget.kind === "email"
                ? revokeTarget.email || "Email invitation"
                : `Link · ${revokeTarget.usedCount}/${revokeTarget.maxUses} used`}{" "}
              for the {agencyRoleLabel(revokeTarget.role).toLowerCase()} role.
            </>
          ) : null
        }
      />
    </div>
  );
};

const LoadingRow: React.FC<{ label: string }> = ({ label }) => (
  <div
    role="status"
    className="flex items-center gap-2 py-16 text-sm text-agency-muted"
  >
    <Loader2 className="h-4 w-4 animate-spin" />
    {label}
  </div>
);

export default AgencyTeam;
