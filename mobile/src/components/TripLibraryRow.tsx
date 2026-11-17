import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import type { MyTripSummary, TripStatus } from '@/api/trips';
import {
  ROLE_LABEL,
  TRIP_STATUS_LABEL,
  formatTripDates,
  tripDestination,
  tripTitle,
} from '@/lib/personalTrip';
import { tripCoverUrl } from '@/lib/tripCover';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, ListRow, Skeleton } from '@/ui';

function statusColor(status: TripStatus, palette: ReturnType<typeof useTheme>['palette']) {
  switch (status) {
    case 'ongoing':
      return palette.primary;
    case 'draft':
    case 'completed':
      return palette.mutedForeground;
    default:
      return palette.accent;
  }
}

interface TripLibraryRowProps {
  trip: MyTripSummary;
  onPress?: () => void;
}

/** Library row: a small cover, the place and dates, then where it stands. */
export function TripLibraryRow({ trip, onPress }: TripLibraryRowProps) {
  const { palette } = useTheme();
  const title = tripTitle(trip);
  const status = trip.status ?? 'planned';
  const role = trip.role && trip.role !== 'owner' ? trip.role : null;
  const members = trip.members?.length ?? 0;
  const people = members > 1 ? `${members} travellers` : null;
  const party = role ? `${ROLE_LABEL[role]}${people ? ` · ${people}` : ''}` : people;
  const subtitle = [formatTripDates(trip.startDate, trip.endDate), party]
    .filter(Boolean)
    .join(' · ');

  return (
    <ListRow
      leading={
        <View style={[styles.thumb, { backgroundColor: palette.muted }]}>
          <Image
            source={{ uri: tripCoverUrl(tripDestination(trip) || title, 240) }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
          />
        </View>
      }
      title={title}
      subtitle={subtitle}
      right={
        <View style={[styles.pill, { backgroundColor: palette.muted }]}>
          <View style={[styles.dot, { backgroundColor: statusColor(status, palette) }]} />
          <AppText variant="caption" numberOfLines={1} style={styles.pillText}>
            {TRIP_STATUS_LABEL[status]}
          </AppText>
        </View>
      }
      accessibilityLabel={`${title}, ${subtitle}`}
      onPress={onPress}
    />
  );
}

export function TripLibraryRowSkeleton() {
  return (
    <View style={styles.skeletonRow}>
      <Skeleton width={52} height={52} radius={radius.lg} />
      <View style={styles.skeletonBody}>
        <Skeleton width="70%" height={16} />
        <Skeleton width="45%" height={12} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 52, height: 52, borderRadius: radius.lg, overflow: 'hidden' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  pillText: { fontSize: 10, lineHeight: 14 },
  dot: { width: 5, height: 5, borderRadius: radius.pill },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  skeletonBody: { flex: 1, gap: space.sm },
});
