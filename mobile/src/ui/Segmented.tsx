import { Pressable, StyleSheet, View } from 'react-native';

import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';

export interface SegmentItem<T extends string> {
  key: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  items: readonly SegmentItem<T>[];
  value: T;
  onChange: (key: T) => void;
  accessibilityLabel?: string;
}

/** Connected segmented control: one outlined track, the active segment filled. */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedProps<T>) {
  const { palette } = useTheme();

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: palette.card, borderColor: palette.border }]}
    >
      {items.map((item) => {
        const active = item.key === value;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.key)}
            style={({ pressed }) => [
              styles.segment,
              active && { backgroundColor: palette.primary },
              pressed && { opacity: 0.85 },
            ]}
          >
            <AppText
              variant="label"
              numberOfLines={1}
              style={{ color: active ? palette.primaryForeground : palette.foreground }}
            >
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.pill,
    padding: 3,
  },
  segment: {
    flex: 1,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
  },
});
