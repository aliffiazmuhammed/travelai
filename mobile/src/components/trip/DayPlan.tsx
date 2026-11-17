import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { GalleryDay, GalleryRoute, GalleryStay } from '@/api/explore';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Card } from '@/ui';
import { TripPhoto } from './TripPhoto';

/** "Day 2: Arrive and settle in" → "Arrive and settle in". */
export function cleanDayTitle(title: string): string {
  return title.replace(/^day\s*\d+\s*[:\-–]\s*/i, '').trim();
}

const TIME_RE = /(\d{1,2}:\d{2})\s*([AP]M)/i;

/**
 * The rail only has room for a start time, so free-form values such as
 * "Morning (09:00 AM - 12:00 PM)" collapse to "09:00 / AM".
 */
function timeParts(value?: string): { clock: string; meridiem: string } | null {
  if (!value || !value.trim()) return null;
  const match = value.match(TIME_RE);
  if (match) return { clock: match[1], meridiem: match[2].toUpperCase() };
  return { clock: value.trim(), meridiem: '' };
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

function StayRow({ stay, tripId }: { stay: GalleryStay; tripId?: string }) {
  const { palette } = useTheme();
  const detail = [stay.location, stay.vibe || stay.description].filter(Boolean).join(' · ');

  return (
    <View style={[styles.stayBand, { backgroundColor: palette.muted }]}>
      {stay.image ? (
        <TripPhoto
          photo={stay.image}
          tripId={tripId}
          style={[styles.stayPhoto, { backgroundColor: palette.muted }]}
          accessibilityLabel={`${stay.name} photo`}
        />
      ) : (
        <View style={[styles.stayIcon, { backgroundColor: palette.card }]}>
          <Ionicons name="bed-outline" size={16} color={palette.primary} />
        </View>
      )}
      <View style={styles.rowBody}>
        <AppText variant="caption" tone="muted" style={styles.stayEyebrow}>
          STAY
        </AppText>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {stay.name}
        </AppText>
        {detail ? (
          <AppText variant="caption" tone="muted" numberOfLines={2}>
            {detail}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

/**
 * One quiet line for the day's shape: first stop → last stop, then the shared
 * transport note. Place names already appear on the stops, so this is a
 * summary rather than a second copy of the plan.
 */
function DayRouteLine({
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
    <View style={styles.route}>
      {from ? (
        <View style={styles.routeRow}>
          <View style={[styles.routeDot, { backgroundColor: palette.primary }]} />
          <AppText variant="label" numberOfLines={1} style={styles.routePlace}>
            {from}
          </AppText>
          {to ? (
            <>
              <View style={[styles.routeDash, { borderColor: palette.mutedForeground }]} />
              <View style={[styles.routeDot, { backgroundColor: palette.accent }]} />
              <AppText variant="label" numberOfLines={1} style={styles.routePlace}>
                {to}
              </AppText>
            </>
          ) : null}
        </View>
      ) : null}

      {transport ? (
        <View style={styles.routeMetaRow}>
          <Ionicons name="bus-outline" size={13} color={palette.mutedForeground} />
          <AppText variant="caption" tone="muted" numberOfLines={2} style={styles.routeMetaText}>
            {transport}
          </AppText>
        </View>
      ) : null}

      {routes.map((route) => (
        <View key={`${route.name}-${route.day ?? 'any'}`} style={styles.routeMetaRow}>
          <Ionicons name="navigate-outline" size={12} color={palette.mutedForeground} />
          <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.routeMetaText}>
            {route.name}
            {route.distanceKm > 0 ? ` · ${route.distanceKm.toFixed(1)} km` : ''}
            {route.mode ? ` · ${route.mode}` : ''}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/**
 * One day of the plan as a time rail: the start time sits in a left gutter and
 * the stops share hairline dividers instead of one bordered card each, so a
 * four-stop day reads as a single schedule rather than a stack of boxes.
 *
 * Uncontrolled by default (first day open); the trip page controls `open` so
 * the day chips can switch which sheet is showing.
 */
export function DayCard({
  day,
  routes,
  first,
  tripId,
  open: openProp,
  onToggle,
}: {
  day: GalleryDay;
  routes: GalleryRoute[];
  first: boolean;
  /** Member context: enables the authenticated photo route. */
  tripId?: string;
  open?: boolean;
  onToggle?: () => void;
}) {
  const { palette } = useTheme();
  const [selfOpen, setSelfOpen] = useState(first);
  const open = openProp ?? selfOpen;
  const toggle = () => {
    setSelfOpen((value) => !value);
    onToggle?.();
  };
  const title = cleanDayTitle(day.title);
  const stopCount = day.activities.length;
  const places = day.activities
    .map((activity) => activity.location?.trim() ?? '')
    .filter((location) => location.length > 0)
    .filter((location, index, all) => all.indexOf(location) === index);
  const dayRoutes = routes.filter((route) => route.day === day.day);

  return (
    <Card style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Day ${day.day}${title ? `: ${title}` : ''}`}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={toggle}
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
      >
        <View style={styles.headerText}>
          <AppText variant="caption" tone="primary" style={styles.dayEyebrow}>
            DAY {day.day}
          </AppText>
          <AppText variant="heading" numberOfLines={open ? 2 : 1}>
            {title || `Day ${day.day}`}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {stopCount > 0 ? `${stopCount} ${stopCount === 1 ? 'stop' : 'stops'}` : 'A day to wander'}
            {places.length > 1 ? ` · ${places[0]} to ${places[places.length - 1]}` : ''}
            {day.permit_required ? ' · Permit needed' : ''}
          </AppText>
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={palette.mutedForeground}
        />
      </Pressable>

      {open ? (
        <>
          <DayRouteLine day={day} routes={dayRoutes} places={places} />

          {day.activities.length > 0 ? (
            <View style={styles.rail}>
              {day.activities.map((activity, index) => {
                const time = timeParts(activity.time);
                const isFirst = index === 0;
                const isLast = index === day.activities.length - 1;
                return (
                  <View
                    key={`${activity.name}-${index}`}
                    style={[
                      styles.stop,
                      !isFirst && {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: palette.border,
                      },
                    ]}
                  >
                    <View style={styles.timeCol}>
                      {time ? (
                        <>
                          <AppText variant="caption" style={styles.clock} numberOfLines={1}>
                            {time.clock}
                          </AppText>
                          {time.meridiem ? (
                            <AppText variant="caption" tone="muted" style={styles.meridiem}>
                              {time.meridiem}
                            </AppText>
                          ) : null}
                        </>
                      ) : null}
                    </View>

                    <View style={styles.track}>
                      <View
                        style={[
                          styles.trackLine,
                          {
                            backgroundColor: palette.border,
                            top: isFirst ? 16 : 0,
                            ...(isLast ? { height: 10 } : { bottom: 0 }),
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.stopDot,
                          {
                            borderColor: isLast ? palette.accent : palette.primary,
                            backgroundColor: palette.card,
                          },
                        ]}
                      />
                    </View>

                    <View style={styles.stopBody}>
                      <AppText variant="bodyStrong" numberOfLines={2}>
                        {activity.name}
                      </AppText>
                      {activity.location ? (
                        <AppText variant="caption" tone="muted" numberOfLines={1}>
                          {activity.location}
                        </AppText>
                      ) : null}
                      {activity.description ? (
                        <AppText
                          variant="caption"
                          tone="muted"
                          numberOfLines={2}
                          style={styles.stopDesc}
                        >
                          {activity.description}
                        </AppText>
                      ) : null}
                    </View>

                    {activity.image ? (
                      <TripPhoto
                        photo={activity.image}
                        tripId={tripId}
                        style={[styles.thumb, { backgroundColor: palette.muted }]}
                        accessibilityLabel={`${activity.name} photo`}
                      />
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          {day.stay_recommendations.length > 0 ? (
            <View style={styles.section}>
              {day.stay_recommendations.map((stay, index) => (
                <StayRow key={`${stay.name}-${index}`} stay={stay} tripId={tripId} />
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
                    <Ionicons
                      name="restaurant-outline"
                      size={11}
                      color={palette.mutedForeground}
                    />
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
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerPressed: { opacity: 0.7 },
  headerText: { flex: 1, gap: 2 },
  dayEyebrow: { letterSpacing: 1.2, fontSize: 11 },
  route: { gap: 5, marginTop: -2 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  routeDot: { width: 6, height: 6, borderRadius: radius.pill },
  routePlace: { flexShrink: 1 },
  routeDash: { flex: 1, borderBottomWidth: 1, borderStyle: 'dashed', marginHorizontal: 2 },
  routeMetaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  routeMetaText: { flex: 1, lineHeight: 16 },
  rail: { marginTop: -4 },
  stop: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: space.sm },
  timeCol: { width: 46, alignItems: 'flex-end', paddingTop: 1 },
  clock: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
  meridiem: { fontSize: 8, letterSpacing: 1 },
  track: { width: 16, alignSelf: 'stretch' },
  trackLine: { position: 'absolute', left: 7, width: 1 },
  stopDot: {
    position: 'absolute',
    left: 3,
    top: 7,
    width: 9,
    height: 9,
    borderRadius: radius.pill,
    borderWidth: 2,
  },
  stopBody: { flex: 1, gap: 2 },
  stopDesc: { lineHeight: 17 },
  section: { gap: space.sm },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  labelTick: { width: 12, height: 2, borderRadius: radius.pill },
  label: { letterSpacing: 0.8, fontSize: 11 },
  rowBody: { flex: 1, gap: 3, justifyContent: 'center' },
  stayBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.xl,
    padding: space.md,
  },
  stayPhoto: { width: 44, height: 44, borderRadius: radius.md },
  stayIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stayEyebrow: { letterSpacing: 1.1, fontSize: 10 },
  thumb: { width: 44, height: 44, borderRadius: radius.md },
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
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  tipText: { lineHeight: 18 },
});
