# Contracts

## Shared Contract Rules

- Every external boundary must have a schema in `packages/contracts`.
- Prefer discriminated unions and explicit status enums over boolean flags.
- Use typed `Result` objects for recoverable workflow outcomes.
- Keep IPC commands narrow and capability-based.
- Avoid package-internal imports across workspace boundaries.

## Current Shared Domains

- Candidate profile and resume source metadata
- Candidate contact fields, stored resume text, extraction status, and provider-visible profile state
- Job search preferences, approval mode, and tailoring mode
- Job posting, adapter-driven discovery targets with optional per-target custom navigation instructions, target-level source-instruction status/ids, source-debug run and attempt artifacts, per-phase completion modes and lightweight phase-evidence payloads, evidence refs, retained discovery runs, activity timeline events, fit assessment, discovery provenance, and review queue items, plus learned navigation/search/detail/apply guidance artifacts for each target; live discovery/apply consumes only the active instruction artifact for that exact target (`validated`, or a `draft` that the user explicitly accepted)
- Fixed resume template definitions, selected template settings, and template-driven tailored resume asset metadata
- Tailored resume asset metadata, stored content, preview sections, generation-method notes, and saved artifact paths
- Application record, event timeline, attempt checkpoints, and apply execution results
- Browser session state, adapter-scoped discovery sessions, driver metadata, run-scoped browser open/close lifecycle for live discovery and source-debug work, and agent-provider status for source adapters
- Job Finder repository/workspace snapshot state plus typed save/update IPC payloads for profile, preferences, settings, retained run history, staged discovery results, source-debug launch/query/cancel actions, additive source-debug run-details review payloads, source-instruction promotion/verification actions, and renderer-visible learned instruction artifacts
- Interview workspace, transcript chunks, and live suggestions later in the roadmap

## Validation Policy

- Browser extraction outputs must be normalized through schemas before they become saved jobs
- Debug-agent findings and source-instruction drafts must be schema-validated and replay-verified before they become reusable target instructions
- Draft source instructions for a target are injected into live discovery/apply runs for that same target by default; validated artifacts still take precedence only when no newer draft is bound
- Source-debug artifacts should stay structured and curated: persist attempt artifacts, evidence refs, phase summaries, completion metadata, and instruction artifacts instead of raw worker transcripts
- Resume-text extraction outputs must be normalized through schemas before they overwrite stored candidate details
- Tailored assets and apply attempt checkpoints should be validated before persistence
- Document ingestion must validate metadata and content shape
- AI provider responses should be normalized before module logic uses them
