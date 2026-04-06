# Tracks

Use one track per meaningful workstream, not per person or per chat.

## How To Use This File

- Read `docs/STATUS.md`, then this file, then the linked active or queued exec plan before non-trivial work.
- When a track maps 1:1 to an exec plan, reuse the plan number in the track title to avoid parallel numbering systems.
- Keep each track operational: `status`, `last updated`, `current focus`, and `next step`.
- Put detailed implementation notes in the linked exec plan, not here.
- Move completed context into `docs/HISTORY.md` instead of leaving mini-changelogs in active tracks.

## Status Keys

- `ready`: clear next step, not actively being worked
- `in_progress`: currently owned by an active work session
- `handoff`: partial progress exists and another agent can continue
- `blocked`: waiting on another track or decision
- `done`: completed and reflected in docs or code

## Current Tracks



### Recommended Queue Order

- `011 Shared Data Expansion` -> first foundation pass; multiple later plans depend on richer shared candidate, job, and blocker domains
- `012 Guided Setup And Profile Copilot` -> collects and edits the richer data from `011` instead of leaving it theoretical
- `013 Resume Output And Template Quality` -> best done after `011` and `012` so richer proof-bank and targeting data can improve exports directly
- `014 Structured Source-Debug Artifacts` -> should settle the typed site-intelligence shape before discovery and apply deepen further
- `015 Deterministic Discovery And Provider Research` -> follows `014` so provider-aware discovery consumes the same structured artifact model instead of inventing a parallel one
- `016 Shared Agent Auto Compaction` -> shared infrastructure enabler that should land before the longest-running agent-heavy apply paths
- `017 Automatic Job Apply` -> final major queued product sequence after the stronger data, setup, source-debug, and compaction prerequisites exist
- `018 Browser Substrate Evaluation And Direction` -> cross-cutting decision note that informs runtime choices in parallel, but is not the first implementation queue item by itself

### `Plan 011 Job Finder Shared Data Expansion`

- status: `ready`
- last updated: `2026-04-06`
- linked plan: `docs/exec-plans/queued/011-job-finder-shared-data-expansion.md`
- code areas: `packages/contracts`, `packages/db`, `packages/job-finder`, `apps/desktop`, `docs`
- current focus: queued first foundation pass for shared narrative, proof-bank, answer-bank, richer job or employer context, and blocker or replay data that later discovery, resume, and apply flows can all reuse
- next step: audit the existing schema roots and repository state, extend those roots where possible, and only propose a new top-level domain when the existing saved-job, source-debug, or workspace state structures cannot own the new data cleanly
- blockers: none

### `Plan 012 Guided Setup And Profile Copilot`

- status: `ready`
- last updated: `2026-04-06`
- linked plan: `docs/exec-plans/queued/012-job-finder-guided-setup-and-profile-copilot.md`
- code areas: `apps/desktop`, `packages/job-finder`, `packages/contracts`, `packages/db`, `packages/ai-providers`
- current focus: queued second foundation pass to turn broad first-run profile editing into a guided setup plus side chat that can recommend and apply typed profile edits, using the richer data captured by plan `011`
- next step: define the first-run route shape, low-confidence review behavior, and typed patch contract for profile-copilot edits on top of the shared data expansion from `011`
- blockers: best started after the initial `011` schema direction is clear enough that setup and chat edits target durable fields instead of temporary shapes

### `Plan 013 Resume Output And Template Quality`

- status: `ready`
- last updated: `2026-04-06`
- linked plan: `docs/exec-plans/queued/013-job-finder-resume-output-and-template-quality.md`
- code areas: `packages/job-finder`, `packages/contracts`, `apps/desktop`, `packages/ai-providers`
- current focus: queued resume-quality follow-on to widen the draft and export model, improve proof selection and keyword targeting, and ship a stronger ATS-safe default output without replacing the current workspace model
- next step: turn the starting note into a deeper implementation plan once the richer proof-bank and targeting data from `011` and `012` are clear enough to inform section ranking and export quality validation
- blockers: best after `011` and `012`, even though isolated template work could begin earlier if needed

