import Ionicons from '@expo/vector-icons/Ionicons';
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
import { AppText, Card, Skeleton } from '@/ui';

function statusColor(status: TripStatus | undefined, palette: ReturnType<typeof useTheme>['palette']) {
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

interface TripLibraryCardProps {
  trip: MyTripSummary;
  shared?: boolean;
  onPress?: () => void;
}

/** Scannable library row: the photo and title lead, the role and status follow. */
export function TripLibraryCard({ trip, shared = false, onPress }: TripLibraryCardProps) {
  const { palette } = useTheme();
  const title = tripTitle(trip);
  const destination = tripDestination(trip);
  const status = trip.status ?? 'planned';
  const role = trip.role && trip.role !== 'owner' ? trip.role : null;
  const members = trip.members?.length ?? 0;

  return (
    <Card padded={false} onPress={onPress}>
      <View style={styles.clip}>
        <View style={styles.row}>
          <View style={[styles.cover, { backgroundColor: palette.muted }]}>
            <Image
              source={{ uri: tripCoverUrl(destination || title, 320) }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={200}
            />
          </View>

          <View style={styles.body}>
            <View style={styles.topLine}>
              <View style={[styles.statusChip, { backgroundColor: palette.muted }]}>
                <View style={[styles.dot, { backgroundColor: statusColor(status, palette) }]} />
                <AppText variant="caption" style={styles.statusText}>
                  {TRIP_STATUS_LABEL[status]}
                </AppText>
              </View>
              {shared && role ? (
                <View style={[styles.sharedChip, { backgroundColor: `${palette.primary}12` }]}>
                  <Ionicons name="people-outline" size={11} color={palette.primary} />
                  <AppText variant="caption" tone="primary" style={styles.statusText}>
                    {ROLE_LABEL[role]}
                  </AppText>
                </View>
              ) : null}
            </View>

            <AppText variant="heading" numberOfLines={2}>
              {title}
            </AppText>

            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={12} color={palette.mutedForeground} />
              <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.metaText}>
                {formatTripDates(trip.startDate, trip.endDate)}
              </AppText>
            </View>

            {shared || members > 1 ? (
              <AppText variant="caption" tone="muted" numberOfLines={1}>
                {shared
                  ? `Shared with you by another traveller${members > 1 ? ` · ${members} people` : ''}`
                  : `${members} travellers`}
              </AppText>
            ) : null}
          </View>

          <Ionicons name="chevron-forward" size={18} color={palette.mutedForeground} />
        </View>
      </View>
    </Card>
  );
}

export function TripLibraryCardSkeleton() {
  return (
    <Card padded={false}>
      <View style={styles.clip}>
        <View style={styles.row}>
          <Skeleton width={96} height={96} radius={0} />
          <View style={[styles.body, styles.skeletonBody]}>
            <Skeleton width="35%" height={12} />
            <Skeleton width="80%" height={18} />
            <Skeleton width="55%" height={12} />
            <Skeleton width="45%" height={12} />
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  clip: { borderRadius: radius.xxl, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingRight: space.md,
  },
  cover: { width: 96, alignSelf: 'stretch', minHeight: 112, overflow: 'hidden' },
  body: { flex: 1, gap: 4, paddingVertical: space.md },
  skeletonBody: { paddingVertical: space.md },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  sharedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  statusText: { fontSize: 10, lineHeight: 14 },
  dot: { width: 5, height: 5, borderRadius: radius.pill },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { flexShrink: 1 },
});
