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
- Candidate narrative, proof-bank entries, reusable screener answers, and application identity defaults stored on `CandidateProfile`
- Candidate contact fields, stored resume text, extraction status, and provider-visible profile state
- Job search preferences, approval mode, and tailoring mode
- Job posting, adapter-driven discovery targets, retained discovery runs, activity timeline events, fit assessment, discovery provenance, richer saved-job metadata, and review queue items
- Application attempt question memory, answer provenance, blocker summaries, consent history, replay links, and summary-level application-record rollups
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
- Resume import now persists typed import runs, canonical document bundles, and field candidates; only accepted candidates may update canonical profile or search-preference roots
- Tailored assets and apply attempt checkpoints should be validated before persistence
- Document ingestion must validate metadata and content shape
- AI provider responses should be normalized before module logic uses them

## Discovery And Source-Debug Progress

- `AgentDiscoveryProgress` is the shared browser-agent progress envelope for discovery-facing orchestration and may carry product-facing `message`, `waitReason`, `phase`, `elapsedMs`, and `lastActivityAt` fields in addition to the current URL, jobs found, and step count.
- `DiscoveryActivityEvent` may now retain the normalized `waitReason` alongside its stage so saved discovery activity can distinguish browser movement from AI waiting, merge work, and persistence work after the fact.
- `SourceDebugProgressEvent` is the typed live progress payload for `runSourceDebug`; desktop IPC may stream it while a run is active so renderer surfaces can explain browser startup, AI waiting, tool execution, persistence, manual prerequisites, and final review or finalization work in real time.
- Progress wait states should reuse the shared `BrowserRunWaitReason` vocabulary instead of package-local ad hoc strings so discovery, source-debug, and renderer status surfaces stay aligned.

## Retained Timing Summaries

- Discovery run records retain bounded timing summaries on `summary.timing`, and each discovery target execution may also keep a target-local timing summary on `targetExecutions[].timing`.
- Source-debug run records retain bounded timing summaries on `run.timing`, while `attempts[].timing` and `phaseSummaries[].timing` keep phase-level attribution available for later review.
- Timing summaries are intentionally aggregate-only: total duration, time to first visible progress, longest silent gap, event count, and duration buckets grouped by stage or wait reason.
- The desktop test API may expose a `JobFinderPerformanceSnapshot` for benchmark and QA flows, but product UI should keep using curated progress and run-history surfaces rather than raw diagnostic internals.

## Job Posting Fields

- `applicationUrl`: nullable absolute URL; use when the apply entry route differs from the canonical job-detail route.
- `postedAt`: nullable ISO datetime, defaults to `null`; only use for exact machine-readable posting timestamps.
- `postedAtText`: nullable non-empty string, defaults to `null`; preserves source-facing relative or fuzzy posted-time copy when exact time is unavailable.
- `discoveredAt`: required ISO datetime; records when the app captured the posting.
- `firstSeenAt`, `lastSeenAt`, and `lastVerifiedActiveAt`: nullable ISO datetimes used for saved-job freshness tracking.
- `salaryText`: nullable non-empty string; stores raw display salary text.
- `normalizedCompensation`: additive normalized compensation object with nullable `currency`, `interval`, `minAmount`, `maxAmount`, `minAnnualUsd`, and `maxAnnualUsd`; preserve `salaryText` even when normalization is partial.
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
- `atsProvider`: nullable non-empty string, defaults to `null`; only set when grounded from the source or URL patterns.
- `screeningHints`: additive job-attached screening metadata for sponsorship, clearance, relocation, travel, and remote-geography hints.
- `keywordSignals`: weighted keyword cues retained on saved jobs for later resume targeting, review, and apply memory.
- `benefits`: array of non-empty strings, defaults to `[]`; visible benefits copied from the source.

## Application Memory Fields

- `ApplicationAttempt.questions`: structured detected question records with `kind`, `isRequired`, suggested answers, submitted answers, and answer provenance refs.
- `ApplicationAttempt.blocker`: nullable typed blocker summary with a code, user-facing summary, optional detail, linked question IDs, and linked source-debug evidence IDs.
- `ApplicationAttempt.consentDecisions`: bounded consent history for resume use, profile autofill, external redirects, or manual follow-up requests.
- `ApplicationAttempt.replay`: last apply URL, replay checkpoints, active instruction link, and linked source-debug evidence IDs.
- `ApplicationRecord.questionSummary`, `latestBlocker`, `consentSummary`, and `replaySummary`: summary-only rollups for renderer list/detail surfaces; keep the full detailed artifacts on `ApplicationAttempt`.

## Review Queue Resume Review State

- `resumeReview`: discriminated union on `status`, defaults to `{ status: "not_started" }`; replaces loose review/approval/staleness bridge fields.
- `resumeReview.status = "not_started"`: no draft exists yet.
- `resumeReview.status = "draft"`: draft exists and is still being edited.
- `resumeReview.status = "needs_review"`: draft is reviewable but not approved yet, including defensive fallback when approval metadata is inconsistent.
- `resumeReview.status = "stale"`: approval is invalidated and may include nullable `staleReason`.
- `resumeReview.status = "approved"`: requires `approvedAt`, `approvedExportId`, `approvedFormat`, and `approvedFilePath`; downstream flows should trust these fields instead of inferring approval from coarse asset state, and renderer gating may compare the approved file path against the current tailored asset path.
