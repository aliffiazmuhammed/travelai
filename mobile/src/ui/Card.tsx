import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { radius, shadows, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

interface CardProps extends Omit<ViewProps, 'style' | 'children'> {
  children: ReactNode;
  padded?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, padded = true, onPress, style, ...rest }: CardProps) {
  const { palette } = useTheme();
  const surface = [
    styles.card,
    {
      backgroundColor: palette.card,
      borderColor: palette.border,
      shadowColor: palette.shadow,
    },
    padded && styles.padded,
    style,
  ];

  if (!onPress) {
    return (
      <View {...rest} style={surface}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [surface, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xxl,
    borderWidth: 1,
    ...shadows.soft,
  },
  padded: { padding: space.lg },
  pressed: { opacity: 0.92, transform: [{ scale: 0.995 }] },
});
