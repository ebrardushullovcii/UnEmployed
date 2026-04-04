# 007 Job Finder Resume Workspace

Status: active

## Goal

Deliver a dedicated `Resume Workspace` for a selected job where the app can generate, inspect, edit, validate, export, approve, and reuse a grounded job-specific resume before the apply flow uploads it.

## Delivery Standard For Implementing Agents

This plan is not complete when the code merely compiles or the happy-path contracts exist.

Required implementation bar:

- finish the feature to a product-demo standard, not a placeholder or scaffolding standard
- add any missing internal tooling or scripted harnesses needed to trigger generation, editing, chat-assisted changes, export, approval, and apply validation end-to-end
- verify the desktop UI by actually interacting with it and capturing screenshots of the important states instead of relying only on typecheck or build success
- keep durable instructions, QA workflow, and evidence paths updated in repo docs during the same task so the implementation does not become “chat-only knowledge” after long sessions or compaction

In plain terms: another agent should be able to read this plan, run the documented harness, and watch a full demo of the shipped workspace without having to reconstruct missing steps from chat history.

## Locked Product Decisions

- Grounding starts from the imported base resume plus the structured profile extracted or edited in `Profile`.
- Job context comes from the saved job detail, saved job metadata, and bounded public employer research when it improves the result.
- External research can improve employer language, keyword targeting, domain emphasis, and section prioritization, but it must never create candidate facts.
- `PDF` is the first required export artifact. `HTML` stays as the intermediate render and debug layer. `DOCX` stays future-ready but is not required in the first implementation.
- The default target length is `2 pages`.
- The workspace should warn when the result exceeds `2 pages`.
- `3 pages` is the near-hard cap and should require explicit user action or a strong validator override rather than happening silently.
- Resume generation stays manual per selected job.
- The `Review Queue` stays the entry point, but resume editing moves into a dedicated `Resume Workspace` route instead of a small inline panel.
- Manual user edits and pinned content win over regenerate until the user explicitly unlocks them.
- The first version prioritizes structured editing plus live preview over a full WYSIWYG HTML editor.
- Lightweight revision history is in scope for undo and recovery, but a heavy version-management UI is not required in v1.
- Staleness should warn clearly and require a fresh review before apply, not silently block all editing.

## Why This Work Exists

The current tailored-resume path proves the first end-to-end slice, but it is still intentionally narrow:

- `packages/ai-providers/src/index.ts` exposes a flat `TailoredResumeDraft`.
- `packages/job-finder/src/index.ts` turns that draft straight into a ready `TailoredAsset` inside `generateResume(jobId)`.
- `apps/desktop/src/main/adapters/job-finder-document-manager.ts` renders three fixed templates and writes `html` only.
- `apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/review-queue-mission-panel.tsx` already shows disabled `Edit asset` and `View source` controls that point toward the next missing surface.

That implementation is enough for a proof of value, but it is not yet the product the user actually needs:

- structured editable drafts instead of one-shot text
- job-aware and employer-aware grounding instead of resume-text-only emphasis
- AI side-chat edits with predictable patch behavior
- provenance and validation before trust-sensitive edits
- uploadable `PDF` artifacts instead of only saved `html`
- a dedicated workspace instead of a preview card

## Product Outcome

The finished slice should feel like a real job-specific resume builder inside `Job Finder`:

1. The user selects a saved job and opens its `Resume Workspace`.
2. The app gathers evidence from the imported resume, structured profile, saved job data, and bounded public employer research.
3. The app generates a structured resume draft, not just a final blob of text.
4. The user edits bullets, sections, ordering, and inclusion directly.
5. The user can ask the side assistant to rewrite, shorten, expand, reorder, explain, or tailor specific parts.
6. The app shows validation warnings, evidence, and the rendered preview while edits happen.
7. The app exports an approved `PDF` that the apply flow can upload later.
8. The `Review Queue` still owns the final apply approval, but the resume itself is approved in its dedicated workspace.

## Scope

### In Scope

- dedicated `Resume Workspace` route and desktop screen for a selected job
- structured draft model for resume sections, bullets, and provenance
- grounded generation from base resume, structured profile, saved job data, and bounded public employer research
- manual editing for text, bullets, ordering, visibility, and pin or lock state
- AI side chat that produces typed resume edit operations instead of silent full rewrites
- live preview through the existing template pipeline expanded beyond the current fixed preview sections
- `PDF` export plus persisted artifact metadata and approval state
- staleness warnings when important upstream facts change after approval
- apply integration that prefers the latest approved tailored `PDF`
- deterministic and offline-safe fallback behavior when live AI or research is unavailable
- deterministic test coverage for contracts, storage, orchestration, validation, and export behavior

### Out Of Scope

- cover letters as part of the same slice
- generic long-form screener answer generation
- a marketplace of user-authored templates
- unrestricted website crawling or broad web search across arbitrary domains
- collaborative editing or cloud sync
- a full WYSIWYG layout editor
- multiple simultaneously active resume variants per job in v1
- automatic resume generation for every discovered job

## Workflow Shape

### Core User Flow

1. The user queues or opens a job from `Review Queue`.
2. The app opens a dedicated `Resume Workspace` for that job.
3. The workspace gathers candidate facts from:
   - base resume text
   - structured profile sections
   - saved job details and description
   - bounded public employer research when available
4. The app builds a structured draft with section-level evidence.
5. The validator flags unsupported claims, missing data, weak bullets, and page-length issues.
6. The user edits the draft directly or asks the side assistant to make targeted changes.
7. The app renders the chosen template into `html`, exports `pdf`, and records page-count metadata.
8. The user approves the resume for this job.
9. The apply flow uploads the approved `pdf` instead of the base resume.

### Resume Approval Versus Apply Approval

The current code path still has one `approveApply(jobId)` action that immediately runs the supported apply flow.

The new workflow must split that into two distinct approvals:

1. `resume approval`
   - owned by the `Resume Workspace`
   - means the current draft and exported artifact are acceptable for submission use
   - should mark the selected export artifact as the current approved resume for that job
2. `apply approval`
   - still owned by `Review Queue`
   - means the user is ready to run the supported apply flow now

Implementation rule:

- do not keep overloading `approveApply(jobId)` with implicit resume approval
- add a distinct workspace approval action before changing the apply runtime behavior
- once the split lands, `approveApply(jobId)` should refuse to run unless the job has a currently approved and not-stale resume export

Migration-safe sequence for implementation:

1. add workspace approval state and export selection first
2. update review-summary data so `Review Queue` can see resume approval separately from asset readiness
3. only then tighten `approveApply(jobId)` and runtime validation to require the approved export

### Ownership Split

- `Review Queue`: entry point, final apply approval, overview state
- `Resume Workspace`: draft creation, editing, validation, preview, export, resume approval
- `Applications` and apply runtime: consume the approved tailored artifact for later submission paths

### Route And Shell Recommendation

The current desktop router and shell already assume top-level `Profile`, `Discovery`, `Review Queue`, `Applications`, and `Settings` screens.

To minimize churn while still landing a dedicated workspace, the recommended first route shape is:

- add a hidden child route under `Review Queue`, such as `/job-finder/review-queue/:jobId/resume`
- keep the main nav highlighted on `Review Queue` while the workspace is open
- treat the workspace as a dedicated full-screen sub-surface rather than a new top-level nav tab in the first iteration

Implementation rules for the first workspace route:

- while the workspace route is open, `:jobId` in the URL is the source of truth for the selected review job
- opening the workspace from `Review Queue` should set the selected review job and navigate in one action
- direct deep-link loads should resolve the job from persisted workspace state instead of assuming a previously selected panel row
- invalid or missing `jobId` should redirect back to `/job-finder/review-queue` with a clear non-blocking error state
- shell navigation should treat any pathname that starts with `/job-finder/review-queue` as inside the `Review Queue` context

This fits the current router and shell structure better than inventing a brand-new primary nav section immediately.

## Grounding Model

### Candidate Facts

Candidate facts must come only from user-owned sources:

- imported base resume text
- structured profile fields and records already stored in the workspace
- user edits made directly in the `Resume Workspace`

