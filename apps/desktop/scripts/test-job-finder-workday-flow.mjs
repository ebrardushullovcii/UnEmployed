/* eslint-env node */

const hostname = process.env.JOB_FINDER_WORKDAY_HOST ?? "amat.wd1.myworkdayjobs.com";
const tenant = process.env.JOB_FINDER_WORKDAY_TENANT ?? "amat";
const siteId = process.env.JOB_FINDER_WORKDAY_SITE ?? "External";
const locale = process.env.JOB_FINDER_WORKDAY_LOCALE ?? "en-US";
const preferredTitle = process.env.JOB_FINDER_WORKDAY_TITLE ?? "Software Engineer";
const response = await fetch(
  `https://${hostname}/wday/cxs/${encodeURIComponent(tenant)}/${encodeURIComponent(siteId)}/jobs`,
  {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      appliedFacets: {},
      limit: 20,
      offset: 0,
      searchText: preferredTitle,
    }),
  },
);

if (!response.ok) {
  throw new Error(`Workday board lookup failed with status ${response.status}.`);
}

const payload = await response.json();
const jobs = Array.isArray(payload?.jobPostings) ? payload.jobPostings : [];
const selectedJob =
  jobs.find(
    (job) =>
      typeof job?.title === "string" &&
      job.title.toLowerCase() === preferredTitle.toLowerCase() &&
      typeof job?.externalPath === "string",
  ) ??
  jobs.find(
    (job) =>
      typeof job?.title === "string" &&
      /\bsoftware engineer\b/iu.test(job.title) &&
      typeof job?.externalPath === "string",
  );

if (!selectedJob) {
  throw new Error(`No current Software Engineer vacancy was available on Workday site '${tenant}/${siteId}'.`);
}

const jobUrl = `https://${hostname}/${locale}/${siteId}${selectedJob.externalPath}`;
process.env.JOB_FINDER_PREPARE_ONLY_LABEL =
  process.env.JOB_FINDER_PREPARE_ONLY_LABEL ?? "complete-flow-current-workday";
process.env.JOB_FINDER_PREPARE_ONLY_AUTHORIZE_INTERMEDIATE_WRITES = "1";
process.env.JOB_FINDER_PREPARE_ONLY_EXPECT_EXACT_SOURCE_JOB = "1";
process.env.JOB_FINDER_PREPARE_ONLY_REQUIRE_FINAL_CHECKPOINT = "0";
process.env.JOB_FINDER_PREPARE_ONLY_EXPECT_BLOCKER_CODE = "site_login_required";
process.env.JOB_FINDER_PREPARE_ONLY_RESUME_MODE = "original_resume";
process.env.JOB_FINDER_PREPARE_ONLY_USE_LIVE_DISCOVERY_AI = "0";
process.env.JOB_FINDER_PREPARE_ONLY_SOURCE_ID = `target_workday_${tenant}_${siteId}_complete_flow`;
process.env.JOB_FINDER_PREPARE_ONLY_SOURCE_LABEL = `${tenant} Workday`;
process.env.JOB_FINDER_PREPARE_ONLY_SOURCE_URL = jobUrl;
process.env.JOB_FINDER_PREPARE_ONLY_TARGET_ROLES = selectedJob.title;

await import("./test-job-finder-prepare-only.mjs");
