import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';

interface SectionHeaderProps {
  title: string;
  caption?: string;
  /** A quiet text action on the right, e.g. "See all". */
  action?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({ title, caption, action, style }: SectionHeaderProps) {
  const { palette } = useTheme();

  return (
    <View style={[styles.row, style]}>
      <View style={styles.text}>
        <AppText variant="heading">{title}</AppText>
        {caption ? (
          <AppText variant="caption" tone="muted">
            {caption}
          </AppText>
        ) : null}
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hitSlop={8}
          onPress={action.onPress}
        >
          <AppText variant="label" style={{ color: palette.primary }}>
            {action.label}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  text: { flex: 1, gap: 2 },
});
