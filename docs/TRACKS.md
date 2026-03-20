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

- status: `ready`
- last updated: `2026-03-20`
- scope: define the minimal Job Finder schemas and repository seams for the LinkedIn `Easy Apply` slice
- linked plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- code areas: `packages/contracts`, `packages/db`
- current focus: not started
- next step: define schemas for preferences, saved jobs, tailored assets, and application attempts
- blockers: none
- notes: keep storage design narrow and avoid over-modeling migrations this early

### `JF-02 Job Finder Screen Design`

- status: `done`
- last updated: `2026-03-20`
- scope: design the MVP screens and states for the first Job Finder slice
- linked plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- linked brief: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply-ui-brief.md`
- code areas: `docs/Design`, `apps/desktop`
- current focus: finalized Job Finder MVP visual references and state screens
- next step: implement the desktop surfaces from `docs/Design/README.md`
- blockers: none
- notes: screenshots are the primary visual target; `mockup.html` files are prototype-only references and the design set is directional rather than feature-complete

### `JF-03 Browser Runtime And LinkedIn Discovery`

- status: `ready`
- last updated: `2026-03-20`
- scope: build the generic browser primitives and the first LinkedIn discovery adapter boundary
- linked plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- code areas: `packages/browser-runtime`, `packages/job-finder`
- current focus: not started
- next step: define browser session primitives and the LinkedIn discovery adapter seam
- blockers: should align with the first saved-job contracts once they land
- notes: keep LinkedIn selectors and recovery logic out of the generic runtime

### `JF-04 Tailored Resume Path`

- status: `ready`
- last updated: `2026-03-20`
- scope: create one solid custom-resume workflow for a selected job
- linked plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- code areas: `packages/job-finder`
- current focus: not started
- next step: choose a simple internal resume representation and generate one stored variant per job
- blockers: depends on the first profile and saved-job shapes from `JF-01`
- notes: cover letters stay deferred unless the main slice lands cleanly first

### `JF-05 Review-Gated Easy Apply Execution`

- status: `blocked`
- last updated: `2026-03-20`
- scope: automate a narrow LinkedIn `Easy Apply` submission path with tracked outcomes
- linked plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- code areas: `packages/job-finder`, `packages/browser-runtime`, `apps/desktop`
- current focus: waiting on discovery, tailoring, and workflow-state foundations
- next step: implement the supported apply state machine after `JF-01`, `JF-03`, and `JF-04` exist
- blockers: depends on contracts, saved jobs, tailored assets, and browser primitives
- notes: stop on unsupported flows instead of guessing

## Ready Queue

- Define the first Job Finder shared schemas in `packages/contracts`.
- Implement the desktop information architecture from `docs/Design/README.md` and `docs/exec-plans/active/002-job-finder-linkedin-easy-apply-ui-brief.md`.
- Add typed desktop-to-main seams for Job Finder actions.
- Define the generic browser runtime actions the LinkedIn adapter will need.

## Recently Completed

- `2026-03-20`: added `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md` as the first active Job Finder delivery plan
- `2026-03-20`: bootstrapped `docs/TRACKS.md` as the live workboard for parallel agent handoffs
- `2026-03-20`: consolidated the current Job Finder design references and prototype policy under `docs/Design/`
