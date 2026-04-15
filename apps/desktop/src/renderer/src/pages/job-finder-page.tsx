import { JobFinderShell } from "@renderer/features/job-finder/components/job-finder-shell";
import { ThemeProvider } from "@renderer/app/theme-provider";
import { Outlet } from "react-router-dom";
import { WorkspaceStateScreen } from "./job-finder-page-routes";
import { useJobFinderPageController } from "./use-job-finder-page-controller";

export {
  JobFinderApplicationsRoute,
  JobFinderDiscoveryRoute,
  JobFinderProfileRoute,
  JobFinderProfileSetupRoute,
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
