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
- `Check source` is still too slow, especially on Kosovajob
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
  - browser-agent search-result review now stops deferred or slower extraction once fast structured extraction has already filled the target job count
  - source-debug now uses generic phase selection and step-budget reduction when public provider APIs, route hints, prior phase summaries, or existing instructions make full exploration lower value
- Non-app validation after the cleanup passed for the touched packages and docs:
  - `pnpm agents:sync`
  - `pnpm agents:check`
  - `pnpm docs:check`
  - `pnpm --filter @unemployed/job-finder lint`
  - `pnpm --filter @unemployed/job-finder typecheck`
  - `pnpm --filter @unemployed/browser-agent typecheck`
  - focused `job-finder` and `browser-agent` unit suites covering the cleanup
- Root `pnpm lint` is still blocked by pre-existing `packages/browser-runtime/src/playwright-browser-runtime.test.ts` lint errors outside this change set
- Rebuilt truthful LinkedIn rerun: `232.7s` `Check source`, `63.0s` single-target `Search now` with `6 persisted`, and `105.2s` LinkedIn-only `run_all` with `7 persisted`
- Benchmark note: rebuild desktop before judging source changes because `apps/desktop/scripts/benchmark-job-finder-app.mjs` launches the built `out/main/index.cjs`
- Kosovajob remains unchanged as the other dominant blocker: the real app flow still enters `/search` then `/404` before recovering to the homepage and collecting weak non-technical jobs

## Hard Decisions

- Keep `packages/job-finder` as orchestration owner
- Keep `packages/browser-agent` for workflow policy, prompts, and structured outputs
- Keep `packages/browser-runtime` generic
- Keep shared discovery logic source-generic; board-specific rescue logic in core flow is debt, not a model to repeat
- Keep contracts typed and schema-validated
- Keep docs short; volatile benchmark-by-benchmark history belongs in the active plan tracker, not here

## Next Step

- Work from `docs/TRACKS.md` and `docs/exec-plans/active/017-browser-substrate-evaluation-and-direction.md`
- Prioritize `Check source` speed, continued source-generic regression checks, LinkedIn title/company cleanup, and the separate Kosovajob route/extraction problem

## Key References

- `docs/TRACKS.md`
- `docs/exec-plans/active/017-browser-substrate-evaluation-and-direction.md`
- `docs/exec-plans/active/017-experiment-tracker.md`
- `docs/exec-plans/completed/019-job-finder-world-class-resume-import.md`
- `docs/exec-plans/completed/015-job-finder-automatic-job-apply.md`
