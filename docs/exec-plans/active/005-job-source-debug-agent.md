# 005 Job Source Debug Agent

Status: active

## Implementation Status

The first architecture slice is now landed:

- typed source-debug run, attempt, evidence, compaction, instruction, and verification contracts exist
- `packages/db` persists dedicated source-debug runs, attempts, evidence refs, and instruction artifacts outside the singleton discovery-state blob
- `packages/job-finder` owns a sequential source-debug orchestrator with manual-prerequisite pauses, phase handoff, instruction synthesis, and replay verification
- `packages/job-finder` now also factors the phase sequencing into a reusable artifact-oriented orchestrator helper
- `packages/browser-agent` now supports worker-side transcript compaction and returns compacted metadata rather than exposing its full transcript to the orchestrator
- Profile Preferences exposes a `Debug source` target action plus instruction-status metadata
- desktop IPC/preload now exposes source-debug run, cancel, get/list, save-artifact, and verify actions for follow-on UI work
- source-debug now includes a bounded `apply_path_validation` phase that records safe apply-entry guidance without submitting an application, and approved LinkedIn apply forwards validated guidance into the supported runtime
- Profile Preferences now renders learned source instructions separately from manual override text so successful debug runs no longer look empty when `customInstructions` stays blank
- The orchestrator now curates learned instructions more aggressively: exact sample URLs, per-job result counts, and raw phase boilerplate are filtered out in favor of reusable controls, filter gotchas, navigation patterns, and apply-entry guidance
- Source-debug now forces stronger proof of repeatable entry paths, visible search/filter controls, recommendation or `show all` routes, and pagination behavior before promotion can pass
- Source-debug no longer pre-pauses the run behind a LinkedIn-only session preflight; the worker now gets a chance to report auth blockers during the access/auth phase like any other target
- Internal agent/runtime failures no longer get persisted as learned instruction text
- The browser-agent now falls back to visible DOM controls and looser role-name matching when accessibility snapshots are too thin, so recommendation modules, `show all` links, and visible filters are less likely to be missed on sites like LinkedIn
- Worker transcript compaction now preserves complete assistant/tool-call exchanges instead of leaving orphaned `tool` messages behind, which fixes the provider-side tool-calling failure that was truncating some live source-debug phases
- Source-debug worker phases no longer auto-stop just because they sampled the first matching job; they now keep probing until they explicitly `finish`, which prevents site-structure/search-filter runs from collapsing into premature one-job summaries
- Validation now requires at least one positively proven reusable search/filter or recommendation-route signal; runs that only say visible controls existed but were not proven stay `draft`
- Workers are now instructed to prefer visible search/filter surfaces over hand-authored URL parameter recipes when the UI already exposes reusable controls
- Source-debug task-packet runs now get a forced final closeout turn near their step limit; if the worker still fails to `finish`, the agent/runtime synthesizes typed partial-evidence findings instead of silently dropping the observed controls and routes
- Attempt and phase-summary artifacts now persist explicit completion modes, completion reasons, and lightweight phase-evidence payloads so the orchestrator can distinguish structured finishes from partial timeouts and runtime failures
- Desktop IPC/preload now exposes typed source-debug run-details payloads, and Profile Preferences has a compact per-target review modal for retained runs, per-phase outcomes, evidence counts, verification actions, and inline learned-instruction edit/remove controls on the target card
- Live source-debug and agent-discovery runs now explicitly open the browser session at run start and close it again on completion, failure, or cancellation so the visible browser window reflects whether work is still active
- Run shutdown now also terminates the spawned Chrome process instead of only closing the Playwright connection, and the worker can explicitly `scroll_to_top` so long homepage job boards can re-check header search/filter controls after deep scrolling
- Live discovery and supported apply flows now only consume the active instruction artifact for the matching target: the current draft artifact applies automatically for that target, and validated artifacts apply when no newer draft has replaced them
- Final learned-instruction curation now strips more runtime/tool chatter (`extract_jobs`, `get_interactive_elements`, pointer-event / timeout hints) and suppresses contradictory “no visible filters” claims when phase evidence already captured named controls
- Final learned-instruction curation now also has a dedicated end-of-run reviewer pass that receives richer per-phase timestamps, attempted actions, compaction summaries, and ephemeral review-transcript lines before persistence, so contradiction cleanup is based on more than the synthesized findings alone while raw worker chat still stays out of stored artifacts by default
- Source-debug worker prompts and the final reviewer prompt now explicitly frame findings as reusable instructions for future discovery runs rather than reports about the sampled run, and the curation layer now strips extraction/sample-size chatter such as `0 or 1 jobs extracted` unless it actually reflects a durable site constraint
- The final reviewer now acts as an organizer over the full sequence of phase tests, including each phase goal, success criteria, stop conditions, retained evidence, and review transcript snippets, so the final artifact is based on the whole debug run rather than only heuristic line merging
- Re-verification now replays the selected instruction artifact as the instruction set under review and publishes a successor artifact from the new evidence instead of mutating the reviewed artifact in place mid-run

