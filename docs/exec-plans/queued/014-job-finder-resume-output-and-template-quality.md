# 014 Job Finder Resume Content Correctness And ATS Output

Status: ready

This plan is now execution-ready. It replaces the earlier starting-point draft with a concrete sequence centered on resume correctness, editability, and one strong default export.

## Goal

Ship the first resume-quality pass that is good enough for real submissions:

- remove duplicate, filler, and job-description-bleed content
- widen the draft model so it can express a real resume instead of four flat sections
- make assistant edits predictable and safe enough to be part of the normal correction loop
- ship one ATS-safe default output before spending effort on extra template variety

The product target is not a generic design editor. The target is a trustworthy job-specific resume workflow inside `Job Finder` that produces grounded, editable, recruiter-credible PDFs.

## Why This Work Exists

Completed plan `007` delivered the route, draft storage, export approval, dirty-state protections, and apply gating. The remaining problem is output quality.

Current implementation seams make that gap explicit:

- `packages/ai-providers/src/shared.ts` still defines `TailoredResumeDraft` as `summary`, `experienceHighlights`, `coreSkills`, `targetedKeywords`, and `fullText`.
- `packages/job-finder/src/internal/resume-workspace-helpers.ts` converts that thin provider draft into `ResumeDraft` by creating only `Summary`, `Experience Highlights`, `Core Skills`, and `Targeted Keywords` sections.
- `packages/job-finder/src/internal/resume-workspace-helpers.ts` and `workspace-application-resume-support.ts` still bridge most downstream behavior through flattened `previewSections`.
- `apps/desktop/src/main/adapters/job-finder-document-manager.ts` renders only those flattened sections, so the export layer cannot express real experience entries, projects, education, or certifications even though the broader workspace already exists.
- `packages/job-finder/src/internal/workspace-application-methods.ts` sends assistant requests to the provider and applies returned patches sequentially, not as a validated batch, so partial failure or no-op replies still leave the user with weak correction behavior.
- `packages/job-finder/src/internal/resume-workspace-helpers.ts` validation currently catches only a small set of issues such as exact duplicate bullets, missing keyword echoes, page overflow, and stale approval; it does not explicitly model thin output, repeated section content, or job-description bleed.

The current captured sample output confirms the weakness:

- `apps/desktop/test-artifacts/ui/resume-workspace/workspace-after-demo.json` shows an approved asset that still collapses to one summary paragraph, one experience bullet, and three skills.
- `apps/desktop/test-artifacts/ui/resume-workspace/04-after-assistant.png` shows the seeded assistant request returning "I could not turn that request into a safe grounded edit, so no changes were applied."
- `apps/desktop/test-artifacts/ui/resume-workspace/05-after-export.png` shows the exported workflow still centered on a very thin draft with no richer structure exposed in the main editing path.

In plain terms: the workspace shell is real, but the content and export pipeline still behave like a thin proof-of-concept.

## Dependencies And Sequencing

- Best started after the initial `011` shared-data expansion direction is clear enough that stronger proof selection and candidate fact reuse do not invent temporary resume-only roots.
- Stronger `012` setup capture should improve the eventual quality ceiling, but `014` must not wait for every guided-setup detail before fixing duplicate content, draft widening, assistant reliability, and default export quality.
- `013` source intelligence can enrich terminology and company context later, but the first `014` slice must not depend on public research succeeding. Resume correctness has to hold even when research is absent or fails.
- `015` should continue to depend on the first usable `014` slice because apply quality is capped by resume quality.

## Locked Product Decisions

- Keep the dedicated `Resume Workspace` route, approval boundary, and local-first typed architecture from `007`.
- Keep candidate facts grounded only in imported resume content, stored profile data, saved job data, and explicit user edits.
- Prefer deterministic sanitation, selection, ordering, and validation where the rules are clear; use AI for bounded rewrite and selection help, not opaque whole-document replacement.
- Fix content correctness and assistant editability before adding more visual templates.
- Ship one ATS-safe default template first. Extra template breadth is explicitly later work.
- Keep `PDF` as the primary submission artifact and `HTML` as the inspectable intermediate render.
- Do not turn the workspace into a full WYSIWYG design surface.
- Keep user pins and locks stronger than regenerate or assistant behavior.

## Product Outcome

When this plan lands, a user should be able to:

1. open a job-specific resume workspace and generate a grounded draft that looks like a real resume
2. inspect and edit richer sections without manually rebuilding the whole document from scratch
3. ask the assistant for bounded changes and trust that they either apply cleanly or fail with a clear reason
4. export one strong ATS-safe default PDF that reads like a recruiter-ready artifact, not a summary card expanded into a page
5. approve that PDF and use it in later apply flows without reopening the resume-quality question

