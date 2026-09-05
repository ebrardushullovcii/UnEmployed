export interface JobFinderMotionWindow {
  matchMedia?: (query: string) => { matches: boolean };
}

/**
 * Keep intentional in-app navigation instant for users who request reduced
 * motion, while retaining the existing smooth transition for everyone else.
 */
export function getJobFinderScrollBehavior(
  windowRef: JobFinderMotionWindow | null | undefined = typeof window ===
  "undefined"
    ? undefined
    : window,
): ScrollBehavior {
  return windowRef?.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}
