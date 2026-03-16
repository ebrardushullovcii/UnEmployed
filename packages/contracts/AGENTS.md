# Contracts

Owns shared schemas, enums, DTOs, and typed IPC payloads.

## Rules

- Add schemas before widening module behavior.
- Keep exports stable and centralized from `src/index.ts`.
- Prefer discriminated unions and status enums over loose objects.
- Tests here are contract tests and should stay deterministic.

