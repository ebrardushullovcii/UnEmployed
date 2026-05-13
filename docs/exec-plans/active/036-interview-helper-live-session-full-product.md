# 036 Interview Helper Live Session Full Product

Status: active

## Goal

Ship the first complete Interview Helper live-session product, not a partial foundation slice: a user-started, transcript-first, cross-platform live interview workspace with explicit setup consent, rehearsal checks, microphone plus meeting/system audio transcription, conservative cue triggers, optional screenshot context, two protected overlay surfaces, hotkeys, tray controls, structured retention, post-session review, and replayable validation across Windows, macOS, and Linux.

The highest-priority architectural constraint is future authorized full capture exclusion. Every overlay, capture, screenshot, diagnostic, and session-state decision must keep the product as close as practical to hiding Interview Helper live assistance from all approved capture surfaces later, without requiring a rewrite. The first release may only provide best-effort platform protection where supported, but it must model protected overlay surfaces as first-class adapter-owned capabilities with verification results instead of booleans or assumptions.

## Source Decisions

This plan implements `docs/adr/0003-interview-helper-live-session-architecture.md` and the Interview Helper vocabulary in `CONTEXT.md`.

Visual concepts in `docs/Design/interview-helper/` are aesthetic references only. Use them for the dark, glassy, OS-native desktop language, compact floating overlay feel, subtle status accents, dense readiness panels, and separate answer/transcript overlay treatment. Do not treat those images as feature-complete product specs, contract sources, or authority over this plan. If a design artifact conflicts with this plan, the ADR, or `CONTEXT.md`, this plan and the canonical docs win.

The plan was grilled and accepted with these product decisions:

- This is one full-product integration target; do not split delivery into a foundation-only release.
- Cross-platform parity for Windows, macOS, and Linux is part of the first definition of done.
- Native/platform helper code is allowed when needed, but only behind `packages/os-integration`; prefer Electron and platform APIs first.
- Future authorized full capture exclusion is a hard design constraint even before the final mechanism is researched.
- Live answer and live transcript overlays are separate top-level protected surfaces from day one.
- The main app must not mirror sensitive live cue-card, transcript, or screenshot content while a session is active.
- Interview Helper state is deterministic service state hosted by Electron main; renderer and overlay windows are consumers over typed preload APIs/events.
- The setup workspace is the primary start path. Tray-only or ambient start is out of scope.
- Interview Helper is its own top-level module route. Job Finder can deep-link into setup with suggested saved-job context.
- General interviews are a real target-context type and must not pretend to be job-grounded.
- Target context is snapshotted at session start for reproducibility and to avoid broad app-history leakage.
- Transcripts are the primary cue signal. Screenshot vision is optional augmentation.
- STT is a broader transcription engine capability, not only an AI model role. Local/platform/browser engines should be tried before cloud fallback where they pass rehearsal.
- Microphone and meeting/system audio transcription streams may use different engines, but both normalize to source-labeled `Live transcript segments`.
- Meeting/system audio is strongly preferred. Mic-only sessions are allowed only as degraded force-cue sessions. No working transcript path blocks start.
- Native meeting-platform transcripts are a first-class source in the transcript contract. Manual/native-caption intake can use that source now; automatic extraction from meeting apps remains adapter work.
- Cue cards must be grounded; they cannot invent experience, technologies, metrics, achievements, or external actions.
- Coding interview cues may reason from visible prompts/code but must not operate another editor, browser, meeting tool, or coding platform.
- Rolling cue context is required from the start; full transcript resend is not allowed.
- Raw audio, unpinned screenshots, raw provider payloads, and raw prompts are not retained by default.
- Users can hard-delete live-session history.
- Post-session review can export structured notes and convert selected cue-card content into prep artifacts; no automatic profile, resume, saved-job, or application writes.

## Product Surface

### Interview Setup Workspace

- top-level `Interview Helper` route and navigation item
- target-context picker:
  - linked Job Finder saved job/application
  - selected resume/profile snapshot
  - user notes and prep artifacts
  - explicit `general_interview`
- first-run setup gate that discloses:
  - microphone capture
  - meeting/system audio capture
  - screenshots and visual model transmission
  - transcript/cue-card model transmission
  - local structured retention
  - overlay capture-protection limits
- per-session confirmation that shows the exact enabled capabilities and degraded states
- rehearsal checklist for:
  - microphone capture and transcription
  - meeting/system audio capture and transcription
  - selected transcription language
  - transcription engine selection and fallback
  - cue-card provider readiness
  - screenshot capture readiness
  - screenshot vision readiness
  - protected overlay creation
  - overlay capture-protection requested and verified state
  - hotkey registration, including mandatory panic-hide
  - tray controls
  - retention defaults

