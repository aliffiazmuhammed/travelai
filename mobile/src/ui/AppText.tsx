import { Text, type TextProps } from 'react-native';

import { typography, type Palette } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Variant = keyof typeof typography;
type Tone = 'default' | 'muted' | 'primary' | 'accent' | 'inverse' | 'danger';

const toneColor: Record<Tone, (palette: Palette) => string> = {
  default: (palette) => palette.foreground,
  muted: (palette) => palette.mutedForeground,
  primary: (palette) => palette.primary,
  accent: (palette) => palette.accent,
  inverse: (palette) => palette.background,
  danger: (palette) => palette.destructive,
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
}

/** Brand typography with a semantic color tone, so screens rarely set raw styles. */
export function AppText({ variant = 'body', tone = 'default', style, ...rest }: AppTextProps) {
  const { palette } = useTheme();

  return <Text {...rest} style={[typography[variant], { color: toneColor[tone](palette) }, style]} />;
}
