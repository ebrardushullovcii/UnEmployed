import { useEffect, useRef, type RefObject } from "react";
import { useJobFinderOverlayOwnership } from "../../lib/job-finder-overlay-ownership";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ].filter(
    (element) =>
      !element.hasAttribute("hidden") &&
      !element.hasAttribute("data-focus-sentinel") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.tabIndex >= 0 &&
      (element.offsetParent !== null || element === document.activeElement),
  );
}

export interface ModalFocusTrapOptions {
  /**
   * Where initial focus lands when the modal opens. "first-focusable" keeps
   * the legacy first-control focus. "dialog" focuses the labelled container
   * (it must carry tabIndex={-1}) so screen readers announce the dialog name
   * and description instead of the first action button.
   */
  initialFocus?: "dialog" | "first-focusable";
}

export function useModalFocusTrap(
  open: boolean,
  dialogRef: RefObject<HTMLDivElement | null>,
  onClose: () => void,
  options?: ModalFocusTrapOptions,
) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const initialFocusMode = options?.initialFocus ?? "first-focusable";

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const { isTopmost } = useJobFinderOverlayOwnership({
    active: open,
    close: () => onCloseRef.current(),
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const appRoot = document.getElementById("root");
    const previousAriaHidden = appRoot?.getAttribute("aria-hidden") ?? null;
    const hadInert = appRoot?.hasAttribute("inert") ?? false;

    appRoot?.setAttribute("aria-hidden", "true");
    appRoot?.setAttribute("inert", "");

    const focusableElements = getFocusableElements(dialog);
    (
      initialFocusMode === "dialog"
        ? dialog
        : (focusableElements[0] ?? dialog)
    ).focus();

    const sentinelStart = document.createElement("span");
    sentinelStart.setAttribute("data-focus-sentinel", "start");
    sentinelStart.setAttribute("aria-hidden", "true");
    sentinelStart.tabIndex = 0;
    sentinelStart.style.position = "absolute";
    sentinelStart.style.width = "1px";
    sentinelStart.style.height = "1px";
    sentinelStart.style.padding = "0";
    sentinelStart.style.margin = "-1px";
    sentinelStart.style.overflow = "hidden";
    sentinelStart.style.clip = "rect(0, 0, 0, 0)";
    sentinelStart.style.whiteSpace = "nowrap";
    sentinelStart.style.border = "0";

    const sentinelEnd = document.createElement("span");
    sentinelEnd.setAttribute("data-focus-sentinel", "end");
    sentinelEnd.setAttribute("aria-hidden", "true");
    sentinelEnd.tabIndex = 0;
    sentinelEnd.style.position = "absolute";
    sentinelEnd.style.width = "1px";
    sentinelEnd.style.height = "1px";
    sentinelEnd.style.padding = "0";
    sentinelEnd.style.margin = "-1px";
    sentinelEnd.style.overflow = "hidden";
    sentinelEnd.style.clip = "rect(0, 0, 0, 0)";
    sentinelEnd.style.whiteSpace = "nowrap";
    sentinelEnd.style.border = "0";

    const handleSentinelStartFocus = () => {
      const focusable = getFocusableElements(dialog);
      const last = focusable[focusable.length - 1];
      (last ?? dialog).focus();
    };

    const handleSentinelEndFocus = () => {
      const focusable = getFocusableElements(dialog);
      (focusable[0] ?? dialog).focus();
    };

    sentinelStart.addEventListener("focus", handleSentinelStartFocus);
    sentinelEnd.addEventListener("focus", handleSentinelEndFocus);
    dialog.prepend(sentinelStart);
    dialog.append(sentinelEnd);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (
        event.isComposing ||
        (event as unknown as { keyCode?: number }).keyCode === 229
      ) {
        return;
      }
      if (event.key === "Escape") {
        if (!isTopmost()) {
          return;
        }
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const nextFocusableElements = getFocusableElements(dialog);
      if (nextFocusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstFocusable = nextFocusableElements[0];
      const lastFocusable =
        nextFocusableElements[nextFocusableElements.length - 1];
      if (!firstFocusable || !lastFocusable) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      if (!dialog.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastFocusable : firstFocusable).focus();
        return;
      }

      // With initialFocus="dialog" focus starts on the container itself; route
      // Tab explicitly so the hidden edge sentinels never capture it.
      if (activeElement === dialog) {
        event.preventDefault();
        (event.shiftKey ? lastFocusable : firstFocusable).focus();
        return;
      }

      if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
        return;
      }

      if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      sentinelStart.removeEventListener("focus", handleSentinelStartFocus);
      sentinelEnd.removeEventListener("focus", handleSentinelEndFocus);
      sentinelStart.remove();
      sentinelEnd.remove();

      if (appRoot) {
        if (previousAriaHidden === null) {
          appRoot.removeAttribute("aria-hidden");
        } else {
          appRoot.setAttribute("aria-hidden", previousAriaHidden);
        }

        if (hadInert) {
          appRoot.setAttribute("inert", "");
        } else {
          appRoot.removeAttribute("inert");
        }
      }

      previousFocusRef.current?.focus();
    };
  }, [open, isTopmost, initialFocusMode]);
}
