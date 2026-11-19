import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';

interface InlineErrorProps {
  message?: string | null;
}

export function InlineError({ message }: InlineErrorProps) {
  const { palette } = useTheme();
  if (!message) return null;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: `${palette.destructive}14` }]}
    >
      <Ionicons name="alert-circle-outline" size={18} color={palette.destructive} />
      <AppText variant="caption" tone="danger" style={styles.text}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
  },
  text: { flex: 1, lineHeight: 18 },
});
