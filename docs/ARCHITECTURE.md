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
- `packages/interview-helper`: interview prep/session package boundary and overlay-facing helpers
- `packages/ai-providers`: provider interfaces and adapters for chat, vision, and embeddings
- `packages/os-integration`: tray, hotkeys, windows, and platform adapters
- `packages/testing`: fixtures, fakes, harness helpers

## Boundary Rules

- renderer talks to Electron main through typed preload APIs only
- cross-package contracts live in `packages/contracts`
- package public APIs are the only supported import surface
- `browser-runtime` stays generic; site or workflow policy belongs higher
- `job-finder` discovery and source-debug stay source-generic; do not add per-board route builders, query maps, triage overrides, or policy branches that only make sense for one job source
- source-specific code is acceptable only for reusable provider adapters or contained `browser-agent` extraction/navigation quirks
- `pnpm source-generic:check` guards the browser/discovery boundary
- native helpers are a last resort and must stay behind `packages/os-integration`

See [ADR 0007](adr/0007-source-generic-browser-workflows.md) for the source-generic browser decision.

## Main Flows

- desktop: renderer -> preload -> Electron main -> package services
- resume import: desktop ingress -> parser/text/vision branches -> review candidates -> accepted canonical writes
- discovery/apply: `job-finder` orchestrates, `browser-agent` executes bounded policy, `browser-runtime` owns sessions
- source-debug: `job-finder` orchestrates phases and artifacts, `browser-agent` returns structured attempts, `db` persists runs and evidence
- browser visual evidence: `browser-runtime` owns generic screenshot capture and local retention cleanup only; `browser-agent` owns source-generic visual trigger policy and structured interpretation; `job-finder` persists only schema-validated evidence/checkpoint summaries and explicitly opts apply runs into visual checkpoints when safe

## Resume Safety

- approved resume exports must be current before apply
- stale drafts cannot be used as approved exports
- staleness rules live in `packages/job-finder/src/internal/resume-workspace-staleness.ts`

## Native Helpers

- native helpers live behind `packages/os-integration`
- native additions require both this architecture entry and the relevant module or platform documentation

## Known Debt

- keep watching for any `browser-runtime` dependency on `browser-agent`; runtime should stay lower-level than workflow policy
- remaining source-named discovery debt from the browser substrate evaluation must not expand to other sources
