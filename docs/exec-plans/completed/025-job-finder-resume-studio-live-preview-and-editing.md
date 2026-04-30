# 025 Job Finder Resume Studio Live Preview And Editing

Status: completed

## Goal

Ship a production-grade `Resume Studio` for Job Finder that lets users see, edit, and review generated resumes inside the app with a truthful live preview, reliable structured editing, and the same export and approval confidence as the current PDF workflow.

## Constraints

- preserve typed boundaries across `@unemployed/contracts`, `@unemployed/job-finder`, and desktop main, preload, and renderer layers
- keep preview and export on one shared render core so the live preview cannot drift from exported output
- keep `draft.templateId` as the source of truth for preview, export, and approval
- preserve saved-draft-authoritative export and approval semantics while still rendering unsaved edits live in preview
- keep preview failure fallback non-blocking so editing still works when preview rendering fails
- preserve ATS-safe export behavior for shipped templates

## What Landed

- a typed preview API now exists across contracts, workspace service, Electron IPC, preload, and renderer so the current unsaved draft can be rendered without persistence
- preview and export now reuse the same desktop resume renderer, with preview-only `data-resume-*` anchors for selection targeting and stable revision metadata
- the desktop resume experience was reworked into a preview-centered `Resume Studio` with live preview status, warnings, template-aware rendering, save/export/approval controls, and mobile preview/editor/assistant tabs
- unsaved draft edits now render live in preview while export and approval continue using the saved authoritative draft until the user saves again
- clicking the rendered preview now targets the matching structured editor surface, and editor focus prefers text controls over action buttons
- preview failures now degrade gracefully with a visible fallback, retry path, and preserved editing access; renderer-side preview errors unwrap Electron remote-method noise so real failure messages stay visible
- desktop tests and harnesses now cover preview failure fallback, recovery, stale-response suppression, unsaved preview state, and preview-to-editor targeting
- the desktop `ui:resume-workspace` harness now captures the widened studio flow and writes focused studio evidence to `apps/desktop/test-artifacts/ui/resume-workspace/studio-preview-results.json`

## Validation

- `pnpm validate:package contracts`
- `pnpm validate:package job-finder`
- `pnpm validate:package desktop`
- `pnpm --filter @unemployed/desktop ui:resume-workspace`
- `pnpm --filter @unemployed/desktop benchmark:resume-quality`

## What It Means Now

- `Resume Studio` is now the truthful in-app surface for reviewing and editing resume drafts instead of export being the first reliable render
- users can see unsaved edits, preview warnings, and approval context directly in the studio before deciding to save, export, or approve
- preview failures no longer block resume editing, which keeps the review flow usable even when rendering breaks
- reopen this track only for a concrete live-preview drift or failure regression, preview-selection or focus regression, approval-safety mismatch, or a benchmark-backed ATS/rendering regression

## Latest Evidence Pointers

- preview and export renderer entry: `apps/desktop/src/main/adapters/job-finder-resume-renderer.ts`
- preview document-manager seam: `apps/desktop/src/main/adapters/job-finder-document-manager.ts`
- preview draft support and workspace loading: `packages/job-finder/src/internal/workspace-application-resume-support.ts`
- workspace save/export/approval flow: `packages/job-finder/src/internal/workspace-application-methods.ts`
- studio screen: `apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/resume-workspace-screen.tsx`
- preview pane: `apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/resume-studio-preview-pane.tsx`
- structured editor panel: `apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/resume-workspace-editor-panel.tsx`
- section editor focus behavior: `apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/resume-section-editor.tsx`
- widened desktop harness: `apps/desktop/scripts/capture-resume-workspace.mjs`
- latest UI harness artifacts: `apps/desktop/test-artifacts/ui/resume-workspace/`
- latest benchmark artifact: `apps/desktop/test-artifacts/ui/resume-quality-benchmark/023-local-benchmark-v1/resume-quality-benchmark-report.json`
