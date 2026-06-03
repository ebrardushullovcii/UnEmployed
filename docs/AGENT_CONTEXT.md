# Agent Context

Read this doc when changing repo guidance, generated adapters, project skills, or the handoff model itself.

## Guidance Layers

- `AGENTS.md`: repo entrypoint
- nearest package `AGENTS.md`: local rules
- `docs/README.md`: doc map
- `docs/GOALS.md`, `docs/PRODUCT.md`, and `CONTEXT.md`: durable product direction and language
- `docs/adr/`: durable decisions and rejected alternatives
- `docs/STATUS.md` and `docs/TRACKS.md`: active state only
- `docs/exec-plans/active/` and `docs/exec-plans/queued/`: task detail only while work is active or ready
- `docs/HISTORY.md`: compact completed milestones
- `.agents/skills/`: repo-specific reusable workflows
- `.agents/registry.yaml`: machine-readable map
- `CLAUDE.md`, `.cursor/rules/00-project.mdc`, `.claude/skills/`: generated adapters

## Reading Order

- normal work: `AGENTS.md` -> `docs/README.md` -> task-specific docs only
- active feature or handoff work: add `docs/STATUS.md`, `docs/TRACKS.md`, and the relevant active or queued exec plan
- package edits/reviews: add the nearest package `AGENTS.md`
- repo-guidance work: also read this file and `.agents/registry.yaml`

## Rules

- keep always-on guidance short
- keep durable knowledge in `docs/`
- keep reusable workflows in project skills only when they encode project-specific behavior
- keep task detail in active or queued exec plans, not root docs
- keep completed implementation history in `docs/HISTORY.md`, ADRs, test artifacts, and git history instead of completed plan files
- update docs in the same task when behavior, contracts, architecture, or workflow changes

## Shared-Guidance Checklist

- update canonical docs first
- update affected package `AGENTS.md` files if local rules changed
- run `pnpm validate:docs-only`
