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
- `ResumeDraftEntry` entry-scoped draft content, `ResumeDraftEntryType`, and typed patch targeting through `targetEntryId` (defined in `packages/contracts/src/resume.ts`)
- Application attempt question memory, answer provenance, blocker summaries, consent history, replay links, and summary-level application-record rollups
- Source-debug run and attempt artifacts, per-phase completion metadata, evidence refs, and learned navigation/search/detail/apply guidance artifacts for each target
- Live discovery and supported apply consume only the active instruction artifact for the exact target: the newest bound `draft`, or `validated` when no newer draft is present
- Review Queue resume-review state is modeled as a typed discriminated object instead of loosely related approval or stale fields, so renderer and service code can reason about `not_started`, `draft`, `needs_review`, `stale`, and `approved` states consistently
- `ResumeDraftEntryTypeSchema` (from `packages/contracts/src/resume.ts`) enforces the allowed `resumeDraftEntryTypeValues`: `experience`, `project`, `education`, `certification`, `skill_group`, and `language`. A `ResumeDraftEntry` stores entry-scoped draft content per row with `id`, `entryType`, nullable display fields such as `title`, `subtitle`, `location`, `dateRange`, and `summary`, plus `bullets`, inclusion/lock state, refs, and metadata.
- `ResumeDraftPatch.targetEntryId` (from `packages/contracts/src/resume.ts`) targets a specific existing `ResumeDraftEntry` inside the selected section. Example: a patch with `targetSectionId = "section_experience"` and `targetEntryId = "experience_1"` updates that existing experience row; a patch with `targetEntryId = null` remains section-scoped instead of targeting any entry.
- Fixed resume template definitions, selected template settings, and template-driven tailored resume asset metadata
- Tailored resume asset metadata, stored content, preview sections, generation-method notes, and saved artifact paths
- Application record, event timeline, attempt checkpoints, and apply execution results
- Browser session state, adapter-scoped discovery sessions, driver metadata, run-scoped browser open/close lifecycle for live discovery and source-debug work, and agent-provider status for source adapters
- Job Finder repository and workspace snapshot state plus typed save/update IPC payloads for profile, preferences, settings, retained run history, and staged discovery results
- Guided profile-setup workflow state, resumable current-step tracking, and typed review-item queues that stay adjacent to workspace state instead of hiding in renderer-only storage; unresolved resume-import candidates now map into durable `profileSetupState.reviewItems` by setup step so guided setup and later profile recovery can reopen the exact pending review work
- Source-debug IPC payloads for launch/query/cancel actions, additive run-details review data, source-instruction promotion or verification actions, and renderer-visible learned instruction artifacts
- Interview workspace, transcript chunks, and live suggestions later in the roadmap

## Validation Policy

- Browser extraction outputs must be normalized through schemas before they become saved jobs
- Debug-agent findings and source-instruction drafts must be schema-validated and replay-verified before they become reusable target instructions
- The newest bound draft source instructions for a target are injected into live discovery/apply runs for that same target by default; validated artifacts apply when no newer draft is bound
- Source-debug artifacts should stay structured and curated: persist attempt artifacts, evidence refs, phase summaries, completion metadata, and instruction artifacts instead of raw worker transcripts
- Resume import now persists typed import runs, canonical document bundles, and field candidates; only accepted candidates may update canonical profile or search-preference roots
- Resume import benchmark reports retain both a top-level `parserManifestVersion` summary and a `parserManifestVersions` list so QA can tell whether a corpus replay ran through one parser manifest or a mixed embedded-plus-sidecar set of manifests
- Tailored assets and apply attempt checkpoints should be validated before persistence
- Document ingestion must validate metadata and content shape
- AI provider responses should be normalized before module logic uses them
- Non-agent AI requests (direct LLM calls for parsing, profile analysis, resume/import trimming, or other one-off operations outside agent orchestration and explicitly not browser-agent or discovery-worker flows) should be budgeted and compacted inside provider adapters before model submission so oversized profile, resume, or import payloads degrade by trimming lower-priority context instead of relying on provider-side context-limit failures. When agent orchestration is in play, deterministic catalog workflow policy such as filtering, eligibility gates, checkpoint shaping, and resume-usage rules belongs in `packages/browser-agent` instead.

## Discovery And Source-Debug Progress

