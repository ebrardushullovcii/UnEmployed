# 013 Job Finder Source Intelligence And Faster Discovery

Status: ready

This plan merges the old queued source-debug artifact note and the old discovery redesign note into one execution-ready workstream.

The reason for the merge is simple: the app should not invent one site-intelligence model in source-debug and a second overlapping model in discovery. The same typed source intelligence should drive both.

## Goal

Make `Job Finder` discovery materially faster, more controllable, and more reusable by combining:

1. typed source intelligence from source-debug
2. provider-aware discovery method selection
3. one-target and run-all execution on the same target-level pipeline
4. title-first triage before expensive enrichment
5. durable seen, skipped, and applied-job dedupe
6. clearer browser closeout once a run is done

## Delivery Standard For Implementing Agents

This plan is not complete when a few new source-debug fields exist or one benchmark looks better on one happy path.

Required implementation bar:

- define the typed source-intelligence model before widening discovery behavior
- make discovery consume that model directly instead of reinterpreting long freeform notes
- support both one-target execution and run-all execution on the same target-level pipeline
- persist enough ledger state that later runs can ignore already-seen, already-applied, or intentionally skipped jobs when the match is strong enough
- preserve richer saved-job details instead of treating discovery as title-only staging
- close or clearly detach the browser session after discovery or source-debug work when no immediate follow-on task still needs it
- leave behind benchmark and QA evidence across more than one target type
- update docs in the same task so later agents can continue from repo state instead of chat history

In plain terms: another agent should be able to read this plan, implement it in slices, and end up with one coherent source-intelligence and discovery system instead of two half-connected ones.

## Why This Work Exists

The repo already has real source-debug and real discovery, but the current product still has six gaps:

1. source-debug artifacts are still mostly freeform guidance arrays
2. discovery still behaves too much like a run-all browser-agent flow
3. provider research is not yet a first-class input to method selection
4. title rejection often happens too late
5. seen-job and already-applied dedupe are not durable enough
6. browser session closeout is not explicit enough for the user

## Locked Product Decisions

- The user-provided URL is a `site identity anchor`, not a forced collection start.
- Source-debug may discover a better start route than the anchor URL.
- Public or auth-safe provider endpoints and stable listing routes should beat blind page wandering when they are trustworthy.
- One-target execution should be first-class. `Run all` should remain a thin orchestration layer on top.
- Source intelligence should stay typed and reviewable.
- Per-user overrides stay supported, but they should be structured rather than buried in notes.
- Already applied or intentionally dismissed jobs should become hard dedupe inputs for later discovery runs.
- Browser closeout should be explicit once a run no longer needs the live session.

## Product Outcome

When this plan lands, the app should be able to:

1. debug a target once and persist typed provider, route, and collection-method intelligence
2. run discovery for one target or all enabled targets using the same target-level pipeline
3. choose between API, listing route, careers page, or fallback browsing more deliberately
4. reject weak jobs early on title and cheap metadata before expensive extraction
5. ignore already-seen, already-applied, or intentionally skipped jobs when the match is grounded strongly enough
6. save fuller job details for promising jobs
7. close or clearly detach the browser after the task that opened it is done

## Current Code And Contract Starting Points

The implementing agent should start from the current seams instead of inventing a second system.

### Source-debug roots

- `packages/contracts/src/source-debug.ts`
  - `SourceInstructionArtifactSchema`
  - `EditableSourceInstructionArtifactSchema`
  - `SourceDebugRunRecordSchema`
- `packages/job-finder/src/internal/workspace-source-debug-methods.ts`
- `packages/job-finder/src/internal/workspace-source-debug-workflow.ts`

### Discovery roots

- `packages/contracts/src/discovery.ts`
  - `JobDiscoveryTargetSchema`
  - `SavedJobSchema`
  - `DiscoveryRunRecordSchema`
  - `DiscoveryTargetExecutionSchema`
- `packages/job-finder/src/internal/workspace-discovery-methods.ts`
- `packages/job-finder/src/internal/matching.ts`

### Runtime and agent seams

- `packages/browser-runtime/src/playwright-browser-runtime.ts`
- `packages/browser-agent/src/agent.ts`
- `packages/browser-agent/src/catalog-session-agent.ts`

### Desktop surfaces

- `apps/desktop/src/renderer/src/features/job-finder/screens/discovery/`
- `apps/desktop/src/renderer/src/features/job-finder/components/profile/profile-discovery-target-row.tsx`
- `apps/desktop/src/renderer/src/features/job-finder/components/profile/profile-source-debug-review-modal.tsx`

## Relationship To Existing Work

### Relationship To `010`

Use the retained timing summaries from `010` as the before-and-after benchmark baseline for this plan.

### Relationship To `011`

Plan `011` provides the richer `SavedJob`, job-context, and apply-memory fields this plan should reuse instead of inventing discovery-only storage.

