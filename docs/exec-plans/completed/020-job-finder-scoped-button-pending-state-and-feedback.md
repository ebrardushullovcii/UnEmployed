# 020 Job Finder Scoped Button Pending State And Feedback

Status: completed

## Goal

Replace the current global Job Finder button busy state with scoped pending state so only truly related actions disable together, while making disabled and in-progress buttons visually obvious.

## What Landed

- removed the old controller-wide busy fan-out and replaced it with scoped pending lanes across Job Finder routes
- upgraded the shared `Button` component to expose clearer disabled and in-progress feedback, including `aria-busy` and a bottom activity rail
- kept discovery and source-debug single-flight behavior scoped to their own real conflict surfaces
- wired profile import, setup review, resume workspace, applications, settings, and per-target discovery/source-debug actions to route-specific pending scopes instead of page-wide locking
- kept dirty-draft guards intact for profile and resume workspace flows so broader button freedom does not lose local edits
- refreshed queue-selection UI harnesses to match the current Shortlisted checkbox semantics

## Latest Evidence

- no remaining `actionState.busy` usage exists in the desktop renderer or controller code
- desktop package validation is green with scoped pending helper tests and button pending-state tests passing
- `ui:resume-workspace-dirty`, `ui:apply-queue-controls`, `ui:applications-recovery`, and `ui:applications-queue-recovery` all completed successfully against the built desktop app

## Validation

- `pnpm validate:desktop`
- `pnpm validate:package job-finder`
- `pnpm --filter @unemployed/desktop ui:resume-workspace-dirty`
- `pnpm --filter @unemployed/desktop ui:apply-queue-controls`
- `pnpm --filter @unemployed/desktop ui:applications-recovery`
- `pnpm --filter @unemployed/desktop ui:applications-queue-recovery`

## What It Means Now

- scoped pending lanes and clearer disabled/in-progress feedback are part of the current Job Finder desktop baseline
- reopen this area only for a concrete control-locking regression, a newly observed unsafe concurrent mutation, or a stronger page-specific pending UX improvement backed by fresh real-app evidence
