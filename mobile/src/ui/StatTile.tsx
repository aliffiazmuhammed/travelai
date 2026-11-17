import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';
import { Card } from './Card';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface StatTileProps {
  icon: IconName;
  value: string;
  label: string;
  /** Small accent count in the corner, e.g. unread messages. */
  badge?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A half-width tile for the few numbers a screen wants to show above its
 * content. The value carries the message; the icon and badge only orient it.
 */
export function StatTile({
  icon,
  value,
  label,
  badge,
  onPress,
  accessibilityLabel,
  style,
}: StatTileProps) {
  const { palette } = useTheme();

  return (
    <Card
      padded={false}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={[styles.tile, style]}
    >
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: palette.muted }]}>
          <Ionicons name={icon} size={15} color={palette.primary} />
        </View>
        {badge && badge > 0 ? (
          <View style={[styles.badge, { backgroundColor: palette.accent }]}>
            <AppText variant="label" style={[styles.badgeText, { color: palette.accentForeground }]}>
              {badge}
            </AppText>
          </View>
        ) : null}
      </View>
      <AppText variant="bodyStrong" numberOfLines={1} style={styles.value}>
        {value}
      </AppText>
      <AppText variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    padding: space.md,
    gap: 3,
    borderRadius: radius.xl,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  icon: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 12, lineHeight: 16 },
  value: { fontSize: 15, letterSpacing: -0.2, marginTop: 2 },
});
