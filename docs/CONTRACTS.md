# Contracts

## Shared Contract Rules

- Every external boundary must have a schema in `packages/contracts`.
- Prefer discriminated unions and explicit status enums over boolean flags.
- Use typed `Result` objects for recoverable workflow outcomes.
- Keep IPC commands narrow and capability-based.
- Avoid package-internal imports across workspace boundaries.

## Current Shared Domains

- Candidate profile and resume source metadata
- Job search preferences, approval mode, and tailoring mode
- Job posting, fit assessment, and review queue items
- Tailored resume asset metadata and preview sections
- Application record, event timeline, and attempt state
- Browser session state for source adapters
- Job Finder workspace snapshot for typed desktop IPC
- Interview workspace, transcript chunks, and live suggestions later in the roadmap

## Validation Policy

- Browser extraction outputs must be normalized through schemas
- Document ingestion must validate metadata and content shape
- AI provider responses should be normalized before module logic uses them

