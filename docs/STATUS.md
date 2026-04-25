# Status

Read this for active feature work, handoff updates, broad repo changes, or unclear current state.

## Current Truth

- Completed foundations: `007`, `009`, `010`, `011`, `012`, `013`, `014`, `015`, `016`, `017`, `018`, `019`
- Active work: none
- Baseline landed: desktop app, typed Electron boundaries, SQLite persistence, guided setup, profile copilot, discovery, resume workspace, safe non-submitting apply

## What Matters Now

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
- Open a new plan only for a concrete discovery/browser improvement, substrate decision, or ownership cleanup

## Key References

- `docs/TRACKS.md`
- `docs/exec-plans/completed/017-browser-substrate-evaluation-and-direction.md`
- `docs/exec-plans/completed/017-experiment-tracker.md`
- `docs/exec-plans/completed/019-job-finder-world-class-resume-import.md`
- `docs/exec-plans/completed/015-job-finder-automatic-job-apply.md`
