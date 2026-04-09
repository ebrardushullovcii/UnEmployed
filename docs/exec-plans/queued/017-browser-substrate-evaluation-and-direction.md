# 017 Browser Substrate Evaluation And Direction

Status: ready

This plan is a research and benchmark plan, not an implementation plan.

Its job is to produce decision-grade evidence for the next browser-substrate move after the stronger `011` to `015` product foundations exist. It should not quietly turn into a runtime migration, a hidden apply rewrite, or a generic autonomy experiment.

## Goal

Decide the best browser substrate direction for `Job Finder` across representative `discovery`, `source-debug`, and `apply` workloads while preserving the `UnEmployed` target-state product model:

- target-state package boundary: app-owned orchestration in `packages/job-finder`
- target-state package boundary: bounded browser workflow policy in `packages/browser-agent`
- target-state package boundary: generic browser lifecycle and automation primitives in `packages/browser-runtime`
- target-state package boundary: typed contracts and persisted state in `packages/contracts` and `packages/db`
- explicit approval logic, consent interrupts, and replayable evidence for risky actions

These bullets describe the intended target boundary, not a claim that the current code already enforces it everywhere. Current implementation exception: `packages/browser-runtime/src/catalog-browser-session-runtime.ts` still imports `createCatalogSessionAgent` from `@unemployed/browser-agent`.

The output of this plan is a decision with evidence, not code shipped under a new runtime.

## Why This Plan Exists

The repo already has:

- a working Playwright-backed runtime
- a bounded browser-agent layer with prompts, tools, compaction, and evidence capture
- completed `010` timing and progress baselines for current Playwright behavior
- queued `013` and `015` plans that will make discovery and apply much more representative than they are today

The open question is no longer whether alternative browser stacks exist. The open question is whether any candidate is materially better for `UnEmployed` once measured against the product's real constraints, not against a generic browser-agent demo.

## Hard Constraints

Every candidate must be evaluated against these target-state constraints, not against every current implementation detail. The current code still has one known divergence from this target boundary: `packages/browser-runtime/src/catalog-browser-session-runtime.ts` imports `createCatalogSessionAgent` from `@unemployed/browser-agent`.

1. Target state: `packages/job-finder` keeps orchestration ownership.
2. Target state: `packages/browser-agent` keeps bounded workflow policy, prompts, tool policy, and structured outputs.
3. Target state: `packages/browser-runtime` stays generic and must not absorb product-specific discovery or apply strategy.
4. Target state: typed state, schema validation, and durable run artifacts remain first-class.
5. Source-debug keeps its phased evidence, replay, and learned-intelligence model even if runtime plumbing changes underneath it.
6. Apply flows keep explicit submit approval, consent interrupts, blocker capture, and auditable run records.
7. Windows desktop session reuse, authenticated browser reuse, and local Chrome profile realities matter more than cloud-only or web-only assumptions.
8. Raw browser speed alone is not sufficient if evidence quality, replayability, or approval safety regress.

Any option that cannot satisfy these constraints is not a valid default-substrate candidate.

## Decision Questions

The research must answer these questions explicitly.

### 1. Discovery fitness

- Which substrate produces the best end-to-end throughput on representative `013`-style discovery flows?
- Which substrate best supports cheap collection first, title-first triage, and bounded detail enrichment?
- Which substrate minimizes wasted turns, repeated navigation, and idle browser time while preserving result quality?

### 2. Source-debug compatibility

- Can the current phased source-debug model run on top of the substrate without weakening route evidence, replay verification, or learned-intelligence synthesis?
- Does the substrate make it easier or harder to capture the evidence `UnEmployed` actually keeps?

### 3. Apply safety and execution fitness

- Which substrate best supports representative `015`-style apply work: login reuse, resume upload, multi-step forms, conditional questions, and approval-gated final submit?
- Which substrate handles blocker recovery and consent interrupts most cleanly without collapsing into opaque autonomy?

