# Tracks

Use one track per meaningful workstream, not per person or per chat.

## How To Use This File

- Read `docs/STATUS.md`, then this file, then the linked active or queued exec plan before non-trivial work.
- When a track maps 1:1 to an exec plan, reuse the plan number in the track title to avoid parallel numbering systems.
- Keep each track operational: `status`, `last updated`, `current focus`, and `next step`.
- Put detailed implementation notes in the linked exec plan, not here.
- Move completed context into `docs/HISTORY.md` instead of leaving mini-changelogs in active tracks.

## Status Keys

- `ready`: clear next step, not actively being worked
- `in_progress`: currently owned by an active work session
- `handoff`: partial progress exists and another agent can continue
- `blocked`: waiting on another track or decision
- `done`: completed and reflected in docs or code

## Current Tracks

### `Plan 007 Resume Workspace`

- status: `in_progress`
- last updated: `2026-04-06`
- linked plan: `docs/exec-plans/active/007-job-finder-resume-workspace.md`
- code areas: `packages/job-finder`, `packages/contracts`, `packages/db`, `packages/knowledge-base`, `packages/browser-runtime`, `apps/desktop`
- current focus: this is the only current active plan; the workspace flow mostly works in a bare-bones form and is being tightened into a stronger usable slice, including aligning review-queue apply gating with approved export reality, a clearer checklist-style readiness view in `Shortlisted`, truthful supported-versus-manual apply-path messaging, and stronger handoff clarity for apply safety
- next step: finish the remaining functionality and harden quality, assistant edits, export or approval paths, apply safety, desktop QA, and handoff clarity around browser-agent versus browser-runtime ownership, especially any remaining follow-up on live apply-path support signals beyond saved-job metadata
- blockers: none

### `Plan 008 Automatic Job Apply`

- status: `ready`
- last updated: `2026-04-05`
- linked plan: `docs/exec-plans/queued/008-job-finder-automatic-job-apply.md`
- code areas: `packages/contracts`, `packages/db`, `packages/job-finder`, `packages/browser-runtime`, `packages/browser-agent`, `apps/desktop`
- current focus: queued follow-on slice that redefines the next apply direction toward autonomous single-job and queue submission with run-scoped multi-submit approval, live consent interrupts, generated profile-grounded answers, skip-with-artifacts recovery, and clear package ownership where browser-agent holds bounded workflow policy while runtime stays generic
- next step: start after `007` hardens the resume-approval and apply-safety prerequisites enough that automatic submission can build on them instead of reopening them
- blockers: depends on `007` hardening first; current shipped behavior remains more conservative until `008` lands

### `Plan 009 Full App Copy Pass`

- status: `done`
- last updated: `2026-04-06`
- linked plan: `docs/exec-plans/completed/009-full-app-production-copy-pass.md`
- code areas: `apps/desktop`, `docs`
- current focus: completed full-app product-language and surface cleanup pass across shipped `Job Finder` and shared shell surfaces, including nav renames (`Find jobs`, `Shortlisted`, `Applications`), removal of low-value internal fields, simplified source-setup copy, settings cleanup, and later structural polish like `Shortlisted` readiness checklists, `Applications` triage filters, and optional-detail grouping in `Profile`
- next step: reuse this completed copy baseline for later UX polish or any follow-on wording cleanup that lands alongside active implementation work, especially remaining Discovery compression or deeper Applications recovery behavior
- blockers: none

### `Plan 010 Browser Efficiency And Speed`

- status: `ready`
- last updated: `2026-04-05`
- linked plan: `docs/exec-plans/queued/010-job-finder-browser-efficiency-and-speed.md`
- code areas: `packages/browser-runtime`, `packages/browser-agent`, `packages/job-finder`, `apps/desktop`
- current focus: queued measurement-first work to make discovery and source-debug faster, reduce silent idle time, and cut inefficient browser or agent behavior
- next step: start milestone 1 after `007` settles by adding timing instrumentation, representative baseline runs, and live progress visibility before runtime tuning
- blockers: depends on `007` hardening enough to produce trustworthy baselines

## Completed Background

### `Plan 005 Source Debug Agent`

- status: `done`
- last updated: `2026-04-05`
- linked plan: `docs/exec-plans/completed/005-job-source-debug-agent.md`
- current focus: completed enough for current work and now mainly background for future tightening

### `Plan 004 Generic Discovery`

- status: `done`
- last updated: `2026-04-05`
- linked plan: `docs/exec-plans/completed/004-job-finder-generic-discovery.md`
- current focus: completed enough for current work and now mainly background for future tightening

### `Plan 003 Profile Information Architecture`

- status: `done`
- last updated: `2026-04-05`
- linked plan: `docs/exec-plans/completed/003-job-finder-profile-information-architecture.md`
- current focus: completed enough for current work and now mainly background for future tightening

## Ready Queue

- Expand Applications with retry controls and attempt-centric recovery views beyond the shipped filters.
- Add broader runtime tests for unsupported apply branches, live-browser extraction, and resume-import flows.
- Improve cleanup and fallback extraction so difficult PDF and DOCX resumes yield cleaner structured text before the agent runs.
