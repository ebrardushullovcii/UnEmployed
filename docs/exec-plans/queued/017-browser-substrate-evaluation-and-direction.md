# 017 Browser Substrate Evaluation And Direction

Status: ready

This is a small prepared follow-on plan. It captures the current browser-substrate direction from the comparative runtime review, while explicitly leaving room for deeper benchmarking and architecture research later.

## Goal

Decide the best future browser substrate for `Job Finder` discovery, source-debug, and apply workflows.

This is not a final implementation plan yet. It is a starting note that records the current directional conclusion and the deeper research questions that still need to be answered before any large runtime migration or backend expansion happens.

## Current Directional Conclusion

If implementation cost is ignored and the decision is based on likely end-state speed and quality for `UnEmployed`, the current leading direction is:

1. use `agent-browser` as the strongest candidate browser runtime or substrate
2. keep `UnEmployed`'s own orchestration, typed state, source-debug model, and approval or safety logic
3. borrow apply-behavior ideas from `browser-use`, but do not treat `browser-use` as the default full platform for `UnEmployed`

This is a direction, not a locked decision.

## Why This Plan Exists

Recent review work raised a legitimate architecture question:

- should `UnEmployed` keep evolving its Playwright-backed runtime
- should it adopt a stronger browser substrate such as `agent-browser`
- should it borrow more heavily from browser-agent-first systems such as `browser-use`

The answer affects multiple existing plans at once:

- `010` browser efficiency and speed
- `013` deterministic discovery and provider research
- `014` structured source-debug artifacts
- `008` automatic job apply

Because the decision is cross-cutting, it should not be hidden inside only one of those plans.

## Current Comparative View

### Current Playwright runtime

Best at:

- fitting the existing app architecture
- tight product-specific orchestration control
- supporting the current phased source-debug system

Likely weaker at:

- raw browser-runtime efficiency
- auth and session ergonomics
- built-in safety and observability primitives

### `agent-browser`

Best at:

- browser-runtime speed and lighter daemon behavior
- auth and session reuse
- browser observability and debugging
- runtime-level safety controls

Likely weaker at:

- providing the higher-level `UnEmployed` workflow logic by itself

### `browser-use`

Best at:

- broad autonomous browser-agent behavior
- messy live form completion and apply-style tasks

Likely weaker at:

- fitting `UnEmployed`'s typed desktop product boundaries cleanly
- matching `UnEmployed`'s safety, approval, and replay-oriented workflow style by default

## Working Recommendation

The current working recommendation is:

- keep the app-owned orchestration and workflow intelligence
- evaluate `agent-browser` as the preferred future browser substrate candidate
- keep the current `source-debug` product model even if the runtime changes underneath it
- study `browser-use` mostly for apply behavior and long autonomous browser-task ideas, not as the default full replacement architecture

## Required Future Research

Before any large runtime move, deeper research should answer at least:

1. discovery throughput
   - which substrate performs best on representative targets when doing title-first triage, search-page collection, and light enrichment
2. source-debug compatibility
   - can the current phased evidence and replay model run on top of the candidate substrate without losing product quality
3. apply reliability
   - which substrate performs best on resume upload, auth reuse, multi-step forms, conditional questions, and blocker recovery
4. auth and session behavior
   - which substrate is more reliable for reusing real browser sessions and job-site logins on Windows and inside the desktop product context
5. safety and approvals
   - which substrate best supports approval-gated submits, allowed-domain controls, action confirmation, and prompt-boundary hygiene
6. observability
   - which substrate leaves the strongest evidence behind for debugging flaky targets and auditing what the agent actually did

## Existing Evidence Inputs

This starting note is based on the current comparative review of:

- `packages/browser-runtime/src/playwright-browser-runtime.ts`
- `packages/browser-agent`
- `https://github.com/vercel-labs/agent-browser`
- `https://github.com/browser-use/browser-use`

Deeper benchmarking and code-level adapter research still need to happen later.

## How This Plan Should Inform Other Plans

- `010`: use current measurement work to establish the right before-and-after benchmark shape for any future substrate evaluation.
- `013`: discovery redesign should remain provider-aware and title-first regardless of runtime choice; a faster runtime does not replace strategy work.
- `014`: source-debug should keep its typed learned-artifact model even if the underlying runtime changes.
- `008`: apply evolution should preserve approval and blocker-artifact quality even if a more autonomous browser substrate is adopted.

## Expected Later Deliverable

The deeper follow-on work should eventually produce a more concrete decision among:

- keep Playwright as the default runtime and continue tightening it
- add `agent-browser` as an alternate backend first
- migrate the default runtime to `agent-browser`
- selectively borrow `browser-use` behavior in apply-specific flows without adopting its full architecture

## Notes For A Deeper Follow-On Plan

- Do not treat browser-runtime speed as the whole discovery answer; provider-aware collection and title-first triage still matter more.
- Do not trade away source-debug evidence quality just to gain faster raw browsing.
- Do not adopt a broad autonomy-first browser stack if it weakens approval, blocker recovery, or replayable audit trails.