### Active Session Workspace

- visible capture/session status without rendering sensitive live transcript or cue-card content in the main window
- controls for pause/resume listening, show/hide overlays, reconfigure providers through a paused flow, end session, and open diagnostics
- capability degradation display by feature rather than silent omission
- crash/restart recovery card for interrupted sessions; never auto-resume capture after restart

### Live Answer Overlay

- separate top-level protected overlay window
- click-through by default
- interaction mode by hotkey
- compact cue-card display optimized for speakable guidance:
  - direct answer outline
  - 2-4 supporting points
  - optional clarifying question
  - optional avoid-saying warning
  - compact input provenance
- optional expanded detail when interaction mode is active
- panic-hide always available

### Live Transcript Overlay

- separate top-level protected overlay window
- click-through by default
- interaction mode for moving, resizing, copying, pinning screenshots, clearing visual batches, and expanding content
- shows source-labeled transcript segments:
  - meeting/system audio
  - microphone
  - partial vs final/stable state
- shows queued screenshot count, capture status, cue generation status, and degraded states
- does not create additional persistence beyond session history and explicitly pinned screenshots

### Tray/Menu Controls

- pause/resume listening
- show/hide overlays
- panic-hide
- end session through a safe confirmation path
- these controls call the same semantic session actions as hotkeys

### Post-Session Review

- retained structured session history:
  - metadata and lifecycle
  - target-context snapshot refs/summaries
  - final transcript segments
  - partial segments only when used by a cue or later stabilized
  - cue cards
  - cue input disclosures
  - final compact session summary and summary metadata
  - diagnostics summary
  - user-pinned screenshots
- transcript annotations/corrections without overwriting original transcript segments
- convert selected cue cards or transcript moments into Interview prep artifacts
- optional explicit Job Finder actions, such as marking an application as interviewed or adding a follow-up note
- export structured notes/transcript/cue cards to Markdown or JSON
- hard-delete session data

## Package Ownership

### `packages/contracts`

- owns all shared schemas, DTOs, preload payloads, events, and persisted shapes for Interview Helper
- must use discriminated unions and explicit status enums for session state, capabilities, capture protection, transcript engines, cue triggers, visual batches, and retention
- validates provider outputs before they reach workflow logic or overlays

### `packages/interview-helper`

- owns deterministic live-session state machine
- owns setup/rehearsal state, session lifecycle, cue trigger policy, rolling cue context, cue visual batch policy, overlay view models, retained history policy, and post-session review data model
- does not own OS/platform capture, Electron windows, native helpers, or direct provider transport

### `packages/os-integration`

- owns overlay window lifecycle, protected surface adapters, hotkeys, tray/menu session actions, audio capture adapters, screenshot capture adapters, display/window metadata, and platform differences
- any native helper code must live behind this package or a documented native adapter called by it
- reports actual capability states and verification results; product code must not infer platform behavior

### `packages/ai-providers`

- owns provider contracts and adapters for:
  - transcription engines (`platform_local`, `local_model`, `browser_speech`, `cloud_ai`)
  - cue-card generation
  - screenshot vision
  - compact session summary generation when model-backed
- provider roles may share credentials/configuration, but product contracts remain narrow and independently ready/failing

### `apps/desktop`

- owns Electron main hosting of the Interview Helper service
- owns typed IPC/preload APIs/events
- owns top-level route, setup workspace UI, active session status UI, overlay renderer routes, post-session review UI, tray wiring, and desktop validation harnesses
- renderer never receives raw Node/Electron primitives

### `packages/db`

- persists structured session history, overlay layout preferences, prep artifacts, target-context snapshot refs/summaries, diagnostics summaries, and pinned screenshot metadata
- does not persist raw audio, unpinned screenshots, raw provider payloads, or raw prompts by default

## Key Contracts

### Live Session Lifecycle

- `draft_setup`
- `rehearsing`
- `ready`
- `active`
- `paused`
- `panic_hidden`
- `reconfiguring`
- `ending`
- `ended`
- `interrupted`
- `failed`

Capture must never resume automatically from `interrupted` after app restart.

### Target Context

- `job_application`
- `saved_job`
- `general_interview`

Every live session stores a start-time snapshot or snapshot reference of the confirmed context. Cue-card requests use only that snapshot, selected prep artifacts, rolling transcript context, and the active cue visual batch.

### Audio Sources

- `microphone`
- `meeting_audio`
- `meeting_native_transcript`

Each transcript segment includes source, partial/final state, timing, language, confidence when available, engine metadata, and provenance.

