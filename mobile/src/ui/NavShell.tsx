import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamily, radius, shadows, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export type NavTab = 'explore' | 'trips' | 'profile';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type TabSpec = { key: NavTab; label: string; icon: IoniconName; activeIcon: IoniconName };

const LEFT_TABS: readonly TabSpec[] = [
  { key: 'explore', label: 'Explore', icon: 'compass-outline', activeIcon: 'compass' },
  { key: 'trips', label: 'Trips', icon: 'map-outline', activeIcon: 'map' },
];

const RIGHT_TABS: readonly TabSpec[] = [
  { key: 'profile', label: 'You', icon: 'person-outline', activeIcon: 'person' },
];

interface NavShellProps {
  active: NavTab;
  onSelect: (tab: NavTab) => void;
  onCreatePress?: () => void;
}

/** Floating pill nav: three destinations with the create action sitting among them. */
export function NavShell({ active, onSelect, onCreatePress }: NavShellProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();

  const renderTab = (tab: TabSpec) => {
    const selected = tab.key === active;
    const color = selected ? palette.primary : palette.mutedForeground;

    return (
      <Pressable
        key={tab.key}
        accessibilityRole="button"
        accessibilityLabel={tab.label}
        accessibilityState={{ selected }}
        onPress={() => onSelect(tab.key)}
        style={({ pressed }) => [
          styles.tab,
          selected && { backgroundColor: palette.muted },
          pressed && { opacity: 0.72 },
        ]}
      >
        <Ionicons name={selected ? tab.activeIcon : tab.icon} size={21} color={color} />
        <Text style={[styles.tabLabel, { color }]}>{tab.label}</Text>
      </Pressable>
    );
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, space.md) }]}
    >
      <View
        style={[
          styles.bar,
          {
            backgroundColor: palette.card,
            borderColor: palette.border,
            shadowColor: palette.shadow,
          },
        ]}
      >
        {LEFT_TABS.map(renderTab)}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Plan a trip"
          onPress={onCreatePress}
          style={({ pressed }) => [
            styles.create,
            {
              backgroundColor: palette.accent,
              shadowColor: palette.accent,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Ionicons name="add" size={18} color={palette.accentForeground} />
          <Text style={[styles.createLabel, { color: palette.accentForeground }]}>Plan</Text>
        </Pressable>
        {RIGHT_TABS.map(renderTab)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
  },
  bar: {
    height: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    ...shadows.card,
  },
  tab: {
    width: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  tabLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.2,
  },
  create: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  createLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
});
