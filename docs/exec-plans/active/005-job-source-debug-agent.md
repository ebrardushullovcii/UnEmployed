# 005 Job Source Debug Agent

Status: active

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
4. Sequential phases probe auth requirements, site layout, search inputs, filters, results lists, detail pages, and other navigation constraints.
5. The system synthesizes a draft instruction artifact plus a readable evidence summary.
6. A verification phase replays the draft instructions in a fresh pass and confirms they can still reach jobs and vary results.
7. The user can review, accept, edit, rerun, or keep the instructions in draft mode.

## Scope

### In Scope

- Target-level debug-session state, findings, evidence summaries, and reusable instruction drafts.
- A Profile Preferences entrypoint for launching a debug run from a newly added source.
- Sequential orchestration with explicit phase handoff and retained activity history.
- Hostname-bounded exploration with safe-stop behavior.
- Validation that the learned instructions can reach job results, open job details, and change result sets through search terms or filters when the site supports them.
- Promotion of validated findings into target instructions that normal discovery agents can consume later.

### Out Of Scope

- Unbounded crawling across arbitrary external sites.
- Bypassing captchas, paywalls, 2FA, or other site protections.
- Storing credentials or raw secrets in findings artifacts.
- Fully generic apply-flow authoring for arbitrary sites in v1.
- Making parallel multi-agent execution a requirement for the first delivery.

## UX Principles

- The flow should feel like source bootstrap, not a raw developer console.
- Users should be able to see what has been proven versus what is still inferred.
- Activity entries should stay readable and user-facing rather than exposing raw model reasoning.
- Auth requirements and manual user steps should be visible and explicit.
- Low-confidence findings should stay draft or unsupported instead of being silently promoted into production instructions.

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

Each phase should emit structured findings that the next phase consumes. The orchestrator should store both the user-facing timeline and the structured handoff payloads.

## Findings And Instruction Artifacts

The debug-agent flow should persist artifacts that capture:

- source label, hostname, and bounded starting URLs
- auth requirements and any manual prerequisites
- recommended navigation path to reach jobs
- search inputs, filter controls, and result-changing recipes
- job-card and job-detail navigation guidance
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

### 2. Profile Preferences Entry Surface

- add `Debug source` entrypoint for targets with missing or draft instructions
- show current instruction status such as `missing`, `draft`, `validated`, or `unsupported`
- surface retained summaries and rerun controls without turning Preferences into a noisy developer panel

### 3. Sequential Debug Orchestrator

- create the coordinator in `packages/job-finder`
- run phases in order with explicit handoff payloads
- stop cleanly on auth blockers, unsupported layouts, or unstable navigation

### 4. Instruction Synthesis And Review

- synthesize curated source instructions from findings
- keep the instructions editable and reviewable by the user
- preserve warnings and unsupported edges instead of flattening everything into false certainty

### 5. Replay Verification Gate

- rerun the learned instructions in a fresh pass
- prove they can reach job results, open detail pages, and vary result sets
- require successful replay before marking instructions as validated

### 6. Testing And Hardening

- contract tests for new schemas
- orchestrator tests for phase order and handoff
- verification tests for promotion rules
- timeline tests for readable event wording
- bounded-hostname and auth-blocker tests

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
- Keep findings curated and user-readable; do not expose raw model thoughts.
- Stop with a clear unsupported or draft outcome when the site cannot be mapped safely enough.
- Update docs and tests in the same task as implementation.

## Relationship To Existing Discovery Work

This plan is a follow-on to `docs/exec-plans/active/004-job-finder-adapter-driven-discovery.md`.

Plan `004` made target configuration, retained activity, and sequential discovery orchestration real. Plan `005` turns the per-target instruction seam into a first-class product workflow by letting the app learn and verify those instructions when the user cannot supply them alone.
