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

- none right now

## Reopenable Baselines

### `027 Job Finder Resume Experience UX Reset`

- status: `done`
- linked plan: `docs/exec-plans/completed/027-job-finder-resume-experience-ux-reset.md`
- the desktop resume UX reset is landed across `Settings` and `Resume Studio`, including denser hierarchy, truthful page-first preview framing, right-side identity editing, and stable preview-to-editor targeting
- accepted evidence remains `apps/desktop/test-artifacts/ui/1440x920/settings.png`, `apps/desktop/test-artifacts/ui/resume-workspace/03-preview-recovered.png`, and `apps/desktop/test-artifacts/ui/resume-workspace/10-review-queue-gated.png`
- reopen only for a concrete desktop resume UX regression, a preview-targeting or focus regression, or a truthful preview/export mismatch backed by fresh evidence

### `026 Job Finder Resume Template Families Variants And Catalog Selection`

- status: `done`
- linked plan: `docs/exec-plans/completed/026-job-finder-resume-template-families-variants-and-catalog-selection.md`
- family-first template selection now ships truthful family, variant, lane, ATS confidence, and eligibility metadata with real preview-backed family cards, compare flow, deterministic recommendations, and lane plus density filters
- the shared renderer now uses family-oriented ATS-safe builders that make `Swiss Minimal`, `Executive Brief`, `Engineering Spec`, and `Portfolio Narrative` materially distinct by hierarchy and content emphasis while preserving benchmark coverage
- reopen only for a concrete family-rendering or selection regression, a benchmark-backed ATS or approval-safety issue, or a deliberate decision to ship real `share-ready` templates

### `025 Job Finder Resume Studio Live Preview And Editing`

- status: `done`
- linked plan: `docs/exec-plans/completed/025-job-finder-resume-studio-live-preview-and-editing.md`
- preview-centered `Resume Studio`, truthful shared live preview, preview failure fallback, preview-to-editor targeting, and widened desktop harness coverage are landed
- reopen only for a concrete live-preview drift or failure regression, preview-selection or focus regression, or export/approval safety mismatch backed by fresh evidence

### `023 Job Finder World-Class Resume Generation Quality`

- status: `done`
- linked plan: `docs/exec-plans/completed/023-job-finder-world-class-resume-generation-quality.md`
- candidate-backed visible-skill grounding, broader sanitizer and validator coverage, two shipped ATS-safe templates, and the replayable `benchmark:resume-quality` harness are landed
- reopen only for a new real resume-quality regression class, a new ATS-safe template candidate, or a renderer safety/parsing regression

### `024 Job Finder Resume Theme Catalog And Selection`

- status: `done`
- linked plan: `docs/exec-plans/completed/024-job-finder-resume-theme-catalog-and-selection.md`
- six ATS-safe themes now ship with default-theme settings, per-draft theme selection, draft-owned export and approval behavior, and widened renderer plus benchmark coverage
- reopen only for a new ATS-safe theme candidate, a per-draft theme ownership regression, or a renderer safety/parsing regression backed by fresh evidence

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

- `026`: family-first resume template families and selection
- `023`: resume generation quality
- `025`: resume studio live preview and editing
- `013`: source intelligence/discovery
- `011`, `018`, `019`: shared profile/import
- `014`: resume quality
- `015`: safe apply
- `016`: compaction
- `009`, `010`: copy and timing vocabulary
- `007`: resume workspace

## Ready Queue

- `028`: desktop QA follow-up and UX hardening queued in `docs/exec-plans/queued/028-desktop-qa-follow-up-and-ux-hardening.md`; covers `QA-001`, `QA-002`, `QA-011`, `QA-017`, `QA-018`, `QA-021`, `QA-023`, `QA-024`, related UX audit findings, and the remaining live-flow/responsive/accessibility test backlog
- Validate cross-platform sidecar packaging for `019` only for regressions, newly added targets, or periodic matrix revalidation
- Expand Applications recovery and retry tooling
- Add broader runtime tests for unsupported apply paths, live-browser extraction, and resume import
- Open new discovery/browser work only when there is a concrete source-generic improvement, ownership cleanup, or substrate decision to make