## Scope

### In Scope

- content-sanitation rules for duplicate, filler, and job-description-bleed output
- widening the typed resume draft and render model enough to express real resume sections and entries
- ranking and selection policy for stronger proof-point choice and ordering
- assistant edit reliability, including safer patch planning and application
- one ATS-safe default renderer and export path
- stronger validation and QA for correctness, editability, and export quality

### Out Of Scope

- a broad template marketplace or user-authored template builder
- cover letters in the same slice
- replacing the dedicated workspace route or approval model
- cloud sync or collaborative editing
- a generic document-design system beyond what the default resume export needs

## Current Package Ownership

- `packages/contracts`: owns widened resume schemas, patch operations, validation categories, workspace DTOs, and any new structured render input contracts.
- `packages/db`: owns persistence defaults and migration-safe storage updates for widened resume draft and export metadata.
- `packages/ai-providers`: owns provider-facing create and revise resume response contracts plus deterministic fallback parity, but not product-level selection policy.
- `packages/job-finder`: owns evidence collection, deterministic sanitation, ranking, draft assembly, validation, assistant patch preflight and application, and workflow orchestration.
- `apps/desktop/src/main`: owns HTML or PDF rendering, template definitions, export behavior, and document-level capture seams.
- `apps/desktop/src/renderer`: owns the editor UI, assistant UX, validation presentation, and scripted resume workspace capture flows.

## Execution Strategy

The first shipped slice should follow this order:

1. correctness and sanitation
2. draft widening
3. assistant reliability
4. ATS-safe default output
5. QA and regression hardening

Do not reverse that order by polishing alternate templates while the content model is still thin.

## Milestones

### Milestone 1: Correctness Baseline And Sanitation

Goal: stop obviously weak or corrupted output from making it to export.

Implementation work:

- add a small set of seeded bad-output fixtures that represent the current weak cases: duplicate bullets, repeated section content, thin summary-only drafts, and job-description phrase bleed
- add deterministic sanitation inside `packages/job-finder` before draft persistence and before export approval logic depends on the draft
- explicitly detect or prevent:
  - exact or near-duplicate bullets across included sections
  - copied job-description language that is unsupported by candidate facts
  - empty or filler sections that still render as if they are meaningful content
  - keyword packing that reads like a requirements list instead of a resume
- widen validation so the workspace can flag these issues instead of only flagging page overflow or zero keyword echoes

Exit criteria:

- the seeded weak samples no longer export duplicate or clearly job-description-derived filler content by default
- the validator surfaces correctness issues that the current implementation misses

### Milestone 2: Widen The Draft And Render Model

Goal: make the stored draft expressive enough for a real resume.

Implementation direction:

- keep `ResumeDraft` as the root object
- add one structured entry layer beneath sections rather than inventing a full document-editor tree
- support at least these section families in the first widened model:
  - header or contact
  - professional summary
  - competencies or core skills
  - experience entries with role, employer, location or date metadata, and ordered bullets
  - selected projects when the candidate has them
  - education
  - certifications
  - additional skills or languages when useful
- update generation so `buildResumeDraftFromTailoredDraft`, `seedResumeDraft`, and any deterministic fallback stop treating the four-section preview bridge as the content ceiling
- keep backward-compatible migration handling inside storage, but do not keep the flattened `previewSections` model as the long-term source of truth

Implementation rule:

- prefer one minimal structured-entry abstraction that multiple sections can reuse over many unrelated section-specific ad hoc fields

Exit criteria:

- a saved draft can represent a real experience entry and at least one non-summary supporting section without flattening everything into generic bullet lists
- the export path no longer depends on only `Summary`, `Experience Highlights`, `Core Skills`, and `Targeted Keywords`

### Milestone 3: Make Assistant Edits Reliable

Goal: turn the assistant from a best-effort suggestion rail into a dependable patch-based correction path.

Implementation work:

- widen assistant patch targets where the richer draft model requires it, but keep the patch language bounded and explicit
- add preflight validation in `packages/job-finder` before patch application:
  - confirm target ids exist against the current draft revision
  - reject edits against locked content
  - normalize harmless no-op patches before they reach persistence
  - reject patches that introduce unsupported job-description language or obvious duplication
- apply assistant patch groups as one validated batch rather than mutating the draft one patch at a time and failing halfway through
- improve deterministic fallback behavior so the default seeded assistant can handle the current demo request patterns instead of returning a no-op reply
- keep assistant replies explicit about whether changes were applied, skipped, or rejected and why

Exit criteria:

- the seeded request "Shorten the summary and tighten one experience bullet for ATS readability" applies predictably in the scripted demo and service tests
- assistant failure states leave the draft unchanged and report a concrete reason instead of silently half-applying edits

