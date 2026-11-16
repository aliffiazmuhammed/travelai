import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamily, radius, shadows, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export type NavTab = 'explore' | 'trips' | 'chat' | 'profile';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type TabSpec = { key: NavTab; label: string; icon: IoniconName; activeIcon: IoniconName };

const LEFT_TABS: readonly TabSpec[] = [
  { key: 'explore', label: 'Explore', icon: 'compass-outline', activeIcon: 'compass' },
  { key: 'trips', label: 'Trips', icon: 'map-outline', activeIcon: 'map' },
];

const RIGHT_TABS: readonly TabSpec[] = [
  { key: 'chat', label: 'Chat', icon: 'chatbubble-ellipses-outline', activeIcon: 'chatbubble-ellipses' },
  { key: 'profile', label: 'You', icon: 'person-outline', activeIcon: 'person' },
];

interface NavShellProps {
  active: NavTab;
  onSelect: (tab: NavTab) => void;
  onCreatePress?: () => void;
  chatBadge?: number;
}

/** Floating pill nav from the approved hybrid: four destinations around a raised create button. */
export function NavShell({ active, onSelect, onCreatePress, chatBadge = 0 }: NavShellProps) {
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
        <View>
          <Ionicons name={selected ? tab.activeIcon : tab.icon} size={21} color={color} />
          {tab.key === 'chat' && chatBadge > 0 ? (
            <View style={[styles.badge, { backgroundColor: palette.accent, borderColor: palette.card }]}>
              <Text style={[styles.badgeText, { color: palette.accentForeground }]}>
                {chatBadge > 9 ? '9+' : chatBadge}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.tabLabel, { color }]}>{tab.label}</Text>
      </Pressable>
    );
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, space.md) }]}
    >
      <View style={styles.stack}>
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
          <View style={styles.createSlot} />
          {RIGHT_TABS.map(renderTab)}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create a trip"
          onPress={onCreatePress}
          style={({ pressed }) => [
            styles.create,
            {
              backgroundColor: palette.accent,
              borderColor: palette.card,
              shadowColor: palette.accent,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Ionicons name="add" size={28} color={palette.accentForeground} />
        </Pressable>
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
  stack: { position: 'relative' },
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
  createSlot: { width: 58 },
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
  badge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 9,
    lineHeight: 11,
  },
  create: {
    position: 'absolute',
    top: -22,
    left: '50%',
    marginLeft: -27,
    width: 54,
    height: 54,
    borderRadius: radius.pill,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
});
