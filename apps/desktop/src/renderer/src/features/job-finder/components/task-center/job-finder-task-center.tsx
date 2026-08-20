import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DiscoveryActivityEvent,
  JobFinderWorkspaceSnapshot,
  ResumeImportProgressEvent,
} from "@unemployed/contracts";
import { ListChecks, X } from "lucide-react";
import { Button } from "@renderer/components/ui/button";
import { StatusBadge } from "../status-badge";
import {
  buildJobFinderTaskCenterModel,
  type JobFinderTaskCenterItem,
} from "./job-finder-task-center-model";

interface JobFinderTaskCenterProps {
  workspace: JobFinderWorkspaceSnapshot;
  isDiscoveryPending: boolean;
  isResumeImportPending: boolean;
  liveDiscoveryEvents?: readonly DiscoveryActivityEvent[] | undefined;
  resumeImportProgress?: ResumeImportProgressEvent | null | undefined;
  onCancelApplyRun?:
    | ((runId: string) => boolean | void | Promise<boolean | void>)
    | undefined;
  onCancelDiscovery?:
    | (() => boolean | void | Promise<boolean | void>)
    | undefined;
  onNavigate?: ((path: string) => void | Promise<void>) | undefined;
}

function taskTone(status: JobFinderTaskCenterItem["status"]) {
  if (status === "active") {
    return "active" as const;
  }
  if (status === "completed") {
    return "positive" as const;
  }
  if (status === "failed" || status === "interrupted") {
    return "critical" as const;
  }
  return "muted" as const;
}

function statusLabel(status: JobFinderTaskCenterItem["status"]): string {
  return status === "active"
    ? "In progress"
    : status === "paused"
      ? "Paused"
      : status === "completed"
        ? "Complete"
        : status === "cancelled"
          ? "Cancelled"
          : status === "failed"
            ? "Failed"
            : "Interrupted";
}

