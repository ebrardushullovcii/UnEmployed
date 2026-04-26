# Status

Read this for active feature work, handoff updates, broad repo changes, or unclear current state.

## Current Truth

- Completed foundations: `007`, `009`, `010`, `011`, `012`, `013`, `014`, `015`, `016`, `017`, `018`, `019`
- Active work: none
- Baseline landed: desktop app, typed Electron boundaries, SQLite persistence, guided setup, profile copilot, discovery, resume workspace, safe non-submitting apply

## What Matters Now

- `023` is queued: resume generation quality has a defined next plan, but it is not the active execution track yet
- `020` is completed: Job Finder routes now use scoped pending lanes with clearer disabled and in-progress button feedback across desktop flows
- `021` is completed: resume-import duplicate records, fresh-start placeholder replacement, optional-proof warning cleanup, and date-derived years-of-experience fallback are now part of the landed import baseline
- `017` completed the current-stack browser loop evaluation and did not justify a substrate change yet
- Future discovery/browser work should start from completed `017` evidence and stay source-generic
- Preserve evidence, replayability, approvals, consent interrupts, typed boundaries, and source-generic discovery
- Live submit remains disabled unless explicitly re-authorized

## Reopenable Follow-Ups

- Continue reducing real-app `Check source` cost when fresh full-app evidence shows product friction
- Clean persisted title/company quality when extracted jobs are otherwise useful and a concrete pattern is observed
- Treat Kosovajob `0` persisted jobs as context-dependent, not automatically a failure, because the board can have few suitable matches for the current resume

## Latest 017 Snapshot

- Landed: LinkedIn query-first starts, route hygiene, Chrome attach reuse, extraction fixes, benchmark harness session reuse/scoping fixes, source-debug finish-state cleanup, catalog-runtime ownership cleanup, and several source-generic cleanup passes
- Latest truthful rebuilt reruns: LinkedIn can persist `5` jobs in single-target `Search now` and `6` in LinkedIn-only `run_all`; Kosovajob persists `0` in both flows
- Benchmark reminder: rebuild desktop first because `apps/desktop/scripts/benchmark-job-finder-app.mjs` launches `out/main/index.cjs`
- Volatile benchmark detail lives in `docs/exec-plans/completed/017-experiment-tracker.md`

## Hard Decisions

- Keep `packages/job-finder` as orchestration owner
- Keep `packages/browser-agent` for workflow policy, prompts, and structured outputs
- Keep `packages/browser-runtime` generic
- Keep shared discovery logic source-generic; board-specific rescue logic in core flow is debt, not a model to repeat
- Keep contracts typed and schema-validated
- Keep docs short; volatile benchmark-by-benchmark history belongs in completed plan trackers, not here

## Next Step

- Work from `docs/TRACKS.md`
- Pull the next explicit active plan from `docs/TRACKS.md`

## Key References

- `docs/TRACKS.md`
- `docs/exec-plans/queued/023-job-finder-world-class-resume-generation-quality.md`
- `docs/exec-plans/completed/020-job-finder-scoped-button-pending-state-and-feedback.md`
- `docs/exec-plans/completed/017-browser-substrate-evaluation-and-direction.md`
- `docs/exec-plans/completed/017-experiment-tracker.md`
- `docs/exec-plans/completed/019-job-finder-world-class-resume-import.md`
- `docs/exec-plans/completed/021-job-finder-resume-import-duplicate-record-deduplication.md`
- `docs/exec-plans/completed/015-job-finder-automatic-job-apply.md`
