import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

const readPreference = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(QUERY).matches
    : false;

/**
 * C-30: components that drive motion with JS (tip rotation, staged reveals,
 * looping indicators) read this instead of guessing from CSS alone.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readPreference);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia(QUERY);
    const onChange = () => setReduced(query.matches);
    setReduced(query.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);

  return reduced;
}