### Milestone 4: Ship One ATS-Safe Default Output

Goal: produce one default exported PDF that is strong enough to use for real applications.

Implementation work:

- replace the current preview-heading-only renderer input with a structured render model derived from the widened draft
- rebuild the default template in `apps/desktop/src/main` around an ATS-safe single-column layout with:
  - real contact header
  - clear section hierarchy
  - experience entries with role and employer context
  - projects, education, and certifications when present
  - compact, natural skills handling
- remove or demote debug-shaped elements from the default export path when they hurt credibility, especially target-role banners and keyword-only sections that read like internal scaffolding rather than resume content
- keep optional legacy templates only if they do not distract from the default-quality bar; if needed, rename or clearly label them as alternates after the new default settles

Exit criteria:

- the seeded exported PDF reads like a real resume and not like a summary card rendered to paper
- the default output remains ATS-safe and recruiter-readable at one or two pages for representative seeded profiles

### Milestone 5: QA, Evidence, And Release Bar

Goal: leave behind durable proof that the new resume path is materially better and stays stable.

Implementation work:

- update the desktop capture flow so it proves:
  - richer sections are visible in the workspace
  - assistant edits apply in the normal seeded demo
  - the exported PDF comes from the widened draft and remains approvable
  - apply gating still depends on the approved export, not on an implied happy path
- add service-level tests around duplicate-content rejection, job-description-bleed rejection, assistant patch batching, widened draft persistence, and export validation
- keep one deterministic baseline comparison using the same seeded job before and after the `014` work so future regressions are easy to see
- optionally add a separate live-provider shadow QA pass, but do not let the main acceptance path depend on live provider availability

Exit criteria:

- the deterministic QA path proves correctness, assistant editability, export quality, and approval safety end-to-end
- later agents can rerun the documented flow and compare outputs without reconstructing hidden chat context

## Workstreams By Package

### `packages/contracts`

- widen the resume draft schema with the minimal structured-entry layer the renderer and editor need
- widen assistant patch operations only where the richer draft truly requires it
- add validation categories for the new correctness failures

### `packages/db`

- store the widened draft safely
- preserve approval and export relationships through migration and defaulting

### `packages/ai-providers`

- widen create and revise contracts to target the richer draft model
- keep deterministic fallback close enough to the same model that scripted QA does not collapse back to a thin draft
- keep provider adapters free of product-specific ranking rules

### `packages/job-finder`

- own evidence selection, ranking, sanitation, draft assembly, patch preflight, and validation
- keep deterministic policy here rather than burying it in provider prompts or renderer code

### `apps/desktop`

- main process: render the structured draft into one strong default HTML or PDF output
- renderer: present the richer sections and clearer assistant outcomes without turning the workspace into a generic document editor
- scripts: keep the capture harnesses stable and deterministic enough for quality regression comparison

## QA Notes

- Treat the current captured artifacts in `apps/desktop/test-artifacts/ui/resume-workspace/` as the weak baseline to beat, not as release evidence to keep indefinitely.
- The deterministic desktop test path should be the primary quality gate for this plan. If local AI credentials are present, keep a separate optional live-provider pass rather than letting the baseline demo drift unpredictably.
- Research failure must remain a covered case. Resume quality has to remain acceptable when employer-page fetches fail or return nothing useful.
- Approval and apply gating from `007` are still part of the release bar for `014`; improved output quality must not loosen those safety checks.

## Verification Expectations

Implementation work for this plan should be validated with at least:

- `pnpm --filter @unemployed/ai-providers test`
- `pnpm --filter @unemployed/contracts test`
- `pnpm --filter @unemployed/db test`
- `pnpm --filter @unemployed/job-finder test`
- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop ui:resume-workspace`
- `pnpm --filter @unemployed/desktop ui:resume-workspace-dirty`
- `pnpm docs:check`

Additional completion rules:

- capture before or after artifact evidence for the same seeded job showing the old thin output versus the new default output
- prove the seeded assistant edit flow applies at least one real grounded mutation instead of ending in a no-op reply
- prove apply approval still refuses to continue without a fresh approved export from the current draft

## Not In This Slice

- multiple polished alternate templates
- resume-theme experimentation that compromises ATS safety
- a fully freeform design editor
- cover-letter work
- generic profile-copilot or screener-answer work that belongs to `012` or `015`

## Follow-On After This Plan

Only after this first quality slice is complete should the queue consider:

- additional resume templates or richer visual variants
- broader interoperability such as `JSON Resume` adapters
- deeper live-research-driven vocabulary tuning built on top of the typed source-intelligence work from `013`
