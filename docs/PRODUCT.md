# Product

`UnEmployed` is one desktop app with two modules:

- `Job Finder`
- `Interview Helper`

## Shared Product Baseline

- shared local profile and document base
- shared application history
- shared browser and AI infrastructure
- shared desktop shell and settings

## Job Finder

Current product baseline:

- resume import and profile editing
- guided setup and profile copilot
- browser-driven job discovery across configured targets
- source-debug for learning reusable target instructions
- resume workspace with ATS-first PDF approval
- resume template selection is now family-first with truthful family and variant metadata, real preview-backed selection, explicit lane badges, deterministic per-draft recommendations when job and draft evidence justify them, and lane plus density filters; the shared preview and export renderer now gives the shipped `apply-safe` catalog materially distinct `Swiss Minimal`, `Executive Brief`, `Engineering Spec`, and `Portfolio Narrative` families across six stable template ids
- apply flows that stop before final submission with Applications recovery
- hard product rule: live submit remains intentionally disabled until explicitly re-authorized; see `docs/exec-plans/completed/015-job-finder-automatic-job-apply.md` for provenance

## Interview Helper

Planned product baseline:

- prep workspace from resume, job, notes, and application history
- live session with transcript-aware context
- compact overlay plus full panel
- local transcript, capture, and suggestion history

## Product Defaults

- desktop shell: `Electron`
- renderer: `React`
- local persistence: `SQLite`
- browser runtime: managed sessions first
- AI: provider abstraction with separate chat, vision, STT, and embedding roles