- `AgentDiscoveryProgress` is the shared browser-agent progress envelope for discovery-facing orchestration and may carry product-facing `message`, `waitReason`, `phase`, `elapsedMs`, and `lastActivityAt` fields in addition to the current URL, jobs found, and step count.
- `DiscoveryActivityEvent` may now retain the normalized `waitReason` alongside its stage so saved discovery activity can distinguish browser movement from AI waiting, merge work, and persistence work after the fact.
- `DiscoveryActivityEvent` also carries nullable `collectionMethod` and `sourceIntelligenceProvider` fields so live and retained run history can explain whether a target used API collection, browser search, or provider-aware fast paths. These fields are nullable here because activity events can be emitted before source intelligence or collection-method resolution is complete.
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
- `discoveryMethod`: required enum with default `catalog_seed`; records the top-level origin of the posting (`catalog_seed`, browser-agent discovery, or public provider API collection).
- `collectionMethod`: required enum with default `fallback_search`; records the concrete collection path used for the target or posting inside that broader discovery origin. In practice, `discoveryMethod` answers `where did this posting come from overall?`, while `collectionMethod` answers `how was this target actually collected?`. Example pairs: `discoveryMethod = public_api` with `collectionMethod = api` when a provider board API directly returned the posting; `discoveryMethod = browser_agent` with `collectionMethod = listing_route` when the browser agent followed a proven search/results route; `discoveryMethod = browser_agent` with `collectionMethod = fallback_search` when the agent had to recover through generic search instead of a proven route.
- `providerKey`, `providerBoardToken`, and `providerIdentifier`: nullable provider-routing metadata retained when source intelligence identifies a public board API or provider-specific listing shape. These are the denormalized lookup fields used most often for routing, identity matching, and persisted summaries.
- `sourceIntelligence`: nullable `SourceIntelligenceArtifact`; keeps the fuller typed provider, route, reliability, collection, and apply-hint artifact used for this posting. When present, `sourceIntelligence` is the authoritative provider snapshot and the top-level provider metadata fields above are concise mirrors or extracts of it. Writers should update those top-level fields whenever `sourceIntelligence.provider` changes, and readers should prefer `sourceIntelligence` if they ever diverge.
- `titleTriageOutcome`: enum defaulting to `pass`; records whether preferences or title-first triage kept, deprioritized, or skipped the posting.
- `screeningHints`: additive job-attached screening metadata for sponsorship, clearance, relocation, travel, and remote-geography hints.
- `keywordSignals`: weighted keyword cues retained on saved jobs for later resume targeting, review, and apply memory.
- `benefits`: array of non-empty strings, defaults to `[]`; visible benefits copied from the source.
- `SavedJob.provenance`: array of typed discovery provenance entries; each entry records `targetId`, adapter kind, resolved adapter kind, starting URL, `discoveredAt`, `collectionMethod`, nullable provider metadata, and `titleTriageOutcome` for the specific run that retained the job.
- `DiscoveryLedgerEntry`: durable per-posting history keyed by canonical/provider identity with `firstSeenAt`, `lastSeenAt`, nullable `lastAppliedAt`, nullable `lastEnrichedAt`, nullable `inactiveAt`, `latestStatus`, `titleTriageOutcome`, and nullable `skipReason` so future runs can dedupe, re-evaluate broadened searches, and mark inactive postings.

## Discovery Run Metadata

- `DiscoveryRunRecord.scope`: persisted run scope enum (`run_all` or `single_target`) used by renderer history and IPC consumers.
- `DiscoveryRunRecord.summary.browserCloseout`: nullable closeout summary describing whether the browser was closed or kept alive, plus the observed session status/driver and `occurredAt` timestamp.
- `AgentProviderStatus.modelContextWindowTokens`: nullable integer representing the model's context window size in tokens; used by workflow orchestrators to compute effective compaction budgets without hard-coding provider context sizes.
- `DiscoveryTargetExecution`: per-target retained execution summary including nullable `collectionMethod`, nullable `sourceIntelligenceProvider`, nullable singular `warning`, optional timing, and the concrete target-local count fields `jobsFound`, `jobsPersisted`, and `jobsStaged`. `warning` is a non-fatal human-readable summary used for partial collection outcomes such as provider/API fallbacks, empty-result warnings, or target-local issues that did not abort the whole run.
- `DiscoveryAgentMetadata.compactionState` (nullable object following the shared compaction snapshot schema from `packages/contracts/src/agent-compaction.ts`) plus `compactionUsedFallbackTrigger` (boolean) preserve lightweight worker-level evidence that context was compacted to fit model token limits, without persisting raw hidden transcripts. Here, compaction means execution-time context reduction that trims large worker transcripts into summary metadata while keeping enough evidence for the workflow to continue safely.
- `DiscoveryTargetExecution.compaction` (nullable object using the same shared compaction snapshot shape) plus `compactionUsedFallbackTrigger` (boolean) preserve target-level visibility into whether a discovery worker compacted context during execution, while `DiscoveryAgentMetadata.compactionState` remains the worker-local evidence surface.
- `collectionMethod` nullability differs by entity on purpose:
  - Concrete values persisted on records: `JobPosting.collectionMethod`, `SavedJob.provenance[].collectionMethod`, and `DiscoveryLedgerEntry.collectionMethod`.
  - Nullable intermediate values: `DiscoveryTargetExecution.collectionMethod` and `DiscoveryActivityEvent.collectionMethod` because execution- or event-level history may be recorded before the target's final method is known or when no concrete method was resolved.
