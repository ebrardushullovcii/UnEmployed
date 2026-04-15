# 011 Job Finder Shared Data Expansion

Status: completed

Plan `011` is the first queued foundation slice. The earlier note captured the right direction, but it was still too abstract to execute cleanly. This version turns it into an implementation-ready plan grounded in the current schema, repository, and UI roots that already exist in the repo.

## Goal

Expand `Job Finder` shared data so later discovery, resume, and apply workflows stop reconstructing the same context repeatedly and instead reuse durable typed data.

The recommended first implementation should extend the existing roots in this order:

1. `CandidateProfile` for narrative, proof-bank, and reusable answer defaults
2. `SavedJob` and `JobPosting` for richer job and employer context
3. `ApplicationAttempt` and `ApplicationRecord` for question, answer, blocker, consent, and replay memory
4. existing source-debug artifacts as linked evidence, not as a second parallel artifact store

## Delivery Standard For Implementing Agents

This plan is not complete when contracts compile or a few new fields appear in the database.

Required implementation bar:

- add schemas before widening module behavior
- prefer extending existing schema and repository roots before introducing any new top-level store or table
- every new domain must be consumed by at least one real workflow before the slice is considered complete
- keep reusable candidate defaults separate from generated or submitted per-job answers
- keep source-debug evidence ownership where it already lives; do not create a second screenshot or replay-artifact system for apply data without explicit justification
- update docs in the same task so later agents can see which fields live where and which workflows consume them
- leave behind an explicit field-to-consumer map in the plan or implementation notes

In plain terms: another agent should be able to read this plan, inspect the named files, and implement the slice without inventing a parallel architecture.

## Why This Work Exists

The repo already has useful structured roots, but the current product still has a shared-data gap:

- `CandidateProfile` already stores basics, work eligibility, professional summary, projects, links, and structured records, but it does not yet retain a first-class narrative, proof-bank, or reusable answer bank
- `SavedJob` already stores normalized job details, but it is still thin for triage, provider-aware discovery, and automation readiness
- `ApplicationAttempt` still only retains summary text, coarse checkpoints, and next action labels; it is not yet a durable home for question history, answer provenance, blockers, consent state, or replay checkpoints
- source-debug already retains evidence refs and learned artifacts, but those artifacts are not yet linked into a richer shared apply-memory model
- too much downstream behavior still depends on re-reading resume text, re-analyzing job descriptions, or re-asking for the same candidate facts instead of reusing stored context

That leaves four product-level gaps:

1. resume quality is limited because the app does not yet store enough reusable proof and narrative data
2. discovery and job triage do not yet retain enough structured job or employer context to guide later decisions well
3. apply assistance and later automation do not yet have durable question, answer, blocker, and replay memory
4. later plans risk inventing one-off workflow-specific state unless `011` creates the shared foundation first

## Current Code And Contract Starting Points

The implementing agent should start from the current seams instead of inventing new roots by default.

### Candidate profile roots

- `packages/contracts/src/profile.ts`
  - `CandidateProfileSchema`
  - `CandidateProfessionalSummarySchema`
  - `CandidateWorkEligibilitySchema`
  - `CandidateExperienceSchema`
  - `CandidateProjectSchema`
  - `CandidateLinkSchema`
- `apps/desktop/src/renderer/src/features/job-finder/lib/profile-editor.ts`
  - already maps `workEligibility`, `professionalSummary`, skills, records, projects, and links into the current `Profile` editing surface

### Job and review roots

- `packages/contracts/src/discovery.ts`
  - `JobPostingSchema`
  - `SavedJobSchema`
  - `ReviewQueueItemSchema`

### Apply roots

- `packages/contracts/src/discovery.ts`
  - `ApplicationRecordSchema`
  - `ApplicationAttemptSchema`
  - `ApplicationAttemptCheckpointSchema`
- `packages/job-finder/src/internal/workspace-application-methods.ts`
  - currently turns a runtime result into a thin `ApplicationAttempt` plus `ApplicationRecord`

### Source-debug and evidence roots

- `packages/contracts/src/source-debug.ts`
  - `SourceDebugEvidenceRefSchema`
  - `SourceDebugWorkerAttemptSchema`
  - `SourceDebugRunRecordSchema`
  - `SourceInstructionArtifactSchema`

