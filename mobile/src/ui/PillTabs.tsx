import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';

export interface PillTabItem<T extends string> {
  key: T;
  label: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
}

interface PillTabsProps<T extends string> {
  items: readonly PillTabItem<T>[];
  value: T;
  onChange: (key: T) => void;
}

export function PillTabs<T extends string>({ items, value, onChange }: PillTabsProps<T>) {
  const { palette } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {items.map((item) => {
        const active = item.key === value;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.key)}
            style={({ pressed }) => [
              styles.pill,
              {
                backgroundColor: active ? palette.primary : palette.card,
                borderColor: active ? palette.primary : palette.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            {item.icon ? (
              <Ionicons
                name={item.icon}
                size={15}
                color={active ? palette.primaryForeground : palette.mutedForeground}
              />
            ) : null}
            <AppText
              variant="label"
              style={{ color: active ? palette.primaryForeground : palette.foreground }}
            >
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
