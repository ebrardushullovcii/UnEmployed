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
- last updated: `2026-04-05`
- linked plan: `docs/exec-plans/active/007-job-finder-resume-workspace.md`
- code areas: `packages/job-finder`, `packages/contracts`, `packages/db`, `packages/knowledge-base`, `packages/browser-runtime`, `apps/desktop`
- current focus: this is the only current active plan; the workspace flow mostly works in a bare-bones form and is being tightened into a stronger usable slice, including aligning review-queue apply gating with approved export and tailored-asset reality
- next step: finish the remaining functionality and harden quality, assistant edits, export or approval paths, apply safety, desktop QA, and handoff clarity around browser-agent versus browser-runtime ownership
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

- status: `ready`
- last updated: `2026-04-05`
- linked plan: `docs/exec-plans/queued/009-full-app-production-copy-pass.md`
- code areas: `apps/desktop`, `packages/job-finder`, `docs/Design`
- current focus: queued full-app production copy and surface cleanup pass across all shipped `Job Finder` and shared shell surfaces, with aggressive removal of internal or noisy wording and permission for small user-facing cleanup where the audit exposes obvious redundancy or missing clarity
- next step: once higher-priority slices settle, start with a full shipped-surface inventory and classify each string cluster or user-facing control as keep, rewrite, shorten, remove, add, or restructure before broad edits begin
- blockers: none

### `Plan 010 Browser Efficiency And Speed`

- status: `in_progress`
- last updated: `2026-04-05`
- linked plan: `docs/exec-plans/active/010-job-finder-browser-efficiency-and-speed.md`
- code areas: `packages/browser-runtime`, `packages/browser-agent`, `packages/job-finder`, `apps/desktop`
- current focus: measurement-first implementation now includes named waiting states, retained discovery and source-debug timing summaries, a test-only performance snapshot, dynamic per-target discovery budgets, deterministic discovery-merge fit scoring, a narrower discovery-hot-path SQLite persistence path, earlier deferred-extraction flushes, early shutdown for cold discovery sources, source-debug later-phase route reuse with tighter budgets and actual starting-url evidence, guards against malformed templated route hints plus repeated click/fill evidence misses, and early closeout for phase-driven browser passes once evidence has stalled after enough proof is already collected
- next step: rerun LinkedIn source-debug on the new build, inspect whether phases now close out well before their old 16/18/22-step ceilings, then compare the retained timing snapshot against Wellfound and Kosovajob to separate generic wins from site-specific issues
- blockers: broader benchmarking still depends on `007` hardening enough to produce trustworthy side-by-side baselines, but the current visibility and idle-gap slice is actively implementable now

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

- Expand Applications with filters, retry controls, and attempt-centric recovery views.
- Add broader runtime tests for unsupported apply branches, live-browser extraction, and resume-import flows.
- Improve cleanup and fallback extraction so difficult PDF and DOCX resumes yield cleaner structured text before the agent runs.