### Snapshot and persistence roots

- `packages/contracts/src/workspace.ts`
  - `JobFinderRepositoryStateSchema`
  - `JobFinderWorkspaceSnapshotSchema`
  - `JobFinderResumeWorkspaceSchema`
- `packages/db/src/repository-types.ts`
  - repository interface already persists `profile`, `savedJobs`, `applicationRecords`, `applicationAttempts`, and source-debug artifacts separately
- `packages/db/src/internal/migrations.ts`
  - current SQLite schema version is table-driven; JSON-shape-only expansion can often land without a new migration if no new table or indexed column is required

## Relationship To Existing Work

### Relationship To `003`

Plan `003` established the current profile information architecture. `011` should extend that architecture rather than replace it.

Implementation rule:

- prefer adding nested profile domains under `CandidateProfile` before creating sibling roots elsewhere

### Relationship To `007`

Plan `007` established the `Resume Workspace` and grounded draft provenance.

`011` should improve the quality of `007` outputs by adding stronger reusable inputs:

- narrative framing
- proof-bank entries
- role-family relevance tags
- reusable candidate defaults that resume generation can draw from safely

### Relationship To `012`

Plan `012` is the main collection and editing follow-on.

Implementation rule:

- `011` defines and persists the durable fields; `012` should collect and edit them through guided setup and profile copilot instead of inventing temporary setup-only state

### Relationship To `013`

Plan `013` needs stronger job, employer, provider, and evidence-linked state so source intelligence and faster discovery can reuse durable saved-job and apply-memory roots instead of inventing discovery-only storage.

### Relationship To `014`

Plan `014` depends on the new proof-bank and narrative fields from `011` so resume output quality can improve from better inputs instead of only better templates.

### Relationship To `015`

Plan `015` needs first-class question, answer, blocker, consent, and replay state.

Implementation rule:

- `011` should add the reusable job and apply-memory fields later discovery and apply work will consume, but it should not try to solve full provider intelligence or source-debug restructuring by itself

Implementation rule:

- `011` should create the shared data foundation for those domains so `015` can focus on runtime behavior instead of inventing apply-only storage later

## Locked Product Decisions

- Reuse existing schema and repository roots first.
- `CandidateProfile` is the first home for reusable narrative, proof-bank, and canonical screener answers.
- `JobPosting` and `SavedJob` are the first home for richer job and employer metadata.
- `ApplicationAttempt` is the first home for question, answer, blocker, consent, and replay details for a concrete apply run.
- `ApplicationRecord` should stay summary-oriented; do not turn it into a second full artifact store.
- Keep reusable answer-bank entries separate from generated answer candidates and final submitted answers.
- Keep employer metadata attached to saved jobs in the first slice unless a separate employer entity becomes clearly necessary.
- Reuse `SourceDebugEvidenceRef` IDs and `SourceInstructionArtifact` IDs where apply or discovery artifacts need evidence links.
- Do not store passwords, session cookies, or similar secrets.
- Do not add a new SQLite table or top-level repository collection unless JSON-shape expansion inside the existing roots is demonstrably insufficient.
- If a new field is added but no workflow consumes it, the implementation is incomplete.

## Product Outcome

When this plan lands, the app should be able to:

1. store a richer candidate narrative and proof-bank inside the existing profile domain
2. retain reusable candidate answer defaults for common screeners and profile-grounded short intros
3. retain richer saved-job metadata that later discovery, review, and apply flows can reuse directly
4. retain per-attempt structured question, answer, blocker, consent, and replay data instead of only coarse status text
5. surface the new data in `Profile`, job detail or review surfaces, `Resume Workspace`, and `Applications` without overwhelming the main UI

## Recommended Root-Reuse Strategy

### 1. Candidate shared memory should extend `CandidateProfile`

Use `packages/contracts/src/profile.ts` as the main home for shared candidate memory.

Required additions or formalization:

- longer career or exit story beyond the current short summary fields
- differentiators or superpowers that can be reused in summaries and answers
- proof-bank entries with concise claim text, hero metrics, supporting context, and role-family relevance tags
- preferred case-study or demo references linked back to existing profile links or projects when possible
- reusable answer defaults for common screener prompts such as work authorization, sponsorship, relocation, travel, notice period, availability, salary expectations, short self-introduction, and concise career-transition explanations like why the candidate left or is leaving a role
- application-facing identity defaults such as preferred application email or preferred public links, but never secrets

