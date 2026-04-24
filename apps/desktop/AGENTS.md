# Desktop App

Owns Electron main, preload, and renderer.

## Start Here

- `src/main/`: main-process entrypoints and adapters
- `src/preload/`: typed preload bridge
- `src/renderer/src/pages/`, `src/renderer/src/features/`: app UI

## Rules

- Keep main, preload, and renderer concerns separate
- Never expose raw Node or Electron primitives to the renderer
- Shared types and IPC payloads come from `@unemployed/contracts`
- Shared UI belongs in `src/renderer/src/components/ui/`
- Reuse tokens from `src/renderer/src/styles/globals.css`

## Verification

- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop typecheck`
- `pnpm --filter @unemployed/desktop lint`
- UI harnesses: `docs/TESTING.md`
