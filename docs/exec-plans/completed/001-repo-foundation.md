# 001 Repo Foundation

Status: completed

## Goal

Create an agent-first baseline for the repo so future work happens inside a typed monorepo with canonical docs, generated agent adapters, and a runnable desktop shell.

## Scope

- Root workspace setup
- Canonical docs
- Agent registry and adapter generation
- Package scaffolding with local guides
- Minimal Electron app shell

## Exit Criteria

- `pnpm install` succeeds
- `pnpm agents:sync` succeeds
- `pnpm docs:check` succeeds
- `pnpm typecheck` succeeds
- Desktop app boots into a placeholder shell