These candidate facts can be summarized, reordered, shortened, or reframed, but they cannot be invented.

### Job And Employer Context

Job and employer context can come from:

- saved job title, company, location, and summary
- saved job description or detail page content
- public employer pages fetched in a bounded way

This context is allowed to influence:

- which candidate evidence is emphasized
- which keywords deserve space in the document
- how the summary is framed for the employer
- which projects, skills, or achievements should be promoted or hidden

This context is not allowed to influence:

- candidate dates
- candidate titles
- candidate employers
- candidate metrics
- certifications or credentials the user never provided
- claims about tools, domains, or scope that are unsupported by user-owned data

## External Research Policy

Research is explicitly in scope because the user wants the best possible job-specific resume, but it must stay bounded and inspectable.

### Allowed Research Targets

- the saved job detail page
- the company home page
- `About`, `Mission`, `Product`, `Solutions`, `Engineering`, `Careers`, or equivalent public pages on the same company or product domain
- public pages directly linked from the job page or company site when they clarify role scope or employer language

### Research Limits

- stay on public pages only
- stay bounded to the target employer and directly relevant product domains
- prefer a small page budget such as `3-5` useful pages instead of generic crawling
- use explicit request timeouts and byte caps
- record the pages used so the user can inspect what influenced the draft
- if research fails, continue with saved job data rather than failing the whole workspace

### Research Output

Research should produce structured artifacts such as:

- company mission or positioning notes
- product or domain vocabulary
- priority themes repeated across public pages
- likely responsibilities or stakeholder language that sharpen the resume summary

Research artifacts should be visible to the user and available to the side assistant, but they must be separate from candidate facts.

## Resume Draft Domain

The editable source of truth should become a real resume-draft domain instead of overloading `TailoredAsset`.

### Source Of Truth

Use a new structured `ResumeDraft` as the editable source of truth.

`TailoredAsset` should remain the published and export-oriented artifact layer that other flows already depend on.

### Recommended Contract Shapes

Add new contracts before widening behavior. The field definitions below are the expected starting shapes. Exact names can change if a tighter fit emerges during implementation, but the implementing agent should not have to invent these from scratch.

#### `ResumeDraftStatus`

```ts
z.enum(["draft", "needs_review", "approved", "stale"])
```

#### `ResumeDraftSectionKind`

```ts
z.enum([
  "header",
  "summary",
  "skills",
  "experience",
  "projects",
  "education",
  "certifications",
  "keywords",
])
```

#### `ResumeDraftSourceRef`

```ts
z.object({
  id: NonEmptyStringSchema,
  sourceKind: z.enum(["resume", "profile", "job", "research", "user"]),
  sourceId: NonEmptyStringSchema.nullable().default(null),
  snippet: NonEmptyStringSchema.nullable().default(null),
})
```

#### `ResumeDraftBullet`

```ts
z.object({
  id: NonEmptyStringSchema,
  text: NonEmptyStringSchema,
  origin: z.enum(["imported", "ai_generated", "user_edited", "assistant_edited", "deterministic_fallback"]),
  locked: z.boolean().default(false),
  included: z.boolean().default(true),
  sourceRefs: z.array(ResumeDraftSourceRefSchema).default([]),
  updatedAt: IsoDateTimeSchema,
})
```

#### `ResumeDraftSection`

```ts
z.object({
  id: NonEmptyStringSchema,
  kind: ResumeDraftSectionKindSchema,
  label: NonEmptyStringSchema,
  text: NonEmptyStringSchema.nullable().default(null),
  bullets: z.array(ResumeDraftBulletSchema).default([]),
  origin: z.enum(["imported", "ai_generated", "user_edited", "assistant_edited", "deterministic_fallback"]),
  locked: z.boolean().default(false),
  included: z.boolean().default(true),
  sortOrder: z.number().int().min(0),
  profileRecordId: NonEmptyStringSchema.nullable().default(null),
  sourceRefs: z.array(ResumeDraftSourceRefSchema).default([]),
  updatedAt: IsoDateTimeSchema,
})
```

#### `ResumeDraft`

```ts
z.object({
  id: NonEmptyStringSchema,
  jobId: NonEmptyStringSchema,
  status: ResumeDraftStatusSchema,
  templateId: ResumeTemplateIdSchema,
  sections: z.array(ResumeDraftSectionSchema).default([]),
  targetPageCount: z.number().int().min(1).max(3).default(2),
  generationMethod: z.enum(["ai", "deterministic", "manual"]).nullable().default(null),
  approvedAt: IsoDateTimeSchema.nullable().default(null),
  approvedExportId: NonEmptyStringSchema.nullable().default(null),
  staleReason: NonEmptyStringSchema.nullable().default(null),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
})
```

#### `ResumeDraftPatch`

```ts
z.object({
  id: NonEmptyStringSchema,
  draftId: NonEmptyStringSchema,
  operation: z.enum([
    "replace_section_text",
    "insert_bullet",
    "update_bullet",
    "remove_bullet",
    "move_bullet",
    "toggle_include",
    "set_lock",
    "replace_section_bullets",
  ]),
  targetSectionId: NonEmptyStringSchema,
  targetBulletId: NonEmptyStringSchema.nullable().default(null),
  anchorBulletId: NonEmptyStringSchema.nullable().default(null),
  position: z.enum(["before", "after"]).nullable().default(null),
  newText: NonEmptyStringSchema.nullable().default(null),
  newIncluded: z.boolean().nullable().default(null),
  newLocked: z.boolean().nullable().default(null),
  newBullets: z.array(ResumeDraftBulletSchema).nullable().default(null),
  appliedAt: IsoDateTimeSchema,
  origin: z.enum(["user", "assistant"]),
  conflictReason: NonEmptyStringSchema.nullable().default(null),
})
```

#### `ResumeDraftRevision`

```ts
z.object({
  id: NonEmptyStringSchema,
  draftId: NonEmptyStringSchema,
  snapshotSections: z.array(ResumeDraftSectionSchema),
  createdAt: IsoDateTimeSchema,
  reason: NonEmptyStringSchema.nullable().default(null),
})
```

#### `ResumeValidationIssue`

```ts
z.object({
  id: NonEmptyStringSchema,
  severity: z.enum(["error", "warning", "info"]),
  category: z.enum([
    "unsupported_claim",
    "invented_metric",
    "duplicate_bullet",
    "vague_filler",
    "poor_keyword_coverage",
    "empty_section",
    "page_overflow",
    "low_confidence_fact",
    "stale_approval",
  ]),
  sectionId: NonEmptyStringSchema.nullable().default(null),
  bulletId: NonEmptyStringSchema.nullable().default(null),
  message: NonEmptyStringSchema,
})
```

#### `ResumeValidationResult`

```ts
z.object({
  draftId: NonEmptyStringSchema,
  issues: z.array(ResumeValidationIssueSchema).default([]),
  pageCount: z.number().int().min(0).nullable().default(null),
  validatedAt: IsoDateTimeSchema,
})
```

#### `ResumeResearchArtifact`

```ts
z.object({
  id: NonEmptyStringSchema,
  jobId: NonEmptyStringSchema,
  sourceUrl: NonEmptyStringSchema,
  pageTitle: NonEmptyStringSchema.nullable().default(null),
  fetchedAt: IsoDateTimeSchema,
  extractedText: NonEmptyStringSchema.nullable().default(null),
  companyNotes: NonEmptyStringSchema.nullable().default(null),
  domainVocabulary: z.array(NonEmptyStringSchema).default([]),
  priorityThemes: z.array(NonEmptyStringSchema).default([]),
  fetchStatus: z.enum(["success", "failed", "skipped"]),
})
```

#### `ResumeExportArtifact`

```ts
z.object({
  id: NonEmptyStringSchema,
  draftId: NonEmptyStringSchema,
  jobId: NonEmptyStringSchema,
  format: z.enum(["html", "pdf"]),
  filePath: NonEmptyStringSchema,
  pageCount: z.number().int().min(1).nullable().default(null),
  templateId: ResumeTemplateIdSchema,
  exportedAt: IsoDateTimeSchema,
  isApproved: z.boolean().default(false),
})
```

#### `ResumeAssistantMessage`

