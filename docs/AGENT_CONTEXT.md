# Agent Context

This doc explains how agent-facing guidance is layered in the repo. Use it when changing repo guidance, generated adapters, or the handoff system itself.

## Guidance Layers

- `AGENTS.md`: always-on repo contract and startup map
- nearest package-local `AGENTS.md`: workspace-specific rules
- `docs/README.md`: canonical docs map and reading order
- `docs/STATUS.md` and `docs/TRACKS.md`: current repo state and active work
- `docs/exec-plans/active/`: task-scoped implementation detail
- `docs/HISTORY.md`: completed milestones and background
- `docs/Design/README.md`: UI reference map
- `.agents/skills/`: specialized reusable workflows
- `.agents/registry.yaml`: machine-readable map for docs, guides, and adapters
- `CLAUDE.md`, `.cursor/rules/00-project.mdc`, and `.claude/skills/`: generated compatibility artifacts

## Default Reading Order

- For normal implementation work: `docs/README.md` -> `docs/STATUS.md` -> `docs/TRACKS.md` -> relevant active or queued exec plan -> nearest package-local `AGENTS.md`.
- Pull in `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/CONTRACTS.md`, and `docs/TESTING.md` only when the task touches those concerns.
- Pull in this file and `.agents/registry.yaml` when changing repo guidance, adapter generation, or the handoff model.

## Handoff Model

- `docs/STATUS.md`: short current snapshot
- `docs/TRACKS.md`: live workboard and next actions
- `docs/exec-plans/active/`: current implementation detail
- `docs/exec-plans/queued/`: prepared follow-on implementation detail
- `docs/exec-plans/completed/`: historical plans that still matter
- `docs/HISTORY.md`: completed milestones
- `docs/decisions/`: durable governance and architecture decisions

## Rules

- Keep `AGENTS.md`, `CLAUDE.md`, and `.cursor/rules/` short and stable.
- Put durable knowledge in `docs/`, reusable workflows in skills, and task detail in exec plans.
- Do not duplicate repo-local skills across tool-specific directories in git.
- Treat `.claude/skills` as a generated compatibility path, not an authored source.
- Before starting non-trivial work, read `docs/STATUS.md`, `docs/TRACKS.md`, and the relevant active or queued exec plan.
- When pausing or finishing a workstream, update `docs/TRACKS.md` with the next concrete action or blocker.
- Move not-started follow-on plans into `docs/exec-plans/queued/`, and move stale or finished plans out of `docs/exec-plans/active/` once they stop driving current work.
- If a task changes behavior, contracts, architecture, or workflow, update the relevant docs in the same task.
- When addressing PR or review feedback, prefer a root-cause or reusable pattern fix over a one-off patch when the broader correction is clear and safe.
- Never create a git commit or PR action unless the user explicitly asks for it.

## Shared-Guidance Checklist

- Update canonical docs first.
- Update affected package-local `AGENTS.md` files if local rules changed.
- Run `pnpm agents:sync` after changing repo-wide guidance, registry entries, or project-local skills.
- Run `pnpm agents:check` and `pnpm docs:check` before closing the task.
