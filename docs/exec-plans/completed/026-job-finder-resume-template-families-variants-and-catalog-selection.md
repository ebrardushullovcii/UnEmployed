# 026 Job Finder Resume Template Families Variants And Catalog Selection

Status: completed

## Goal

Ship a production-grade resume template catalog with materially distinct families, family-level variants, real preview-driven selection, and honest safety labeling so users can choose a resume that matches the job and delivery context with confidence.

## Constraints

- keep draft-owned stable template ids as the export and approval source of truth
- keep preview and export on one shared renderer so catalog previews, studio preview, and exported output cannot drift
- seed only valid `apply-safe` defaults for new drafts
- never approve or auto-apply with a template that is not explicitly eligible and benchmarked for that path
- keep every displayed template backed by the real renderer and contract catalog
- preserve ATS-safe HTML and PDF rules for shipped `apply-safe` templates
- model `share-ready` explicitly instead of implying parity with `apply-safe`, even if no `share-ready` template ships yet

## What Landed

- one truthful shared catalog now models family, variant, delivery lane, ATS confidence, fit guidance, visual tags, ordering, and explicit apply, approval, and benchmark eligibility across six shipped template ids
- desktop now owns one shared pure resume renderer in `src/shared` for export and catalog preview generation, and that renderer is re-architected around family-specific header and section builders instead of one monolithic template switch
- the shipped `apply-safe` families now feel materially different while staying single-column and ATS-safe: `Swiss Minimal` standard and accent, `Executive Brief` dense and credentials-first, `Engineering Spec` skills-first systems framing, and `Portfolio Narrative` proof-led project-first framing
- `Settings` and `Resume Studio` now use a family-first catalog with real iframe previews, compare shortlisting, lane and density filters, deterministic recommendations when job and draft evidence justify them, and truthful selected-template labeling
- workspace defaults, approval, and auto-apply now enforce template eligibility from shared metadata; `share_ready` semantics are modeled and guarded, but no `share-ready` template is currently shipped
- renderer tests now assert family-specific structure and ordering, benchmark template selection now uses only benchmark-eligible templates, and the rebuilt desktop benchmark plus workspace harness were rerun against the landed renderer

## Validation

- `pnpm validate:package contracts`
- `pnpm validate:package job-finder`
- `pnpm validate:package desktop`
- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop benchmark:resume-quality`
- `pnpm --filter @unemployed/desktop ui:resume-workspace`

## What It Means Now

- Job Finder now ships a family-first template catalog whose preview and export outputs differ by hierarchy, density, and content emphasis instead of small spacing or palette tweaks
- users can compare and choose honest `apply-safe` templates with recommendations grounded in current draft and job context
- approval and auto-apply paths only use templates that are explicitly eligible and benchmarked, which keeps the renderer changes inside the existing safety bar
- reopen this track only for a concrete family-rendering regression, a recommendation or selection regression, a benchmark-backed ATS or approval-safety issue, or a deliberate decision to ship real `share-ready` templates

## Latest Evidence Pointers

- shared renderer implementation: `apps/desktop/src/shared/job-finder-resume-renderer.ts`
- renderer tests: `apps/desktop/src/main/adapters/job-finder-resume-renderer.test.ts`
- catalog UI and recommendation logic: `apps/desktop/src/renderer/src/features/job-finder/components/resume-theme-picker.tsx`
- workspace template ownership and approval flow: `packages/job-finder/src/internal/workspace-application-methods.ts`
- latest benchmark artifact: `apps/desktop/test-artifacts/ui/resume-quality-benchmark/023-local-benchmark-v1/resume-quality-benchmark-report.json`
- latest workspace UI harness artifacts: `apps/desktop/test-artifacts/ui/resume-workspace/`
- latest workspace harness summary: `apps/desktop/test-artifacts/ui/resume-workspace/studio-preview-results.json`