```ts
z.object({
  id: NonEmptyStringSchema,
  jobId: NonEmptyStringSchema,
  role: z.enum(["user", "assistant"]),
  content: NonEmptyStringSchema,
  patches: z.array(ResumeDraftPatchSchema).default([]),
  createdAt: IsoDateTimeSchema,
})
```

#### Review Queue Bridge Fields

Add a single discriminated `resumeReview` field to `ReviewQueueItemSchema` so review-only state cannot drift into impossible combinations:

```ts
resumeReview: z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_started") }),
  z.object({ status: z.literal("draft") }),
  z.object({ status: z.literal("needs_review") }),
  z.object({
    status: z.literal("stale"),
    staleReason: NonEmptyStringSchema.nullable().default(null),
  }),
  z.object({
    status: z.literal("approved"),
    approvedAt: IsoDateTimeSchema,
    approvedExportId: NonEmptyStringSchema,
    approvedFormat: z.enum(["html", "pdf"]),
  }),
])
```

#### Repository State Extension

Add these collections to `JobFinderRepositoryStateSchema`:

```ts
resumeDrafts: z.array(ResumeDraftSchema).default([]),
resumeDraftRevisions: z.array(ResumeDraftRevisionSchema).default([]),
resumeExportArtifacts: z.array(ResumeExportArtifactSchema).default([]),
resumeResearchArtifacts: z.array(ResumeResearchArtifactSchema).default([]),
resumeValidationResults: z.array(ResumeValidationResultSchema).default([]),
resumeAssistantMessages: z.array(ResumeAssistantMessageSchema).default([]),
```

#### Workspace Snapshot Extension

Add lightweight summaries or ID references to `JobFinderWorkspaceSnapshotSchema` for renderer consumption:

```ts
resumeDrafts: z.array(ResumeDraftSummarySchema).default([]),
resumeExportArtifacts: z.array(ResumeExportArtifactSummarySchema).default([]),
resumeResearchArtifacts: z.array(ResumeResearchArtifactSummarySchema).default([]),
```

Use lightweight summaries here rather than full draft or artifact payloads. The snapshot should carry only the fields the renderer needs for list and header state, such as ids, short labels, status, updated timestamps, selected template or format metadata, and approval or staleness flags. Do not include full revision history, full assistant message threads, or full section bodies in the snapshot; fetch those on demand through dedicated IPC actions when the workspace is open.

### Recommended Draft Structure

The draft should stay semantic and template-agnostic. A good first structure is:

- header or identity block
- summary section
- skills section
- experience sections linked back to `CandidateExperience` records when possible
- projects section linked back to `CandidateProject` records when useful
- education and certification sections with include or exclude state
- targeted keywords or employer focus notes stored as metadata rather than always rendered verbatim

Each editable item should be able to track:

- `origin`: imported, ai_generated, user_edited, assistant_edited, deterministic_fallback
- `locked` or `pinned` state
- source references back to profile, resume, job, or research artifacts
- last-edited timestamps
- include or exclude state

## Persistence And Repository Plan

Resume workspace state should live behind repository boundaries in `packages/db`, not in renderer-only state.

### Recommended Stored Domains

- resume drafts
- lightweight draft revisions for undo and recovery
- export artifacts such as `html` and `pdf`
- research artifacts and source page metadata
- validation results
- assistant messages and patch outcomes

### Storage Guidance

- prefer dedicated repository collections or tables over packing all detail into the existing `tailoredAssets` array
- keep the workspace snapshot lightweight for renderer consumption
- keep the latest approved export artifact easy to resolve from the apply path
- preserve enough revision history for undo and recovery without building a large history browser in v1
- keep file artifacts on disk under the existing generated-resume path ownership in the desktop main process

### SQLite Query Strategy

The current file-backed repository stores JSON blobs by `id`, which is still acceptable for this slice, but the new resume-workspace tables must not rely on `id` alone for lookups.

Required rule:

- keep the `value` JSON blob pattern for full payload storage
- add dedicated query columns when the flow needs lookup or ordering by non-id fields, such as `job_id`, `draft_id`, `created_at`, `updated_at`, `exported_at`, `validated_at`, and `fetched_at`
- add indexes for `job_id` and `draft_id` on tables that support those lookups
- mirror the same filtering and sorting semantics in the in-memory repository so tests and desktop behavior stay aligned
- do not rely on `ORDER BY id` for histories or latest-per-job resolution

### Required Ordering Rules

- resume drafts: resolve by `job_id`; if multiple rows exist, treat the latest `updated_at` row as current
- draft revisions: newest first by `created_at`
- export artifacts: newest first by `exported_at`
- research artifacts: newest first by `fetched_at`
- validation results: newest first by `validated_at`
- assistant messages: chronological order by `created_at`

### Tailored Asset Compatibility

Keep the current `TailoredAsset` domain as the compatibility layer for review and apply flows during the transition.

Expected direction:

- `ResumeDraft` owns editable content and provenance
- `ResumeExportArtifact` owns rendered file metadata
- `TailoredAsset` becomes the summary or bridge object that points at the current approved export and keeps existing review surfaces working while the workspace lands

The transition should remain additive first. Do not remove `TailoredAsset` or break current review/apply surfaces until the new review-summary data is already flowing end-to-end.

Legacy handoff rule:

- if a job already has a legacy `TailoredAsset` but no `ResumeDraft`, first workspace load should seed a best-effort initial draft from the asset's `previewSections`, `contentText`, and template metadata
- if a legacy HTML artifact exists, keep it as historical context only; do not silently mark it as the approved v1 export artifact

### State Model And Compatibility Rules

The current contracts still use the coarse `AssetStatus` enum of:

- `not_started`
- `queued`
- `generating`
- `ready`
- `failed`

Do not overload `AssetStatus` with richer workspace concepts such as draft review, approval, or staleness.

Recommended direction:

- keep `AssetStatus` as the coarse generation and export pipeline state used by legacy review summaries
- add a separate `ResumeDraftStatus` for workspace-owned editing states such as `draft`, `needs_review`, `approved`, and `stale`
- add explicit approval or stale fields to review-summary payloads instead of trying to encode those concepts into the existing `AssetStatus`

Recommended first bridge shape on the review-facing summary surface:

- `resumeReview.status`
- `resumeReview.staleReason`
- `resumeReview.approvedAt`
- `resumeReview.approvedExportId`
- `resumeReview.approvedFormat`

The exact field names can change, but the bridge object must keep these concepts explicit so another agent does not have to infer them from `assetStatus` alone.

This keeps backward-compatible review surfaces simple while letting the workspace own richer state.

## AI And Orchestration Plan

Keep provider interfaces narrow. The product logic still belongs in `packages/job-finder`.

### Recommended AI Surface

The provider seam should evolve from one broad `tailorResume()` method toward narrower structured methods such as:

- `createResumeDraft`
- `reviseResumeDraft`
- `explainResumeDraft`
- `summarizeResearchPage`
- `suggestMissingResumeInputs`

These names are directional; exact naming can change if a slightly tighter seam works better.

### Orchestration Responsibilities

`packages/job-finder` should own:

- evidence gathering and retrieval
- prompt packet construction
- lock and pin rules
- patch application rules
- validation
- export orchestration
- stale-state decisions
- approval integration with review and apply flows

### Research Adapter Boundary

`packages/job-finder` should orchestrate employer research, but it should not own raw network-fetch details directly.

Recommended seam:

- introduce an injected research client or research adapter for bounded public-page fetches
- let the desktop main process or another IO-owning adapter perform the actual fetches
- keep page fetch and raw HTML acquisition in the adapter boundary
- keep page cleanup, text extraction, chunking, and retrieval preparation in `packages/knowledge-base`
- return typed research artifacts back into `packages/job-finder`

This keeps package boundaries aligned with the current architecture rule that module logic should not quietly absorb ad hoc external IO.

### Fallback Rules

The feature must remain usable when live AI is unavailable:

- the workspace should still open
- manual editing should still work
- deterministic fallback should still produce a coarse starting draft when possible
- external research can be skipped without breaking the flow
- if side-assistant AI is unavailable, the assistant surface should return a clear unavailable state without blocking manual editing

