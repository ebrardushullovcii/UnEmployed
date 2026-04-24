# Testing

## Default Checks

- broad repo check: `pnpm verify`
- fast preflight: `pnpm verify:quick`
- affected-only check: `pnpm verify:affected`
- formatting: `pnpm format`, `pnpm format:check`
- dead-code cleanup: `pnpm knip`

## Guidance Checks

- `pnpm agents:sync` after shared guidance or skill changes
- `pnpm agents:check` after agent-guidance changes
- `pnpm docs:check` after doc or link changes

## Structure Checks

- `pnpm structure:check` for large-file and hotspot warnings
- `pnpm hotspots` for the biggest files and concentration areas

## Desktop Core

- `pnpm desktop:dev`
- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop typecheck`
- `pnpm --filter @unemployed/desktop lint`

## Desktop UI Harnesses

- shell and theme review: `pnpm --filter @unemployed/desktop ui:capture`
- resume import: `pnpm --filter @unemployed/desktop ui:resume-import`
- guided setup: `pnpm --filter @unemployed/desktop ui:profile-setup`
- profile baseline: `pnpm --filter @unemployed/desktop ui:profile-baseline`
- profile copilot: `pnpm --filter @unemployed/desktop ui:profile-copilot-preferences`
- resume workspace: `pnpm --filter @unemployed/desktop ui:resume-workspace`
- dirty-state resume checks: `pnpm --filter @unemployed/desktop ui:resume-workspace-dirty`
- apply recovery and queue controls:
  - `pnpm --filter @unemployed/desktop ui:applications-copilot-review`
  - `pnpm --filter @unemployed/desktop ui:applications-recovery`
  - `pnpm --filter @unemployed/desktop ui:applications-queue-recovery`
  - `pnpm --filter @unemployed/desktop ui:apply-queue-controls`

## Safety Rules

- do not run live-site submit flows or final-submit QA unless the user explicitly re-authorizes it
- validate apply work with deterministic contracts, service tests, and desktop harnesses by default
- capture artifacts under `apps/desktop/test-artifacts/ui/`; they are QA output, not source files

## Resume Import Notes

- when import or parser routing changes, validate at least one plain-text path and one extracted-document path
- release packaging for the parser sidecar still needs target-OS validation per platform
