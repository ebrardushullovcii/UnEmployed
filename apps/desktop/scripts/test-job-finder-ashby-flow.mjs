/* eslint-env node */

const boardSlug = process.env.JOB_FINDER_ASHBY_BOARD_SLUG ?? "constructor";
const preferredTitle = process.env.JOB_FINDER_ASHBY_TITLE ?? "Software Engineer: Core";
const response = await fetch(
  `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardSlug)}`,
);

if (!response.ok) {
  throw new Error(`Ashby board lookup failed with status ${response.status}.`);
}

const payload = await response.json();
const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
const selectedJob =
  jobs.find(
    (job) =>
      job?.isListed !== false &&
      typeof job?.title === "string" &&
      job.title.toLowerCase() === preferredTitle.toLowerCase() &&
      typeof job?.jobUrl === "string",
  ) ??
  jobs.find(
    (job) =>
      job?.isListed !== false &&
      typeof job?.title === "string" &&
      /\bsoftware engineer\b/iu.test(job.title) &&
      typeof job?.jobUrl === "string",
  );

if (!selectedJob) {
  throw new Error(`No current Software Engineer vacancy was available on Ashby board '${boardSlug}'.`);
}

process.env.JOB_FINDER_PREPARE_ONLY_LABEL =
  process.env.JOB_FINDER_PREPARE_ONLY_LABEL ?? "complete-flow-current-ashby";
process.env.JOB_FINDER_PREPARE_ONLY_AUTHORIZE_INTERMEDIATE_WRITES = "1";
process.env.JOB_FINDER_PREPARE_ONLY_EXPECT_EXACT_SOURCE_JOB = "1";
process.env.JOB_FINDER_PREPARE_ONLY_REQUIRE_FINAL_CHECKPOINT = "1";
process.env.JOB_FINDER_PREPARE_ONLY_RESUME_MODE = "original_resume";
process.env.JOB_FINDER_PREPARE_ONLY_USE_LIVE_DISCOVERY_AI = "0";
process.env.JOB_FINDER_PREPARE_ONLY_SOURCE_ID = `target_ashby_${boardSlug}_complete_flow`;
process.env.JOB_FINDER_PREPARE_ONLY_SOURCE_LABEL = `${boardSlug} Ashby`;
process.env.JOB_FINDER_PREPARE_ONLY_SOURCE_URL = selectedJob.jobUrl;
process.env.JOB_FINDER_PREPARE_ONLY_TARGET_ROLES = selectedJob.title;

await import("./test-job-finder-prepare-only.mjs");
