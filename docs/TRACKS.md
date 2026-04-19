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
- `019 World-Class Resume Import` -> pulled-forward importer-quality rebuild that preserves the `018` substrate but replaces the text-first parser core with a benchmarked local executor architecture, richer document IR, cross-platform sidecar packaging, and composite confidence before any future remote fallback discussion
- `012 Guided Setup And Profile Copilot` -> turns the new `011` roots plus `018` extraction candidates into a real first-run experience and captures the discovery/apply details the app is currently missing
- `013 Source Intelligence And Faster Discovery` -> merged source-debug plus discovery workstream; typed source intelligence first, then provider-aware per-target and run-all discovery, richer job persistence, seen/applied dedupe, and browser closeout improvements
- `014 Resume Content Correctness And Output Quality` -> completed ATS-first resume baseline covering usable content, editability, and output quality rather than template variety
- `015 Automatic Job Apply` -> final major product workstream after the stronger data, setup, discovery, and resume foundations exist
- `016 Shared Agent Auto Compaction` -> completed reusable compaction baseline for long-running discovery, source-debug, and future apply workers so prompt growth no longer has to wait behind later product slices
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
- last updated: `2026-04-09`
- linked plan: `docs/exec-plans/completed/018-job-finder-resume-import-and-extraction-reliability.md`
- plan maturity: `completed`
- code areas: `apps/desktop`, `packages/contracts`, `packages/db`, `packages/job-finder`, `packages/ai-providers`, `docs`
- current focus: completed missing `011` part 2 with persisted import runs, canonical document bundles, field candidates, staged model extraction, safe auto-apply rules, workspace-visible unresolved review candidates, and stronger desktop parser routing including macOS-native PDF and DOCX paths
- next step: build `012` guided setup and profile copilot directly on top of the retained `018` run and candidate substrate instead of inventing a second temporary review model
- blockers: none

### `Plan 019 Job Finder World-Class Resume Import`

- status: `done`
- last updated: `2026-04-15`
- linked plan: `docs/exec-plans/completed/019-job-finder-world-class-resume-import.md`
- plan maturity: `completed`
- code areas: `apps/desktop`, `packages/contracts`, `packages/db`, `packages/job-finder`, `packages/ai-providers`, `docs`
- current focus: the local parser-executor seam now includes a spawned Python sidecar fallback path, the desktop benchmark harness is runnable, scripted desktop test flows force deterministic AI for stable QA, and local desktop builds now prepare a bundled native sidecar artifact for the current host platform so resume import no longer depends on ambient Python PDF packages during normal local use
- next step: use the completed `019` implementation plus retained benchmark corpus as the baseline while validating packaged native sidecar artifacts on each supported desktop release platform
- additional note: current `019` hardening now widens sidecar DOCX extraction to include tables plus headers/footers, falls back to the embedded DOCX parser when sidecar output is suspiciously thin, and renames the host-aware packaging helper to `prepare:resume-parser-sidecar:matrix`
- additional note: benchmark reports for `019` now preserve mixed parser-manifest evidence via both `parserManifestVersion` and `parserManifestVersions`, so retained corpus QA still shows which manifests actually ran when one replay spans embedded and sidecar routes
- additional note: the latest 2026-04-15 follow-up also makes successful import finalization atomic across canonical profile/search-preference writes and retained import artifacts, with matching file-backed plus in-memory repository coverage
- additional note: the same 2026-04-15 follow-up now also assigns a fresh stored document-bundle id to every import run, including resume refreshes from stored text, so retained bundle history is no longer overwritten when later runs reuse the same source resume
- blockers: none, but it should run ahead of deeper `012` and `014` dependence on imported profile quality if resume import remains the current quality bottleneck

### `Plan 012 Guided Setup And Profile Copilot`

