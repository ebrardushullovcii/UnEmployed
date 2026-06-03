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
- `packages/ai-providers`: provider interfaces and adapters for chat, vision, STT, and embeddings
- `packages/os-integration`: tray, hotkeys, windows, capture-policy adapters
- `packages/testing`: fixtures, fakes, harness helpers

## Boundary Rules

- renderer talks to Electron main through typed preload APIs only
- cross-package contracts live in `packages/contracts`
- package public APIs are the only supported import surface
- `browser-runtime` stays generic; site or workflow policy belongs higher
- `job-finder` discovery and source-debug stay source-generic; do not add per-board route builders, query maps, triage overrides, or policy branches that only make sense for one job source
- source-specific code is acceptable only for reusable provider adapters or contained `browser-agent` extraction/navigation quirks
- `pnpm source-generic:check` guards the browser/discovery boundary
- interview session state belongs to `interview-helper`; overlay windows, hotkeys, and OS capture details belong to `os-integration`
- native helpers are a last resort and must stay behind `packages/os-integration`

See [ADR 0007](adr/0007-source-generic-browser-workflows.md) for the source-generic browser decision.

## Main Flows

- desktop: renderer -> preload -> Electron main -> package services
- resume import: desktop ingress -> parser/text/vision branches -> review candidates -> accepted canonical writes
- discovery/apply: `job-finder` orchestrates, `browser-agent` executes bounded policy, `browser-runtime` owns sessions
- source-debug: `job-finder` orchestrates phases and artifacts, `browser-agent` returns structured attempts, `db` persists runs and evidence
- browser visual evidence: `browser-runtime` owns screenshot capture and cleanup; `browser-agent` owns generic trigger policy and interpretation; `job-finder` persists only schema-validated summaries
- interview live session: setup/review UI -> typed preload -> Electron main-hosted `interview-helper` service -> `os-integration` overlay/audio/screenshot/hotkey adapters -> overlay windows and post-session review

## Resume Safety

- approved resume exports must be current before apply
- stale drafts cannot be used as approved exports
- staleness rules live in `packages/job-finder/src/internal/resume-workspace-staleness.ts`

## Interview Capture Protection

Interview Helper overlay capture exclusion is modeled as adapter-owned capability state. Electron `BrowserWindow.setContentProtection(true)` is requested by desktop overlay windows today, while real platform-specific verification and any future authorized stronger capture-exclusion path must stay behind `packages/os-integration`.

See [ADR 0003](adr/0003-interview-helper-live-session-architecture.md).

## Known Debt

- keep watching for any `browser-runtime` dependency on `browser-agent`; runtime should stay lower-level than workflow policy
- remaining source-named discovery debt from the browser substrate evaluation must not expand to other sources
