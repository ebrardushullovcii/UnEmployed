# Browser Runtime

Owns browser session lifecycle, automation primitives, and page interaction contracts.

## Rules

- Keep site-specific logic separate from generic runtime primitives.
- Renderer code should not import this package directly.
- Session ownership and auth-state handling must remain explicit.