### Relationship To `012`

Plan `012` should capture stronger targeting and user override data so discovery can make better early decisions.

### Relationship To `014`

Plan `014` consumes the richer saved-job and keyword context from this plan so resume tailoring can work from better job inputs.

### Relationship To `015`

Plan `015` should consume the same typed provider, route, auth, and apply-surface hints instead of rebuilding site intelligence late during apply.

## Required Source Intelligence Model

The typed source-intelligence layer should cover at least:

### Provider intelligence

- provider or ATS classification
- confidence
- public API or structured endpoint availability when safe and public
- board token, slug, or provider identifier when grounded

### Collection strategy

- preferred collection method: `api`, `listing_route`, `careers_page`, or `fallback_search`
- ranked starting routes
- stable search-route templates
- stable detail-route patterns
- known listing markers

### Apply-facing hints

- apply path type
- auth or consent markers
- question-surface or resume-upload hints when grounded

### Reliability and overrides

- selector fingerprints or stable control names when they are truly useful
- failure fingerprints
- freshness or verification timestamps
- structured per-user overrides such as forcing a method, denying a route, or adding a known-good path

Implementation rule:

- discovery should read these fields directly; it should not have to reinterpret long `navigationGuidance` arrays every run

## Discovery Workflow Shape

### Stage 0: Provider and route research

Before generic browsing, determine:

- which provider or ATS is likely in use
- whether a public listing API exists
- whether a stable search or listing route exists
- whether a better start page than the anchor URL exists

Methods may include bounded same-host inspection, in-browser evidence, and bounded web lookup for provider docs or navigation guides.

### Stage 1: Cheap collection first

Preferred order:

1. public provider or board API
2. stable listing or search route
3. careers page card extraction
4. broader fallback browsing only when the source still lacks a stable listing path

### Stage 2: Title-first triage

Use cheap visible metadata first:

- title
- company
- location
- work mode

If the job clearly fails targeting rules here, do not pay for deeper extraction.

### Stage 3: Detail enrichment only for promising jobs

Only promising jobs should get full description extraction, qualifications parsing, keyword signals, and richer fit scoring.

## Durable Ledger And Dedupe Requirements

The ledger should make it cheap to answer:

- have we seen this job before?
- did we already skip it intentionally?
- did we already apply to it?
- did we already enrich it?
- did the listing disappear later?

At minimum, retain:

- canonical URL
- source or provider job ID when known
- provider key or board token when known
- first seen and last seen timestamps
- discovery target that found it
- collection method used
- title-first triage result
- skip reason when rejected early
- latest application or handled status when known

## Workstreams

### 1. Source-intelligence contracts and review UI

- widen source-debug artifacts into typed provider, route, collection-method, and apply-hint structures
- keep editable overrides bounded and reviewable
- expose the new summaries clearly in review UI

### 2. Source-debug research integration

- let source-debug capture provider evidence, public API hints, route candidates, and reliability markers
- keep research bounded and evidence-backed

### 3. One-target and run-all discovery pipeline

- add one-target execution as a first-class action
- keep `run all` as orchestration over the same target-level pipeline
- make method selection provider-aware and cheap-first

### 4. Ledger, dedupe, and richer job persistence

- formalize seen, skipped, handled, and applied-job tracking
- preserve fuller job details for promising jobs
- reuse that state across later runs

### 5. Browser closeout and observability

- close or clearly detach the browser session once the task that opened it is done
- make closeout status visible enough that the user understands what happens on the next run

## Milestones

### Milestone 1: Typed source intelligence live

- source-debug can persist provider, route, and collection-method intelligence beyond freeform guidance arrays

### Milestone 2: Faster target-level discovery live

- one-target discovery works
- method selection is provider-aware
- title-first triage avoids obvious waste

### Milestone 3: Durable dedupe and richer saved jobs live

- seen, skipped, and applied-job tracking are durable enough to stop resurfacing handled jobs
- promising jobs retain fuller context for later resume and apply work

### Milestone 4: Browser closeout, QA, and benchmarks live

- browser closeout is explicit after source-debug and discovery work
- representative targets show faster runs without lower-quality saves

## Verification Expectations

Implementation work for this plan should be validated with at least:

- `pnpm --filter @unemployed/contracts test`
- `pnpm --filter @unemployed/job-finder test`
- `pnpm --filter @unemployed/browser-agent test`
- `pnpm --filter @unemployed/browser-runtime typecheck`
- `pnpm --filter @unemployed/desktop build`
- `pnpm docs:check`

Additional completion rules:

- leave behind representative benchmark notes for at least one API-friendly target, one structured listing-route target, and one generic fallback target
- leave behind evidence for both one-target and run-all execution
- leave behind evidence that browser closeout behaves clearly after the run finishes
