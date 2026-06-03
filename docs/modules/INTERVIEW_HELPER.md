# Interview Helper

## Purpose

Owns target-context setup, rehearsal, live-session state, transcript-first cue context, visual cue augmentation, overlay view models, retention, post-session review, prep artifact conversion, export, annotations, and hard-delete behavior.

## Current Baseline

- Setup can start from Job Finder saved jobs/application records or direct user input.
- Rehearsal checks language, audio, transcription fallback, providers, screenshots, overlays, capture-protection state, hotkeys, tray controls, and retention defaults.
- Live sessions are user-started and can ingest microphone, meeting/system audio, meeting-native captions, browser speech recognition, caption files, manual transcript text, local-command STT, and cloud transcription.
- Cue generation uses bounded source-labeled transcript windows, target context, prep artifacts, compact summaries, optional temporary screenshots, schema validation, one retry, and deterministic fallback.
- Desktop opens separate answer and transcript overlay windows, persists overlay layout/display metadata, supports panic-hide, and records protection evidence as explicit capability state.
- Post-session review supports export, transcript annotations, delete, and explicit Job Finder follow-up actions. Live session content never writes back automatically.

## Hard Rules

- Capture, screenshots, model calls, retention, and Job Finder write-back must stay explicit.
- Raw audio, raw provider payloads, raw prompts, raw full transcripts, and unpinned screenshots are not retained by default.
- The main app must not mirror live cue/transcript text while capture is active; live sensitive content belongs in overlay windows.
- Future full capture exclusion must stay behind authorized `os-integration` adapter capabilities and verification results.

## Current Platform Limitations

- Windows validation has run through Electron on this machine.
- macOS/Linux audio, display-server, and capture-protection behavior require target hosts.
- Current protection verification covers ordinary Electron `desktopCapturer` screen capture and does not prove meeting-app-specific exclusion.
