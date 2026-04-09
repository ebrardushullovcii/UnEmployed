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



### Recommended Execution Bundles

- `011 Shared Data Expansion` -> first foundation pass so later setup, discovery, resume, and apply work stop inventing parallel memory
- `018 Resume Import And Extraction Reliability` -> completed missing `011` part 2; now turns raw resume import into a local document-understanding pipeline with parser routing, evidence-backed field candidates, and reviewable canonical merges
- `012 Guided Setup And Profile Copilot` -> turns the new `011` roots plus `018` extraction candidates into a real first-run experience and captures the discovery/apply details the app is currently missing
- `013 Source Intelligence And Faster Discovery` -> merged source-debug plus discovery workstream; typed source intelligence first, then provider-aware per-target and run-all discovery, richer job persistence, seen/applied dedupe, and browser closeout improvements
- `014 Resume Content Correctness And Output Quality` -> after stronger profile and job inputs exist; focus first on usable content, editability, and ATS-safe output, not template variety
- `015 Automatic Job Apply` -> final major product workstream after the stronger data, setup, discovery, and resume foundations exist
- `016 Shared Agent Auto Compaction` -> keep ready, but only pull it forward when long-running discovery or apply agents start failing or degrading because of context growth
- `017 Browser Substrate Evaluation And Direction` -> keep as a later benchmark-driven direction note, not as a main product queue item by itself

### `Plan 011 Job Finder Shared Data Expansion`

- status: `done`
- last updated: `2026-04-09`
- linked plan: `docs/exec-plans/completed/011-job-finder-shared-data-expansion.md`
- plan maturity: `completed`
- code areas: `packages/contracts`, `packages/db`, `packages/job-finder`, `apps/desktop`, `docs`
- current focus: completed shared-data baseline across `CandidateProfile`, `SavedJob`, `ApplicationAttempt`, and source-debug links so later setup, discovery, resume, and apply work reuse durable shared roots for narrative, proof, reusable answers, enriched job context, blocker summaries, consent history, and replay memory instead of inventing parallel stores
- next step: reuse the completed `011` roots while starting `012` guided setup and profile copilot so the richer fields become easier to collect and maintain in normal product flows
- blockers: none

### `Plan 018 Resume Import And Extraction Reliability`

- status: `done`
- last updated: `2026-04-10`
- linked plan: `docs/exec-plans/completed/018-job-finder-resume-import-and-extraction-reliability.md`
- plan maturity: `completed`
- code areas: `apps/desktop`, `packages/contracts`, `packages/db`, `packages/job-finder`, `packages/ai-providers`, `docs`
- current focus: completed missing `011` part 2 with persisted import runs, canonical document bundles, field candidates, staged model extraction, safe auto-apply rules, workspace-visible unresolved review candidates, and stronger desktop parser routing including macOS-native PDF and DOCX paths
- next step: build `012` guided setup and profile copilot directly on top of the retained `018` run and candidate substrate instead of inventing a second temporary review model
- blockers: none

### `Plan 012 Guided Setup And Profile Copilot`

- status: `ready`
- last updated: `2026-04-09`
- linked plan: `docs/exec-plans/queued/012-job-finder-guided-setup-and-profile-copilot.md`
- plan maturity: `execution_ready`
- code areas: `apps/desktop`, `packages/job-finder`, `packages/contracts`, `packages/db`, `packages/ai-providers`
- current focus: queued second foundation pass to turn broad first-run profile editing into a concrete guided setup route with resumable setup state, low-confidence review items, readiness checks, discovery/apply-relevant prompts, and a bounded side copilot that applies typed profile patch groups on top of the richer `011` data roots and the extraction-candidate substrate from `018`
- next step: start Milestone 1 after the `011` contract roots and `018` extraction-run direction are clear enough to avoid temporary setup-only storage, then land setup-state contracts, migration defaults, and the `/job-finder/profile/setup` route before widening the side-copilot behavior; the early capture steps should explicitly cover compensation expectations, work authorization, sponsorship, relocation or travel, availability, and short career-transition explanations instead of leaving them to later screeners
- blockers: best started after the initial `011` schema direction is clear enough that setup and chat edits target durable fields instead of temporary shapes, and materially stronger once `018` leaves behind real candidate-evidence artifacts instead of only warnings

### `Plan 013 Job Finder Source Intelligence And Faster Discovery`

