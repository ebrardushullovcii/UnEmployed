# Testing

## Required Commands

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm agents:check`
- `pnpm docs:check`

## UI Validation Commands

- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop dev`
- `pnpm --filter @unemployed/desktop ui:capture`

## Desktop UI Capture Workflow

- Install workspace dependencies first with `pnpm install` so the desktop app and `playwright` are available locally.
- Use `pnpm --filter @unemployed/desktop ui:capture` for the default desktop review pass.
- The capture script builds the desktop app first, launches Electron through Playwright, waits for the seeded Job Finder workspace to load, clicks through the current MVP screens, and saves screenshots for visual review.
- The current default capture size is `1440x920`.
- The current standard multi-size review pass covers `1728x1080`, `1440x920`, `1280x800`, and `1024x768`.
- Override capture size with environment variables when needed, for example: `UI_CAPTURE_WIDTH=1280 UI_CAPTURE_HEIGHT=800 UI_CAPTURE_LABEL=1280x800 pnpm --filter @unemployed/desktop exec node ./scripts/capture-ui.mjs`.
- Captures are written to `apps/desktop/test-artifacts/ui/<label>/`.
- The script uses a temporary user-data directory on each run so screenshots start from a clean seeded state instead of inheriting an old local workspace.
- Capture artifacts are validation output only and should not be committed.

## Testing Model

- Unit tests for pure logic
- Contract tests for schemas and public package interfaces
- Integration tests for adapter boundaries
- Electron UI capture runs for desktop boot, screen navigation, and screenshot-based review of the current shell
- Broader end-to-end tests later for browser runtime, job discovery, and live interview flows

## Foundation Expectations

- Fixtures must be deterministic
- Fake providers should replace real model/browser dependencies in tests
- Repo checks must fail on doc drift and adapter drift, not just code failures
- UI capture artifacts should be treated as validation outputs, not committed source files
