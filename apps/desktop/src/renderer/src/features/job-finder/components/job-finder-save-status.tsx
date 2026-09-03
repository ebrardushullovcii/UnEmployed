import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { AlertTriangle, Check, LoaderCircle, RotateCcw, X } from "lucide-react";
import { Button } from "@renderer/components/ui/button";
import type { JobFinderSaveState } from "@renderer/pages/job-finder-save-state";

export const SAVE_SUCCESS_VISIBLE_MS = 5_000;
export const SAVE_STATUS_DEFAULT_TOP_OFFSET_PX = 16;
export const SAVE_STATUS_SHELL_HEADER_GAP_PX = 16;
const SAVE_STATUS_VIEWPORT_GAP_PX = 16;

/**
 * Place the global save status below the shell header while keeping its
 * fixed-position lane inside a short viewport. The header is measured at
 * runtime because the shell intentionally has a second navigation row at
 * medium widths.
 */
export function getSaveStatusTopOffset(input: {
  shellHeaderBottom?: number;
  viewportHeight?: number;
  defaultTopOffset?: number;
  gap?: number;
  viewportGap?: number;
}): number {
  const defaultTopOffset =
    input.defaultTopOffset ?? SAVE_STATUS_DEFAULT_TOP_OFFSET_PX;
  const gap = input.gap ?? SAVE_STATUS_SHELL_HEADER_GAP_PX;
  const viewportGap = input.viewportGap ?? SAVE_STATUS_VIEWPORT_GAP_PX;
  const shellHeaderBottom = input.shellHeaderBottom;
  const viewportHeight = input.viewportHeight;
  const requestedTop =
    typeof shellHeaderBottom === "number" && Number.isFinite(shellHeaderBottom)
      ? Math.max(defaultTopOffset, Math.ceil(shellHeaderBottom + gap))
      : defaultTopOffset;

  if (
    typeof viewportHeight !== "number" ||
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0
  ) {
    return requestedTop;
  }

  return Math.min(
    requestedTop,
    Math.max(defaultTopOffset, Math.floor(viewportHeight - viewportGap)),
  );
}

export function JobFinderSaveStatus(props: {
  layoutKey?: string;
  onDismissSaved?: (() => void) | undefined;
  onRetry: () => void;
  saveState: JobFinderSaveState;
}) {
  const [topOffset, setTopOffset] = useState(SAVE_STATUS_DEFAULT_TOP_OFFSET_PX);
  const savedMessageKey =
    props.saveState.state === "idle"
      ? "idle"
      : `${props.saveState.version}:${props.saveState.attempt}:${props.saveState.message}:${props.saveState.savedAt ?? ""}`;
  const [dismissedSavedMessageKey, setDismissedSavedMessageKey] = useState<
    string | null
  >(null);
  const [autoDismissPaused, setAutoDismissPaused] = useState(false);
  const previousLayoutKeyRef = useRef(props.layoutKey);
  const dismissSavedMessage = useCallback(() => {
    setDismissedSavedMessageKey(savedMessageKey);
    props.onDismissSaved?.();
  }, [props.onDismissSaved, savedMessageKey]);

  useLayoutEffect(() => {
    const previousLayoutKey = previousLayoutKeyRef.current;
    previousLayoutKeyRef.current = props.layoutKey;

    // A successful confirmation belongs to the surface that produced it. Do
    // not carry it across route changes where a fixed toast can cover a new
    // action; in-flight and failed states remain available for recovery.
    if (
      previousLayoutKey !== undefined &&
      props.layoutKey !== undefined &&
      previousLayoutKey !== props.layoutKey &&
      props.saveState.state === "saved"
    ) {
      dismissSavedMessage();
    }
  }, [dismissSavedMessage, props.layoutKey, props.saveState.state]);

  useLayoutEffect(() => {
    const shellHeader = document.querySelector<HTMLElement>(
      "[data-job-finder-shell-header]",
    );
    if (!shellHeader) {
      return;
    }

    const updateTopOffset = () => {
      const nextOffset = getSaveStatusTopOffset({
        shellHeaderBottom: shellHeader.getBoundingClientRect().bottom,
        viewportHeight: window.innerHeight,
      });

      setTopOffset((current) =>
        current === nextOffset ? current : nextOffset,
      );
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(updateTopOffset);

    updateTopOffset();
    resizeObserver?.observe(shellHeader);
    window.addEventListener("resize", updateTopOffset);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateTopOffset);
    };
  }, []);

  useEffect(() => {
    if (props.saveState.state !== "saved") {
      setDismissedSavedMessageKey(null);
      return;
    }
    if (autoDismissPaused) {
      return;
    }

    const savedAtMs = props.saveState.savedAt
      ? Date.parse(props.saveState.savedAt)
      : Number.NaN;
    const elapsedMs = Number.isFinite(savedAtMs)
      ? Math.max(0, Date.now() - savedAtMs)
      : 0;
    const remainingMs = Math.max(0, SAVE_SUCCESS_VISIBLE_MS - elapsedMs);

    const timeoutId = window.setTimeout(() => {
      dismissSavedMessage();
    }, remainingMs);

    return () => window.clearTimeout(timeoutId);
  }, [autoDismissPaused, dismissSavedMessage, props.saveState]);

  if (props.saveState.state === "idle") {
    return null;
  }

  if (
    props.saveState.state === "saved" &&
    dismissedSavedMessageKey === savedMessageKey
  ) {
    return null;
  }

  const Icon =
    props.saveState.state === "saving"
      ? LoaderCircle
      : props.saveState.state === "saved"
        ? Check
        : AlertTriangle;

  return (
    <div className="pointer-events-none" data-save-status-lane>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="pointer-events-auto fixed right-4 z-40 flex max-w-[min(26rem,calc(100vw-2rem))] items-center gap-3 overflow-auto rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) px-3 py-2.5 text-(length:--text-small) shadow-(--modal-shadow)"
        data-save-status={props.saveState.state}
        data-save-state={props.saveState.state}
        style={{
          maxHeight: `calc(100vh - ${topOffset + SAVE_STATUS_VIEWPORT_GAP_PX}px)`,
          top: `${topOffset}px`,
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setAutoDismissPaused(false);
          }
        }}
        onFocusCapture={() => setAutoDismissPaused(true)}
        role="status"
      >
        <Icon
          aria-hidden="true"
          className={
            props.saveState.state === "saving"
              ? "size-4 shrink-0 animate-spin motion-reduce:animate-none"
              : "size-4 shrink-0"
          }
        />
        <span className="min-w-0 flex-1 leading-5 text-foreground-soft">
          {props.saveState.message}
        </span>
        {props.saveState.canRetry ? (
          <Button
            aria-label={`Retry saving ${props.saveState.label}`}
            onClick={props.onRetry}
            size="sm"
            type="button"
            variant="secondary"
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
            Retry
          </Button>
        ) : props.saveState.state === "failed" &&
          props.saveState.retryBlockedReason ? (
          <span
            className="max-w-56 text-right text-xs leading-4 text-destructive"
            data-save-retry-blocked="true"
          >
            {props.saveState.retryBlockedReason}
          </span>
        ) : null}
        {props.saveState.state === "saved" ? (
          <Button
            aria-label={`Dismiss ${props.saveState.label} saved message`}
            onClick={dismissSavedMessage}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
