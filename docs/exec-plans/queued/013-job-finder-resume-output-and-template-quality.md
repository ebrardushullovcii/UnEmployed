# 013 Job Finder Resume Output And Template Quality

Status: ready

This plan is a prepared follow-on starting plan. It captures the next-quality slice after the current `007` resume-workspace hardening work is stable enough that deeper output changes will not get buried under MVP cleanup.

## Goal

Upgrade `Job Finder` from a working resume workspace with thin exported artifacts into a genuinely strong tailored-resume system:

- better section modeling
- better ATS-safe default output
- better keyword targeting without invention
- better proof-point selection and ordering
- better PDF quality and export confidence

This plan intentionally keeps the existing `Resume Workspace`, typed contracts, and local-first architecture. The target is to improve the resume content and render pipeline, not to replace the product with a flat-file builder.

## Why This Work Exists

The current workspace direction is good, but the actual exported output is still thinner than the editing surface around it:

- the tailored draft shape is still close to `summary`, `experienceHighlights`, `coreSkills`, and `targetedKeywords`
- the default rendered templates are still relatively small wrappers around those sections
- the export quality bar is not yet at the level the user wants for real submissions

In plain terms: the app now has a stronger workflow than the artifact it produces.

## Comparative Inputs And Reference Sources

### Local reference already reviewed

- the `career-ops` PDF mode guide
- the `career-ops` CV HTML template
- the `career-ops` PDF generator entrypoint

Key takeaways from `career-ops`:

- the exact machine-local paths used during prep were intentionally removed here; keep only durable repo docs or the summarized takeaways below in committed plans

- strong ATS-safe rules
- better section order for recruiter scanning
- better keyword-injection guidance
- better emphasis on selecting the most relevant proof instead of keeping all content equally visible

### External reference sources worth copying from selectively

- `OpenResume` for parser plus builder expectations and ATS-friendly import/export framing: `https://github.com/xitanggg/open-resume`
- `Reactive Resume` for real-time preview, section ordering, and template-system ambition: `https://github.com/AmruthPillai/Reactive-Resume`
- `JSON Resume` for interop ideas and canonical section naming, not as a required source of truth: `https://jsonresume.org/schema`

Implementation rule:

- use these as design and information-architecture references
- do not import their architecture wholesale if it weakens `UnEmployed`'s typed desktop-local model

## Locked Product Decisions

- Keep the dedicated `Resume Workspace` as the editing and approval surface.
- Keep user facts grounded in imported documents, structured profile data, and explicit user edits only.
- Keep `PDF` as the first-class submission artifact and `HTML` as the inspectable intermediate layer.
- Keep the existing typed local repository model instead of switching to a markdown-first or cloud-first resume system.
- Upgrade the actual draft and export model beyond `summary`, `experience highlights`, `skills`, and `keywords`.
- Keep one ATS-safe default template first; optional richer templates may follow, but not at the expense of the default quality bar.
- Allow job-aware ordering, emphasis, and wording changes, but never invented candidate facts.
- Prefer deterministic ranking, validation, and section assembly where the rules are clear, with AI used for bounded rewrite or selection work instead of opaque full-document replacement.

## Product Outcome

When this plan lands, a user should be able to:

1. open a job-specific resume workspace
2. generate a tailored draft that looks like a real resume, not a thin summary card expanded into PDF
3. inspect richer sections with clearer provenance
4. export a PDF that is materially more credible and recruiter-ready
5. trust that keyword targeting and section prioritization improved fit without inventing facts

## Scope

### In Scope

- richer structured resume section modeling
- better export templates and stronger default ATS-safe output
- section prioritization and reordering rules
- better project and proof-point selection
- keyword-coverage and page-overflow validation improvements
- optional JSON Resume import/export mapping study if it helps interoperability
- QA workflows for export quality, page-count behavior, and ATS-safe output review

### Out Of Scope

