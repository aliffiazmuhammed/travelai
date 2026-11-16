import { useColorScheme } from 'react-native';

import { palettes, type Palette } from './tokens';

/** System-driven palette. Components read colors from here, never from a constant. */
export function useTheme(): { palette: Palette; isDark: boolean } {
  const isDark = useColorScheme() === 'dark';
  return { palette: isDark ? palettes.dark : palettes.light, isDark };
}
