# Desktop App

Owns Electron main, preload, and renderer.

## Start Here

- `src/main/`: main-process entrypoints and adapters
- `src/preload/`: typed preload bridge
- `src/renderer/src/pages/`, `src/renderer/src/features/`: app UI

## Rules

- Keep main, preload, and renderer concerns separate
- Never expose raw Node or Electron primitives to the renderer
- Keep that renderer boundary source-generic too: do not let renderer or Electron layers depend on browser-agent internals; see `packages/browser-agent/AGENTS.md` for the authoritative policy
- Shared types and IPC payloads come from `@unemployed/contracts`
- Shared UI belongs in `src/renderer/src/components/ui/`
- Reuse tokens from `src/renderer/src/styles/globals.css`

## Verification

- Prefer `pnpm validate:desktop` as the canonical lint -> typecheck -> test flow for `@unemployed/desktop`
- Repo-wide shortcut pattern: `pnpm validate:package <alias>` (desktop alias: `pnpm validate:package desktop`)
- `pnpm --filter @unemployed/desktop build`
- UI harnesses: `docs/TESTING.md`
