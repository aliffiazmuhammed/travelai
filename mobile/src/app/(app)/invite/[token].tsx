import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { acceptInvite, fetchInvitePreview, type InviteSeat } from '@/api/invites';
import { useSession } from '@/auth/SessionProvider';
import { ROLE_LABEL } from '@/lib/personalTrip';
import { queryClient } from '@/query/client';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Avatar, Button, Card, InlineError, Screen, Skeleton } from '@/ui';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** What each seat can actually do — only the roles an invite can grant. */
const ROLE_COPY: Record<InviteSeat, { intro: string; bullets: string[] }> = {
  viewer: {
    intro:
      'As a viewer you can follow the plan, see what it costs and take a copy with you. Editing stays with the owner.',
    bullets: [
      'Follow the full itinerary',
      'See the shared expenses and who else is coming',
      'Download or print a copy for the road',
    ],
  },
  commenter: {
    intro:
      'As a commenter you can follow the plan, ask questions and join the trip chat. Editing stays with the owner.',
    bullets: ['Follow the full itinerary', 'Ask questions and get answers', 'Join the trip chat and vote in polls'],
  },
  editor: {
    intro:
      'As an editor you can shape the itinerary and expenses alongside the owner. Inviting people and sharing the trip stay with the owner.',
    bullets: [
      'Edit days, activities and the order of the plan',
      'Update expenses, travellers and the currency',
      'Comment, chat and vote in polls',
    ],
  },
};

