import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * LIFO overlay ownership for Job Finder shell surfaces.
 *
 * Every transient surface that covers the workspace (Planning menu, Task
 * Center panel, global search dialog, saved-views dialog, CRM confirmation
 * modal) acquires one ownership entry while it is open and releases it when
 * it closes. The stack order is open order, so:
 *
 * - `isTopmost` tells a surface's own Escape listener whether this Escape is
 *   addressed to it. Exactly one layer acts per keypress, independent of
 *   document-listener registration order.
 * - `hasOpenJobFinderOverlays` lets shell shortcuts block `/` and Cmd+B under
 *   any owned overlay without threading every surface's open state through
 *   props. Cmd+K intentionally stays available as the search summon.
 * - Every handler still honors `defaultPrevented` and IME composition before
 *   consulting the stack, so inner controls (like dismissing the search
 *   result popup) keep first claim on their keys.
 */

interface JobFinderOverlayLayer {
  close: () => void;
}

const overlayLayers = new Map<string, JobFinderOverlayLayer>();
const changeListeners = new Set<() => void>();
let layerSequence = 0;

/**
 * Modal layers are the strict subset of overlays that own the whole window:
 * they paint a scrim and mark `#root` inert. Floating, modeless surfaces
 * (Profile Copilot, Guided edits) portal to `document.body`, so `#root`
 * inertness alone never reaches them and they would otherwise stay opaque and
 * clickable above a modal's scrim. They subscribe to this count instead and
 * drop below the scrim, aria-hidden and inert, while any modal is open.
 */
const modalLayers = new Set<string>();

function emitChange(): void {
  for (const listener of changeListeners) {
    listener();
  }
}

function getTopmostLayerId(): string | null {
  const entries = [...overlayLayers.keys()];
  return entries.at(-1) ?? null;
}

export interface JobFinderOverlayOwnership {
  readonly id: string;
  /** True while this layer is open and nothing opened after it. */
  isTopmost: () => boolean;
  release: () => void;
}

export function acquireJobFinderOverlay(
  close: () => void,
): JobFinderOverlayOwnership {
  layerSequence += 1;
  const id = `job-finder-overlay-${layerSequence}`;
  overlayLayers.set(id, { close });
  emitChange();

  let released = false;
  return {
    id,
    isTopmost: () => !released && getTopmostLayerId() === id,
    release: () => {
      if (released) {
        return;
      }
      released = true;
      overlayLayers.delete(id);
      emitChange();
    },
  };
}

export function hasOpenJobFinderOverlays(): boolean {
  return overlayLayers.size > 0;
}

export function hasOpenJobFinderModal(): boolean {
  return modalLayers.size > 0;
}

/** Marks one already-acquired overlay layer as window-owning (modal). */
export function markJobFinderOverlayAsModal(
  ownership: JobFinderOverlayOwnership,
): () => void {
  modalLayers.add(ownership.id);
  emitChange();

  return () => {
    if (!modalLayers.delete(ownership.id)) {
      return;
    }
    emitChange();
  };
}

export function subscribeToJobFinderOverlays(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

/** Test seam: drop every live layer without relying on unmount ordering. */
export function resetJobFinderOverlaysForTests(): void {
  overlayLayers.clear();
  modalLayers.clear();
  emitChange();
}

/**
 * Owns one overlay entry for as long as `active` is true. `close` may change
 * identity between renders; the latest closure always wins. Returns whether
 * the caller currently owns the top of the stack so document-level listeners
 * can decide deterministically whether an Escape belongs to them.
 */
export function useJobFinderOverlayOwnership(input: {
  active: boolean;
  close: () => void;
  /** True for window-owning surfaces that paint a scrim and inert the app. */
  modal?: boolean;
}): { isTopmost: () => boolean } {
  const { active, modal = false } = input;
  const ownershipRef = useRef<JobFinderOverlayOwnership | null>(null);
  const closeRef = useRef(input.close);

  useEffect(() => {
    closeRef.current = input.close;
  }, [input.close]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const ownership = acquireJobFinderOverlay(() => closeRef.current());
    ownershipRef.current = ownership;
    const releaseModal = modal
      ? markJobFinderOverlayAsModal(ownership)
      : undefined;
    return () => {
      ownershipRef.current = null;
      releaseModal?.();
      ownership.release();
    };
  }, [active, modal]);

  const isTopmost = useRef(() => ownershipRef.current?.isTopmost() ?? false);

  return { isTopmost: isTopmost.current };
}

function subscribeToOverlayCount(listener: () => void): () => void {
  return subscribeToJobFinderOverlays(listener);
}

/** Reactive signal used by shell shortcuts to block aliases under overlays. */
export function useHasOpenJobFinderOverlays(): boolean {
  return useSyncExternalStore(
    subscribeToOverlayCount,
    hasOpenJobFinderOverlays,
    hasOpenJobFinderOverlays,
  );
}

/**
 * Reactive signal read by body-portalled floating surfaces so they can step
 * under an open modal's scrim instead of floating above it.
 */
export function useHasOpenJobFinderModal(): boolean {
  return useSyncExternalStore(
    subscribeToOverlayCount,
    hasOpenJobFinderModal,
    hasOpenJobFinderModal,
  );
}
