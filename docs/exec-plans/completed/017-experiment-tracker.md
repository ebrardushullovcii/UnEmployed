# 017 Experiment Tracker

Status: completed

This file retains the working log for completed plan `017`: current baselines, confirmed wins, accepted residuals, reopenable follow-ups, and report paths.

## Architecture Ruling

- `017` does not justify turning shared discovery into a pile of per-board functions or instructions
- do not add new per-source route builders, query maps, triage overrides, or one-off workflow functions in core orchestration
- prefer general solutions that scale across sources: better agent instructions, stronger generic heuristics, and evidence-driven route reuse
- if a source quirk does not generalize, keep it in contained agent behavior or extraction handling instead of codifying it in shared discovery
- existing LinkedIn-only core-path behavior is now explicit cleanup debt, even where it improved benchmarks

## 017 Validation Notes

- pair targeted package tests with full app-triggered benchmark evidence
- treat desktop `Check source`, single-target `Search now`, and `run_all` as the product bar
- do not claim browser wins from unit tests alone

## Baseline

- Product bar is the full desktop flow, not service slices
- Real user baseline that triggered this plan:
  - LinkedIn `Check source`: `5+ min`
  - KosovaJob `Check source`: `9+ min`

## Best Recent Evidence

- LinkedIn current-workspace reused session: `Check source` `250.5s` `draft` but failed finish state; `Search now` `53.3s` with `5 persisted`; LinkedIn-only `run_all` `101.6s` with `6 persisted`
  - report: `apps/desktop/test-artifacts/ui/job-finder-app-benchmark-linkedin-current-20260424-reused/job-finder-app-benchmark-report.json`
- KosovaJob current-workspace reused session: `Check source` `343.6s` `draft`; `Search now` `205.7s` with `0 persisted`; KosovaJob-only `run_all` `220.8s` with `0 persisted`
  - report: `apps/desktop/test-artifacts/ui/job-finder-app-benchmark-kosovajob-current-20260424-reused/job-finder-app-benchmark-report.json`
- Remote Greenhouse non-login control: `Check source` `190.6s` `draft`; `Search now` `0.4s` with `2 persisted`; `run_all` `0.6s` with `2 persisted`
  - report: `apps/desktop/test-artifacts/ui/job-finder-app-benchmark-remote-greenhouse/job-finder-app-benchmark-report.json`
- Useful prior reports:
  - LinkedIn rebuilt direct pass: `apps/desktop/test-artifacts/ui/job-finder-app-benchmark-linkedin-rebuilt-direct-pass/job-finder-app-benchmark-report.json`
  - KosovaJob current workspace: `apps/desktop/test-artifacts/ui/job-finder-app-benchmark-kosovajob-current-workspace/job-finder-app-benchmark-report.json`
  - KosovaJob query-first: `apps/desktop/test-artifacts/ui/job-finder-app-benchmark-kosovajob-query-first/job-finder-app-benchmark-report.json`

## Confirmed Wins

- Fixed benchmark harness correctness: single-session `check_source`/`search_now`, temporary disabled-target scoping, and end-to-end current-workspace session reuse
- Fixed owned Chrome attach and teardown issues that were poisoning reruns
- Landed query-first LinkedIn starts for discovery and source-debug
- Landed route hygiene and restore guards for broken, templated, or placeholder routes
- Improved LinkedIn extraction enough to recover multi-job persistence in single-target discovery
- Fixed browser-agent parsing for polluted reversed LinkedIn cards like `Crossing Hurdles EMEA (Remote) $230K/yr - $280K/yr at Software Engineer (Fullstack)` and added focused regression coverage
- Broadened `job-finder` technical triage so title and location acceptance now use the whole posting evidence, technical family overlap, and remote or hybrid tolerance instead of relying mostly on the raw title string
- Removed several source-specific shared-flow paths: LinkedIn-only direct pass, source-branded rescue naming, source-branded search-surface helpers, and separate public ATS parser functions
- Confirmed the desktop benchmark must be preceded by `pnpm --filter @unemployed/desktop build`; otherwise it can keep exercising stale `out/main/index.cjs`
- Added evidence-driven query-first starts and removed brittle KosovaJob city/industry mappings
- Improved weak-board review budgets and technical-role fallback for KosovaJob-like sources
- Reduced one source-debug cost by skipping final AI review for first-run draft-only failures
- Completed proven-draft source-debug runs instead of marking them failed when replay adds no new evidence
- Moved deterministic catalog-session behavior into `browser-runtime` so the seeded runtime no longer imports catalog behavior from `browser-agent`
- Added generic extraction repair for reversed `company at role` title/company pollution

## Accepted Residuals

- Default seeded benchmark runs are not a truthful proxy for the `017` product bar because the committed fixture uses a London/design profile that does not match the current-workspace LinkedIn and KosovaJob targets used in truthful reruns
- source-named labels may remain where they are provider metadata, profile fields, fixtures, benchmark targets, or reusable adapter data
- LinkedIn can still surface future title/company quality edge cases; fix only concrete observed patterns
- `Check source` may still warrant future speed work if fresh full-app evidence shows product friction
- KosovaJob is now starting from a better homepage query route, but `0` persisted jobs can be valid when the board has few suitable matches for the current resume; judge future work by visible-fit evidence, not count alone
- Provider-backed source-debug should be re-tested when a new browser-loop plan opens

## Reopenable Follow-Ups

1. Finish removing remaining source-named helper debt and replace it with source-generic orchestration rules
2. Remove more first-run `Check source` cost, especially the LinkedIn source-debug path that still returns a failed run state after proving a usable draft route
3. Clean remaining LinkedIn persisted title/company pollution while keeping the new multi-job persistence behavior
4. Keep KosovaJob separate: reduce `Check source` cost, stop over-exploring low-signal pages, and improve technical-job survival on the homepage query/detail pattern that live inspection confirmed
5. Re-test provider-backed source-debug against the current full-app bar

## References

- Plan: `docs/exec-plans/completed/017-browser-substrate-evaluation-and-direction.md`
- Full-app reports: `apps/desktop/test-artifacts/ui/job-finder-app-benchmark/`
- Provider checkpoint: `apps/desktop/test-artifacts/ui/013-benchmark-service/017-provider-phase-fast-path.json`