- turning the workspace into a full generic design editor
- unlimited template marketplace work
- broad cover-letter implementation in the same slice
- rewriting the whole workspace route or approval model again
- replacing typed repo state with markdown documents as the source of truth

## Required Resume Quality Upgrades

### 1. Upgrade the draft domain

The draft model should be widened so it can express a real resume structure, not only the current simplified bridge.

Target section families:

- header / contact
- professional summary
- competencies / core skills
- experience entries with role-level grouping and ordered bullets
- selected projects
- education
- certifications
- additional skills / languages when useful

Implementation note:

- keep the existing `ResumeDraft` foundation if it still fits
- but stop treating the minimal preview bridge as the effective content ceiling

### 2. Add better content selection policy

The builder should not surface all profile evidence equally.

Required behavior:

- rank experiences, bullets, and projects against the target job
- promote the strongest matching proof first
- hide weak or low-relevance content by default
- keep explicit user pin or lock behavior stronger than regenerate behavior

### 3. Add stronger keyword strategy

The builder should:

- extract or rank priority job terms
- check coverage at the section or bullet level
- favor natural insertion into supported facts
- avoid stuffing keywords into filler lists that do not improve the resume

### 4. Improve default template quality

The default exported template should adopt the strongest safe patterns from the reviewed references:

- single-column ATS-safe baseline
- stronger hierarchy in header and section titles
- better spacing rhythm and typography
- better handling of links, contact rows, and dense skills
- better page use before overflow

### 5. Improve export QA and validation

Add validations or review cues for:

- missing critical sections
- poor keyword coverage
- page overflow
- low-evidence bullets
- duplicate bullets
- weak filler content
- unsupported claims

## Workstreams

### 1. Resume Domain Expansion

- audit which profile records need direct mapping into richer draft sections
- widen the typed draft domain carefully
- keep provenance visible at section and bullet level

### 2. Tailoring Policy Upgrade

- rank candidate evidence against the job
- improve project selection
- improve bullet ordering
- formalize keyword-targeting rules

### 3. Export Template Upgrade

- design one stronger ATS-first default template
- optionally retain the current templates as legacy alternatives until the new default settles
- verify page-count and print behavior on representative data

### 4. Interop And Import Study

- evaluate JSON Resume mapping as a useful import or export seam
- borrow ideas from `OpenResume` and `Reactive Resume` where they improve structure or UX without importing their persistence model

### 5. QA And Evidence

- add or update scripted desktop capture flows for stronger before/after export review
- leave behind example artifact evidence paths for later planning and comparison

## Milestones

### Milestone 1: Better section model and selection policy

- the draft domain can express richer resume sections
- the generator can choose and order stronger proof

### Milestone 2: New ATS-first default template

- exported PDF quality is visibly stronger
- the default output feels recruiter-ready

### Milestone 3: Validation and QA hardening

- export warnings are more useful
- capture and service tests prove the new output path

## Verification Expectations

Implementation work for this plan should be validated with at least:

- `pnpm --filter @unemployed/contracts test`
- `pnpm --filter @unemployed/job-finder test`
- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop ui:resume-workspace`
- `pnpm --filter @unemployed/desktop ui:resume-workspace-dirty`
- `pnpm docs:check`

Additional completion rule:

- leave behind screenshot or artifact evidence that compares the old thin output against the new stronger output on the same seeded job

## Notes For A Deeper Follow-On Plan

- Decide whether the next richer template system should keep `classic_ats` as the renamed new default and move the current template set into legacy or alternate presets.
- Decide whether JSON Resume compatibility is worth making first-class or should remain an adapter-only import or export seam.
- Decide whether proof-point ranking belongs fully in `packages/job-finder`, partly in deterministic provider helpers, or behind a mixed deterministic plus AI scoring layer.
- Decide how much section-specific AI rewriting is allowed before the product drifts too far from predictable patch-based edits.
