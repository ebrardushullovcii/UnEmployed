# Agent Context

This repo keeps agent-facing context in the places that current agent tools expect first, with `.agents` as the primary checked-in home for project-local agent assets.

## What Lives Where

- `AGENTS.md`
  - cross-tool repo contract and map
  - short navigation layer plus repo-wide hard rules
- `.agents/`
  - canonical project-local agent context root
  - holds repo-local skills and the machine-readable registry
- `CLAUDE.md`
  - Claude Code project memory entrypoint
  - kept short and import-oriented
- `.claude/skills`
  - compatibility symlink to `.agents/skills`
  - created by `pnpm agents:sync` so repo skills stay single-source
- `.cursor/rules/`
  - Cursor project rules
  - always-on guidance that should stay brief
- `.agents/skills/`
  - canonical project-local skill directory
  - includes both repo-owned skills and repo-local third-party stack skills
  - each skill is a normal `SKILL.md` folder and may include agent-specific metadata files when needed
- `docs/README.md`
  - documentation entrypoint and reading order
- `docs/STATUS.md`
  - short current-state snapshot only
- `docs/TRACKS.md`
  - live workboard for active streams, handoffs, and ready tasks
- `docs/HISTORY.md`
  - condensed completed milestones and notable repo changes
- `docs/exec-plans/`
  - task- or PR-scoped implementation plans and handoff detail
- `tsconfig.json`
  - root TypeScript solution file for workspace-wide indexing
  - helps editors and language servers see the monorepo as one project graph

## Reading Order

- Start with `docs/README.md`.
- Read `docs/STATUS.md`, then `docs/TRACKS.md`, then the relevant active exec plan before non-trivial work.
- Read the nearest package-local `AGENTS.md` before changing code in that area.
- Pull in `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/CONTRACTS.md`, and `docs/TESTING.md` only as needed.

## Repo Handoff Model

- `docs/PLAN.md` is the durable big-picture project plan
- `docs/STATUS.md` is the short current-state snapshot
- `docs/TRACKS.md` is the live workboard for active streams, handoffs, and ready tasks
- `docs/HISTORY.md` is the condensed milestone log for already-landed work
- `docs/exec-plans/active/` holds current execution plans
- `docs/exec-plans/completed/` holds completed plans that still matter
- `docs/decisions/` holds durable decisions only
- `docs/Design/README.md` holds the current design-reference map for UI work

## Rules

- Keep `AGENTS.md`, `CLAUDE.md`, and `.cursor/rules/` small and stable.
- Put durable knowledge in `docs/`, not in the always-on instruction files.
- Put reusable workflow guidance in skills, not in random markdown files.
- Keep `docs/STATUS.md` short; move long-lived completed context into `docs/HISTORY.md`, decisions, or exec plans.
- Avoid duplicating volatile implementation details in guidance files when the source of truth already lives in code.
- Author repo-local skills in `.agents/skills/`.
- Do not duplicate repo-local skills across tool-specific directories in git.
- Treat `.claude/skills` as a generated compatibility path, not an authored source.
- Before starting non-trivial work, read `docs/STATUS.md`, `docs/TRACKS.md`, and the relevant active exec plan.
- When pausing or finishing a workstream, update `docs/TRACKS.md` with the next concrete action or blocker.
- If a task changes behavior, contracts, architecture, or workflow, update the relevant docs in the same task.
- If work is being prepared for commit or PR handoff, agents should update docs proactively without waiting for a separate instruction.
- `main` is a PR-only branch; direct pushes are not part of the supported workflow.
- Only `@ebrardushullovcii` and `@vigani1` should be treated as `main` merge maintainers.
- CodeRabbit should auto-review every PR, but its review is advisory rather than a required merge approval for those maintainers.
- Treat design mockups as directional references only; they do not automatically define product scope or required backend behavior.
- Treat prototype HTML in `docs/Design/` as disposable design-reference material only, not reusable implementation code.
- Never create a git commit or PR action unless the user explicitly asks for it.

## Shared-Guidance Checklist

- Update the canonical docs first.
- Update affected package-local `AGENTS.md` files if local rules changed.
- Run `pnpm agents:sync` after changing repo-wide guidance, registry entries, or project-local skills.
- Run `pnpm agents:check` and `pnpm docs:check` before closing the task.