### 4. Session and auth behavior

- Which substrate is most reliable for warm-session reuse on Windows desktop with local Chrome profiles and real site logins?
- Which substrate imposes the least friction for continuing from a user-authenticated browser state?

### 5. Integration cost and package fit

- Can the substrate fit the existing `browser-runtime` and `browser-agent` seams with a bounded adapter layer?
- Does adopting it force `UnEmployed` to give up typed boundaries or move product logic into the runtime?

### 6. Observability and debugging

- Which substrate leaves behind the strongest evidence for explaining failures, flaky selectors, auth issues, and stalled runs?
- Which substrate best supports retained timings, screenshots, URL traces, and phase-level evidence without exposing raw transcripts?

### 7. Decision shape

Based on the above, which outcome is justified:

- keep Playwright as the default substrate
- keep Playwright and add an alternate backend behind the same seams
- migrate the default substrate to `agent-browser`
- selectively borrow ideas from `browser-use` for apply behavior without adopting it as the runtime platform

## Candidates To Compare

### A. Current Playwright baseline

This is the incumbent and the baseline to beat.

Evaluate:

- current `packages/browser-runtime` Playwright session model
- current `packages/browser-agent` bounded task model
- current `010` timing and wait-state surfaces as the baseline evidence set

### B. `agent-browser`

Evaluate `agent-browser` as a possible lower-level browser substrate or backend behind existing `UnEmployed` seams.

Important framing:

- do not evaluate it as a product replacement
- do not give it orchestration ownership
- do evaluate whether it improves runtime speed, session reuse, observability, or safety primitives enough to justify adapter cost

### C. Selective `browser-use` ideas

`browser-use` is not being evaluated as the default full platform.

Evaluate it only for ideas that may improve `015`-style apply work, such as:

- long-form apply task decomposition
- messy form progression heuristics
- action-guard or operator-interrupt patterns
- resume-upload and screener-completion flow ideas

The question here is not `should UnEmployed adopt browser-use wholesale`. The question is `which ideas are worth borrowing while keeping UnEmployed's orchestration, approvals, and typed model`.

## Relationship To Existing Plans

### Relationship To `010`

Use the retained timing summaries and performance snapshot workflow from `010` as the benchmark baseline format.

`017` should extend the comparison set, not invent a second incompatible benchmark vocabulary.

### Relationship To `013`

Representative discovery benchmarks must use the `013` product direction:

- typed source intelligence
- provider-aware method selection
- one-target and run-all compatibility
- title-first triage
- explicit browser closeout

`017` must not score a substrate highly just because it looks fast on naive blind browsing that `013` would not ship.

### Relationship To `015`

Representative apply benchmarks must use the `015` safety and product model:

- one-job apply copilot
- one-job auto-submit only with explicit submit approval
- consent interrupts for signup or manual verification branches
- blocker artifacts and replay checkpoints

`017` must not reward an autonomy-first stack for behavior that violates these rules.

## Benchmark Principle

Benchmark the product behaviors that matter, not the framework marketing claims.

Every benchmark should capture both:

- runtime efficiency
- product fitness under `UnEmployed` constraints

Each benchmark class must compare candidates on the same scenario, same target shape, same warm or cold session conditions, and the same success definition.

## Required Benchmark Classes

The research plan must produce at least these benchmark classes.

### 1. Discovery benchmarks

Use representative `013`-style flows.

Required scenarios:

- cold-session single-target discovery on a provider-backed source
- warm-session single-target discovery on the same source
- cold-session single-target discovery on a weaker careers-page source that still needs browser collection
- warm-session run-all benchmark across a small mixed source set

Each scenario should exercise:

- source selection and startup
- cheap collection first
- title-first triage
- selective detail enrichment
- merge, dedupe, persistence, and closeout

Required measurements:

- total duration
- time to first progress
- time to first browser action
- time to first kept job
- jobs kept per minute
- stage or wait-reason breakdown using the `010` timing vocabulary where possible
- turn count, tool count, retry count, repeated URL visits, and closeout time
- result quality metrics: valid jobs found, dedupe quality, false-positive rate on kept jobs

### 2. Source-debug benchmarks

Use representative phased source-debug runs from the current product model and the `013` typed-intelligence direction.

Required scenarios:

- first-run debug on a target with no prior learned intelligence
- replay verification on a target with existing route hints and prior artifacts
- debug on a target with a misleading anchor URL where better route discovery matters

Each scenario should exercise:

- phased route or method discovery
- evidence capture
- learned route reuse where appropriate
- artifact synthesis and replay verification

Required measurements:

- total duration to draft artifact
- total duration to replay-verification outcome
- phase-by-phase timing breakdown
- evidence density and usefulness
- route quality and replay success rate
- proportion of runs that leave enough evidence for a human to understand what happened
- number of redundant or dead-end turns before sufficient proof

### 3. Apply benchmarks

Use representative `015`-style flows, not generic `easy_apply` demos.

Required scenarios:

- warm-session one-job apply copilot on a friendly inline flow
- warm-session one-job apply flow with resume upload and short screeners
- warm-session one-job apply flow with conditional questions and an approval-gated final submit boundary
- apply flow that triggers a consent interrupt such as login, signup choice, or manual verification
- apply flow that becomes blocked and must leave behind useful blocker artifacts and resume-safe recovery state

Each scenario should exercise:

- session reuse
- field detection and fill reliability
- upload handling
- ambiguous-question pause behavior
- approval boundary behavior
- final evidence or blocker synthesis

Required measurements:

- total duration to copilot-ready pause or terminal result
- time to first actionable form understanding
- successful field-fill rate
- successful upload rate
- blocker-capture quality
- approval-boundary correctness
- submit success rate for approved runs only
- recovery quality after blocker or consent interrupt

## Comparison Criteria

Every candidate should be scored across the same categories.

### Runtime efficiency

- cold start cost
- warm attach cost
- step efficiency
- navigation efficiency
- retry behavior
- throughput under bounded runs

### Session and auth ergonomics

- local Chrome reuse on Windows
- reliability of warm authenticated sessions
- operator friction to continue from an existing session
- session ownership clarity and cleanup behavior

### Source-debug fitness

- compatibility with phased debug model
- evidence richness and replay support
- route-learning support
- ease of preserving typed source intelligence outputs

### Apply fitness

- multi-step form reliability
- upload reliability
- handling of dynamic or conditional questions
- ability to pause, request approval, and resume safely
- blocker and consent handling quality

### Observability

- timing attribution quality
- screenshot and URL trace usefulness
- action auditability
- ease of mapping runtime events into user-facing wait states

### Architecture fit

- ability to stay behind `browser-runtime` seams
- ability to keep policy inside `browser-agent` and orchestration inside `job-finder`
- typed contract compatibility
- incremental adoption feasibility
- testability inside the monorepo

### Safety and control

- support for explicit domain controls or bounded navigation
- support for approval-gated high-risk actions
- prompt-boundary hygiene
- risk of hidden autonomy or hard-to-audit behavior

### Maintenance cost

- adapter complexity
- expected long-term ownership burden
- upgrade risk
- clarity of failure modes for future agents

## Evidence Required For A Decision

No substrate decision is valid unless the evidence package includes all of the following.

### 1. Benchmark results

- repeated benchmark runs, not a single happy-path anecdote
- cold and warm session comparisons where applicable
- side-by-side scenario summaries for each candidate

### 2. Product-quality evidence

- discovery quality comparisons, not just speed
- source-debug artifact samples and replay outcomes
- apply blocker, consent, and approval-boundary behavior samples

### 3. Architecture notes

- a written integration sketch for each serious candidate
- explicit notes on what would stay in `browser-runtime`, `browser-agent`, and `job-finder`
- explicit notes on what package-boundary pressure or contract churn the candidate would create