- status: `done`
- last updated: `2026-04-15`
- linked plan: `docs/exec-plans/completed/012-job-finder-guided-setup-and-profile-copilot.md`
- plan maturity: `completed`
- code areas: `apps/desktop`, `packages/job-finder`, `packages/contracts`, `packages/db`, `packages/ai-providers`
- current focus: milestone two now extends the landed setup route by deriving durable `profileSetupState.reviewItems` from unresolved resume-import candidates, preserving resolved states across refreshes, keeping explicit in-progress setup navigation stable even after readiness improves, surfacing the current step's pending review work, shipping direct review-item edit jumps with direct field focus or record reopen behavior across essentials plus nested setup records, keeping Profile Copilot as a floating expandable chat with optimistic sends and starter questions, fixing the explicit-save portfolio URL resolution bug, preserving semantic imported record ids through renderer field arrays, teaching deterministic copilot setup edits to handle practical years-of-experience changes plus richer Preferences requests including multi-edit prompts, expected salary, preferred work mode, and job-source additions such as `KosovaJob`, hiding invalid clear-value actions for non-nullable years-of-experience review items, aligning fresh-start years-of-experience readiness and preload semantics around the existing `0` sentinel, returning grounded no-op feedback when requested sources already exist, re-enabling disabled saved sources instead of duplicating them, forcing discovery-target and other list-heavy search-preference rewrites through explicit review instead of broad auto-apply, removing stale `Last action` footer copy, keeping the floating bubble toggle-plus-drag behavior clear of the Profile save area, mirroring setup's unsaved-draft copilot send/apply/reject/undo guard on the full `Profile` screen, and keeping the shared composer editable while replies are pending while the refreshed desktop setup harness plus the Preferences copilot capture stay green through essentials draft/save truth, bounded copilot years-of-experience proof, background edit-jump proof, reviewed source-apply proof, blocked full-Profile mutation proof, compact recent-changes tray toggling, and full ready-check completion
- next step: reuse the completed setup and Profile Copilot baseline for later downstream work or targeted polish instead of treating `012` as an active unfinished track
- additional note: the latest perfection pass cleaned developer-speak copy from setup, replaced camelCase field keys with human labels in revision summaries, completed the `profile-setup-screen-helpers` file split, and renamed `listResumeDraftValues` to `listCollectionValues`; `pnpm verify` passes clean
- additional note: the same `012` continuation now also renders markdown-like assistant transcript formatting as structured chat content instead of raw `.md`, and the Preferences capture harness records a dedicated markdown transcript screenshot for manual QA
- additional note: resume import and refresh are now blocked while setup or full-Profile drafts are unsaved so imported workspace updates cannot silently wipe in-progress edits
- additional note: the floating full-Profile copilot now keeps its open rail above the save footer, the collapsed bubble can be toggled by click or keyboard as well as drag, and the resume panel keeps a visible fallback-quality note when import had to degrade through embedded parsing
- additional note: fresh-workspace Profile nav now resolves directly to guided setup from the shell instead of briefly rendering the full Profile screen first, while an explicit `Open full Profile` action from setup still bypasses that redirect so users can leave setup early without a bounce
- additional note: the same 2026-04-15 follow-up also makes Profile Copilot auto-apply persistence atomic across profile/search-preference updates, derived setup state, revision history, and final patch-group status so partial writes cannot leave assistant state inconsistent
- additional note: a later renderer-only follow-up on 2026-04-15 also keeps setup and full-Profile draft comparisons aligned to the same persisted baseline during prop-driven form resets, preventing transient dirty-state mismatches after workspace updates, and restores explicit typed annotations on the renderer bridge callbacks that forward Profile Copilot and source-debug requests
- additional note: a later shell cleanup on 2026-04-15 also removes the unused `actionMessage` prop from the top-level `JobFinderShell` wrapper so action-status messaging stays owned by the concrete screens and footers that actually render it
- note: the current `012` continuation also widened deterministic field coverage so explicit requests can now reach more of the already-supported patch/apply surface across identity, work-eligibility, professional summary, narrative, answer bank, application identity, skill groups, top-level profile skills, and scalar search preferences, while broader list-heavy preference rewrites and approval-mode changes remain review-first
- final-check note: `apps/desktop/src/renderer/src/features/job-finder/screens/profile-screen.tsx` is now back under the renderer structure warning budget via `screens/profile-screen-hooks.ts`, the full-Profile save footer shows action feedback again, and starter prompts are scoped to the active profile tab instead of unrelated review domains
- visual-qa note: perfection-level visual QA completed across 80 screenshots in 13 batches with full verdicts in `apps/desktop/test-artifacts/ui/VISUAL-QA-TRACKER.md`; 3 issues found total and all 3 are now fixed, regenerated, and visually re-verified
- final cleanup note: a 2026-04-15 cleanup round re-ran `pnpm verify`, desktop build, benchmark plus scripted UI captures (`ui:capture` dark + light, `ui:resume-import` TXT + PDF, `ui:profile-baseline`, `ui:profile-setup`, `ui:profile-copilot-preferences`, `ui:resume-workspace`, and `ui:resume-workspace-dirty`) and an independent release-QA pass returned Go-with-risk pending only cross-platform native sidecar packaging proof
- blockers: best started after the initial `011` schema direction is clear enough that setup and chat edits target durable fields instead of temporary shapes, and materially stronger once `018` leaves behind real candidate-evidence artifacts instead of only warnings

