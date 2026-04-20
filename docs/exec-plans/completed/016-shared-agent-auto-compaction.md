# 016 Shared Agent Auto Compaction

Status: completed

Completed on `2026-04-19`.

This plan shipped the shared execution-time prompt compaction baseline for long-running agent workflows. Discovery and source-debug now protect themselves from prompt growth with one reusable policy surface, while the current deterministic apply execution path stays intentionally unchanged.

## Final Implementation Summary

- Shared contracts now define reusable compaction policy, compaction snapshot, and handoff-mode surfaces instead of leaving compaction as browser-agent-local behavior. Discovery metadata and target-execution summaries also expose lightweight compaction telemetry, and provider status now includes nullable `modelContextWindowTokens` so effective budgets can follow the active model window.
- Browser-agent live discovery now uses token-budget-first compaction whenever token estimation or model-window metadata is available, falls back to message-count thresholds when estimation is unavailable, preserves coherent assistant/tool exchanges during repeated compaction, and fails closed with a normalized context-budget reason before making an oversized provider call. The current shared defaults are tuned around the live 196k provider limit, so compaction now starts near the real window instead of the older 120k/150k-era thresholds.
- Browser-runtime discovery options now pass shared compaction policy and capability inputs without leaking browser-agent-specific naming, and discovery persistence keeps only lightweight compaction evidence rather than hidden transcripts.
- Source-debug workers now use the shared compaction policy path for their per-phase overrides, and final review can downgrade to `summary_first` handoff mode so repeated phase contexts still fit in smaller model windows without dropping the phase facts, blocker notes, evidence, or compaction summaries needed downstream. Those worker thresholds are now aligned near the same 196k runtime window unless a smaller model window is reported at runtime.
- A shared handoff-compaction helper now exists for later `015` apply workers; that apply track remains separately active and intentionally adopts this seam later rather than inside `016`. Current deterministic `approveApply(jobId)` and `executeEasyApply()` behavior therefore remain unchanged in this plan.

## Acceptance Criteria

- shared compaction is no longer browser-agent-only -> pass -> `packages/contracts/src/agent-compaction.ts`, `packages/contracts/src/discovery.ts`, and `packages/contracts/src/source-debug.ts` now define reusable policy, snapshot, and handoff contracts consumed across discovery and source-debug paths.
- browser-agent uses token-first compaction with fallback -> pass -> `packages/browser-agent/src/agent/conversation.ts`, `packages/browser-agent/src/agent/discovery.ts`, and `packages/browser-agent/src/agent-compaction.test.ts` now cover token-budget compaction, message-count fallback, coherent tool-pair preservation, and normalized over-budget failure.
- runtime and discovery expose lightweight compaction metadata -> pass -> `packages/browser-runtime/src/runtime-types.ts`, `packages/browser-runtime/src/playwright-browser-runtime.ts`, `packages/job-finder/src/internal/workspace-discovery-methods.ts`, and `apps/desktop/src/renderer/src/features/job-finder/screens/discovery/discovery-history-utils.ts` now plumb and render typed target-execution compaction metadata without persisting raw worker transcripts.
- source-debug workers and final review use the shared path -> pass -> `packages/job-finder/src/internal/workspace-source-debug-workflow.ts`, `packages/job-finder/src/internal/source-instruction-review.ts`, and `packages/job-finder/src/workspace-service.source-debug.review.test.ts` now cover shared worker overrides plus summary-first final-review handoff behavior.
- future apply workers have a reusable seam without changing current deterministic apply execution -> pass -> `packages/job-finder/src/internal/shared-agent-handoff-compaction.ts` and `packages/job-finder/src/internal/shared-agent-handoff-compaction.test.ts` provide the apply-ready reusable seam while leaving current apply runtime semantics unchanged.

## Verification Evidence

Validated in the completion pass:

- `pnpm verify`
- `pnpm --filter @unemployed/contracts test`
- `pnpm --filter @unemployed/browser-agent test`
- `pnpm --filter @unemployed/browser-runtime test`
- `pnpm --filter @unemployed/job-finder test`
- `pnpm docs:check`

Notes:

- `pnpm verify` now passes clean across lint, typecheck, and the full root Vitest suite.
- The root test suite still intentionally skips `scripts/benchmark-013-live.test.ts` unless the live benchmark env flag is enabled; that skip is expected and does not block plan completion.

## Notes For Follow-On Planning

- `015` should reuse the shared handoff-compaction seam only when apply workers become genuinely transcript-heavy; do not retrofit fake agent loops into the current deterministic apply path just to use the helper.
- Keep compaction focused on execution-time workflow prompts and typed handoffs. Do not widen this work into a generic user-visible chat-history archive.
- If later model providers expose stronger token-estimation or context-window metadata, prefer improving the shared capability inputs rather than adding more workflow-local threshold logic.