- `sourceIntelligenceProvider` on `DiscoveryTargetExecution` and `DiscoveryActivityEvent` is only the normalized provider key summary; the richer provider metadata fields (`providerKey`, `providerBoardToken`, `providerIdentifier`) and the full `sourceIntelligence` artifact remain on the persisted posting and related provenance records.

## Application Memory Fields

- `ApplicationAttempt.questions`: structured detected question records with `kind`, `isRequired`, suggested answers, submitted answers, and answer provenance refs.
- `ApplicationAttempt.blocker`: nullable typed blocker summary with a code, user-facing summary, optional detail, linked question IDs, and linked source-debug evidence IDs.
- `ApplicationAttempt.consentDecisions`: bounded consent history for resume use, profile autofill, external redirects, or manual follow-up requests.
- `ApplicationAttempt.replay`: last apply URL, replay checkpoints, active instruction link, and linked source-debug evidence IDs.
- `ApplicationRecord.questionSummary`, `latestBlocker`, `consentSummary`, and `replaySummary`: summary-only rollups for renderer list/detail surfaces; keep the full detailed artifacts on `ApplicationAttempt`.
- `ApplyRun`, `ApplyJobResult`, `ApplicationQuestionRecord`, `ApplicationAnswerRecord`, `ApplicationArtifactRef`, `ApplicationReplayCheckpoint`, and `ApplicationConsentRequest` (defined in `packages/contracts/src/apply.ts`) now form the stage-015 non-submitting apply-copilot memory root; they keep run-scoped review-ready artifacts separate from the older high-level `ApplicationAttempt` summary.
- `ApplyRunDetails` plus the narrow `JobFinderApplyRunDetailsQuery` IPC payload (from `packages/contracts/src/apply.ts`) are the typed read path for raw apply-run review data; desktop uses them to fetch persisted questions, grounded answers, retained artifacts, checkpoints, consent requests, and any run-scoped submit approval record for the selected run/job pair.
- `JobFinderApplyRunActionInput` (from `packages/contracts/src/apply.ts`) is the shared narrow IPC payload for run-scoped approval actions such as approve or revoke; it keeps later submit-approval controls capability-based instead of overloading job-only actions.
- `BrowserSessionRuntime.executeApplicationFlow(...)` is the widened runtime seam for staged apply work. It accepts a typed execution mode (`prepare_only` or `submit_when_ready`), but the current PR stage still keeps the actual submit boundary guarded and disabled, so `submit_when_ready` is not active yet.
- `ExecuteApplicationFlowInput.recoveryContext` is the bounded retry-context seam for safe reruns. `packages/job-finder` may pass the latest saved checkpoint label/detail/URL, prior run identity, checkpoint URL history, and blocker summary for the same job so a fresh non-submitting `prepare_only` rerun can retain auditable replay context without leaking renderer state into the runtime contract.

## Review Queue Resume Review State

- `resumeReview`: discriminated union on `status`, defaults to `{ status: "not_started" }`; replaces loose review/approval/staleness bridge fields.
- `resumeReview.status = "not_started"`: no draft exists yet.
- `resumeReview.status = "draft"`: draft exists and is still being edited.
- `resumeReview.status = "needs_review"`: draft is reviewable but not approved yet, including defensive fallback when approval metadata is inconsistent.
- `resumeReview.status = "stale"`: approval is invalidated and may include nullable `staleReason`.
- `resumeReview.status = "approved"`: requires `approvedAt`, `approvedExportId`, `approvedFormat`, and `approvedFilePath`; downstream flows should trust these fields instead of inferring approval from coarse asset state, and renderer gating may compare the approved file path against the current tailored asset path.
