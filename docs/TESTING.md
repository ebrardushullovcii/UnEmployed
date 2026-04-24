# Testing

## Default Checks

- broad repo check: `pnpm verify`
- fast preflight: `pnpm verify:quick`
- affected-only check: `pnpm verify:affected`
- source-generic guard: `pnpm source-generic:check`
- formatting: `pnpm format`, `pnpm format:check`
- dead-code cleanup: `pnpm knip`

## Guidance Checks

- `pnpm agents:sync` after shared guidance or skill changes
- `pnpm agents:check` after agent-guidance changes
- `pnpm docs:check` after doc or link changes

## Structure Checks

- `pnpm structure:check` for large-file and hotspot warnings
- `pnpm hotspots` for the biggest files and concentration areas

## Source-Generic Discovery Guard

- `pnpm source-generic:check` rejects source-branded helper declarations in shared discovery and browser-agent workflow code
- `packages/browser-agent/src/agent/search-results-budget.test.ts` covers seeded-query review widening, weak same-host widening, provider-board non-widening, phase-driven runs, and small discovery targets
- run the full surfaces with `pnpm verify`, `pnpm verify:quick`, or `pnpm verify:affected`; run the focused guard directly with `pnpm source-generic:check`

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

Track-specific validation and product-bar requirements live in the handoff layer: `docs/STATUS.md`, `docs/TRACKS.md`, and the active plan under `docs/exec-plans/active/`.

## Resume Import Notes

- when import or parser routing changes, validate at least one plain-text path and one extracted-document path
- release packaging for the parser sidecar still needs target-OS validation per platform

## Resume-Import Benchmark

- `019` established the current resume-import quality baseline with benchmarked local import quality and a replayable benchmark corpus
- canonical corpus: `apps/desktop/test-fixtures/job-finder/resume-import-sample.txt` and `docs/resume-tests/Ebrar.pdf`, declared in `apps/desktop/src/main/services/job-finder/resume-import-benchmark.ts`
- baseline metrics are emitted per run as literal-field precision/recall, experience-record F1, education-record F1, evidence coverage, auto-apply precision, and unresolved rate; the deterministic canary is expected to pass all declared literal fields and required experience records
- replay from the desktop harness with `pnpm --filter @unemployed/desktop benchmark:resume-import`; the UI harness entry point is `pnpm --filter @unemployed/desktop ui:resume-import`
- benchmark output is a `ResumeImportBenchmarkReport` containing aggregate metrics, case results, parser strategy, taxonomy notes, and pass/fail state
