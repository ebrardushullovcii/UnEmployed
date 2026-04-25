# Interview Helper

Owns interview prep, live session state, transcript context, and suggestions.

## Rules

- Keep the live-session state machine deterministic and testable
- Treat overlay rendering as a consumer of session state
- Keep OS-specific capture and hotkeys behind adapters
