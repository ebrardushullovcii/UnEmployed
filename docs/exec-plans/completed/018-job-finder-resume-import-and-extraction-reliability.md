# 018 Job Finder Resume Import And Extraction Reliability

Status: completed

Completed on `2026-04-10`.

This is the missing `011 part 2` foundation slice.

Completed plan `011` widened the durable shared roots in `CandidateProfile`, `SavedJob`, and `ApplicationAttempt`, but resume import still writes directly into those roots through a thin one-pass flow: file import -> plain extracted text -> one AI extraction schema -> direct merge into canonical profile and search preferences.

That is no longer good enough for the product bar the repo is aiming at. This plan turns resume ingestion into a reviewable, evidence-backed local document-understanding pipeline so later setup, resume-quality, and apply work stop depending on fragile one-shot parsing.

## Goal

Replace the current direct-merge resume import path with a fully local, multi-stage extraction pipeline that:

1. handles born-digital PDF, scanned PDF, DOCX, and plain-text resumes more reliably
2. preserves page, block, and evidence context instead of flattening the document into one text blob too early
3. uses the self-hosted text-only `FelidaeAI Pro 2.5 / Minimax M2.5` model for semantic extraction and reconciliation, not for OCR or layout decoding
4. produces field candidates, confidence, and evidence before any canonical profile data is overwritten
5. applies only accepted changes into the `011` shared roots and leaves unresolved or low-confidence values reviewable for later `012` guided setup and profile-copilot flows

The product target is not a clever importer that sometimes works. The target is a trustworthy local resume-to-database pipeline that can survive arbitrary real resumes without silently degrading canonical profile data.

## Delivery Standard For Implementing Agents

This plan is not complete when a new parser library is installed, a larger prompt exists, or the app can parse one happy-path PDF.

Required implementation bar:

- keep the final canonical write targets on the real `011` roots: `CandidateProfile`, `JobSearchPreferences`, and the later workflow consumers already in the repo
- stop writing raw extraction output straight into canonical profile state without a persisted intermediate artifact and reviewable merge stage
- treat document decoding, semantic extraction, reconciliation, and final profile writes as separate steps
- preserve evidence and provenance for extracted fields instead of relying only on freeform warnings
- keep all extraction infrastructure local and free; do not depend on paid document APIs or hosted OCR
- use `M2.5` heavily where semantic reasoning helps, but do not force it to do OCR, PDF decoding, or reading-order reconstruction from raw primitives
- leave `012` and later plans a clean substrate for review items, patch groups, and readiness flows instead of inventing a second temporary extraction-review model
- update docs and handoff state in the same task so later agents can continue from repo state instead of chat context

In plain terms: another agent should be able to read this plan, inspect the named files, and implement a staged local extraction pipeline without inventing a parallel product model.

## Why This Work Exists

The current shipped resume import path is materially weaker than the rest of the Job Finder architecture.

Current repo reality:

- `apps/desktop/src/main/services/job-finder/import-resume.ts` copies the selected file locally, extracts plain text, writes `profile.baseResume`, and immediately calls `analyzeProfileFromResume()` if text exists
- `apps/desktop/src/main/adapters/resume-document.ts` supports only `.txt`, `.md`, `.pdf`, and `.docx`, with `.pdf` handled through a custom `pdfjs-dist` text extraction path and `.docx` handled through `mammoth`
- `packages/job-finder/src/internal/workspace-snapshot-profile-methods.ts` calls `ctx.aiClient.extractProfileFromResume()` with only `existingProfile`, `existingSearchPreferences`, and one `resumeText` string
- `packages/ai-providers/src/shared.ts` still models resume extraction as one flat `ResumeProfileExtractionSchema`
- `packages/job-finder/src/internal/profile-merge.ts` still merges the extraction output directly into canonical profile and search-preference roots in one pass
- the current persistence layer stores only the final `profile` and `searchPreferences`; it does not keep import runs, parser artifacts, field candidates, evidence spans, or resolution history

That leaves six product-level gaps:

1. the parser path is still text-first and layout-light, so multi-column, scanned, and design-heavy resumes degrade before the model ever sees them
2. the app cannot explain where an extracted value came from because it stores no durable field-level evidence or provenance
3. low-confidence or conflicting fields have no real intermediate home; the importer still jumps from raw extraction to canonical merge
4. `012` currently has to invent low-confidence review behavior on top of coarse warnings instead of consuming a real candidate-evidence substrate
5. `014` resume-quality work still depends on imported shared data that can be thin, duplicate-prone, or structurally wrong before resume drafting even begins
6. the current architecture has no durable benchmark or replay seam for parser quality, OCR failures, or extraction regressions

