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
- Current Job Finder flow uses `packages/ai-providers` for structured resume extraction, fit assessment, and tailoring, `apps/desktop` for local resume ingestion/extraction plus template-file rendering, and `packages/browser-runtime` for switching between deterministic catalog fixtures and a dedicated Chrome-profile LinkedIn browser agent connected over CDP
- The next discovery refactor should move source-specific browser behavior behind discovery adapters, keep `packages/browser-agent` generic through policy/config injection, replace the single discovery browser-session assumption with adapter-scoped session state, add a raw-event-to-user-event translation layer plus retained discovery timeline, and ship sequential multi-target orchestration before any bounded parallel discovery work; `generic_site` remains in scope as an explicitly experimental adapter on top of that foundation
