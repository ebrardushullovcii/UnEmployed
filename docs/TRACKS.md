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
- current focus: typed Job Finder contracts and file-backed local persistence are in place
- next step: evolve the file-backed repository shape only when real discovery and tailoring data creates pressure
- blockers: none
- notes: current implementation persists seeded workspace data to a local JSON file so desktop actions survive restarts without locking the project into a heavier storage design too early

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

- status: `ready`
- last updated: `2026-03-20`
- scope: build the generic browser primitives and the first LinkedIn discovery adapter boundary
- linked plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- code areas: `packages/browser-runtime`, `packages/job-finder`
- current focus: a stub browser-session runtime exists and the desktop shell can model session readiness plus seeded discovery actions
- next step: replace the session stub with real discovery primitives and the first LinkedIn adapter seam
- blockers: none
- notes: keep LinkedIn selectors and recovery logic out of the generic runtime; discovery should write back through the current repository boundary

### `JF-04 Tailored Resume Path`

- status: `ready`
- last updated: `2026-03-20`
- scope: create one solid custom-resume workflow for a selected job
- linked plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- code areas: `packages/job-finder`
- current focus: the desktop shell can already generate seeded tailored resume previews and move them through review/apply transitions
- next step: replace seeded asset generation with real resume-generation outputs and stored variants
- blockers: depends on the first tailoring implementation, not on schema shape anymore
- notes: cover letters stay deferred unless the main slice lands cleanly first

### `JF-05 Review-Gated Easy Apply Execution`

- status: `blocked`
- last updated: `2026-03-20`
- scope: automate a narrow LinkedIn `Easy Apply` submission path with tracked outcomes
- linked plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- code areas: `packages/job-finder`, `packages/browser-runtime`, `apps/desktop`
- current focus: waiting on discovery, tailoring, and workflow-state foundations
- next step: implement the supported apply state machine after the real discovery adapter and real tailoring path exist
- blockers: depends on real browser primitives and non-seeded workflow state
- notes: stop on unsupported flows instead of guessing

## Ready Queue

- Use the desktop capture workflow to iterate on shell polish, title bar behavior, and screen spacing.
- Implement the first LinkedIn discovery adapter on top of the current browser-runtime stub.
- Add real local persistence behind the existing Job Finder repository interface.
- Replace seeded workspace data with real desktop mutations and workflow updates.
- Start the first real tailoring flow that produces stored resume assets.

## Recently Completed

- `2026-03-20`: added `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md` as the first active Job Finder delivery plan
- `2026-03-20`: bootstrapped `docs/TRACKS.md` as the live workboard for parallel agent handoffs
- `2026-03-20`: consolidated the current Job Finder design references and prototype policy under `docs/Design/`
- `2026-03-20`: implemented the first typed Job Finder workspace shell with contracts, in-memory repository seams, and desktop preload wiring
- `2026-03-20`: switched the seeded Job Finder workspace to file-backed persistence and interactive desktop actions
