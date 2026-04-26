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

- none

## Reopenable Baselines

### `023 Job Finder World-Class Resume Generation Quality`

- status: `done`
- linked plan: `docs/exec-plans/completed/023-job-finder-world-class-resume-generation-quality.md`
- candidate-backed visible-skill grounding, broader sanitizer and validator coverage, two shipped ATS-safe templates, and the replayable `benchmark:resume-quality` harness are landed
- reopen only for a new real resume-quality regression class, a new ATS-safe template candidate, or a renderer safety/parsing regression

### `017 Browser Substrate Evaluation And Direction`

- status: `done`
- linked plan: `docs/exec-plans/completed/017-browser-substrate-evaluation-and-direction.md`
- completed current-stack evaluation; no substrate change is justified by current evidence
- reopen only for a concrete browser-loop regression, source-generic discovery improvement, or explicit substrate decision
- Kosovajob `0` persisted jobs can be valid when the board has few suitable matches for the current resume; judge it by visible-fit evidence, not count alone

### `019 World-Class Resume Import`

- status: `done`
- linked plan: `docs/exec-plans/completed/019-job-finder-world-class-resume-import.md`
- reopen only for packaging regressions, supported-platform changes, or newly supported release targets

### `020 Job Finder Scoped Button Pending State And Feedback`

- status: `done`
- linked plan: `docs/exec-plans/completed/020-job-finder-scoped-button-pending-state-and-feedback.md`
- scoped pending lanes and clearer disabled/in-progress button feedback are landed across desktop Job Finder routes
- reopen only for a concrete control-locking regression, unsafe concurrent-mutation gap, or stronger page-specific pending UX improvement backed by fresh real-app evidence

### `021 Resume Import Duplicate Record Deduplication`

- status: `done`
- linked plan: `docs/exec-plans/completed/021-job-finder-resume-import-duplicate-record-deduplication.md`
- duplicate-record handling, fresh-start placeholder replacement, optional-proof warning cleanup, and date-derived `yearsExperience` fallback are landed
- reopen only for a new real import regression, supported parser/platform changes, or a concrete source-generic import-quality improvement

### `022 Job Finder Source Sign-In Prompts And Source-Aware Browser Entry`

- status: `done`
- linked plan: `docs/exec-plans/completed/022-job-finder-source-sign-in-prompts-and-source-aware-browser-entry.md`
- source-level sign-in prompts and source-aware browser entry are now surfaced in `Profile` and `Find jobs` with typed contracts, source-generic evidence derivation, and desktop screenshot QA coverage
- reopen only for a concrete auth-prompt misclassification, source-aware browser-entry regression, or a new screenshot-backed UX issue in these sign-in flows

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

- `023`: resume generation quality
- `013`: source intelligence/discovery
- `011`, `018`, `019`: shared profile/import
- `014`: resume quality
- `015`: safe apply
- `016`: compaction
- `009`, `010`: copy and timing vocabulary
- `007`: resume workspace

## Ready Queue

- none

- Validate cross-platform sidecar packaging for `019` only for regressions, newly added targets, or periodic matrix revalidation
- Expand Applications recovery and retry tooling
- Add broader runtime tests for unsupported apply paths, live-browser extraction, and resume import
- Open new discovery/browser work only when there is a concrete source-generic improvement, ownership cleanup, or substrate decision to make
