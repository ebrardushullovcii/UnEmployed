# Agent Context

This repo keeps agent-facing context in the places that current agent tools expect first, with `.agents` as the primary checked-in home for project-local agent assets.

## Standard Layout

- `AGENTS.md`
  - cross-tool repo contract and map
  - optimized for Codex-style and AGENTS-aware tools
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
- `tsconfig.json`
  - root TypeScript solution file for workspace-wide indexing
  - helps editors and language servers see the monorepo as one project graph

## Repo Handoff Model

- `docs/PLAN.md` is the durable big-picture project plan
- `docs/STATUS.md` is the short current-state snapshot
- `docs/TRACKS.md` is the live workboard for active streams, handoffs, and ready tasks
- `docs/exec-plans/active/` holds current execution plans
- `docs/exec-plans/completed/` holds completed plans that still matter
- `docs/decisions/` holds durable decisions only
- `docs/Design/README.md` holds the current design-reference map for UI work

## Rules

- Keep `AGENTS.md`, `CLAUDE.md`, and `.cursor/rules/` small.
- Put durable knowledge in `docs/`, not in the always-on instruction files.
- Put reusable workflow guidance in skills, not in random markdown files.
- Author repo-local skills in `.agents/skills/`.
- Do not duplicate repo-local skills across tool-specific directories in git.
- Treat `.claude/skills` as a generated compatibility path, not an authored source.
- Before starting non-trivial work, read `docs/STATUS.md`, `docs/TRACKS.md`, and the relevant active exec plan.
- When pausing or finishing a workstream, update `docs/TRACKS.md` with the next concrete action or blocker.
- If a task changes behavior, contracts, architecture, or workflow, update the relevant docs in the same task.
- If work is being prepared for commit or PR handoff, agents should update docs proactively without waiting for a separate instruction.
- Treat design mockups as directional references only; they do not automatically define product scope or required backend behavior.
- Treat prototype HTML in `docs/Design/` as disposable design-reference material only, not reusable implementation code.
- Never create a git commit or PR action unless the user explicitly asks for it.
