# AI Providers

Owns provider abstractions and adapters for chat, vision, STT, and embeddings. See `docs/ARCHITECTURE.md` for the canonical ownership map.

## Rules

- Keep provider interfaces narrow and explicit
- Normalize provider output before product code consumes it
- Avoid product logic in adapters
- Keep `src/index.ts` as a thin barrel