### `Plan 013 Job Finder Source Intelligence And Faster Discovery`

- status: `done`
- last updated: `2026-04-16`
- linked plan: `docs/exec-plans/completed/013-job-finder-source-intelligence-and-faster-discovery.md`
- plan maturity: `completed`
- code areas: `packages/job-finder`, `packages/browser-agent`, `packages/browser-runtime`, `packages/contracts`, `packages/db`, `apps/desktop`, `docs`
- current focus: completed merged source-debug plus discovery workstream: typed provider, route, collection, apply, reliability, and override intelligence now flows from source-debug into discovery; discovery now supports provider-aware public-API fast paths, one-target and run-all execution on one target-level pipeline, title-first triage, durable discovery-ledger dedupe, richer saved-job persistence, and explicit browser closeout summaries
- next step: reuse the completed `013` discovery baseline while carrying its typed source intelligence into the already completed `014` resume-quality baseline and the active `015` apply-automation work instead of rebuilding source intelligence again
- additional note: retained live benchmark evidence now lives in `docs/exec-plans/completed/013-benchmark-results.md`; it shows strong discovery wins on Greenhouse and Lever, better typed source-debug output on all benchmarked targets, and remaining follow-up risk around Kosovajob browser startup plus source-debug runtime caps; the benchmark-exposed Greenhouse offset-timestamp parsing bug is now fixed in repo state
- blockers: none

### `Plan 014 Resume Content Correctness And Output Quality`

- status: `done`
- last updated: `2026-04-19`
- linked plan: `docs/exec-plans/completed/014-job-finder-resume-output-and-template-quality.md`
- plan maturity: `completed`
- code areas: `packages/job-finder`, `packages/contracts`, `apps/desktop`, `packages/ai-providers`
- current focus: completed ATS-first resume-quality pass: the thin provider-to-draft bridge is widened with structured entries, deterministic sanitation and richer validation categories now catch duplicate section content / job-description bleed / thin output / keyword stuffing / filler language, assistant resume edits preflight and apply atomically, desktop export plus editor flows operate on a structured ATS-first resume document, and the shipped layout surface is intentionally narrowed to the single `Classic ATS` template so non-ATS alternates no longer compete with the release bar
- next step: reuse the completed `014` baseline for later resume polish or any future explicit template-expansion plan instead of treating layout choice as still undecided
- additional note: required checks now pass for the current slice — `pnpm --filter @unemployed/ai-providers test`, `pnpm --filter @unemployed/contracts test`, `pnpm --filter @unemployed/db test`, `pnpm --filter @unemployed/job-finder test`, `pnpm --filter @unemployed/desktop build`, `pnpm --filter @unemployed/desktop ui:resume-workspace`, `pnpm --filter @unemployed/desktop ui:resume-workspace-dirty`, and `pnpm docs:check`
- additional note: the retained deterministic UI evidence in `apps/desktop/test-artifacts/ui/resume-workspace/` now shows a structured approved resume with Summary, Experience, Core Skills, and Education sections plus apply handoff from the approved PDF, and `resume-workspace-dirty/dirty-state-results.json` still proves the dirty-state safeguards
- additional note: this pass also fixed the desktop runtime/harness path needed for ongoing QA by forcing Electron main/preload outputs to CommonJS and teaching the resume-workspace captures to accept fresh-workspace startup on `Guided setup`
- additional note: the final `014` decision now explicitly keeps only the ATS-safe `Classic ATS` layout active in product settings and rendering; unsupported legacy template ids normalize back to `Classic ATS`, and previously approved drafts tied to retired layouts reopen as stale so users must export a fresh ATS-first PDF before apply
- blockers: none; `014` is already complete and now serves as the required resume-quality baseline before later submit-enabled `015` work