## Research Basis And Locked Technical Direction

This plan is grounded in a fresh review of the current repo plus local-document parsing research under the actual user constraints:

- the available model is a strong self-hosted text-only model: `FelidaeAI Pro 2.5 / Minimax M2.5`
- paid APIs are out of scope
- vision-capable LLM parsing is not available
- the best available fully local direction is a hybrid pipeline: parser routing + OCR or layout recovery + canonical document bundle + multi-pass text-only semantic extraction + deterministic reconciliation

Recommended local stack:

- born-digital PDF: `PyMuPDF` primary, `pdfplumber` secondary
- scanned PDF or image resumes: `OCRmyPDF` preprocessing plus `PaddleOCR` with `PP-StructureV3`
- DOCX: `python-docx` primary, with the current `mammoth` path kept only as a transitional fallback if needed
- canonical document representation: `Docling` if it proves stable on target hardware, otherwise a repo-owned `DocumentBundle` built from the parser outputs above
- semantic extraction and reconciliation: self-hosted `M2.5`

Implementation rule:

- `M2.5` should receive parsed text blocks with metadata, not raw PDF bytes, screenshots, or a single flattened whole-document text blob when a structured block view is available

## Dependency Contract With Existing Plans

### Relationship To `011`

Plan `011` widened the durable shared roots. `018` is the missing ingestion substrate that gets trustworthy data into those roots.

Implementation rule:

- the final accepted writes still target the `011` roots; `018` does not replace them with a parallel candidate-profile store

### Relationship To `012`

Plan `012` already sketches low-confidence review items and typed profile patch groups.

Implementation rules:

- `018` should build the extraction-run, document-bundle, and field-candidate substrate that `012` consumes for guided review
- `018` should not duplicate the full guided-setup UI or side-copilot UX that belongs to `012`
- if `018` introduces field-target or candidate-reference contracts, they should align with the review-target vocabulary that `012` already proposes so later setup work does not need a second schema reshape

### Relationship To `014`

Plan `014` improves resume draft correctness and ATS output. It depends on stronger imported candidate data.

Implementation rule:

- `018` should land before `014` relies on imported shared data for proof selection, narrative seeding, or reusable answer quality

### Relationship To `015`

Plan `015` needs reliable imported identity, eligibility, targeting, and reusable answer defaults.

Implementation rule:

- `018` should improve the trustworthiness of those imported facts before later apply automation assumes they are safe to reuse

## Locked Product Decisions

- Keep final candidate truth on `CandidateProfile` and `JobSearchPreferences`; do not create a second long-term canonical profile model.
- Stop direct canonical writes from raw model output. The importer must persist an intermediate extraction run and candidate layer first.
- Keep the self-hosted `M2.5` model as the main semantic extraction engine.
- Do not use agent tool-calling or direct model-to-DB writes for resume import.
- Use local document parsers or OCR for document decoding and layout recovery.
- Preserve raw values and normalized values separately where normalization is uncertain.
- Never infer sensitive candidate facts with no evidence, especially work authorization, sponsorship need, relocation willingness, notice period, availability, or salary expectations.
- Allow safe auto-accept only for high-confidence literal fields; require explicit review or a later guided-confirmation path for ambiguous or generated fields.
- Keep import-run artifacts durable enough for replay, QA, and reviewer trust.
- If a new persistence root is added for extraction runs or artifacts, document why it is durably different from the final shared profile roots.

## Product Outcome

When this plan lands, the app should be able to:

1. import resumes through a real local document-understanding pipeline instead of a plain-text-only bridge
2. keep a durable extraction run with parser artifacts, document blocks, field candidates, and evidence
3. auto-accept only high-confidence literal fields into profile data while routing weaker or generated values into reviewable candidates
4. explain where an imported value came from and why it was accepted, rejected, or left unresolved
5. feed `012` guided setup, `014` resume quality, and `015` apply automation with cleaner, more trustworthy shared data

## Scope

### In Scope

- local parser routing for text, DOCX, born-digital PDF, and scanned PDF resumes
- durable extraction-run persistence and canonical document-bundle contracts
- deterministic literal extraction plus section-aware `M2.5` extraction passes
- field-level candidate, evidence, and confidence contracts
- reconciliation and safe canonical-merge rules
- minimal import-status UI widening needed to expose background run state and failure details honestly
- deterministic fixture coverage and a resume-import benchmark harness

### Out Of Scope

