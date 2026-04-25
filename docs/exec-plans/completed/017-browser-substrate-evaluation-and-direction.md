# 017 Browser Substrate Evaluation And Direction

Status: completed

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

## What Landed

- Query-first LinkedIn starts, route hygiene, Chrome attach reuse, and several extraction fixes are landed
- LinkedIn polluted-card parsing and downstream review now recover multiple persisted jobs in truthful rebuilt desktop runs
- Several source-generic cleanup passes landed: no LinkedIn-only direct pass, generic low-yield rescue, generic search-surface naming, reusable adapter tables, centralized route handling, denied-route-aware start reuse, and faster review stop conditions
- Source-debug now uses generic phase selection and step-budget reduction when existing evidence makes full exploration lower value
- Desktop benchmark harness fixes are landed: single-session single-target flows, temporary disabled-target scoping, and end-to-end current-workspace session reuse
- Source-debug now leaves proven draft-guidance runs completed instead of failed when replay adds no new evidence
- Generic title/company extraction now repairs observed `company at role` pollution without adding source-specific core flow
- The seeded catalog runtime no longer imports catalog-session behavior from `browser-agent`; `browser-runtime` owns that deterministic session primitive directly
- Truthful rebuilt desktop benchmarks moved LinkedIn from the old `0`/`1 persisted` ceiling to `5` in single-target `Search now` and `6` in LinkedIn-only `run_all`
- Kosovajob remains the weakest real target for speed and quality, but `0` persisted jobs is acceptable when few visible jobs match the current resume
- Full app-triggered flows are the benchmark source of truth, not narrower service slices

## Accepted Residuals

1. `Check source` can still be optimized with fresh full-app evidence, but known finish-state cleanup for proven draft guidance is landed
2. Title/company quality can be improved for new concrete patterns when observed
3. Kosovajob should be judged by visible-fit evidence, not persisted count alone, because the board can have few suitable matches
4. Future truthful desktop benchmarks must run against a rebuilt desktop bundle; `benchmark-job-finder-app.mjs` launches `out/main/index.cjs` and does not rebuild automatically

## Latest Truthful Checkpoints

- LinkedIn: `Check source` `250.5s` `draft` but failed finish state; `Search now` `53.3s` with `5 persisted`; LinkedIn-only `run_all` `101.6s` with `6 persisted`
- Kosovajob: `Check source` `343.6s` `draft`; `Search now` `205.7s` with `0 persisted`; Kosovajob-only `run_all` `220.8s` with `0 persisted`
- Remote Greenhouse control: `Check source` `190.6s`; `Search now` `0.4s` with `2 persisted`; `run_all` `0.6s` with `2 persisted`
- Full rerun history and report paths: `docs/exec-plans/completed/017-experiment-tracker.md`

## Decisions Already Made

- Keep optimizing the current stack before making a substrate call
- Measure the real app flows, not toy scenarios
- Prefer bigger architectural changes over incrementalism when retained evidence justifies them
- Keep source handling evidence-driven and plug-and-play; avoid provider catalogs or rigid per-source parameter maps in core discovery
- Treat existing provider-specific core discovery policy as cleanup debt to remove, not a pattern to copy
- Keep volatile rerun-by-rerun history out of `docs/STATUS.md` and `docs/TRACKS.md`

## What It Means Now

1. Keep the current Playwright-backed stack; `017` did not prove that a new substrate is necessary
2. Preserve the source-generic architecture ruling from this plan for future discovery work
3. Reopen browser-loop work only through a concrete follow-up with a narrow product goal and fresh full-app evidence

## Evidence

- Full-app benchmark reports: `apps/desktop/test-artifacts/ui/job-finder-app-benchmark/`
- Provider checkpoint: `apps/desktop/test-artifacts/ui/013-benchmark-service/017-provider-phase-fast-path.json`
- Weak-target checkpoints live in `docs/exec-plans/completed/017-experiment-tracker.md`
