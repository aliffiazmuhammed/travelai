import { Pressable, StyleSheet, View } from 'react-native';

import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button, Sheet } from '@/ui';

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
  confirmLabel?: string;
}

/**
 * One bottom sheet for every Explore filter, so the list stays at the top of
 * the screen instead of carrying a row of dropdown pills. Long facet lists
 * scroll inside the sheet rather than pushing the footer off-screen.
 */
export function FilterSheet({
  visible,
  title,
  sections,
  onChange,
  onClose,
  onReset,
  confirmLabel = 'Show trips',
}: FilterSheetProps) {
  const { palette } = useTheme();
  const anyActive = sections.some((section) => Boolean(section.value));

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      dismissLabel="Dismiss filters"
      closeLabel="Close filters"
      bodyStyle={styles.sections}
      footer={
        <>
          {anyActive && onReset ? (
            <Button label="Clear all" variant="ghost" size="sm" onPress={onReset} />
          ) : null}
          <Button label={confirmLabel} size="sm" style={styles.done} onPress={onClose} />
        </>
      }
    >
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
    </Sheet>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  sections: { maxHeight: 340 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  option: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  done: { flex: 1 },
});