### Transcription Engines

Engine selection order should prefer:

1. `platform_local`
2. `local_model`
3. `browser_speech`
4. `cloud_ai`

Only engines that pass rehearsal are selectable for a session. Microphone and meeting/system audio may use different engines.

### Start Rules

Hard blocks:

- no confirmed target context
- no working transcript path
- no cue-card provider
- no overlay windows
- panic-hide hotkey unavailable

Allowed degraded starts:

- meeting audio unavailable but mic transcription works
- mic unavailable but meeting audio transcription works
- screenshot capture unavailable
- screenshot vision unavailable
- overlay capture protection unsupported, requested-only, or unverified
- non-critical hotkey collisions

Mic-only sessions disable automatic cue triggers by default and rely on force-cue.

### Hotkey Actions

- `toggle_listening`
- `force_cue`
- `capture_screenshot`
- `capture_screenshot_and_force_cue`
- `toggle_answer_overlay`
- `toggle_transcript_overlay`
- `toggle_overlay_interaction_mode`
- `panic_hide`
- `end_session`

`toggle_listening` pauses or resumes all live input capture: microphone, meeting/system audio, screenshots, and automatic cue triggers. Existing overlays and cue cards can remain visible.

`panic_hide` immediately hides both overlays, pauses screenshot capture, stops new cue generation, and leaves audio transcription state unchanged until the user deliberately resumes, pauses listening, or ends the session.

### Cue Trigger Policy

- transcript-first
- automatic triggers default to meeting/system audio final segments or stable partial segments
- candidate microphone never creates automatic triggers by default
- manual force-cue uses the best current context immediately, including marked partial segments
- multiple questions in one interviewer turn produce one cue card that enumerates them
- automatic cue generation is rate-limited and debounced
- trigger sensitivity setting:
  - `conservative` default
  - `balanced`
  - `manual_only`

### Cue Card Inputs

Cue-card requests must include normalized bounded context, not raw transcript blobs:

- trigger metadata
- recent source-labeled transcript window
- stable/partial status
- target-context snapshot summary
- relevant prep artifacts
- compact rolling session summary
- active visual observations
- screenshot batch count and contamination state
- degraded capability states

### Cue Card Output

Cue-card output is schema-validated before display. It includes:

- title
- concise speakable answer outline
- supporting bullets
- optional clarifying question
- optional avoid-saying warning
- groundedness/degraded flags
- input disclosure
- optional expanded content

Validation failure produces a quiet visible failure card. Transient provider errors may retry once with a short timeout.

### Rolling Cue Context

- required from the start
- no full transcript resend for every cue
- uses bounded recent transcript, active visual observations, target-context snapshot summary, relevant prep artifacts, and compact session summary
- `interview-helper` owns summary update policy; model-backed summarization is an adapter implementation detail
- retain final compact summary and summary metadata, not every intermediate summary by default

### Cue Visual Batch

- screenshots are not continuous by default
- hotkey captures queue screenshots for the next cue
- optional user setting: capture configured region when an automatic cue fires; default off
- optional action: capture and force cue
- default capture target is a user-selected region or active display region, not full display
- full display capture is explicit
- capture region is session setup with reusable defaults
- unpinned screenshots are temporary and clear after cue use
- pinned screenshots become retained history
- overlay-included screenshots are allowed automatically, but the batch is marked `overlay_contaminated`; prompts instruct the provider to ignore Interview Helper UI and cue cards disclose degraded visual context

### Visual Observation Safety

- screenshot vision normalizes into schema-validated `InterviewVisualObservation` records
- visual output may describe visible content and coding prompts
- visual output may not contain selectors, action directives, external-app control instructions, hidden workflow rules, generated final-submit guidance, or control policy
- coding cues can reason, outline approaches, flag edge cases, and suggest clarifying questions, but cannot operate tools or other apps

### Protected Overlay Surfaces

Model protection as explicit capabilities, not booleans.

Surface records include:

- stable surface id
- surface kind: live answer or live transcript
- requested protection policy
- actual protection state
- verification method
- display/window metadata
- last verification timestamp
- diagnostics

Protection states should distinguish:

- `verified_protected`
- `requested_unverified`
- `best_effort`
- `unsupported`
- `failed`
- `unknown`

Reserve user-facing `Protected` for verified protection. A requested platform flag without verification is `Best effort` or `Requested`.

Build an automated protection verification harness for ordinary Electron/OS capture. It must attempt controlled capture per platform/display mode and report whether protected overlay pixels appear. Meeting-app-specific exclusion is not part of this release unless an authorized integration path exists.

### Overlay Layout Preferences

