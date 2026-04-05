# Contracts

## Shared Contract Rules

- Every external boundary must have a schema in `packages/contracts`.
- Prefer discriminated unions and explicit status enums over boolean flags.
- Use typed `Result` objects for recoverable workflow outcomes.
- Keep IPC commands narrow and capability-based.
- Avoid package-internal imports across workspace boundaries.
- Keep this doc focused on cross-package contract surfaces and semantic rules; field detail that matters only inside one package should stay in `packages/contracts`.

## Shared Domains

- Candidate profile and resume source metadata
- Candidate contact fields, stored resume text, extraction status, and provider-visible profile state
- Job search preferences, approval mode, and tailoring mode
- Job posting, adapter-driven discovery targets, retained discovery runs, activity timeline events, fit assessment, discovery provenance, and review queue items
- Source-debug run and attempt artifacts, per-phase completion metadata, evidence refs, and learned navigation/search/detail/apply guidance artifacts for each target
- Live discovery and supported apply consume only the active instruction artifact for the exact target: the newest bound `draft`, or `validated` when no newer draft is present
- Review Queue resume-review state is modeled as a typed discriminated object instead of loosely related approval or stale fields, so renderer and service code can reason about `not_started`, `draft`, `needs_review`, `stale`, and `approved` states consistently
- Fixed resume template definitions, selected template settings, and template-driven tailored resume asset metadata
- Tailored resume asset metadata, stored content, preview sections, generation-method notes, and saved artifact paths
- Application record, event timeline, attempt checkpoints, and apply execution results
- Browser session state, adapter-scoped discovery sessions, driver metadata, run-scoped browser open/close lifecycle for live discovery and source-debug work, and agent-provider status for source adapters
- Job Finder repository and workspace snapshot state plus typed save/update IPC payloads for profile, preferences, settings, retained run history, and staged discovery results
- Source-debug IPC payloads for launch/query/cancel actions, additive run-details review data, source-instruction promotion or verification actions, and renderer-visible learned instruction artifacts
- Interview workspace, transcript chunks, and live suggestions later in the roadmap

## Validation Policy

- Browser extraction outputs must be normalized through schemas before they become saved jobs
- Debug-agent findings and source-instruction drafts must be schema-validated and replay-verified before they become reusable target instructions
- The newest bound draft source instructions for a target are injected into live discovery/apply runs for that same target by default; validated artifacts apply when no newer draft is bound
- Source-debug artifacts should stay structured and curated: persist attempt artifacts, evidence refs, phase summaries, completion metadata, and instruction artifacts instead of raw worker transcripts
- Resume-text extraction outputs must be normalized through schemas before they overwrite stored candidate details
- Tailored assets and apply attempt checkpoints should be validated before persistence
- Document ingestion must validate metadata and content shape
- AI provider responses should be normalized before module logic uses them

## Job Posting Fields

- `postedAt`: nullable ISO datetime, defaults to `null`; only use for exact machine-readable posting timestamps.
- `postedAtText`: nullable non-empty string, defaults to `null`; preserves source-facing relative or fuzzy posted-time copy when exact time is unavailable.
- `discoveredAt`: required ISO datetime; records when the app captured the posting.
- `salaryText`: nullable non-empty string; stores raw display salary text.
- `summary`: nullable non-empty string, defaults to `null`; short grounded summary for list/review surfaces.
- `description`: required non-empty string; normalized primary job body text.
- `keySkills`: array of non-empty strings, defaults to `[]`; explicit skills proven by the source.
- `responsibilities`: array of non-empty strings, defaults to `[]`; grounded responsibility lines.
- `minimumQualifications`: array of non-empty strings, defaults to `[]`; required qualifications only.
- `preferredQualifications`: array of non-empty strings, defaults to `[]`; optional or preferred qualifications only.
- `seniority`: nullable non-empty string, defaults to `null`; preserve source wording instead of mapping to a repo-specific enum.
- `employmentType`: nullable non-empty string, defaults to `null`; preserve source wording.
- `department`: nullable non-empty string, defaults to `null`; org/department label when present.
- `team`: nullable non-empty string, defaults to `null`; smaller team or squad label when present.
- `employerWebsiteUrl`: nullable absolute URL string, defaults to `null`; must be normalized to a real URL before validation.
- `employerDomain`: nullable non-empty string, defaults to `null`; normalized hostname/domain used for employer research targeting.
- `benefits`: array of non-empty strings, defaults to `[]`; visible benefits copied from the source.

## Review Queue Resume Review State

- `resumeReview`: discriminated union on `status`, defaults to `{ status: "not_started" }`; replaces loose review/approval/staleness bridge fields.
- `resumeReview.status = "not_started"`: no draft exists yet.
- `resumeReview.status = "draft"`: draft exists and is still being edited.
- `resumeReview.status = "needs_review"`: draft is reviewable but not approved yet, including defensive fallback when approval metadata is inconsistent.
- `resumeReview.status = "stale"`: approval is invalidated and may include nullable `staleReason`.
- `resumeReview.status = "approved"`: requires `approvedAt`, `approvedExportId`, and `approvedFormat`; downstream flows should trust these fields instead of inferring approval from coarse asset state.