## Knowledge Base And Retrieval Plan

`packages/knowledge-base` is the right home for shared ingestion, chunking, and retrieval.

The package is currently only a stub, so this feature is a good place to land the first real shared retrieval behavior.

### First Retrieval Strategy

Do not jump straight to embeddings or provider-bound vector infra.

The first implementation should favor deterministic local lexical retrieval because it fits the repo better right now:

- it is local-first
- it is deterministic for tests
- it does not bind the package to one provider
- it is sufficient for resume and job-section evidence retrieval in v1

### Recommended Package

Use `minisearch` for the first local search index inside `packages/knowledge-base`.

Use it to index chunks from:

- base resume text
- structured profile records flattened into retrievable text
- saved job detail text
- research page text

Retrieval should be section-aware. For example:

- summary generation retrieves job priorities plus strongest matching candidate highlights
- skill selection retrieves relevant profile skill groups plus job keywords
- experience bullet selection retrieves the most relevant experience and project evidence for the target job

### Initial Package Additions

Expected first package additions by workspace:

- `packages/knowledge-base`: `minisearch`, `@mozilla/readability`, `jsdom`
- `apps/desktop` or renderer-side diff presentation layer: `diff`
- `apps/desktop` only if richer drag and drop becomes necessary: `@dnd-kit/core`

Do not add embedding or vector packages in the first pass unless lexical retrieval proves clearly insufficient.

## Desktop UX Plan

### Entry Points

- `Review Queue`: enable `Edit asset` and open the dedicated workspace for the selected reviewable job
- selected job detail surfaces can later add a direct `Open Resume Workspace` action
- while the workspace route is open, `Review Queue` remains the active navigation context in the shell

The first version should treat any saved job in a reviewable status such as `drafting`, `ready_for_review`, or `approved` as eligible to open the workspace. It should not be limited only to jobs already selected in the current panel state.

### Workspace Layout

The first version should be desktop-first and structured, not a document canvas editor.

Recommended layout:

- top bar: job, company, draft state, template selector, export action, resume approval actions
- left rail: section outline, validation summary, page-budget warnings, research-source count
- main editor: structured fields, bullets, include or exclude toggles, reorder actions, pin or lock controls
- right rail: rendered preview and assistant panel, either stacked or tabbed to preserve space

### Interaction And Loading Model

The workspace introduces more concurrent actions than the current page-level busy banner can represent clearly.

Required first-pass behavior:

- keep mutation state local to the workspace for generate, save, regenerate, export, approve, and assistant actions
- do not block the entire `Job Finder` shell behind one global busy flag when only one workspace action is running
- default reorder affordances to explicit move-up and move-down controls
- add drag and drop only if those controls prove clearly insufficient during implementation QA

### Editing Capabilities

The user must be able to:

- edit summary text
- add, remove, and reorder bullets
- include or exclude experiences, projects, education, and certifications
- pin or lock content so regenerate does not silently replace it
- inspect why a line exists through source references
- regenerate the whole draft or only a section

### Assistant Behavior

The side assistant should behave like an editing assistant, not a generic chatbot.

Expected intents:

- rewrite this summary for stronger ATS clarity
- shorten these bullets
- make this sound more senior
- emphasize `React` and `Electron`
- remove this claim
- add a bullet from this project
- explain why this section was included
- tell me what is missing for this role

Assistant outputs should resolve into typed resume patch operations.

Small changes can auto-apply with clear revision-backed recovery.

An extra manual preview surface is not required for this slice; correctness, grounded patches, auto-apply behavior, revision-backed recovery, and safe persistence matter more than adding another review surface.

## Template And Export Strategy

### Current Starting Point

Keep the current three template ids as the initial catalog:

- `classic_ats`
- `modern_split`
- `compact_exec`

These already exist in `apps/desktop/src/main/adapters/job-finder-document-manager.ts` and are the right starting point.

### Template Rules

Templates own:

- layout
- print CSS
- section placement rules
- density expectations
- page-budget behavior

The model does not own layout and should never emit raw `html`, `css`, or `pdf` structure.

### Minimum V1 Template Mapping

To avoid over-designing the first renderer rewrite, the minimum v1 mapping should be explicit:

- header: identity and contact
- summary: one summary block
- skills: one grouped skills block
- experience: ordered role sections with bullets
- projects: optional project block when included and when space allows
- education and certifications: compact trailing sections

If a draft carries richer metadata than the selected template can show cleanly, the template should omit that metadata rather than inventing a new visual region automatically.

### Export Path

Use the existing `html` rendering path as the intermediate layer, then add `PDF` export through Electron.

Recommended first export flow:

1. render the chosen template to `html`
2. load that `html` in a hidden or dedicated print window in the main process
3. export the final artifact with `webContents.printToPDF`
4. inspect page-count metadata for warnings and limits
5. persist both the render metadata and the final file path

### Existing Packages To Reuse

- Use Electron `webContents.printToPDF` for the first real export path.
- Reuse the already-installed `pdfjs-dist` dependency to inspect generated PDFs for page-count metadata instead of adding another PDF parser immediately.

### Preview Strategy

The editing preview should stay reliable and easy to implement in v1:

- render a template-aware preview from structured draft data or controlled HTML payloads without introducing a separate renderer-side PDF stack
- keep final PDF generation in the Electron main process only
- do not add a renderer-side PDF viewer or renderer-side PDF parsing dependency in the first pass
- treat the exported PDF page count as the final source of truth for page-budget warnings
- keep scripted desktop QA on deterministic AI even when local live-provider credentials are present, so resume generation and assistant validation stay repeatable across capture runs
- for the dedicated workspace route, put scroll ownership on the left rail, main editor column, and right rail explicitly with `min-h-0`/`min-w-0` guards on ancestor containers so long structured content does not clip behind the shell
- keep the workspace on the shared locked-screen shell when simultaneous left-rail context, central editing, and right-rail preview are useful; the top header should scroll away first, then the left rail, editor column, and right rail should keep independent scroll ownership inside the remaining viewport height

### `resumeFormat` Migration Rule

The shared settings already expose `resumeFormat`, and the current desktop seed already defaults it to `pdf` even though parts of the legacy generation flow and tests still assume `html`.

The first workspace implementation should treat `resumeFormat` as:

- the preferred final export format for approved artifacts
- `pdf` by default for the supported tailored-resume flow
- not a signal that the intermediate render layer stops using `html`

Implementation rule:

- keep rendering through `html` first
- always produce the final approved `pdf` artifact for apply-ready exports in the new workspace flow
- keep `docx` as a settings or contract possibility only if the export pipeline later supports it for real
- update legacy tests that still assume `html` as the final format

### DOCX Later

The app should stay future-ready for `docx`, but that is a later follow-up after the `pdf` path is stable.

When that follow-up starts:

- prefer `docx` first for programmatic document generation
- evaluate `docxtemplater` only if non-developers truly need editable `.docx` template files as the source of layout truth

## Validation And Safeguards

Validation belongs in `packages/job-finder`, not in the provider adapter.

### The Validator Should Catch

- unsupported claims
- invented metrics
- duplicate bullets
- vague filler bullets
- poor keyword coverage for the selected job
- empty or low-value sections
- page-budget overflow
- low-confidence extracted facts that are being overused
- stale approvals after important upstream changes

### Immediate Follow-Up Fixes

The current shipped baseline proves the end-to-end workspace, export, and approval loop, but the next hardening pass should focus on resume composition quality and assistant reliability before widening scope.

#### Resume Structure Fixes

- enforce strict section boundaries so contact data never leaks into experience, skills, or other content blocks
- keep job-target context as tailoring input only; do not let raw job-posting text render inside skills or experience sections
- add a pre-export dedupe pass for repeated bullets, repeated role lines, and repeated section text
- render work experience in a fixed role-first structure: title, company, location, dates, then scoped bullets
- group skills into stable categories instead of one mixed keyword dump
- keep education, languages, and other trailing sections compact and isolated from experience content
- reduce over-aggressive heading tracking or letter spacing in PDF output so exported text parses cleanly and remains ATS-friendly

#### Assistant Editing Fixes

