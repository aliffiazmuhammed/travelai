import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { useLocation } from "react-router-dom";

export type ThemeMode = "light" | "dark";
export type ThemeRealm = "traveller" | "agency" | "admin";

interface ThemeContextValue {
  /** The user's saved preference; admin ignores it and stays dark. */
  mode: ThemeMode;
  /** What is actually applied to <html>. */
  effectiveMode: ThemeMode;
  realm: ThemeRealm;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const STORAGE_KEY = "travelai_theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ThemeMode | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

function systemMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function initialMode(): ThemeMode {
  // Track the user's preference, not the applied class: admin forces dark
  // without changing the saved choice, so reading the class here would leak
  // dark mode into the traveller realm after leaving the console.
  return readStoredMode() ?? systemMode();
}

function realmForPath(pathname: string): ThemeRealm {
  if (pathname === "/agency" || pathname.startsWith("/agency/")) {
    return "agency";
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return "admin";
  }
  return "traveller";
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { pathname } = useLocation();
  const realm = realmForPath(pathname);
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [followSystem, setFollowSystem] = useState(
    () => readStoredMode() === null
  );

  const effectiveMode: ThemeMode = realm === "admin" ? "dark" : mode;

  // Layout effect so a client-side route change between realms is painted with
  // the right tokens. Portals read <html>, not a local wrapper.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", effectiveMode === "dark");
    root.dataset.theme = realm;
    root.style.colorScheme = effectiveMode;
  }, [effectiveMode, realm]);

  useEffect(() => {
    if (!followSystem) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      setModeState(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [followSystem]);

  const setMode = useCallback((next: ThemeMode) => {
    setFollowSystem(false);
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage may be unavailable; the session still works */
    }
  }, []);

  const toggleMode = useCallback(() => {
    // Toggle the saved preference, not the applied mode. Admin renders no
    // toggle because its theme is fixed dark.
    setMode(mode === "dark" ? "light" : "dark");
  }, [mode, setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      effectiveMode,
      realm,
      isDark: effectiveMode === "dark",
      setMode,
      toggleMode,
    }),
    [effectiveMode, mode, realm, setMode, toggleMode]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return value;
}
