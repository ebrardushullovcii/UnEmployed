# Status

Read this for active feature work, handoff updates, broad repo changes, or unclear current state.

## Current Truth

- Completed foundations: `007`, `009`, `010`, `011`, `012`, `013`, `014`, `015`, `016`, `018`, `019`
- Active work: `017 Browser Substrate Evaluation And Direction`
- Baseline landed: desktop app, typed Electron boundaries, SQLite persistence, guided setup, profile copilot, discovery, resume workspace, safe non-submitting apply

## What Matters Now

- `017` optimizes the real desktop browser loop on the current stack before any substrate change
- Product bar: faster `Check source`, better single-target `Search now`, better `run_all`, better job quality
- Preserve evidence, replayability, approvals, consent interrupts, typed boundaries, and source-generic discovery
- Live submit remains disabled unless explicitly re-authorized

## Open Problems

- `Check source` remains too slow, especially Kosovajob; LinkedIn source-debug can still finish as failed after proving a usable draft route
- LinkedIn now persists multiple jobs, but some title/company fields remain polluted
- Kosovajob still needs stronger route/extraction behavior on the homepage query/detail pattern and better technical-job survival
- `browser-runtime` still imports catalog session creation from `browser-agent`

## Latest 017 Snapshot

- Landed: LinkedIn query-first starts, route hygiene, Chrome attach reuse, extraction fixes, benchmark harness session reuse/scoping fixes, and several source-generic cleanup passes
- Latest truthful rebuilt reruns: LinkedIn can persist `5` jobs in single-target `Search now` and `6` in LinkedIn-only `run_all`; Kosovajob persists `0` in both flows
- Benchmark reminder: rebuild desktop first because `apps/desktop/scripts/benchmark-job-finder-app.mjs` launches `out/main/index.cjs`
- Volatile benchmark detail lives in `docs/exec-plans/active/017-experiment-tracker.md`

## Hard Decisions

- Keep `packages/job-finder` as orchestration owner
- Keep `packages/browser-agent` for workflow policy, prompts, and structured outputs
- Keep `packages/browser-runtime` generic
- Keep shared discovery logic source-generic; board-specific rescue logic in core flow is debt, not a model to repeat
- Keep contracts typed and schema-validated
- Keep docs short; volatile benchmark-by-benchmark history belongs in the active plan tracker, not here

## Next Step

- Work from `docs/TRACKS.md` and `docs/exec-plans/active/017-browser-substrate-evaluation-and-direction.md`
- Prioritize `Check source` cost, LinkedIn title/company cleanup, LinkedIn source-debug finish state, source-generic regression checks, and Kosovajob extraction/quality

## Key References

- `docs/TRACKS.md`
- `docs/exec-plans/active/017-browser-substrate-evaluation-and-direction.md`
- `docs/exec-plans/active/017-experiment-tracker.md`
- `docs/exec-plans/completed/019-job-finder-world-class-resume-import.md`
- `docs/exec-plans/completed/015-job-finder-automatic-job-apply.md`