- make assistant replies summarize the concrete change set more clearly instead of falling back to generic unavailable language when a request should be actionable
- tighten the patch planner so assistant edits stay inside the intended section instead of producing broad or confusing changes
- keep optimistic chat feedback, but improve completion messaging so the user can tell whether the assistant rewrote text, declined the request, or hit a patch-application failure
- add focused QA coverage for common assistant-edit requests such as shortening a summary, tightening bullets, and removing duplicated wording

#### Validation Additions

Add explicit validation failures or warnings when:

- contact or identity fields appear in non-header sections
- the same sentence or bullet appears in multiple rendered sections
- the skills block contains job-description prose or full experience lines
- a rendered section contains obvious concatenation artifacts from multiple source records

### Non-Negotiable Safety Rules

- never invent dates, titles, employers, or credentials
- never let public employer research create candidate facts
- never silently overwrite user-edited or pinned content during regenerate
- never let the assistant perform a broad rewrite without either explicit user intent or a visible diff step
- never fall back to the base resume silently when the user expects a tailored approved artifact

## Research And Source Transparency

The current disabled `View source` affordance in `Review Queue` should become real in the workspace.

For every important section or bullet, the user should be able to inspect:

- which resume lines influenced it
- which profile records influenced it
- which job or research snippets influenced its wording or priority

This source view is important for trust, especially once side-assistant editing is live.

## Staleness And Approval Rules

Important upstream changes should make the approved export visibly stale.

### Mark The Draft Or Export Stale When

- the user changes important profile facts used in the approved draft
- the user changes the draft after approval
- the selected job detail changes materially
- the selected template or page-budget settings change in a way that affects the export

### First Version Behavior

- show a warning badge and clear explanation inside the workspace
- require a fresh resume review before apply continues
- keep manual editing available even while stale

### Review Queue Summary Behavior

The `Review Queue` should continue to surface a simple summary, but it should not pretend that a merely generated export is fully approved.

Recommended summary behavior:

- show coarse generation readiness through the existing asset-summary surfaces
- add separate resume-review cues for `needs review`, `approved`, or `stale`
- keep final apply approval blocked until both the resume review and the apply review are satisfied

### Current IPC And Service Migration

The current implementation exposes only:

- `job-finder:generate-resume`
- `job-finder:approve-apply`

The new workspace plan should add dedicated actions rather than stretching those two IPCs beyond clarity.

Recommended additive actions:

- open or load resume workspace by `jobId`
- save resume draft
- regenerate resume draft or section
- export approved artifact
- approve resume
- clear or replace approved resume export
- apply assistant patch

`job-finder:approve-apply` should remain the final apply trigger, but only after the new resume-approval path exists.

## Apply Integration

The supported apply path in `packages/browser-runtime` should consume the latest approved tailored `pdf` artifact for the job.

The apply flow should stop safely when:

- no approved export exists
- the approved file is missing on disk
- the approved export is stale and not re-reviewed
- export failed and only partial artifacts exist

The current base resume should not become a silent substitute once this workspace is the supported tailored-resume path.

Implementation rule:

- evolve `BrowserSessionRuntime.executeEasyApply()` to consume an explicit approved export reference or approved file path, not a generic `TailoredAsset`
- keep `TailoredAsset` only as the review-summary compatibility layer once apply switches to approved export artifacts

## Package Recommendations

Use proven packages where they fit the repo and keep custom code for product-specific logic only.

- `Electron webContents.printToPDF`: first required `pdf` export path
- `pdfjs-dist`: reuse for generated `pdf` page-count inspection and validation
- `minisearch`: first deterministic local retrieval layer in `packages/knowledge-base`
- `@mozilla/readability` plus `jsdom`: bounded public page cleanup and text extraction for employer research
- `diff`: optional only if a future manual preview surface becomes necessary; the current shipped flow relies on grounded auto-apply plus revision-backed recovery instead
- `@dnd-kit/core`: optional if drag or reorder interactions need more than simple move-up and move-down controls
- current `packages/db` SQLite pattern plus explicit query columns and indexes on new resume tables: keep this instead of introducing an ORM for v1
- `docx`: later follow-up for programmatic `docx` generation when the `pdf` path is stable

Avoid introducing a heavy rich-text editor such as `TipTap`, `Slate`, or `Quill` in v1 unless structured editing proves clearly insufficient.

Avoid adding a renderer-side PDF viewer in v1 unless true in-app PDF inspection becomes a hard requirement.

## Failure Modes That Must Work

- no base resume imported yet
- resume text extraction was partial or noisy
- structured profile data is incomplete
- job description is thin or missing important detail
- employer research fetch fails or returns noisy content
- live AI generation fails
- the user wants to add a manual bullet not found in the imported resume text
- the user pins a section and then regenerates
- the selected template overflows the `2-page` target
- the exported `pdf` exceeds `3 pages`
- the exported file is missing from disk when apply starts
- the user edits after approval and tries to apply without re-review

## Recommended Execution Order

The implementation is sliced into discrete deliverables. Each slice produces a working, testable state. An implementing agent may execute all slices in one continuous work session, but should still complete them in order and run the verification commands for each slice before moving on. Do not treat the feature as one giant unvalidated rewrite. Git commits remain optional and should only happen if the user explicitly asks for them.

### Slice 1: Contracts And Schemas

**Goal**: all new types compile and parse correctly.

**Work**:

- add the new Zod schemas and inferred types listed in the contract shapes section above to the owning contract modules, then export them from the package entry points
- add bridge fields to `ReviewQueueItemSchema`
- extend `JobFinderRepositoryStateSchema` with the new collection arrays
- extend `JobFinderWorkspaceSnapshotSchema` with the lightweight summaries
- add or extend contract tests in the owning contract test modules and exports so realistic payloads parse and malformed inputs are rejected

**Verification**:

```bash
pnpm --filter @unemployed/contracts typecheck
pnpm --filter @unemployed/contracts test
pnpm lint
```

**Done when**: all new schemas parse and reject correctly, existing contract tests still pass, no type errors.

### Slice 2: Repository And Persistence

**Goal**: new collections are stored and retrieved correctly in both repository implementations.

**Work**:

- add new repository methods to `JobFinderRepository` interface: `listResumeDrafts`, `upsertResumeDraft`, `getResumeDraftByJobId`, `listResumeDraftRevisions`, `upsertResumeDraftRevision`, `listResumeExportArtifacts`, `upsertResumeExportArtifact`, `listResumeResearchArtifacts`, `upsertResumeResearchArtifact`, `listResumeValidationResults`, `upsertResumeValidationResult`, `listResumeAssistantMessages`, `upsertResumeAssistantMessage`
- implement every new method in both `createInMemoryJobFinderRepository` and `createFileJobFinderRepository`
- add the next available migration version in `runMigrations()` with `CREATE TABLE IF NOT EXISTS` statements for: `resume_drafts`, `resume_draft_revisions`, `resume_export_artifacts`, `resume_research_artifacts`, `resume_validation_results`, `resume_assistant_messages`
- for SQLite tables that need non-id lookup or stable history ordering, add explicit query columns and indexes such as `job_id`, `draft_id`, `created_at`, `updated_at`, `exported_at`, `validated_at`, and `fetched_at`
- implement the repository list and get methods with the ordering rules defined in the persistence section above instead of relying on row `id` order
- update `stateTableNames` with the new table names
- update `readState()` and `writeState()` in the file-backed implementation to include the new collections
- update `reset()` in both implementations to include the new collections
- add explicit aggregate repository methods for atomic flows such as: save draft plus validation, mark approved export plus draft approval fields, apply assistant patch plus revision snapshot, and clear approval plus stale review state
- add `createSeed()` entries in `packages/db/src/index.test.ts` with empty defaults for new collections
- add CRUD round-trip tests for each new collection on both implementations

**Verification**:

```bash
pnpm --filter @unemployed/db typecheck
pnpm --filter @unemployed/db test
pnpm typecheck
pnpm lint
```

**Done when**: all new repository methods work on both implementations, file-backed migration creates the new tables, existing repository tests still pass.

### Slice 3: Knowledge Base First Real Layer

