import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

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
import { AppText, Button, Card, Screen, Skeleton } from '@/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

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
      <AppText variant="heading">{title}</AppText>
      {body ? (
        <AppText variant="caption" tone="muted">
          {body}
        </AppText>
      ) : null}
    </View>
  );
}

function TripSkeleton() {
  return (
    <View style={styles.page}>
      <Skeleton height={190} radius={radius.xxl} />
      <View style={styles.titleBlock}>
        <Skeleton width="85%" height={30} />
        <Skeleton width="60%" height={30} />
        <Skeleton height={14} />
        <Skeleton width="55%" height={14} />
      </View>
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
      <AppText variant="heading" tone="primary" style={styles.wordmark}>
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
  const facts = [
    duration > 0 ? { icon: 'calendar-outline' as IconName, label: formatDuration(duration) } : null,
    itinerary.group_type
      ? { icon: 'people-outline' as IconName, label: itinerary.group_type }
      : null,
    itinerary.season ? { icon: 'leaf-outline' as IconName, label: itinerary.season } : null,
  ].filter((fact): fact is { icon: IconName; label: string } => fact !== null);

  const peopleLine = isOwner
    ? memberCount > 1
      ? `You own this trip · ${memberCount} travellers`
      : 'You own this trip · just you so far'
    : `You’re ${rolePhrase(tripRole)} here · ${memberCount} ${
        memberCount === 1 ? 'traveller' : 'travellers'
      }`;

  const daysLine =
    days.length === 0
      ? undefined
      : isOwner
        ? `${formatDuration(days.length)}, laid out the way you planned ${
            days.length === 1 ? 'it' : 'them'
          }.`
        : `${formatDuration(days.length)}, exactly as they were planned.`;

  return (
    <View style={styles.root}>
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow(
          canEdit ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit plan"
              onPress={() => router.navigate(`/edit-trip/${tripId}`)}
              style={({ pressed }) => [
                styles.editAction,
                { backgroundColor: palette.muted, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons name="create-outline" size={14} color={palette.primary} />
              <AppText variant="label" tone="primary">
                Edit plan
              </AppText>
            </Pressable>
          ) : undefined
        )}

        <View style={styles.page}>
          <Card padded={false}>
            <View style={styles.heroClip}>
              <View style={[styles.hero, { backgroundColor: palette.muted }]}>
                <Image
                  source={{ uri: tripCoverUrl(destination || title, 1000) }}
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
                    <AppText variant="caption" style={styles.heroChipText}>
                      {TRIP_STATUS_LABEL[status]}
                    </AppText>
                  </View>
                  {duration > 0 ? (
                    <View style={[styles.heroChip, styles.glass]}>
                      <Ionicons name="time-outline" size={12} color="#ffffff" />
                      <AppText variant="caption" style={styles.heroChipText}>
                        {formatDuration(duration)}
                      </AppText>
                    </View>
                  ) : null}
                </View>
                <View style={styles.heroDestination}>
                  <Ionicons name="location-outline" size={14} color="#ffffff" />
                  <AppText variant="label" numberOfLines={1} style={styles.heroChipText}>
                    {destination || (isOwner ? 'Your plan' : 'A shared plan')}
                  </AppText>
                </View>
              </View>
            </View>
          </Card>

          <View style={styles.titleBlock}>
            <AppText variant="display">{title}</AppText>

            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={14} color={palette.mutedForeground} />
              <AppText variant="caption" tone="muted">
                {formatTripDates(trip.startDate, trip.endDate)}
              </AppText>
            </View>

            {facts.length > 0 ? (
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
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isOwner && pendingJoinCount > 0
                  ? `People on this trip, ${pendingJoinCount} join ${
                      pendingJoinCount === 1 ? 'request' : 'requests'
                    } waiting`
                  : 'People on this trip'
              }
              onPress={() => router.navigate(`/my-trip/${tripId}/people`)}
              style={({ pressed }) => [
                styles.people,
                { borderTopColor: palette.border },
                pressed ? { opacity: 0.68 } : null,
              ]}
            >
              <Ionicons name="people-outline" size={15} color={palette.primary} />
              <AppText variant="bodyStrong" numberOfLines={1} style={styles.peopleText}>
                {peopleLine}
              </AppText>
              {isOwner && pendingJoinCount > 0 ? (
                <View style={[styles.peopleBadge, { backgroundColor: palette.accent }]}>
                  <AppText
                    variant="label"
                    style={[styles.peopleBadgeText, { color: palette.accentForeground }]}
                  >
                    {pendingJoinCount}
                  </AppText>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={15} color={palette.mutedForeground} />
            </Pressable>
          </View>

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
            <SectionHeading eyebrow="THE PLAN" title="Day by day" body={daysLine} />
            {days.length > 0 ? (
              days.map((day, index) => (
                <DayCard
                  key={`${day.day}-${index}`}
                  day={day}
                  routes={routes}
                  first={index === 0}
                  tripId={tripId}
                />
              ))
            ) : (
              <Card style={styles.emptyDays}>
                <Ionicons name="map-outline" size={22} color={palette.mutedForeground} />
                <AppText variant="bodyStrong">No day-by-day plan yet</AppText>
                <AppText variant="caption" tone="muted">
                  This trip is still taking shape. The itinerary will appear here once it has one.
                </AppText>
              </Card>
            )}
          </View>

          <GoodToKnowRow
            weather={itinerary.weather_advisory}
            transport={itinerary.local_transport}
            footnotes={itinerary.footnotes_safety_tips}
          />

          <Card
            onPress={() => router.navigate(`/my-trip/${tripId}/discussion`)}
            accessibilityLabel={
              unreadCount > 0
                ? `Trip conversation, ${unreadCount} unread ${
                    unreadCount === 1 ? 'message' : 'messages'
                  }`
                : 'Trip conversation'
            }
            style={styles.discussionEntry}
          >
            <View style={styles.budgetRow}>
              <View style={styles.budgetText}>
                <AppText variant="caption" tone="muted" style={styles.budgetLabel}>
                  THE CONVERSATION
                </AppText>
                <View style={styles.discussionTitleRow}>
                  <AppText variant="title">
                    {unreadCount > 0
                      ? `${unreadCount} new ${unreadCount === 1 ? 'message' : 'messages'}`
                      : 'Talk it through'}
                  </AppText>
                  {unreadCount > 0 ? (
                    <View style={[styles.peopleBadge, { backgroundColor: palette.accent }]}>
                      <AppText
                        variant="label"
                        style={[styles.peopleBadgeText, { color: palette.accentForeground }]}
                      >
                        {unreadCount}
                      </AppText>
                    </View>
                  ) : null}
                </View>
                <AppText variant="caption" tone="muted">
                  {unreadCount > 0
                    ? 'Questions, polls and what you agreed — pick up where the group left off.'
                    : 'Polls, decisions and the group’s back-and-forth, sealed end to end.'}
                </AppText>
              </View>
              <View style={styles.expenseIcons}>
                <View style={[styles.budgetIcon, { backgroundColor: palette.muted }]}>
                  <Ionicons name="chatbubbles-outline" size={18} color={palette.primary} />
                </View>
                <Ionicons name="chevron-forward" size={15} color={palette.mutedForeground} />
              </View>
            </View>
          </Card>

          <Card
            onPress={() => router.navigate(`/my-trip/${tripId}/expenses`)}
            accessibilityLabel="Trip expenses"
            style={styles.expenseEntry}
          >
            <View style={styles.budgetRow}>
              <View style={styles.budgetText}>
                <AppText variant="caption" tone="muted" style={styles.budgetLabel}>
                  TRIP EXPENSES
                </AppText>
                <AppText variant="title">
                  {expenseCount > 0 ? formatMoney(expenseTotal, expenseBase) : 'Start the ledger'}
                </AppText>
                <AppText variant="caption" tone="muted">
                  {expenseCount > 0
                    ? `${expenseCount} ${expenseCount === 1 ? 'entry' : 'entries'} logged · see who owes whom`
                    : 'Track what you spend, and split it fairly.'}
                </AppText>
              </View>
              <View style={styles.expenseIcons}>
                <View style={[styles.budgetIcon, { backgroundColor: palette.muted }]}>
                  <Ionicons name="wallet-outline" size={18} color={palette.primary} />
                </View>
                <Ionicons name="chevron-forward" size={15} color={palette.mutedForeground} />
              </View>
            </View>
          </Card>

          {typeof budget === 'number' && budget > 0 ? (
            <Card style={styles.budget}>
              <View style={styles.budgetRow}>
                <View style={styles.budgetText}>
                  <AppText variant="caption" tone="muted" style={styles.budgetLabel}>
                    PLANNED BUDGET
                  </AppText>
                  <AppText variant="title">₹{budget.toLocaleString('en-IN')} per person</AppText>
                </View>
                <View style={[styles.budgetIcon, { backgroundColor: palette.muted }]}>
                  <Ionicons name="wallet-outline" size={18} color={palette.primary} />
                </View>
              </View>
              <AppText variant="caption" tone="muted">
                A planning figure, not a ledger.
              </AppText>
            </Card>
          ) : null}

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
  content: { paddingTop: space.sm, paddingBottom: space.xxxl },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: { letterSpacing: -0.4, flex: 1 },
  editAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  heroClip: { borderRadius: radius.xxl, overflow: 'hidden' },
  hero: { height: 190, justifyContent: 'space-between', padding: space.lg },
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
  people: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xs,
    paddingTop: space.md,
    borderTopWidth: 1,
  },
  peopleText: { flex: 1 },
  peopleBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peopleBadgeText: { fontSize: 12, lineHeight: 16 },
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
  budget: { gap: space.sm },
  expenseEntry: { gap: space.xs },
  discussionEntry: { gap: space.xs },
  discussionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  expenseIcons: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  budgetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  budgetText: { flex: 1 },
  budgetLabel: { letterSpacing: 0.8, fontSize: 11 },
  budgetIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