export function JobFinderTaskCenter(props: JobFinderTaskCenterProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const [cancelRequestedTaskIds, setCancelRequestedTaskIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [taskFeedback, setTaskFeedback] = useState<
    Readonly<Record<string, string>>
  >({});
  const model = useMemo(
    () =>
      buildJobFinderTaskCenterModel({
        workspace: props.workspace,
        isDiscoveryPending: props.isDiscoveryPending,
        isResumeImportPending: props.isResumeImportPending,
        liveDiscoveryEvents: props.liveDiscoveryEvents,
        resumeImportProgress: props.resumeImportProgress,
      }),
    [
      props.isDiscoveryPending,
      props.isResumeImportPending,
      props.liveDiscoveryEvents,
      props.resumeImportProgress,
      props.workspace,
    ],
  );

  useEffect(() => {
    const cancellableTaskIds = new Set(
      model.items.filter((item) => item.canCancel).map((item) => item.id),
    );
    setCancelRequestedTaskIds((current) => {
      const next = new Set(
        [...current].filter((taskId) => cancellableTaskIds.has(taskId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [model.items]);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) {
      return;
    }

    const close = (restoreFocus: boolean) => {
      if (!details.open) {
        return;
      }
      details.open = false;
      if (restoreFocus) {
        summaryRef.current?.focus();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !details.open) {
        return;
      }
      event.preventDefault();
      close(true);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (
        details.open &&
        event.target instanceof Node &&
        !details.contains(event.target)
      ) {
        close(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  async function cancelTask(item: JobFinderTaskCenterItem) {
    if (
      !item.canCancel ||
      !item.cancelKind ||
      cancelRequestedTaskIds.has(item.id)
    ) {
      return;
    }

    setTaskFeedback((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setCancelRequestedTaskIds((current) => new Set(current).add(item.id));
    try {
      const cancelOperation =
        item.cancelKind === "discovery"
          ? props.onCancelDiscovery
          : props.onCancelApplyRun
            ? () => props.onCancelApplyRun?.(item.id)
            : undefined;
      const result = cancelOperation ? await cancelOperation() : false;
      if (result !== false) {
        return;
      }
    } catch {
      // Keep the task available for another attempt and explain what happened here.
    }

    setTaskFeedback((current) => ({
      ...current,
      [item.id]:
        "Cancellation did not complete. Check the task, then try again.",
    }));

    setCancelRequestedTaskIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
  }

  async function navigateToTask(item: JobFinderTaskCenterItem) {
    if (!item.resumeRoute) {
      return;
    }

    setTaskFeedback((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    try {
      if (!props.onNavigate) {
        throw new Error("Task navigation is unavailable");
      }
      await props.onNavigate(item.resumeRoute);
      if (detailsRef.current) {
        detailsRef.current.open = false;
      }
    } catch {
      setTaskFeedback((current) => ({
        ...current,
        [item.id]: "That page could not open. Try again.",
      }));
    }
  }

  return (
    <details className="group relative z-40 shrink-0" ref={detailsRef}>
      <summary
        aria-label={`Task center: ${model.activeCount} active`}
        className="inline-flex h-[3.125rem] min-h-[3.125rem] min-w-10 cursor-pointer list-none items-center justify-center gap-2 rounded-full border border-(--surface-panel-border) bg-(--surface-panel) px-3 py-2 text-[0.72rem] font-medium text-muted-foreground outline-none transition-colors hover:border-primary/30 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:text-[0.76rem] xl:px-4 xl:text-(length:--text-small) [&::-webkit-details-marker]:hidden"
        ref={summaryRef}
      >
        <ListChecks aria-hidden="true" className="size-4 shrink-0" />
        <span className="hidden whitespace-nowrap min-[900px]:inline min-[1024px]:hidden min-[1440px]:inline">
          Task center
        </span>
        <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-(--input) px-1.5 text-[0.65rem] text-foreground tabular-nums">
          {model.activeCount}
        </span>
      </summary>

      <section
        aria-label="Task center"
        className="surface-popover-solid fixed inset-x-4 bottom-4 grid max-h-[calc(100vh-14rem)] gap-3 overflow-y-auto rounded-(--radius-panel) border border-(--surface-panel-border) p-4 shadow-(--modal-shadow) xl:absolute xl:inset-x-auto xl:bottom-auto xl:right-0 xl:top-12 xl:max-h-[min(38rem,calc(100vh-8rem))] xl:w-[min(34rem,calc(100vw-2rem))]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-1">
            <h2 className="font-display text-lg font-semibold text-(--text-headline)">
              Task center
            </h2>
            <p className="text-(length:--text-small) leading-5 text-foreground-soft">
              Current and latest job-search, résumé, and application work.
              Estimates appear only when completed history exists.
            </p>
          </div>
          <Button
            aria-label="Close Task center"
            className="shrink-0"
            onClick={() => {
              if (detailsRef.current) {
                detailsRef.current.open = false;
              }
              summaryRef.current?.focus();
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>

        {model.items.length === 0 ? (
          <p className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3 text-(length:--text-small) text-foreground-soft">
            No workflow tasks yet.
          </p>
        ) : (
          <div className="grid gap-3">
            {model.items.map((item) => {
              const cancellationRequested = cancelRequestedTaskIds.has(item.id);
              return (
                <article
                  className="grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3"
                  data-task-kind={item.kind}
                  data-task-status={item.status}
                  key={item.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="grid min-w-0 gap-0.5">
                      <h3 className="font-semibold text-foreground">
                        {item.title}
                      </h3>
                      <p className="break-words text-(length:--text-small) text-foreground-soft">
                        {item.sourceLabel}
                      </p>
                    </div>
                    <StatusBadge tone={taskTone(item.status)}>
                      {statusLabel(item.status)}
                    </StatusBadge>
                  </div>

                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-(length:--text-small) leading-5">
                    <dt className="text-foreground-muted">Stage</dt>
                    <dd className="text-foreground">{item.stageLabel}</dd>
                    <dt className="text-foreground-muted">Progress</dt>
                    <dd className="text-foreground">{item.countLabel}</dd>
                    {item.historyEstimateLabel ? (
                      <>
                        <dt className="text-foreground-muted">
                          History estimate
                        </dt>
                        <dd className="text-foreground">
                          {item.historyEstimateLabel}
                        </dd>
                      </>
                    ) : null}
                  </dl>

                  {item.canCancel || item.resumeRoute ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      {item.resumeRoute && item.resumeActionLabel ? (
                        <Button
                          onClick={() => void navigateToTask(item)}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          {item.resumeActionLabel}
                        </Button>
                      ) : null}
                      {item.canCancel ? (
                        <Button
                          disabled={cancellationRequested}
                          onClick={() => void cancelTask(item)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {cancellationRequested
                            ? "Cancellation requested"
                            : "Cancel task"}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {taskFeedback[item.id] ? (
                    <p
                      className="rounded-md border border-(--warning-border) bg-(--warning-surface) px-3 py-2 text-(length:--text-small) leading-5 text-foreground-soft"
                      role="status"
                    >
                      {taskFeedback[item.id]}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </details>
  );
}
