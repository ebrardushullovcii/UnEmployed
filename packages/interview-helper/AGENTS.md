# Interview Helper Package

Owns interview prep, live session state, transcript context, and suggestion orchestration.

## Rules

- Keep live-session state machine testable and deterministic.
- Treat overlay rendering as a consumer of session state, not the owner of it.
- Keep OS-specific capture and hotkey behavior behind adapters.

