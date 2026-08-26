import {
  revealBelowShellHeader,
  type JobFinderRevealView,
} from "../../lib/job-finder-scroll-reveal";

export const DISCOVERY_DETAIL_HEADING_ID = "discovery-selected-job-heading";
export const DISCOVERY_DETAIL_REGION_ID = "discovery-selected-job-detail";
// Same stacking threshold as the Tailwind xl two-pane grid on the discovery
// screen: below 80rem results and inspector share one page scroller.
export const DISCOVERY_STACKED_LAYOUT_MEDIA_QUERY = "(width < 80rem)";

function isDiscoveryStackedLayout(
  view: JobFinderRevealView | null | undefined,
): boolean {
  const mediaQueryList = view?.matchMedia?.(
    DISCOVERY_STACKED_LAYOUT_MEDIA_QUERY,
  );

  return mediaQueryList?.matches ?? false;
}

function revealStackedDetailRegion(view: JobFinderRevealView): void {
  if (!isDiscoveryStackedLayout(view)) {
    return;
  }

  queueMicrotask(() => {
    const region = document.getElementById(DISCOVERY_DETAIL_REGION_ID);

    if (!region) {
      return;
    }

    // Native scrollIntoView honors the shared responsive scroll-margin
    // classes on the region (`JOB_FINDER_REVEAL_SCROLL_MARGIN_CLASSES`), so
    // the stacked inspector clears the fixed shell header. No explicit
    // behavior is passed: the reveal stays instant for reduced motion.
    region.scrollIntoView?.({ block: "start" });
  });
}

export function focusDiscoveryDetailAfterKeyboardSelection(): void {
  queueMicrotask(() => {
    const heading = document.getElementById(DISCOVERY_DETAIL_HEADING_ID);

    if (!heading) {
      return;
    }

    const view = heading.ownerDocument.defaultView;

    // Intentional and controlled: claim focus with preventScroll so the
    // browser cannot perform uncontrolled ancestor jumps, then reveal the
    // stacked detail region explicitly below the shell header clearance.
    heading.focus({ preventScroll: true });

    if (!view) {
      return;
    }

    const region = document.getElementById(DISCOVERY_DETAIL_REGION_ID);

    if (region && isDiscoveryStackedLayout(view)) {
      revealBelowShellHeader(region, view);
    }
  });
}

export function revealDiscoveryDetailAfterPointerSelection(): void {
  revealStackedDetailRegion(window);
}