- the full guided-setup UI and side-copilot flows from `012`
- resume output templating work from `014`
- browser or company research during import
- general-purpose OCR or document-ingestion features for unrelated modules
- hosted OCR or paid document AI services

## Current Starting Points In Repo

The implementing agent should start from the current seams instead of inventing a disconnected system.

### Import entrypoints and shell wiring

- `apps/desktop/src/renderer/src/features/job-finder/components/profile/profile-resume-panel.tsx`
- `apps/desktop/src/renderer/src/features/job-finder/hooks/use-job-finder-workspace.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/main/routes/job-finder.ts`
- `apps/desktop/src/main/services/job-finder/import-resume.ts`

### Current document extraction adapter

- `apps/desktop/src/main/adapters/resume-document.ts`

### Current profile-analysis orchestration

- `packages/job-finder/src/internal/workspace-snapshot-profile-methods.ts`
- `packages/job-finder/src/internal/profile-merge.ts`

### Current AI boundary

- `packages/ai-providers/src/shared.ts`
- `packages/ai-providers/src/openai-compatible.ts`
- `packages/ai-providers/src/deterministic/resume-parser.ts`
- `packages/ai-providers/src/deterministic/merge.ts`

### Current persistence layer

- `packages/contracts/src/profile.ts`
- `packages/contracts/src/workspace.ts`
- `packages/db/src/repository-types.ts`
- `packages/db/src/internal/migrations.ts`
- `packages/db/src/file-repository.ts`

### Existing reviewable-edit pattern to reuse conceptually

- `packages/contracts/src/resume.ts`
- `packages/job-finder/src/internal/resume-workspace-patches.ts`

## Recommended Architecture

### 1. Parser routing and document decoding

The importer should route by file type and text quality before semantic extraction starts.

Recommended path:

- `.txt`, `.md`, `.markdown`: keep a plain-text path, but still normalize into a block-based document bundle
- `.docx`: parse structure locally through `python-docx`; keep `mammoth` only as a transitional fallback while the stronger parser path lands
- born-digital `.pdf`: use `PyMuPDF` as the primary parser and `pdfplumber` as a secondary parser when reading order or block recovery is weak
- scanned `.pdf` or image-derived PDF: run `OCRmyPDF` first, then OCR plus layout recovery through `PaddleOCR` and `PP-StructureV3`

Implementation rule:

- keep the current `apps/desktop/src/main/adapters/resume-document.ts` surface as the desktop-owned file-ingest boundary, but turn it into an orchestrator over a stronger local parsing stack instead of keeping all parsing logic as ad hoc `pdfjs` and `mammoth` code forever

### 2. Canonical `ResumeDocumentBundle`

All parser outputs should normalize into one shared representation before the LLM runs.

Recommended contract direction:

```ts
ResumeDocumentBundleSchema = z.object({
  id: NonEmptyStringSchema,
  sourceResumeId: NonEmptyStringSchema,
  parserKind: z.enum([
    "plain_text",
    "python_docx",
    "mammoth",
    "pymupdf",
    "pdfplumber",
    "ocrmypdf_paddleocr",
    "docling",
  ]),
  createdAt: IsoDateTimeSchema,
  languageHints: z.array(NonEmptyStringSchema).default([]),
  warnings: z.array(NonEmptyStringSchema).default([]),
  pages: z.array(ResumeDocumentPageSchema).default([]),
  blocks: z.array(ResumeDocumentBlockSchema).default([]),
  fullText: NonEmptyStringSchema.nullable().default(null),
})
```

Recommended block fields:

- `id`
- `pageNumber`
- `text`
- `kind` such as `heading`, `paragraph`, `list_item`, `table`, `contact`, or `unknown`
- `readingOrder`
- `bbox`
- `sourceParserKinds`
- `sourceConfidence`
- `sectionHint`

Implementation rule:

- this bundle is the source of truth for extraction evidence, not the final profile

### 3. Durable extraction-run persistence

The importer needs a real run model instead of only `baseResume.extractionStatus`.

Recommended contract direction:

```ts
ResumeImportRunStatusSchema = z.enum([
  "queued",
  "parsing",
  "extracting",
  "reconciling",
  "review_ready",
  "applied",
  "failed",
])
```

Recommended persisted roots:

- `resume_import_runs`: one row per import or refresh run
- `resume_import_document_bundles`: one row per persisted parsed bundle or parser artifact summary
- `resume_import_field_candidates`: one row per extracted field candidate or grouped candidate object

Recommended run data:

- source resume id
- parser stack used
- model label and version
- started or finished timestamps
- failure summary when applicable
- run-level warnings
- overall confidence summary
- final resolution status

