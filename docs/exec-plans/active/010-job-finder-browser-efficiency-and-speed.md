# 010 Job Finder Browser Efficiency And Speed

Status: active

This plan is now active. The current implementation slice focuses on exposing named waiting states, reducing obvious silent-idle behavior, and making discovery and source-debug stage attribution easier to verify before broader runtime tuning continues.

## Current Implementation Status

- Discovery now emits clearer browser-startup, browser-ready, merge, and persistence progress so healthy runs no longer look like unexplained blank browser time quite as often.
- Source-debug now streams typed live progress to the desktop renderer, including current phase, wait reason, elapsed time, and product-facing status text.
- Browser-agent startup no longer pays a fixed `2s` post-navigation pause; it now uses a short bounded readiness wait instead.
- Discovery and source-debug now retain bounded timing summaries on run records, target executions, attempts, and phase summaries so long quiet spans can be attributed after the run instead of guessed from browser motion alone.
- The desktop test API now exposes a performance snapshot path for benchmark and QA flows so representative runs can be inspected without digging through raw repository state.
- The next tightening pass should focus on representative benchmark capture and any remaining long waits in final review, persistence, or retry paths that the new retained timings expose.

## Goal

Make Job Finder browser-heavy workflows both faster and less wasteful, with `discovery` and `source-debug` as the first priority.

This work must improve:

- real runtime efficiency
- the user's perception of speed
- visibility into where time is actually going

The implementation must start with measurement before tuning behavior.

## Problem Statement

Discovery and source-debug currently feel slow for two separate reasons:

- the actual wall-clock runtime is higher than it should be
- long stretches of apparent inactivity make the product feel even slower than the raw runtime

The current user pain is especially clear when the browser barely moves and the app gives little feedback. Today it is hard to tell whether time is being spent in:

- Chrome startup or attach
- page readiness
- LLM planning or LLM retries
- browser tool execution or tool retries
- extraction
- merge, scoring, or persistence
- source-debug phase handoff
- final artifact synthesis

Without measured attribution, speed work would mostly be guesswork.

## Why This Work Exists

Plans `004` and `005` made generic discovery and source-debug real, but they optimized for correctness, bounded behavior, and reusable structure first.

That leaves four immediate product problems:

1. Discovery and source-debug are slower than they need to be because their heavy steps are still mostly serialized and not yet performance-tuned.
2. The desktop UI does not surface enough phase-level waiting context, especially for source-debug, so healthy runs can look stalled.
3. The agent path still allows wasted turns, repeated navigation, conservative waits, and retry delays that are hard to see or compare between runs.
4. There is no measurement-first benchmark loop yet, so future speed work could accidentally trade away reliability or evidence quality.

## Product Direction

- Prioritize `discovery` and `source-debug` before `apply`.
- Start with instrumentation and benchmark capture before runtime tuning.
- Improve perceived speed and real runtime efficiency together, but track them separately.
- Prefer smaller bounded runs and earlier confident exits over broad wandering exploration.
- Keep progress honest and stage-based; do not expose raw transcript or chain-of-thought.
- Keep package boundaries intact: runtime owns browser lifecycle, browser-agent owns bounded LLM/tool loops, job-finder owns orchestration, desktop owns renderer-visible progress.
- It is acceptable to add instrumentation, richer UI status, stricter scope limits, and minor code complexity if those changes materially improve speed and clarity.
- It is acceptable to narrow generic exploration behavior where that meaningfully reduces waste without breaking the product goal.

## Success Criteria

### Measurement

- At least `90%` of wall-clock time in discovery and source-debug runs is attributed to named stages in structured timing data.
- Every measured run records timings for browser startup or attach, initial navigation, LLM wait, tool execution, extraction, post-processing, persistence, and finalization.
- A repeatable benchmark path exists for at least:
  - one representative discovery target on a warm browser
  - one representative discovery target on a cold browser
  - one first-run source-debug flow
  - one source-debug replay verification flow

### Perceived Speed

