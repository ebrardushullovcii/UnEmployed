import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import { cn } from "@renderer/lib/utils";
import {
  formatTimestamp,
  formatStatusLabel,
} from "@renderer/features/job-finder/lib/job-finder-utils";
import { StatusBadge } from "../../components/status-badge";
import { formatVisibleRunId } from "./applications-detail-panel-helpers";

export function ApplicationsDetailPanelRunHistorySection(props: {
  applyRunHistory: Array<{
    result: JobFinderWorkspaceSnapshot["applyJobResults"][number];
    run: JobFinderWorkspaceSnapshot["applyRuns"][number] | null;
  }>;
  onSelectApplyRun: (runId: string) => void;
  selectedApplyRunId: string | null;
}) {
  const { applyRunHistory, onSelectApplyRun, selectedApplyRunId } = props;

  if (!applyRunHistory.length) {
    return null;
  }

  return (
    <section className="surface-card-tint grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
      <div className="grid gap-1">
        <h3 className="label-mono-xs text-primary">Run history</h3>
        <p className="text-(length:--text-small) leading-6 text-foreground-soft">
          Review older safe runs, blockers, consent pauses, and queue outcomes for
          this job.
        </p>
      </div>
      <ul className="grid gap-2" role="list">
        {applyRunHistory.map(({ result, run }) => {
          const isSelected = selectedApplyRunId === result.runId;

          return (
            <li key={result.id}>
              <button
                aria-pressed={isSelected}
                className={cn(
                  "grid w-full gap-2 rounded-(--radius-field) border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
                  isSelected
                    ? "border-primary bg-primary/8"
                    : "border-(--surface-panel-border) bg-background/40 hover:bg-background/60",
                )}
                onClick={() => onSelectApplyRun(result.runId)}
                title={result.runId}
                type="button"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-foreground">
                    {run ? formatStatusLabel(run.mode) : "Apply run"}
                  </strong>
                  <StatusBadge
                    tone={
                      result.state === "submitted"
                        ? "positive"
                        : result.state === "blocked" ||
                            result.state === "failed" ||
                            result.state === "skipped"
                          ? "critical"
                          : "active"
                    }
                  >
                    {formatStatusLabel(result.state)}
                  </StatusBadge>
                </div>
                <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                  {result.summary}
                </p>
                <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                  {formatTimestamp(result.updatedAt)}
                  {run ? ` • ${formatStatusLabel(run.state)}` : ""}
                  {result.blockerSummary ? ` • ${result.blockerSummary}` : ""}
                </p>
                <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                  Run {formatVisibleRunId(result.runId)}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
