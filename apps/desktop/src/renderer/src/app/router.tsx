import { Navigate, createHashRouter } from "react-router-dom";
import {
  InterviewAnswerOverlayRoute,
  InterviewHelperPage,
  InterviewTranscriptOverlayRoute,
} from "../features/interview-helper/interview-helper-page";
import {
  JobFinderActionsRoute,
  JobFinderAnalyticsRoute,
  JobFinderApplicationsRoute,
  JobFinderCompaniesRoute,
  JobFinderCompanyDetailRoute,
  JobFinderDiscoveryRoute,
  JobFinderPage,
  JobFinderProfileRoute,
  JobFinderProfileSetupRoute,
  JobFinderResumeStrategiesRoute,
  JobFinderRouteErrorBoundary,
  JobFinderResumeWorkspaceRoute,
  JobFinderReviewQueueRoute,
  JobFinderSafeguardsRoute,
  JobFinderSettingsRoute,
} from "../pages/job-finder-page";
import {
  JobFinderCampaignsRoute,
  JobFinderHomeRoute,
  JobFinderRapidReviewRoute,
} from "../pages/job-finder-page-routes";

export const appRouter = createHashRouter([
  {
    path: "/",
    element: <Navigate replace to="/job-finder" />,
  },
  {
    path: "/interview-helper",
    element: <InterviewHelperPage />,
  },
  {
    path: "/interview-helper/overlay/answer",
    element: <InterviewAnswerOverlayRoute />,
  },
  {
    path: "/interview-helper/overlay/transcript",
    element: <InterviewTranscriptOverlayRoute />,
  },
  {
    path: "/job-finder",
    errorElement: <JobFinderRouteErrorBoundary scope="app" />,
    element: <JobFinderPage />,
    children: [
      {
        index: true,
        element: <Navigate replace to="home" />,
      },
      {
        path: "home",
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderHomeRoute />,
      },
      {
        path: "campaigns",
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderCampaignsRoute />,
      },
      {
        path: "profile",
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderProfileRoute />,
      },
      {
        path: "profile/setup",
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderProfileSetupRoute />,
      },
      {
        path: "discovery",
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderDiscoveryRoute />,
      },
      {
        path: "rapid-review",
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderRapidReviewRoute />,
      },
      {
        path: "review-queue",
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderReviewQueueRoute />,
      },
      {
        path: "review-queue/:jobId/resume",
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderResumeWorkspaceRoute />,
      },
      {
        path: "actions",
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderActionsRoute />,
      },
      {
        path: "analytics",
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderAnalyticsRoute />,
      },
      {
        path: "applications",
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderApplicationsRoute />,
      },
      {
        path: "settings",
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderSettingsRoute />,
      },
      {
        path: "resume-strategies",
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderResumeStrategiesRoute />,
      },
      {
        path: "safeguards",
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderSafeguardsRoute />,
      },
      {
        path: "companies",
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderCompaniesRoute />,
      },
      {
        path: "companies/:companyId",
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderCompanyDetailRoute />,
      },
    ],
  },
  {
    path: "*",
    element: <Navigate replace to="/job-finder" />,
  },
]);
