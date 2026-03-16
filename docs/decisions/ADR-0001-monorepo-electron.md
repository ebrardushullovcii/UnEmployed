# ADR-0001: Monorepo And Electron Baseline

## Status

Accepted

## Decision

Use one `pnpm + turbo` TypeScript monorepo and one Electron desktop app as the initial implementation baseline.

## Why

- One shell can host both product modules
- Electron gives the fastest cross-platform path for desktop windowing, tray, hotkeys, and browser-adjacent workflows
- A monorepo keeps contracts, docs, test harnesses, and modules in one place for AI agents

