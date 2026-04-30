import { Button } from "@renderer/components/ui";
import { EmptyState } from "../../components/empty-state";
import { JOB_FINDER_ROUTE_HREFS } from "../../lib/job-finder-route-hrefs";
import {
  APPLICATION_FILTER_LABELS,
  type ApplicationsViewFilter,
} from "./applications-filters";

export function ApplicationsDetailPanelEmptyState(props: {
  activeFilter: ApplicationsViewFilter;
  hasAnyApplications: boolean;
  hasVisibleApplications: boolean;
}) {
  const { activeFilter, hasAnyApplications, hasVisibleApplications } = props;

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center pt-12">
      {!hasAnyApplications ? (
        <div className="grid w-full gap-4">
          <EmptyState
            title="Applications keeps follow-up in one place"
            description="Start from Shortlisted after approving a resume, or find more jobs if you do not have a shortlist yet."
          />
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="sm" type="button" variant="primary">
              <a href={JOB_FINDER_ROUTE_HREFS.reviewQueue}>Open Shortlisted</a>
            </Button>
            <Button asChild size="sm" type="button" variant="ghost">
              <a href={JOB_FINDER_ROUTE_HREFS.discovery}>Find jobs</a>
            </Button>
          </div>
        </div>
      ) : (
        <EmptyState
          title={
            hasVisibleApplications
              ? "Choose an application"
              : "No applications in this view"
          }
          description={
            hasVisibleApplications
              ? "Select an application to review its stage, latest apply attempt, and timeline."
              : `Try another filter if you want to review applications outside the ${APPLICATION_FILTER_LABELS[activeFilter]} view.`
          }
        />
      )}
    </div>
  );
}