- Time to first visible progress signal is `<= 2s` after run start for both discovery and source-debug.
- Healthy runs do not go longer than `5s` without either a live progress update, a stage transition, or an explicit `waiting on ...` status.
- The desktop UI can distinguish at least these waiting states:
  - `starting browser`
  - `attaching to browser`
  - `waiting on page`
  - `waiting on AI`
  - `executing browser action`
  - `extracting jobs`
  - `merging results`
  - `persisting`
  - `finalizing`

### Real Runtime Efficiency

- After baseline capture on representative flows, reduce median end-to-end discovery duration by at least `25%` without lowering valid jobs found, save quality, or dedupe quality.
- Reduce median source-debug duration to first reusable draft artifact by at least `25%` without weakening replay verification or evidence quality.
- Reduce clearly redundant work by at least `30%` on benchmark runs:
  - repeated visits to ineffective routes
  - duplicate extraction attempts on unchanged pages
  - unnecessary retry loops
  - low-value agent turns after the phase goal is already proven

### Quality Guardrails

- Do not weaken source-debug verification standards just to make runs shorter.
- Do not hide stuck work behind fake progress.
- Do not move site-specific orchestration into `packages/browser-runtime`.
- Do not call the work done until both timing data and user-visible progress prove the improvement.

## Perceived Speed Versus Real Efficiency

### Perceived Speed Improvements

These make the app feel faster by reducing uncertainty:

- immediate run-start feedback
- visible stage and phase transitions
- explicit `waiting on AI`, `waiting on browser`, `waiting on tool`, and `waiting on persistence` states
- elapsed timers and last-activity timestamps
- source-debug live progress instead of only a final outcome
- clear completion or blocked-state messaging when a phase is paused or waiting on manual action

### Real Efficiency Improvements

These make the system actually do less work or finish sooner:

- reduce browser startup and attach overhead
- remove unnecessary fixed waits where safer readiness checks can replace them
- reduce LLM turn count and retry waste
- tighten per-phase or per-target step budgets using measured evidence
- skip duplicate navigation and duplicate extraction work
- avoid redundant post-processing or persistence passes
- reuse safe session state or measured site facts where appropriate

Implementation rule:

- UI-only changes are not enough if runtime stays flat.
- Runtime-only changes are not enough if the user still experiences long silent gaps.

## Likely Bottleneck Areas

### `packages/browser-runtime`

- Chrome process launch, remote-debug endpoint readiness, and CDP attach can create a long cold-start window before the first visible browser action.
- The runtime currently owns page readiness and session reuse, so startup and attach timing needs to be measured separately from agent time.
- Repeated open or close behavior between runs must be audited so sequential work is not paying cold-start cost unnecessarily.

### `packages/browser-agent`

- LLM round-trips, retries, retry backoff, and tool retries can consume large silent blocks of time.
- The current agent loop reports a generic `Thinking...` state before tool execution, which hides whether the run is waiting on AI, planning, or a retry.
- The startup path already includes conservative waits and step-driven loops that are good first audit targets.
- Source-debug forced-finish behavior and phase budgets are likely good candidates for turn-count reduction.
- Prompt construction, transcript compaction, tool policy, and deterministic catalog workflow policy belong here rather than in `packages/browser-runtime`, so performance work should tune them in this package without leaking those concerns across the boundary.

### `packages/job-finder`

- Discovery is sequential across targets and merges or persists results after each target.
- Source-debug is sequential across multiple phases, and each phase can run a full agent pass.
- Current orchestration does not yet persist a structured timing breakdown for target-level or phase-level cost.
- Post-browser work such as merge, scoring, stale-review updates, and persistence may be part of the `nothing is moving` time that users perceive as agent idling.

### `apps/desktop`

- Discovery already streams activity events, but the activity wording is not yet latency-attributed enough to explain long waits clearly.
- Source-debug currently behaves more like a fire-and-wait operation from the renderer, which makes the run feel stalled even when work is happening.
- The current global busy surface is too coarse to explain sub-stage progress for browser-heavy work.

## Initial Optimization Hypotheses

These are the first things the implementing agent should measure and either confirm or disprove:

