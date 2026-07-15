# Interview Helper

## Purpose

Owns target-context setup, rehearsal, live-session state, transcript-first cue context, visual cue augmentation, overlay view models, retention, post-session review, prep artifact conversion, export, annotations, and hard-delete behavior.

## Current Baseline

- Setup can start from Job Finder saved jobs/application records or direct user input.
- Core disclosure acceptance is separate from microphone, meeting/system-audio, and screenshot capture consent, so a system-audio-only session is valid and unauthorized sources stay disabled.
- Rehearsal checks language, audio, transcription fallback, providers, screenshots, overlays, capture-protection state, hotkeys, tray controls, and retention defaults.
- Live sessions are user-started and can ingest microphone, meeting/system audio, meeting-native captions, browser speech recognition, caption files, manual transcript text, local-command STT, and cloud transcription.
- A live session begins empty. Synthetic rehearsal text is not inserted into the transcript, standalone non-speech STT markers are ignored, and sub-two-second recorder tails are not sent to transcription. Browser capture rotates complete five-second recorder instances so every local-STT chunk is independently decodable rather than a headerless WebM fragment.
- Cue generation uses bounded source-labeled transcript windows, target context, prep artifacts, compact summaries, optional temporary screenshots, schema validation, one retry, and deterministic fallback.
- Cue-card grounding is enforced after provider output: unsupported personal stories become fill-in STAR scaffolds, model-backed screenshot observations are treated as real evidence without false access disclaimers, and deterministic attachment placeholders cannot be presented as if the image contents were analyzed.
- Starting a desktop interview opens separate visible answer and transcript popup windows by default. They behave like ordinary focusable, resizable desktop windows, can be moved by dragging their headers, and restore their exact saved size and position on the next session. The answer popup accepts typed questions and temporary pasted/selected images, can capture explicit screen context, sends through the same bounded conversation as the main window, copies the latest answer, and can be hidden and reopened. The transcript popup updates live, copies transcript text, and can also be hidden and reopened. Schema-validated workspace events keep all three windows synchronized without reloading or erasing draft input. The app persists layout/display metadata and records protection evidence as explicit capability state. Set `UNEMPLOYED_INTERVIEW_ADVANCED_SURFACES=0` only for the visible-chat-only fallback.
- Post-session review supports export, transcript annotations, delete, and explicit Job Finder follow-up actions. Live session content never writes back automatically.

## Hard Rules

- Capture, screenshots, model calls, retention, and Job Finder write-back must stay explicit.
- Raw audio, raw provider payloads, raw prompts, raw full transcripts, and unpinned screenshots are not retained by default.
- Popup windows are the dedicated live answer/transcript surfaces. The answer popup and main conversation share one persisted bounded chat; temporary attachment bytes remain transient. The main conversation remains visible for ordinary interaction and must not imply that its content is capture-excluded.
- Future full capture exclusion must stay behind authorized `os-integration` adapter capabilities and verification results.

## Current Platform Limitations

- Windows validation has run through Electron on this machine.
- Real Windows loopback acceptance has captured intelligible multi-word Stremio dialogue through local Whisper `base.en`, rendered it in both visible popup/main transcript surfaces, and completed chat-with-image, cue, pause/resume, end, review, and export without enabling the microphone.
- Fresh production-build acceptance also verified real system-audio signal detection, native file-picker image attachment, popup copy/move/resize/hide/reopen behavior with exact layout restoration, grounded STAR fallback, and an authoritative end-to-review transition without stale live-session resurrection.
- macOS/Linux audio, display-server, and capture-protection behavior require target hosts.
- Current protection verification covers ordinary Electron `desktopCapturer` screen capture and does not prove meeting-app-specific exclusion.
