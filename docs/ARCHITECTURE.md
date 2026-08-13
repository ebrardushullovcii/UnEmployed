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
- reusable provider adapters currently include public Ashby board ingestion and exact-job Workday candidate-experience ingestion; they normalize provider payloads into shared discovery contracts without adding board-specific workflow policy
- `pnpm source-generic:check` guards the browser/discovery boundary
- interview conversation/session state belongs to `interview-helper`; Electron media permissions and optional overlay windows stay in desktop adapters, while reusable OS capture/hotkey policy belongs to `os-integration`
- native helpers are a last resort and must stay behind `packages/os-integration`

See [ADR 0007](adr/0007-source-generic-browser-workflows.md) for the source-generic browser decision.

## Main Flows

- desktop: renderer -> preload -> Electron main -> package services
- resume import: desktop ingress -> parser/text/vision branches -> review candidates -> accepted canonical writes
- discovery/apply: `job-finder` orchestrates, `browser-agent` executes bounded discovery policy, and `browser-runtime` owns sessions plus the generic prepare-only form driver
- product actions: schema-validated local tools call a narrow injected subset of the `job-finder` workspace service. They never expose raw IPC, browser primitives, arbitrary navigation, or filesystem access; proposal-only Profile Copilot calls persist reviewable patch groups without applying them
- source-debug: `job-finder` orchestrates phases and artifacts, `browser-agent` returns structured attempts, `db` persists runs and evidence
- browser visual evidence: `browser-runtime` owns screenshot capture and cleanup; `browser-agent` owns generic trigger policy and interpretation; `job-finder` persists only schema-validated summaries
- interview live session: visible chat/audio UI -> typed preload -> Electron main-hosted `interview-helper` service -> typed AI/audio/screenshot adapters -> visible responses, source-labeled transcript, and post-session review
- generative AI: domain services -> a small product-specific agent harness -> `packages/ai-providers` -> OpenCode Go. DeepSeek V4 Flash handles normal text/tool work through Chat Completions with requested `max` reasoning; GPT-5.6 Luna handles image-only work through Responses with `high` reasoning. The harness gives the model narrow typed read/write/validate tools over a temporary task transaction, records every call, and separates direct work, correction, validation, fallback, and final product output. Domain code still owns canonical state and user-review rules. Local Codex bridges remain replaceable loopback development transports. Audio transcription stays a separate local Whisper or explicit audio-model role.

## Resume Safety

- tailored mode requires a current approved resume export before apply; original-CV mode requires the imported source file to remain available on disk
- browser apply runtimes receive one typed application-resume artifact whose source is either `tailored_export` or `original_upload`; orchestration must not fabricate a tailored export for an original file
- stale drafts cannot be used as approved exports
- every canonical experience remains represented in the editor even when excluded from recruiter-facing output
- prepare-only browser execution must keep `submitAuthorized: false`, treat ambiguous/final controls as stop points, and never infer submit permission from an apply mode
- prepare-only browser execution installs page and network mutation guards before filling fields. A separate `intermediateMutationsAuthorized` capability may allow autosave/draft/non-final ATS traffic, but it never permits DOM form submission, `requestSubmit`, or a final-control click; omitted authorization remains false
- exact provider job URLs are prioritized before per-source collection caps so a configured vacancy cannot silently degrade into an unrelated board result
- authentication remains owned by the dedicated browser profile. The app may open a source and persist a human-action prompt, but it must not receive credentials or infer that authentication succeeded merely because the browser launched; the user explicitly confirms sign-in before a source-scoped retry
- staleness rules live in `packages/job-finder/src/internal/resume-workspace-staleness.ts`

## Interview Capture Protection

Interview Helper defaults to the ordinary visible main window. Advanced overlay windows and global/tray controls initialize only when `UNEMPLOYED_INTERVIEW_ADVANCED_SURFACES=1`. When enabled, overlay capture exclusion remains adapter-owned capability state: Electron `BrowserWindow.setContentProtection(true)` is a request, while real platform-specific verification and any future authorized stronger capture-exclusion path must stay behind `packages/os-integration`.

See [ADR 0003](adr/0003-interview-helper-live-session-architecture.md) and [ADR 0008](adr/0008-visible-first-interview-helper.md).

See [ADR 0009](adr/0009-luna-high-default-and-capability-contracts.md) for configured model routing and the contract-first AI boundary.

## Known Debt

- keep watching for any `browser-runtime` dependency on `browser-agent`; runtime should stay lower-level than workflow policy
- the generic application-preparation state machine currently lives in `browser-runtime`; move orchestration policy upward if it expands beyond reusable form/session mechanics
- remaining source-named discovery debt from the browser substrate evaluation must not expand to other sources