The next work on this plan is QA/hardening rather than first implementation.

## Goal

Add a job-source debug-agent workflow for Profile Preferences so the app can learn and verify reusable source instructions when a user adds a new job source but does not know how to author those instructions manually.

## Why This Work Exists

The adapter-driven discovery refactor created the right target model, activity timeline, and experimental `generic_site` path, but it still leaves too much source knowledge either hardcoded in adapters or assumed to come from the user.

That creates five immediate problems:

1. Adding a new source still asks the user to know too much about how that site works.
2. A one-off exploratory run does not automatically leave behind reusable instructions for later agents.
3. Auth walls, search inputs, filters, result pages, and job-detail routes vary enough that low-context generic discovery is fragile.
4. The system needs a way to prove that learned instructions actually work before normal discovery agents depend on them.
5. This learning flow is likely better as an orchestrated sequence of narrower agents or phases than one giant prompt that tries to do everything at once.

## Product Direction

- Let users add a source target with only a label and starting URL when that is all they know.
- If instructions are missing or low-confidence, offer a debug-agent workflow from Profile Preferences.
- Keep the learning flow agent-first rather than falling back immediately to hand-authored scrapers.
- Use a sequential orchestrator that can hand findings from one phase or agent to the next.
- Persist curated findings as reusable source instructions plus validation metadata.
- Require replay verification before instructions become the default guidance for the real discovery agents.
- Keep navigation bounded to the source hostname unless a purpose-built adapter allows something narrower.
- Treat auth honestly: the system can detect login requirements and guide the user through manual prerequisites, but it should not invent credentials or try to bypass site protections.

## Desired User Flow

1. The user adds a new discovery target in Profile Preferences.
2. If the target has no usable instructions, the UI offers `Debug source` or prompts the user to run it.
3. The orchestrator opens a bounded debug session for that target.
4. Sequential phases probe auth requirements, site layout, search inputs, filters, results lists, detail pages, apply-entry paths, and other navigation constraints.
5. The system synthesizes a draft instruction artifact plus a readable evidence summary.
6. A verification phase replays the draft instructions in a fresh pass and confirms they can still reach jobs and vary results.
7. The user can review, edit, remove, rerun, or keep the instructions in draft mode while they are already active for that target.

## Scope

### In Scope

- Target-level debug-session state, findings, evidence summaries, and reusable instruction drafts.
- A Profile Preferences entrypoint for launching a debug run from a newly added source.
- Sequential orchestration with explicit phase handoff and retained activity history.
- Hostname-bounded exploration with safe-stop behavior.
- Validation that the learned instructions can reach job results, open job details, change result sets through search terms or filters when the site supports them, and capture safe apply-entry guidance when the source exposes it.
- Promotion of validated findings into target instructions that normal discovery agents can consume later.

### Out Of Scope

- Unbounded crawling across arbitrary external sites.
- Bypassing captchas, paywalls, 2FA, or other site protections.
- Storing credentials or raw secrets in findings artifacts.
- Fully generic apply-flow authoring or submission for arbitrary sites in v1.
- Making parallel multi-agent execution a requirement for the first delivery.

