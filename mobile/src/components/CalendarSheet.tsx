import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { toIsoDate } from '@/lib/tripBrief';import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function shiftMonth(cursor: string, delta: number): string {
  const [year, month] = cursor.split('-').map(Number);
  const next = new Date(year, month - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

interface CalendarSheetProps {
  visible: boolean;
  value: string;
  minIso: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
}

/** Dependency-free month calendar, so the brief works in Expo Go and on web. */
export function CalendarSheet({ visible, value, minIso, onSelect, onClose }: CalendarSheetProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const [cursor, setCursor] = useState(() => monthKey(value));

  const [year, month] = cursor.split('-').map(Number);
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onShow={() => setCursor(monthKey(value))}
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss calendar"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.card,
              borderColor: palette.border,
              paddingBottom: insets.bottom + space.xl,
            },
          ]}
        >
          <View style={styles.handle} />

          <View style={styles.monthRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              hitSlop={8}
              onPress={() => setCursor(shiftMonth(cursor, -1))}
              style={({ pressed }) => [
                styles.arrow,
                { backgroundColor: palette.muted, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons name="chevron-back" size={16} color={palette.foreground} />
            </Pressable>
            <AppText variant="heading">
              {MONTH_NAMES[month - 1]} {year}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              hitSlop={8}
              onPress={() => setCursor(shiftMonth(cursor, 1))}
              style={({ pressed }) => [
                styles.arrow,
                { backgroundColor: palette.muted, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons name="chevron-forward" size={16} color={palette.foreground} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((label, index) => (
              <AppText
                key={`${label}-${index}`}
                variant="caption"
                tone="muted"
                style={styles.weekday}
              >
                {label}
              </AppText>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((day, index) => {
              if (day === null) {
                return <View key={`blank-${index}`} style={styles.cell} />;
              }

              const iso = `${cursor}-${String(day).padStart(2, '0')}`;
              const disabled = iso < minIso;
              const selected = iso === value;
              const today = iso === toIsoDate(new Date());

              return (
                <View key={iso} style={styles.cell}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${day} ${MONTH_NAMES[month - 1]} ${year}`}
                    accessibilityState={{ selected, disabled }}
                    disabled={disabled}
                    onPress={() => {
                      onSelect(iso);
                      onClose();
                    }}
                    style={({ pressed }) => [
                      styles.day,
                      {
                        backgroundColor: selected ? palette.primary : 'transparent',
                        borderColor: today && !selected ? palette.primary : 'transparent',
                        opacity: disabled ? 0.3 : pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <AppText
                      variant={selected ? 'label' : 'body'}
                      style={{ color: selected ? palette.primaryForeground : palette.foreground }}
                    >
                      {day}
                    </AppText>
                  </Pressable>
                </View>
              );
            })}
          </View>

          <View style={styles.footer}>
            <AppText variant="caption" tone="muted">
              You can change dates after the plan exists.
            </AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onSelect(minIso);
                onClose();
              }}
              hitSlop={6}
            >
              <AppText variant="label" tone="primary">
                Start today
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(127,140,134,0.4)',
    marginBottom: space.md,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  arrow: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: { width: `${100 / 7}%`, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  day: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    marginTop: space.md,
  },
});
