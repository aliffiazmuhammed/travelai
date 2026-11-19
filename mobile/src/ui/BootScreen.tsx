import { StyleSheet, View } from 'react-native';

import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';
import { Skeleton } from './Skeleton';

/** Branded hold while the stored session is checked. */
export function BootScreen() {
  const { palette } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <AppText variant="wordmarkLarge" tone="primary">
        waytowalk
      </AppText>
      <Skeleton width={132} height={10} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xxl,
  },
  wordmark: { letterSpacing: -0.4 },
});
