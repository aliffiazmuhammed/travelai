import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import {
  fetchGalleryTrip,
  type GalleryStay,
  type GalleryTrip,
} from '@/api/explore';
import {
  fetchJoinRequestState,
  requestToJoin,
  withdrawJoinRequest,
  type JoinRequestState,
} from '@/api/joinRequests';
import { JoinSheet } from '@/components/JoinSheet';
import { DayCard } from '@/components/trip/DayPlan';
import { PracticalitiesCard } from '@/components/trip/Practicalities';
import { formatDuration, formatGalleryDates } from '@/lib/galleryFormat';
import { tripCoverUrl } from '@/lib/tripCover';
import { goToCreate } from '@/navigation/tabs';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Avatar, Button, Card, InlineError, Screen, Skeleton } from '@/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDayStamp(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function collectStays(trip: GalleryTrip): GalleryStay[] {
  const seen = new Set<string>();
  const stays: GalleryStay[] = [];

  for (const day of trip.itinerary.day_by_day_itinerary) {
    for (const stay of day.stay_recommendations) {
      const key = stay.name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      stays.push(stay);
    }
  }
  return stays;
}

function collectFoodSpots(trip: GalleryTrip): string[] {
  const seen = new Set<string>();
  const spots: string[] = [];

  for (const day of trip.itinerary.day_by_day_itinerary) {
    for (const spot of day.food_spots) {
      const key = spot.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      spots.push(spot);
    }
  }
  return spots;
}

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  const { palette } = useTheme();

  return (
    <View style={styles.sectionHeading}>
      <View style={styles.eyebrowRow}>
        <View style={[styles.eyebrowTick, { backgroundColor: palette.accent }]} />
        <AppText variant="caption" tone="muted" style={styles.eyebrow}>
          {eyebrow}
        </AppText>
      </View>
      <AppText variant="title">{title}</AppText>
      {body ? (
        <AppText variant="caption" tone="muted">
          {body}
        </AppText>
      ) : null}
    </View>
  );
}

function Notice({
  icon,
  children,
}: {
  icon: IconName;
  children: ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: palette.muted }]}>
      <Ionicons name={icon} size={17} color={palette.primary} />
      <AppText variant="caption" style={styles.noticeText}>
        {children}
      </AppText>
    </View>
  );
}

function JoinAction({
  hostName,
  state,
  loading,
  joinClosed,
  error,
  sheetOpen,
  withdrawing,
  onAsk,
  onWithdraw,
}: {
  hostName: string;
  state: JoinRequestState | undefined;
  loading: boolean;
  joinClosed: boolean;
  error?: string | null;
  sheetOpen: boolean;
  withdrawing: boolean;
  onAsk: () => void;
  onWithdraw: () => void;
}) {
  const { palette } = useTheme();

  if (loading) {
    return <Skeleton height={48} radius={radius.pill} />;
  }

  let content: ReactNode;
  if (state?.isOwner) {
    content = (
      <Notice icon="checkmark-circle-outline">This is your trip — you have full access.</Notice>
    );
  } else if (state?.isMember) {
    content = (
      <Notice icon="people-outline">
        You’re in. {hostName} approved your request, so this trip is yours to follow.
      </Notice>
    );
  } else if (state?.request?.status === 'pending' && !joinClosed) {
    content = (
      <View style={styles.pending}>
        <Button
          label="Waiting to hear back"
          variant="secondary"
          disabled
          icon={<Ionicons name="time-outline" size={17} color={palette.secondaryForeground} />}
        />
        <Pressable
          accessibilityRole="button"
          disabled={withdrawing}
          onPress={onWithdraw}
          hitSlop={8}
          style={({ pressed }) => [styles.withdraw, { opacity: pressed || withdrawing ? 0.6 : 1 }]}
        >
          <AppText variant="caption" tone="muted">
            {withdrawing ? 'Withdrawing…' : 'Withdraw request'}
          </AppText>
        </Pressable>
      </View>
    );
  } else if (joinClosed) {
    content = (
      <Notice icon="time-outline">
        This trip has already happened, so joining is closed. The plan stays here to read.
      </Notice>
    );
  } else {
    content = (
      <View style={styles.ask}>
        <Button
          label="Ask to join"
          onPress={onAsk}
          disabled={sheetOpen}
          icon={<Ionicons name="person-add-outline" size={17} color="#ffffff" />}
        />
        <AppText variant="caption" tone="muted">
          Asking sends {hostName} a note. If they say yes, you can follow the trip and comment.
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.joinBlock}>
      {error ? <InlineError message={error} /> : null}
      {content}
    </View>
  );
}

