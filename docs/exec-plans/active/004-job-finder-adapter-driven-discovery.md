# 004 Job Finder Adapter-Driven Discovery

Status: active

## Goal

Refactor the current LinkedIn-only browser agent into an adapter-driven discovery system that supports ordered user-configured discovery targets, a readable retained activity/history timeline, and an experimental generic-site path without forcing another rewrite when broader multi-site support lands later.

## Why This Work Exists

The current browser agent proves that an LLM-controlled Playwright loop can discover jobs on LinkedIn, but the implementation still spreads source-specific behavior across multiple packages and still assumes one primary source path.

That creates five immediate problems:

1. The current "generic" browser agent still carries LinkedIn-specific prompts, URL policy, and extraction assumptions.
2. Users cannot yet configure discovery targets beyond the baked-in LinkedIn entrypoint.
3. The UI does not show enough live discovery context, so users cannot easily tell what the agent is doing or why.
4. The workspace still models discovery around one global browser session and one source flow, which is too narrow for real multi-target support.
5. Generic-site discovery is the end goal, but the current architecture does not safely support it yet.

## Product Direction

- Keep the system agent-first rather than script-first.
- Let users define ordered discovery targets as named site + starting URL pairs.
- Keep LinkedIn as the first fully adapterized path.
- Ship `generic_site` in this workstream as an explicitly experimental adapter, not as a fake fully solved universal scraper.
- Start with sequential multi-target discovery.
- Keep user-visible activity readable, retained, and curated.
- Keep apply-flow generalization out of this refactor; discovery should generalize faster than submit automation.

## Key Corrections To The Prior Draft

- Model discovery configuration as a nested discovery preference object instead of scattering more flat fields onto `JobSearchPreferences`.
- Replace the single global browser-session assumption with adapter-scoped discovery session state.
- Add an internal raw-event pipeline plus a translation layer in `packages/job-finder` before rendering a user-facing activity timeline.
- Preserve target provenance when duplicate jobs merge across multiple targets.
- Keep future worker/parallel design documented, but do not make worker abstractions a required implementation milestone for the first delivery.

## Scope

### In Scope

- Add typed discovery-preference, target, session-state, run-state, activity-event, and run-summary contracts.
- Add local persistence for discovery target configuration and recent retained discovery history.
- Add a Profile Preferences UI for ordered named site + starting URL pairs.
- Introduce a discovery-focused adapter boundary for site-specific discovery behavior.
- Convert the current LinkedIn flow into the first real discovery adapter.
- Add a `generic_site` adapter with explicit v1 constraints and visible UX caveats.
- Add a chat-like discovery activity feed that shows user-facing agent progress and summarized reasoning.
- Refactor discovery orchestration so multi-target runs are sequential now but can grow into bounded concurrency later.

### Out Of Scope

- Enabling multi-worker parallel discovery by default.
- Full support for every external site in the same pass.
- Fully generic apply flows across arbitrary job boards.
- Exposing raw chain-of-thought or unfiltered model reasoning to the user.
- Pretending the first `generic_site` adapter is production-grade for every site shape.

## UX Principles

- Discovery activity should feel like a readable agent timeline, not a debug log.
- The activity surface should explain what the agent is doing in user-facing language.
- The user should always be able to tell:
  - which run is active
  - which target is active
  - which adapter is being used
  - what the current action is
  - how many jobs were found, saved, staged, skipped, or deduped
  - whether the run completed, cancelled, or failed
- The latest run should remain visible after completion and survive workspace refresh.
- Recent completed runs should be retained locally in a bounded history list.
- `generic_site` targets should be clearly labeled as more variable and lower-confidence than purpose-built adapters.

## Architectural Direction

### Discovery Preferences And Targets

Discovery target configuration should live under a dedicated nested discovery preference object rather than flattening more fields into the top level.

The array order is meaningful and should define sequential run order.

Targets should support:

- `id`
- `label`
- `startingUrl`
- `enabled`
- `adapterKind`

`adapterKind` should support:

- `auto`
- `linkedin`
- `generic_site`

`auto` should resolve by hostname when possible.

### Generic Agent Core

`packages/browser-agent` should own:

- generic tool loop
- generic tool safety behavior
- configurable navigation policy
- configurable prompt context additions
- raw discovery event emission

It should not hardcode LinkedIn-only prompts, allowlists, or job normalization rules.

### Discovery Adapters

Use a discovery-focused adapter interface rather than one giant source adapter that tries to own discovery, scoring, and apply behavior all at once.

Each discovery adapter should own:

- target normalization
- adapter resolution and hostname matching
- URL policy and hostname bounds
- prompt/policy additions for the generic agent core
- extraction normalization rules
- source-specific recovery guidance
- capability metadata such as whether managed session state is required

The first real adapter should be `linkedin`.

`generic_site` remains in scope, but only after the LinkedIn path has been fully moved behind the adapter boundary.

### Browser Runtime And Session Modeling

`packages/browser-runtime` should stay focused on:

