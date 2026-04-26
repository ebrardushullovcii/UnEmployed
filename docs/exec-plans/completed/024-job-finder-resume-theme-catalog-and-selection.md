# 024 Job Finder Resume Theme Catalog And Selection

Status: completed

## Goal

Ship a production-grade resume theme catalog for Job Finder that lets users choose a default export theme in `Settings` and a specific theme per resume draft in `Resume Workspace`, then export and approve that exact theme with the same ATS-safety, validation, and benchmark confidence as the current baseline.

- first release target: keep `classic_ats` and `compact_exec`, promote dormant `modern_split`, and add `technical_matrix`, `project_showcase`, and `credentials_focus`
- product outcome: users can pick a theme with confidence instead of living behind one hidden default, and exported plus approved artifacts always reflect the selected draft theme

## Constraints

- treat this as an end-to-end owned production feature: if tests, migrations, harness updates, or UX cleanup are missing, land them in the same track instead of leaving follow-up debt
- implementation owner has decision authority to rework contracts, renderer structure, workspace flows, and UI where needed; the bar is a release-ready result, not a minimal diff
- preserve typed boundaries across `@unemployed/contracts`, `@unemployed/job-finder`, and desktop main, preload, and renderer layers
- preserve ATS-safe output rules: text-first HTML and PDF, safe escaping, deterministic page sizing, and no layout choices that materially weaken parsing reliability
- use `draft.templateId` as the export and approval source of truth; `settings.resumeTemplateId` remains the default only for newly seeded drafts
- a theme change after approval must stale the approval and require a fresh export plus review
- remove hidden or legacy mismatch between supported contract ids and actually shipped renderer ids; the UI must show only real supported themes
- prefer the simplest architecture that can support more themes later, but allow re-architecture where the current renderer or state flow blocks clean catalog ownership
- resolve code-level and UX decisions without waiting for extra approval unless a genuine product tradeoff cannot be decided from repo evidence

## What Landed

- one truthful shipped theme catalog now exists across contracts, job-finder, desktop renderer, settings UI, and resume workspace UI: `Classic ATS`, `Compact ATS`, `Modern Split ATS`, `Technical Matrix`, `Project Showcase`, and `Credentials Focus`
- `ResumeTemplateDefinition` now carries fit guidance and density metadata so the renderer can present meaningful theme choices without leaking renderer-only implementation details into contracts
- resume theme ownership now lives on `draft.templateId`; `settings.resumeTemplateId` remains the default only for newly seeded drafts
- generation, regeneration, save, export, approval, artifact naming, and tailored-asset labeling now preserve the selected draft theme instead of silently snapping back to the settings default
- changing the default theme in `Settings` no longer stale already approved resumes, while changing the theme on a resume draft is a real draft edit that requires a fresh export and approval
- desktop resume rendering was refactored into a catalog-driven six-theme ATS-safe renderer while preserving the existing benchmark safety requirements: single-column body grid, safe escaping, no table-based layout, and deterministic HTML debug output
- `Settings` now uses a theme picker for the default theme, and `Resume Workspace` now has its own theme picker so users can choose the exact theme for that draft before export
- renderer tests, workspace-service tests, contract tests, and resume-quality benchmark tests were widened from two-theme assumptions to the shipped six-theme catalog
- the full desktop resume workspace UI harness and the replayable desktop resume-quality benchmark both passed after the feature landed

## Validation

- `pnpm validate:package contracts`
- `pnpm validate:package job-finder`
- `pnpm validate:package desktop`
- `pnpm --filter @unemployed/desktop ui:resume-workspace`
- `pnpm --filter @unemployed/desktop benchmark:resume-quality`

## What It Means Now

- Job Finder now ships a real resume theme catalog instead of hiding users behind one effective default
- users can set a default theme for new resumes in `Settings`, then override that theme per draft in `Resume Workspace` without fighting global state
- the approved export path now reflects the exact draft theme the user reviewed, which closes the old settings-owned mismatch between draft state and exported PDF
- future theme work should reopen this area only for a new ATS-safe theme candidate, a per-draft theme regression, or a renderer safety/parsing issue backed by fresh benchmark or UI evidence

## Latest Evidence Pointers

- theme renderer entry: `apps/desktop/src/main/adapters/job-finder-resume-renderer.ts`
- theme renderer tests: `apps/desktop/src/main/adapters/job-finder-resume-renderer.test.ts`
- benchmark entry: `apps/desktop/src/main/services/job-finder/resume-quality-benchmark.ts`
- draft loading and export helpers: `packages/job-finder/src/internal/workspace-application-resume-support.ts`
- workspace save, export, and approval flow: `packages/job-finder/src/internal/workspace-application-methods.ts`
- settings theme picker: `apps/desktop/src/renderer/src/features/job-finder/screens/settings/settings-editable-defaults.tsx`
- resume workspace theme picker: `apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/resume-workspace-editor-panel.tsx`
- latest UI harness artifacts: `apps/desktop/test-artifacts/ui/resume-workspace/`
- latest benchmark artifact: `apps/desktop/test-artifacts/ui/resume-quality-benchmark/resume-quality-benchmark-report.json`
