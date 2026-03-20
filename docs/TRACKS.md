# Tracks

`STATUS.md` answers "what is happening in the repo right now?"

`TRACKS.md` answers "what workstreams exist, what is already being worked on, and what can another agent pick up next?"

Use one track per meaningful workstream, not per person or per chat.

## How To Use This File

- Read `docs/STATUS.md`, then `docs/TRACKS.md`, then the linked exec plan before starting non-trivial work.
- If you take a track, update its `status`, `last updated`, `current focus`, and `next step`.
- If you stop mid-stream, set the track to `handoff` or `blocked` and leave the next concrete action.
- Keep deep implementation detail in the linked exec plan or module docs; keep this file short and current.
- When a track finishes, update the relevant docs and move follow-up work into the ready queue instead of leaving hidden context in chat.

## Status Keys

- `ready`: clear next step, not actively being worked
- `in_progress`: currently owned by an active work session
- `handoff`: partial progress exists and another agent can continue
- `blocked`: cannot move until another track or decision lands
- `done`: completed and reflected in docs/code

## Active Tracks

### `JF-01 Contracts And Persistence`

- status: `done`
- last updated: `2026-03-20`
- scope: define the minimal Job Finder schemas and repository seams for the LinkedIn `Easy Apply` slice
- linked plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- code areas: `packages/contracts`, `packages/db`
- current focus: typed Job Finder contracts now include discovery/apply attempt data and the desktop repository is SQLite-backed
- next step: add richer migration coverage and resume artifact storage once live LinkedIn execution adds more schema pressure
- blockers: none
- notes: current implementation persists profile, preferences, saved jobs, tailored assets, application records, and apply attempts into a local SQLite database with a legacy JSON fallback path

### `JF-02 Job Finder Screen Design`

- status: `done`
- last updated: `2026-03-20`
- scope: design the MVP screens and states for the first Job Finder slice
- linked plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- linked brief: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply-ui-brief.md`
- code areas: `docs/Design`, `apps/desktop`
- current focus: finalized visual references are implemented as a first interactive desktop shell with native mac traffic lights, tighter sidebar cards, clearer panel hierarchy, and page-level UI QA refinements
- next step: keep using the desktop UI capture workflow to tighten shell density, applications detail behavior, and compact-size usability before deeper functionality expands
- blockers: none
- notes: screenshots are the primary visual target; `mockup.html` files are prototype-only references and the design set is directional rather than feature-complete; use `pnpm --filter @unemployed/desktop ui:capture` for screenshot-based UI review and the reset action in Settings to restore the seeded workspace quickly; the current polish pass improved count-badge padding, stat label/value spacing, sidebar metric containment, native mac title-bar behavior, centered tabs, removed the ready and updated chips, reduced top-bar hover noise, tighter button sizing, fullscreen-state sync, oversized-panel balance, page-by-page active-state clarity, compact-height readability, real-window support for the documented `1024x768` review size, always-visible sidebar metrics on compact desktop layouts, shared centered top-tab styling across Mac and Windows, and a smaller typography scale across headlines, labels, chips, buttons, and list rows

### `JF-03 Browser Runtime And LinkedIn Discovery`

- status: `in_progress`
- last updated: `2026-03-20`
- scope: build the generic browser primitives and the first LinkedIn discovery adapter boundary
- linked plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- code areas: `packages/browser-runtime`, `packages/job-finder`
- current focus: browser-runtime now exposes discovery and apply execution methods, and the desktop shell can run deterministic LinkedIn discovery through saved preferences
- next step: harden the adapter with live-session wiring, richer unsupported-branch coverage, and selector-level automation when authenticated browser work starts
- blockers: live LinkedIn execution still depends on authenticated-session integration and selector hardening
- notes: keep LinkedIn selectors and recovery logic out of the generic runtime; discovery already writes back through the repository boundary and now dedupes by source job identity

### `JF-04 Tailored Resume Path`

- status: `in_progress`
- last updated: `2026-03-20`
- scope: create one solid custom-resume workflow for a selected job
- linked plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- code areas: `packages/job-finder`, `apps/desktop`
- current focus: the app can generate and persist versioned tailored resume content from profile, preferences, and selected job data through the review flow
- next step: add richer artifact export/storage and iterate on higher-fidelity resume rendering once the live LinkedIn path is hardened
- blockers: no external model/provider dependency is wired yet for richer tailoring
- notes: cover letters stay deferred unless the main slice lands cleanly first; current tailoring remains deterministic and source-backed

### `JF-05 Review-Gated Easy Apply Execution`

- status: `in_progress`
- last updated: `2026-03-20`
- scope: automate a narrow LinkedIn `Easy Apply` submission path with tracked outcomes
- linked plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- code areas: `packages/job-finder`, `packages/browser-runtime`, `apps/desktop`
- current focus: the app now records explicit apply attempts, checkpoints, submitted outcomes, and safe paused branches instead of assuming direct success
- next step: connect the supported state machine to a live authenticated LinkedIn execution path and broaden recovery helpers in Applications
- blockers: live browser execution still depends on authenticated-session integration and selector hardening
- notes: stop on unsupported flows instead of guessing; paused attempts now persist locally with next-action guidance

## Ready Queue

- Wire the deterministic LinkedIn adapter into a live authenticated browser session path.
- Add richer tailored resume export/storage beyond persisted preview content.
- Expand Applications with filters, retry controls, and attempt-centric recovery views.
- Add broader runtime tests for unsupported Easy Apply branches and resume-import flows.

## Recently Completed

- `2026-03-20`: added `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md` as the first active Job Finder delivery plan
- `2026-03-20`: bootstrapped `docs/TRACKS.md` as the live workboard for parallel agent handoffs
- `2026-03-20`: consolidated the current Job Finder design references and prototype policy under `docs/Design/`
- `2026-03-20`: implemented the first typed Job Finder workspace shell with contracts, in-memory repository seams, and desktop preload wiring
- `2026-03-20`: switched the seeded Job Finder workspace to file-backed persistence and interactive desktop actions
- `2026-03-20`: upgraded Job Finder to SQLite persistence, deterministic LinkedIn discovery/apply orchestration, editable profile/settings flows, and persisted application attempts
