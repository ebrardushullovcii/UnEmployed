// Router-owned route paths for the Job Finder surfaces. Render them through
// react-router <Link to> (or navigate()) so every in-app navigation goes
// through the router and stays guarded by the page controller's dirty-state
// blocker; do not render them as raw "#/..." anchor hrefs.
export const JOB_FINDER_ROUTE_PATHS = {
  profile: "/job-finder/profile",
  profileTargetRoles:
    "/job-finder/profile?section=preferences&focus=target-roles",
  profileWorkModes: "/job-finder/profile?section=preferences&focus=work-modes",
  profileSources: "/job-finder/profile?section=sources&focus=job-sources",
  discovery: "/job-finder/discovery",
  campaigns: "/job-finder/campaigns",
  reviewQueue: "/job-finder/review-queue",
  applications: "/job-finder/applications",
  documents: "/job-finder/documents",
  settings: "/job-finder/settings",
} as const;
