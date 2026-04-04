import { JobFinderShell } from "@renderer/features/job-finder/components/job-finder-shell";
import { ThemeProvider } from "@renderer/app/theme-provider";
import { Outlet } from "react-router-dom";
import { WorkspaceStateScreen } from "./job-finder-page-routes";
import { useJobFinderPageController } from "./use-job-finder-page-controller";

export {
  JobFinderApplicationsRoute,
  JobFinderDiscoveryRoute,
  JobFinderProfileRoute,
  JobFinderResumeWorkspaceRoute,
  JobFinderReviewQueueRoute,
  JobFinderSettingsRoute,
} from "./job-finder-page-routes";
export type { JobFinderPageContext } from "./job-finder-page-routes";

export function JobFinderPage() {
  const {
    appearanceTheme,
    context,
    navigateFromShell,
    platform,
    workspace,
    workspaceState,
  } =
    useJobFinderPageController();

  if (!context || !workspace) {
    if (workspaceState.status === "loading") {
      return (
        <WorkspaceStateScreen
          kicker="UnEmployed"
          message="Loading the Job Finder workspace and typed desktop context."
          title="Booting Job Finder workspace"
        />
      );
    }

    return (
      <WorkspaceStateScreen
        kicker="Workspace Error"
        message={
          workspaceState.status === "error"
            ? workspaceState.message
            : "Job Finder failed to load"
        }
        title="Job Finder failed to load"
        tone="error"
      />
    );
  }

  return (
    <ThemeProvider preference={appearanceTheme || 'system'}>
      <JobFinderShell
        actionMessage={context.actionState.message}
        onNavigate={navigateFromShell}
        platform={platform}
        workspace={workspace}
      >
        <Outlet context={context} />
      </JobFinderShell>
    </ThemeProvider>
  );
}
