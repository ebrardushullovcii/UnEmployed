---
name: repo-governance
description: Use when changing UnEmployed repo-wide structure, canonical docs, agent adapters, package boundaries, skills, or validation scripts.
---

# Repo Governance

Use this skill when the task changes how the repository is organized or how agents should work in it.

## Workflow

1. Read `AGENTS.md`, `docs/README.md`, `docs/PLAN.md`, `docs/AGENT_CONTEXT.md`, and `.agents/registry.yaml`.
2. Read `docs/STATUS.md` and `docs/TRACKS.md` only when the change touches active handoff state or current feature work.
3. If the change affects repo guidance, update canonical docs first.
4. Run `pnpm validate:docs-only` after changing shared guidance or project-local skills.
5. Run focused package validation when code changes are included.
6. Keep package-local `AGENTS.md` files aligned with any workspace changes.