### 4. Risk log

- known failure modes
- missing capabilities
- hidden adoption costs
- places where benchmark wins might not survive real desktop usage

### 5. Recommendation memo

- recommended outcome
- rejected alternatives and why they were rejected
- what additional evidence would be required if the result is `not yet decided`

## Evidence Thresholds

Use these thresholds before declaring a migration-worthy win.

### For a new default substrate

A candidate should beat the Playwright baseline by a meaningful margin on the representative benchmark set and must not materially regress:

- discovery result quality
- source-debug evidence quality or replay success
- approval-boundary correctness
- blocker or consent handling
- Windows warm-session reliability
- package-boundary fit

If the speed or reliability win is narrow, but the integration or safety cost is high, the decision should remain `keep Playwright` or `add alternate backend first`.

### For selective idea borrowing only

If `browser-use` contributes useful apply heuristics without clean runtime fit, the decision should explicitly be:

- borrow selected ideas or patterns
- do not adopt `browser-use` as the substrate

### For no decision yet

If representative `013` or `015` flows do not exist yet, or if benchmarks only cover toy scenarios, the correct exit is `defer decision` rather than forcing a winner.

## Research Workstreams

### Workstream 1: Benchmark design

- define the exact representative target set
- define cold versus warm session setup rules
- define success criteria per scenario
- define the retained result format using `010` timing vocabulary where possible

### Workstream 2: Candidate integration research

- inspect `agent-browser` integration seams and required adapter surface
- inspect `browser-use` behavior patterns worth studying for apply
- document where each candidate pressures existing package boundaries

### Workstream 3: Benchmark execution

- run the benchmark matrix against the current Playwright baseline first
- run the same matrix for each serious candidate or prototype path
- retain scenario summaries, not just narrative impressions

### Workstream 4: Decision synthesis

- score candidates against the comparison criteria
- document tradeoffs clearly
- produce a recommendation tied to evidence, not preference

## Explicit Non-Goals

- do not implement a substrate migration in this plan
- do not rewrite `browser-agent` into a broad autonomy-first product layer
- do not move source-debug orchestration into runtime code
- do not replace approval or replay requirements with best-effort autonomy
- do not treat benchmark wins on toy apply demos as sufficient evidence for production direction

## Exit Outcomes

This plan is complete only when it ends in one of these explicit outcomes.

### Outcome A: Keep Playwright

Evidence shows the current Playwright-backed runtime remains the best fit once product constraints, source-debug quality, approvals, and integration cost are included.

### Outcome B: Add alternate backend

Evidence shows `agent-browser` is promising enough to justify a bounded alternate backend behind existing seams, but not yet strong enough to replace Playwright as the default.

### Outcome C: Migrate default substrate

Evidence shows `agent-browser` wins clearly enough on representative discovery, source-debug, and apply benchmarks, with acceptable integration and safety costs, to justify a later migration plan.

### Outcome D: Borrow ideas only

Evidence shows selective `browser-use` ideas improve apply behavior or operator control, but `browser-use` itself is not the right runtime platform.

### Outcome E: Defer decision

Evidence is still incomplete because representative `013` or `015` flows are not mature enough, or benchmark coverage is too thin to support a durable decision.

## Deliverables

The later implementing agent should leave behind:

- a completed benchmark matrix
- retained benchmark summaries and product-quality notes
- an architecture-fit writeup for serious candidates
- a final recommendation memo with one explicit exit outcome
- updates to `docs/STATUS.md` and `docs/TRACKS.md` once the decision is actually made

## Current Working Expectation

Until benchmark evidence says otherwise:

- Playwright remains the incumbent baseline
- `agent-browser` is the leading candidate for deeper substrate evaluation
- `browser-use` remains a source of selective apply-flow ideas rather than a presumed platform replacement

That expectation is not the decision. The benchmark evidence is the decision.
