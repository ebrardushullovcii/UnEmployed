# Architecture

## Workspaces

- `apps/desktop`: Electron shell, preload bridge, React renderer
- `packages/contracts`: schemas, enums, DTOs, typed IPC contracts
- `packages/core`: shared result types and small cross-cutting helpers
- `packages/db`: local persistence and repository boundaries
- `packages/knowledge-base`: ingestion, chunking, retrieval, search
- `packages/browser-runtime`: browser session lifecycle and automation primitives
- `packages/job-finder`: discovery, drafting, apply workflow orchestration
- `packages/interview-helper`: prep, live session, transcript, cue generation
- `packages/ai-providers`: provider interfaces and adapters
- `packages/os-integration`: tray, hotkeys, overlay window lifecycle, and window/capture policy adapters
- `packages/testing`: fake providers, fixtures, and integration harnesses

## Architectural Rules

- UI talks to Electron main only through typed preload APIs.
- Shared contracts are defined once in `packages/contracts`.
- Package public APIs are the only supported import surface.
- External IO must be schema-validated at the boundary.
- Agent handoff state lives in docs, not in chat history.
- Interview overlay state belongs to `packages/interview-helper`; platform window behavior belongs to `packages/os-integration`.

## Near-Term Foundation

- Establish the monorepo, canonical docs, and validation commands
- Keep module packages thin until real workflows land
- Grow package internals behind stable contracts instead of letting the app become a direct-import mesh
- Current Job Finder flow uses `packages/ai-providers` for structured resume extraction, fit assessment, and tailoring, `apps/desktop` for local resume ingestion/extraction plus template-file rendering, and `packages/browser-runtime` for switching between deterministic catalog fixtures and a dedicated Chrome-profile browser agent connected over CDP
- Job Finder discovery now runs through discovery adapters, keeps `packages/browser-agent` generic through policy/config injection, uses adapter-scoped session state instead of a single browser-session assumption, translates raw browser/runtime progress into retained user-facing discovery events, and executes multi-target discovery sequentially by default; the UI now treats targets as generic site entrypoints while adapter resolution stays internal to the runtime
- Job Finder source bootstrap now follows an orchestrator-worker model: `packages/job-finder` owns the sequential source-debug run, phase handoff, artifact synthesis, apply-path probing, and replay verification, while `packages/browser-agent` keeps raw worker transcripts ephemeral and returns structured attempt metadata plus compaction snapshots instead of feeding full chat history back into the orchestrator
- The sequential phase runner now lives in a reusable orchestrator helper inside `packages/job-finder`, so the same artifact-first orchestration pattern can be reused for future debugging, verification, or agent-coordination flows without re-embedding another large phase loop in a service method
- Source-debug persistence is no longer folded into the single discovery-state blob alone; dedicated repository collections now retain source-debug runs, attempts, evidence refs, and instruction artifacts while the workspace snapshot keeps only lightweight active/recent summaries for the UI
- Approved browser apply now forwards validated learned source guidance into the browser runtime, so the supported apply path can carry the same orchestrator-produced instructions without widening into unsafe generic auto-submission
