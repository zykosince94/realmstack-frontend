import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches, kept in sync as the window changes. Without
 * matchMedia (some test environments) it reports false.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window.matchMedia !== "function") return () => {};
    const list = window.matchMedia(query);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  const snapshot = () => typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
