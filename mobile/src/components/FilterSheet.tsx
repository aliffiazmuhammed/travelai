import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button } from '@/ui';

export interface FilterSheetOption {
  value: string;
  label: string;
}

export interface FilterSheetSection {
  key: string;
  label: string;
  /** The first option is the "no choice" value, i.e. empty string. */
  options: readonly FilterSheetOption[];
  value: string;
}

interface FilterSheetProps {
  visible: boolean;
  title: string;
  sections: readonly FilterSheetSection[];
  onChange: (key: string, value: string) => void;
  onClose: () => void;
  onReset?: () => void;
}

/**
 * One bottom sheet for every Explore filter, so the list stays at the top of
 * the screen instead of carrying a row of dropdown pills.
 */
export function FilterSheet({
  visible,
  title,
  sections,
  onChange,
  onClose,
  onReset,
}: FilterSheetProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const anyActive = sections.some((section) => Boolean(section.value));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss filters"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.card,
              borderColor: palette.border,
              paddingBottom: insets.bottom + space.lg,
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <AppText variant="heading">{title}</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close filters"
              hitSlop={8}
              onPress={onClose}
              style={[styles.close, { backgroundColor: palette.muted }]}
            >
              <Ionicons name="close" size={16} color={palette.foreground} />
            </Pressable>
          </View>

          {sections.map((section) => (
            <View key={section.key} style={styles.section}>
              <AppText variant="label" tone="muted">
                {section.label}
              </AppText>
              <View style={styles.options}>
                {section.options.map((option) => {
                  const active = option.value === section.value;
                  return (
                    <Pressable
                      key={option.value || 'any'}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => onChange(section.key, option.value)}
                      style={({ pressed }) => [
                        styles.option,
                        {
                          backgroundColor: active ? palette.primary : palette.muted,
                          borderColor: active ? palette.primary : 'transparent',
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}
                    >
                      <AppText
                        variant="label"
                        style={{ color: active ? palette.primaryForeground : palette.foreground }}
                      >
                        {option.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

          <View style={styles.footer}>
            {anyActive && onReset ? (
              <Button label="Clear all" variant="ghost" size="sm" onPress={onReset} />
            ) : null}
            <Button label="Show trips" size="sm" style={styles.done} onPress={onClose} />
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
    gap: space.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(127,140,134,0.4)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { gap: space.sm },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  option: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  done: { flex: 1 },
});
