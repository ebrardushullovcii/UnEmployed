# AI Providers

Owns provider abstractions and adapters for STT, chat, vision, and embeddings.

## Rules

- Keep provider interfaces narrow and explicit.
- Normalize provider output before exposing it to module logic.
- Avoid product logic in provider adapters.

