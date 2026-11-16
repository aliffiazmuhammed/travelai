import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import type { GalleryDay, GalleryRoute, GalleryStay } from '@/api/explore';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Card } from '@/ui';

/** "Day 2: Arrive and settle in" → "Arrive and settle in". */
export function cleanDayTitle(title: string): string {
  return title.replace(/^day\s*\d+\s*[:\-–]\s*/i, '').trim();
}

function DayLabel({ children }: { children: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.labelRow}>
      <View style={[styles.labelTick, { backgroundColor: palette.accent }]} />
      <AppText variant="caption" tone="muted" style={styles.label}>
        {children}
      </AppText>
    </View>
  );
}

function StayRow({ stay }: { stay: GalleryStay }) {
  const { palette } = useTheme();
  const detail = [stay.location, stay.vibe || stay.description].filter(Boolean).join(' · ');

  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: palette.muted }]}>
        <Ionicons name="bed-outline" size={15} color={palette.primary} />
      </View>
      <View style={styles.rowBody}>
        <AppText variant="label">{stay.name}</AppText>
        {detail ? (
          <AppText variant="caption" tone="muted">
            {detail}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The in-day "map treatment" from concept B, without a map SDK: the day's
 * first-to-last activity location, the shared transport note, and the distance
 * of any route the owner drew for that day.
 */
function DayRouteBand({
  day,
  routes,
  places,
}: {
  day: GalleryDay;
  routes: GalleryRoute[];
  places: string[];
}) {
  const { palette } = useTheme();
  const from = places[0] ?? null;
  const to = places.length > 1 ? places[places.length - 1] : null;
  const transport = day.transport[0] ?? null;

  if (!from && !transport && routes.length === 0) return null;

  return (
    <View
      style={[
        styles.routeBand,
        { backgroundColor: `${palette.primary}0A`, borderColor: palette.border },
      ]}
    >
      {from ? (
        <View style={styles.routeRow}>
          <View style={[styles.routeDot, { backgroundColor: palette.primary }]} />
          <AppText variant="label" numberOfLines={1} style={styles.routePlace}>
            {from}
          </AppText>
          {to ? (
            <>
              <View style={[styles.routeLine, { borderColor: palette.mutedForeground }]} />
              <View style={[styles.routeDot, { backgroundColor: palette.accent }]} />
              <AppText variant="label" numberOfLines={1} style={styles.routePlace}>
                {to}
              </AppText>
            </>
          ) : null}
        </View>
      ) : null}

      {transport ? (
        <View style={styles.routeMeta}>
          <Ionicons name="bus-outline" size={13} color={palette.mutedForeground} />
          <AppText variant="caption" tone="muted" style={styles.routeMetaText}>
            {transport}
          </AppText>
        </View>
      ) : null}

      {routes.map((route) => (
        <View key={`${route.name}-${route.day ?? 'any'}`} style={styles.routeMeta}>
          <Ionicons name="navigate-outline" size={13} color={palette.mutedForeground} />
          <AppText variant="caption" tone="muted" style={styles.routeMetaText}>
            {route.name}
            {route.distanceKm > 0 ? ` · ${route.distanceKm.toFixed(1)} km` : ''}
            {route.mode ? ` · ${route.mode}` : ''}
          </AppText>
        </View>
      ))}
    </View>
  );
}

export function DayCard({
  day,
  routes,
  first,
}: {
  day: GalleryDay;
  routes: GalleryRoute[];
  first: boolean;
}) {
  const { palette } = useTheme();
  const title = cleanDayTitle(day.title);
  const places = day.activities
    .map((activity) => activity.location?.trim() ?? '')
    .filter((location) => location.length > 0)
    .filter((location, index, all) => all.indexOf(location) === index);
  const dayRoutes = routes.filter((route) => route.day === day.day);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View
          style={[
            styles.dayBadge,
            {
              backgroundColor: first ? palette.primary : palette.muted,
              borderColor: first ? palette.primary : palette.border,
            },
          ]}
        >
          <AppText
            variant="label"
            style={{ color: first ? palette.primaryForeground : palette.primary }}
          >
            {day.day}
          </AppText>
        </View>
        <View style={styles.headerText}>
          <AppText variant="heading">Day {day.day}</AppText>
          {title ? (
            <AppText tone="muted" numberOfLines={2}>
              {title}
            </AppText>
          ) : null}
        </View>
        {day.permit_required ? (
          <View style={[styles.permit, { backgroundColor: `${palette.accent}1F` }]}>
            <Ionicons name="ticket-outline" size={12} color={palette.accent} />
            <AppText variant="caption" style={{ color: palette.accent }}>
              Permit
            </AppText>
          </View>
        ) : null}
      </View>

      <DayRouteBand day={day} routes={dayRoutes} places={places} />

      {day.activities.length > 0 ? (
        <View style={styles.section}>
          {day.activities.map((activity, index) => (
            <View key={`${activity.name}-${index}`} style={styles.activity}>
              <View style={styles.timeColumn}>
                {activity.time ? (
                  <View style={[styles.timePill, { backgroundColor: palette.muted }]}>
                    <AppText variant="caption" tone="primary" style={styles.timeText}>
                      {activity.time}
                    </AppText>
                  </View>
                ) : (
                  <View style={[styles.activityDot, { backgroundColor: palette.primary }]} />
                )}
              </View>
              <View style={styles.rowBody}>
                <AppText variant="bodyStrong">{activity.name}</AppText>
                {activity.description ? (
                  <AppText variant="caption" tone="muted" style={styles.description}>
                    {activity.description}
                  </AppText>
                ) : null}
                {activity.location ? (
                  <View style={styles.locationRow}>
                    <Ionicons name="location-outline" size={12} color={palette.mutedForeground} />
                    <AppText variant="caption" tone="muted">
                      {activity.location}
                    </AppText>
                  </View>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {day.stay_recommendations.length > 0 ? (
        <View style={styles.section}>
          <DayLabel>WHERE YOU SLEEP</DayLabel>
          {day.stay_recommendations.map((stay, index) => (
            <StayRow key={`${stay.name}-${index}`} stay={stay} />
          ))}
        </View>
      ) : null}

      {day.food_spots.length > 0 ? (
        <View style={styles.section}>
          <DayLabel>WHAT YOU EAT</DayLabel>
          <View style={styles.chips}>
            {day.food_spots.map((spot, index) => (
              <View
                key={`${spot}-${index}`}
                style={[styles.foodChip, { backgroundColor: palette.muted }]}
              >
                <Ionicons name="restaurant-outline" size={11} color={palette.mutedForeground} />
                <AppText variant="caption">{spot}</AppText>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {day.pro_tip.length > 0 ? (
        <View
          style={[
            styles.tip,
            { backgroundColor: `${palette.secondary}26`, borderColor: palette.border },
          ]}
        >
          <Ionicons name="bulb-outline" size={16} color={palette.primary} />
          <View style={styles.rowBody}>
            {day.pro_tip.map((tip, index) => (
              <AppText key={`${tip}-${index}`} variant="caption" style={styles.tipText}>
                {tip}
              </AppText>
            ))}
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  dayBadge: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 2 },
  permit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  routeBand: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
    gap: space.sm,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  routeDot: { width: 7, height: 7, borderRadius: radius.pill },
  routePlace: { flexShrink: 1 },
  routeLine: { flex: 1, borderBottomWidth: 1, borderStyle: 'dashed', marginHorizontal: 2 },
  routeMeta: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  routeMetaText: { flex: 1, lineHeight: 17 },
  section: { gap: space.sm },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  labelTick: { width: 12, height: 2, borderRadius: radius.pill },
  label: { letterSpacing: 1, fontSize: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 2 },
  activity: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  timeColumn: { width: 54, alignItems: 'flex-start', paddingTop: 2 },
  timePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  timeText: { fontSize: 11, lineHeight: 15 },
  activityDot: { width: 7, height: 7, borderRadius: radius.pill, marginTop: 7, marginLeft: 6 },
  description: { lineHeight: 18 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  foodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  tipText: { lineHeight: 18 },
});