- browser session lifecycle
- Playwright browser/context/page ownership
- auth/session checks
- browser-safe primitives

It should not become the owner of source-specific discovery orchestration or user-facing activity wording.

Discovery session state should be adapter-scoped rather than a single global browser session. Some adapters, such as `generic_site`, may report that managed session state is not required.

### Job Finder Orchestration

`packages/job-finder` should own:

- target selection and ordering
- adapter resolution
- sequential run coordination
- raw-event aggregation and user-facing event translation
- scoring, merge, dedupe, provenance, and persistence
- retained run history and summary shaping
- cancellation across browser phase, scoring, and persistence

### AI Provider Boundary

`packages/ai-providers` should stay model-focused.

During this refactor, source-specific extraction instructions should start moving out of provider adapters and into discovery-adapter-owned extraction context. The provider should accept extraction context instead of permanently owning LinkedIn discovery logic.

## Proposed Shared Contracts

Add or extend schemas in `packages/contracts` for:

- `JobSourceAdapterKind`
  - `auto`
  - `linkedin`
  - `generic_site`
- `JobDiscoveryTarget`
  - `id`
  - `label`
  - `startingUrl`
  - `enabled`
  - `adapterKind`
- `JobDiscoveryPreferences`
  - ordered `targets`
  - optional bounded history limit if needed
- `DiscoveryAdapterSessionState`
  - `adapterKind`
  - `status`
  - `driver`
  - `label`
  - `detail`
  - `lastCheckedAt`
- `DiscoveryRunState`
  - `idle`
  - `running`
  - `completed`
  - `cancelled`
  - `failed`
- `DiscoveryTargetExecution`
  - `targetId`
  - `adapterKind`
  - `state`
  - `startedAt`
  - `completedAt`
  - `jobsFound`
  - `jobsPersisted`
  - `jobsStaged`
  - `warning`
- `DiscoveryActivityEvent`
  - `id`
  - `runId`
  - `timestamp`
  - `kind`
  - `stage`
  - `targetId`
  - `adapterKind`
  - `message`
  - optional `url`
  - optional counts summary fields
- `DiscoveryRunSummary`
  - `targetsPlanned`
  - `targetsCompleted`
  - `validJobsFound`
  - `jobsPersisted`
  - `jobsStaged`
  - `duplicatesMerged`
  - `invalidSkipped`
  - `durationMs`
  - `outcome`
- `DiscoveryRunRecord`
  - `id`
  - `state`
  - `startedAt`
  - `completedAt`
  - ordered target list
  - retained activity entries
  - summary
- `SavedJobDiscoveryProvenance`
  - `targetId`
  - `adapterKind`
  - `startingUrl`
  - `discoveredAt`

Extend:

- `JobSearchPreferences` with a nested `discovery` object
- `SavedJob` with bounded provenance metadata so merged duplicates do not lose where they came from
- Job Finder workspace snapshot with:
  - adapter-scoped discovery sessions
  - current run state
  - active run record
  - recent retained run history

Migration note:

- if the renderer still needs the old single `browserSession` view during transition, derive it from the active adapter session instead of keeping it as the long-term source of truth

## Event Model And Translation Layer

The activity timeline should not render raw browser-agent output directly.

Use a two-step event model:

1. internal raw discovery events emitted by the browser agent, runtime, adapters, and orchestrator
2. curated `DiscoveryActivityEvent` entries translated inside `packages/job-finder`

Translation rules:

- summarize strategy without exposing raw chain-of-thought
- collapse noisy retries into concise human-readable updates
- preserve important warnings, cancellations, and extraction limitations
- distinguish between found, staged, saved, skipped, and deduped jobs

## Discovery Target UI

Add a new section to the Profile Preferences tab for discovery targets.

Each entry should be a structured row, not a plain string list:

- site name
- starting URL
- enabled toggle
- adapter badge or resolved adapter label
- visible order controls

The UI should support:

- add
- edit
- remove
- reorder
- inline URL validation
- disabled entries without deleting configuration
- default `auto` adapter selection with optional manual override
- visible experimental labeling for `generic_site`

## Discovery Activity UI

Add a chat-like activity panel on the Discovery screen.

This is not a freeform chat input. It is a read-only activity/history stream.

Examples of events that should appear:

- `Planning 3 discovery targets`
- `Starting target 1 of 3: LinkedIn UK Product Roles`
- `Opening LinkedIn`
- `Gathering jobs from the results page`
- `This page does not expose stable job URLs, opening detail views`
- `Switching to target 2: YC Jobs Board`
- `Generic site extraction is lower confidence on this page structure`
- `Scored 14 discovered jobs`
- `Saved 11 jobs, staged 3 for review-only mode`

Important:

- show summarized reasoning, not raw internal reasoning
- keep entries concise and user-readable
- preserve enough detail to debug confusing runs later
- show saved vs staged outcomes separately when discovery-only mode is enabled
- the full-history view should include the current in-flight run, not only retained completed runs, and should auto-follow new events until the user intentionally scrolls away

