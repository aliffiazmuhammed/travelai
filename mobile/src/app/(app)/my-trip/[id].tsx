import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { fetchReadState } from '@/api/discussion';
import { fetchJoinQueue } from '@/api/people';
import { fetchMyTrip, type TripItinerary } from '@/api/trips';
import { DayCard } from '@/components/trip/DayPlan';
import { GoodToKnowRow } from '@/components/trip/GoodToKnow';
import { baseAmountOf, formatMoney } from '@/lib/expenses';
import { formatDuration } from '@/lib/galleryFormat';
import {
  TRIP_STATUS_LABEL,
  formatTripDates,
  rolePhrase,
  toGalleryDays,
  toGalleryRoutes,
  tripDestination,
  tripTitle,
} from '@/lib/personalTrip';
import { tripCoverUrl } from '@/lib/tripCover';
import { goToCreate } from '@/navigation/tabs';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button, Card, EmptyState, Screen, Skeleton, StatTile } from '@/ui';

/** Ink for controls and chips sitting on top of a photo, readable in both themes. */
const OVERLAY_INK = '#173f35';

function TripSkeleton() {
  return (
    <View style={styles.page}>
      <Skeleton height={240} radius={radius.xxl} />
      <View style={styles.chipSkeletons}>
        <Skeleton width={62} height={30} radius={radius.pill} />
        <Skeleton width={62} height={30} radius={radius.pill} />
        <Skeleton width={62} height={30} radius={radius.pill} />
      </View>
      <Card style={styles.skeletonCard}>
        <Skeleton width="35%" height={20} />
        <Skeleton height={90} radius={radius.lg} />
      </Card>
      <Card style={styles.skeletonCard}>
        <Skeleton width="45%" height={20} />
        <Skeleton height={13} />
        <Skeleton width="80%" height={13} />
      </Card>
    </View>
  );
}