export default function InviteAcceptScreen() {
  const { palette } = useTheme();
  const { user } = useSession();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const previewQuery = useQuery({
    queryKey: ['invite-preview', token],
    queryFn: () => fetchInvitePreview(token as string),
    enabled: Boolean(token),
    retry: false,
    staleTime: 60_000,
  });

  const preview = previewQuery.data;
  const emailMismatch =
    preview?.emailBoundTo && user?.email ? preview.emailBoundTo !== user.email : false;

  async function handleJoin() {
    if (!token || joining) return;
    setJoinError(null);
    setJoining(true);
    try {
      const result = await acceptInvite(token);
      await queryClient.invalidateQueries({ queryKey: ['my-trips'] });
      router.replace({ pathname: '/my-trip/[id]', params: { id: result.tripId } });
    } catch (error) {
      setJoinError(
        error instanceof ApiError ? error.message : 'Could not join this trip. Please try again.'
      );
    } finally {
      setJoining(false);
    }
  }

  function handleDecline() {
    router.replace('/');
  }

  const loading = Boolean(token) && previewQuery.isPending;
  const error = token
    ? previewQuery.isError
      ? previewQuery.error instanceof ApiError
        ? previewQuery.error.message
        : 'This invite link is invalid or has expired.'
      : null
    : 'This invite link is missing its token. Ask the owner for a fresh link.';

  return (
    <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <AppText variant="wordmark" tone="primary">
          waytowalk
        </AppText>
      </View>

      {loading ? (
        <Card style={styles.stateCard}>
          <Skeleton width={56} height={56} radius={radius.pill} />
          <Skeleton width={180} height={20} />
          <Skeleton width={140} height={14} />
          <Skeleton width="100%" height={120} />
        </Card>
      ) : error ? (
        <Card style={styles.stateCard}>
          <View style={[styles.stateIcon, { backgroundColor: palette.muted }]}>
            <Ionicons name="alert-circle-outline" size={26} color={palette.destructive} />
          </View>
          <AppText variant="title" style={styles.center}>
            Invitation unavailable
          </AppText>
          <AppText variant="caption" tone="muted" style={styles.center}>
            {error}
          </AppText>
          <Button label="Go to Explore" onPress={handleDecline} style={styles.wide} />
        </Card>
      ) : preview ? (
        <Card style={styles.inviteCard}>
          <View style={styles.head}>
            <View style={[styles.stateIcon, { backgroundColor: palette.muted }]}>
              <Ionicons name="mail-outline" size={26} color={palette.primary} />
            </View>
            <AppText variant="caption" tone="primary" style={styles.eyebrow}>
              YOU’RE INVITED
            </AppText>
            <AppText variant="display" style={styles.center}>
              Join {preview.trip.title}
            </AppText>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={14} color={palette.primary} />
                <AppText variant="caption" tone="muted">
                  Valid until {formatDate(preview.expiresAt)}
                </AppText>
              </View>
              {preview.trip.destination ? (
                <View style={styles.metaItem}>
                  <Ionicons name="location-outline" size={14} color={palette.primary} />
                  <AppText variant="caption" tone="muted" numberOfLines={1}>
                    {preview.trip.destination}
                  </AppText>
                </View>
              ) : null}
            </View>
            {preview.kind === 'email' && preview.emailBoundTo ? (
              <AppText variant="caption" tone="muted" style={styles.center}>
                Reserved for <AppText variant="caption">{preview.emailBoundTo}</AppText>
              </AppText>
            ) : null}
            {preview.invitedBy ? (
              <View style={styles.invitedBy}>
                <Avatar name={preview.invitedBy} size={32} />
                <AppText variant="caption" tone="muted">
                  <AppText variant="caption">{preview.invitedBy}</AppText> invited you
                </AppText>
              </View>
            ) : null}
          </View>

          <View style={[styles.roleCard, { backgroundColor: palette.muted }]}>
            <AppText variant="caption" tone="muted">
              {ROLE_COPY[preview.role].intro}
            </AppText>
            <View style={styles.roleBullets}>
              {ROLE_COPY[preview.role].bullets.map((bullet) => (
                <View key={bullet} style={styles.roleBullet}>
                  <Ionicons name="checkmark-circle" size={16} color={palette.accent} />
                  <AppText variant="caption" style={styles.bulletText}>
                    {bullet}
                  </AppText>
                </View>
              ))}
            </View>
            <AppText variant="caption" tone="muted">
              Joining as {ROLE_LABEL[preview.role].toLowerCase()}.
            </AppText>
          </View>

          {emailMismatch ? (
            <View style={[styles.warning, { borderColor: palette.accent }]}>
              <Ionicons name="alert-circle-outline" size={16} color={palette.accent} />
              <AppText variant="caption" tone="muted" style={styles.bulletText}>
                This invitation was sent to {preview.emailBoundTo}, but you are signed in as{' '}
                {user?.email}. Sign in with the invited email to accept it.
              </AppText>
            </View>
          ) : (
            <>
              <InlineError message={joinError} />
              <Button
                label={joining ? 'Joining…' : 'Accept invitation'}
                loading={joining}
                onPress={handleJoin}
                style={styles.wide}
              />
            </>
          )}

          <Button label="No thanks" variant="ghost" onPress={handleDecline} style={styles.wide} />

          <View style={[styles.footer, { borderTopColor: palette.border }]}>
            <Ionicons name="lock-closed-outline" size={12} color={palette.mutedForeground} />
            <AppText variant="caption" tone="muted">
              This invitation link is personal to you.
            </AppText>
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.sm, paddingBottom: space.xxl, gap: space.lg, justifyContent: 'center' },
  topRow: { alignItems: 'center' },
  wordmark: { letterSpacing: -0.4 },
  stateCard: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
  inviteCard: { gap: space.lg },
  head: { alignItems: 'center', gap: space.xs },
  stateIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  eyebrow: { letterSpacing: 1.6 },
  center: { textAlign: 'center' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.md, marginTop: space.xs },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  invitedBy: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  roleCard: { borderRadius: radius.lg, padding: space.md, gap: space.sm },
  roleBullets: { gap: space.xs },
  roleBullet: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  bulletText: { flex: 1, lineHeight: 18 },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
  },
  wide: { width: '100%' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderTopWidth: 1,
    paddingTop: space.md,
  },
});
