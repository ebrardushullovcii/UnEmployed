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

- no active plan right now

## Reopenable Baselines

### `029 Full Product Critical QA And Improvement Plan`

- status: `done`
- linked plan: `docs/exec-plans/completed/029-full-product-critical-qa-and-improvement-plan.md`
- truthful Settings sample-preview copy, discovery blocker-first zero states, first-run Applications/Shortlisted CTAs, thin-profile/import improvements, and Applications detail-panel decomposition are landed and revalidated
- latest evidence lives under `apps/desktop/test-artifacts/ui/1440x920/`, `apps/desktop/test-artifacts/ui/applications-recovery/`, `apps/desktop/test-artifacts/ui/applications-queue-recovery/`, `apps/desktop/test-artifacts/ui/applications-consent-states/`, `apps/desktop/test-artifacts/ui/resume-import/`, and `apps/desktop/test-artifacts/ui/resume-import-benchmark/`
- reopen only for a fresh screenshot-backed contradiction, benchmark regression, or new hotspot work in another touched surface

### `030 Resume Coverage And Copy Quality`

- status: `done`
- linked plan: `docs/exec-plans/completed/030-resume-coverage-and-copy-quality.md`
- resume generation now uses a derived coverage policy instead of a fixed first-3 work-history cap, preserving resume chronology while keeping grounded dev/dev-adjacent and gap-coverage history visible at the right detail level
- Resume Studio now shows app-only weak-fit, gap-coverage, and compacting guidance using existing include/hide draft behavior; guidance remains outside rendered resume content and persists through patch/save flows
- replayable evidence now covers synthetic archetypes plus the real imported fixture corpus, with latest artifacts under `apps/desktop/test-artifacts/ui/resume-quality-benchmark/`, `apps/desktop/test-artifacts/ui/resume-import-benchmark/`, and `apps/desktop/test-artifacts/ui/resume-workspace/`
- reopen only for a new coverage-policy regression, app-only guidance leaking into preview/export text, provider normalization dropping grounded fallback history, or a benchmark-backed real-fixture quality regression

### `031 Functional Resume Template Variety`

- status: `done`
- linked plan: `docs/exec-plans/completed/031-functional-resume-template-variety.md`
- the resume template catalog now ships eight apply-safe template ids with distinct functional layouts, neutral default coloring, and one-click selection: `Chronology Classic`, `Senior Brief`, `Modern Editorial`, `Engineering Spec`, `Proof Portfolio`, `Credential Ledger`, `Longform Timeline`, and `Career Pivot Bridge`
- reopen only for a concrete catalog wiring regression, a benchmark-backed ATS or approval-safety issue, or a new evidence-backed functional layout gap

### `032 Resume Studio Experience Ordering And Manual Control`

- status: `done`
- linked plan: `docs/exec-plans/completed/032-resume-studio-experience-ordering-and-manual-control.md`
- Resume Studio now enforces shared deterministic structured entry ordering, defaults experience newest-first with current roles first, preserves hidden-entry slots, and keeps preview/export/render paths aligned with the same normalized draft order
- per-draft manual ordering now ships through typed `move_entry` and `reset_entry_order` patches, visible up/down controls, section order-mode badges, and reset-to-chronology behavior backed by renderer, service, contract, and UI harness evidence
- reopen only for a concrete preview/export order drift, hide/show reinsertion regression, manual ordering persistence bug, or excessive app-only date-quality guidance backed by fresh evidence

### `027 Job Finder Resume Experience UX Reset`

- status: `done`
- linked plan: `docs/exec-plans/completed/027-job-finder-resume-experience-ux-reset.md`
- the desktop resume UX reset is landed across `Settings` and `Resume Studio`, including denser hierarchy, truthful page-first preview framing, right-side identity editing, and stable preview-to-editor targeting
- accepted evidence remains `apps/desktop/test-artifacts/ui/1440x920/settings.png`, `apps/desktop/test-artifacts/ui/resume-workspace/03-preview-recovered.png`, and `apps/desktop/test-artifacts/ui/resume-workspace/10-review-queue-gated.png`
- reopen only for a concrete desktop resume UX regression, a preview-targeting or focus regression, or a truthful preview/export mismatch backed by fresh evidence

### `028 Desktop QA Follow-Up And UX Hardening`

- status: `done`
- linked plan: `docs/exec-plans/completed/028-desktop-qa-follow-up-and-ux-hardening.md`
- blocked `Find jobs` states now keep an in-panel recovery action, narrow discovery preserves visible context, Applications stage semantics are derived truthfully from consent/attempt state, and Resume Studio plus Profile Copilot no longer lose key workspace/header visibility in the validated desktop flows
- latest evidence lives under `apps/desktop/test-artifacts/ui/source-sign-in-prompts/`, `apps/desktop/test-artifacts/ui/resume-workspace/`, `apps/desktop/test-artifacts/ui/applications-recovery/`, and `apps/desktop/test-artifacts/ui/resume-import/`
- reopen only for a concrete desktop QA regression in these hardened flows, a new screenshot-backed contradiction in Applications/discovery states, or a fresh Resume Studio visibility/targeting issue

### `026 Job Finder Resume Template Families Variants And Catalog Selection`

- status: `done`
- linked plan: `docs/exec-plans/completed/026-job-finder-resume-template-families-variants-and-catalog-selection.md`
- direct template selection now ships truthful template, lane, ATS confidence, and eligibility metadata with sample-content preview cards in Settings, draft-backed preview flows in Resume Studio, and deterministic recommendations
- the shared renderer now uses layout-oriented ATS-safe builders that make the shipped template options materially distinct by hierarchy and content emphasis while preserving benchmark coverage
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

- `026`: resume template catalog selection baseline
- `032`: resume studio structured entry ordering and manual control
- `031`: functional resume template variety and eight-template apply-safe catalog
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

- Validate cross-platform sidecar packaging for `019` only for regressions, newly added targets, or periodic matrix revalidation
- Expand Applications recovery and retry tooling
- Add broader runtime tests for unsupported apply paths, live-browser extraction, and resume import
- Open new discovery/browser work only when there is a concrete source-generic improvement, ownership cleanup, or substrate decision to make
