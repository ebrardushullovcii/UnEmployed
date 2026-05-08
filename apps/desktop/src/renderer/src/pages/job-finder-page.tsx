import { JobFinderShell } from "@renderer/features/job-finder/components/job-finder-shell";
import { ThemeProvider } from "@renderer/app/theme-provider";
import { Button } from "@renderer/components/ui/button";
import { useModalFocusTrap } from "@renderer/features/job-finder/components/profile/use-modal-focus-trap";
import { X } from "lucide-react";
import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Outlet } from "react-router-dom";
import { WorkspaceStateScreen } from "./job-finder-page-routes";
import {
  type ApplyCopilotVisualCheckpointRequest,
  useJobFinderPageController,
} from "./use-job-finder-page-controller";

export {
  JobFinderApplicationsRoute,
  JobFinderDiscoveryRoute,
  JobFinderProfileRoute,
  JobFinderProfileSetupRoute,
  JobFinderRouteErrorBoundary,
  JobFinderResumeWorkspaceRoute,
  JobFinderReviewQueueRoute,
  JobFinderSettingsRoute,
} from "./job-finder-page-routes";
export type { JobFinderPageContext } from "./job-finder-page-context";

function ApplyCopilotVisualCheckpointDialog(props: {
  onClose: () => void;
  onResolve: (visualCheckpointsEnabled: boolean) => void;
  request: ApplyCopilotVisualCheckpointRequest | null;
}) {
  const dialogTitleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const open = props.request !== null;
  useModalFocusTrap(open, dialogRef, props.onClose);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-(--modal-scrim) px-4 py-6 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={dialogTitleId}
        aria-modal="true"
        className="surface-panel-shell grid w-full max-w-lg gap-5 rounded-(--radius-field) border border-(--surface-panel-border) p-5 shadow-(--modal-shadow)"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-2">
            <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
              Apply copilot
            </p>
            <h2
              className="text-(length:--text-section-title) font-semibold text-(--text-headline)"
              id={dialogTitleId}
            >
              Enable visual checkpoints?
            </h2>
          </div>
          <Button
            aria-label="Close"
            className="size-9"
            onClick={props.onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>
        <p className="text-(length:--text-item) leading-6 text-foreground-soft" id={descriptionId}>
          Optional visual checkpoints analyze temporary screenshots of the
          application page to help classify visible blockers. Screenshots are
          sensitive and temporary by default.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            onClick={() => props.onResolve(false)}
            type="button"
            variant="secondary"
          >
            Continue without
          </Button>
          <Button onClick={() => props.onResolve(true)} type="button">
            Enable checkpoints
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function JobFinderPage() {
  const {
    appearanceTheme,
    applyCopilotVisualCheckpointRequest,
    cancelApplyCopilotVisualCheckpointRequest,
    context,
    navigateFromShell,
    platform,
    resolveApplyCopilotVisualCheckpointRequest,
    workspace,
    workspaceState,
  } =
    useJobFinderPageController();

  if (!context || !workspace || !platform) {
    if (workspaceState.status === "loading") {
      return (
        <WorkspaceStateScreen
          kicker="Job Finder"
          message="Opening your saved workspace."
          title="Loading Job Finder"
        />
      );
    }

    return (
      <WorkspaceStateScreen
        kicker="Workspace error"
        message={
          workspaceState.status === "error"
            ? workspaceState.message
            : "Job Finder couldn't load."
        }
        title="Couldn't open Job Finder"
        tone="error"
      />
    );
  }

  return (
    <ThemeProvider preference={appearanceTheme || 'system'}>
      <JobFinderShell
        onNavigate={navigateFromShell}
        platform={platform}
        workspace={workspace}
      >
        <Outlet context={context} />
      </JobFinderShell>
      <ApplyCopilotVisualCheckpointDialog
        onClose={cancelApplyCopilotVisualCheckpointRequest}
        onResolve={resolveApplyCopilotVisualCheckpointRequest}
        request={applyCopilotVisualCheckpointRequest}
      />
    </ThemeProvider>
  );
}