## UX Principles

- The flow should feel like source bootstrap, not a raw developer console.
- Users should be able to see what has been proven versus what is still inferred.
- Activity entries should stay readable and user-facing rather than exposing raw model reasoning.
- Auth requirements and manual user steps should be visible and explicit.
- Low-confidence findings should stay draft or unsupported instead of being silently promoted into production instructions.
- Replay success alone is not enough to validate a source; the retained artifact should also prove reusable search/navigation guidance plus reusable detail/apply guidance.
- Validation should bias toward real operator value: future agents should learn the best entry path, visible search/filter controls, recommendation-route behavior, and stable detail/apply rules rather than only a minimal “jobs exist here” summary.

## Orchestration Model

`packages/job-finder` should own one sequential coordinator for the first delivery.

That coordinator can run specialized agents or narrower phase-specific prompt profiles over the same generic browser-agent core.

Recommended phases:

### 1. Access And Auth Probe

- determine whether public browsing is possible
- detect login walls, session expiry, consent banners, and obvious blockers
- record whether the user must authenticate manually before more testing continues

### 2. Site Structure Mapping

- identify the primary jobs landing path
- find the main search entrypoints
- map the likely result-list and job-detail routes
- capture layout constraints the later phases need to respect

### 3. Search And Filter Probe

- test keyword or role search
- test location or work-mode filters when present
- test obvious visible filters on simple pages before concluding there is no reusable control coverage
- test recommendation rows, curated collections, chips, or `show all` links when they appear to create preselected job lists
- when a jobs landing page starts with recommendation cards instead of a full result grid, follow `show all` or a reusable collection path before deciding the route is thin
- test whether result changes are observable and reliable
- note pagination, infinite-scroll, or lazy-load behavior

### 4. Job-Detail Validation

- open multiple jobs from the results list
- confirm the agent can move from search results into a job detail page repeatedly
- identify stable identity signals, canonical URLs, and obvious extraction pitfalls

### 5. Replay Verification

- start from the stored findings rather than the exploratory context
- rerun the learned instructions in a fresh pass
- confirm the flow still reaches jobs, opens details, and changes results across multiple page states

### 6. Apply Path Validation

- inspect discovered jobs for inline apply, external redirect, or missing apply-entry patterns
- capture safe apply-entry guidance without submitting an application
- treat this as reusable instruction data, not as a green light for autonomous submission on arbitrary sources

Each phase should emit structured findings that the next phase consumes. The orchestrator should store both the user-facing timeline and the structured handoff payloads.

## Findings And Instruction Artifacts

The debug-agent flow should persist artifacts that capture:

- source label, hostname, and bounded starting URLs
- auth requirements and any manual prerequisites
- recommended navigation path to reach jobs
- search inputs, filter controls, and result-changing recipes
- job-card and job-detail navigation guidance
- safe apply-entry guidance when the source exposes an apply path
- stable job identity hints and canonical URL rules
- unsupported areas, warnings, and confidence notes
- last verified timestamp plus a short proof summary
- editable instruction text or structured guidance that the normal discovery agents can consume later

The retained artifact should be curated. It should not be a raw DOM dump, raw model transcript, or chain-of-thought log.

## Proposed Shared Contracts

Add or extend schemas in `packages/contracts` for concepts such as:

- `SourceDebugRunState`
- `SourceDebugPhase`
- `SourceDebugActivityEvent`
- `SourceDebugFinding`
- `SourceInstructionDraft`
- `SourceInstructionVerification`
- target-level saved instructions, validation status, and last debug timestamp

Exact names can change, but the product shape should preserve three ideas:

1. exploratory findings
2. reusable instructions
3. explicit verification status

## Package Responsibilities

- `packages/contracts`
  - typed debug-run, finding, instruction, and verification schemas
- `packages/job-finder`
  - orchestration, phase handoff, artifact synthesis, persistence, and timeline translation
- `packages/browser-agent`
  - generic exploration and verification tool loops with phase-specific context injection
- `packages/browser-runtime`
  - session lifecycle, auth checks, and browser-safe primitives without owning source orchestration