- stored separately from live-session history
- global defaults with per-display restoration metadata
- per overlay surface: position, size, opacity, compact/expanded default, click-through preference, requested protection policy
- opacity is configurable within safe bounds; fully transparent overlays are not allowed
- reset layout must not delete session history

### Diagnostics

Diagnostics retain structured troubleshooting events only:

- selected engines
- permission failures
- latency buckets
- hotkey collisions
- capture-protection request and verification results
- screenshot failures
- provider timeout/failure categories
- cue generation failure categories
- display changes and revalidation

No transcript snippets by default. No raw audio. No raw screenshots unless pinned or explicit debug retention. Raw provider payloads and prompts are not retained by default.

## Platform Strategy

Prefer platform/Electron APIs before native helpers, but do not compromise the release bar when a helper is required.

### Windows

- evaluate Electron content protection and Windows `SetWindowDisplayAffinity` behavior through `os-integration`
- evaluate microphone capture and system audio through Electron/Chromium or WASAPI loopback-style adapter as needed
- evaluate local transcription options:
  - Windows SDK Speech Recognition
  - Foundry Local Whisper where available
  - local model or cloud fallback

### macOS

- evaluate Electron content protection, but do not assume it protects against all ScreenCaptureKit-based capture
- evaluate ScreenCaptureKit/system capture paths where user permission allows
- evaluate `SFSpeechRecognizer` on-device recognition where supported for the chosen language
- use helper/native code only behind `os-integration` when Electron cannot meet capture requirements

### Linux

- evaluate overlay protection honestly; expect weaker or environment-dependent support
- evaluate PipeWire/PulseAudio monitor-source capture for meeting/system audio
- use capability states and degraded release behavior rather than pretending parity means identical mechanisms

## Workstreams

These are parallel work areas for one full release target, not shortcut phases.

### Contracts and Persistence

- add Interview Helper contract schemas and tests
- add repository persistence for setup defaults, sessions, transcript segments, cue cards, diagnostics summaries, prep artifacts, pinned screenshots, overlay layout preferences, and target-context snapshots
- add migration/seed behavior as needed

### Deterministic Session Core

- implement live-session state machine in `packages/interview-helper`
- implement setup/rehearsal domain logic
- implement start rules, degraded states, lifecycle transitions, crash/interrupted recovery, retention policy, rolling context, cue trigger policy, cue visual batch policy, and overlay view models
- add unit tests for state transitions, trigger debounce/rate limit, retention cleanup, and crash recovery semantics

### OS Integration

- implement semantic hotkey registration and collision diagnostics
- implement tray/menu actions
- implement protected overlay window contracts and verification harness
- implement audio capture capability adapters for mic and meeting/system audio
- implement screenshot capture adapters with region/default handling and overlay contamination metadata
- document platform divergences

### AI and Transcription Providers

- implement normalized transcription engine interface and provider adapters
- implement cue-card provider contract with schema validation
- implement screenshot vision provider contract with safe visual observations
- implement compact summary update support
- implement fallback selection and readiness reporting

### Desktop Main and IPC

- host Interview Helper service in Electron main
- add typed preload APIs/events for setup, rehearsal, session lifecycle, hotkey/tray actions, overlay snapshots, and post-session review
- add typed preload APIs/events for live transcript segment ingestion from microphone, meeting/system audio, and meeting-native caption sources
- expose browser speech recognition as a user-started microphone bridge when Chromium provides it; unavailable browsers must degrade without blocking the session
- expose temporary renderer media stream probes for microphone and display/system audio; probes must stop streams immediately and avoid raw audio retention
- create separate overlay BrowserWindows and routes for answer/transcript surfaces
- ensure main window does not mirror active sensitive live content

### Desktop UI

- add top-level Interview Helper nav and route
- build setup workspace, rehearsal checklist, active session status, degraded capability UI, provider/engine readiness controls, overlay preview, capture-region setup, and retention confirmation
- build answer and transcript overlay routes
- build post-session review, export, prep-artifact conversion, transcript annotations, deletion, and optional Job Finder actions
- add UI harnesses for setup, active session, overlays, post-session review, and degraded states

### Job Finder Integration

- add deep links from saved jobs into Interview setup with suggested target context; application-record handoff remains explicit follow-up work
- keep any writes back to Job Finder explicit user actions
- do not allow live-session content to automatically mutate profile, resume, saved-job, or application records

### Documentation

- update `docs/ARCHITECTURE.md` for native/platform additions and protected overlay surface ownership
- update `docs/CONTRACTS.md` for Interview Helper shared schemas and IPC semantics
- update `docs/modules/INTERVIEW_HELPER.md` with implemented behavior and platform differences
- update `docs/TESTING.md` with Interview Helper validation matrix and UI harnesses
- update this active plan with latest evidence as work lands