function TripSkeleton() {
  return (
    <View style={styles.page}>
      <Skeleton height={240} radius={radius.xxl} />
      <View style={styles.titleBlock}>
        <Skeleton width="85%" height={30} />
        <Skeleton width="65%" height={30} />
        <Skeleton height={14} />
        <Skeleton width="55%" height={14} />
      </View>
      <Skeleton height={48} radius={radius.pill} />
      <Card style={styles.skeletonCard}>
        <Skeleton width="45%" height={20} />
        <Skeleton height={13} />
        <Skeleton width="80%" height={13} />
      </Card>
      <Card style={styles.skeletonCard}>
        <Skeleton width="35%" height={20} />
        <Skeleton height={90} radius={radius.lg} />
      </Card>
    </View>
  );
}

export default function TripScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams();
  const rawId = params.id;
  const tripId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [joinMessage, setJoinMessage] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  const tripQuery = useQuery({
    queryKey: ['gallery-trip', tripId],
    queryFn: () => (tripId ? fetchGalleryTrip(tripId) : Promise.reject(new Error('No trip requested.'))),
    enabled: Boolean(tripId),
    // A 404 is a final answer, not a hiccup: don't ask again.
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1,
  });
  const trip = tripQuery.data;

  const joinQuery = useQuery({
    queryKey: ['join-state', tripId],
    queryFn: () =>
      tripId ? fetchJoinRequestState(tripId) : Promise.reject(new Error('No trip requested.')),
    enabled: Boolean(trip),
  });
  const joinState = joinQuery.data;

  const joinMutation = useMutation({
    mutationFn: (message: string) =>
      tripId ? requestToJoin(tripId, message || undefined) : Promise.reject(new Error('No trip requested.')),
    onSuccess: (request) => {
      setSheetOpen(false);
      setJoinMessage('');
      setJoinError(null);
      queryClient.setQueryData<JoinRequestState>(['join-state', tripId], (previous) =>
        previous ? { ...previous, request } : previous
      );
      queryClient.invalidateQueries({ queryKey: ['join-state', tripId] });
    },
    onError: (error) => {
      setJoinError(
        error instanceof Error ? error.message : 'That request could not be sent right now.'
      );
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: () =>
      tripId ? withdrawJoinRequest(tripId) : Promise.reject(new Error('No trip requested.')),
    onSuccess: (request) => {
      setJoinError(null);
      queryClient.setQueryData<JoinRequestState>(['join-state', tripId], (previous) =>
        previous ? { ...previous, request } : previous
      );
      queryClient.invalidateQueries({ queryKey: ['join-state', tripId] });
    },
    onError: (error) => {
      setJoinError(
        error instanceof Error ? error.message : 'That request could not be withdrawn right now.'
      );
    },
  });

  const stays = useMemo(() => (trip ? collectStays(trip) : []), [trip]);
  const eats = useMemo(() => (trip ? collectFoodSpots(trip) : []), [trip]);

  const tripHasStarted = useMemo(() => {
    if (!trip?.dates.exact || !trip.dates.startDate) return false;
    const start = new Date(trip.dates.startDate);
    if (Number.isNaN(start.getTime())) return false;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return start < today;
  }, [trip]);

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
      <AppText variant="title" tone="primary" style={styles.wordmark}>
        waytowalk
      </AppText>
    </View>
  );

  if (tripQuery.isPending) {
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow}
        <TripSkeleton />
      </Screen>
    );
  }

  if (!trip || tripQuery.isError) {
    const notFound = tripQuery.error instanceof ApiError && tripQuery.error.status === 404;
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow}
        <View style={styles.page}>
          <Card style={styles.errorCard}>
            <View style={[styles.errorIcon, { backgroundColor: `${palette.destructive}14` }]}>
              <Ionicons
                name={notFound ? 'compass-outline' : 'alert-circle-outline'}
                size={26}
                color={palette.destructive}
              />
            </View>
            <AppText variant="title">
              {notFound ? 'This trip isn’t here anymore' : 'Something went wrong'}
            </AppText>
            <AppText tone="muted">
              {notFound
                ? 'The host may have unshared it, or it has already happened. Shared trips leave the gallery once they’re over.'
                : tripQuery.error instanceof Error
                  ? tripQuery.error.message
                  : 'This trip could not be loaded right now.'}
            </AppText>
            <View style={styles.errorActions}>
              <Button label="Back to Explore" onPress={() => router.navigate('/')} />
              {!notFound ? (
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

  const itinerary = trip.itinerary;
  const days = itinerary.day_by_day_itinerary;
  const hostName = trip.publisher.name || trip.publisher.handle || 'the host';
  const sharedOn = formatDayStamp(trip.publishedAt);
  const joinClosed = tripHasStarted || joinState?.joinable === false;
  const facts = [
    trip.groupType ? { icon: 'people-outline' as IconName, label: trip.groupType } : null,
    { icon: 'calendar-outline' as IconName, label: formatDuration(trip.durationDays) },
    trip.season ? { icon: 'leaf-outline' as IconName, label: trip.season } : null,
  ].filter((fact): fact is { icon: IconName; label: string } => fact !== null);

  return (
    <View style={styles.root}>
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow}

        <View style={styles.page}>
          <Card padded={false}>
            <View style={styles.heroClip}>
              <View style={[styles.hero, { backgroundColor: palette.muted }]}>
                <Image
                  source={{ uri: tripCoverUrl(trip.destination || trip.title, 1200) }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={250}
                />
                <LinearGradient
                  colors={['rgba(12,26,21,0)', 'rgba(12,26,21,0.66)']}
                  locations={[0.4, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.heroChipRow}>
                  <View style={[styles.heroChip, styles.glass]}>
                    <Ionicons name="time-outline" size={12} color="#ffffff" />
                    <AppText variant="caption" style={styles.heroChipText}>
                      {formatDuration(trip.durationDays)}
                    </AppText>
                  </View>
                  {tripHasStarted ? (
                    <View style={[styles.heroChip, styles.glass]}>
                      <Ionicons name="checkmark-done-outline" size={12} color="#ffffff" />
                      <AppText variant="caption" style={styles.heroChipText}>
                        Finished
                      </AppText>
                    </View>
                  ) : trip.groupType ? (
                    <View style={[styles.heroChip, styles.glass]}>
                      <AppText variant="caption" style={styles.heroChipText}>
                        {trip.groupType}
                      </AppText>
                    </View>
                  ) : null}
                </View>
                <View style={styles.heroDestination}>
                  <Ionicons name="location-outline" size={14} color="#ffffff" />
                  <AppText variant="label" numberOfLines={1} style={styles.heroChipText}>
                    {trip.destination || 'Somewhere new'}
                  </AppText>
                </View>
              </View>
            </View>
          </Card>

          <View style={styles.titleBlock}>
            <AppText variant="display">{trip.title}</AppText>
            {trip.summary ? <AppText tone="muted">{trip.summary}</AppText> : null}

            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={14} color={palette.mutedForeground} />
              <AppText variant="caption" tone="muted">
                {formatGalleryDates(trip.dates)}
              </AppText>
            </View>

            <View style={styles.factRow}>
              {facts.map((fact) => (
                <View
                  key={fact.label}
                  style={[styles.factChip, { backgroundColor: palette.muted }]}
                >
                  <Ionicons name={fact.icon} size={12} color={palette.primary} />
                  <AppText variant="caption" numberOfLines={1} style={styles.factText}>
                    {fact.label}
                  </AppText>
                </View>
              ))}
            </View>

            <View style={[styles.publisher, { borderTopColor: palette.border }]}>
              <Avatar name={hostName} size={40} />
              <View style={styles.publisherText}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  Shared by {hostName}
                </AppText>
                <AppText variant="caption" tone="muted" numberOfLines={1}>
                  {trip.publisher.handle ? `@${trip.publisher.handle}` : 'Trip host'}
                  {sharedOn ? ` · ${sharedOn}` : ''}
                </AppText>
              </View>
            </View>
          </View>

          <JoinAction
            hostName={hostName}
            state={joinState}
            loading={joinQuery.isPending && Boolean(trip)}
            joinClosed={joinClosed}
            error={joinError}
            sheetOpen={sheetOpen}
            withdrawing={withdrawMutation.isPending}
            onAsk={() => {
              setJoinError(null);
              setJoinMessage('');
              setSheetOpen(true);
            }}
            onWithdraw={() => {
              setJoinError(null);
              withdrawMutation.mutate();
            }}
          />

          {trip.tags.length > 0 ? (
            <View style={styles.tags}>
              {trip.tags.map((tag) => (
                <View key={tag} style={[styles.tag, { backgroundColor: palette.muted }]}>
                  <AppText variant="caption" tone="muted">
                    #{tag}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}

          {itinerary.highlights.length > 0 ? (
            <Card style={styles.highlights}>
              <View style={styles.cardHead}>
                <Ionicons name="sparkles-outline" size={16} color={palette.primary} />
                <AppText variant="heading">Trip highlights</AppText>
              </View>
              {itinerary.highlights.map((highlight, index) => (
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
            <SectionHeading
              eyebrow="THE PLAN"
              title="Day by day"
              body={
                days.length > 0
                  ? `${formatDuration(days.length)}, exactly as ${hostName} planned ${
                      days.length === 1 ? 'it' : 'them'
                    }.`
                  : undefined
              }
            />
            {days.length > 0 ? (
              days.map((day, index) => (
                <DayCard
                  key={`${day.day}-${index}`}
                  day={day}
                  routes={trip.customRoutes}
                  first={index === 0}
                />
              ))
            ) : (
              <Card style={styles.emptyDays}>
                <Ionicons name="map-outline" size={22} color={palette.mutedForeground} />
                <AppText variant="bodyStrong">No day-by-day plan was shared</AppText>
                <AppText variant="caption" tone="muted">
                  {hostName} shared the trip without the day-by-day details.
                </AppText>
              </Card>
            )}
          </View>

          {stays.length > 0 ? (
            <Card style={styles.listCard}>
              <View style={styles.cardHead}>
                <Ionicons name="bed-outline" size={16} color={palette.primary} />
                <AppText variant="heading">Where you’ll stay</AppText>
              </View>
              {stays.map((stay) => {
                const detail = [stay.location, stay.vibe || stay.description]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <View key={stay.name} style={styles.listRow}>
                    <View style={[styles.listIcon, { backgroundColor: palette.muted }]}>
                      <Ionicons name="bed-outline" size={14} color={palette.primary} />
                    </View>
                    <View style={styles.listText}>
                      <AppText variant="label">{stay.name}</AppText>
                      {detail ? (
                        <AppText variant="caption" tone="muted">
                          {detail}
                        </AppText>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </Card>
          ) : null}

          {eats.length > 0 ? (
            <Card style={styles.listCard}>
              <View style={styles.cardHead}>
                <Ionicons name="restaurant-outline" size={16} color={palette.primary} />
                <AppText variant="heading">Where you’ll eat</AppText>
              </View>
              <View style={styles.foodWrap}>
                {eats.map((spot) => (
                  <View key={spot} style={[styles.foodChip, { backgroundColor: palette.muted }]}>
                    <AppText variant="caption">{spot}</AppText>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          <PracticalitiesCard
            weather={itinerary.weather_advisory}
            transport={itinerary.local_transport}
            footnotes={itinerary.footnotes_safety_tips}
          />

          {trip.customRoutes.length > 0 ? (
            <Card style={styles.listCard}>
              <View style={styles.cardHead}>
                <Ionicons name="navigate-outline" size={16} color={palette.primary} />
                <AppText variant="heading">Routes on this trip</AppText>
              </View>
              {trip.customRoutes.map((route, index) => (
                <View
                  key={`${route.name}-${index}`}
                  style={[styles.routeRow, { borderTopColor: palette.border }]}
                >
                  <AppText variant="label" numberOfLines={1} style={styles.listText}>
                    {route.name}
                  </AppText>
                  <AppText variant="caption" tone="muted">
                    {route.day ? `Day ${route.day} · ` : ''}
                    {route.distanceKm > 0 ? `${route.distanceKm.toFixed(1)} km` : route.mode}
                  </AppText>
                </View>
              ))}
            </Card>
          ) : null}

          <Card style={styles.privacy}>
            <View style={styles.cardHead}>
              <Ionicons name="lock-closed-outline" size={15} color={palette.mutedForeground} />
              <AppText variant="label">Shared on purpose, private by default</AppText>
            </View>
            <AppText variant="caption" tone="muted">
              You’re seeing the itinerary, the dates {hostName} chose to share and their public
              profile. Budgets, expenses and travel companions stay private.
            </AppText>
          </Card>

          <View style={styles.footer}>
            <Button
              label="Plan your own trip"
              variant="ghost"
              icon={<Ionicons name="sparkles-outline" size={16} color={palette.foreground} />}
              onPress={goToCreate}
            />
          </View>
        </View>
      </Screen>

      <JoinSheet
        visible={sheetOpen}
        hostName={hostName}
        message={joinMessage}
        onChangeMessage={setJoinMessage}
        submitting={joinMutation.isPending}
        error={joinError}
        onClose={() => {
          setSheetOpen(false);
          setJoinMessage('');
          setJoinError(null);
        }}
        onSubmit={() => {
          setJoinError(null);
          joinMutation.mutate(joinMessage.trim());
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingTop: space.sm, paddingBottom: space.xxxl },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xxl },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: { letterSpacing: -0.4 },
  heroClip: { borderRadius: radius.xxl, overflow: 'hidden' },
  hero: { height: 240, justifyContent: 'space-between', padding: space.lg },
  heroChipRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  heroChipText: { color: '#ffffff', flexShrink: 1 },
  glass: { backgroundColor: 'rgba(17,32,27,0.55)' },
  heroDestination: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  titleBlock: { gap: space.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  factRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  factChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    maxWidth: '100%',
  },
  factText: { flexShrink: 1 },
  publisher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.xs,
    paddingTop: space.md,
    borderTopWidth: 1,
  },
  publisherText: { flex: 1 },
  joinBlock: { gap: space.sm },
  ask: { gap: space.sm },
  pending: { gap: 2, alignItems: 'stretch' },
  withdraw: { alignSelf: 'center', paddingVertical: 6 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
  },
  noticeText: { flex: 1, lineHeight: 18 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  highlights: { gap: space.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletDot: { width: 5, height: 5, borderRadius: radius.pill, marginTop: 9 },
  bulletText: { flex: 1 },
  days: { gap: space.lg },
  sectionHeading: { gap: 2 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrowTick: { width: 12, height: 2, borderRadius: radius.pill },
  eyebrow: { letterSpacing: 1.2 },
  emptyDays: { alignItems: 'flex-start', gap: space.sm },
  listCard: { gap: space.md },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  listIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listText: { flex: 1 },
  foodWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  foodChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingTop: space.md,
    borderTopWidth: 1,
  },
  privacy: { gap: space.sm },
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
});
