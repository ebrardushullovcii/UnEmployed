---
name: repo-governance
description: Use when changing repo-wide structure, canonical docs, agent adapters, package boundaries, or validation scripts for the UnEmployed monorepo.
---

# Repo Governance

Use this skill when the task changes how the repository is organized or how agents should work in it.

## Workflow

1. Read `AGENTS.md`, `docs/README.md`, `docs/PLAN.md`, `docs/AGENT_CONTEXT.md`, `docs/STATUS.md`, and `.agents/registry.yaml`.
2. If the change affects repo guidance, update canonical docs first.
3. Run `pnpm agents:sync` after changing shared guidance or project-local skills.
4. Run `pnpm agents:check` and `pnpm docs:check` before closing the task.
5. Keep package-local `AGENTS.md` files aligned with any workspace changes.
