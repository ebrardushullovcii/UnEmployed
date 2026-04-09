## Summary
- Merge and renumber queued job-finder plans to 011..017.
- Updated canonical docs: docs/README.md, docs/STATUS.md, docs/TRACKS.md, docs/modules/JOB_FINDER.md
- Added new plans: docs/exec-plans/queued/013-job-finder-source-intelligence-and-faster-discovery.md, docs/exec-plans/queued/014-job-finder-resume-output-and-template-quality.md, docs/exec-plans/queued/015-job-finder-automatic-job-apply.md, docs/exec-plans/queued/017-browser-substrate-evaluation-and-direction.md
- Removed old/merged plans: docs/exec-plans/queued/014-job-finder-structured-source-debug-artifacts.md, docs/exec-plans/queued/015-job-finder-deterministic-discovery-and-provider-research.md, docs/exec-plans/queued/017-job-finder-automatic-job-apply.md, docs/exec-plans/queued/018-browser-substrate-evaluation-and-direction.md

## Why
- Remove duplicates and produce a gap-free, execution-ready plan sequence for Job Finder.

## How to verify
- pnpm docs:check
- pnpm --filter @unemployed/contracts test
- pnpm --filter @unemployed/job-finder test
- pnpm --filter @unemployed/browser-agent test
- pnpm --filter @unemployed/desktop build

## Next steps
- Implement the plan work items in the ordered sequence; see exec-plans for details.

## Changed files
- docs/README.md
- docs/STATUS.md
- docs/TRACKS.md
- docs/modules/JOB_FINDER.md
- docs/exec-plans/queued/011-job-finder-shared-data-expansion.md
- docs/exec-plans/queued/012-job-finder-guided-setup-and-profile-copilot.md
- docs/exec-plans/queued/013-job-finder-source-intelligence-and-faster-discovery.md
- docs/exec-plans/queued/014-job-finder-resume-output-and-template-quality.md
- docs/exec-plans/queued/015-job-finder-automatic-job-apply.md
- docs/exec-plans/queued/016-shared-agent-auto-compaction.md
- docs/exec-plans/queued/017-browser-substrate-evaluation-and-direction.md
