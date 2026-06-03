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

- target-context setup from Job Finder records or direct user input
- rehearsal checks for transcript language, audio, transcription fallback, providers, screenshots, overlays, capture-protection state, hotkeys, tray controls, and retention defaults
- user-started live sessions with microphone, meeting/system audio, native-caption intake, browser speech bridge, local-command STT, cloud transcription, screenshots, and cue-card generation behind typed provider roles
- two separate protected overlay windows for answer cues and live transcript state
- explicit paused reconfiguration, panic-hide, tray/global-hotkey semantic actions, diagnostics, post-session review, export, transcript annotations, delete, and explicit Job Finder follow-up actions

Hard rule: capture, screenshots, overlays, and model use must stay explicit, visible, auditable, and adapter-owned. See [ADR 0003](adr/0003-interview-helper-live-session-architecture.md).

## Product Defaults

- desktop shell: `Electron`
- renderer: `React`
- local persistence: `SQLite`
- browser runtime: managed sessions first
- AI: provider abstraction with separate chat, vision, STT, and embedding roles