## Sequential-First Orchestration

The first implementation should run targets sequentially in configured order.

Reasons:

- simpler cancellation semantics
- easier event ordering
- lower risk around auth/session instability
- easier provenance tracking and dedupe validation
- safer rollout for the first `generic_site` adapter

## Experimental Generic-Site Adapter

`generic_site` is in scope because multi-site discovery is the end goal, but it should ship with explicit constraints.

Initial behavior:

- user supplies the starting URL
- navigation stays bounded to the resolved hostname unless adapter policy narrows it further
- no assumption that login automation exists
- no generic apply automation
- extraction quality may vary by site layout
- if the adapter cannot produce stable job identity and canonical URL, it should warn and skip persistence rather than save low-quality rows

The UI should make those limits visible so users understand that `generic_site` is useful but less deterministic than purpose-built adapters.

## Future Feature: Parallel Workers

Parallel workers remain a planned future extension, not the default behavior in this plan.

Design notes for later:

- one coordinator
- one Playwright page/tab per worker
- bounded concurrency
- adapter-controlled opt-in
- discovery-only parallelism; login and apply flows remain serialized

Implementation note:

- do not force a worker abstraction into the first delivery unless a clean seam emerges naturally from the sequential orchestrator

## Workstreams

### 1. Contracts And Persistence Shape

- Add discovery-preference, target, adapter-session, run-state, activity-event, run-record, run-summary, and provenance schemas.
- Extend repository state and workspace snapshot for retained discovery history.
- Keep event payloads narrow, typed, and renderer-safe.

### 2. LinkedIn Adapter Extraction And Agent Policy Cleanup

- Define the discovery adapter interface and registry.
- Move the current LinkedIn flow fully behind the adapter boundary.
- Make `packages/browser-agent` policy-driven instead of LinkedIn-hardcoded.
- Start moving source-specific extraction context out of `packages/ai-providers`.

### 3. Event Translation And Single-Target Activity Timeline

- Add raw discovery-event emission.
- Translate raw events into user-facing `DiscoveryActivityEvent` entries inside `packages/job-finder`.
- Ship the timeline UI for the current LinkedIn run before multi-target expansion.

### 4. Sequential Multi-Target Orchestrator

- Run enabled targets one after another in configured order.
- Aggregate events, summaries, and retained run history.
- Merge, dedupe, and preserve provenance across targets.
- Keep cancellation explicit across browser phase and post-processing.

### 5. Experimental Generic-Site Adapter

- Add `generic_site` adapter resolution and target validation.
- Use hostname-scoped navigation policy.
- Surface lower-confidence extraction warnings clearly.
- Skip persistence when stable identity cannot be produced.

### 6. Testing And Hardening

- contract tests for new schemas
- orchestration tests for sequential multi-target runs
- event-translation and ordering tests for activity history
- adapter selection tests by hostname and adapter kind
- provenance and dedupe tests across multiple targets
- cancellation tests across browser phase and post-processing
- explicit tests for `generic_site` bounded-hostname behavior

## Milestones

### Milestone 1: Discovery Contracts And Target Persistence

- add nested discovery contracts
- persist ordered discovery targets and recent run history
- expose adapter-scoped discovery session state in the workspace snapshot

Exit signal:

- the app can hold multiple ordered discovery targets plus retained run metadata locally

### Milestone 2: Real LinkedIn Discovery Adapter

- add adapter registry
- move LinkedIn discovery behind the adapter boundary
- remove LinkedIn hardcoding from the generic browser-agent policy layer

Exit signal:

- discovery no longer assumes one hard-coded LinkedIn source path across job-finder, browser-agent, and runtime

### Milestone 3: Activity Timeline For The Current LinkedIn Flow

- add raw event model
- translate to user-facing activity entries
- add retained activity/history panel in Discovery

Exit signal:

- user can see what the agent is doing throughout a LinkedIn discovery run in human-readable form

### Milestone 4: Sequential Multi-Target Runs

- run enabled targets one after another
- merge, score, and persist or stage results across targets
- preserve provenance and clear run summaries

Exit signal:

- user can run one discovery session across multiple configured targets in deterministic order

### Milestone 5: Experimental Generic-Site Support

- add `generic_site` adapter
- keep hostname-bounded navigation and clear warnings
- validate stable identity before persisting extracted jobs

Exit signal:

- user can add a non-LinkedIn target, run it through the same orchestrator, and understand its limits from the activity timeline and result handling

## Quality Bar

- Keep source-specific logic behind discovery adapters.
- Keep the browser-agent generic through policy/config injection.
- Keep `packages/ai-providers` model-focused rather than product-logic-heavy.
- Keep the activity feed user-facing and concise.
- Do not expose raw model thoughts.
- Do not widen browser-runtime into a site-orchestration layer.
- Preserve typed preload/main/renderer boundaries.
- Keep `generic_site` explicitly experimental until real-world validation improves it.
- Update docs and tests in the same task as implementation.
