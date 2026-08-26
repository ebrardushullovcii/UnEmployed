import { Link } from "react-router-dom";
import { Button } from "@renderer/components/ui/button";
import { JOB_FINDER_ROUTE_PATHS } from "@renderer/features/job-finder/lib/job-finder-route-hrefs";
import type { DiscoveryRunFeedback } from "./discovery-run-feedback";

const TONE_CLASS_NAMES: Record<DiscoveryRunFeedback["status"], string> = {
  failed:
    "border-(--warning-border) bg-(--warning-surface) text-(--warning-text)",
  started: "border-(--info-border) bg-(--info-surface) text-(--info-text)",
  cancelled: "border-(--info-border) bg-(--info-surface) text-(--info-text)",
  succeeded:
    "border-(--success-border) bg-(--success-surface) text-(--success-text)",
};

/**
 * Shared outcome feedback for every visible Search now entry point. The
 * clicked control stays truthful: pending is shown by the control itself,
 * and this callout reports started/succeeded/cancelled/failed — cancelled
 * stays a neutral status (never success, never an alert) because the run was
 * stopped deliberately.
 */
export function DiscoveryRunFeedbackCallout(props: {
  feedback: DiscoveryRunFeedback;
  isRecoveryPending?: boolean;
  onOpenBrowserSession?: () => void;
}) {
  const { feedback, isRecoveryPending = false, onOpenBrowserSession } = props;
  const recovery = feedback.recovery;

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className={`grid gap-1 rounded-(--radius-field) border px-3 py-2.5 text-(length:--text-description) leading-6 ${TONE_CLASS_NAMES[feedback.status]}`}
      data-testid="discovery-run-feedback"
      role={feedback.status === "failed" ? "alert" : "status"}
    >
      <p className="font-medium">{feedback.headline}</p>
      {recovery ? <p className="opacity-90">{recovery.headline}</p> : null}
      {recovery ? (
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          {recovery.kind === "browser_session" && onOpenBrowserSession ? (
            <Button
              onClick={onOpenBrowserSession}
              pending={isRecoveryPending}
              size="sm"
              type="button"
              variant="primary"
            >
              {recovery.actionLabel ?? "Open browser"}
            </Button>
          ) : null}
          {recovery.kind === "source_setup" ? (
            <Button asChild size="sm" type="button" variant="primary">
              <Link to={JOB_FINDER_ROUTE_PATHS.profileSources}>
                {recovery.actionLabel ?? "Review job sources"}
              </Link>
            </Button>
          ) : null}
          <span className="text-(length:--text-small) opacity-80">
            {recovery.nextStep}
          </span>
        </div>
      ) : null}
    </div>
  );
}
