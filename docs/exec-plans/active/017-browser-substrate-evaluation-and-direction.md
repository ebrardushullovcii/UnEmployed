# 017 Browser Substrate Evaluation And Direction

Status: active

## Goal

Improve the real desktop browser loop on the current stack before deciding whether a new substrate is necessary.

Primary user-facing bar:

1. Faster `Check source`
2. Better single-target `Search now`
3. Better `run_all`
4. Better job quality, not just lower wall-clock

## Scope

- production improvements on the current Playwright-backed path
- benchmark-driven diagnosis of remaining bottlenecks
- bounded substrate evaluation only after the current stack has been pushed further

## Hard Constraints

1. `packages/job-finder` owns orchestration
2. `packages/browser-agent` owns workflow policy, prompts, and structured outputs
3. `packages/browser-runtime` stays generic
4. contracts stay typed and schema-validated
5. replay artifacts, approvals, consent interrupts, and evidence stay first-class
6. do not run live submit or final-submit QA unless explicitly re-authorized
7. do not add new per-source route builders, query maps, triage overrides, or one-off workflow functions in shared discovery orchestration
8. prefer general solutions that scale across sources: stronger agent instructions, evidence-driven route reuse, and generic heuristics
9. if a source quirk does not generalize, keep it contained in agent behavior or extraction handling instead of codifying it in core flow

## Current State

- Query-first LinkedIn starts, route hygiene, Chrome attach reuse, and several extraction fixes are landed
- LinkedIn polluted-card parsing and downstream review now recover multiple persisted jobs in truthful rebuilt desktop runs
- Several source-generic cleanup passes landed: no LinkedIn-only direct pass, generic low-yield rescue, generic search-surface naming, reusable adapter tables, centralized route handling, denied-route-aware start reuse, and faster review stop conditions
- Source-debug now uses generic phase selection and step-budget reduction when existing evidence makes full exploration lower value
- Desktop benchmark harness fixes are landed: single-session single-target flows, temporary disabled-target scoping, and end-to-end current-workspace session reuse
- Truthful rebuilt desktop benchmarks moved LinkedIn from the old `0`/`1 persisted` ceiling to `5` in single-target `Search now` and `6` in LinkedIn-only `run_all`
- Kosovajob remains the weakest real target for both speed and quality
- Full app-triggered flows are the benchmark source of truth, not narrower service slices

## Highest-Signal Open Problems

1. `Check source` still overpays on phase count and synchronous review cost
2. LinkedIn candidate quality is now good enough to persist multiple jobs, but some titles/companies remain polluted and should be cleaned further
3. Kosovajob discovery still spends too much effort on weak or non-technical jobs
4. `browser-runtime` still has a catalog-session seam that depends on `browser-agent`
5. Future truthful desktop benchmarks must run against a rebuilt desktop bundle; `benchmark-job-finder-app.mjs` launches `out/main/index.cjs` and does not rebuild automatically
6. Root repo lint is currently blocked by unrelated `packages/browser-runtime/src/playwright-browser-runtime.test.ts` violations, so cleanup validation should rely on focused package lint plus root docs and typecheck until that debt is cleared

## Latest Truthful Checkpoints

- LinkedIn: `Check source` `250.5s` `draft` but failed finish state; `Search now` `53.3s` with `5 persisted`; LinkedIn-only `run_all` `101.6s` with `6 persisted`
- Kosovajob: `Check source` `343.6s` `draft`; `Search now` `205.7s` with `0 persisted`; Kosovajob-only `run_all` `220.8s` with `0 persisted`
- Remote Greenhouse control: `Check source` `190.6s`; `Search now` `0.4s` with `2 persisted`; `run_all` `0.6s` with `2 persisted`
- Full rerun history and report paths: `docs/exec-plans/active/017-experiment-tracker.md`

## Decisions Already Made

- Keep optimizing the current stack before making a substrate call
- Measure the real app flows, not toy scenarios
- Prefer bigger architectural changes over incrementalism when retained evidence justifies them
- Keep source handling evidence-driven and plug-and-play; avoid provider catalogs or rigid per-source parameter maps in core discovery
- Treat existing provider-specific core discovery policy as cleanup debt to remove, not a pattern to copy
- Keep volatile rerun-by-rerun history out of `docs/STATUS.md` and `docs/TRACKS.md`

## Next Steps

1. Rebuild and rerun truthful `Check source` flows to measure the generic phase-selection and step-budget changes before adding more latency work, with special attention to the remaining LinkedIn source-debug failed-finish behavior
2. Keep auditing source-named helper debt; remaining source labels should stay limited to provider metadata, profile fields, fixtures, or reusable adapter data
3. Clean remaining LinkedIn title/company pollution now that multiple candidates survive into persistence
4. Keep Kosovajob as a separate investigation path from LinkedIn: reduce source-debug and discovery over-exploration, then improve technical-role survival on the homepage query/detail pattern that the real app actually observes without adding Kosovajob-only branches to core `job-finder` discovery orchestration
   - Any Kosovajob-specific handling must stay inside contained `browser-agent` extraction or navigation logic, or reusable adapter data, not shared discovery policy
   - This must conform to `docs/ARCHITECTURE.md`: core `job-finder` discovery remains source-generic while unavoidable site quirks stay contained in `browser-agent` or adapter data
5. Fix the `browser-runtime` -> `browser-agent` catalog seam if it blocks clearer ownership or further optimization
6. Revisit alternate substrates only after the current stack has another measured pass

## Evidence

- Full-app benchmark reports: `apps/desktop/test-artifacts/ui/job-finder-app-benchmark/`
- Provider checkpoint: `apps/desktop/test-artifacts/ui/013-benchmark-service/017-provider-phase-fast-path.json`
- Weak-target checkpoints live in `docs/exec-plans/active/017-experiment-tracker.md`