Implementation rules:

- prefer new nested profile objects such as `narrative`, `proofBank`, or `answerBank` under `CandidateProfile` over a new top-level profile-adjacent store
- extend `professionalSummary` and `workEligibility` where the field clearly belongs there; only add a new nested profile object when the existing object would become misleading or overloaded
- link proof entries back to existing project or link IDs when possible instead of duplicating URLs or case-study labels everywhere

### 2. Shared job context should extend `JobPosting` and `SavedJob`

Use `packages/contracts/src/discovery.ts` as the first home for richer job and employer context.

Required additions or formalization:

- `applicationUrl` distinct from `canonicalUrl` when the job-detail page and the actual application route differ
- `firstSeenAt`, `lastSeenAt`, and `lastVerifiedActiveAt`
- best-effort normalized compensation fields in addition to existing `salaryText`
- ATS or provider classification when grounded
- sponsorship, clearance, relocation, travel, and remote-geography hints when grounded
- keyword signals or weighted keyword groups for resume and apply targeting
- lightweight employer metadata only where it clearly helps later reuse

Implementation rules:

- keep the first version job-attached; do not create a separate employer table just because some metadata looks reusable
- `013` may later formalize a broader seen-job ledger, but `011` should still add the fields the existing saved-job root can own cleanly now
- preserve the raw source-facing text when normalization is uncertain; normalized fields should be nullable and additive, not destructive replacements

### 3. Shared apply memory should extend `ApplicationAttempt` first

Use `packages/contracts/src/discovery.ts` as the first home for structured per-application memory.

Required additions or formalization:

- detected question records
- field classifications and requirement markers
- candidate-grounded answer candidates
- final submitted answer text or selected value when known
- answer provenance refs back to profile, proof-bank, resume sources, prior approved answers, or current job context
- blocker reason codes and typed blocker snapshots
- consent requests and user decisions
- replay checkpoints and relevant URLs

Implementation rules:

- keep the detailed artifacts on `ApplicationAttempt`
- keep `ApplicationRecord` as the summary layer with only the latest blocker, counts, or next-action cues needed by list and detail surfaces
- do not create a separate `application_questions` or `application_blockers` table in the first pass unless repository size, query shape, or renderer performance proves the need

### 4. Evidence and replay should link to existing source-debug artifacts

Source-debug already owns durable evidence refs and learned artifacts.

Required integration direction:

- allow application attempts to link to `SourceDebugEvidenceRef` IDs when screenshots, URLs, or notes already exist there
- allow application attempts to link to the active `SourceInstructionArtifact` when it informed the attempt
- add a small shared provenance or reference union only if the current resume-specific and source-debug-specific refs cannot express answer grounding cleanly

Implementation rules:

- do not force a full evidence-model unification in `011`
- do not create a second screenshot or replay-storage system for apply when linking to existing evidence is sufficient

## Required Contract Expansion By Package

### `packages/contracts`

Expected changes:

- extend `CandidateProfileSchema` with richer narrative, proof-bank, and answer-bank subdomains
- extend `JobPostingSchema` and `SavedJobSchema` with richer job-context fields
- extend `ApplicationAttemptCheckpointSchema` or add adjacent typed checkpoint substructures when coarse checkpoints are no longer enough
- extend `ApplicationAttemptSchema` with structured question, answer, blocker, consent, and replay state
- extend `ApplicationRecordSchema` only with the summary-level fields needed by `Applications` and review surfaces
- extend `JobFinderWorkspaceSnapshotSchema` and `JobFinderResumeWorkspaceSchema` with the summaries needed to expose the new data in the renderer without flooding list views with heavy artifacts
- add enums or discriminated unions in shared base contracts only where multiple packages need the same vocabulary, such as blocker reason codes or question classifications

### `packages/db`

Expected changes:

- keep persistence behind the existing repository interface
- prefer JSON-shape expansion inside `profile`, `saved_jobs`, `application_attempts`, and `application_records`
- add a migration only when the slice truly needs a new table, indexed column, or query-specific storage improvement
- document any new table as an exception to the default root-reuse rule

### `packages/job-finder`

Expected changes:

