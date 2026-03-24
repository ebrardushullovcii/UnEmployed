import { Navigate, createHashRouter } from 'react-router-dom'
import {
  JobFinderApplicationsRoute,
  JobFinderDiscoveryRoute,
  JobFinderPage,
  JobFinderProfileRoute,
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
    element: <JobFinderPage />,
    children: [
      {
        index: true,
        element: <Navigate replace to="profile" />
      },
      {
        path: 'profile',
        element: <JobFinderProfileRoute />
      },
      {
        path: 'discovery',
        element: <JobFinderDiscoveryRoute />
      },
      {
        path: 'review-queue',
        element: <JobFinderReviewQueueRoute />
      },
      {
        path: 'applications',
        element: <JobFinderApplicationsRoute />
      },
      {
        path: 'settings',
        element: <JobFinderSettingsRoute />
      }
    ]
  },
  {
    path: '*',
    element: <Navigate replace to="/job-finder/profile" />
  }
])