### `Plan 014 Job Finder Structured Source-Debug Artifacts`

- status: `ready`
- last updated: `2026-04-06`
- linked plan: `docs/exec-plans/queued/014-job-finder-structured-source-debug-artifacts.md`
- code areas: `packages/job-finder`, `packages/browser-agent`, `packages/contracts`, `packages/db`, `apps/desktop`
- current focus: queued source-debug follow-on to replace mostly freeform guidance arrays with typed provider, route, collection-method, and apply-intelligence artifacts that discovery and apply can consume directly
- next step: define the artifact shape and override layering clearly enough that discovery and apply do not create a second overlapping site-intelligence model
- blockers: none

### `Plan 015 Job Finder Deterministic Discovery And Provider Research`

- status: `ready`
- last updated: `2026-04-06`
- linked plan: `docs/exec-plans/queued/015-job-finder-deterministic-discovery-and-provider-research.md`
- code areas: `packages/job-finder`, `packages/browser-agent`, `packages/browser-runtime`, `packages/contracts`, `packages/db`, `apps/desktop`
- current focus: queued discovery redesign to prefer provider-aware collection, API or structured-route fast paths, title-first triage, durable seen-job tracking, and structured user overrides so the system does less expensive browser work on weak candidates
- next step: start after `014` defines the shared structured site-intelligence shape, then use the completed `010` timing baseline to choose the first discovery slices with the highest speed payoff
- blockers: best after `014` so discovery does not duplicate provider and route intelligence in a second model

### `Plan 016 Shared Agent Auto Compaction`

- status: `ready`
- last updated: `2026-04-06`
- linked plan: `docs/exec-plans/queued/016-shared-agent-auto-compaction.md`
- code areas: `packages/browser-agent`, `packages/job-finder`, `packages/contracts`, `apps/desktop`
- current focus: queued shared infrastructure follow-on to extend the current browser-agent message-count compaction into a shared token-budget compaction policy that all long-running agents and orchestrators can reuse, with a configurable default threshold around `150_000` tokens and message-count fallback where token estimation is not available
- next step: decide the shared settings shape and whether the first implementation should stay `Job Finder`-scoped or immediately become repo-shared infrastructure for all agentic flows
- blockers: should land before or alongside the longest-running later `008` apply flows, but does not need to block earlier product or schema work

### `Plan 017 Automatic Job Apply`

- status: `ready`
- last updated: `2026-04-06`
- linked plan: `docs/exec-plans/queued/017-job-finder-automatic-job-apply.md`
- code areas: `packages/contracts`, `packages/db`, `packages/job-finder`, `packages/browser-runtime`, `packages/browser-agent`, `apps/desktop`
- current focus: queued final major product sequence now re-authored as a staged apply evolution: shared apply domains and artifacts first, then one-job apply copilot, then one-job auto-submit, then queue submission with run-scoped multi-submit approval, live consent interrupts, generated profile-grounded answers, skip-with-artifacts recovery, and clear package ownership where browser-agent holds bounded workflow policy while runtime stays generic
- next step: start only after the stronger shared data from `011`, richer guided setup from `012`, structured source-debug intelligence from `014`, and preferably shared compaction from `016` are in place enough that the first `017` slice lands on durable foundations instead of inventing one-off apply-only state
- blockers: depends on `011`, `012`, and `014` at minimum for the strongest result; `016` should land before or during the longest-running later apply flows; current shipped behavior remains more conservative until `017` lands

### `Plan 018 Browser Substrate Evaluation And Direction`

