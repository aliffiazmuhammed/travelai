import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import type { GalleryTripSummary } from '@/api/explore';
import { formatDuration, formatGalleryDates } from '@/lib/galleryFormat';
import { tripCoverUrl } from '@/lib/tripCover';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Avatar, Card, Skeleton } from '@/ui';

interface TripCardProps {
  trip: GalleryTripSummary;
  past?: boolean;
  /** Off on a traveller's own portfolio, where every card shares the same host. */
  showPublisher?: boolean;
  onPress?: () => void;
}

/**
 * People-led gallery card: the photo leads, then the plan, then who is holding
 * it. The whole card opens the trip page once a handler is supplied.
 */
export function TripCard({ trip, past = false, showPublisher = true, onPress }: TripCardProps) {
  const { palette } = useTheme();
  const publisherName = trip.publisher.name || trip.publisher.handle || 'A traveller';
  const glass = { backgroundColor: 'rgba(17,32,27,0.55)' };

  return (
    <Card padded={false} onPress={onPress}>
      <View style={styles.clip}>
        <View style={styles.cover}>
          <Image
            source={{ uri: tripCoverUrl(trip.destination || trip.title, 900) }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={250}
          />
          <LinearGradient
            colors={['rgba(12,26,21,0)', 'rgba(12,26,21,0.62)']}
            locations={[0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.chipRow}>
            <View style={[styles.chip, glass]}>
              <Ionicons name="time-outline" size={12} color="#ffffff" />
              <AppText variant="caption" style={styles.chipText}>
                {formatDuration(trip.durationDays)}
              </AppText>
            </View>
            {past ? (
              <View style={[styles.chip, glass]}>
                <Ionicons name="checkmark-done-outline" size={12} color="#ffffff" />
                <AppText variant="caption" style={styles.chipText}>
                  Finished
                </AppText>
              </View>
            ) : trip.groupType ? (
              <View style={[styles.chip, glass]}>
                <AppText variant="caption" style={styles.chipText}>
                  {trip.groupType}
                </AppText>
              </View>
            ) : null}
          </View>
          <View style={styles.destination}>
            <Ionicons name="location-outline" size={13} color="#ffffff" />
            <AppText variant="label" numberOfLines={1} style={styles.destinationText}>
              {trip.destination || 'Somewhere new'}
            </AppText>
          </View>
        </View>

        <View style={styles.body}>
          <AppText variant="heading" numberOfLines={2}>
            {trip.title}
          </AppText>
          {trip.summary ? (
            <AppText tone="muted" numberOfLines={2}>
              {trip.summary}
            </AppText>
          ) : null}
          <View style={styles.dateRow}>
            <Ionicons name="calendar-outline" size={13} color={palette.mutedForeground} />
            <AppText variant="caption" tone="muted">
              {formatGalleryDates(trip.dates)}
            </AppText>
          </View>

          {showPublisher ? (
            <View style={[styles.publisher, { borderTopColor: palette.border }]}>
              <Avatar name={publisherName} size={28} />
              <View style={styles.publisherText}>
                <AppText variant="label" numberOfLines={1}>
                  {publisherName}
                </AppText>
                <AppText variant="caption" tone="muted" numberOfLines={1}>
                  {trip.publisher.handle ? `@${trip.publisher.handle}` : 'Shared a trip'}
                </AppText>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

/**
 * Compact row variant for browsing many trips on Explore: the photo still
 * identifies the place, but three short lines carry the rest so a page of
 * results stays a screen and a half instead of four.
 */
export function TripRowCard({
  trip,
  past = false,
  onPress,
}: {
  trip: GalleryTripSummary;
  past?: boolean;
  onPress?: () => void;
}) {
  const { palette } = useTheme();
  const publisherName = trip.publisher.name || trip.publisher.handle || 'A traveller';

  return (
    <Card padded={false} onPress={onPress}>
      <View style={styles.rowCard}>
        <View style={[styles.thumb, { backgroundColor: palette.muted }]}>
          <Image
            source={{ uri: tripCoverUrl(trip.destination || trip.title, 320) }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
          />
        </View>
        <View style={styles.rowBody}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {trip.title}
          </AppText>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={12} color={palette.mutedForeground} />
            <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.metaText}>
              {trip.destination || 'Somewhere new'} · {formatDuration(trip.durationDays)}
            </AppText>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={12} color={palette.mutedForeground} />
            <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.metaText}>
              {formatGalleryDates(trip.dates)}
              {past ? ' · Finished' : ''}
            </AppText>
          </View>
          <View style={styles.rowPublisher}>
            <Avatar name={publisherName} size={20} />
            <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.metaText}>
              {publisherName}
            </AppText>
          </View>
        </View>
      </View>
    </Card>
  );
}

export function TripCardSkeleton() {
  return (
    <Card padded={false}>
      <View style={styles.clip}>
        <Skeleton height={196} radius={0} />
        <View style={styles.body}>
          <Skeleton width="75%" height={18} />
          <Skeleton height={12} />
          <Skeleton width="45%" height={12} />
        </View>
      </View>
    </Card>
  );
}

export function TripRowSkeleton() {
  return (
    <Card padded={false}>
      <View style={styles.rowCard}>
        <Skeleton width={92} height={92} radius={radius.lg} />
        <View style={styles.rowBody}>
          <Skeleton width="80%" height={16} />
          <Skeleton width="55%" height={12} />
          <Skeleton width="45%" height={12} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  clip: { borderRadius: radius.xxl, overflow: 'hidden' },
  cover: { height: 196, justifyContent: 'space-between', padding: space.md },
  chipRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  chipText: { color: '#ffffff' },
  destination: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  destinationText: { color: '#ffffff', flexShrink: 1 },
  body: { padding: space.lg, gap: space.sm },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  publisher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xs,
    paddingTop: space.md,
    borderTopWidth: 1,
  },
  publisherText: { flex: 1 },
  rowCard: { flexDirection: 'row', gap: space.md, padding: space.md },
  thumb: { width: 92, height: 92, borderRadius: radius.lg, overflow: 'hidden' },
  rowBody: { flex: 1, justifyContent: 'center', gap: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { flexShrink: 1 },
  rowPublisher: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
});
