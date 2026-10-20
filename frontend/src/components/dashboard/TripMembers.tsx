import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { InviteDialog } from "./InviteDialog";
import { api } from "@/services/api";
import { toast } from "sonner";
import {
  Loader2,
  UserMinus,
  LogOut,
  Link2,
  Copy,
  Ban,
  Crown,
  Users,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { avatarSrc } from "@/lib/avatar";
import { roleLabel } from "@/hooks/useTripAccess";
import type {
  TripInviteInfo,
  TripMember,
  TripRole,
} from "@/types/trip";

interface TripMembersProps {
  tripId: string;
  /** The caller's own role on this trip (annotated payloads only). */
  myRole: TripRole;
}

const ROLE_BADGE_STYLE: Record<TripRole, string> = {
  owner: "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800",
  editor: "bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-800",
  commenter: "bg-sky-500/10 text-sky-600 border-sky-200 dark:border-sky-800",
  viewer: "bg-muted text-muted-foreground border-border",
};

const EDITABLE_ROLES: TripRole[] = ["editor", "commenter", "viewer"];

const initialsFor = (member: TripMember): string => {
  const source = member.label || member.email || member.userId;
  return source.slice(0, 2).toUpperCase();
};

export const TripMembers: React.FC<TripMembersProps> = ({ tripId, myRole }) => {
  const isOwner = myRole === "owner";
  const [members, setMembers] = useState<TripMember[]>([]);
  const [invites, setInvites] = useState<TripInviteInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<TripMember | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TripMember | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<TripInviteInfo | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const membersResult = await api.getTripMembers(tripId);
      setMembers(membersResult.members || []);
    } catch (err: any) {
      // M7.2: an inline error beats a toast that disappears while the People
      // tab silently renders "0 members". Keep the retry inside the card.
      setError(err.message || "Could not load the member list.");
      setLoading(false);
      return;
    }
    if (isOwner) {
      try {
        const invitesResult = await api.getTripInvites(tripId);
        setInvites(invitesResult.invites || []);
      } catch (err: any) {
        setError(err.message || "Could not load pending invitations.");
      }
    }
    setLoading(false);
  }, [tripId, isOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  const runMemberAction = async (
    userId: string,
    action: () => Promise<unknown>,
    success: string
  ): Promise<boolean> => {
    try {
      setBusyId(userId);
      const result: any = await action();
      if (result?.members) setMembers(result.members);
      toast.success(success);
      return true;
    } catch (err: any) {
      toast.error(err.message || "That did not go through. Please try again.");
      return false;
    } finally {
      setBusyId(null);
      setTransferTarget(null);
    }
  };

  const handleRoleChange = (
    member: TripMember,
    role: Exclude<TripRole, "owner">
  ) => {
    void runMemberAction(
      member.userId,
      () => api.changeMemberRole(tripId, member.userId, role),
      `${roleLabel(role)} role set`
    );
  };

  const handleRemove = async (member: TripMember) => {
    const ok = await runMemberAction(
      member.userId,
      () => api.removeMember(tripId, member.userId),
      "Member removed — their expenses stay intact"
    );
    if (ok) setRemoveTarget(null);
  };

  const handleTransfer = (member: TripMember) => {
    void runMemberAction(
      member.userId,
      () => api.transferOwnership(tripId, member.userId),
      "Ownership transferred"
    );
  };

  const handleLeave = async () => {
    try {
      setBusyId("me");
      await api.leaveTrip(tripId);
      toast.success("You have left this trip.");
      window.location.href = "/dashboard";
    } catch (err: any) {
      toast.error(err.message || "Could not leave this trip.");
    } finally {
      setBusyId(null);
      setLeaveDialogOpen(false);
    }
  };

  const handleRevoke = async (invite: TripInviteInfo) => {
    try {
      setBusyId(invite._id);
      await api.revokeTripInvite(tripId, invite._id);
      setInvites((prev) =>
        prev.map((row) => (row._id === invite._id ? { ...row, revokedAt: new Date().toISOString() } : row))
      );
      setRevokeTarget(null);
      toast.success("Invitation revoked");
    } catch (err: any) {
      toast.error(err.message || "Could not revoke the invitation.");
    } finally {
      setBusyId(null);
    }
  };

  const me = members.find((member) => member.isYou);
  const otherMembers = members.filter((member) => !member.isYou);

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Members card */}
      <Card className="rounded-3xl border-border/70 bg-card shadow-xs overflow-hidden">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <h3 className="font-extrabold text-foreground text-sm uppercase tracking-wider">
                Who is on this trip
              </h3>
              <Badge variant="outline" className="text-[10px]">
                {members.length}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {isOwner && (
                <Button
                  type="button"
                  size="sm"
                  variant="hero"
                  onClick={() => setInviteOpen(true)}
                  className="rounded-xl text-xs font-bold gap-1.5 h-9 px-3"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Invite</span>
                </Button>
              )}
              {me && !isOwner && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setLeaveDialogOpen(true)}
                  disabled={busyId === "me"}
                  className="rounded-xl text-xs font-bold gap-1.5 h-9 px-3"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Leave trip</span>
                </Button>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
              <div className="flex items-center gap-2 min-w-0 text-destructive">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-xs font-medium">{error}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void load()}
                disabled={loading}
                className="h-8 rounded-xl text-xs font-bold gap-1.5 shrink-0"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                Retry
              </Button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : members.length === 0 && error ? null : (
            <div className="space-y-2">
              {members.map((member) => {
                const isRowOwner = member.role === "owner";
                const isBusy = busyId === member.userId;
                return (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-border/60 bg-background/60"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-9 w-9">
                        {/* Email is owner-only (F6); the label and photo are
                            member-visible (F14). */}
                        {avatarSrc(member.avatarUrl) && (
                          <AvatarImage
                            src={avatarSrc(member.avatarUrl)}
                            alt={member.label || "Member"}
                          />
                        )}
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                          {initialsFor(member)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-foreground truncate max-w-[220px]">
                            {member.label ||
                              member.email ||
                              `Traveler ${member.userId.slice(-4)}`}
                          </span>
                          {member.isYou && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              you
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {member.label && member.email ? `${member.email} · ` : ""}
                          {member.joinedAt
                            ? `Joined ${new Date(member.joinedAt).toLocaleDateString()}`
                            : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Redundant with the owner's role dropdown — hiding it
                          on editable rows frees ~80px of name width on phones. */}
                      {(isRowOwner || !isOwner) && (
                        <Badge
                          className={cn(
                            "px-2 py-0.5 text-[10px] font-bold gap-1",
                            ROLE_BADGE_STYLE[member.role]
                          )}
                        >
                          {isRowOwner && <Crown className="w-3 h-3" />}
                          <span>{roleLabel(member.role)}</span>
                        </Badge>
                      )}

                      {isOwner && !isRowOwner && (
                        <>
                          <Select
                            value={EDITABLE_ROLES.includes(member.role) ? member.role : "viewer"}
                            onValueChange={(value) =>
                              handleRoleChange(
                                member,
                                value as Exclude<TripRole, "owner">
                              )
                            }
                          >
                            <SelectTrigger className="h-8 w-[110px] rounded-xl text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {EDITABLE_ROLES.map((role) => (
                                <SelectItem key={role} value={role} className="text-xs">
                                  {roleLabel(role)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            title="Transfer ownership to this member"
                            disabled={isBusy}
                            onClick={() => setTransferTarget(member)}
                            className="h-8 w-8 text-muted-foreground hover:text-amber-600 rounded-xl"
                          >
                            <Crown className="w-3.5 h-3.5" />
                          </Button>

                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            title="Remove from trip (expenses are kept)"
                            disabled={isBusy}
                            onClick={() => setRemoveTarget(member)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-xl"
                          >
                            {isBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <UserMinus className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Owner's invite list — hints only, raw tokens never come back */}
      {isOwner && (
        <Card className="rounded-3xl border-border/70 bg-card shadow-xs overflow-hidden">
          <CardContent className="p-5 sm:p-6 space-y-3">
            <h3 className="font-extrabold text-foreground text-sm uppercase tracking-wider">
              Sent invitations
            </h3>
            {invites.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No invitations yet. Create a link above and share it with your
                travel buddies.
              </p>
            ) : (
              <div className="space-y-2">
                {invites.map((invite) => {
                  const isRevoked = Boolean(invite.revokedAt);
                  const isExpired = new Date(invite.expiresAt) < new Date();
                  const isSpent = invite.usedCount >= invite.maxUses;
                  return (
                    <div
                      key={invite._id}
                      className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-border/60 bg-background/60"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                            {invite.tokenHint}…
                          </code>
                          <Badge
                            className={cn(
                              "px-2 py-0.5 text-[10px] font-bold",
                              ROLE_BADGE_STYLE[invite.role]
                            )}
                          >
                            {roleLabel(invite.role)}
                          </Badge>
                          {invite.kind === "email" && (
                            <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">
                              {invite.email}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {invite.usedCount}/{invite.maxUses} used · expires{" "}
                          {new Date(invite.expiresAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="shrink-0">
                        {isRevoked ? (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            revoked
                          </Badge>
                        ) : isExpired ? (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            expired
                          </Badge>
                        ) : isSpent ? (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            fully used
                          </Badge>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busyId === invite._id}
                            onClick={() => setRevokeTarget(invite)}
                            className="rounded-xl text-[11px] font-bold gap-1 h-8 px-2.5 hover:text-destructive"
                          >
                            <Ban className="w-3 h-3" />
                            <span>Revoke</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invite dialog */}
      <InviteDialog
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          void load();
        }}
        tripId={tripId}
      />

      {/* Leave confirmation (non-owner) */}
      <AlertDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <AlertDialogContent className="rounded-3xl max-w-md w-[92vw] sm:w-full p-5 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">Leave this trip?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              You keep nothing behind: your past expenses and participant entry
              stay with the trip, but you lose access until you are invited
              again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl text-xs font-semibold h-10">
              Stay
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeave}
              className="rounded-xl text-xs font-bold h-10 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busyId === "me" ? "Leaving…" : "Leave trip"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer confirmation */}
      <AlertDialog
        open={Boolean(transferTarget)}
        onOpenChange={(open) => {
          if (!open) setTransferTarget(null);
        }}
      >
        <AlertDialogContent className="rounded-3xl max-w-md w-[92vw] sm:w-full p-5 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">Transfer ownership?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              <strong className="text-foreground">
                {transferTarget?.label || transferTarget?.email || "This member"}
              </strong>{" "}
              becomes the owner and gains full control — invitations, member
              roles and trip deletion. You become an editor and keep editing.
              This cannot be undone except by another transfer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl text-xs font-semibold h-10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => transferTarget && handleTransfer(transferTarget)}
              className="rounded-xl text-xs font-bold h-10 bg-amber-600 text-white hover:bg-amber-600/90"
            >
              Transfer ownership
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove-member confirmation — removal is immediate and access is lost */}
      <AlertDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open && busyId !== removeTarget?.userId) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent className="rounded-3xl max-w-md w-[92vw] sm:w-full p-5 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">Remove this member?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              <strong className="text-foreground">
                {removeTarget?.label || removeTarget?.email || "This member"}
              </strong>{" "}
              loses access immediately. Their past expenses and participant entry
              stay with the trip, and they can only return through a new invite.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl text-xs font-semibold h-10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (removeTarget) void handleRemove(removeTarget);
              }}
              className="rounded-xl text-xs font-bold h-10 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeTarget && busyId === removeTarget.userId ? "Removing…" : "Remove member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke-invite confirmation — the link dies for everyone who has not joined */}
      <AlertDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => {
          if (!open && busyId !== revokeTarget?._id) setRevokeTarget(null);
        }}
      >
        <AlertDialogContent className="rounded-3xl max-w-md w-[92vw] sm:w-full p-5 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">Revoke this invitation?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              The link{" "}
              <code className="text-[11px] font-mono bg-muted px-1 py-0.5 rounded">
                {revokeTarget?.tokenHint}…
              </code>{" "}
              stops working immediately. Anyone who has not joined yet will need a
              new invitation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl text-xs font-semibold h-10">
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (revokeTarget) void handleRevoke(revokeTarget);
              }}
              className="rounded-xl text-xs font-bold h-10 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokeTarget && busyId === revokeTarget._id ? "Revoking…" : "Revoke invite"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/** Small helper used by the InviteDialog result view. */
export const CopyableLink: React.FC<{ link: string }> = ({ link }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={link} className="text-xs font-mono rounded-xl h-10" />
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-10 w-10 rounded-xl shrink-0"
        title="Copy invite link"
        onClick={() => {
          navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Copy className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
      </Button>
    </div>
  );
};