- status: `ready`
- last updated: `2026-04-06`
- linked plan: `docs/exec-plans/queued/018-browser-substrate-evaluation-and-direction.md`
- code areas: `packages/browser-runtime`, `packages/browser-agent`, `packages/job-finder`, `apps/desktop`, `docs`
- current focus: queued small cross-cutting direction note capturing the current conclusion that `agent-browser` is the leading browser-substrate candidate when speed and quality dominate the decision, while `UnEmployed` should keep its own orchestration, source-debug model, and approval logic and continue deeper benchmarking later before choosing a larger runtime move
- next step: use the completed `010` performance work plus later discovery and source-debug and apply benchmarks to decide whether the next serious runtime move is `keep Playwright`, `add agent-browser as an alternate backend`, or `migrate the default substrate`
- blockers: should remain a direction note until stronger representative benchmarking exists across discovery, source-debug, and apply flows

### `Plan 009 Full App Copy Pass`

- status: `done`
- last updated: `2026-04-06`
- linked plan: `docs/exec-plans/completed/009-full-app-production-copy-pass.md`
- code areas: `apps/desktop`, `docs`
- current focus: completed full-app product-language and surface cleanup pass across shipped `Job Finder` and shared shell surfaces, including nav renames (`Find jobs`, `Shortlisted`, `Applications`), removal of low-value internal fields, simplified source-setup copy, settings cleanup, and later structural polish like `Shortlisted` readiness checklists, `Applications` triage filters, and optional-detail grouping in `Profile`
- next step: reuse this completed copy baseline for later UX polish or any follow-on wording cleanup that lands alongside active implementation work, especially remaining Discovery compression or deeper Applications recovery behavior
- blockers: none

## Completed Background

### `Plan 010 Browser Efficiency And Speed`

- status: `done`
- last updated: `2026-04-06`
- linked plan: `docs/exec-plans/completed/010-job-finder-browser-efficiency-and-speed.md`
- code areas: `packages/browser-runtime`, `packages/browser-agent`, `packages/job-finder`, `apps/desktop`
- current focus: completed measurement-first implementation including named waiting states, retained discovery and source-debug timing summaries, test-only performance snapshots, dynamic per-target discovery budgets, deterministic merge fit scoring, narrower hot-path SQLite persistence, earlier deferred-extraction flushes, early shutdown for cold discovery sources, source-debug later-phase route reuse, guards against malformed route hints and repeated interaction failures, and early closeout for stalled evidence collection

### `Plan 007 Resume Workspace`

- status: `done`
- last updated: `2026-04-06`
- linked plan: `docs/exec-plans/completed/007-job-finder-resume-workspace.md`
- code areas: `packages/job-finder`, `packages/contracts`, `packages/db`, `packages/knowledge-base`, `packages/browser-runtime`, `apps/desktop`
- current focus: completed resume workspace functionality including review-queue apply gating aligned with approved export reality, checklist-style readiness views in `Shortlisted`, truthful supported-versus-manual apply-path messaging, and handoff clarity for apply safety

### `Plan 005 Source Debug Agent`

- status: `done`
- last updated: `2026-04-05`
- linked plan: `docs/exec-plans/completed/005-job-source-debug-agent.md`
- current focus: completed enough for current work and now mainly background for future tightening

### `Plan 004 Generic Discovery`

- status: `done`
- last updated: `2026-04-05`
- linked plan: `docs/exec-plans/completed/004-job-finder-generic-discovery.md`
- current focus: completed enough for current work and now mainly background for future tightening

### `Plan 003 Profile Information Architecture`

- status: `done`
- last updated: `2026-04-05`
- linked plan: `docs/exec-plans/completed/003-job-finder-profile-information-architecture.md`
- current focus: completed enough for current work and now mainly background for future tightening

## Ready Queue

- Expand Applications with retry controls and attempt-centric recovery views beyond the shipped filters.
- Add broader runtime tests for unsupported apply branches, live-browser extraction, and resume-import flows.
- Improve cleanup and fallback extraction so difficult PDF and DOCX resumes yield cleaner structured text before the agent runs.
