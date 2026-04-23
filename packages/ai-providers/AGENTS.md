# AI Providers

Owns provider abstractions and adapters.

## Rules

- Keep provider interfaces narrow and explicit
- Normalize provider output before product code consumes it
- Avoid product logic in adapters
- Keep `src/index.ts` as a thin barrel
