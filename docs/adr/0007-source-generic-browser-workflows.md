# Source-Generic Browser Workflows

Status: accepted

Users configure which job sources run; the product does not ship hardcoded board workflows. Discovery, source-debug, and safe apply should improve through source-generic browser runtime primitives, bounded workflow policy, typed evidence, and learned target instructions instead of hardcoding job-board-specific route builders or rescue logic in shared code. The completed browser substrate evaluation did not justify replacing the current managed browser stack, so future browser work should start from current-stack evidence and change substrate only when a concrete regression or capability gap proves the need.

## Considered Options

- Add board-specific route/query/triage helpers in `job-finder`: rejected because it makes every new source a code-maintenance problem and violates the product's generic discovery goal.
- Move workflow policy into `browser-runtime`: rejected because runtime must stay reusable and below product-specific browser behavior.
- Switch browser substrate preemptively: rejected because current evidence did not show enough benefit to justify migration risk.

## Consequences

- `packages/browser-runtime` stays generic.
- `packages/browser-agent` owns workflow policy, prompts, tool use, and structured outputs.
- `packages/job-finder` owns orchestration and persistence of schema-validated evidence.
- `pnpm source-generic:check` remains the guardrail for this boundary.
