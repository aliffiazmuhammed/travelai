import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import {
  approveJoinRequest,
  blockJoinRequester,
  changeMemberRole,
  createTripInvite,
  declineJoinRequest,
  fetchJoinQueue,
  fetchTripInvites,
  fetchTripMembers,
  leaveTrip,
  removeMember,
  revokeTripInvite,
  type InvitableRole,
  type QueuedJoinRequest,
  type TripInvite,
  type TripMember,
} from '@/api/people';
import { fetchMyTrip } from '@/api/trips';
import { InviteSheet } from '@/components/people/InviteSheet';
import { MemberSheet } from '@/components/people/MemberSheet';
import { ROLE_LABEL, rolePhrase, tripTitle } from '@/lib/personalTrip';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Avatar, Button, Card, InlineError, Screen, Skeleton } from '@/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

const MEMBER_PAGE = 6;
const REQUEST_PAGE = 4;
const INVITE_PAGE = 4;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ROLE_ORDER: Record<string, number> = { owner: 0, editor: 1, commenter: 2, viewer: 3 };

function formatDay(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

function CountPill({ value }: { value: number }) {
  const { palette } = useTheme();

  return (
    <View style={[styles.countPill, { backgroundColor: palette.muted }]}>
      <AppText variant="caption" tone="muted">
        {value}
      </AppText>
    </View>
  );
}

function CardHead({ icon, title, count }: { icon: IconName; title: string; count?: number }) {
  const { palette } = useTheme();

  return (
    <View style={styles.cardHead}>
      <Ionicons name={icon} size={16} color={palette.primary} />
      <AppText variant="heading" style={styles.cardTitle}>
        {title}
      </AppText>
      {typeof count === 'number' ? <CountPill value={count} /> : null}
    </View>
  );
}

function Pager({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (next: number) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <View style={styles.pager}>
      <Button
        label="Previous"
        variant="ghost"
        size="sm"
        disabled={page <= 1}
        onPress={() => onChange(page - 1)}
      />
      <AppText variant="caption" tone="muted">
        Page {page} of {pageCount}
      </AppText>
      <Button
        label="Next"
        variant="secondary"
        size="sm"
        disabled={page >= pageCount}
        onPress={() => onChange(page + 1)}
      />
    </View>
  );
}

function PeopleSkeleton() {
  return (
    <View style={styles.page}>
      <View style={styles.titleBlock}>
        <Skeleton width="30%" height={12} />
        <Skeleton width="80%" height={34} />
        <Skeleton width="65%" height={14} />
      </View>
      <Card style={styles.card}>
        <Skeleton width="45%" height={20} />
        <Skeleton height={56} radius={radius.lg} />
        <Skeleton height={56} radius={radius.lg} />
      </Card>
      <Card style={styles.card}>
        <Skeleton width="40%" height={20} />
        <Skeleton height={48} radius={radius.lg} />
      </Card>
    </View>
  );
}

function LeaveSheet({
  busy,
  error,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.sheetRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.card,
              borderColor: palette.border,
              paddingBottom: insets.bottom + space.xl,
            },
          ]}
        >
          <View style={styles.sheetHandle} />
          <AppText variant="heading">Leave this trip?</AppText>
          <AppText tone="muted">
            It comes off your list right away. Anything you wrote stays with the trip for everyone
            else.
          </AppText>
          {error ? <InlineError message={error} /> : null}
          <View style={styles.sheetActions}>
            <Button label="Stay" variant="ghost" size="sm" disabled={busy} onPress={onClose} />
            <Button
              label={busy ? 'Leaving…' : 'Leave trip'}
              variant="danger"
              size="sm"
              loading={busy}
              onPress={onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function PeopleScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams();
  const rawId = params.id;
  const tripId = Array.isArray(rawId) ? rawId[0] : rawId;
  const id = tripId ?? '';

  const [memberPage, setMemberPage] = useState(1);
  const [requestPage, setRequestPage] = useState(1);
  const [invitePage, setInvitePage] = useState(1);

  const [selectedMember, setSelectedMember] = useState<TripMember | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueNote, setQueueNote] = useState<string | null>(null);
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteActionError, setInviteActionError] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<{ invite: TripInvite; link: string } | null>(
    null
  );
  const [copied, setCopied] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const tripQuery = useQuery({
    queryKey: ['my-trip', tripId],
    queryFn: () => (tripId ? fetchMyTrip(tripId) : Promise.reject(new Error('No trip requested.'))),
    enabled: Boolean(tripId),
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1,
  });

  const role = tripQuery.data?.role;
  const isOwner = role === 'owner';

  const membersQuery = useQuery({
    queryKey: ['members', tripId],
    queryFn: () => fetchTripMembers(id),
    enabled: Boolean(tripId),
    retry: 1,
  });

  const joinQuery = useQuery({
    queryKey: ['join-requests', tripId],
    queryFn: () => fetchJoinQueue(id),
    enabled: Boolean(tripId) && isOwner,
  });

  const invitesQuery = useQuery({
    queryKey: ['invites', tripId],
    queryFn: () => fetchTripInvites(id),
    enabled: Boolean(tripId) && isOwner,
  });

  const members = useMemo(() => {
    const rows = membersQuery.data ?? [];
    return [...rows].sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
  }, [membersQuery.data]);

  const requests = joinQuery.data ?? [];

  const activeInvites = useMemo(() => {
    // The query's fetch time stands in for "now": reading the clock during
    // render is impure, and every refetch re-evaluates which links are open.
    const asOf = invitesQuery.dataUpdatedAt;
    return (invitesQuery.data ?? []).filter(
      (invite) => !invite.revokedAt && new Date(invite.expiresAt).getTime() > asOf
    );
  }, [invitesQuery.data, invitesQuery.dataUpdatedAt]);

  const refreshMembership = () => {
    void queryClient.invalidateQueries({ queryKey: ['members', tripId] });
    void queryClient.invalidateQueries({ queryKey: ['my-trip', tripId] });
    void queryClient.invalidateQueries({ queryKey: ['my-trips'] });
  };

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: InvitableRole }) =>
      changeMemberRole(id, userId, role),
    onSuccess: () => {
      setSelectedMember(null);
      setMemberError(null);
      refreshMembership();
    },
    onError: (error) => setMemberError(messageOf(error)),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeMember(id, userId),
    onSuccess: () => {
      setSelectedMember(null);
      setMemberError(null);
      refreshMembership();
    },
    onError: (error) => setMemberError(messageOf(error)),
  });

  const leaveMutation = useMutation({
    mutationFn: () => leaveTrip(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['my-trip', id] });
      queryClient.removeQueries({ queryKey: ['members', id] });
      void queryClient.invalidateQueries({ queryKey: ['my-trips'] });
      router.replace('/trips');
    },
    onError: (error) => setLeaveError(messageOf(error)),
  });

  const decisionMutation = useMutation({
    mutationFn: ({ requestId, action }: { requestId: string; action: 'approve' | 'decline' | 'block' }) => {
      if (action === 'approve') return approveJoinRequest(id, requestId);
      if (action === 'decline') return declineJoinRequest(id, requestId);
      return blockJoinRequester(id, requestId);
    },
    onMutate: () => {
      setQueueError(null);
      setQueueNote(null);
    },
    onSuccess: (_request, variables) => {
      setQueueNote(
        variables.action === 'approve'
          ? 'Approved — they’re in as a commenter.'
          : variables.action === 'decline'
            ? 'Declined. They won’t be told.'
            : 'Blocked. Their pending requests across your trips are cleared.'
      );
      refreshMembership();
      void queryClient.invalidateQueries({ queryKey: ['join-requests', tripId] });
    },
    onError: (error) => setQueueError(messageOf(error)),
  });

  const createInviteMutation = useMutation({
    mutationFn: (inviteRole: InvitableRole) => createTripInvite(id, { role: inviteRole }),
    onSuccess: (data) => {
      setCreatedInvite(data);
      setInviteSheetOpen(false);
      setInviteError(null);
      setCopied(false);
      setInviteActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['invites', tripId] });
    },
    onError: (error) => setInviteError(messageOf(error)),
  });

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => revokeTripInvite(id, inviteId),
    onSuccess: (invite) => {
      setInviteActionError(null);
      if (createdInvite?.invite._id === invite._id) {
        setCreatedInvite(null);
        setCopied(false);
      }
      void queryClient.invalidateQueries({ queryKey: ['invites', tripId] });
    },
    onError: (error) => setInviteActionError(messageOf(error)),
  });

  const copyLink = async () => {
    if (!createdInvite) return;
    await Clipboard.setStringAsync(createdInvite.link);
    setCopied(true);
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate('/trips');
  };

  const topRow = (
    <View style={styles.topRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={goBack}
        style={({ pressed }) => [
          styles.back,
          { backgroundColor: palette.muted, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Ionicons name="chevron-back" size={18} color={palette.foreground} />
      </Pressable>
      <AppText variant="wordmark" tone="primary">
        waytowalk
      </AppText>
    </View>
  );

  if (tripQuery.isPending || (membersQuery.isPending && !membersQuery.isError)) {
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow}
        <PeopleSkeleton />
      </Screen>
    );
  }

  if (tripQuery.isError || !tripQuery.data) {
    const status = tripQuery.error instanceof ApiError ? tripQuery.error.status : 0;
    const forbidden = status === 403;
    const notFound = status === 404;

    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow}
        <View style={styles.page}>
          <Card style={styles.errorCard}>
            <View style={[styles.errorIcon, { backgroundColor: `${palette.destructive}14` }]}>
              <Ionicons
                name={forbidden ? 'lock-closed-outline' : notFound ? 'map-outline' : 'alert-circle-outline'}
                size={26}
                color={palette.destructive}
              />
            </View>
            <AppText variant="title">
              {forbidden
                ? 'This trip is for its members'
                : notFound
                  ? 'This trip has moved on'
                  : 'Something went wrong'}
            </AppText>
            <AppText tone="muted">
              {forbidden
                ? 'Your account doesn’t have access. If someone shared this trip with you, ask them for a fresh invite.'
                : notFound
                  ? 'It may have been deleted, or the link is out of date.'
                  : messageOf(tripQuery.error)}
            </AppText>
            <View style={styles.errorActions}>
              <Button label="Back to your trips" onPress={() => router.navigate('/trips')} />
            </View>
          </Card>
        </View>
      </Screen>
    );
  }

  const title = tripTitle(tripQuery.data);
  const me = members.find((member) => member.isYou);
  const myRole = me?.role ?? role ?? 'viewer';

  const memberPageCount = Math.max(1, Math.ceil(members.length / MEMBER_PAGE));
  const currentMemberPage = Math.min(memberPage, memberPageCount);
  const visibleMembers = members.slice(
    (currentMemberPage - 1) * MEMBER_PAGE,
    currentMemberPage * MEMBER_PAGE
  );

  const requestPageCount = Math.max(1, Math.ceil(requests.length / REQUEST_PAGE));
  const currentRequestPage = Math.min(requestPage, requestPageCount);
  const visibleRequests = requests.slice(
    (currentRequestPage - 1) * REQUEST_PAGE,
    currentRequestPage * REQUEST_PAGE
  );

  const invitePageCount = Math.max(1, Math.ceil(activeInvites.length / INVITE_PAGE));
  const currentInvitePage = Math.min(invitePage, invitePageCount);
  const visibleInvites = activeInvites.slice(
    (currentInvitePage - 1) * INVITE_PAGE,
    currentInvitePage * INVITE_PAGE
  );

  const renderMember = (member: TripMember, index: number) => {
    const actionable = isOwner && !member.isYou;

    return (
      <Pressable
        key={member.userId}
        accessibilityRole={actionable ? 'button' : undefined}
        accessibilityLabel={actionable ? `Manage ${member.label}` : undefined}
        disabled={!actionable}
        onPress={() => {
          setMemberError(null);
          setSelectedMember(member);
        }}
        style={({ pressed }) => [
          styles.memberRow,
          index > 0 && { borderTopWidth: 1, borderTopColor: palette.border },
          pressed && actionable ? { opacity: 0.72 } : null,
        ]}
      >
        <Avatar name={member.label} size={42} uri={member.avatarUrl} />
        <View style={styles.memberText}>
          <View style={styles.nameRow}>
            <AppText variant="bodyStrong" numberOfLines={1} style={styles.memberName}>
              {member.label}
            </AppText>
            {member.isYou ? (
              <View style={[styles.youPill, { backgroundColor: palette.muted }]}>
                <AppText variant="caption" tone="muted">
                  You
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {member.email ?? (member.isYou ? 'This is you' : `Joined ${formatDay(member.joinedAt)}`)}
          </AppText>
        </View>
        <AppText variant="caption" tone={member.role === 'owner' ? 'primary' : 'muted'} style={styles.roleLabel}>
          {ROLE_LABEL[member.role]}
        </AppText>
        {actionable ? (
          <Ionicons name="chevron-forward" size={15} color={palette.mutedForeground} />
        ) : null}
      </Pressable>
    );
  };

  const renderRequest = (request: QueuedJoinRequest) => {
    const requester = request.requester;
    const label = requester?.label ?? 'A traveller';
    const busy = decisionMutation.isPending && decisionMutation.variables?.requestId === request._id;

    return (
      <View key={request._id} style={[styles.requestRow, { borderColor: palette.border }]}>
        <View style={styles.requestHead}>
          <Avatar name={label} size={38} uri={requester?.avatarUrl} />
          <View style={styles.memberText}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {label}
            </AppText>
            <AppText variant="caption" tone="muted">
              {requester?.handle ? `@${requester.handle} · ` : ''}Asked {formatDay(request.createdAt)}
            </AppText>
          </View>
        </View>
        {request.message ? (
          <View style={[styles.quote, { backgroundColor: palette.muted }]}>
            <AppText variant="caption" tone="muted">
              “{request.message}”
            </AppText>
          </View>
        ) : null}
        <View style={styles.requestActions}>
          <Button
            label="Approve"
            size="sm"
            loading={busy}
            disabled={decisionMutation.isPending && !busy}
            onPress={() => decisionMutation.mutate({ requestId: request._id, action: 'approve' })}
          />
          <Button
            label="Decline"
            variant="ghost"
            size="sm"
            disabled={decisionMutation.isPending}
            onPress={() => decisionMutation.mutate({ requestId: request._id, action: 'decline' })}
          />
          <Button
            label="Block"
            variant="ghost"
            size="sm"
            disabled={decisionMutation.isPending}
            onPress={() => decisionMutation.mutate({ requestId: request._id, action: 'block' })}
          />
        </View>
      </View>
    );
  };

  const renderInvite = (invite: TripInvite) => {
    const busy = revokeMutation.isPending && revokeMutation.variables === invite._id;

    return (
      <View
        key={invite._id}
        style={[styles.inviteRow, { borderTopColor: palette.border }]}
      >
        <View style={styles.memberText}>
          <AppText variant="bodyStrong">
            {ROLE_LABEL[invite.role]} link
          </AppText>
          <AppText variant="caption" tone="muted">
            {invite.usedCount} of {invite.maxUses} used · Expires {formatDay(invite.expiresAt)}
          </AppText>
          <AppText variant="caption" tone="muted" style={styles.tokenHint}>
            …{invite.tokenHint}
          </AppText>
        </View>
        <Button
          label="Revoke"
          variant="ghost"
          size="sm"
          loading={busy}
          disabled={revokeMutation.isPending && !busy}
          onPress={() => revokeMutation.mutate(invite._id)}
        />
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow}

        <View style={styles.page}>
          <View style={styles.titleBlock}>
            <View style={styles.eyebrowRow}>
              <View style={[styles.eyebrowTick, { backgroundColor: palette.accent }]} />
              <AppText variant="caption" tone="muted" style={styles.eyebrow}>
                PEOPLE
              </AppText>
            </View>
            <AppText variant="display">Who’s coming along</AppText>
            <AppText tone="muted">
              {isOwner
                ? `The company for ${title} — invite the people you want, and decide how much they can shape.`
                : `Everyone who’s part of ${title}, and how they’re joining in.`}
            </AppText>
          </View>

          <Card style={styles.card}>
            <CardHead icon="people-outline" title="On this trip" count={members.length} />
            {isOwner ? (
              <AppText variant="caption" tone="muted">
                Tap anyone to change what they can do, or to remove them.
              </AppText>
            ) : null}

            {membersQuery.isError ? (
              <InlineError message={messageOf(membersQuery.error)} />
            ) : members.length === 0 ? (
              <AppText variant="caption" tone="muted">
                We couldn’t load the people on this trip just now.
              </AppText>
            ) : (
              <View>{visibleMembers.map(renderMember)}</View>
            )}

            <Pager
              page={currentMemberPage}
              pageCount={memberPageCount}
              onChange={setMemberPage}
            />
          </Card>

          {isOwner ? (
            <Card style={styles.card}>
              <CardHead icon="person-add-outline" title="Join requests" count={requests.length} />
              <AppText variant="caption" tone="muted">
                People who found this trip and asked to come along. Approving gives them a
                commenter’s seat; blocking keeps them from asking again.
              </AppText>

              {queueError ? <InlineError message={queueError} /> : null}
              {queueNote ? (
                <AppText variant="caption" tone="primary">
                  {queueNote}
                </AppText>
              ) : null}

              {joinQuery.isPending ? (
                <View style={styles.skeletonRows}>
                  <Skeleton height={64} radius={radius.lg} />
                  <Skeleton height={64} radius={radius.lg} />
                </View>
              ) : joinQuery.isError ? (
                <InlineError message={messageOf(joinQuery.error)} />
              ) : requests.length === 0 ? (
                <AppText variant="caption" tone="muted">
                  Nobody is waiting right now. When someone asks to join, they’ll show up here.
                </AppText>
              ) : (
                <View style={styles.rows}>{visibleRequests.map(renderRequest)}</View>
              )}

              <Pager
                page={currentRequestPage}
                pageCount={requestPageCount}
                onChange={setRequestPage}
              />
            </Card>
          ) : null}

          {isOwner ? (
            <Card style={styles.card}>
              <CardHead icon="link-outline" title="Invite links" count={activeInvites.length} />
              <AppText variant="caption" tone="muted">
                Share a link with the people you want along. You choose what it grants, and you can
                revoke it any time.
              </AppText>

              {createdInvite ? (
                <View style={[styles.linkBox, { backgroundColor: palette.muted }]}>
                  <AppText variant="caption" tone="muted" style={styles.linkEyebrow}>
                    READY TO SHARE
                  </AppText>
                  <AppText variant="caption" selectable numberOfLines={2} style={styles.linkText}>
                    {createdInvite.link}
                  </AppText>
                  <View style={styles.linkActions}>
                    <Button
                      label={copied ? 'Copied' : 'Copy link'}
                      variant={copied ? 'secondary' : 'primary'}
                      size="sm"
                      icon={
                        <Ionicons
                          name={copied ? 'checkmark' : 'copy-outline'}
                          size={15}
                          color={copied ? palette.secondaryForeground : palette.primaryForeground}
                        />
                      }
                      onPress={() => void copyLink()}
                    />
                    <Button
                      label="Done"
                      variant="ghost"
                      size="sm"
                      onPress={() => {
                        setCreatedInvite(null);
                        setCopied(false);
                      }}
                    />
                  </View>
                </View>
              ) : null}

              <Button
                label="Create an invite link"
                variant="secondary"
                size="sm"
                icon={<Ionicons name="add" size={16} color={palette.secondaryForeground} />}
                onPress={() => {
                  setInviteError(null);
                  setInviteSheetOpen(true);
                }}
              />

              {inviteActionError ? <InlineError message={inviteActionError} /> : null}

              {invitesQuery.isPending ? (
                <Skeleton height={64} radius={radius.lg} />
              ) : invitesQuery.isError ? (
                <InlineError message={messageOf(invitesQuery.error)} />
              ) : activeInvites.length === 0 ? (
                <AppText variant="caption" tone="muted">
                  No open links right now. Create one whenever you’re ready to bring someone in.
                </AppText>
              ) : (
                <View>{visibleInvites.map(renderInvite)}</View>
              )}

              <Pager
                page={currentInvitePage}
                pageCount={invitePageCount}
                onChange={setInvitePage}
              />
            </Card>
          ) : (
            <Card style={styles.card}>
              <CardHead icon="log-out-outline" title="Your place" />
              <AppText tone="muted">
                You’re here as {rolePhrase(myRole)}. Leaving takes this trip off your list;
                anything you’ve written stays with it.
              </AppText>
              <Button
                label="Leave this trip"
                variant="ghost"
                size="sm"
                onPress={() => {
                  setLeaveError(null);
                  setLeaveOpen(true);
                }}
              />
            </Card>
          )}
        </View>
      </Screen>

      {selectedMember ? (
        <MemberSheet
          member={selectedMember}
          busy={roleMutation.isPending || removeMutation.isPending}
          error={memberError}
          onClose={() => {
            setSelectedMember(null);
            setMemberError(null);
          }}
          onChangeRole={(nextRole) =>
            roleMutation.mutate({ userId: selectedMember.userId, role: nextRole })
          }
          onRemove={() => removeMutation.mutate(selectedMember.userId)}
        />
      ) : null}

      {inviteSheetOpen ? (
        <InviteSheet
          busy={createInviteMutation.isPending}
          error={inviteError}
          onClose={() => {
            setInviteSheetOpen(false);
            setInviteError(null);
          }}
          onCreate={(inviteRole) => createInviteMutation.mutate(inviteRole)}
        />
      ) : null}

      {leaveOpen ? (
        <LeaveSheet
          busy={leaveMutation.isPending}
          error={leaveError}
          onClose={() => {
            setLeaveOpen(false);
            setLeaveError(null);
          }}
          onConfirm={() => leaveMutation.mutate()}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingTop: space.sm, paddingBottom: space.xxxl, gap: space.lg },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: { letterSpacing: -0.4 },
  titleBlock: { gap: space.sm },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrowTick: { width: 12, height: 2, borderRadius: radius.pill },
  eyebrow: { letterSpacing: 1.2 },
  card: { gap: space.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardTitle: { flex: 1 },
  countPill: {
    minWidth: 26,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rows: { gap: space.md },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  memberText: { flex: 1, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberName: { flexShrink: 1 },
  youPill: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: radius.pill },
  roleLabel: { letterSpacing: 0.3 },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    marginTop: space.xs,
  },
  requestRow: { borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  requestHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  quote: { borderRadius: radius.md, padding: space.sm },
  requestActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingTop: space.md,
    borderTopWidth: 1,
  },
  tokenHint: { letterSpacing: 1 },
  linkBox: { borderRadius: radius.lg, padding: space.md, gap: space.sm },
  linkEyebrow: { letterSpacing: 1, fontSize: 11 },
  linkText: { lineHeight: 19 },
  linkActions: { flexDirection: 'row', gap: space.sm },
  skeletonRows: { gap: space.md },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    gap: space.md,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(127,140,134,0.4)',
    marginBottom: space.xs,
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xs,
  },
  errorCard: { alignItems: 'flex-start', gap: space.sm },
  errorIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  errorActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
});
