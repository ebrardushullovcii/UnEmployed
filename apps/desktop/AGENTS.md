# Desktop App

Owns Electron main, preload, and renderer.

## Start Here

- `src/main/`: main-process entrypoints and adapters
- `src/preload/`: typed preload bridge
- `src/renderer/src/pages/` and `src/renderer/src/features/`: app UI

## Rules

- Keep main, preload, and renderer concerns separate
- Never expose raw Node or Electron primitives to the renderer
- Shared types and IPC payloads come from `@unemployed/contracts`
- Keep shared UI in `src/renderer/src/components/ui/`; keep feature composition inside each feature
- Reuse tokens from `src/renderer/src/styles/globals.css` before adding new values

## Verification

- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop typecheck`
- `pnpm --filter @unemployed/desktop lint`
- Use `docs/TESTING.md` for the full UI harness list
