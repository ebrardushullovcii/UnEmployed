# Desktop App

Owns the Electron shell, preload bridge, and renderer entrypoint.

## Rules

- Keep Electron main, preload, and renderer concerns separate.
- Never expose raw Node or Electron primitives directly to the renderer.
- Shared types and IPC payload shapes come from `@unemployed/contracts`.
- UI changes should preserve room for both `Job Finder` and `Interview Helper`.
- Keep local guidance implementation-facing; move cross-repo workflow rules into canonical docs.

## Key Paths

- `src/main/`: Electron main-process entrypoints and adapters
- `src/preload/`: typed preload bridge
- `src/renderer/src/app/` and `src/renderer/src/pages/`: routed app entrypoints
- `src/renderer/src/features/`: feature-local UI, hooks, and helpers
- `src/renderer/src/styles/globals.css`: canonical renderer tokens and base styles

## Commands

- `pnpm desktop:dev`
- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop typecheck`
- `pnpm --filter @unemployed/desktop lint`
- `pnpm --filter @unemployed/desktop ui:capture`
- `pnpm --filter @unemployed/desktop ui:resume-import`
- `pnpm --filter @unemployed/desktop ui:profile-baseline`
- `pnpm --filter @unemployed/desktop ui:resume-workspace`
- `pnpm --filter @unemployed/desktop ui:resume-workspace-dirty`

## Local Patterns

- Use the `@renderer/` alias for cross-feature or shared renderer imports.
- Reuse semantic tokens from `src/renderer/src/styles/globals.css` before adding new visual values.
- Keep shared primitives in `src/renderer/src/components/ui/` and feature composition in `src/renderer/src/features/<feature>/`.
- Use semantic structure, `useId()` plus `htmlFor`, and the correct ARIA state for interactive selections.
- For nested full-height layouts, give shrinking ancestors `min-h-0` and `min-w-0`, then assign scroll ownership explicitly.
- Keep scrollbars on the real panel edge by padding inner wrappers instead of the outer scroll container.
- If repeated review feedback reveals a reusable rule, update this file or the nearest canonical doc in the same task.

## UI QA

- `ui:capture`: seeded shell screenshots under `apps/desktop/test-artifacts/ui/`
- `ui:resume-import`: imports a real resume without the native picker and records screenshots plus workspace JSON
- `ui:profile-baseline`: captures the historical imported-profile baseline from a saved workspace snapshot
- `ui:resume-workspace`: walks the full resume workspace demo flow and saves screenshots plus final workspace JSON
- `ui:resume-workspace-dirty`: proves dirty-draft safety across refresh, assistant requests, approval clearing, and navigation
- Use `UI_CAPTURE_WIDTH`, `UI_CAPTURE_HEIGHT`, and `UI_CAPTURE_LABEL` for alternate desktop sizes or artifact folders.
- The main process auto-loads root or `apps/desktop` `.env` and `.env.local`, so local AI credentials can live there for desktop testing.
