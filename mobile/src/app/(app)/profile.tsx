import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type ScrollViewInstance,
} from 'react-native';

import { fetchMyTrips } from '@/api/trips';
import { useSession } from '@/auth/SessionProvider';
import { matchesTripTab } from '@/lib/personalTrip';
import { goToCreate, goToTab } from '@/navigation/tabs';
import { fontFamily, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import {
  AppText,
  Avatar,
  Button,
  Card,
  NAV_BOTTOM_SPACE,
  NavShell,
  Screen,
  Skeleton,
} from '@/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

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

function MenuRow({
  icon,
  label,
  caption,
  onPress,
  divided = false,
}: {
  icon: IconName;
  label: string;
  caption: string;
  onPress: () => void;
  divided?: boolean;
}) {
  const { palette } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        divided && { borderTopWidth: 1, borderTopColor: palette.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.menuIcon, { backgroundColor: palette.muted }]}>
        <Ionicons name={icon} size={17} color={palette.primary} />
      </View>
      <View style={styles.menuText}>
        <AppText variant="bodyStrong">{label}</AppText>
        <AppText variant="caption" tone="muted">
          {caption}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={17} color={palette.mutedForeground} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { palette } = useTheme();
  const { user, signOut } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);

  const tripsQuery = useQuery({
    queryKey: ['my-trips'],
    queryFn: fetchMyTrips,
  });

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
            <AppText variant="title" tone="primary" style={styles.wordmark}>
              waytowalk
            </AppText>
            <View style={[styles.signedIn, { backgroundColor: palette.muted }]}>
              <View style={[styles.signedDot, { backgroundColor: palette.primary }]} />
              <AppText variant="caption" tone="muted">
                Signed in
              </AppText>
            </View>
          </View>

          <View style={styles.hero}>
            <AppText variant="caption" tone="muted" style={styles.eyebrow}>
              YOU
            </AppText>
            <AppText variant="display">Your corner of the road.</AppText>
            <AppText tone="muted">
              Who you are, the trips you’re part of, and the next place you’re headed.
            </AppText>
          </View>

          <Card style={styles.identity}>
            <View style={styles.identityRow}>
              <Avatar name={name} size={64} />
              <View style={styles.identityText}>
                <AppText variant="title" numberOfLines={1}>
                  {name}
                </AppText>
                <AppText variant="caption" tone="muted" numberOfLines={1}>
                  {handleLine}
                </AppText>
                {joined ? (
                  <AppText variant="caption" tone="muted">
                    {joined}
                  </AppText>
                ) : null}
              </View>
            </View>
            {user?.bio ? (
              <AppText variant="caption" tone="muted" style={styles.bio}>
                {user.bio}
              </AppText>
            ) : (
              <AppText variant="caption" tone="muted" style={styles.bio}>
                Add a short bio on the web so people know who they’re travelling with.
              </AppText>
            )}
          </Card>

          <View style={styles.stats}>
            <Stat value={statValue(total)} label="Trips" />
            <Stat value={statValue(ahead)} label="Ahead" />
            <Stat value={statValue(shared)} label="Shared" />
          </View>

          <Card padded={false} style={styles.menu}>
            <MenuRow
              icon="map-outline"
              label="Your trips"
              caption={
                statsReady
                  ? total === 0
                    ? 'Nothing planned yet — start with a place.'
                    : `${total} ${total === 1 ? 'trip' : 'trips'} in your library.`
                  : 'Everything you’re planning or part of.'
              }
              onPress={() => goToTab('trips')}
            />
            <MenuRow
              icon="compass-outline"
              label="Find a trip to join"
              caption="See what other travellers are sharing right now."
              onPress={() => goToTab('explore')}
              divided
            />
            <MenuRow
              icon="add-circle-outline"
              label="Plan a trip"
              caption="Start something new for the road ahead."
              onPress={goToCreate}
              divided
            />
          </Card>

          <Card style={styles.account}>
            <View style={styles.accountHead}>
              <Ionicons name="mail-outline" size={15} color={palette.mutedForeground} />
              <AppText variant="label">Account</AppText>
            </View>
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
          </Card>

          <Button
            label="Sign out"
            variant="ghost"
            loading={signingOut}
            onPress={handleSignOut}
            style={styles.signOut}
          />
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
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xxl },
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
  hero: { gap: space.sm },
  eyebrow: { fontFamily: fontFamily.semibold, letterSpacing: 1.2 },
  identity: { gap: space.md },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  identityText: { flex: 1, gap: 2 },
  bio: { lineHeight: 18 },
  stats: { flexDirection: 'row', gap: space.md },
  stat: { flex: 1, gap: 2 },
  statLabel: { letterSpacing: 0.6 },
  menu: { overflow: 'hidden' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: { flex: 1, gap: 2 },
  account: { gap: space.sm },
  accountHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  accountRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg },
  accountValue: { flexShrink: 1, textAlign: 'right' },
  signOut: { alignSelf: 'flex-start' },
});
