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
- current focus: active alongside plan `010`; the workspace flow mostly works in a bare-bones form and is being tightened into a stronger usable slice, including aligning review-queue apply gating with approved export reality, a clearer checklist-style readiness view in `Shortlisted`, truthful supported-versus-manual apply-path messaging, and stronger handoff clarity for apply safety
- next step: finish the remaining functionality and harden quality, assistant edits, export or approval paths, apply safety, desktop QA, and handoff clarity around browser-agent versus browser-runtime ownership, especially any remaining follow-up on live apply-path support signals beyond saved-job metadata
- blockers: none

### `Plan 008 Automatic Job Apply`

- status: `ready`
- last updated: `2026-04-06`
- linked plan: `docs/exec-plans/queued/008-job-finder-automatic-job-apply.md`
- code areas: `packages/contracts`, `packages/db`, `packages/job-finder`, `packages/browser-runtime`, `packages/browser-agent`, `apps/desktop`
- current focus: queued follow-on slice now re-authored as a staged apply evolution: shared apply domains and artifacts first, then one-job apply copilot, then one-job auto-submit, then queue submission with run-scoped multi-submit approval, live consent interrupts, generated profile-grounded answers, skip-with-artifacts recovery, and clear package ownership where browser-agent holds bounded workflow policy while runtime stays generic
- next step: start after `007` hardens the resume-approval and apply-safety prerequisites enough that the first `008` slice can land shared answer or blocker or replay domains and a one-job apply-copilot path instead of jumping straight to queue-wide auto-submit
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

- status: `in_progress`
- last updated: `2026-04-06`
- linked plan: `docs/exec-plans/active/010-job-finder-browser-efficiency-and-speed.md`
- code areas: `packages/browser-runtime`, `packages/browser-agent`, `packages/job-finder`, `apps/desktop`
- current focus: measurement-first implementation now includes named waiting states, retained discovery and source-debug timing summaries, a test-only performance snapshot, dynamic per-target discovery budgets, deterministic discovery-merge fit scoring, a narrower discovery-hot-path SQLite persistence path, earlier deferred-extraction flushes, early shutdown for cold discovery sources, source-debug later-phase route reuse with tighter budgets and actual starting-url evidence, guards against malformed templated route hints plus repeated click/fill evidence misses, and early closeout for phase-driven browser passes once evidence has stalled after enough proof is already collected
- next step: rerun LinkedIn source-debug on the new build, inspect whether phases now close out well before their old 16/18/22-step ceilings, then compare the retained timing snapshot against Wellfound and Kosovajob to separate generic wins from site-specific issues
- blockers: broader benchmarking still depends on `007` hardening enough to produce trustworthy side-by-side baselines, but the current visibility and idle-gap slice is actively implementable now

### `Plan 015 Job Finder Shared Data Expansion`

- status: `ready`
- last updated: `2026-04-06`
- linked plan: `docs/exec-plans/queued/015-job-finder-shared-data-expansion.md`
- code areas: `packages/contracts`, `packages/db`, `packages/job-finder`, `apps/desktop`, `docs`
- current focus: queued follow-on schema and storage expansion for shared narrative, proof-bank, answer-bank, richer job or employer context, and blocker or replay data that later discovery, resume, and apply flows can all reuse
- next step: start by auditing the existing schema roots and repository state, extend those roots where possible, and only propose a new top-level domain when the existing saved-job, source-debug, or workspace state structures cannot own the new data cleanly
- blockers: should stay queued until the active `007` and `010` slices settle enough that the broader schema expansion can land without churn

### `Plan 016 Shared Agent Auto Compaction`

- status: `ready`
- last updated: `2026-04-06`
- linked plan: `docs/exec-plans/queued/016-shared-agent-auto-compaction.md`
- code areas: `packages/browser-agent`, `packages/job-finder`, `packages/contracts`, `apps/desktop`
- current focus: queued small follow-on to extend the current browser-agent message-count compaction into a shared token-budget compaction policy that all long-running agents and orchestrators can reuse, with a configurable default threshold around `150_000` tokens and message-count fallback where token estimation is not available
- next step: decide the shared settings shape and whether the first implementation should stay `Job Finder`-scoped or immediately become repo-shared infrastructure for all agentic flows
- blockers: current compaction already exists in `browser-agent`, so this work should extend that path rather than replacing it with a second unrelated system

### `Plan 017 Browser Substrate Evaluation And Direction`

- status: `ready`
- last updated: `2026-04-06`
- linked plan: `docs/exec-plans/queued/017-browser-substrate-evaluation-and-direction.md`
- code areas: `packages/browser-runtime`, `packages/browser-agent`, `packages/job-finder`, `apps/desktop`, `docs`
- current focus: queued small cross-cutting direction note capturing the current conclusion that `agent-browser` is the leading browser-substrate candidate when speed and quality dominate the decision, while `UnEmployed` should keep its own orchestration, source-debug model, and approval logic and continue deeper benchmarking later before choosing a larger runtime move
- next step: use the current `010` performance work plus later discovery and source-debug and apply benchmarks to decide whether the next serious runtime move is `keep Playwright`, `add agent-browser as an alternate backend`, or `migrate the default substrate`
- blockers: should remain a direction note until stronger representative benchmarking exists across discovery, source-debug, and apply flows

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