export default function MyTripScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const rawId = params.id;
  const tripId = Array.isArray(rawId) ? rawId[0] : rawId;

  const tripQuery = useQuery({
    queryKey: ['my-trip', tripId],
    queryFn: () => (tripId ? fetchMyTrip(tripId) : Promise.reject(new Error('No trip requested.'))),
    enabled: Boolean(tripId),
    // 403/404 are final answers; only real network failures deserve a retry.
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1,
  });
  const trip = tripQuery.data;
  const role = trip?.role;
  const isOwner = role === 'owner';
  const itinerary: TripItinerary = trip?.tripDetails ?? {};
  const days = useMemo(() => toGalleryDays(trip?.tripDetails?.day_by_day_itinerary), [trip]);
  const routes = useMemo(() => toGalleryRoutes(trip?.customRoutes), [trip]);

  // One day open at a time: the chips act as a switcher for the plan, so a
  // ten-day trip never becomes a wall of open cards.
  const [openDay, setOpenDay] = useState<number | null>(0);
  const toggleDay = (index: number) => {
    setOpenDay((current) => (current === index ? null : index));
  };

  // Owners see how many people are waiting on them before they open People.
  const joinQueueQuery = useQuery({
    queryKey: ['join-requests', tripId],
    queryFn: () => (tripId ? fetchJoinQueue(tripId) : Promise.reject(new Error('No trip requested.'))),
    enabled: Boolean(tripId) && isOwner,
    retry: 1,
  });
  const pendingJoinCount = joinQueueQuery.data?.length ?? 0;

  // The conversation badge is the one number worth carrying onto the trip page:
  // it answers "is there anything waiting for me?" before opening the chat.
  const readStateQuery = useQuery({
    queryKey: ['discussion-read', tripId],
    queryFn: () => (tripId ? fetchReadState(tripId) : Promise.reject(new Error('No trip requested.'))),
    enabled: Boolean(tripId),
    retry: 1,
    refetchInterval: 30_000,
  });
  const unreadCount = readStateQuery.data?.unread ?? 0;

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate('/trips');
  };

  const topRow = (right?: ReactNode) => (
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
      {right ?? null}
    </View>
  );

  const heroTopRow = (right?: ReactNode) => (
    <View style={styles.heroTopRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={goBack}
        style={({ pressed }) => [styles.heroBack, { opacity: pressed ? 0.8 : 1 }]}
      >
        <Ionicons name="chevron-back" size={20} color={OVERLAY_INK} />
      </Pressable>
      <AppText variant="heading" numberOfLines={1} style={styles.heroWordmark}>
        waytowalk
      </AppText>
      {right ?? null}
    </View>
  );

  if (tripQuery.isPending) {
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow()}
        <TripSkeleton />
      </Screen>
    );
  }

  if (!trip || tripQuery.isError) {
    const status = tripQuery.error instanceof ApiError ? tripQuery.error.status : 0;
    const forbidden = status === 403;
    const notFound = status === 404;

    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow()}
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
                  : tripQuery.error instanceof Error
                    ? tripQuery.error.message
                    : 'This trip could not be loaded right now.'}
            </AppText>
            <View style={styles.errorActions}>
              <Button label="Back to your trips" onPress={() => router.navigate('/trips')} />
              {!forbidden && !notFound ? (
                <Button
                  label="Try again"
                  variant="secondary"
                  onPress={() => tripQuery.refetch()}
                />
              ) : null}
            </View>
          </Card>
        </View>
      </Screen>
    );
  }

  const title = tripTitle(trip);
  const destination = tripDestination(trip);
  const status = trip.status ?? 'planned';
  const tripRole = role ?? 'owner';
  const canEdit = isOwner || tripRole === 'editor';
  const memberCount = Math.max(trip.members?.length ?? 0, 1);
  const duration = itinerary.duration_days ?? days.length;
  const highlights = itinerary.highlights ?? [];
  const budget = itinerary.budget_per_person;
  const expenseCount = trip.expenses?.length ?? 0;
  const expenseTotal = (trip.expenses ?? []).reduce(
    (sum, expense) => sum + baseAmountOf(expense),
    0
  );
  const expenseBase = (trip.finance?.baseCurrency ?? 'INR').toUpperCase();
  const heroMeta = [destination, `${memberCount} ${memberCount === 1 ? 'traveller' : 'travellers'}`, TRIP_STATUS_LABEL[status]]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.root}>
      <Screen
        scroll
        edges={['top', 'bottom']}
        padded={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.heroSection}>
          <View style={[styles.hero, { backgroundColor: palette.muted }]}>
            <Image
              source={{ uri: tripCoverUrl(destination || title, 1000) }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={250}
            />
            <LinearGradient
              colors={['rgba(12,26,21,0.35)', 'rgba(12,26,21,0)', 'rgba(12,26,21,0.72)']}
              locations={[0, 0.35, 1]}
              style={StyleSheet.absoluteFill}
            />
            {heroTopRow(
              canEdit ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit plan"
                  onPress={() => router.navigate(`/edit-trip/${tripId}`)}
                  style={({ pressed }) => [styles.heroEdit, { opacity: pressed ? 0.8 : 1 }]}
                >
                  <Ionicons name="create-outline" size={14} color={OVERLAY_INK} />
                  <AppText variant="label" style={styles.overlayChipText}>
                    Edit plan
                  </AppText>
                </Pressable>
              ) : undefined
            )}
            <View style={styles.heroBottom}>
              <AppText variant="title" numberOfLines={2} style={styles.heroTitle}>
                {title}
              </AppText>
              <AppText variant="caption" style={styles.heroMeta} numberOfLines={1}>
                {duration > 0 ? `${formatDuration(duration)} · ` : ''}
                {formatTripDates(trip.startDate, trip.endDate)}
              </AppText>
              <AppText variant="caption" style={styles.heroMeta} numberOfLines={1}>
                {heroMeta}
              </AppText>
            </View>
          </View>
        </View>

        <View style={[styles.page, styles.pagePadded]}>

          {highlights.length > 0 ? (
            <Card style={styles.highlights}>
              <View style={styles.cardHead}>
                <Ionicons name="sparkles-outline" size={16} color={palette.primary} />
                <AppText variant="heading">What this trip is about</AppText>
              </View>
              {highlights.map((highlight, index) => (
                <View key={`${highlight}-${index}`} style={styles.bulletRow}>
                  <View style={[styles.bulletDot, { backgroundColor: palette.accent }]} />
                  <AppText tone="muted" style={styles.bulletText}>
                    {highlight}
                  </AppText>
                </View>
              ))}
            </Card>
          ) : null}

          <View style={styles.days}>
            {days.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipScroller}
                contentContainerStyle={styles.chipRow}
              >
                {days.map((day, index) => {
                  const active = openDay === index;
                  return (
                    <Pressable
                      key={`chip-${day.day}-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Show day ${day.day}`}
                      accessibilityState={{ selected: active }}
                      onPress={() => toggleDay(index)}
                      style={({ pressed }) => [
                        styles.dayChip,
                        {
                          backgroundColor: active ? palette.primary : palette.card,
                          borderColor: active ? palette.primary : palette.border,
                        },
                        pressed && { opacity: 0.75 },
                      ]}
                    >
                      <AppText
                        variant="label"
                        style={{
                          color: active ? palette.primaryForeground : palette.mutedForeground,
                        }}
                      >
                        Day {day.day}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            {days.length > 0 ? (
              days.map((day, index) => (
                <DayCard
                  key={`${day.day}-${index}`}
                  day={day}
                  routes={routes}
                  first={index === 0}
                  tripId={tripId}
                  open={openDay === index}
                  onToggle={() => toggleDay(index)}
                />
              ))
            ) : (
              <EmptyState
                icon="map-outline"
                title="No day-by-day plan yet"
                body="This trip is still taking shape. The itinerary will appear here once it has one."
              />
            )}
          </View>

          <GoodToKnowRow
            weather={itinerary.weather_advisory}
            transport={itinerary.local_transport}
            footnotes={itinerary.footnotes_safety_tips}
          />

          <View style={styles.tiles}>
            {typeof budget === 'number' && budget > 0 ? (
              <StatTile
                icon="wallet-outline"
                value={`₹${budget.toLocaleString('en-IN')}`}
                label="planned per person"
              />
            ) : null}
            <StatTile
              icon="receipt-outline"
              value={expenseCount > 0 ? formatMoney(expenseTotal, expenseBase) : 'Start the ledger'}
              label={
                expenseCount > 0
                  ? `${expenseCount} ${expenseCount === 1 ? 'entry' : 'entries'} · settle up`
                  : 'Track and split'
              }
              onPress={() => router.navigate(`/my-trip/${tripId}/expenses`)}
              accessibilityLabel="Trip expenses"
            />
            <StatTile
              icon="chatbubbles-outline"
              value={unreadCount > 0 ? `${unreadCount} new` : 'All caught up'}
              label={unreadCount > 0 ? 'questions and polls' : 'trip conversation'}
              onPress={() => router.navigate(`/my-trip/${tripId}/discussion`)}
              accessibilityLabel={
                unreadCount > 0
                  ? `Trip conversation, ${unreadCount} unread ${
                      unreadCount === 1 ? 'message' : 'messages'
                    }`
                  : 'Trip conversation'
              }
            />
            <StatTile
              icon="people-outline"
              value={`${memberCount} ${memberCount === 1 ? 'traveller' : 'travellers'}`}
              label={isOwner ? 'you own this trip' : `you’re ${rolePhrase(tripRole)}`}
              badge={isOwner ? pendingJoinCount : undefined}
              onPress={() => router.navigate(`/my-trip/${tripId}/people`)}
              accessibilityLabel={
                isOwner && pendingJoinCount > 0
                  ? `People on this trip, ${pendingJoinCount} join ${
                      pendingJoinCount === 1 ? 'request' : 'requests'
                    } waiting`
                  : 'People on this trip'
              }
            />
            <StatTile
              icon="share-outline"
              value={isOwner ? 'Link, gallery, PDF' : 'Save it as a PDF'}
              label="share & export"
              onPress={() => router.navigate(`/my-trip/${tripId}/share`)}
              accessibilityLabel="Share or export this trip"
            />
          </View>

          <View style={styles.footer}>
            <Button
              label="Plan another trip"
              variant="ghost"
              icon={<Ionicons name="sparkles-outline" size={16} color={palette.foreground} />}
              onPress={goToCreate}
            />
          </View>
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: space.xxxl, gap: space.xl },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xl },
  pagePadded: { paddingHorizontal: space.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: { letterSpacing: -0.4, flex: 1 },
  heroSection: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  hero: { height: 248, justifyContent: 'space-between' },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
  },
  heroBack: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  heroWordmark: { letterSpacing: -0.4, flex: 1, color: '#ffffff' },
  heroEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  heroBottom: { paddingHorizontal: space.xl, paddingBottom: space.lg, gap: 3 },
  heroTitle: { color: '#ffffff', letterSpacing: -0.4 },
  heroMeta: { color: 'rgba(255,255,255,0.88)' },
  overlayChipText: { color: OVERLAY_INK },
  highlights: { gap: space.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletDot: { width: 5, height: 5, borderRadius: radius.pill, marginTop: 9 },
  bulletText: { flex: 1 },
  days: { gap: space.lg },
  chipScroller: { marginHorizontal: -space.xl, flexGrow: 0 },
  chipRow: { paddingHorizontal: space.xl, gap: space.sm },
  dayChip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  footer: { alignItems: 'stretch' },
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
  skeletonCard: { gap: space.sm },
  chipSkeletons: { flexDirection: 'row', gap: space.sm },
});