Persistence rule:

- this is a justified new persistence boundary because extraction runs, parser artifacts, and candidate fields have an independent lifecycle from the canonical profile itself and should not bloat `profile` JSON

### 4. Deterministic literal extraction first

Before `M2.5` runs, extract high-precision literal values with code.

Expected deterministic targets:

- email
- phone
- URLs and public profile links
- literal location strings
- explicit dates
- explicit section headings
- explicit language lines
- explicit degree or certification strings

Implementation rule:

- deterministic extraction should produce candidates with evidence just like model-backed extraction; it should not bypass the candidate layer just because it is high-confidence

### 5. Multi-pass `M2.5` extraction

Do not keep the current one-shot `ResumeProfileExtractionSchema` as the main import contract.

Recommended staged provider boundary:

- `classifyResumeSections(input)`
- `extractResumeIdentityAndSummary(input)`
- `extractResumeExperienceRecords(input)`
- `extractResumeEducationAndCertifications(input)`
- `extractResumeSkillsProjectsAndLanguages(input)`
- `extractResumeSharedMemory(input)` for narrative, proof-bank, answer-bank suggestions, and application-identity defaults
- `reconcileResumeCandidates(input)` for cross-pass conflict resolution

Each stage should return typed candidates with:

- `target`
- `value`
- `normalizedValue`
- `evidenceText`
- `sourceBlockIds`
- `confidence`
- `notes`
- `alternatives`

Implementation rule:

- keep prompts bounded to the relevant section blocks instead of sending the whole flattened resume whenever a narrower context exists

### 6. Reconciliation and safe merge

The current `mergeResumeExtractionIntoWorkspace()` logic should be replaced or heavily narrowed.

Recommended merge model:

- parser outputs and deterministic extraction create candidates
- `M2.5` creates section-scoped candidates
- reconciliation chooses the best candidate per field or record
- accepted candidates become typed profile or search-preference patch groups
- only accepted patch groups update canonical state

Recommended auto-accept policy:

- high-confidence literal fields with direct evidence and low ambiguity may auto-apply, especially contact info and links when the destination field is empty
- generated or derived fields such as `narrative`, `proofBank`, `answerBank`, `applicationIdentity`, normalized geography, and ambiguous experience records should default to `needs_review` unless confidence and evidence are very strong

Implementation rule:

- reconciliation should prefer explicit evidence and abstention over clever guessing

### 7. Review and downstream handoff

`018` should not build the whole guided-review UI, but it must leave `012` a clean handoff.

Recommended handoff shape:

- import runs expose pending candidate summaries and high-risk conflicts
- the workspace snapshot exposes the latest import-run summary and unresolved candidate counts
- `012` turns those unresolved items into the guided-review queue and profile patch flow

Implementation rule:

- keep review targets and candidate targeting aligned with the review-target vocabulary already proposed in `012`

## Field Policy

### Deterministic-first fields

- contact info
- links
- raw location string
- raw company names
- raw titles
- explicit dates
- degree strings
- certification names
- explicit spoken languages

### `M2.5`-assisted fields

- section grouping
- experience record assembly
- project extraction from mixed bullets
- normalized titles and skills
- narrative and career-transition summaries
- proof-bank suggestions
- answer-bank suggestions
- application-identity defaults
- normalized location split and currency or timezone suggestions

### Never infer if absent

- work authorization
- sponsorship need
- relocation willingness
- travel willingness
- notice period
- availability
- salary expectations

## Package Ownership Recommendation

- `packages/contracts`: owns import-run, document-bundle, field-candidate, resolution-summary, and snapshot-summary contracts; also owns any widened extraction-status or target-reference vocabularies
- `packages/db`: owns new tables, repository methods, and migration-safe persistence for import runs and candidates
- `packages/job-finder`: owns orchestration, parser routing policy selection, deterministic extraction, reconciliation, accepted-patch application, and snapshot exposure
- `packages/ai-providers`: owns stage-specific `M2.5` response schemas and deterministic fallback parity where it remains useful, but not product-level merge policy
- `apps/desktop/src/main`: owns local file ingress and parser sidecar or adapter invocation behind `resume-document.ts`
- `apps/desktop/src/renderer`: owns minimal import-progress and failure visibility now, while fuller field review still belongs to `012`

## Recommended Implementation Sequence

The lowest-risk landing order is:

1. freeze current import fixtures and weak-case baselines
2. add import-run, document-bundle, and field-candidate contracts plus persistence
3. replace plain text extraction with parser routing and canonical bundle creation
4. split the one-shot provider extraction into section-scoped `M2.5` passes
5. land reconciliation and accepted-patch application instead of direct raw merge
6. add unresolved-candidate snapshot summaries and minimal UI progress or failure visibility
7. harden scanned-PDF and complex-layout paths plus benchmark coverage

Implementation rule:

- do not start with UI review polish while the importer still lacks a durable run model, canonical bundle, and candidate layer

## Milestones

### Milestone 1: Import runs and canonical document bundle

Goal: stop treating resume import as one synchronous text string plus a final merge.

Implementation work:

- add import-run contracts and repository methods
- add the canonical `ResumeDocumentBundle` contract
- widen the desktop import adapter so it can produce parser artifacts and a bundle summary instead of only `textContent`
- keep the current text-only path as a transitional fallback while the stronger parser stack is landing

Exit criteria:

- importing a resume creates a durable run record and a parsed document bundle even before canonical profile data is updated
- the current coarse `baseResume.extractionStatus` is no longer the only source of truth for import state

### Milestone 2: Parser routing and local document-understanding stack

Goal: make document decoding trustworthy before semantic extraction begins.

Implementation work:

- add file triage for native PDF, scanned PDF, DOCX, and plain text
- land `PyMuPDF` plus `pdfplumber` for born-digital PDFs
- land `OCRmyPDF` plus `PaddleOCR/PP-StructureV3` for scanned PDFs or image-like pages
- add stronger DOCX parsing through `python-docx` or equivalent local structure-aware path
- normalize all routes into the same bundle model

Exit criteria:

- the importer can distinguish digital and scanned PDFs and route them differently
- multi-column and scanned resumes no longer depend on the old `pdfjs-dist` plain-text path alone

### Milestone 3: Section-scoped `M2.5` extraction and candidate persistence

Goal: replace the one-shot profile schema with evidence-backed staged extraction.

Implementation work:

- split the provider boundary into stage-specific extraction schemas
- add deterministic literal extraction before LLM passes
- persist field candidates with evidence and confidence
- add a reconciliation pass that chooses accepted values or leaves conflicts unresolved

Exit criteria:

- the latest import run can show candidate values and evidence for key extracted fields instead of only the final merged profile state
- a failed or low-confidence extraction no longer silently overwrites canonical profile fields

### Milestone 4: Safe canonical merge and unresolved-candidate handoff

Goal: land accepted patch application and leave a clean substrate for `012` review UI.

Implementation work:

- replace direct raw merge with accepted patch groups or equivalent typed canonical updates
- auto-accept only safe literal fields
- expose unresolved candidate summaries in the workspace snapshot
- leave behind deterministic rules for when later setup review is required

Exit criteria:

- canonical profile writes happen only from accepted candidates
- unresolved or generated values remain reviewable and do not disappear into warnings

### Milestone 5: Benchmarking, OCR hardening, and regression evidence

Goal: make parser and extraction quality measurable and repeatable.

Implementation work:

- build a fixture corpus covering born-digital PDF, scanned PDF, DOCX, multi-column layouts, and messy real resumes
- score key-field exact match and record-level extraction quality across those fixtures
- capture parser-routing and extraction-run artifacts for the seeded desktop import harness
- document parser tradeoffs and hardware expectations

Exit criteria:

- the repo has a deterministic import-quality harness instead of only live manual checks
- later agents can compare parser or prompt changes against saved baselines

## Verification Expectations

Implementation work for this plan should be validated with at least:

- `pnpm --filter @unemployed/contracts test`
- `pnpm --filter @unemployed/db test`
- `pnpm --filter @unemployed/job-finder test`
- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop ui:resume-import`
- `pnpm docs:check`

Additional completion rules:

- add a deterministic fixture harness for import quality across at least one born-digital PDF, one scanned PDF, one DOCX, and one multi-column resume
- prove the importer keeps a durable run and candidate layer even when canonical profile updates are partially or fully deferred
- prove at least one weak current case is improved, such as scanned-PDF support, multi-column reading order, or evidence-backed field reviewability

## Not In This Slice

- the full `012` guided-setup review UI
- broad profile copilot behavior
- resume-renderer or template work from `014`
- apply automation from `015`
- remote OCR, paid document AI, or generic tool-calling import agents

## Follow-On After This Plan

Only after this foundation lands should the queue expect:

- `012` to build guided low-confidence review on top of real candidate-evidence artifacts instead of coarse warnings
- `014` to rely on imported proof-bank and narrative inputs with a higher trust bar
- later parser or prompt changes to be benchmarked against retained import-run fixtures instead of anecdotal manual tests
