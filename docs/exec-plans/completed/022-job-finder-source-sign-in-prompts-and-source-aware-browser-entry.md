# 022 Job Finder Source Sign-In Prompts And Source-Aware Browser Entry

Status: completed

## Goal

Make source sign-in requirements and recommendations explicit in `Profile` and `Find jobs`, and let users open the shared browser directly on the relevant source entry surface when the next useful step depends on sign-in.

## What Landed

- added typed source-access prompt contracts and typed source-aware browser-open input in `@unemployed/contracts`
- derived `login_required` and `login_recommended` prompts from source-generic source-debug and learned-instruction evidence in `@unemployed/job-finder`
- widened the shared browser runtime/session-open path so the service can request a resolved source entry URL without exposing renderer-side browser control
- threaded the new typed browser-open action through desktop main, preload, and renderer boundaries only
- surfaced sign-in prompts and targeted sign-in CTAs in `Profile` source rows and `Find jobs` search controls, including per-source actions in `Run one source`
- preserved scoped pending-state ownership from `020` so sign-in actions only block on the real shared browser-session lane or the specific dirty-row guard that applies
- added a dedicated desktop screenshot harness and committed repository-state fixture for deterministic sign-in prompt QA
- tightened the rendered hierarchy and copy after screenshot review so the browser status, sign-in CTA, and rerun guidance read as one intentional flow instead of layered warnings

## Latest Evidence

- focused contracts, job-finder, browser-runtime, and desktop validations are green for the new prompt and browser-entry surfaces
- screenshot QA passed for desktop and narrower desktop widths with artifacts saved under `apps/desktop/test-artifacts/ui/source-sign-in-prompts/`
- the final screenshot fixture no longer trips a false unsaved-profile footer because its saved profile state now matches renderer normalization rules

## Validation

- `pnpm --filter @unemployed/job-finder test -- workspace-service.source-access-prompts.test.ts`
- `pnpm --filter @unemployed/job-finder typecheck`
- `pnpm --filter @unemployed/desktop test -- src/renderer/src/features/job-finder/lib/profile-editor.test.ts src/renderer/src/features/job-finder/screens/discovery/discovery-filters-panel.test.tsx src/renderer/src/features/job-finder/components/profile/profile-discovery-target-row.test.tsx src/main/services/job-finder/create-workspace-service.test.ts`
- `pnpm --filter @unemployed/desktop typecheck`
- `pnpm validate:package contracts`
- `pnpm validate:package browser-runtime`
- `pnpm validate:package job-finder`
- `pnpm validate:package desktop`
- `pnpm source-generic:check`
- `pnpm --filter @unemployed/desktop ui:source-sign-in-prompts`

## What It Means Now

- users can see which saved source needs sign-in, why it needs attention, and what to do next without guessing from generic browser wording
- targeted sign-in actions now open the shared browser on the best resolved source entry route when learned guidance is available
- screenshot-reviewed sign-in prompt UX is part of the desktop Job Finder baseline; reopen this area only for a concrete prompt-classification bug, browser-entry regression, or a fresh screenshot-backed UX issue
