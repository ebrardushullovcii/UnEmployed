# Product

`UnEmployed` is one local-first desktop app with two modules:

- `Job Finder`
- `Interview Helper`

## Shared Baseline

- shared local profile, documents, reusable answers, and application history
- shared browser runtime, source intelligence, AI provider roles, desktop shell, settings, tray, and hotkeys
- UI-first workflows with agent assistance inside bounded product surfaces

## Job Finder

Current baseline:

- resume import and profile editing with guided setup and profile copilot
- browser-driven job discovery across configured targets
- source-debug that learns reusable target instructions from schema-safe DOM/text evidence and bounded visual evidence
- resume workspace with ATS-first preview, export, approval, template selection, and manual experience ordering
- eight apply-safe templates: `Chronology Classic`, `Senior Brief`, `Modern Editorial`, `Engineering Spec`, `Proof Portfolio`, `Formal Proof`, `Longform Timeline`, and `Career Pivot Bridge`
- safe apply flows that stop before final submission and use Applications recovery plus explicit visual checkpoints when safe

Hard rule: live submit remains disabled until explicitly re-authorized. See [ADR 0006](adr/0006-safe-non-submitting-apply-boundary.md).

## Interview Helper

Current baseline:

- overlay UI types and helpers exist in the repo
- full prep, live session, transcript, capture, and cue-generation behavior is not part of the mainline baseline yet
- future Interview Helper work should reuse shared profile, applications, document memory, AI provider roles, and OS-integration boundaries

Hard rule: capture, screenshots, overlays, model use, retention, and Job Finder write-back must stay explicit, visible, auditable, and adapter-owned.

## Product Defaults

- desktop shell: `Electron`
- renderer: `React`
- local persistence: `SQLite`
- browser runtime: managed sessions first
- AI: provider abstraction with separate chat, vision, and embedding roles
