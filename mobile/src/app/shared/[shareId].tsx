import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { fetchSharedTrip } from '@/api/sharedTrips';
import { DayCard } from '@/components/trip/DayPlan';
import { formatDuration } from '@/lib/galleryFormat';
import { toGalleryDays, toGalleryRoutes } from '@/lib/personalTrip';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button, Card, Screen, Skeleton } from '@/ui';

/**
 * Public, read-only view of a native share link. The projection carries only
 * the title, itinerary and drawn routes — no owner name, dates or money.
 */
export default function SharedTripScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ shareId?: string | string[] }>();
  const shareId = (Array.isArray(params.shareId) ? params.shareId[0] : params.shareId)?.trim();

  const tripQuery = useQuery({
    queryKey: ['shared-trip', shareId],
    queryFn: () => fetchSharedTrip(shareId as string),
    enabled: Boolean(shareId),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const trip = tripQuery.data;
  const details = trip?.tripDetails;
  const title = trip?.title?.trim() || details?.trip_title?.trim() || 'Shared itinerary';
  const days = useMemo(() => toGalleryDays(details?.day_by_day_itinerary), [details]);
  const routes = useMemo(() => toGalleryRoutes(trip?.customRoutes), [trip]);
  const dayCount = days.length || details?.duration_days || 0;
  const nightCount = Math.max(0, dayCount - 1);

  const goHome = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={goHome}
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
      </View>

      <View style={[styles.notice, { backgroundColor: palette.muted }]}>
        <Ionicons name="lock-closed-outline" size={14} color={palette.primary} />
        <View style={styles.noticeText}>
          <AppText variant="caption">Public view · Shared itinerary</AppText>
          <AppText variant="caption" tone="muted">
            You’re seeing a read-only copy. Budgets and chat stay private.
          </AppText>
        </View>
      </View>

      {tripQuery.isPending ? (
        <View style={styles.loading}>
          <Skeleton width="80%" height={34} />
          <Skeleton width={160} height={14} />
          <Skeleton width="100%" height={180} radius={radius.xxl} />
        </View>
      ) : tripQuery.isError ? (
        <Card style={styles.stateCard}>
          <View style={[styles.stateIcon, { backgroundColor: `${palette.destructive}14` }]}>
            <Ionicons name="alert-circle-outline" size={26} color={palette.destructive} />
          </View>
          <AppText variant="title" style={styles.center}>
            Itinerary not found
          </AppText>
          <AppText variant="caption" tone="muted" style={styles.center}>
            {tripQuery.error instanceof ApiError
              ? tripQuery.error.message
              : 'The link you followed may be invalid or has been revoked.'}
          </AppText>
          <Button label="Plan your own trip" onPress={() => router.replace('/')} style={styles.wide} />
        </Card>
      ) : (
        <>
          <View style={styles.hero}>
            <AppText variant="display">{title}</AppText>
            {dayCount > 0 ? (
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Ionicons name="calendar-outline" size={14} color={palette.primary} />
                  <AppText variant="caption" tone="muted">
                    {formatDuration(dayCount)}
                    {nightCount > 0
                      ? ` · ${nightCount} ${nightCount === 1 ? 'night' : 'nights'}`
                      : ''}
                  </AppText>
                </View>
                {details?.group_type ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="people-outline" size={14} color={palette.primary} />
                    <AppText variant="caption" tone="muted" style={styles.capitalize}>
                      {details.group_type}
                    </AppText>
                  </View>
                ) : null}
                {details?.season ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="leaf-outline" size={14} color={palette.primary} />
                    <AppText variant="caption" tone="muted" style={styles.capitalize}>
                      {details.season}
                    </AppText>
                  </View>
                ) : null}
              </View>
            ) : null}
            <View style={styles.sharedBy}>
              <View style={[styles.ownerMark, { backgroundColor: palette.muted }]}>
                <Ionicons name="person-outline" size={16} color={palette.primary} />
              </View>
              <View style={styles.sharedByText}>
                <AppText variant="bodyStrong">Shared by the trip owner</AppText>
                <AppText variant="caption" tone="muted">
                  A read-only copy of the plan they shared. Nothing else travels with the link.
                </AppText>
              </View>
            </View>
          </View>

          {details?.highlights && details.highlights.length > 0 ? (
            <Card style={styles.highlights}>
              <AppText variant="caption" tone="primary" style={styles.eyebrow}>
                HIGHLIGHTS
              </AppText>
              <View style={styles.chips}>
                {details.highlights.map((highlight) => (
                  <View
                    key={highlight}
                    style={[styles.chip, { backgroundColor: palette.muted }]}
                  >
                    <AppText variant="caption">{highlight}</AppText>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {days.length > 0 ? (
            <View style={styles.plan}>
              <View style={styles.planHead}>
                <AppText variant="title">The plan</AppText>
                <AppText variant="caption" tone="muted">
                  Tap a day to open it.
                </AppText>
              </View>
              {days.map((day) => (
                <DayCard key={day.day} day={day} routes={routes} first={day.day === days[0].day} />
              ))}
            </View>
          ) : (
            <Card>
              <AppText tone="muted">
                This shared copy has no day-by-day plan yet.
              </AppText>
            </Card>
          )}

          <Card style={styles.cta}>
            <View style={styles.ctaHead}>
              <Ionicons name="sparkles-outline" size={18} color={palette.primary} />
              <AppText variant="bodyStrong" style={styles.ctaText}>
                Want your own version?
              </AppText>
            </View>
            <AppText variant="caption" tone="muted">
              Start a trip of your own and shape every day around the way you travel.
            </AppText>
            <Button label="Plan your own trip" onPress={() => router.push('/create')} />
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.sm, paddingBottom: space.xxl, gap: space.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: { letterSpacing: -0.4 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
  },
  noticeText: { flex: 1, gap: 1 },
  loading: { gap: space.md, paddingTop: space.sm },
  stateCard: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
  stateIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  wide: { width: '100%' },
  hero: { gap: space.md },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  capitalize: { textTransform: 'capitalize' },
  sharedBy: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  ownerMark: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedByText: { flex: 1, gap: 1 },
  highlights: { gap: space.sm },
  eyebrow: { letterSpacing: 1.2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  plan: { gap: space.md },
  planHead: { gap: 1 },
  cta: { gap: space.sm },
  ctaHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  ctaText: { flex: 1 },
});
