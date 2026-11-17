import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconColor?: string;
  /** A custom leading element (photo, avatar) in place of the icon bubble. */
  leading?: ReactNode;
  /** Replaces the default chevron on the right. */
  right?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Set false for a row that navigates nowhere. */
  showChevron?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The quiet two-line row most screens are made of. Rows are padded so they
 * drop straight into a Card or a ListGroup without extra wrappers.
 */
export function ListRow({
  title,
  subtitle,
  icon,
  iconColor,
  leading,
  right,
  onPress,
  accessibilityLabel,
  showChevron = true,
  style,
}: ListRowProps) {
  const { palette } = useTheme();
  const content = (
    <>
      {leading ??
        (icon ? (
          <View style={[styles.icon, { backgroundColor: palette.muted }]}>
            <Ionicons name={icon} size={17} color={iconColor ?? palette.primary} />
          </View>
        ) : null)}
      <View style={styles.body}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" tone="muted" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ??
        (onPress && showChevron ? (
          <Ionicons name="chevron-forward" size={16} color={palette.mutedForeground} />
        ) : null)}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, style]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
  },
  pressed: { opacity: 0.92 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
});