- map the richer profile data into resume generation and later answer grounding
- preserve richer job metadata during discovery merge and saved-job updates
- widen apply orchestration so runtime outputs can persist structured attempt data instead of only summary strings and checkpoints
- reuse source-debug evidence and instruction links where helpful instead of copying the same artifact data into multiple places

### `apps/desktop`

Expected changes:

- add interim editing and inspection surfaces for the new profile domains inside the current `Profile` screen rather than waiting entirely for `012`
- expose richer job metadata in discovery detail or review surfaces where it helps triage
- expose proof-bank and narrative inputs where `Resume Workspace` benefits from them
- expose blocker, question, and replay summaries in `Applications` without dumping raw artifacts into the main list layout

## Persistence Strategy

The default implementation path should be conservative.

### First choice: JSON-shape expansion inside current roots

Prefer storing the new data inside the existing persisted roots:

- `profile`
- `saved_jobs`
- `application_attempts`
- `application_records`
- existing source-debug artifact collections

This path keeps the repository interface stable and may not require a new SQLite migration when only the validated JSON shape changes.

### Only add new tables when one of these becomes true

- query patterns become too expensive without indexed sub-collections
- attempt payload size becomes large enough to hurt routine snapshot or application-detail reads
- the same domain clearly needs an independent lifecycle from its current parent root

If a new table becomes necessary, the implementing agent must document:

- why the current parent root was insufficient
- why the new collection boundary is durable rather than temporary convenience
- which workflows need indexed access to it

## Renderer Surfacing Strategy

Do not leave the new data as a hidden backend-only expansion.

### `Profile`

Add compact editing or review sections for:

- narrative
- proof-bank
- reusable answer defaults
- application-facing identity defaults

Implementation rule:

- keep these sections inspectable but secondary so the current focused profile flow does not collapse into one giant wall of fields

### Discovery And Review Surfaces

Expose richer saved-job context where it improves triage, such as:

- application URL versus detail URL
- compensation normalization when present
- remote or travel or relocation hints
- ATS or provider labels when grounded
- keyword or role-family cues

### `Resume Workspace`

Teach resume generation and editing surfaces to consume:

- narrative framing
- proof-bank entries
- preferred case studies or demos
- role-family relevance tags

### `Applications`

Expose summary-level apply memory such as:

- detected question counts
- latest blocker code and short summary
- consent or replay status
- next action grounded in retained structured attempt data

## Workflow Consumption Map

This plan should leave behind a concrete field-to-consumer map. The expected first map is:

### Discovery consumers

- role-family and targeting cues from profile and search preferences
- company and geography preferences
- compensation thresholds
- ATS or provider hints when present
- first seen and last seen timestamps
- richer job metadata for review and later filtering

### Resume consumers

- narrative framing for summaries and headlines
- proof-bank entries for bullet promotion and section emphasis
- preferred case studies, links, and role-family relevance tags
- job keyword signals for grounded emphasis

### Apply consumers

- canonical answer defaults from the profile
- prior question and answer memory from earlier attempts
- answer provenance back to candidate-owned sources
- blocker reason codes and snapshots
- consent decisions and replay checkpoints

### Later consumers

- interview prep may later reuse proof-bank and question history, but `011` does not need to ship interview features to be complete

Implementation rule:

- if a new field cannot be placed in at least one of the consumer groups above, it likely does not belong in the first implementation slice

## Workstreams

### 1. Domain Audit And Consumer Map

- confirm which missing fields belong on `CandidateProfile`, `SavedJob`, `ApplicationAttempt`, or existing source-debug artifacts
- reject fields that still have no concrete consumer
- capture the field-to-consumer map before large UI or persistence work starts

### 2. Candidate Profile Expansion

- add narrative, proof-bank, and answer-bank contracts
- persist them through the existing profile save flow
- expose them in the current `Profile` UI in a compact, reviewable way

### 3. Saved Job Enrichment Expansion

- add richer job and employer fields to the saved-job domain
- preserve them during discovery persistence and merge logic
- surface the useful summaries in discovery and review detail panels

### 4. Application Attempt Memory Expansion

- widen application attempt contracts and persistence
- update apply orchestration to record structured question, answer, blocker, consent, and replay data
- keep `ApplicationRecord` limited to the summaries the renderer actually needs