## Validation Matrix

Full release is not done until the matrix passes or has an explicit accepted exception documented in this plan.

### Cross-Platform Capability Matrix

Validate on Windows, macOS, and Linux:

- setup gate and per-session confirmation
- microphone capture and transcript segments
- meeting/system audio capture and transcript segments
- selected transcription language support and fallback behavior
- local/platform transcription where available
- cloud fallback where configured
- cue-card provider readiness and failure state
- screenshot region capture
- queued visual batch behavior
- screenshot vision readiness and failure state
- overlay contamination marking
- separate answer and transcript overlay windows
- click-through default and interaction mode
- layout persistence and reset
- hotkeys, including panic-hide as hard requirement
- tray/menu controls
- protected surface request and verification result
- display change revalidation
- pause/resume listening semantics
- panic-hide semantics
- crash/restart interrupted-session recovery
- hard-delete of session history

### Product Flow Matrix

- job/application target-context session
- saved-job target-context session
- general interview session
- full-capability session: meeting audio + mic + screenshots + cue cards
- meeting-only session
- mic-only degraded force-cue session
- transcript-only session with screenshot vision unavailable
- screenshot-enabled coding prompt cue
- overlay-protection unsupported/best-effort session
- provider timeout and one retry
- cue validation failure
- post-session review, export, prep-artifact conversion, annotation, and delete

### Automated Checks

- `pnpm validate:contracts`
- `pnpm validate:package interview-helper`
- `pnpm validate:package os-integration`
- `pnpm validate:package ai-providers`
- `pnpm validate:desktop`
- `pnpm validate:docs-only`
- `pnpm verify:affected`
- desktop build before UI harnesses that launch built output
- new desktop UI harnesses for Interview Helper setup, overlays, and post-session review
- platform-specific protection verification harness artifacts per OS

## Open Research Items

These are implementation research tasks inside the full release, not reasons to weaken the goal:

- exact platform API path for meeting/system audio on each OS
- exact platform/local transcription engines available per OS and language
- Electron `setContentProtection` behavior by OS and Electron version
- controlled capture verification method by OS/display server
- packaging requirements for any helper binaries
- latency thresholds for automatic cue triggers and stable partial segments
- acceptable local cleanup window for temporary audio/screenshot artifacts

## Non-Goals

- ambient always-on listening
- tray-only live-session start
- hiding behavior embedded in Interview Helper session logic
- meeting-app-specific capture exclusion without authorized integration
- continuous screenshot recording
- raw audio retention
- raw provider payload retention by default
- automatic profile, resume, saved-job, or application mutation from live-session content
- editor/browser/meeting/coding-platform automation from coding interview cues
- simultaneous multilingual transcription/translation in the first release
- full-display screenshot capture by default

## Latest Evidence

- Landed deterministic full-flow baseline: Interview Helper contracts, explicit setup-consent gate, service state machine, file-backed workspace persistence, restart-to-`interrupted` recovery, Job Finder saved-job setup handoff, Electron-backed microphone permission and desktop capture source readiness checks, source-labeled live transcript ingestion for microphone/meeting audio/meeting-native captions, user-started browser speech bridge, temporary renderer media stream probes, static protected-surface `os-integration` capability adapters, deterministic AI/transcription providers, desktop main IPC/preload hosting, top-level route, separate answer/transcript overlay BrowserWindows, persisted overlay layout/display metadata, no main-window live cue/transcript mirroring, tray/global-hotkey semantic controls, and additive post-session transcript annotations.
- Latest green evidence: `pnpm validate:desktop`; `pnpm --filter @unemployed/desktop ui:interview-helper`; `pnpm --filter @unemployed/desktop ui:interview-helper-protection`.
- Harness artifacts: `apps/desktop/test-artifacts/ui/interview-helper/interview-helper-report.json` and `apps/desktop/test-artifacts/ui/interview-helper-protection/interview-helper-protection-report.json`; the desktop workflow now records Electron microphone permission status, enumerates Electron desktop capture sources for meeting/system readiness, verifies typed meeting-native transcript ingestion can add a platform-local segment and generate a cue without mirroring that transcript in the main window, captures optional visual context with Electron `desktopCapturer`, immediately deletes the temporary PNG, records only metadata plus overlay-contamination disclosure, persists moved overlay bounds with display ids, and Windows Electron `desktopCapturer` protection evidence did not detect protected overlay-window pixels. Runtime user-facing state remains best-effort/requested until per-session/platform verification exists.
