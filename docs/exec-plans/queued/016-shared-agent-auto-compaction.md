# 016 Shared Agent Auto Compaction

Status: ready

This plan is now execution-ready. It is a reusable enabler for long-running agent workflows that accumulate too much active prompt state, not a generic end-user chat-history feature.

## Goal

- Add one shared compaction policy that long-running agent workflows can reuse before provider context limits, latency, or quality degradation become the next blocker.
- Make token budget the primary trigger when token estimation is available.
- Keep a message-count fallback for runtimes that cannot estimate tokens yet.
- Cover the actual long-running flows in this repo first: browser-agent live discovery turns, source-debug phase workers, source-debug final review handoff, and future apply-worker loops introduced by plan `015`.

## Why This Work Exists

- `packages/browser-agent/src/agent/conversation.ts` already compacts live worker prompts, but only with message-count thresholds and browser-agent-local config.
- The default browser-agent thresholds are still `18` transcript messages, `8` preserved recent messages, and `240` tool payload chars.
- Source-debug overrides those thresholds per phase to `16`, `6`, and `180` in `packages/job-finder/src/internal/workspace-source-debug-workflow.ts`.
- Discovery target workers can run up to `50` steps per target in `packages/job-finder/src/internal/workspace-discovery-methods.ts`.
- Source-debug is the longest current transcript-heavy path: six sequential phases with a total configured step ceiling of `110` worker steps in `packages/job-finder/src/internal/workspace-service-helpers.ts`.
- Source-debug final review currently consumes rich per-phase contexts that include compaction summaries and full `reviewTranscript` payloads in `packages/job-finder/src/internal/source-instruction-review.ts`.
- Current `approveApply(jobId)` and `executeEasyApply()` paths are still deterministic and checkpoint-based, so apply is not yet a heavy transcript consumer. This plan should prepare the shared seam that plan `015` can reuse when apply becomes transcript-heavy.

## Product Boundary

- This plan is about protecting long workflow execution surfaces from prompt growth.
- This plan is not a generic chat-history retention system.
- This plan does not add a broad user-facing transcript archive or rewrite the resume assistant chat model.
- This plan does not require current deterministic apply paths to become agentic before plan `015` is ready.

## Current Code Starting Points

- Live browser-agent transcript state and compaction: `packages/browser-agent/src/agent.ts`, `packages/browser-agent/src/agent/conversation.ts`, `packages/browser-agent/src/types.ts`
- Runtime plumbing for agent discovery options and returned metadata: `packages/browser-runtime/src/runtime-types.ts`, `packages/browser-runtime/src/playwright-browser-runtime.ts`
- Multi-target discovery orchestration: `packages/job-finder/src/internal/workspace-discovery-methods.ts`
- Source-debug sequential phase orchestration and current compaction override: `packages/job-finder/src/internal/workspace-source-debug-workflow.ts`
- Source-debug final review payload construction: `packages/job-finder/src/internal/source-instruction-review.ts`, `packages/job-finder/src/internal/source-instruction-types.ts`
- Current compaction metadata contract, still source-debug-shaped: `packages/contracts/src/source-debug.ts`, `packages/contracts/src/discovery.ts`

## Locked Decisions

- Shared compaction is a workflow-execution concern, not a browser-runtime primitive and not a renderer concern.
- Token budget is the primary trigger whenever the runtime can provide token estimation or model-window metadata.
- Message-count thresholds remain the fallback only when token estimation is unavailable or explicitly disabled.
- Compaction applies to active prompt payloads and orchestrator handoff payloads, not to every stored transcript-like artifact in the product.
- Coherent assistant and tool-call exchanges must remain intact after compaction.
- Sticky instructions, safety constraints, manual prerequisite state, and phase-goal state must survive compaction.
- Raw full transcripts should not be reintroduced into active prompts once a typed summary is enough.
- Current deterministic `approveApply(jobId)` and `executeEasyApply()` behavior stays unchanged in this plan; the shared seam is for later transcript-heavy apply workers.
- Prefer a minimal failure model: if compaction still cannot fit the workflow into budget, use the workflow's existing failure channel with a normalized reason instead of inventing a broad new product state only for this plan.

## Shared Design

### Shared Policy And Metadata

- Add a shared compaction policy contract in `packages/contracts` for any long-running agent workflow.
- The shared policy should cover:
- `enabled`
- `warningTokenBudget`
- `targetTokenBudget`
- `minimumResponseHeadroomTokens`
- `preserveRecentMessages`
- `minimumPreserveRecentMessages`
- `maxToolPayloadChars`
- `messageCountFallbackThreshold`
- optional workflow overrides
- Add a shared compaction snapshot contract that replaces the current source-debug-only framing for reusable consumers.
- The shared snapshot should preserve at least:
- `compactedAt`
- `compactionCount`
- `triggerKind` as `token_budget` or `message_count_fallback`
- `estimatedTokensBefore` when available
- `estimatedTokensAfter` when available
- `summary`
- `confirmedFacts`
- `blockerNotes`
- `avoidStrategyFingerprints`, preserved directly or mapped into an equivalent repeated-attempt avoidance signal
- `preservedContext`
- any sticky workflow state the next turn still depends on

