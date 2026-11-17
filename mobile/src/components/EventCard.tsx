import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import type { PublicEventSummary } from '@/api/events';
import { formatMoney } from '@/lib/expenses';
import { assetUrl } from '@/config';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Card } from '@/ui';

export const EVENT_KIND_LABEL: Record<string, string> = {
  camp: 'Camp',
  group_trip: 'Group trip',
  retreat: 'Retreat',
  other: 'Event',
};

interface EventCardProps {
  event: PublicEventSummary;
  onPress?: () => void;
}

/** Rail card for the Explore “On the calendar” strip. */
export function EventCard({ event, onPress }: EventCardProps) {
  const { palette } = useTheme();
  const glass = { backgroundColor: 'rgba(17,32,27,0.55)' };

  return (
    <Card
      padded={false}
      onPress={onPress}
      style={styles.card}
      accessibilityLabel={`Open event ${event.title}`}
    >
      <View style={styles.clip}>
        <View style={[styles.cover, { backgroundColor: palette.muted }]}>
          {event.coverUrl ? (
            <Image
              source={{ uri: assetUrl(event.coverUrl) }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={250}
            />
          ) : (
            <View style={styles.coverFallback}>
              <Ionicons name="calendar-outline" size={26} color={palette.mutedForeground} />
            </View>
          )}
          <LinearGradient
            colors={['rgba(12,26,21,0)', 'rgba(12,26,21,0.55)']}
            locations={[0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.chipRow}>
            <View style={[styles.chip, glass]}>
              <AppText variant="caption" style={styles.chipText}>
                {EVENT_KIND_LABEL[event.kind] ?? 'Event'}
              </AppText>
            </View>
            {event.spotsLeft === 0 ? (
              <View style={[styles.chip, glass]}>
                <AppText variant="caption" style={styles.chipText}>
                  Full
                </AppText>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.body}>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {event.title}
          </AppText>
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={12} color={palette.mutedForeground} />
            <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.metaText}>
              {event.dates.label}
            </AppText>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={12} color={palette.mutedForeground} />
            <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.metaText}>
              {event.destination}
              {event.venue ? ` · ${event.venue}` : ''}
            </AppText>
          </View>
          <View style={styles.foot}>
            <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.metaText}>
              {event.agency.name}
            </AppText>
            {event.pricePerPerson != null ? (
              <AppText variant="caption" tone="primary">
                {formatMoney(event.pricePerPerson, event.currency)}
              </AppText>
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

/** Same silhouette as the real card while the strip loads. */
export function EventCardSkeleton() {
  const { palette } = useTheme();
  return (
    <Card padded={false} style={styles.card}>
      <View style={styles.clip}>
        <View style={[styles.cover, { backgroundColor: palette.muted }]} />
        <View style={styles.body}>
          <View style={styles.metaRow}>
            <View
              style={{ height: 14, width: '80%', borderRadius: 6, backgroundColor: palette.muted }}
            />
          </View>
          <View style={styles.metaRow}>
            <View
              style={{ height: 10, width: '55%', borderRadius: 5, backgroundColor: palette.muted }}
            />
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { width: 268 },
  clip: { borderRadius: radius.xxl, overflow: 'hidden' },
  cover: { height: 116, justifyContent: 'flex-start', padding: space.md },
  coverFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  chipText: { color: '#ffffff' },
  body: { padding: space.md, gap: 5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { flexShrink: 1 },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    marginTop: 2,
  },
});
