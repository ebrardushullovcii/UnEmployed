import { EmptyState } from "../../components/empty-state";
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
        <EmptyState
          title="Application details will appear here"
          description="Start an application from the list on the left."
        />
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