**Goal**: `packages/knowledge-base` can ingest text, chunk it, and retrieve relevant passages deterministically.

**Work**:

- add `minisearch` as a dependency to `packages/knowledge-base/package.json`
- add `@mozilla/readability` and `jsdom` as dependencies (these will be used in slice 4 but should be installed now)
- implement a `KnowledgeIndex` interface with methods: `addDocument(id, text, metadata)`, `search(query, options)`, `clear()`
- implement a `createLocalKnowledgeIndex()` factory backed by `minisearch`
- implement a `chunkText(text, options)` utility that splits text into retrievable passages
- implement section-aware retrieval by allowing metadata tags like `"resume"`, `"profile"`, `"job"`, `"research"` on indexed documents
- add deterministic tests with known text inputs and expected retrieval results
- keep the package provider-agnostic — no model calls, no embeddings

**Verification**:

```bash
pnpm --filter @unemployed/knowledge-base typecheck
pnpm --filter @unemployed/knowledge-base test
pnpm typecheck
pnpm lint
```

**Done when**: text can be indexed, chunked, and retrieved with deterministic results. Tests pass. No dependency on any AI provider.

### Slice 4: Research Adapter And Page Cleanup

**Goal**: bounded public-page fetch, cleanup, and structured research artifact creation work end-to-end.

**Work**:

- define a `ResumeResearchAdapter` interface in `packages/job-finder` (or as an injected dependency type) with a method like `fetchResearchPages(job, options): Promise<ResumeResearchArtifact[]>`
- implement a desktop adapter in `apps/desktop/src/main/adapters/` that performs bounded HTTP fetches of public employer pages (company home page, about, careers, etc.)
- derive and enforce an allowlist of acceptable hostnames from the saved job URL and explicitly related employer domains; do not widen into open web crawling
- implement page cleanup in `packages/knowledge-base` using `@mozilla/readability` and `jsdom` to extract clean text from raw HTML
- implement structured artifact creation: from cleaned page text, extract company notes, domain vocabulary, and priority themes
- wire the research adapter into the `CreateJobFinderWorkspaceServiceOptions` dependency injection
- add timeout and byte caps to fetches
- add a fallback path that returns an empty research result when fetch fails
- add tests for page cleanup and artifact extraction with fixture HTML

**Verification**:

```bash
pnpm --filter @unemployed/knowledge-base typecheck
pnpm --filter @unemployed/knowledge-base test
pnpm --filter @unemployed/job-finder typecheck
pnpm typecheck
pnpm lint
```

**Done when**: a research adapter can fetch, clean, and extract structured artifacts from public pages. Failures gracefully fall back. Tests cover the cleanup and extraction logic.

### Slice 5: Structured Draft Orchestration

**Goal**: the job-finder service can create a structured `ResumeDraft` from gathered evidence instead of a flat text blob.

**Work**:

- add `createResumeDraft` and `reviseResumeDraft` methods to `JobFinderAiClient` with input and output types
- implement deterministic fallback versions of both methods that build a coarse draft from profile data and job details
- implement OpenAI-compatible versions that call the model
- add the try/catch fallback wrapper in the composite client
- refactor `generateResume(jobId)` in `packages/job-finder/src/index.ts` to:
  1. gather evidence from profile, resume text, job data, and research artifacts
  2. index evidence in a `KnowledgeIndex` for section-aware retrieval
  3. call `createResumeDraft` with retrieved evidence
  4. persist the resulting `ResumeDraft` via the repository
  5. run validation and persist a `ResumeValidationResult`
  6. keep backward compatibility: still create a `TailoredAsset` bridge object with `previewSections` mapped from the new draft sections
- add a workspace-load fallback that seeds a best-effort initial draft from an existing legacy `TailoredAsset` when a job has no `ResumeDraft` yet
- add a `saveResumeDraft(draft)` orchestration method
- add a `regenerateResumeDraftSection(jobId, sectionId)` orchestration method
- add orchestration tests with the in-memory repository and deterministic AI client

**Verification**:

```bash
pnpm --filter @unemployed/ai-providers typecheck
pnpm --filter @unemployed/ai-providers test
pnpm --filter @unemployed/job-finder typecheck
pnpm --filter @unemployed/job-finder test
pnpm typecheck
pnpm lint
```

**Done when**: `generateResume` creates a structured `ResumeDraft` with sections, bullets, and provenance. The draft is persisted. A `TailoredAsset` bridge is still created for backward compatibility. Validation runs and results are persisted. All existing tests still pass.

### Slice 6: PDF Export

**Goal**: the document manager can render a `ResumeDraft` through templates and export a real PDF artifact.

**Work**:

- update the template rendering functions in the document manager to accept `ResumeDraft` (with structured sections) instead of only flat `previewSections`
- map `ResumeDraftSection` records to the template regions defined in the minimum v1 template mapping: header, summary, skills, experience, projects, education/certifications
- keep the existing `previewSections` rendering path working as a fallback for assets that do not have a draft yet
- add a `renderResumePdf(draft, templateId)` method to the document manager that:
  1. renders the chosen template to HTML
  2. loads the HTML in a hidden `BrowserWindow`
  3. calls `webContents.printToPDF()` with resume-appropriate margins
  4. uses `pdfjs-dist` to inspect the generated PDF for page count
  5. persists the PDF file and creates a `ResumeExportArtifact`
  6. returns the artifact with file path and page count metadata
- reuse the existing Electron-side `pdfjs-dist` setup instead of inventing a second PDF inspection path
- ensure the hidden export window is disposed on both success and failure paths
- add page-count warning logic: warn if > 2 pages, hard-warn if >= 3

**Verification**:

```bash
pnpm --filter @unemployed/desktop typecheck
pnpm --filter @unemployed/desktop build
pnpm typecheck
pnpm lint
```

**Done when**: a `ResumeDraft` renders through all three templates into HTML and exports to PDF with page-count metadata. The existing HTML preview path still works.

### Slice 7: IPC And Preload Wiring

**Goal**: all new resume workspace actions are accessible from the renderer through typed IPC.

**Work**:

- add new IPC route handlers in `apps/desktop/src/main/routes/job-finder.ts`:
  - `job-finder:get-resume-workspace` (load draft, exports, research, validation for a job)
  - `job-finder:save-resume-draft` (persist manual edits)
  - `job-finder:regenerate-resume-draft` (regenerate entire draft)
  - `job-finder:regenerate-resume-section` (regenerate one section)
  - `job-finder:export-resume-pdf` (export approved PDF)
  - `job-finder:approve-resume` (mark draft approved, select export)
  - `job-finder:clear-resume-approval` (un-approve for re-editing)
  - `job-finder:apply-resume-patch` (apply an assistant edit)
  - `job-finder:get-resume-assistant-messages` (fetch assistant thread)
  - `job-finder:send-resume-assistant-message` (send user message, get AI response with patches)
- add matching typed methods in `apps/desktop/src/preload/index.ts` under `desktopApi.jobFinder`
- each action should return `Promise<JobFinderWorkspaceSnapshot>` except the assistant message fetch and resume workspace load which return their specific payloads
- add new workspace service methods in `packages/job-finder` for any that do not already exist from slice 5

**Verification**:

```bash
pnpm --filter @unemployed/desktop typecheck
pnpm --filter @unemployed/desktop build
pnpm typecheck
pnpm lint
```

**Done when**: all new IPC channels compile, are typed end-to-end from preload to main to service, and the desktop app builds.

### Slice 8: Resume Workspace UI

**Goal**: a dedicated desktop route for structured resume editing and preview.

**Work**:

- add a child route under Review Queue: `/job-finder/review-queue/:jobId/resume`
- treat the route param `jobId` as the source of truth while the workspace is open; sync the selected review item from it and redirect invalid job ids back to Review Queue
- keep `Review Queue` highlighted in the shell nav while the workspace is open
- update shell active-nav logic so any `/job-finder/review-queue*` path keeps `Review Queue` highlighted
- implement the workspace layout:
  - top bar: job/company info, draft status, template selector, export action, approval actions
  - left rail: section outline, validation summary, page-budget warnings
  - main editor: structured section and bullet editing with include/exclude toggles, reorder, pin/lock
  - right rail: rendered HTML preview (stacked or tabbed with assistant panel)
