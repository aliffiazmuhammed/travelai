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
  onPress?: () => void;
}

/**
 * People-led gallery card: the photo leads, then the plan, then who is holding
 * it. The whole card opens the trip page once a handler is supplied.
 */
export function TripCard({ trip, past = false, onPress }: TripCardProps) {
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
});
