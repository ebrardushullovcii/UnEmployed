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