1. The agent startup path contains at least one conservative fixed wait that is longer than necessary on common sites.
2. LLM retry and tool retry backoff creates long silent windows because retry state is not exposed to the renderer.
3. Discovery and source-debug spend meaningful time after browser work finishes, which users currently perceive as unexplained browser slowness.
4. Source-debug phase budgets and stop conditions are still tuned for correctness-first exploration rather than the fastest path to reusable evidence.
5. Source-debug feels worse than discovery because it lacks equivalent live progress streaming to the renderer.

## Scope

### In Scope

- typed measurement and timing surfaces for discovery and source-debug
- live renderer-visible progress improvements for discovery and source-debug
- measurement-first runtime tuning in `packages/browser-runtime`, `packages/browser-agent`, and `packages/job-finder`
- benchmark scenarios and comparison workflow for cold versus warm runs
- heuristics that reduce redundant agent or browser work while preserving result quality
- documentation and testing updates needed to keep the speed work repeatable

### Out Of Scope

- broad product implementation beyond discovery and debug speed work
- generic apply automation expansion
- raw transcript streaming or chain-of-thought exposure
- full multi-worker or parallel discovery as a required first solution
- unbounded caching or persistence of raw browser or LLM internals
- UI redesign work that is not directly tied to speed, visibility, or efficiency

## Instrumentation-First Approach

### Measurement Model

Add a structured timing model that can answer:

- how long browser startup and attach take
- how long until the first browser action
- how much time is spent waiting on AI
- how much time is spent executing browser tools
- how much time is spent extracting, merging, and persisting
- where the longest idle gaps with no user-visible progress occur

### Recommended Timing Concepts

The exact names can change, but the first implementation should preserve these concepts.

#### `BrowserRunStageKind`

- `browser_startup`
- `browser_attach`
- `initial_navigation`
- `llm_wait`
- `tool_execution`
- `extraction`
- `merge_scoring`
- `persistence`
- `phase_handoff`
- `finalization`

#### `BrowserRunWaitReason`

- `starting_browser`
- `attaching_browser`
- `waiting_on_page`
- `waiting_on_ai`
- `retrying_ai`
- `executing_tool`
- `retrying_tool`
- `extracting_jobs`
- `merging_results`
- `persisting_results`
- `manual_prerequisite`
- `finalizing`

#### `RunStageTiming`

- `id`
- `runId`
- optional `targetId`
- optional `phase`
- `stage`
- `startedAt`
- `completedAt`
- `durationMs`
- `status`
- optional short `detail`

#### `RunPerformanceSummary`

- `timeToFirstProgressMs`
- `timeToFirstBrowserActionMs`
- `timeToFirstJobMs`
- `totalLlmWaitMs`
- `totalToolExecutionMs`
- `totalExtractionMs`
- `totalMergePersistMs`
- `longestSilentGapMs`
- `agentTurnCount`
- `toolCallCount`
- `llmRetryCount`
- `toolRetryCount`
- `navigationCount`
- `repeatedUrlVisitCount`
- `extractionCount`

#### `BrowserRunLiveProgress`

- `runId`
- optional `targetId`
- optional `phase`
- `waitReason`
- `elapsedMs`
- `lastActivityAt`
- optional `currentUrl`
- optional `stepCount`
- optional `jobsFound`
- short user-facing `message`

### Persistence And Visibility Rule

Persist structured timing summaries and bounded stage events, not raw transcripts or provider payloads.

The renderer should receive enough information to explain current waiting state and show retained benchmark summaries without depending on browser-agent internals.

### Benchmark Policy

Before runtime tuning starts, record baseline runs for:

- cold discovery on a representative target
- warm discovery on the same target
- first-run source-debug on a representative target
- replay verification on the same target

Each benchmark should capture:

- total duration
- timing breakdown by stage
- jobs found or artifact outcome
- longest silent gap
- turn count and retry count
- notable warnings or blockers

## Workstreams

### 1. Performance Contracts And Telemetry Baseline

- add the typed timing and performance-summary surfaces needed at package and IPC boundaries
- attach structured timing capture to discovery runs and source-debug runs
- persist retained performance summaries or bounded timing artifacts with the existing run records
- create a benchmark workflow so later passes compare against real numbers instead of memory

