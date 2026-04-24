# Tracks

Read `docs/STATUS.md` first. Use this file for active work and ready follow-ups, not changelogs.

## Status Keys

- `in_progress`: active work
- `ready`: clear next step
- `done`: completed baseline
- `blocked`: waiting on another decision or track

## Active

### `017 Browser Substrate Evaluation And Direction`

- status: `in_progress`
- last updated: `2026-04-24`
- linked plan: `docs/exec-plans/active/017-browser-substrate-evaluation-and-direction.md`
- focus: improve the real desktop browser loop on the current stack before considering a substrate change
- current blockers:
  - core discovery policy picked up source-specific logic during `017`; the main shared-flow cleanup landed, but remaining source-named debt still needs to be removed rather than copied
  - LinkedIn now persists multiple jobs in the rebuilt real desktop flow, but some title/company extraction remains polluted
  - Desktop benchmark source changes must be rebuilt first because the harness launches `out/main/index.cjs`
  - `Check source` remains too slow, especially on Kosovajob, and LinkedIn source-debug can still end in a failed run state after proving a usable draft route
  - Kosovajob discovery still yields weak technical matches; truthful current-workspace reruns remain at `0` persisted jobs for both single-target `Search now` and KosovaJob-only `run_all`
  - `browser-runtime` still imports catalog session creation from `browser-agent`
  - root `pnpm lint` is blocked by pre-existing `packages/browser-runtime/src/playwright-browser-runtime.test.ts` issues outside the current cleanup
- next step:
  - finish removing remaining source-named helper debt and keep shared orchestration plug-and-play across job sources
  - keep denied-route-aware starting-url reuse in place while fixing the remaining Kosovajob route/extraction failures
  - clean remaining LinkedIn persisted title/company pollution while preserving the recovered `5` persisted `Search now` and `6` persisted LinkedIn-only `run_all` behavior
  - cut end-to-end `Check source` cost in the real app
  - keep Kosovajob as a separate weak-target diagnosis path; latest truthful reruns show the real blocker is still technical-job survival and over-exploration, not the seeded benchmark harness

## Reopenable Baselines

### `019 World-Class Resume Import`

- status: `done`
- linked plan: `docs/exec-plans/completed/019-job-finder-world-class-resume-import.md`
- focus: bundled native parser-sidecar packaging validation is complete for the currently supported release platforms; reopen only for packaging regressions, supported-platform changes, or newly supported release targets

### `015 Automatic Job Apply`

- status: `done`
- linked plan: `docs/exec-plans/completed/015-job-finder-automatic-job-apply.md`
- focus: safe non-submitting apply is complete; do not reopen live submit work without explicit re-authorization

### `014 Resume Output And Template Quality`

- status: `done`
- linked plan: `docs/exec-plans/completed/014-job-finder-resume-output-and-template-quality.md`
- focus: ATS-first `Classic ATS` baseline is complete; only reopen template work through a new explicit plan

### `012 Guided Setup And Profile Copilot`

- status: `done`
- linked plan: `docs/exec-plans/completed/012-job-finder-guided-setup-and-profile-copilot.md`
- focus: guided setup and profile copilot are complete; only do targeted polish or bug fixes

## Baselines

- `013`: source intelligence and discovery baseline
- `011`, `018`, `019`: shared profile/import baseline
- `014`: resume-quality baseline
- `015`: safe-apply baseline
- `016`: compaction baseline
- `009`: product copy baseline
- `010`: timing vocabulary baseline
- `007`: resume-workspace baseline

## Ready Queue

- Validate cross-platform sidecar packaging for `019`
- Expand Applications recovery and retry tooling
- Add broader runtime tests for unsupported apply paths, live-browser extraction, and resume import
- Keep repo-level quality commands aligned with actual workflow and CI once `pnpm lint` is unblocked from the known `packages/browser-runtime/src/playwright-browser-runtime.test.ts` failures
