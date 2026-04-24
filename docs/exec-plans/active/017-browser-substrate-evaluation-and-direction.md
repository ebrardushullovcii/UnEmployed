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
- LinkedIn polluted `... at ...` card parsing is improved enough for the rebuilt real app to recover cleaner titles like `.NET Software Developer`, `Frontend Engineer`, and `Back-End Engineer`
- cleanup now keeps shared discovery policy source-generic:
  - shared triage no longer has a LinkedIn-only direct pass
  - low-yield technical rescue is now source-generic instead of LinkedIn-only
  - seeded-query preservation in `browser-agent` now uses generic search-surface language and behavior
  - public provider parsing and search-surface extraction helpers now use generic adapter tables and generic helper names instead of source-branded helper functions
  - browser-agent search-surface route handling is centralized as adapter data instead of duplicated source-only helper branches
  - discovery starting-url reuse now honors denied-route guidance instead of silently falling back to a known-bad target URL when no reusable learned routes survive
- Browser-agent deferred search-result review now stops once fast structured extraction has already filled the configured target count, avoiding unnecessary slower extractor work without adding source-specific policy
- Source-debug now uses generic phase selection and step-budget reduction when public provider APIs, route hints, prior phase summaries, or existing instructions make full exploration lower value
- A truthful rebuilt desktop benchmark moved LinkedIn from the old `0`/`1 persisted` ceiling to `6 persisted` in single-target `Search now` and `7 persisted` in LinkedIn-only `run_all`
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

- Latest truthful current-workspace rerun after rebuilding desktop with LinkedIn broad floor/direct pass-through:
  - LinkedIn `Check source`: `232.7s`, still `draft`
  - LinkedIn single-target `Search now`: `63.0s`, `6 persisted`, `0` title-triage skips
  - LinkedIn-only `run_all`: `105.2s`, `7 persisted`, `0` title-triage skips
  - Rebuilt app activity reviewed all collected candidates: `6` promising jobs for `Search now`, `7` for `run_all`
  - Persisted examples included MKY, Stream Team, Quipu, Native Teams, Crossing Hurdles, Jobs Ai, and Confidential Careers
- Latest truthful current-workspace rerun for KosovaJob after rebuilding desktop:
  - KosovaJob `Check source`: `440.3s`, still `draft`
  - KosovaJob single-target `Search now`: `298.5s`, `0 persisted`
  - KosovaJob-only `run_all`: `202.1s`, `0 persisted`
  - Real app activity surfaced only weak non-technical titles like `Category Manager` and `Punëtor`, then skipped them all by title triage
- Latest truthful current-workspace rerun for KosovaJob after live-page inspection and homepage query-first routing:
  - KosovaJob `Check source`: `521.3s`, still `draft`
  - KosovaJob single-target `Search now`: `260.4s`, `0 persisted`
  - KosovaJob-only `run_all`: `180.8s`, `1 persisted`
  - Live inspection confirmed the real filter model is homepage query parameters, not `/search` or `/jobs`
  - Persisted example: `Senior Fullstack Developer – SaaS` at `BEELYNQ`
- Latest non-login control run on the default benchmark harness:
  - Remote Greenhouse `Check source`: `190.6s`, still `draft`
  - Remote Greenhouse single-target `Search now`: `0.4s`, `2 persisted`
  - Remote Greenhouse-only `run_all`: `0.6s`, `2 persisted`
- Previous truthful current-workspace rerun after the broader technical triage widening:
  - LinkedIn `Check source`: `210.7s`, still `draft`
  - LinkedIn single-target `Search now`: `100.3s`, `1 persisted`
  - LinkedIn-only `run_all`: `170.9s`, `1 persisted`
  - LinkedIn now surfaced `6` candidates, but still only kept `1`; the remaining bottleneck is upstream candidate collection and capped selection, not strict downstream triage alone
- Latest truthful current-workspace rerun after the LinkedIn zero-results technical fallback:
  - LinkedIn `Check source`: `232.9s`, still `draft`
  - LinkedIn single-target `Search now`: `153.6s`, `1 persisted`
  - LinkedIn-only `run_all`: `126.2s`, `1 persisted`
  - LinkedIn still only surfaced `5` candidate jobs, but downstream review now kept `1` instead of dropping back to `0`
- Latest truthful current-workspace rerun after the LinkedIn polluted-card parser fix:
  - LinkedIn `Check source`: `217.4s`, still `draft`
  - LinkedIn single-target `Search now`: `96.9s`, `0 persisted`
  - Kosovajob `Check source`: `319.2s`, still `draft`
  - Kosovajob single-target `Search now`: `229.6s`, `0 persisted`
  - mixed `run_all`: `322.3s`, `0 persisted`
- LinkedIn still capped out at only `5` candidate jobs and all `5` were dropped by title/location triage
- Kosovajob still started the real discovery flow from `https://kosovajob.com/search`, hit `/404`, recovered back to the homepage, then collected only weak non-technical jobs that all failed title triage

## Decisions Already Made

- Keep optimizing the current stack before making a substrate call
- Measure the real app flows, not toy scenarios
- Prefer bigger architectural changes over incrementalism when retained evidence justifies them
- Keep source handling evidence-driven and plug-and-play; avoid provider catalogs or rigid per-source parameter maps in core discovery
- Treat existing provider-specific core discovery policy as cleanup debt to remove, not a pattern to copy
- Keep volatile rerun-by-rerun history out of `docs/STATUS.md` and `docs/TRACKS.md`

## Next Steps

1. Rebuild and rerun truthful `Check source` flows to measure the generic phase-selection and step-budget changes before adding more latency work
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