### 2. Live Progress And Waiting-State UX

- extend discovery progress so it can show real waiting states instead of mostly generic movement
- add live streamed source-debug progress from the main process to the renderer, including current phase and current wait reason
- surface elapsed time, last activity time, and phase or target context where helpful
- keep activity wording product-facing and concise rather than debug-log shaped

### 3. Discovery Efficiency Pass

- measure target startup, first navigation, LLM wait, tool execution, merge, and persistence time separately
- tighten discovery step budgets and early-exit rules using measured evidence
- reduce repeated navigation to low-value routes and repeated extraction on unchanged pages
- review whether post-target persistence can be made leaner without losing durability or correctness
- keep discovery sequential first unless instrumentation proves that bounded concurrency is the best next step

### 4. Source-Debug Efficiency Pass

- measure the cost of each source-debug phase separately
- surface manual-prerequisite waits immediately instead of letting them look like silent runtime delay
- tighten per-phase max-step budgets, stop conditions, and proof thresholds so phases stop earlier when success or failure is already clear
- reuse safe phase findings between phases when that reduces duplicate browser work without weakening replay verification
- distinguish true runtime slowness from artifact synthesis or final review slowness

### 5. Browser Startup And Session Lifecycle Pass

- separate cold-start cost from warm attached-session cost in all benchmarks
- audit Chrome spawn, debugger readiness polling, CDP attach, and page bring-to-front time
- avoid paying cold-start cost multiple times inside one logical run when safe session reuse is available
- audit fixed waits and replace them with stronger readiness checks where that preserves correctness

### 6. Verification And Regression Guardrails

- add tests for timing aggregation, stage attribution, and progress translation
- add regression checks or benchmark snapshots for the chosen representative flows
- update docs so later agents know how to capture baselines and verify a speed claim
- keep runtime speed improvements paired with evidence-quality and result-quality checks

## Milestones

### Milestone 1: Timings And Benchmarks Exist

- add the typed timing vocabulary and retained summaries
- capture baseline discovery and source-debug timings on representative flows
- expose enough data to answer where time goes today

Exit signal:

- the team can point to measured stage breakdowns and longest silent gaps instead of guessing

### Milestone 2: Honest Live Progress

- upgrade discovery progress to show named waiting states
- stream source-debug progress live to the desktop UI
- surface time-to-first-progress and silent-gap behavior clearly

Exit signal:

- discovery and source-debug no longer feel like unexplained stalls while work is still healthy

### Milestone 3: Discovery Runtime Tightening

- reduce wasted agent turns, redundant navigation, and unnecessary post-processing in discovery
- improve cold or warm startup behavior where possible
- validate faster runs against baseline without losing job quality

Exit signal:

- representative discovery flows show a meaningful runtime reduction and better visibility

### Milestone 4: Source-Debug Runtime Tightening

- reduce unnecessary phase work and silent waits
- make phase boundaries, manual prerequisites, and replay timing visible
- validate faster debug runs against baseline without weakening proof standards

Exit signal:

- representative source-debug flows reach reusable draft or verification outcomes materially faster and with better live feedback

### Milestone 5: Regression Harness And Documentation

- lock in the benchmark flow and validation expectations
- update canonical docs and testing guidance for performance-focused work
- make future speed claims reproducible

Exit signal:

- another agent can rerun the benchmark set, compare before versus after, and explain any regression without rediscovering the workflow

## Quality Bar

- Measure before optimizing.
- Keep perceived speed and real efficiency as separate tracked outcomes.
- Keep user-facing progress honest; never hide blocked or slow states behind fake activity.
- Keep raw transcripts and chain-of-thought out of renderer surfaces.
- Keep site-specific logic out of `packages/browser-runtime`.
- Do not reduce discovery quality, dedupe quality, or source-debug evidence quality to hit a speed target.
- Prefer small, explainable heuristic wins before introducing heavy concurrency or new architecture.
- Update docs and verification workflow in the same task as implementation.

## Recommended Execution Order

### Slice 1: Timing Vocabulary And Run Attribution