- status: `ready`
- last updated: `2026-04-09`
- linked plan: `docs/exec-plans/queued/013-job-finder-source-intelligence-and-faster-discovery.md`
- plan maturity: `execution_ready`
- code areas: `packages/job-finder`, `packages/browser-agent`, `packages/browser-runtime`, `packages/contracts`, `packages/db`, `apps/desktop`
- current focus: merged source-debug plus discovery workstream that turns freeform learned guidance into typed source intelligence, then immediately consumes it for provider-aware collection, one-target and run-all execution, title-first triage, durable seen/applied dedupe, richer job persistence, and browser closeout clarity
- next step: start with the typed source-intelligence schema and override model, then land one-target discovery and provider-aware method selection before broad run-all tuning
- blockers: best after `011` and `012` so discovery can consume stronger shared data and targeting inputs

### `Plan 014 Resume Content Correctness And Output Quality`

- status: `ready`
- last updated: `2026-04-09`
- linked plan: `docs/exec-plans/queued/014-job-finder-resume-output-and-template-quality.md`
- plan maturity: `execution_ready`
- code areas: `packages/job-finder`, `packages/contracts`, `apps/desktop`, `packages/ai-providers`
- current focus: queued resume-quality pass is now execution-ready around the real shipped seams: widen the thin provider-to-draft bridge, add deterministic sanitation for duplicate and job-description-bleed content, make assistant patch application reliable, and ship one strong ATS-safe default renderer before any extra template work
- next step: start Milestone 1 by freezing the current weak output samples and adding duplicate, thin-output, and job-description-bleed fixtures, then widen the draft and render model in contracts and `job-finder` before rebuilding the default desktop export path
- blockers: best after `011` and `012`, but the first usable-output slice should land before serious `015` automation depends on resume quality

### `Plan 015 Automatic Job Apply`

- status: `ready`
- last updated: `2026-04-09`
- linked plan: `docs/exec-plans/queued/015-job-finder-automatic-job-apply.md`
- plan maturity: `execution_ready`
- code areas: `packages/contracts`, `packages/db`, `packages/job-finder`, `packages/browser-runtime`, `packages/browser-agent`, `apps/desktop`
- current focus: queued staged apply evolution: shared apply domains and artifacts first, then one-job apply copilot, then one-job auto-submit, then queue submission with run-scoped multi-submit approval, live consent interrupts, generated profile-grounded answers, skip-with-artifacts recovery, and clear package ownership where browser-agent holds bounded workflow policy while runtime stays generic
- next step: start only after the stronger shared data from `011`, richer guided setup from `012`, merged source-intelligence and discovery work from `013`, and a usable resume path from `014` are in place enough that the first `015` slice lands on durable foundations instead of inventing one-off apply-only state
- blockers: depends on `011`, `012`, `013`, and a good enough `014` first slice for the strongest result; current shipped behavior remains more conservative until `015` lands

### `Plan 016 Shared Agent Auto Compaction`

- status: `ready`
- last updated: `2026-04-09`
- linked plan: `docs/exec-plans/queued/016-shared-agent-auto-compaction.md`
- plan maturity: `execution_ready`
- code areas: `packages/browser-agent`, `packages/job-finder`, `packages/contracts`, `apps/desktop`
- current focus: execution-ready shared infrastructure pass to replace browser-agent-local message-count compaction with a shared token-budget-first policy, cover browser-agent live turns plus source-debug worker and final-review handoff payloads, and leave behind a reusable seam for future `015` apply workers without turning this into a generic chat-history feature
- next step: start with the shared contracts and browser-agent token-estimation seam, then wire the shared policy through runtime discovery options, source-debug worker overrides, and source-debug final-review summary-first handoff, while leaving the current deterministic apply path untouched
- blockers: none, but it does not need to displace the higher-value product work in `013`, `014`, or `015`; pull it forward only when long-running discovery, source-debug, or apply agents become the next concrete blocker

### `Plan 017 Browser Substrate Evaluation And Direction`

- status: `ready`
- last updated: `2026-04-09`
- linked plan: `docs/exec-plans/queued/017-browser-substrate-evaluation-and-direction.md`
- plan maturity: `execution_ready`
- code areas: `packages/browser-runtime`, `packages/browser-agent`, `packages/job-finder`, `apps/desktop`, `docs`
- current focus: execution-ready research and benchmark plan for deciding the later browser-substrate direction across representative discovery, source-debug, and apply workloads while keeping `UnEmployed` orchestration, typed state, approval logic, and evidence quality as hard constraints
- next step: wait until representative post-`013` and post-`015` flows exist, then run the benchmark matrix against the Playwright baseline and serious `agent-browser` candidate paths before choosing between keep, alternate backend, migrate, borrow ideas, or defer
- blockers: should remain sequenced after the main product-loop rebuild because the benchmark evidence is only meaningful once stronger representative discovery and apply flows exist

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
- Build `012` guided setup review flows on top of the completed `018` import-run substrate so unresolved import candidates become actionable first-run questions.
