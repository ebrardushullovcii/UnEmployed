# Job Finder

## Purpose

Owns job discovery, drafting, application review, submission orchestration, and application tracking.

## Current Product Shape

- Candidate profile import and normalization
- Generic browser discovery across configured job sources
- Source-setup learning for unfamiliar job sources
- Dedicated per-job resume workspace with grounded edits and approval gating
- Review-gated supported apply flow with checklist-style readiness and safe-stop behavior
- Applications tracking with filtered triage views, latest-attempt detail, timeline context, and recovery cues

## Current Implementation

- Job Finder persists local state in SQLite and exposes typed contracts for profile data, saved jobs, resume workflows, application records, and discovery state.
- Desktop surfaces for `Profile`, `Find jobs`, `Shortlisted`, `Applications`, and `Settings` are live.
- `Shortlisted` now frames apply readiness as explicit resume, approval, and browser checks instead of relying only on stacked status cards.
- `Applications` now supports filtered triage views so the user can focus on needs-action, in-progress, submitted, and manual-only records, the detail panel can fetch raw apply-copilot review memory for the selected job instead of showing only summary counters, and the recovery surface can review older apply runs or start a fresh safe rerun directly from the same screen.
- `Profile` keeps more optional fields behind secondary disclosure sections so the main editing path stays focused on the details that drive search, resumes, and applications.
- Fresh workspaces now route through `/job-finder/profile/setup` first, with persisted `profileSetupState` deciding whether the user should start setup, resume it later, or fall through to the full `Profile` editor, unresolved resume-import candidates now widening into durable setup review items that follow the user across reloads, and full-Profile Preferences copilot requests now able to add or re-enable common job sources such as LinkedIn Jobs and Wellfound through typed `searchPreferences.discovery` patch groups that stay review-gated instead of broad auto-apply.
- Shared data now keeps richer candidate narrative, proof-bank entries, reusable screener answers, application identity defaults, enriched saved-job metadata, and structured apply-memory summaries on durable roots that later workflows can reuse directly.
- `Settings` now concentrates editable defaults in the main column and keeps live status plus destructive reset controls in a smaller side rail.
- Resume ingestion supports `txt`, `md`, `pdf`, and `docx`, with model-backed extraction plus deterministic fallback.
- Discovery supports generic configured job sources, retained run history, activity timelines, and reusable source-setup navigation artifacts.
- The `Resume Workspace` under `/job-finder/review-queue/:jobId/resume` supports structured drafting, assistant patching, one ATS-first `Classic ATS` PDF export, approval, and apply-time safety checks.

## Current And Queued Plans

- Resume workspace plan: `docs/exec-plans/completed/007-job-finder-resume-workspace.md`
- Completed full-app copy pass plan: `docs/exec-plans/completed/009-full-app-production-copy-pass.md`
- Browser efficiency and speed plan: `docs/exec-plans/completed/010-job-finder-browser-efficiency-and-speed.md`
- Completed shared data expansion plan: `docs/exec-plans/completed/011-job-finder-shared-data-expansion.md`
- Guided setup and profile copilot plan: `docs/exec-plans/completed/012-job-finder-guided-setup-and-profile-copilot.md`
- Source intelligence and faster discovery plan: `docs/exec-plans/completed/013-job-finder-source-intelligence-and-faster-discovery.md`
- 013 live benchmark report: `docs/exec-plans/completed/013-benchmark-results.md`
- Resume output and template quality plan: `docs/exec-plans/completed/014-job-finder-resume-output-and-template-quality.md`
- Automatic job apply plan: `docs/exec-plans/active/015-job-finder-automatic-job-apply.md`
- Shared agent auto compaction plan: `docs/exec-plans/queued/016-shared-agent-auto-compaction.md`
- Browser substrate evaluation and direction plan: `docs/exec-plans/queued/017-browser-substrate-evaluation-and-direction.md`
- The recommended forward path now treats completed `011`, `012`, `013`, and `014` as the shared-data, setup, discovery, and ATS-first resume baseline, then continues with active `015`, while `016` auto compaction and `017` browser-substrate direction remain deferred cross-cutting follow-ons rather than the main product queue.
- `015` intentionally defines the apply direction as a staged evolution: stronger apply data and artifacts first, then one-job apply copilot, then one-job auto-submit, then queue submission. The current active slice now includes a deterministic non-submitting one-job apply-copilot path that records question, answer, artifact, and checkpoint memory while stopping before final submit, a safe single-job auto-run staging flow that records run-scoped submit approval state without executing the final submit click, a safe queue-control follow-up that can stage queue runs, pause on typed consent requests, approve or decline consent, cancel runs, and skip blocked jobs while continuing the queue in review mode, and an Applications recovery follow-up that can switch between saved runs for one job and start a fresh safe rerun from the Applications detail panel. The Shortlisted screen now also supports explicit multi-job queue selection for approved jobs instead of staging queues only from the currently focused item. Live-site execution and final-submit QA remain explicitly disallowed until the user re-authorizes them.