- `apps/desktop`
  - Profile Preferences trigger, debug-run status, findings review, and instruction promotion UI

## Workstreams

### 1. Contracts And Persistence Shape

- add typed debug-run, phase, finding, instruction-draft, and verification schemas
- persist target-level instruction artifacts and last verification state
- keep artifacts narrow enough for preload/renderer boundaries

Status:
- done in the first source-debug implementation slice

### 2. Profile Preferences Entry Surface

- add `Debug source` entrypoint for targets with missing or draft instructions
- show current instruction status such as `missing`, `draft`, `validated`, or `unsupported`
- surface retained summaries and rerun controls without turning Preferences into a noisy developer panel

Status:
- `Debug source` plus target instruction status is landed
- retained summaries/review affordances still need broader UI follow-up

### 3. Sequential Debug Orchestrator

- create the coordinator in `packages/job-finder`
- run phases in order with explicit handoff payloads
- stop cleanly on auth blockers, unsupported layouts, or unstable navigation

Status:
- landed for the initial sequential phase set with manual-prerequisite pauses and replay verification

### 4. Instruction Synthesis And Review

- synthesize curated source instructions from findings
- keep the instructions editable and reviewable by the user
- preserve warnings and unsupported edges instead of flattening everything into false certainty

Status:
- synthesis is landed
- compact retained-run review UI is now landed
- deeper edit/history affordances still need follow-up

### 5. Replay Verification Gate

- rerun the learned instructions in a fresh pass
- prove they can reach job results, open detail pages, and vary result sets
- require successful replay before marking instructions as validated

Status:
- landed in the initial implementation slice

### 6. Testing And Hardening

- contract tests for new schemas
- orchestrator tests for phase order and handoff
- verification tests for promotion rules
- timeline tests for readable event wording
- bounded-hostname and auth-blocker tests

Status:
- contract, persistence, orchestrator, manual-blocker, and worker-compaction coverage landed
- forced-closeout, partial-evidence persistence, and review-UI coverage landed
- live QA, wording cleanup, and broader hostile-site coverage remain

## Milestones

### Milestone 1: Target Debug State And Launch Flow

- add debug-session and instruction-status persistence
- expose launch controls from Profile Preferences

Exit signal:

- a newly added target can show missing-instruction state and start a retained debug run

### Milestone 2: Exploratory Debug Phases

- land the sequential auth, structure, search/filter, and job-detail phases
- capture structured findings and readable timeline events

Exit signal:

- the system can probe a bounded source and produce a draft findings artifact instead of only a one-off live run

### Milestone 3: Instruction Draft Synthesis

- synthesize reusable target instructions from the findings artifact
- expose review and rerun controls in the UI

Exit signal:

- a user can review the learned instructions that will later guide normal discovery agents

### Milestone 4: Replay Verification And Promotion

- rerun the learned instructions in a fresh verification pass
- promote only validated instructions into the target's default guidance

Exit signal:

- a debugged source can prove it can navigate to jobs, vary results, and reopen detail pages before the real agents rely on it

## Quality Bar

- Keep the flow hostname-bounded unless a source-specific adapter says otherwise.
- Detect and surface auth requirements explicitly instead of pretending the site is public.
- Do not mark instructions as validated until replay proves the flow can navigate more than one relevant page or result state.
- When search or filters exist, prove they can change the result set rather than only loading the same default page twice.
- Keep thin route-only findings in `draft` even if replay succeeds; require stronger reusable guidance about how to reach jobs plus how detail/apply behavior works before promotion.
- Keep findings curated and user-readable; do not expose raw model thoughts.
- Stop with a clear unsupported or draft outcome when the site cannot be mapped safely enough.
- Update docs and tests in the same task as implementation.

## Relationship To Existing Discovery Work

This plan is a follow-on to `docs/exec-plans/active/004-job-finder-adapter-driven-discovery.md`.

Plan `004` made target configuration, retained activity, and sequential discovery orchestration real. Plan `005` turns the per-target instruction seam into a first-class product workflow by letting the app learn and verify those instructions when the user cannot supply them alone.
