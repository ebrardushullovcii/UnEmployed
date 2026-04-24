# Status

## Current Truth

- Completed foundations: `007`, `009`, `010`, `011`, `012`, `013`, `014`, `015`, `016`, `018`, `019`
- Active work: `017 Browser Substrate Evaluation And Direction`
- Product baseline: desktop app, typed Electron boundaries, SQLite persistence, guided setup, profile copilot, discovery, resume workspace, and safe non-submitting apply are all landed

## What Matters Now

- `017` is about the real desktop product loop, not abstract browser-stack debate
- Optimize full app-triggered `Check source`, single-target `Search now`, and `run_all`
- Keep evidence, replayability, approvals, consent interrupts, and typed boundaries intact
- Keep core discovery plug-and-play across job sources; do not respond to one source by adding more per-board shared-policy code
- Do not enable live submit flows unless explicitly re-authorized

## Current Problems

- LinkedIn now persists multiple jobs in the rebuilt real desktop flow, but some persisted title/company fields remain polluted
- `Check source` is still too slow, especially on Kosovajob, and LinkedIn source-debug can still end in a failed run state after proving a usable draft route
- Kosovajob discovery still collects weak or non-technical jobs, persists too little, and the real app flow is still reusing a broken `/search` route
- One architecture seam still violates the intended boundary: `browser-runtime` depends on `browser-agent` for catalog session creation

## Latest 017 Snapshot

- LinkedIn query-first starts, route hygiene, Chrome attach reuse, and several extraction fixes are landed
- A focused browser-agent fix now correctly parses polluted reversed LinkedIn cards such as `Crossing Hurdles ... at Software Engineer (Fullstack)` and is covered by regression tests
- cleanup now keeps shared discovery policy source-generic:
  - LinkedIn-only direct-pass behavior was removed from shared triage flow
  - low-yield technical rescue is now source-generic instead of LinkedIn-only
  - seeded-query preservation and search-surface extraction helpers in `browser-agent` now use generic naming and behavior instead of source-branded helper APIs
  - public provider parsing in `job-finder` now uses generic adapter tables instead of separate per-source parser functions
  - browser-agent search-surface route handling is centralized as adapter data instead of duplicated source-only helper branches
  - discovery starting-url reuse now respects denied route guidance even when no other learned routes survive, so shared flow does not silently fall back to a known-bad start URL
  - browser-agent search-result review now stops deferred or slower extraction once fast structured extraction has already filled the target job count
  - source-debug now uses generic phase selection and step-budget reduction when public provider APIs, route hints, prior phase summaries, or existing instructions make full exploration lower value
- Detailed validation history, benchmark timings, and volatile rerun notes now live in `docs/exec-plans/active/017-experiment-tracker.md`
- Benchmark reminder: rebuild desktop before judging source changes because `apps/desktop/scripts/benchmark-job-finder-app.mjs` launches the built `out/main/index.cjs`
- Benchmark harness correctness fixes are landed:
  - single-target `check_source` and `search_now` now share one Electron session so discovery can reuse freshly learned source-debug artifacts
  - current-workspace benchmarks can temporarily scope explicitly requested disabled targets and restore target enablement afterward
  - current-workspace benchmarks now reuse one Electron session end-to-end instead of resolving targets in one app launch and benchmarking in another
- Latest truthful current-workspace reruns on the rebuilt app show LinkedIn is still healthy enough to persist `5` jobs in single-target `Search now` and `6` jobs in LinkedIn-only `run_all`; Kosovajob remains the dominant weak target with `0` persisted jobs in both flows
- Kosovajob remains the dominant weak target: the real app flow still needs faster source-debug and stronger technical-job survival on the homepage query/detail pattern

## Hard Decisions

- Keep `packages/job-finder` as orchestration owner
- Keep `packages/browser-agent` for workflow policy, prompts, and structured outputs
- Keep `packages/browser-runtime` generic
- Keep shared discovery logic source-generic; board-specific rescue logic in core flow is debt, not a model to repeat
- Keep contracts typed and schema-validated
- Keep docs short; volatile benchmark-by-benchmark history belongs in the active plan tracker, not here

## Next Step

- Work from `docs/TRACKS.md` and `docs/exec-plans/active/017-browser-substrate-evaluation-and-direction.md`
- Prioritize `Check source` speed, continued source-generic regression checks, LinkedIn title/company cleanup, the remaining LinkedIn source-debug finish-state issue, and the separate Kosovajob route/extraction problem

## Key References

- `docs/TRACKS.md`
- `docs/exec-plans/active/017-browser-substrate-evaluation-and-direction.md`
- `docs/exec-plans/active/017-experiment-tracker.md`
- `docs/exec-plans/completed/019-job-finder-world-class-resume-import.md`
- `docs/exec-plans/completed/015-job-finder-automatic-job-apply.md`
