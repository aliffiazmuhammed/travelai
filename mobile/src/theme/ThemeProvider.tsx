import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform, useColorScheme } from 'react-native';

import { palettes, type Palette } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

const STORAGE_KEY = 'waytowalk.theme-preference';

/** SecureStore has no web implementation; the browser preview uses localStorage. */
const webStorage = {
  getItemAsync: async (key: string) =>
    typeof localStorage === 'undefined' ? null : localStorage.getItem(key),
  setItemAsync: async (key: string, value: string) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  },
};

const storage = Platform.OS === 'web' ? webStorage : SecureStore;

function isPreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

interface ThemeContextValue {
  preference: ThemePreference;
  scheme: ColorScheme;
  palette: Palette;
  isDark: boolean;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let alive = true;
    storage
      .getItemAsync(STORAGE_KEY)
      .then((stored) => {
        if (alive && isPreference(stored)) setPreferenceState(stored);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void storage.setItemAsync(STORAGE_KEY, next).catch(() => {});
  }, []);

  const scheme: ColorScheme =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo(
    () => ({
      preference,
      scheme,
      palette: palettes[scheme],
      isDark: scheme === 'dark',
      setPreference,
    }),
    [preference, scheme, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePreference(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useThemePreference must be used inside ThemeProvider');
  return context;
}
