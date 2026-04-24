# 017 Experiment Tracker

Status: active

This file is the short working log for `017`. Keep it to baselines, confirmed wins, open bottlenecks, and next experiments.

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
  - Kosovajob `Check source`: `9+ min`

## Best Recent Evidence

- Latest truthful current-workspace rerun after rebuilding desktop with LinkedIn broad floor/direct pass-through:
  - LinkedIn `Check source`: `232.7s`, `draft`
  - LinkedIn single-target `Search now`: `63.0s`, `6 persisted`, `0` title-triage skips
  - LinkedIn-only `run_all`: `105.2s`, `7 persisted`, `0` title-triage skips
  - Activity proved the rebuilt app reviewed every collected LinkedIn candidate instead of keeping only one
  - Report: `apps/desktop/test-artifacts/ui/job-finder-app-benchmark-linkedin-rebuilt-direct-pass/job-finder-app-benchmark-report.json`
- Latest truthful current-workspace rerun for KosovaJob after rebuilding desktop:
  - KosovaJob `Check source`: `440.3s`, `draft`
  - KosovaJob single-target `Search now`: `298.5s`, `0 persisted`
  - KosovaJob-only `run_all`: `202.1s`, `0 persisted`
  - `Search now` surfaced only `1` candidate and skipped it by title; `run_all` surfaced `6` candidates and skipped all `6` by title
  - Report: `apps/desktop/test-artifacts/ui/job-finder-app-benchmark-kosovajob-current-workspace/job-finder-app-benchmark-report.json`
- Latest truthful current-workspace rerun for KosovaJob after live-page inspection and homepage query-first routing:
  - KosovaJob `Check source`: `521.3s`, `draft`
  - KosovaJob single-target `Search now`: `260.4s`, `0 persisted`
  - KosovaJob-only `run_all`: `180.8s`, `1 persisted`
  - Source-debug now proves the real filter model: homepage query parameters exist (`?q=` plus additional source-specific filters like `jobCity=` and `jobIndustry=`); `/jobs` still returns `404`
  - `run_all` kept `Senior Fullstack Developer – SaaS` at `BEELYNQ`
  - Report: `apps/desktop/test-artifacts/ui/job-finder-app-benchmark-kosovajob-query-first/job-finder-app-benchmark-report.json`
- Latest non-login control rerun on default benchmark harness:
  - Remote Greenhouse `Check source`: `190.6s`, `draft`
  - Remote Greenhouse single-target `Search now`: `0.4s`, `2 persisted`
  - Remote Greenhouse-only `run_all`: `0.6s`, `2 persisted`
  - Report: `apps/desktop/test-artifacts/ui/job-finder-app-benchmark-remote-greenhouse/job-finder-app-benchmark-report.json`
- Previous truthful current-workspace rerun after the broader technical triage widening:
  - LinkedIn `Check source`: `210.7s`, `draft`
  - LinkedIn single-target `Search now`: `100.3s`, `1 persisted`
  - LinkedIn-only `run_all`: `170.9s`, `1 persisted`
  - LinkedIn surfaced `6` candidates, but still only kept `1`, which points the next effort upstream at extraction or capped selection rather than stricter triage alone
- Latest truthful current-workspace rerun after the LinkedIn zero-results technical fallback:
  - LinkedIn `Check source`: `232.9s`, `draft`
  - LinkedIn single-target `Search now`: `153.6s`, `1 persisted`
  - LinkedIn-only `run_all`: `126.2s`, `1 persisted`
  - LinkedIn still surfaced only `5` candidates, but downstream review now kept `1` instead of dropping back to `0`
- Latest truthful current-workspace rerun after the LinkedIn polluted-card parser fix:
  - LinkedIn `Check source`: `217.4s`, `draft`
  - LinkedIn single-target `Search now`: `96.9s`, `0 persisted`
  - Kosovajob `Check source`: `319.2s`, `draft`
  - Kosovajob single-target `Search now`: `229.6s`, `0 persisted`
  - mixed `run_all`: `322.3s`, `0 persisted`
  - LinkedIn still only surfaced `5` candidate jobs and title/location triage dropped all `5`
  - Kosovajob still entered `https://kosovajob.com/search` in the real app flow, hit `/404`, then recovered to the homepage and collected only weak non-technical jobs

## Confirmed Wins

- Fixed owned Chrome attach and teardown issues that were poisoning reruns
- Landed query-first LinkedIn starts for discovery and source-debug
- Landed route hygiene and restore guards for broken, templated, or placeholder routes
- Improved LinkedIn extraction enough to recover multi-job persistence in single-target discovery
- Fixed browser-agent parsing for polluted reversed LinkedIn cards like `Crossing Hurdles EMEA (Remote) $230K/yr - $280K/yr at Software Engineer (Fullstack)` and added focused regression coverage
- Broadened `job-finder` technical triage so title and location acceptance now use the whole posting evidence, technical family overlap, and remote or hybrid tolerance instead of relying mostly on the raw title string
- Started cleanup of source-specific core discovery policy:
  - removed LinkedIn-only direct-pass behavior from shared triage flow
  - renamed low-yield technical rescue to a source-generic fallback
  - generalized seeded-query preservation in `browser-agent`
- Follow-up cleanup generalized more of the remaining helper surface:
  - `job-finder` public ATS parsing now goes through generic adapter tables instead of separate source-named parser functions
  - `browser-agent` search-surface extraction and canonicalization helpers now use generic naming instead of LinkedIn-branded helper APIs
  - focused non-app validation passed for the touched packages; root lint still fails only because of unrelated `browser-runtime` test-file issues
- Confirmed the desktop benchmark must be preceded by `pnpm --filter @unemployed/desktop build`; otherwise it can keep exercising stale `out/main/index.cjs`
- After direct live-page inspection, added evidence-driven query-first starting URLs so source-debug and discovery can begin from the homepage `?q=` filter instead of the disproven `/search` guess
- Follow-up cleanup removed brittle KosovaJob city and industry mappings; query synthesis now only uses generic parameters that source-debug evidence explicitly proves
- Improved weak-board review budgets and technical-role fallback for Kosovajob-like sources
- Reduced one source-debug cost by skipping final AI review for first-run draft-only failures

## Current Bottlenecks

- shared discovery still contains some source-named helper debt from the LinkedIn recovery work, even after the first cleanup pass
- LinkedIn now persists multiple candidates in the rebuilt real app, but some extracted titles and companies remain polluted
- `Check source` still does too much work before returning control
- Kosovajob is now starting from a better homepage query route, but `Search now` still misses too many visible technical jobs and overall runtime remains much worse than LinkedIn or Greenhouse
- Provider-backed source-debug still needs restabilization

## Next Experiments

1. Finish removing remaining source-named helper debt and replace it with source-generic orchestration rules
2. Remove more first-run `Check source` cost
3. Clean remaining LinkedIn persisted title/company pollution while keeping the new multi-job persistence behavior
4. Keep Kosovajob separate: reduce `Check source` cost, stop over-exploring low-signal pages, and improve technical-job survival on the homepage query/detail pattern that live inspection confirmed
5. Re-test provider-backed source-debug against the current full-app bar

## References

- Plan: `docs/exec-plans/active/017-browser-substrate-evaluation-and-direction.md`
- Full-app reports: `apps/desktop/test-artifacts/ui/job-finder-app-benchmark/`
- Provider checkpoint: `apps/desktop/test-artifacts/ui/013-benchmark-service/017-provider-phase-fast-path.json`
