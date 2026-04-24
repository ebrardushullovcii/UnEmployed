# Testing

## Default Checks

- broad repo check: `pnpm verify`
- fast preflight: `pnpm verify:quick`
- affected-only check: `pnpm verify:affected`
- docs/guidance only: `pnpm validate:docs-only`
- package-local validation: `pnpm validate:package <package-name|alias|path>`
- source-generic guard: `pnpm source-generic:check`
- formatting: `pnpm format`, `pnpm format:check`
- dead-code cleanup: `pnpm knip`

## Pick Checks

| Change | Prefer |
| --- | --- |
| docs or agent guidance only | `pnpm validate:docs-only` |
| package-local code | `pnpm validate:package <alias>` first, then broader checks only if risk warrants |
| contracts or IPC | `pnpm validate:contracts` plus affected package typecheck |
| discovery/source-debug | `pnpm source-generic:check` plus focused package tests |
| desktop UI | `pnpm validate:desktop` plus the matching UI harness |
| broad cross-package behavior | `pnpm verify:affected` or `pnpm verify` |

Common package aliases:

- `pnpm validate:desktop`
- `pnpm validate:job-finder`
- `pnpm validate:browser-agent`
- `pnpm validate:browser-runtime`
- `pnpm validate:contracts`

## Stop Rules

- Do not run `pnpm verify` for docs-only or guidance-only changes.
- Do not rerun a broad failing command unchanged; isolate the failing package or command first.
- If a failure is documented as pre-existing and unrelated, report it once and switch to focused validation.
- Current known unrelated blocker: root `pnpm lint` can fail on `packages/browser-runtime/src/playwright-browser-runtime.test.ts`; use focused package lint plus docs/typecheck checks unless your task touches that file.
- Rebuild desktop before judging benchmark/source changes because `apps/desktop/scripts/benchmark-job-finder-app.mjs` launches `out/main/index.cjs`.

## Guidance Checks

- `pnpm validate:docs-only` after shared guidance, skill, doc, or link changes

## Structure Checks

- `pnpm structure:check` for large-file and hotspot warnings
- `pnpm hotspots` for the biggest files and concentration areas

## Source-Generic Discovery Guard

- `pnpm source-generic:check` rejects source-branded helper declarations in shared discovery/browser-agent workflow code
- focused coverage includes `packages/browser-agent/src/agent/search-results-budget.test.ts`

## Desktop Core

- `pnpm desktop:dev`
- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop typecheck`
- `pnpm --filter @unemployed/desktop lint`

## Desktop UI Harnesses

- `pnpm --filter @unemployed/desktop ui:capture`
- `pnpm --filter @unemployed/desktop ui:resume-import`
- `pnpm --filter @unemployed/desktop ui:profile-setup`
- `pnpm --filter @unemployed/desktop ui:profile-baseline`
- `pnpm --filter @unemployed/desktop ui:profile-copilot-preferences`
- `pnpm --filter @unemployed/desktop ui:resume-workspace`
- `pnpm --filter @unemployed/desktop ui:resume-workspace-dirty`
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

- replay with `pnpm --filter @unemployed/desktop benchmark:resume-import`
- corpus is declared in `apps/desktop/src/main/services/job-finder/resume-import-benchmark.ts`
