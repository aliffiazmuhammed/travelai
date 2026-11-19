import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { fetchTravelerProfile } from '@/api/discovery';
import { TripCard, TripCardSkeleton } from '@/components/TripCard';
import { tripCoverUrl } from '@/lib/tripCover';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Avatar, Button, Card, Screen, Skeleton } from '@/ui';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Month + year of the newest publication, without inventing a day. */
function monthYear(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export default function TravelerProfileScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ handle?: string | string[] }>();
  const handle = (Array.isArray(params.handle) ? params.handle[0] : params.handle)?.trim() ?? '';

  const travelerQuery = useQuery({
    queryKey: ['traveler-profile', handle],
    queryFn: () => fetchTravelerProfile(handle),
    enabled: Boolean(handle),
    retry: 1,
  });

  const traveler = travelerQuery.data;
  const trips = useMemo(() => traveler?.trips ?? [], [traveler?.trips]);
  const lastShared = monthYear(trips[0]?.publishedAt ?? null);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate('/');
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

  if (travelerQuery.isPending) {
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow}
        <View style={styles.page}>
          <Card style={styles.hero}>
            <View style={styles.identityRow}>
              <Skeleton width={72} height={72} radius={radius.pill} />
              <View style={styles.identityText}>
                <Skeleton width="60%" height={20} />
                <Skeleton width="35%" height={12} />
              </View>
            </View>
            <Skeleton height={12} />
            <Skeleton width="70%" height={12} />
          </Card>
          <TripCardSkeleton />
        </View>
      </Screen>
    );
  }

  if (!traveler || travelerQuery.isError) {
    const notFound = travelerQuery.error instanceof ApiError && travelerQuery.error.status === 404;
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow}
        <View style={styles.page}>
          <Card style={styles.errorCard}>
            <View style={[styles.errorIcon, { backgroundColor: `${palette.destructive}14` }]}>
              <Ionicons
                name={notFound ? 'person-outline' : 'alert-circle-outline'}
                size={26}
                color={palette.destructive}
              />
            </View>
            <AppText variant="title">
              {notFound ? 'We couldn’t find that traveller' : 'Something went wrong'}
            </AppText>
            <AppText tone="muted">
              {notFound
                ? 'The handle may be mistyped, or this person is no longer sharing trips.'
                : travelerQuery.error instanceof Error
                  ? travelerQuery.error.message
                  : 'This profile could not be loaded right now.'}
            </AppText>
            <View style={styles.errorActions}>
              <Button label="Back to Explore" onPress={() => router.navigate('/')} />
              {!notFound ? (
                <Button
                  label="Try again"
                  variant="secondary"
                  onPress={() => travelerQuery.refetch()}
                />
              ) : null}
            </View>
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      contentContainerStyle={styles.content}
      refreshing={travelerQuery.isRefetching && !travelerQuery.isPending}
      onRefresh={() => travelerQuery.refetch()}
    >
      {topRow}

      <View style={styles.page}>
        <Card padded={false} style={styles.hero}>
          <View style={[styles.cover, { backgroundColor: palette.muted }]}>
            {trips[0] ? (
              <Image
                source={{ uri: tripCoverUrl(trips[0].destination || trips[0].title, 900) }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={250}
              />
            ) : null}
            <LinearGradient
              colors={['rgba(12,26,21,0)', 'rgba(12,26,21,0.35)']}
              style={StyleSheet.absoluteFill}
            />
          </View>

          <View style={styles.heroBody}>
            <View style={[styles.avatarRing, { backgroundColor: palette.card }]}>
              <Avatar name={traveler.name || traveler.handle} size={88} uri={traveler.avatarUrl} />
            </View>

            <View style={styles.identityText}>
              <AppText variant="title" numberOfLines={2} style={styles.center}>
                {traveler.name}
              </AppText>
              <AppText variant="caption" tone="muted" style={styles.center}>
                @{traveler.handle}
              </AppText>
            </View>

            {traveler.bio ? (
              <AppText tone="muted" style={[styles.bio, styles.center]}>
                {traveler.bio}
              </AppText>
            ) : null}

            <View style={[styles.stats, { borderTopColor: palette.border }]}>
              <View style={styles.stat}>
                <AppText variant="heading">{trips.length}</AppText>
                <AppText variant="caption" tone="muted">
                  {trips.length === 1 ? 'trip shared' : 'trips shared'}
                </AppText>
              </View>
              {lastShared ? (
                <>
                  <View style={[styles.statDivider, { backgroundColor: palette.border }]} />
                  <View style={styles.stat}>
                    <AppText variant="heading">{lastShared}</AppText>
                    <AppText variant="caption" tone="muted">
                      Last shared
                    </AppText>
                  </View>
                </>
              ) : null}
            </View>
          </View>
        </Card>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText variant="label" tone="primary">
              THEIR TRIPS
            </AppText>
            <AppText variant="title">Trips they’ve shared</AppText>
            <AppText variant="caption" tone="muted">
              Published itineraries — not plans still being written.
            </AppText>
          </View>

          {trips.length === 0 ? (
            <Card style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: palette.muted }]}>
                <Ionicons name="compass-outline" size={22} color={palette.primary} />
              </View>
              <AppText variant="heading">Nothing shared yet</AppText>
              <AppText tone="muted">
                When {traveler.name.split(' ')[0]} publishes a trip, it will show up here.
              </AppText>
            </Card>
          ) : (
            trips.map((trip) => (
              <TripCard
                key={trip._id}
                trip={trip}
                showPublisher={false}
                onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip._id } })}
              />
            ))
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.sm, paddingBottom: space.xxl, gap: space.lg },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: { letterSpacing: -0.4 },
  hero: { overflow: 'hidden' },
  cover: { height: 150 },
  heroBody: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.sm },
  avatarRing: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    padding: 4,
    marginTop: -48,
    marginBottom: space.xs,
  },
  identityText: { gap: 2 },
  center: { textAlign: 'center' },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  bio: { lineHeight: 22 },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xl,
    paddingTop: space.lg,
    borderTopWidth: 1,
  },
  stat: { gap: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 30 },
  section: { gap: space.lg },
  sectionHead: { gap: space.xs },
  empty: { alignItems: 'flex-start', gap: space.sm },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  errorCard: { gap: space.sm, alignItems: 'flex-start' },
  errorIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  errorActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
});