### Effective Budget Rules

- Default `targetTokenBudget` should start at `150_000` tokens.
- Default `warningTokenBudget` should start at `120_000` tokens.
- Default `minimumResponseHeadroomTokens` should start at `16_000` tokens.
- When the runtime knows the model context window, compute an effective target budget as the lower of:
- the configured `targetTokenBudget`
- the model context window minus `minimumResponseHeadroomTokens`
- When the runtime knows the model context window, compute an effective warning budget as the lower of:
- the configured `warningTokenBudget`
- the effective target budget
- When no model context window is known, use the configured token budgets directly.
- Keep workflow-level overrides available for narrower prompts or smaller-context models.

### Trigger Rules

- Estimate active prompt tokens before each model call for live worker loops.
- Estimate serialized prompt tokens before each orchestrator-level review call that bundles prior worker contexts.
- Trigger compaction proactively when the current estimated prompt is at or above the effective warning budget.
- Trigger compaction immediately when the next call is projected to cross the effective target budget.
- When token estimation is unavailable, trigger compaction from `messageCountFallbackThreshold` instead.
- Continue allowing repeated compaction during one run.
- After compaction, try to return below the effective warning budget rather than only barely under the target budget so the workflow does not compact every turn.

### Fallback Behavior

- Fallback step 1: run standard summary compaction while preserving coherent recent assistant and tool exchanges plus sticky workflow state.
- Fallback step 2: if the prompt is still above budget, reduce preserved recent messages down to `minimumPreserveRecentMessages` and compact again.
- Fallback step 3: if an orchestrator handoff payload is still above budget, switch that handoff to summary-first mode and drop full `reviewTranscript` payloads in favor of typed compaction summary, phase summary, confirmed facts, blocker notes, and the minimal active context needed downstream.
- Fallback step 4: if the workflow still cannot fit within the effective target budget, fail closed through the workflow's existing failure channel with a normalized reason string such as `Context budget exhausted after compaction.` rather than making a provider call expected to fail.
- Fallback step 5: for future queue-based apply workers, the failure handling should stay job-scoped where possible so one overgrown job can be skipped or paused without losing the entire run.

## Workflow Coverage

### First-Class Consumers In This Plan

- Browser-agent live discovery worker prompts in `packages/browser-agent`
- Source-debug phase workers in `packages/job-finder/src/internal/workspace-source-debug-workflow.ts`
- Source-debug final review prompt assembly in `packages/job-finder/src/internal/source-instruction-review.ts`

### Planned Consumers This Plan Must Prepare For

- Future apply-copilot, one-job auto-submit, and queue workers from plan `015`
- Any later orchestrator that passes growing typed phase context across multiple model calls

### Explicitly Out Of Scope For This Plan

- Resume assistant message history
- Generic UI chat history or exportable transcript products
- Persisting raw full browser-agent conversations for every run by default
- Reworking current deterministic `executeEasyApply()` behavior before plan `015`

## Ownership

- `packages/contracts`: owns the shared compaction policy and snapshot schemas plus any workflow metadata DTO changes.
- `packages/browser-agent`: owns token-aware prompt estimation, live conversation compaction, coherent tool-pair preservation, and reusable compaction helpers for transcript-bearing browser workers.
- `packages/browser-runtime`: owns passing model or provider context-window capabilities and workflow compaction options into browser-agent runs, then returning lightweight compaction metadata in runtime results.
- `packages/job-finder`: owns workflow-specific overrides, orchestrator handoff shaping, source-debug final review integration, persistence decisions for run metadata, and later apply-worker adoption.
- `apps/desktop`: only owns any debug-facing presentation if surfaced later. No general settings UI is required in the first implementation slice.

## Integration Points

### Browser-Agent Live Worker Loop

- Replace the browser-agent-local message-count-only policy with the shared policy.
- Keep the existing compacted summary behavior, coherent tool-pair preservation, and sticky forced-closeout handling as the base implementation.
- Preserve the current behavior that trims tool payload content before it enters the prompt.

### Browser Runtime

- Extend `AgentDiscoveryOptions` so runtime callers can pass shared compaction policy values without browser-agent-specific naming leakage.
- Add an optional runtime seam for token estimation capability or model-window metadata.
- Keep non-agent runtimes free to omit token estimation and rely on fallback thresholds.

