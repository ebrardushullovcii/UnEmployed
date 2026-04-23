# Browser Runtime

Owns browser lifecycle, sessions, and generic automation primitives.

## Rules

- Keep site or workflow policy out of this package
- Keep catalog runtime limited to generic seeded session primitives
- Keep session ownership and auth-state handling explicit
- Renderer code should not import this package directly
