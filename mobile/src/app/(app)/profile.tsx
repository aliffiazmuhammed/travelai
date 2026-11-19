import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type ScrollViewInstance,
} from 'react-native';

import { fetchMyTrips } from '@/api/trips';
import { fetchEnquirySummary } from '@/api/enquiries';
import { useSession } from '@/auth/SessionProvider';
import { matchesTripTab } from '@/lib/personalTrip';
import { goToCreate, goToTab } from '@/navigation/tabs';
import { radius, space } from '@/theme/tokens';
import { useThemePreference, type ThemePreference } from '@/theme/ThemeProvider';
import { useTheme } from '@/theme/useTheme';
import {
  AppText,
  Avatar,
  Card,
  ListGroup,
  ListRow,
  NAV_BOTTOM_SPACE,
  NavShell,
  Screen,
  SectionHeader,
  Segmented,
  Skeleton,
} from '@/ui';

const APPEARANCE: readonly { key: ThemePreference; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function joinedLabel(iso?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `Here since ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <Card style={styles.stat}>
      {typeof value === 'string' ? (
        <AppText variant="title">{value}</AppText>
      ) : (
        value
      )}
      <AppText variant="caption" tone="muted" style={styles.statLabel}>
        {label}
      </AppText>
    </Card>
  );
}

export default function ProfileScreen() {
  const { palette } = useTheme();
  const { preference, setPreference } = useThemePreference();
  const { user, signOut } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);

  const tripsQuery = useQuery({
    queryKey: ['my-trips'],
    queryFn: fetchMyTrips,
  });
  const summaryQuery = useQuery({
    queryKey: ['enquiry-summary'],
    queryFn: fetchEnquirySummary,
  });
  const summary = summaryQuery.data;

  const trips = tripsQuery.data ?? [];
  const total = trips.length;
  const ahead = trips.filter((trip) => matchesTripTab(trip.status, 'upcoming')).length;
  const shared = trips.filter((trip) => trip.role && trip.role !== 'owner').length;
  const statsReady = Boolean(tripsQuery.data);

  const name = user?.name || user?.label || 'Traveller';
  const handleLine = user?.handle ? `@${user.handle}` : user?.email ?? 'Your account';
  const joined = joinedLabel(user?.createdAt);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  const statValue = (count: number) =>
    statsReady ? String(count) : <Skeleton width={28} height={26} />;

  return (
    <View style={styles.root}>
      <Screen
        scroll
        scrollRef={scrollRef}
        refreshing={tripsQuery.isRefetching && !tripsQuery.isPending}
        onRefresh={() => tripsQuery.refetch()}
        contentContainerStyle={{ paddingTop: space.sm, paddingBottom: NAV_BOTTOM_SPACE + space.xl }}
      >
        <View style={styles.page}>
          <View style={styles.topRow}>
            <AppText variant="wordmark" tone="primary">
              waytowalk
            </AppText>
            <View style={[styles.signedIn, { backgroundColor: palette.muted }]}>
              <View style={[styles.signedDot, { backgroundColor: palette.primary }]} />
              <AppText variant="caption" tone="muted">
                Signed in
              </AppText>
            </View>
          </View>

          <View style={styles.intro}>
            <AppText variant="title">Your corner of the road.</AppText>
            <AppText variant="caption" tone="muted">
              Who you are, and where you’re headed next.
            </AppText>
          </View>

          <Card style={styles.identity}>
            <Avatar name={name} size={88} uri={user?.avatarUrl} />
            <View style={styles.identityText}>
              <AppText variant="title" numberOfLines={1} style={styles.name}>
                {name}
              </AppText>
              <View style={styles.identityMeta}>
                <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.handle}>
                  {handleLine}
                </AppText>
                <View style={[styles.roleChip, { backgroundColor: palette.primary }]}>
                  <AppText variant="caption" style={{ color: palette.primaryForeground }}>
                    Traveller
                  </AppText>
                </View>
              </View>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Edit profile"
                onPress={() => router.push('/account')}
                hitSlop={8}
              >
                <AppText variant="label" tone="accent">
                  Edit profile
                </AppText>
              </Pressable>
            </View>
            {joined ? (
              <AppText variant="caption" tone="muted">
                {joined}
              </AppText>
            ) : null}
            <AppText variant="caption" tone="muted" style={styles.bio}>
              {user?.bio ||
                'A line about how you travel helps people know who they’re joining.'}
            </AppText>
          </Card>

          <View style={styles.stats}>
            <Stat value={statValue(total)} label="Trips" />
            <Stat value={statValue(ahead)} label="Ahead" />
            <Stat value={statValue(shared)} label="Shared" />
          </View>

          <View style={styles.group}>
            <SectionHeader title="Your travel" />
            <ListGroup>
              <ListRow
                icon="map-outline"
                title="Your trips"
                subtitle={
                  statsReady
                    ? total === 0
                      ? 'Nothing planned yet — start with a place.'
                      : `${total} ${total === 1 ? 'trip' : 'trips'} in your library.`
                    : 'Everything you’re planning or part of.'
                }
                onPress={() => goToTab('trips')}
              />
              <ListRow
                icon="chatbubbles-outline"
                title="Enquiries"
                subtitle={
                  summary && summary.unread > 0
                    ? `${summary.unread} new ${
                        summary.unread === 1 ? 'reply' : 'replies'
                      } waiting for you.`
                    : 'Conversations with agencies, in one place.'
                }
                onPress={() => router.push('/enquiries')}
              />
              <ListRow
                icon="document-text-outline"
                title="Proposals"
                subtitle={
                  summary && summary.liveProposals > 0
                    ? `${summary.liveProposals} ${
                        summary.liveProposals === 1 ? 'proposal is' : 'proposals are'
                      } waiting for your answer.`
                    : 'Quotes agencies send you, side by side.'
                }
                onPress={() => router.push('/proposals')}
              />
              <ListRow
                icon="compass-outline"
                title="Find a trip to join"
                subtitle="See what other travellers are sharing right now."
                onPress={() => goToTab('explore')}
              />
              <ListRow
                icon="add-circle-outline"
                title="Plan a trip"
                subtitle="Start something new for the road ahead."
                onPress={goToCreate}
              />
            </ListGroup>
          </View>

          <View style={styles.group}>
            <SectionHeader title="Appearance" />
            <Card style={styles.appearance}>
              <Segmented
                accessibilityLabel="Appearance"
                items={APPEARANCE}
                value={preference}
                onChange={setPreference}
              />
              <AppText variant="caption" tone="muted">
                {preference === 'system'
                  ? 'Following your phone’s light or dark setting.'
                  : `Always using the ${preference} theme.`}
              </AppText>
            </Card>
          </View>

          <View style={styles.group}>
            <SectionHeader title="Community" />
            <ListGroup>
              <ListRow
                icon="leaf-outline"
                title="Community guidelines"
                subtitle="What belongs in the gallery, and how reporting works."
                onPress={() => router.push('/guidelines')}
              />
            </ListGroup>
          </View>

          <View style={styles.group}>
            <SectionHeader title="Account" />
            <Card style={styles.account}>
              <View style={styles.accountRow}>
                <AppText variant="caption" tone="muted">
                  Email
                </AppText>
                <AppText variant="caption" numberOfLines={1} style={styles.accountValue}>
                  {user?.email}
                </AppText>
              </View>
              <View style={styles.accountRow}>
                <AppText variant="caption" tone="muted">
                  Username
                </AppText>
                <AppText variant="caption" numberOfLines={1} style={styles.accountValue}>
                  {user?.handle ? `@${user.handle}` : 'Not chosen yet'}
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ busy: signingOut }}
                disabled={signingOut}
                onPress={handleSignOut}
                style={({ pressed }) => [
                  styles.signOut,
                  { borderTopColor: palette.border, opacity: pressed || signingOut ? 0.6 : 1 },
                ]}
              >
                <AppText variant="label" tone="accent">
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </AppText>
              </Pressable>
            </Card>
          </View>
        </View>
      </Screen>

      <NavShell
        active="profile"
        onSelect={(next) => {
          if (next === 'profile') {
            scrollRef.current?.scrollTo({ y: 0, animated: true });
            return;
          }
          goToTab(next);
        }}
        onCreatePress={goToCreate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { letterSpacing: -0.4 },
  signedIn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  signedDot: { width: 6, height: 6, borderRadius: radius.pill },
  intro: { gap: 2 },
  identity: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  identityText: { alignItems: 'center', gap: 4 },
  name: { textAlign: 'center' },
  identityMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  handle: { flexShrink: 1 },
  roleChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  bio: { lineHeight: 18, textAlign: 'center', paddingHorizontal: space.lg },
  stats: { flexDirection: 'row', gap: space.md },
  stat: { flex: 1, gap: 2 },
  statLabel: { letterSpacing: 0.6 },
  group: { gap: space.md },
  account: { gap: space.sm },
  appearance: { gap: space.sm },
  accountRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg },
  accountValue: { flexShrink: 1, textAlign: 'right' },
  signOut: { borderTopWidth: 1, paddingTop: space.md, marginTop: space.xs },
});
