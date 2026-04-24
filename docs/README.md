# Documentation

Default startup:

- Start here, then read only the docs needed for the task.

## Task Routing

| Task | Read |
| --- | --- |
| typo, small local fix, or command output | nearest package `AGENTS.md` if editing there |
| active feature work or unclear state | `docs/STATUS.md`, `docs/TRACKS.md`, relevant exec plan |
| handoff/status update | `docs/STATUS.md`, `docs/TRACKS.md`, relevant exec plan |
| product behavior | `docs/PRODUCT.md` |
| architecture, package ownership, discovery/source-debug | `docs/ARCHITECTURE.md` |
| contracts, schemas, preload APIs, IPC | `docs/CONTRACTS.md` |
| tests, harnesses, validation choice | `docs/TESTING.md` |
| repo guidance, adapters, skills, package guide policy | `docs/AGENT_CONTEXT.md`, `.agents/registry.yaml` |
| module-level behavior | `docs/modules/JOB_FINDER.md` or `docs/modules/INTERVIEW_HELPER.md` |

Read these when relevant:

- `docs/STATUS.md`: active feature work, handoff updates, broad repo changes, or unclear current state
- `docs/TRACKS.md`: active/queued work and ready follow-ups
- `docs/exec-plans/active/`: task-scoped plans; read only when touching that track
- nearest package `AGENTS.md`: package-local rules before editing or reviewing that package

- `docs/PRODUCT.md`: product scope and module intent
- `docs/ARCHITECTURE.md`: package boundaries and data flow
- `docs/CONTRACTS.md`: schemas, DTOs, preload APIs, IPC
- `docs/TESTING.md`: required checks and UI QA flows

Read `docs/ARCHITECTURE.md` before changing discovery or source-debug behavior.

Current active plan:

- `docs/exec-plans/active/017-browser-substrate-evaluation-and-direction.md`

Plan directories:

- `docs/exec-plans/active/`
- `docs/exec-plans/queued/`
- `docs/exec-plans/completed/`

Module docs:

- `docs/modules/JOB_FINDER.md`
- `docs/modules/INTERVIEW_HELPER.md`
