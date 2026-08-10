import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, LoaderCircle, RotateCcw, X } from "lucide-react";
import { Button } from "@renderer/components/ui/button";
import type { JobFinderSaveState } from "@renderer/pages/job-finder-save-state";

export const SAVE_SUCCESS_VISIBLE_MS = 7_000;

export function JobFinderSaveStatus(props: {
  onDismissSaved?: (() => void) | undefined;
  onRetry: () => void;
  saveState: JobFinderSaveState;
}) {
  const savedMessageKey =
    props.saveState.state === "idle"
      ? "idle"
      : `${props.saveState.version}:${props.saveState.attempt}:${props.saveState.message}:${props.saveState.savedAt ?? ""}`;
  const [dismissedSavedMessageKey, setDismissedSavedMessageKey] = useState<
    string | null
  >(null);
  const [autoDismissPaused, setAutoDismissPaused] = useState(false);
  const dismissSavedMessage = useCallback(() => {
    setDismissedSavedMessageKey(savedMessageKey);
    props.onDismissSaved?.();
  }, [props.onDismissSaved, savedMessageKey]);

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
    <div
      aria-atomic="true"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-40 flex max-w-[min(26rem,calc(100vw-2rem))] items-center gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) px-3 py-2.5 text-(length:--text-small) shadow-(--modal-shadow)"
      data-save-state={props.saveState.state}
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
  );
}
