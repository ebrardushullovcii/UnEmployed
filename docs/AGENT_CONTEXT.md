# Agent Context

Read this doc only when changing repo guidance, generated adapters, or the handoff model itself.

## Guidance Layers

- `AGENTS.md`: repo entrypoint
- nearest package `AGENTS.md`: local rules
- `docs/README.md`: doc map
- `docs/STATUS.md` and `docs/TRACKS.md`: current state
- `docs/exec-plans/`: task-scoped detail
- `docs/HISTORY.md` and `docs/decisions/`: completed background
- `.agents/skills/`: reusable workflows
- `.agents/registry.yaml`: machine-readable map
- `CLAUDE.md`, `.cursor/rules/00-project.mdc`, `.claude/skills/`: generated adapters

## Reading Order

- normal implementation: `README` -> `STATUS` -> `TRACKS` -> relevant exec plan -> nearest package `AGENTS.md`
- repo-guidance work: add this file and `.agents/registry.yaml`

## Rules

- keep always-on guidance short
- keep durable knowledge in `docs/`
- keep reusable workflows in skills
- keep task detail in exec plans, not root docs
- update docs in the same task when behavior, contracts, architecture, or workflow changes

## Shared-Guidance Checklist

- update canonical docs first
- update affected package `AGENTS.md` files if local rules changed
- run `pnpm agents:sync`, `pnpm agents:check`, and `pnpm docs:check`