### `Plan 015 Automatic Job Apply`

- status: `in_progress`
- last updated: `2026-04-19`
- linked plan: `docs/exec-plans/active/015-job-finder-automatic-job-apply.md`
- plan maturity: `active`
- code areas: `packages/contracts`, `packages/db`, `packages/job-finder`, `packages/browser-runtime`, `packages/browser-agent`, `apps/desktop`
- current focus: active safe staged apply evolution now spans completed shared apply-run foundations, the deterministic Milestone 2 copilot slice, an early Milestone 3-prep approval slice, a verified queue-control follow-up, and an Applications recovery pass: one approved job can launch a non-submitting `copilot` run that records structured questions, grounded answers, retained artifacts, replay checkpoints, and application summaries while pausing before final submit; `single_job_auto` runs can now create, approve, revoke, and explicitly re-stage run-scoped submit approval records without executing any final submit action; `queue_auto` runs can now be staged, cancelled, paused on typed consent requests, resumed after consent approval, or skip-and-continue after consent decline while still staying fully non-submitting; and Applications can now switch between saved runs for the selected job, launch a fresh safe rerun from the detail panel, retain a replay checkpoint showing the prior saved apply context on reruns, surface per-job historical results plus the latest approval state, and restage the remaining jobs from a historical queue run into a fresh safe queue with an explicit included-versus-excluded job summary and richer per-job outcome summary first. Review Queue now exposes explicit multi-job queue checkboxes so queue staging no longer depends on the currently selected job only, and the desktop `Applications` detail surface plus `ui:apply-queue-controls`, `ui:applications-recovery`, and `ui:applications-queue-recovery` harnesses now prove queue controls, run-history selection, safe rerun behavior, retained recovery-context behavior, and historical queue restaging from the real renderer flow.
- next step: keep the final submit boundary disabled until the user explicitly re-authorizes later submit-enabled work; there is no major remaining non-submitting Applications or queue-recovery slice currently blocking `015`.
- blockers: no external blocker, but live application execution and submission QA are intentionally paused by explicit user instruction until re-authorized

### `Plan 016 Shared Agent Auto Compaction`

- status: `done`
- last updated: `2026-04-19`
- linked plan: `docs/exec-plans/completed/016-shared-agent-auto-compaction.md`
- plan maturity: `completed`
- code areas: `packages/browser-agent`, `packages/browser-runtime`, `packages/job-finder`, `packages/contracts`, `apps/desktop`, `docs`
- current focus: completed shared compaction baseline: reusable contracts and snapshots now drive token-budget-first browser-agent live compaction with message-count fallback, runtime model-window budgeting, source-debug worker overrides, summary-first final-review handoffs, lightweight discovery compaction telemetry, and an apply-ready reusable seam for later `015` workers; the shared defaults are currently tuned around the active 196k model window so compaction starts near the real provider limit instead of firing far too early
- next step: reuse the completed `016` baseline when later apply workers accumulate long transcripts; keep the current deterministic apply execution unchanged until those future workers actually adopt the seam
- blockers: none

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
- Keep `019` moving by validating bundled sidecar packaging on each supported desktop release platform and retaining cross-platform benchmark evidence.
- Extend `012` with any remaining screenshot-polish or import-review targeting work now that the guided setup plus profile-copilot baseline is landed.
- Keep the new repo-level quality commands (`format`, `format:check`, `verify:quick`, `verify:affected`, `knip`) aligned with actual workflow and CI usage as the monorepo grows.
