import { useSyncExternalStore } from "react";

/**
 * Mirrors Tailwind's `xl` breakpoint, which switches the studio between its
 * stacked Preview / Tools tabs and the desktop split view.
 */
export const STUDIO_DESKTOP_MEDIA_QUERY = "(min-width: 80rem)";

function subscribeToDesktopStudioLayout(onChange: () => void): () => void {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => {};
  }

  const mediaQuery = window.matchMedia(STUDIO_DESKTOP_MEDIA_QUERY);
  if (typeof mediaQuery?.addEventListener !== "function") {
    return () => {};
  }

  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function readDesktopStudioLayout(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return true;
  }

  return Boolean(window.matchMedia(STUDIO_DESKTOP_MEDIA_QUERY)?.matches);
}

/**
 * True while the studio renders its desktop split view. The Assistant is the
 * same floating panel on both sides of this breakpoint; only the studio's own
 * panes (split columns vs. tabs) change with it.
 */
export function useDesktopStudioLayout(): boolean {
  return useSyncExternalStore(
    subscribeToDesktopStudioLayout,
    readDesktopStudioLayout,
    () => true,
  );
}
