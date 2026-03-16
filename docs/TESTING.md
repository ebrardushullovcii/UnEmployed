# Testing

## Required Commands

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm agents:check`
- `pnpm docs:check`

## Testing Model

- Unit tests for pure logic
- Contract tests for schemas and public package interfaces
- Integration tests for adapter boundaries
- End-to-end tests later for desktop boot, browser runtime, and live interview flows

## Foundation Expectations

- Fixtures must be deterministic
- Fake providers should replace real model/browser dependencies in tests
- Repo checks must fail on doc drift and adapter drift, not just code failures

