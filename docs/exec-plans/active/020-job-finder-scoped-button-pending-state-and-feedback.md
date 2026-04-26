# 020 Job Finder Scoped Button Pending State And Feedback

Status: in_progress

## Goal

Replace the current global Job Finder button busy state with scoped pending state so only truly related actions disable together, while making disabled and in-progress buttons visually obvious.

This plan assumes full production ownership of the outcome: broad refactors or targeted rewrites are explicitly allowed where the current state model or component structure gets in the way, and the work should include whatever focused tests or architecture cleanup are needed to ship the result with confidence instead of preserving the current implementation for its own sake.

## Constraints

1. Keep main, preload, and renderer concerns separate
2. Keep contracts typed and schema-validated
3. Do not reintroduce a page-wide or app-wide busy flag for routine actions
4. Preserve existing single-flight constraints for discovery and source-debug
5. Do not allow same-resource concurrent mutations where the current workflow model can lose writes or corrupt state
6. Keep destructive reset behavior intentionally broad and safe
7. Validate with desktop-focused checks and targeted harnesses before treating the work as done

## Delivery Posture

- optimize for the best production outcome, not for minimal churn in existing files
- prefer the smallest correct change when it is enough, but allow major restructuring or rewrites if the current state model is the real problem
- fully own the feature end-to-end, including test coverage, visual feedback, action safety, and follow-through on edge cases uncovered during implementation
- resolve reasonable blockers directly instead of stopping at analysis unless a true product or policy decision is required

## Current Blockers

- none currently; the main challenge is separating UX freedom from real workflow-safety boundaries in the existing shared workspace service model

## Next Steps

1. Replace the controller-wide `actionState.busy` fan-out with typed scoped pending lanes
2. Upgrade shared `Button` disabled and pending visuals, including a bottom activity rail and `aria-busy`
3. Audit Discovery, Profile, Review Queue, Resume Workspace, Applications, and Settings so only related controls disable together
4. Keep discovery/source-debug single-flight and narrow same-resource locks for resume, apply, profile/import, and reset flows
5. Add renderer and focused service tests for pending-state scoping and action-safety behavior
6. Validate with desktop package checks and the most relevant UI harnesses

## Latest Evidence

- `actionState.busy` currently fans out through Job Finder routes and disables large sections of unrelated UI
- discovery and source-debug already behave like single-flight browser workflows and should stay scoped to their own lane
- most other workflows are only transaction-safe at individual writes, not at the full workflow level, so scoped UI freedom must still respect shared resource ownership

## Validation

- `pnpm --filter @unemployed/desktop test`
- `pnpm validate:desktop`
- `pnpm validate:job-finder` if service-level locking changes
- `pnpm --filter @unemployed/desktop ui:resume-workspace-dirty`
- `pnpm --filter @unemployed/desktop ui:apply-queue-controls`
- `pnpm --filter @unemployed/desktop ui:applications-recovery`
