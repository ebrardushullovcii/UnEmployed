import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import { cn } from "@renderer/lib/utils";
import {
  formatTimestamp,
  formatStatusLabel,
} from "@renderer/features/job-finder/lib/job-finder-utils";
import { StatusBadge } from "../../components/status-badge";
import {
  formatVisibleRunId,
  getCustomerFacingApplyText,
} from "./applications-detail-panel-helpers";
import { APPLICATION_DETAIL_FACT_LABEL_CLASS } from "./applications-detail-fact-strip";

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
      <h3 className={cn(APPLICATION_DETAIL_FACT_LABEL_CLASS, "text-primary")}>
        Preparation history
      </h3>
      <ul className="grid gap-2" role="list">
        {applyRunHistory.map(({ result, run }) => {
          const isSelected = selectedApplyRunId === result.runId;

          return (
            <li key={result.id}>
              <button
                aria-pressed={isSelected}
                className={cn(
                  "grid w-full gap-1 rounded-(--radius-field) border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
                  isSelected
                    ? "border-primary bg-primary/8"
                    : "border-(--surface-panel-border) bg-background/40 hover:bg-background/60",
                )}
                onClick={() => onSelectApplyRun(result.runId)}
                title={result.runId}
                type="button"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="min-w-0 break-words text-(length:--text-field) text-foreground">
                    {run ? formatStatusLabel(run.mode) : "Preparation run"}
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
                </span>
                <p className="min-w-0 break-words text-(length:--text-small) leading-5 text-foreground-soft">
                  {getCustomerFacingApplyText(result.summary)}
                </p>
                <p className="min-w-0 break-words text-(length:--text-small) leading-5 text-foreground-soft">
                  {formatTimestamp(result.updatedAt)}
                  {run ? ` • ${formatStatusLabel(run.state)}` : ""}
                  {result.blockerSummary
                    ? ` • ${getCustomerFacingApplyText(result.blockerSummary)}`
                    : ""}
                  {` • Preparation ${formatVisibleRunId(result.runId)}`}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