- wire the editor to the `save-resume-draft` IPC for persistence on edit
- wire the preview to re-render on draft changes
- wire validation warnings to the left rail
- add an `Open Resume Workspace` action in the Review Queue mission panel (replacing the disabled `Edit asset` control)
- use local workspace action state for save, regenerate, export, and assistant flows instead of relying only on the top-level page busy message
- start with explicit move-up and move-down reorder controls; only add drag-and-drop if implementation QA proves it necessary
- use `@renderer/` path aliases and follow the desktop `AGENTS.md` frontend patterns (semantic HTML, `useId()`, shared tokens, no `any`)

**Verification**:

```bash
pnpm --filter @unemployed/desktop typecheck
pnpm --filter @unemployed/desktop build
pnpm desktop:dev (manual visual check)
pnpm lint
```

**Done when**: the workspace opens from Review Queue, shows a structured draft with editable sections, renders a live preview, shows validation warnings, and persists edits through IPC. Template selection and export are functional.

### Slice 9: Assistant Patch Flows

**Goal**: the side assistant can propose targeted edits that resolve into typed patches.

**Work**:

- build a side assistant panel in the workspace right rail
- wire user messages to `job-finder:send-resume-assistant-message`
- implement the assistant message handler in orchestration:
  1. receive the user message and current draft state
  2. call the AI client with the message, draft context, and available patch operations
  3. parse the response into `ResumeDraftPatch` operations
  4. auto-apply the typed patches while preserving revision-backed recovery
- implement patch application logic that respects lock/pin state:
  - if a patch targets a locked section or bullet, reject it with a structured conflict result
  - log the conflict in the assistant message response
- persist assistant messages and patch outcomes
- add a lightweight revision snapshot before each patch application for undo

**Verification**:

```bash
pnpm --filter @unemployed/job-finder typecheck
pnpm --filter @unemployed/job-finder test
pnpm --filter @unemployed/desktop typecheck
pnpm --filter @unemployed/desktop build
pnpm typecheck
pnpm lint
```

**Done when**: the assistant can receive user requests, propose grounded typed patches, auto-apply them safely, respect locked sections and bullets, persist the conversation, and leave revision snapshots for recovery without requiring a separate preview UI.

### Slice 10: Apply Integration And Staleness

**Goal**: the apply flow uses the approved tailored PDF and refuses to proceed when the resume is missing, stale, or unapproved.

**Work**:

- update `approveApply(jobId)` to check for a currently approved and not-stale `ResumeExportArtifact` before proceeding
- update the apply runtime contract in `packages/browser-runtime` to consume the approved PDF export reference or approved file path instead of the coarse `TailoredAsset`
- implement staleness detection:
  - mark the draft stale when important profile facts change after approval
  - mark the draft stale when the draft is edited after approval
  - mark the draft stale when the selected job detail changes materially
  - mark the draft stale when template or page-budget settings change
- update Review Queue summary rendering to show the new `resumeReview` bridge state instead of inferring review readiness from legacy asset fields
- wire the resume approval action from the workspace
- add safe-stop behavior when the approved file is missing from disk
- add orchestration tests for the approval, staleness, and apply-rejection paths

**Verification**:

```bash
pnpm --filter @unemployed/job-finder typecheck
pnpm --filter @unemployed/job-finder test
pnpm --filter @unemployed/browser-runtime typecheck
pnpm --filter @unemployed/desktop typecheck
pnpm --filter @unemployed/desktop build
pnpm typecheck
pnpm test
pnpm lint
```

**Done when**: apply refuses without an approved non-stale PDF. Staleness triggers correctly. Review Queue shows resume approval state. All tests pass.

**Status update (`2026-04-04`)**:

- implemented apply refusal when the approved tailored PDF is missing on disk by injecting a main-process file verifier into the workspace service
- implemented stale approval transitions when resume-affecting profile data, template settings, saved job details, or the approved draft itself change after approval
- normalized approval display and apply lookup around `draft.approvedExportId` so stale legacy export flags no longer bypass the real approval source of truth
- added service tests for profile-change, settings-change, saved-job-change, stale-after-edit, and missing-file apply-rejection paths
- desktop UI now protects unsaved resume edits during actions and navigation, and the current follow-up priority is reliability of the shipped auto-apply patch flow rather than adding another preview surface

### Slice 11: Tests, QA, And Doc Updates

**Goal**: comprehensive test coverage, visual QA, and documentation updates.

**Work**:

- add or expand tests across all layers:
  - contract parse/reject tests for edge cases
  - repository tests for aggregate save operations
  - orchestration tests for the full workspace lifecycle: generate, edit, validate, export, approve, apply
  - orchestration tests for failure modes: no base resume, partial profile, thin job description, research failure, AI failure, pin/regenerate, page overflow
- add a repeatable desktop QA workflow or Playwright capture for:
  - initial generation
  - manual bullet editing
  - assistant-driven changes auto-applied with revision-backed recovery
  - locked content surviving regenerate
  - PDF export state and page-budget warnings
  - review-queue entry into the dedicated resume workspace route
  - resume approval followed by apply approval gating
  - assistant-driven changes applied from a real chat interaction
- update these docs:
  - `docs/STATUS.md`: reflect workspace implementation progress
  - `docs/TRACKS.md`: update `JF-04` track status and focus
  - `docs/modules/JOB_FINDER.md`: add workspace feature documentation
  - `docs/CONTRACTS.md`: add the new contract schemas
  - `docs/ARCHITECTURE.md`: update package ownership for knowledge-base and research adapter
  - `docs/TESTING.md`: add the resume-workspace QA harness

**Verification**:

```bash
pnpm verify
pnpm agents:check
pnpm docs:check
```

**Done when**: all tests pass, desktop builds, doc checks pass, and the workspace lifecycle works end-to-end.

**Status update (`2026-04-04`)**:

- targeted verification now passes for `pnpm --filter @unemployed/job-finder test`, `pnpm --filter @unemployed/job-finder typecheck`, `pnpm --filter @unemployed/desktop typecheck`, `pnpm docs:check`, and `pnpm --filter @unemployed/desktop ui:resume-workspace`
- repo docs were updated to capture stale-approval behavior, missing-file apply safety, and the expectation that non-happy-path guards also receive targeted service coverage
- `pnpm verify` is now unblocked by the earlier knowledge-base lint issue, but still depends on clearing any unrelated repo-wide lint fallout that surfaces during the full run
- the scripted UI proof set now includes the dedicated `pnpm --filter @unemployed/desktop ui:resume-workspace-dirty` harness for save-before-action and dirty-navigation coverage alongside the happy-path workspace capture

Additional completion rule for this slice:

- the implementing agent must leave behind a repeatable UI capture or QA harness plus saved screenshot artifacts that demonstrate the generation, edit, assistant, export, approval, and apply-gating states of the workspace on the current branch

## Codebase Patterns To Preserve

An implementing agent must follow these existing patterns. Violating any of them will break the build, tests, or existing surfaces.

### Dual Repository Implementations

`packages/db/src/index.ts` has two implementations of `JobFinderRepository`:

- `createInMemoryJobFinderRepository()`: stores collections in plain arrays on a cloned state object. Used by tests.
- `createFileJobFinderRepository()`: stores collections in SQLite tables using `id TEXT PRIMARY KEY, value TEXT NOT NULL` rows with JSON blob values. Used by the desktop app.

Both implementations must be updated in lockstep when new repository methods are added. The in-memory version uses `structuredClone` plus `Schema.parse` on every read and write. The file-backed version uses `BEGIN IMMEDIATE` transactions plus `upsertCollectionValue` for entity-level writes.

For the resume-workspace collections, the file-backed implementation may keep JSON blob payloads, but it must add query columns and indexes for non-id lookups and ordered histories. Do not rely on `ORDER BY id` when latest-by-time or job-bound lookups are required. The in-memory repository must mirror the same filters and order.

When adding new collections:

