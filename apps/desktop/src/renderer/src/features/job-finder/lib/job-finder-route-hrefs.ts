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

/**
 * Search plans carries the plan editor; `edit=plan` asks it to open that
 * plan's editor on arrival, which is the same editor the plan card's Edit
 * button opens.
 */
export const CAMPAIGN_PLAN_EDITOR_SEARCH_PARAM = "edit";
export const CAMPAIGN_PLAN_EDITOR_SEARCH_VALUE = "plan";

/**
 * One plan's editor, open and ready to change.
 *
 * Find jobs offers "Edit this plan's places" in two places. Both used to link
 * to the plan list, so a person who asked to change where this search looks
 * landed on a screen of plan cards and had to find the plan and press Edit
 * again. The link now names the plan it is about.
 */
export function campaignPlanEditorHref(campaignId: string): string {
  return `${JOB_FINDER_ROUTE_PATHS.campaigns}?campaignId=${encodeURIComponent(
    campaignId,
  )}&${CAMPAIGN_PLAN_EDITOR_SEARCH_PARAM}=${CAMPAIGN_PLAN_EDITOR_SEARCH_VALUE}`;
}
