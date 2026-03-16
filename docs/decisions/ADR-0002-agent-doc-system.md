# ADR-0002: Canonical Agent Documentation System

## Status

Accepted

## Decision

Keep one canonical repo guidance system composed of:
- `AGENTS.md`
- canonical docs in `docs/`
- a machine-readable `agent/registry.yaml`
- generated thin adapters for tool-specific contexts

## Why

- New agents need a small trustworthy map, not many overlapping sources
- Generated wrappers reduce drift across Codex, Claude Code, and Cursor
- Package-level `AGENTS.md` files give local context without loading the full repo worldview

