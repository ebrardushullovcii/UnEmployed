# Documentation

Read in this order:

1. `docs/STATUS.md` for current truth
2. `docs/TRACKS.md` for active and ready work
3. The linked exec plan if your task touches an active or queued track
4. The nearest package `AGENTS.md`

Use only what the task needs:

- `docs/PRODUCT.md`: product scope and module intent
- `docs/ARCHITECTURE.md`: package boundaries and data flow
- `docs/CONTRACTS.md`: schemas, DTOs, preload APIs, IPC
- `docs/TESTING.md`: required checks and UI QA flows

Read `docs/ARCHITECTURE.md` before changing discovery or source-debug behavior. The repo rule is explicit: core discovery must stay source-generic; do not add per-board route builders, query maps, triage overrides, or one-off workflow functions in shared orchestration.

Current active plan:

- `docs/exec-plans/active/017-browser-substrate-evaluation-and-direction.md`

Plan directories:

- `docs/exec-plans/active/`
- `docs/exec-plans/queued/`
- `docs/exec-plans/completed/`

Module docs:

- `docs/modules/JOB_FINDER.md`
- `docs/modules/INTERVIEW_HELPER.md`

Durable decisions:

- `docs/decisions/ADR-0001-monorepo-electron.md`
- `docs/decisions/ADR-0002-agent-doc-system.md`