**Goal**: discovery and source-debug runs expose structured stage timings and summary metrics.

**Work**:

- add typed timing and performance summary surfaces in `packages/contracts`
- extend run records or adjacent retained artifacts so discovery and source-debug can store bounded timing breakdowns
- wire timing capture into `packages/browser-runtime`, `packages/browser-agent`, and `packages/job-finder`
- expose retained timing summaries through desktop IPC and preload without leaking internals

**Verification**:

```bash
pnpm --filter @unemployed/contracts test
pnpm --filter @unemployed/job-finder test
pnpm --filter @unemployed/browser-agent test
pnpm --filter @unemployed/browser-runtime test
pnpm typecheck
pnpm lint
```

**Done when**:

- a representative run produces structured timings that explain most of the wall-clock duration

### Slice 2: Live Discovery And Source-Debug Progress

**Goal**: the renderer can show honest live progress and waiting states for both discovery and source-debug.

**Work**:

- extend discovery event translation with named waiting-state events
- add source-debug live progress streaming from the main process to the renderer
- surface elapsed time, current phase or target, and last-activity timing in the relevant desktop screens
- keep wording user-facing and concise

**Verification**:

```bash
pnpm --filter @unemployed/desktop typecheck
pnpm --filter @unemployed/desktop lint
pnpm --filter @unemployed/desktop build
pnpm desktop:dev
```

Run one representative discovery flow and one representative source-debug flow while capturing screenshots and timing output.

**Done when**:

- discovery and source-debug no longer sit in opaque busy state during healthy runs

### Slice 3: Discovery Efficiency Tuning

**Goal**: discovery reaches useful results with fewer wasted turns and less dead time.

**Work**:

- use baseline data to remove or tighten fixed waits, retry loops, and broad exploratory turns
- add early-exit and duplicate-work guards
- reduce unnecessary merge or persistence cost where data shows it matters
- compare cold versus warm session behavior and preserve the faster safe path

**Verification**:

```bash
pnpm --filter @unemployed/job-finder test
pnpm --filter @unemployed/browser-agent test
pnpm --filter @unemployed/browser-runtime test
pnpm typecheck
pnpm lint
```

Re-run the representative discovery benchmark set and compare before versus after.

**Done when**:

- representative discovery flows are measurably faster without lower-quality results

### Slice 4: Source-Debug Efficiency Tuning

**Goal**: source-debug phases produce reusable findings faster and with less silent waiting.

**Work**:

- tune phase step budgets and stop conditions from measured data
- surface manual-prerequisite pauses immediately
- reduce duplicate phase work and unnecessary replay overhead without lowering proof requirements
- attribute final-review or artifact-synthesis cost separately from browser exploration cost

**Verification**:

```bash
pnpm --filter @unemployed/job-finder test
pnpm --filter @unemployed/desktop build
pnpm desktop:dev
pnpm typecheck
pnpm lint
```

Re-run the representative source-debug benchmark set and compare before versus after.

**Done when**:

- representative source-debug flows reach draft or verification outcomes materially faster without weaker validation

### Slice 5: Benchmark Lock-In And Docs

**Goal**: future speed work is repeatable and regression-resistant.

**Work**:

- update `docs/TESTING.md`, `docs/STATUS.md`, `docs/TRACKS.md`, and relevant module docs with the benchmark and QA workflow
- keep representative benchmark inputs documented
- capture before or after timing evidence and retained summaries

**Verification**:

```bash
pnpm docs:check
pnpm typecheck
pnpm lint
```

**Done when**:

- another agent can rerun the benchmark set, compare results, and understand how to validate a speed claim without guessing

## Relationship To Existing Work

This plan is a follow-on to:

- `docs/exec-plans/completed/004-job-finder-generic-discovery.md`
- `docs/exec-plans/completed/005-job-source-debug-agent.md`

Plan `004` introduced generic sequential discovery and retained activity history.

Plan `005` introduced multi-phase source-debug and reusable instruction artifacts.

Plan `010` does not replace those slices. It tightens their runtime behavior, progress visibility, and measurement discipline so the browser-heavy parts of `Job Finder` feel and behave faster.
