import { useEffect, useState } from "react";

/**
 * Subscribes to a CSS media query. Useful when an image should not be requested
 * at all below a breakpoint — `display: none` still downloads it.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/** Matches the `lg` breakpoint used by the auth split-screen layout. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
