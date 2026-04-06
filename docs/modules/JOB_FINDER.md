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
- `Applications` now supports filtered triage views so the user can focus on needs-action, in-progress, submitted, and manual-only records.
- `Profile` keeps more optional fields behind secondary disclosure sections so the main editing path stays focused on the details that drive search, resumes, and applications.
- `Settings` now concentrates editable defaults in the main column and keeps live status plus destructive reset controls in a smaller side rail.
- Resume ingestion supports `txt`, `md`, `pdf`, and `docx`, with model-backed extraction plus deterministic fallback.
- Discovery supports generic configured job sources, retained run history, activity timelines, and reusable source-setup navigation artifacts.
- The `Resume Workspace` under `/job-finder/review-queue/:jobId/resume` supports structured drafting, assistant patching, `pdf` export, approval, and apply-time safety checks.

## Current And Queued Plans

- Resume workspace plan: `docs/exec-plans/completed/007-job-finder-resume-workspace.md`
- Automatic job apply plan: `docs/exec-plans/queued/017-job-finder-automatic-job-apply.md`
- Completed full-app copy pass plan: `docs/exec-plans/completed/009-full-app-production-copy-pass.md`
- Browser efficiency and speed plan: `docs/exec-plans/completed/010-job-finder-browser-efficiency-and-speed.md`
- `017` intentionally defines the queued apply direction as a staged evolution: stronger apply data and artifacts first, then one-job apply copilot, then one-job auto-submit, then queue submission. The current shipped apply flow remains more conservative until that plan lands.

## Completed Background Plans

- Generic discovery background plan: `docs/exec-plans/completed/004-job-finder-generic-discovery.md`
- Source-debug background plan: `docs/exec-plans/completed/005-job-source-debug-agent.md`

## Historical Foundation

- `docs/exec-plans/completed/002-job-finder-browser-apply.md` documents the original LinkedIn-first Job Finder slice that later work generalized.

## Agent Runtime Configuration

- `UNEMPLOYED_AI_API_KEY`: enables the OpenAI-compatible provider path
- `UNEMPLOYED_AI_BASE_URL`: optional override for the provider base URL; defaults to `https://ai.automatedpros.link/v1`
- `UNEMPLOYED_AI_MODEL`: optional override for the provider model; defaults to `FelidaeAI-Pro-2.5`
- `UNEMPLOYED_BROWSER_AGENT=0`: explicitly disables the dedicated Chrome-profile browser agent and falls back to the deterministic catalog runtime.
- When `UNEMPLOYED_BROWSER_AGENT` is unset, the runtime falls back to the legacy `UNEMPLOYED_LINKEDIN_BROWSER_AGENT` flag via the nullish-coalescing `??` fallback in the implementation.
- Desktop builds opt into the browser agent by default, so leaving both variables unset, or setting the active flag to `=1`, keeps the browser agent enabled unless you explicitly force the fallback path.
- `UNEMPLOYED_CHROME_PATH`: optional override for the local Chrome executable the agent should launch
- `UNEMPLOYED_CHROME_DEBUG_PORT`: optional override for the dedicated Chrome remote-debugging port; defaults to `9333`
- `UNEMPLOYED_BROWSER_HEADLESS=1`: optional headless mode for the dedicated browser agent when live browser UI is not required

## Resume Document Strategy

- Input sources: plain text, Markdown, PDF, and DOCX resumes are imported and normalized into stored text before the AI profile/tailoring agent runs
- Extraction path: `pdfjs-dist` handles PDF text recovery, `mammoth` handles DOCX raw-text extraction, and plain-text sources pass through directly
- Output path: the AI agent produces the resume text and section content, then Job Finder renders that content into a small fixed template set instead of asking the model to invent document layout from scratch
- Current artifact shape: the workspace keeps structured `ResumeDraft` data as the editable source of truth, renders through HTML for preview/debug, exports a real local PDF artifact, and records export metadata plus approval state for review/apply flows
- Follow-up artifact path: keep `html` as the intermediate render/debug layer, keep `pdf` as the required upload artifact, and leave `docx` as a later follow-up once the workspace UX is fully hardened

## Package Boundaries

- Contracts from `packages/contracts`
- Agent runtime orchestration from `packages/browser-agent`
- Browser control from `packages/browser-runtime`
- Storage from `packages/db`
- Shared retrieval from `packages/knowledge-base`


