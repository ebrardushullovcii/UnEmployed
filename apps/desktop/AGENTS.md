# Desktop App

Owns the Electron shell, preload bridge, and renderer entrypoint.

## Rules

- Keep Electron main, preload, and renderer concerns separate.
- Never expose raw Node or Electron primitives directly to the renderer.
- Shared types and IPC payload shapes come from `@unemployed/contracts`.
- UI changes should preserve room for both `Job Finder` and `Interview Helper`.

## Commands

- `pnpm --filter @unemployed/desktop dev`
- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop typecheck`
- `pnpm --filter @unemployed/desktop ui:capture`
- `pnpm --filter @unemployed/desktop ui:resume-import`
- `pnpm --filter @unemployed/desktop ui:profile-baseline`

## UI Review Notes

- `ui:capture` builds the app, launches Electron through Playwright, navigates the seeded Job Finder screens, and saves screenshots under `apps/desktop/test-artifacts/ui/`.
- `ui:resume-import` builds the app, enables a test-only preload bridge, imports a resume from disk without the native file-picker, reloads the workspace, and saves screenshots plus workspace JSON under `apps/desktop/test-artifacts/ui/`.
- `ui:profile-baseline` builds the app, hydrates the current preferred Profile state from a saved workspace snapshot, captures the top-level Job Finder tabs, and records top/full/scroll screenshots for every screen under `apps/desktop/test-artifacts/ui/`.
- Pass `--resume`, `--expected-name`, `--expected-headline`, `--expected-location`, `--expected-summary-contains`, and `--label` to `scripts/capture-resume-import.mjs` when you need targeted validation for a specific file.
- Pass `--snapshot` and `--label` to `scripts/capture-profile-baseline.mjs` when you need to document another imported-profile baseline or save into a new artifact folder.
- The default capture size is `1440x920`; use `UI_CAPTURE_WIDTH`, `UI_CAPTURE_HEIGHT`, and `UI_CAPTURE_LABEL` to run other desktop sizes.
- The capture flow uses a temporary user-data directory so each run starts from a clean seeded workspace.
- The Electron main process auto-loads root or `apps/desktop` `.env` / `.env.local` files before creating the AI client, so `UNEMPLOYED_AI_API_KEY` can live in `.env.local` for local testing.