### 5. Evidence And Provenance Integration

- link application attempts to source-debug evidence and instruction artifacts where appropriate
- add only the minimal new shared reference shape needed for answer grounding

### 6. Workflow Consumption And QA

- make resume, discovery, and apply read the new data
- update snapshot shaping so renderer surfaces get lightweight summaries
- update docs and seeded demo paths so later agents can verify the slice end-to-end

## Milestones

### Milestone 1: Contract-first shared roots

- the repo has a clear field-to-root and field-to-consumer map
- `CandidateProfile`, `SavedJob`, and `ApplicationAttempt` can store the planned shared domains

### Milestone 2: Candidate and job shared memory live

- profile stores narrative, proof-bank, and reusable answer defaults
- saved jobs retain richer job and employer context
- `Profile` and job detail or review surfaces can show the new data

### Milestone 3: Apply memory live

- application attempts retain structured questions, answers, blockers, consent, and replay state
- `Applications` can show summary-level recovery and next-action cues from those fields

### Milestone 4: Real workflow consumption

- resume and apply flows consume the new shared data directly
- discovery and review surfaces reuse the richer saved-job context
- docs explain which fields power which workflow behaviors

## Verification Expectations

Implementation work for this plan should be validated with at least:

- `pnpm --filter @unemployed/contracts test`
- `pnpm --filter @unemployed/db test`
- `pnpm --filter @unemployed/job-finder test`
- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop ui:profile-baseline`
- `pnpm --filter @unemployed/desktop ui:resume-workspace`
- `pnpm docs:check`

Additional completion rules:

- leave behind the field-to-consumer map in the updated plan or implementation notes
- document any new table or top-level store as an explicit exception, not an implicit drift
- leave behind a seeded demo or screenshot path proving that the new profile data is editable, saved-job enrichment is visible, and application detail can show structured blocker or question memory

## Implementation Notes (2026-04-09)

Delivered without introducing a new top-level store or SQLite table. The completed slice extends the existing durable roots and keeps source-debug evidence linked by reference instead of copied into a second artifact system.

### Final field-to-consumer map

- `CandidateProfile.narrative` -> consumed by `Profile` editing, resume evidence gathering, resume workspace shared-profile summaries, and resume staleness checks
- `CandidateProfile.proofBank` -> consumed by `Profile` editing, resume evidence gathering, resume workspace shared-profile summaries, and future apply answer provenance hooks
- `CandidateProfile.answerBank` -> consumed by `Profile` editing, deterministic apply question suggestions, and guided follow-on collection work in `012`
- `CandidateProfile.applicationIdentity` -> consumed by `Profile` editing, deterministic apply link/contact defaults, and resume workspace shared-profile summaries
- `SavedJob.applicationUrl`, freshness timestamps, normalized compensation, screening hints, `atsProvider`, and `keywordSignals` -> consumed by discovery merge and persistence, discovery detail UI, resume workspace job-context UI, resume evidence gathering, and resume/job staleness checks
- `ApplicationAttempt.questions`, `blocker`, `consentDecisions`, and `replay` -> consumed by apply persistence, `Applications` detail UI, and application-record rollups
- `ApplicationRecord.questionSummary`, `latestBlocker`, `consentSummary`, and `replaySummary` -> consumed by renderer-friendly `Applications` detail summaries without flattening the full attempt artifact into the list layer
- `ApplicationAttempt.replay.sourceInstructionArtifactId` plus `sourceDebugEvidenceRefIds` -> consumed by apply-memory persistence so attempts can point back to the source-debug instruction and evidence lineage that informed the run

### Evidence paths used during completion

- Profile baseline fixture: `apps/desktop/test-fixtures/job-finder/profile-baseline-workspace.json`
- Profile UI capture command: `pnpm --filter @unemployed/desktop ui:profile-baseline`
- Resume workspace demo command: `pnpm --filter @unemployed/desktop ui:resume-workspace`

## Open Questions To Defer Unless They Block Delivery

- whether employer metadata ever needs its own first-class entity instead of staying job-attached
- whether reusable answers need per-entry confirmation policy fields in `011` or can defer that nuance to `015`
- whether answer provenance needs a new cross-workflow reference union immediately or whether linking to existing profile, proof-bank, resume, and source-debug IDs is sufficient for the first slice
