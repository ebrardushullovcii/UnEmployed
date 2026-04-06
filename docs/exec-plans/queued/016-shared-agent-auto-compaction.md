# 016 Shared Agent Auto Compaction

Status: ready

This is a small prepared follow-on plan. It captures the shared compaction work needed so long-running agent workflows do not degrade or fail just because their working conversation grows too large.

## Goal

Add a shared auto-compaction policy that all long-running agent workflows and orchestrators can use when their conversation grows too large.

The initial target is:

- auto-compact around a configurable token budget
- default near `150_000` tokens when model and provider limits make that sensible
- keep the threshold configurable per workflow and per user or app settings when needed

## Current State

The repo already has partial worker-side transcript compaction in `packages/browser-agent`.

Current evidence:

- `packages/browser-agent/src/agent/conversation.ts`
- `packages/browser-agent/src/types.ts`
- `docs/exec-plans/completed/005-job-source-debug-agent.md`

What exists today:

- message-count-based compaction for the browser agent
- preservation of coherent assistant and tool-call exchanges
- persisted compaction metadata for source-debug-style runs

What is still missing:

- token-budget-based compaction instead of only message-count thresholds
- a shared compaction policy all agent workflows can consume
- clear settings ownership for default thresholds and per-workflow overrides
- orchestrator-level rules for when and how compaction summaries get handed from one long-running phase to the next

## Product Direction

- Any long-running agent workflow should be allowed to compact itself before the model context becomes risky.
- The compaction policy should be shared, not re-implemented independently in each agent.
- Token budget should be the primary trigger when token estimates are available.
- Message-count fallback is acceptable when exact token estimates are not available for a provider path.
- The compaction threshold should be configurable in settings.
- Workflows may still set narrower local overrides when their prompts are unusually heavy or their models have smaller context windows.

## Locked Decisions

- Do not keep raw full transcripts forever in active model context when a summarized state will do.
- Do preserve coherent tool-call context so the model does not resume from broken assistant or tool message fragments.
- Do preserve sticky workflow instructions, safety requirements, and any still-active manual prerequisite state.
- Do keep compaction summaries typed enough that orchestrators can reason about them later.
- Do not make the whole feature browser-agent-only; discovery, source-debug, apply, and future copilot flows should be able to share it.

## Scope

### In Scope

- shared compaction policy and settings shape
- token-budget trigger with fallback heuristics
- common summary payload expectations
- orchestrator handoff expectations for compacted runs
- visibility for compaction count and last compacted time where useful

### Out Of Scope

- retaining every raw token forever for replay inside the active prompt
- building a fully generic chat history product unrelated to workflow execution
- forcing one exact compaction threshold on every provider and model forever

## Recommended Design

### 1. Shared compaction settings

Add a shared settings shape that can express:

- `enabled`
- `targetTokenBudget`
- `warningTokenBudget`
- `preserveRecentMessages`
- `maxToolPayloadChars`
- optional workflow overrides

Default recommendation:

- start with a configurable default around `150_000` tokens
- keep room below provider hard limits rather than compacting only at the point of failure

### 2. Shared summary contract

The shared compaction summary should preserve at least:

- compacted at timestamp
- compaction count
- workflow summary
- confirmed facts
- blocker or warning notes
- preserved active context
- any sticky safety or approval state that the workflow still depends on

### 3. Trigger behavior

Compaction should trigger when:

- estimated token usage exceeds the warning or target budget
- or message-count fallback exceeds a workflow-specific safe threshold

Preferred behavior:

- compact proactively before provider rejection
- allow repeated compaction during long runs

### 4. Workflow coverage

The first pass should explicitly cover:

- browser-agent discovery runs
- source-debug phase workers
- future apply copilot or auto-apply workers
- any orchestrator-managed multi-phase flow that passes growing conversation state across long runs

## Workstreams

### 1. Shared settings and contract design

- define a reusable compaction settings shape
- define a reusable compaction summary shape or shared base

### 2. Token estimation and fallback strategy

- choose how to estimate tokens per provider path
- keep message-count fallback for cheap or unsupported paths

### 3. Workflow integration

- replace browser-agent-only thresholds with the shared settings path where appropriate
- ensure orchestrators preserve the compacted summary and active context cleanly

### 4. Observability

- expose compaction count and last compacted time in debug or run metadata where useful
- leave enough evidence for QA to confirm compaction happened without storing raw hidden chat forever

## Milestones

### Milestone 1: Shared contract and settings

- one shared compaction settings path exists

### Milestone 2: Token-budget compaction for browser-agent flows

- existing browser-agent compaction uses the shared settings path and can trigger from token estimates

### Milestone 3: Cross-workflow rollout

- the same compaction policy is usable by other long-running agent workflows and orchestrators

## Verification Expectations

Implementation work for this plan should be validated with at least:

- `pnpm --filter @unemployed/contracts test`
- `pnpm --filter @unemployed/browser-agent test`
- `pnpm --filter @unemployed/job-finder test`
- `pnpm docs:check`

Additional completion rule:

- leave behind at least one test or harness path that proves repeated compaction can happen during a long workflow without losing required safety or tool-call context

## Notes For A Deeper Follow-On Plan

- Decide whether compaction settings belong in global `Job Finder` settings, per-workflow settings, or both.
- Decide whether the app should expose only a simple `Auto compact long runs` toggle plus advanced settings behind a secondary surface.
- Decide whether token estimation should be provider-specific or use one approximate tokenizer path with safety margin.
