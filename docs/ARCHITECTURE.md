# Architecture

## Workspaces

- `apps/desktop`: Electron main, preload, renderer
- `packages/contracts`: schemas, DTOs, typed IPC
- `packages/core`: small shared helpers and result types
- `packages/db`: persistence and repository boundaries
- `packages/knowledge-base`: ingestion, chunking, retrieval
- `packages/browser-runtime`: browser lifecycle and generic automation primitives
- `packages/browser-agent`: browser workflow policy, prompts, tool use, structured outputs
- `packages/job-finder`: discovery, source-debug, resume, apply orchestration
- `packages/interview-helper`: prep, live session, transcript, cues
- `packages/ai-providers`: provider interfaces and adapters
- `packages/os-integration`: tray, hotkeys, windows, capture-policy adapters
- `packages/testing`: fixtures, fakes, harness helpers

## Boundary Rules

- renderer talks to Electron main through typed preload APIs only
- cross-package contracts live in `packages/contracts`
- package public APIs are the only supported import surface
- `browser-runtime` stays generic; site or workflow policy belongs higher
- `job-finder` core discovery stays source-generic; do not add per-board route builders, query maps, triage overrides, or policy branches that only make sense for one job source
- source-specific code is only acceptable in two places:
  - standard reusable provider adapters such as public ATS APIs
  - contained `browser-agent` extraction or navigation handling when a DOM quirk is unavoidable and proven
- prefer evidence-driven route reuse, stronger agent instructions, and generic heuristics over codifying board-specific rules; if a behavior does not generalize, leave it to the agent instead of hardcoding it
- `pnpm source-generic:check` guards this boundary by rejecting source-branded helper declarations in shared discovery and browser-agent workflow code
- interview overlay state belongs to `interview-helper`; window lifecycle belongs to `os-integration`
- native helpers are a last resort when Electron APIs are insufficient
- native code stays behind `packages/os-integration`, not directly in renderer or unrelated package flows
- document every native addition here and in the relevant module or platform doc

## Main Flows

- desktop: renderer -> preload -> Electron main -> package services
- resume import: desktop ingress -> parser routing -> import artifacts -> accepted canonical writes
- discovery/apply: `job-finder` orchestrates, `browser-agent` executes bounded policy, `browser-runtime` owns sessions
- source-debug: `job-finder` orchestrates phases and artifacts, `browser-agent` returns structured attempts, `db` persists runs and evidence

## Known Debt

- active work still needs to remove the catalog-session seam where `browser-runtime` depends on `browser-agent`
- active `017` work introduced LinkedIn-specific core discovery policy in `job-finder`; that is now explicit cleanup debt and must not expand to other sources