### Multi-Target Discovery

- Keep per-target worker compaction local to each `runAgentDiscovery()` call.
- Persist lightweight compaction metadata for each target execution or discovery run summary so long-run QA can confirm whether compaction happened.
- Do not persist raw worker transcripts into discovery state.

### Source-Debug Phase Workers

- Move the current hard-coded per-phase override onto the shared policy path instead of leaving it as a browser-agent-specific object.
- Keep source-debug free to run tighter local thresholds than general discovery because its prompts are heavier and more evidence-oriented.
- Continue persisting compaction snapshot data on `SourceDebugWorkerAttempt` artifacts.

### Source-Debug Final Review Handoff

- Add a shared handoff compaction helper for downstream review prompts that bundle multiple prior phase contexts.
- Default the final review payload to summary-first mode once the assembled prompt reaches the effective warning budget.
- Keep full `reviewTranscript` lines only when they still fit within budget.
- Preserve phase goal, completion mode, completion reason, confirmed facts, blocker summary, attempted actions, phase evidence, and compaction snapshot even when full transcript lines are dropped.

### Future Apply Workers

- Expose the shared compaction helper in a way that plan `015` can reuse for apply-copilot, one-job auto-submit, and queue workflows.
- Keep current `approveApply(jobId)` and deterministic runtime submission untouched until those workers exist.

## Observability

- Return compaction metadata from transcript-bearing worker runs through existing runtime result metadata.
- Persist lightweight compaction evidence, not raw hidden chat, for the workflows that already retain run artifacts.
- At minimum, capture:
- `compactionCount`
- `lastCompactedAt`
- `triggerKind`
- `estimatedTokensBefore` and `estimatedTokensAfter` when available
- whether fallback message-count triggering was used
- whether handoff payloads were downgraded to summary-first mode
- Add one clear progress or debug event when compaction occurs, but rate-limit it so long runs do not spam activity logs.
- Multi-target discovery should surface compaction at the target-execution or run-summary level.
- Source-debug should keep attempt-level compaction visibility and final-review visibility when summary-first handoff is used.
- No new requirement in this plan should force persistence of raw full `reviewTranscript` payloads.

## Milestones

### Milestone 1: Shared Contract And Browser-Agent Core

- Land shared compaction policy and snapshot contracts.
- Add token-estimation and model-budget seams to the browser-agent path.
- Replace message-count-only compaction with token-first triggering plus fallback.
- Preserve current coherent tool-pair and forced-closeout behavior.

### Milestone 2: Runtime And Discovery Adoption

- Plumb shared compaction policy through browser-runtime discovery options.
- Keep existing discovery behavior stable when token estimation is unavailable.
- Record lightweight compaction metadata on discovery run artifacts.

### Milestone 3: Source-Debug Worker And Handoff Adoption

- Move source-debug per-phase overrides onto the shared policy.
- Add summary-first handoff compaction for source-debug final review.
- Prove that the six-phase source-debug flow still produces usable final instruction artifacts after repeated compaction.

### Milestone 4: Apply-Ready Reusable Surface

- Expose the shared helper seams that plan `015` can adopt for future apply workers.
- Leave current deterministic apply execution unchanged.

## Verification Expectations

- Run `pnpm verify`.
- Run `pnpm --filter @unemployed/contracts test`.
- Run `pnpm --filter @unemployed/browser-agent test`.
- Run `pnpm --filter @unemployed/browser-runtime test`.
- Run `pnpm --filter @unemployed/job-finder test`.
- Run `pnpm docs:check`.

## Required Test Coverage

- Browser-agent test: token-budget trigger compacts before provider rejection.
- Browser-agent test: message-count fallback still works when token estimation is absent.
- Browser-agent test: repeated compaction preserves coherent assistant and tool exchanges.
- Browser-agent test: sticky closeout or safety messages survive repeated compaction.
- Browser-agent test: over-budget failure uses the normalized failure reason instead of calling the provider with an oversized prompt.
- Source-debug test: multi-phase worker attempts still retain compacted summaries and final review can succeed after summary-first handoff.
- Discovery test: target execution or run metadata records that compaction occurred without persisting raw transcripts.
- Apply-prep test: shared compaction helper can be invoked from a non-discovery workflow seam even before full plan `015` lands.

## Completion Rules

- Shared compaction is no longer browser-agent-only in design or contracts.
- Long-running discovery and source-debug flows can trigger compaction from token budget when the runtime supports estimation.
- The same flows still work through a message-count fallback path when estimation is unavailable.
- Source-debug final review no longer depends on full `reviewTranscript` payloads always fitting into one prompt.
- The plan leaves behind a reusable seam for future apply workers without turning current deterministic apply into a fake agent loop.
- No generic chat-history feature is introduced as part of this plan.
