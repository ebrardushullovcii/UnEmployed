# Tracks

Read this for active work and ready follow-ups. Read `docs/STATUS.md` first when current state matters.

## Status Keys

- `in_progress`: active work
- `ready`: clear next step
- `done`: completed baseline
- `blocked`: waiting on another decision or track

## Plan Hygiene

- Keep active plans limited to goal, constraints, current blockers, next steps, and latest evidence pointers
- Archive or queue a plan when it has no concrete next action
- Keep latest evidence to three bullets or fewer; move old benchmark detail to trackers or artifacts
- Keep trackers active only while their parent plan is active

## Active

### `017 Browser Substrate Evaluation And Direction`

- status: `in_progress`
- last updated: `2026-04-24`
- linked plan: `docs/exec-plans/active/017-browser-substrate-evaluation-and-direction.md`
- focus: improve the real desktop browser loop on the current stack before considering a substrate change
- current blockers:
  - `Check source` cost remains too high, especially Kosovajob
  - LinkedIn source-debug can finish failed after proving a usable draft route
  - LinkedIn persisted title/company extraction still has pollution
  - Kosovajob recent truthful reruns persist `0` jobs in single-target and `run_all`
  - `browser-runtime` imports catalog session creation from `browser-agent`
  - root `pnpm lint` is blocked by pre-existing `packages/browser-runtime/src/playwright-browser-runtime.test.ts` issues
- next step:
  - reduce real-app `Check source` cost
  - clean LinkedIn title/company extraction while preserving recovered multi-job persistence
  - keep Kosovajob diagnosis separate and source-generic: fix technical-job survival and over-exploration without adding core per-board policy
  - remove remaining source-named helper debt where it is not provider metadata, fixtures, or reusable adapter data

## Reopenable Baselines

### `019 World-Class Resume Import`

- status: `done`
- linked plan: `docs/exec-plans/completed/019-job-finder-world-class-resume-import.md`
- reopen only for packaging regressions, supported-platform changes, or newly supported release targets

### `015 Automatic Job Apply`

- status: `done`
- linked plan: `docs/exec-plans/completed/015-job-finder-automatic-job-apply.md`
- safe non-submitting apply is complete; do not reopen live submit work without explicit re-authorization

### `014 Resume Output And Template Quality`

- status: `done`
- linked plan: `docs/exec-plans/completed/014-job-finder-resume-output-and-template-quality.md`
- ATS-first `Classic ATS` baseline is complete; reopen template work only through a new explicit plan

### `012 Guided Setup And Profile Copilot`

- status: `done`
- linked plan: `docs/exec-plans/completed/012-job-finder-guided-setup-and-profile-copilot.md`
- guided setup and profile copilot are complete; only do targeted polish or bug fixes

## Baselines

- `013`: source intelligence/discovery
- `011`, `018`, `019`: shared profile/import
- `014`: resume quality
- `015`: safe apply
- `016`: compaction
- `009`, `010`: copy and timing vocabulary
- `007`: resume workspace

## Ready Queue

- Validate cross-platform sidecar packaging for `019` only for regressions, newly added targets, or periodic matrix revalidation
- Expand Applications recovery and retry tooling
- Add broader runtime tests for unsupported apply paths, live-browser extraction, and resume import
- Keep repo-level quality commands aligned with actual workflow and CI once `pnpm lint` is unblocked from the known `packages/browser-runtime/src/playwright-browser-runtime.test.ts` failures
