# Contracts

Owns shared schemas, enums, DTOs, and typed IPC payloads.

## Rules

- Add or change schemas before widening behavior elsewhere
- Prefer discriminated unions and explicit status enums
- Keep `src/index.ts` as the stable public barrel
- Keep tests deterministic
