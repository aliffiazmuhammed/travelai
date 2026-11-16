import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { radius, typography } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const height: Record<Size, number> = { sm: 40, md: 48, lg: 54 };
const padding: Record<Size, number> = { sm: 14, md: 20, lg: 24 };

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
}: ButtonProps) {
  const { palette } = useTheme();
  const skin = {
    primary: { bg: palette.primary, fg: palette.primaryForeground, border: palette.primary },
    accent: { bg: palette.accent, fg: palette.accentForeground, border: palette.accent },
    secondary: { bg: palette.muted, fg: palette.secondaryForeground, border: palette.muted },
    ghost: { bg: 'transparent', fg: palette.foreground, border: palette.border },
    danger: { bg: palette.destructive, fg: palette.destructiveForeground, border: palette.destructive },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          height: height[size],
          paddingHorizontal: padding[size],
          backgroundColor: skin.bg,
          borderColor: skin.border,
          opacity: disabled ? 0.45 : pressed ? 0.86 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={skin.fg} /> : icon}
      <AppText
        variant={size === 'sm' ? 'label' : 'button'}
        numberOfLines={1}
        style={size === 'sm' ? { ...typography.label, color: skin.fg } : { color: skin.fg }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
