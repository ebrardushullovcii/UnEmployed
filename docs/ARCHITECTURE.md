# Architecture

## Workspaces

- `apps/desktop`: Electron shell, preload bridge, React renderer
- `packages/contracts`: schemas, enums, DTOs, typed IPC contracts
- `packages/core`: shared result types and small cross-cutting helpers
- `packages/db`: local persistence and repository boundaries
- `packages/knowledge-base`: ingestion, chunking, retrieval, search
- `packages/browser-agent`: generic browser-worker prompts, tools, transcript compaction, tool policy, and site- or workflow-specific agent behavior including deterministic catalog workflow orchestration
- `packages/browser-runtime`: browser session lifecycle and generic automation primitives
- `packages/job-finder`: discovery, drafting, apply workflow orchestration
- `packages/interview-helper`: prep, live session, transcript, cue generation
- `packages/ai-providers`: provider interfaces and adapters
- `packages/os-integration`: tray, hotkeys, overlay window lifecycle, and window or capture policy adapters
- `packages/testing`: fake providers, fixtures, and integration harnesses

## Architectural Rules

- UI talks to Electron main only through typed preload APIs.
- Shared contracts are defined once in `packages/contracts`.
- Package public APIs are the only supported import surface.
- Package entrypoints such as `src/index.ts` should stay thin and mostly re-export internal modules instead of accumulating implementation.
- External IO must be schema-validated at the boundary.
- Agent handoff state lives in docs, not in chat history.
- Interview overlay state belongs to `packages/interview-helper`; platform window behavior belongs to `packages/os-integration`.

## Cross-Package Flows

- Desktop flow: renderer -> typed preload APIs -> Electron main -> package services.
- Resume and profile flow: `apps/desktop` handles local file ingress and desktop rendering concerns, `packages/job-finder` owns orchestration, `packages/ai-providers` normalizes model outputs, and `packages/db` persists the resulting state.
- Discovery and apply flow: `packages/job-finder` owns orchestration and adapter selection, `packages/browser-agent` owns bounded agent tasks, prompts, transcript compaction, tool policy, structured outputs, and deterministic catalog workflow orchestration such as filtering, eligibility gates, checkpoint shaping, and resume-usage rules, and `packages/browser-runtime` owns browser session lifecycle and generic automation primitives.
- Source-debug flow: `packages/job-finder` owns phase orchestration, artifact synthesis, and replay verification; `packages/browser-agent` keeps worker transcripts ephemeral, owns prompt and tool policy, and returns structured schema-validated attempt data; `packages/db` retains durable run and artifact records while workspace snapshots keep only lightweight UI summaries.
- Renderer and Electron surfaces should consume `packages/browser-agent` only through typed higher-level package APIs or runtime seams; they should not depend on browser-agent internals directly.
- Interview flow: `packages/interview-helper` owns prep and live-session state, while `packages/os-integration` owns tray, hotkeys, overlay window lifecycle, and platform-specific capture policy.
