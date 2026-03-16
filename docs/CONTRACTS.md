# Contracts

## Shared Contract Rules

- Every external boundary must have a schema in `packages/contracts`.
- Prefer discriminated unions and explicit status enums over boolean flags.
- Use typed `Result` objects for recoverable workflow outcomes.
- Keep IPC commands narrow and capability-based.
- Avoid package-internal imports across workspace boundaries.

## Initial Shared Domains

- Candidate profile
- Resume variant
- Job posting
- Application record
- Application status
- Interview workspace
- Interview session
- Transcript chunk
- Live suggestion

## Validation Policy

- Browser extraction outputs must be normalized through schemas
- Document ingestion must validate metadata and content shape
- AI provider responses should be normalized before module logic uses them

