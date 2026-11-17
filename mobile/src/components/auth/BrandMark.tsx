import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui';

const CREAM = '#f7f3ea';
const CORAL = '#e87656';

interface BrandMarkProps {
  /** Cream lockup for use over photography, independent of the theme. */
  onPhoto?: boolean;
  size?: 'title' | 'heading';
}

/** The wordmark with the coral dot, set as type so it stays crisp at any size. */
export function BrandMark({ onPhoto = false, size = 'title' }: BrandMarkProps) {
  const { palette } = useTheme();

  return (
    <View style={styles.row}>
      <AppText
        variant={size}
        style={[
          styles.word,
          size === 'heading' ? styles.wordSmall : null,
          { color: onPhoto ? CREAM : palette.primary },
        ]}
      >
        waytowalk
      </AppText>
      <View
        style={[
          styles.dot,
          size === 'heading' ? styles.dotSmall : null,
          { backgroundColor: CORAL },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  word: { letterSpacing: -0.4 },
  wordSmall: { letterSpacing: -0.3 },
  dot: { width: 7, height: 7, borderRadius: 4, marginLeft: 3, marginBottom: 7 },
  dotSmall: { width: 6, height: 6, borderRadius: 3, marginLeft: 2, marginBottom: 5 },
});
