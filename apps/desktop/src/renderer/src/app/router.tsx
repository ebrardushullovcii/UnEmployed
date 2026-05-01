import { Navigate, createHashRouter } from 'react-router-dom'
import {
  JobFinderApplicationsRoute,
  JobFinderDiscoveryRoute,
  JobFinderPage,
  JobFinderProfileRoute,
  JobFinderProfileSetupRoute,
  JobFinderRouteErrorBoundary,
  JobFinderResumeWorkspaceRoute,
  JobFinderReviewQueueRoute,
  JobFinderSettingsRoute
} from '../pages/job-finder-page'

export const appRouter = createHashRouter([
  {
    path: '/',
    element: <Navigate replace to="/job-finder/profile" />
  },
  {
    path: '/job-finder',
    errorElement: <JobFinderRouteErrorBoundary scope="app" />,
    element: <JobFinderPage />,
    children: [
      {
        index: true,
        element: <Navigate replace to="profile" />
      },
      {
        path: 'profile',
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderProfileRoute />
      },
      {
        path: 'profile/setup',
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderProfileSetupRoute />
      },
      {
        path: 'discovery',
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderDiscoveryRoute />
      },
      {
        path: 'review-queue',
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderReviewQueueRoute />
      },
      {
        path: 'review-queue/:jobId/resume',
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderResumeWorkspaceRoute />
      },
      {
        path: 'applications',
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderApplicationsRoute />
      },
      {
        path: 'settings',
        errorElement: <JobFinderRouteErrorBoundary scope="route" />,
        element: <JobFinderSettingsRoute />
      }
    ]
  },
  {
    path: '*',
    element: <Navigate replace to="/job-finder/profile" />
  }
])