## Completed Background Plans

- Generic discovery background plan: `docs/exec-plans/completed/004-job-finder-generic-discovery.md`
- Source-debug background plan: `docs/exec-plans/completed/005-job-source-debug-agent.md`

## Historical Foundation

- `docs/exec-plans/completed/002-job-finder-browser-apply.md` documents the original LinkedIn-first Job Finder slice that later work generalized.

## Agent Runtime Configuration

- `UNEMPLOYED_AI_API_KEY`: enables the OpenAI-compatible provider path
- `UNEMPLOYED_AI_BASE_URL`: optional override for the provider base URL; defaults to `https://ai.automatedpros.link/v1`
- `UNEMPLOYED_AI_MODEL`: optional override for the provider model; defaults to `FelidaeAI-Pro-2.5`
- `UNEMPLOYED_AI_TIMEOUT_MS`: optional default timeout in milliseconds for general model-backed Job Finder requests
- `UNEMPLOYED_AI_RESUME_TIMEOUT_MS`: optional override in milliseconds for resume extraction specifically; use this when a slower provider/model times out during resume upload
- `UNEMPLOYED_BROWSER_AGENT=0`: explicitly disables the dedicated Chrome-profile browser agent and falls back to the deterministic catalog runtime.
- When `UNEMPLOYED_BROWSER_AGENT` is unset, the runtime falls back to the legacy `UNEMPLOYED_LINKEDIN_BROWSER_AGENT` flag via the nullish-coalescing `??` fallback in the implementation.
- Desktop builds opt into the browser agent by default, so leaving both variables unset, or setting the active flag to `=1`, keeps the browser agent enabled unless you explicitly force the fallback path.
- `UNEMPLOYED_CHROME_PATH`: optional override for the local Chrome executable the agent should launch
- `UNEMPLOYED_CHROME_DEBUG_PORT`: optional override for the dedicated Chrome remote-debugging port; defaults to `9333`
- `UNEMPLOYED_BROWSER_HEADLESS=1`: optional headless mode for the dedicated browser agent when live browser UI is not required

## Resume Document Strategy

- Input sources: plain text, Markdown, PDF, and DOCX resumes are imported and normalized into stored text before the AI profile/tailoring agent runs
- Extraction path: `pdfjs-dist` handles PDF text recovery, `mammoth` handles DOCX raw-text extraction, and plain-text sources pass through directly
- Output path: the AI agent produces the resume text and section content, then Job Finder renders that content into the ATS-first `Classic ATS` layout instead of asking the model to invent document layout from scratch
- Current artifact shape: the workspace keeps structured `ResumeDraft` data as the editable source of truth, renders through HTML for preview/debug, exports a real local PDF artifact, and records export metadata plus approval state for review/apply flows
- Follow-up artifact path: keep `html` as the intermediate render/debug layer, keep `pdf` as the required upload artifact, and leave `docx` as a later follow-up once the workspace UX is fully hardened

## Package Boundaries

- Contracts from `packages/contracts`
- Agent runtime orchestration from `packages/browser-agent`
- Browser control from `packages/browser-runtime`
- Storage from `packages/db`
- Shared retrieval from `packages/knowledge-base`
