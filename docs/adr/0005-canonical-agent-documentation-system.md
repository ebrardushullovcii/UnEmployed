# Canonical Agent Documentation System

Status: superseded by [ADR 0015](0015-minimal-agent-guidance.md) on 2026-09-04.

Status: accepted

Use one canonical repo guidance system composed of `AGENTS.md`, canonical docs in `docs/`, `.agents/registry.yaml`, short package-local `AGENTS.md` files, repo-specific skills, and generated thin adapters for tool-specific contexts. New agents need a small trustworthy map, while generated wrappers reduce drift across Codex, Claude Code, and Cursor.

## Consequences

- Keep always-on guidance short and pointer-based.
- Keep completed implementation detail out of startup docs.
- Keep package-local guides only where local rules differ.
- Run `pnpm validate:docs-only` after shared guidance, skill, doc, or generated adapter changes.
