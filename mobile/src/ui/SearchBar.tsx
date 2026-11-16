import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { radius, typography } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

interface SearchBarProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  accessibilityLabel?: string;
}

/** Rounded search field with a leading icon and a clear affordance. */
export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Where are you headed?',
  accessibilityLabel = 'Search shared trips',
}: SearchBarProps) {
  const { palette } = useTheme();

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: palette.card, borderColor: palette.border, shadowColor: palette.shadow },
      ]}
    >
      <Ionicons name="search" size={17} color={palette.mutedForeground} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.mutedForeground}
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={[typography.body, styles.input, { color: palette.foreground }]}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
          onPress={() => onChangeText('')}
          style={({ pressed }) => [
            styles.clear,
            { backgroundColor: palette.muted, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="close" size={13} color={palette.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  input: { flex: 1, paddingVertical: 0 },
  clear: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