1. add the new table to `stateTableNames`
2. add a `CREATE TABLE IF NOT EXISTS` statement inside a new migration block (bump `currentVersion >= 3`)
3. add list and upsert methods to the `JobFinderRepository` interface
4. implement both the in-memory and file-backed versions using the same `cloneValue` plus schema-parse pattern
5. add the new collection to `JobFinderRepositoryStateSchema` in contracts with `.default([])`
6. add the new collection to the in-memory `reset()` method
7. add the new collection seed to `createSeed()` in `packages/db/src/index.test.ts`
8. add the new collection to the file-backed `readState()` and `writeState()` paths

### Deterministic AI Fallback

`packages/ai-providers/src/index.ts` has three client layers:

- a deterministic client that returns static or formula-based results with no network calls
- an OpenAI-compatible client that calls a real model endpoint
- a composite client created by `createJobFinderAiClient()` that tries the primary (OpenAI) path first and falls back to deterministic on failure

Every method on `JobFinderAiClient` must have a deterministic implementation. When adding new AI methods such as `createResumeDraft` or `reviseResumeDraft`:

1. define the input and output types
2. add the method to the `JobFinderAiClient` interface
3. implement a deterministic version that produces a reasonable static result
4. implement the OpenAI-compatible version that calls the model
5. add the try/catch fallback wrapper in the composite client

The deterministic fallback does not need to be high quality, but it must produce a structurally valid result so the workspace can open and the user can edit manually even when the AI provider is unavailable.

### Preload API Bridge

`apps/desktop/src/preload/index.ts` exposes a typed `desktopApi` object to the renderer through `contextBridge.exposeInMainWorld("unemployed", desktopApi)`.

Every IPC channel accessible from the renderer must be declared here. The pattern is:

```typescript
methodName: (arg: TypedInput) =>
  ipcRenderer.invoke("channel-name", arg) as Promise<TypedOutput>,
```

Most workspace actions return `Promise<JobFinderWorkspaceSnapshot>` so the renderer can refresh state after each action.

New resume workspace actions should be added under `desktopApi.jobFinder.resumeWorkspace` or as flat methods under `desktopApi.jobFinder` depending on naming clarity. The implementing agent must add both:

1. the typed preload method in `apps/desktop/src/preload/index.ts`
2. the matching IPC route handler in `apps/desktop/src/main/routes/job-finder.ts`

### Contract Schema Pattern

Contracts in `packages/contracts/src/` follow a consistent pattern:

- define a Zod schema with `export const FooSchema = z.object({ ... })`
- export the inferred type with `export type Foo = z.infer<typeof FooSchema>`
- use `NonEmptyStringSchema` for required string fields
- use `.nullable().default(null)` for optional fields
- use `.default([])` for optional arrays
- use `IsoDateTimeSchema` for timestamps
- define status enums as `z.enum([...])` with an exported values array

### Test Pattern

All packages use Vitest with `describe` / `test` blocks. The established patterns:

- the owning contract test modules: schema parse/reject tests with realistic payloads
- `packages/db/src/index.test.ts`: creates a `createSeed()` fixture, tests both in-memory and file-backed implementations with the same assertions, tests clone isolation
- `packages/ai-providers/src/index.test.ts`: tests the deterministic client with realistic profile and job inputs, validates output schema compliance
- `packages/job-finder/src/index.test.ts`: integration tests that wire contracts, in-memory repository, and deterministic AI client together, then test orchestration flows end-to-end

New workspace tests should follow these same patterns. Each layer should have its own test coverage:

- contract schemas: parse and reject tests
- repository: CRUD round-trip tests on both implementations
- orchestration: end-to-end flows with in-memory repository and deterministic AI client

### Workspace Snapshot Pattern

Most IPC actions return a full `JobFinderWorkspaceSnapshot` so the renderer can replace its entire state atom after each mutation. New resume workspace data should be added to this snapshot if the renderer needs it for display. Keep the snapshot lightweight by not including full draft revision history or large text blobs inline when a summary or ID reference suffices.

### Document Manager Pattern

`apps/desktop/src/main/adapters/job-finder-document-manager.ts` exposes a `DocumentManager` interface. The current rendering flow:

1. receives a `TailoredAsset` with `previewSections`
2. selects a template by ID from a hardcoded catalog
3. generates HTML by string-building from the template and section data
4. writes the HTML file to disk under a generated-resume output directory
5. returns the file path

When evolving this for the workspace:

1. the template rendering function must accept a `ResumeDraft` instead of (or in addition to) flat `previewSections`
2. new templates should map from `ResumeDraftSection` records to template regions
3. add a `printToPdf` step after HTML rendering using `webContents.printToPDF`
4. keep the HTML rendering path working for the preview panel
5. return both the HTML and PDF file paths plus page-count metadata

## Atomic Save Guidance

The current repository API is mostly single-entity upserts. This feature introduces more related state than the current tailoring flow.

The following operations must be treated as atomic repository writes even if the exact API shape changes:

- save draft plus draft validation result
- save draft plus bridge `TailoredAsset` refresh when review compatibility data changes
- mark a draft approved plus select its approved export artifact
- export a new artifact plus update the bridge summary used by review and apply flows
- clear stale approval plus update the review-facing summary state
- apply assistant patch plus persist the resulting lightweight revision snapshot

If the repository expands with aggregate-save methods, use explicit aggregate methods over many loosely coordinated renderer-triggered writes. The renderer should not be responsible for sequencing multi-entity persistence.

## Assistant Patch Contract Guidance

Another agent should not have to invent patch semantics from scratch.

The first patch grammar should stay narrow and explicit. Good initial operations are:

- replace section text
- insert bullet after or before a known bullet id
- update bullet text
- remove bullet by id
- move bullet within a section
- toggle section or item include state
- set lock or pin state

Patch operations should target stable ids, not fuzzy text matching, whenever possible.

Conflict rule:

- if an assistant patch targets locked content, reject it with a structured conflict result rather than silently unlocking or rewriting the content

## Acceptance Criteria

- A user can open a dedicated `Resume Workspace` for a selected job.
- The workspace can generate a structured draft grounded in the imported resume, structured profile, saved job data, and bounded public employer research.
- A user can edit bullets, text, ordering, and inclusion manually.
- A user can pin or lock content and regenerate without losing pinned edits.
- The side assistant can propose targeted changes without performing silent full-document rewrites.
- The app can show a live rendered preview with clear validation warnings and source transparency.
- The app can export a real `pdf` artifact and persist its metadata locally.
- The app warns when the resume exceeds `2 pages` and treats `3 pages` as the near-hard cap.
- The user can approve a tailored resume in the workspace and later use that approved artifact in the apply flow.
- The apply flow stops safely when the approved artifact is missing, stale, or invalid.
- Deterministic tests cover the new contracts, storage, orchestration, retrieval, validation, and export behavior.

## QA And Validation Expectations

Implementation work for this plan should be validated with at least:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm agents:check`
- `pnpm docs:check`
- `pnpm --filter @unemployed/desktop build`

### Test File Locations

Follow the existing test patterns in these files:

- the owning contract test modules and exports: add parse and reject tests for every new schema
- `packages/db/src/index.test.ts`: add CRUD round-trip tests for new collections on both in-memory and file-backed implementations, following the existing `createSeed()` fixture pattern
- `packages/ai-providers/src/index.test.ts`: add tests for the deterministic fallback implementations of new AI methods
- `packages/job-finder/src/index.test.ts`: add integration tests that wire in-memory repository plus deterministic AI client and test the full workspace lifecycle
- `packages/knowledge-base/src/index.test.ts`: add tests for text chunking, indexing, and deterministic retrieval

### Desktop QA Captures

Desktop QA should also add a repeatable resume-workspace capture or harness so agents can validate:

- initial generation
- manual bullet editing
- assistant-driven changes auto-applied with revision-backed recovery
- locked content surviving regenerate
- `pdf` export state and page-budget warnings

## Docs To Keep Updated During Implementation

- `docs/STATUS.md`
- `docs/TRACKS.md`
- `docs/modules/JOB_FINDER.md`
- `docs/CONTRACTS.md` when the new schemas land
- `docs/ARCHITECTURE.md` when the new package ownership and retrieval flow land
- `docs/TESTING.md` when the resume-workspace QA harness exists
