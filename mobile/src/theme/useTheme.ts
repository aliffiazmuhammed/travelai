import type { Palette } from './tokens';
import { useThemePreference } from './ThemeProvider';

/** Palette from the appearance preference (system by default). */
export function useTheme(): { palette: Palette; isDark: boolean } {
  const { palette, isDark } = useThemePreference();
  return { palette, isDark };
}
