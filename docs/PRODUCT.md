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
- browser-driven job discovery across configured targets; independent public provider inventories begin concurrently, then title/location/work-mode triage and distinct-role result budgets rank the useful options against the active resume and target roles
- an evidence-backed fit ledger that separates required, preferred, and inferred requirements; cites exact listing text and resume/profile sources; marks support, missing evidence, uncertainty, and conflicts; and keeps both the numeric score and conservative strong-fit/original-CV/review/skip recommendation grounded in that evidence
- source-debug that learns reusable target instructions from schema-safe DOM/text evidence and bounded visual evidence
- resume workspace with ATS-first preview, export, approval, template selection, manual experience ordering, and explicit editor representation for every canonical work-history record
- a persisted application-CV choice: tailor and approve a PDF per job, or show and use the original imported CV unchanged for each shortlisted job; Apply Copilot remains an explicit per-job action in both modes
- eight apply-safe templates: `Chronology Classic`, `Senior Brief`, `Modern Editorial`, `Engineering Spec`, `Proof Portfolio`, `Formal Proof`, `Longform Timeline`, and `Career Pivot Bridge`
- target-generic prepare-only apply flows that fill exact grounded profile fields, attach the explicitly selected original or tailored resume, advance only clearly non-final steps, and stop at final submission or any ambiguous gate; disposable acceptance runs may separately authorize intermediate ATS writes without authorizing or clicking final submit
- browser-owned sign-in handoffs: Job Finder opens the dedicated browser, waits without receiving or storing credentials, and resumes only the blocked source or application after the user selects `I'm signed in — retry`

Hard rule: live submit remains disabled until explicitly re-authorized. See [ADR 0006](adr/0006-safe-non-submitting-apply-boundary.md).

## Interview Helper

Current baseline:

- target-context setup from Job Finder records or direct user input
- rehearsal checks for transcript language, runnable audio/transcription paths, providers, screenshots, assistant responses, and retention defaults
- capture consent is capability-specific: a user can run system-audio-only, microphone-only, or screenshot-free sessions after accepting the core transmission, retention, and visible-surface disclosures
- a visible main-window conversation with explicit text sends, temporary PNG/JPEG/WebP attachments, screen-capture context, assistant replies, and a recent source-labeled transcript
- user-started microphone and meeting/system-audio transcription with queued transient chunks, local-command STT or configured cloud fallback, native-caption intake, and cue generation behind typed provider roles
- live sessions start with an empty transcript and no synthetic cue; standalone Whisper non-speech markers and short recorder-tail fragments are discarded instead of becoming coaching context
- post-session review, export, transcript annotations, delete, and explicit Job Finder follow-up actions
- starting an interview opens visible answer and transcript popup windows by default while the main conversation remains available; the answer popup is a compact interactive assistant with typed sends, pasted or selected image attachments, explicit screen-context capture, answer copy, and hide/reopen controls, while the transcript popup stays optimized for live source text with copy and hide/reopen controls
- popup workspace updates are event-driven rather than renderer reloads so live audio/transcript changes cannot erase an in-progress answer draft or pending image attachment; popup position and size persist across sessions
- personal-story requests without candidate evidence produce a bracketed STAR scaffold instead of invented employers, incidents, technology, timelines, metrics, or outcomes; screenshot-dependent questions use model-backed visual observations when available and otherwise disclose that visual analysis is unavailable instead of guessing from earlier transcript context

Hard rule: capture, screenshots, attachments, advanced overlays, and model use must stay explicit, visible, auditable, and adapter-owned. See [ADR 0003](adr/0003-interview-helper-live-session-architecture.md) and [ADR 0008](adr/0008-visible-first-interview-helper.md).

## Product Defaults

- desktop shell: `Electron`
- renderer: `React`
- local persistence: `SQLite`
- browser runtime: managed sessions first
- AI: provider abstraction with separate chat, vision, STT, and embedding roles
