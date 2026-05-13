# Interview Helper

## Purpose

Owns the Interview Helper live-session workflow: setup, rehearsal, target-context snapshotting, transcript-first cue context, visual cue augmentation, overlay view models, session retention, post-session review, prep artifact conversion, export, and hard-delete behavior.

## Current State

- `packages/contracts` defines Interview Helper setup, rehearsal, capability, protected surface, transcript ingestion, cue-card, visual batch, overlay, session, export, and IPC payload schemas.
- `packages/interview-helper` hosts the deterministic session state machine and retention policy behind adapter interfaces for audio capture, screenshots, protected overlays, cue cards, vision, transcription, and summaries. Persisted active sessions are marked `interrupted` on service restart and never resume capture automatically. Live transcript segments can now be ingested through a typed source-labeled API for microphone, meeting audio, or meeting-native captions, including partial-to-final updates. Transient audio chunks can be transcribed through the provider boundary and normalized into the same transcript path without retaining raw audio in session state.
- Cue generation marks transcript segments with the cue ids that consumed them, preserving bounded provenance for post-session review without resending or retaining raw full transcripts.
- `apps/desktop` hosts the service in Electron main, exposes typed preload methods, creates the top-level Interview Helper route, opens two separate Electron overlay windows for live answer cues and live transcripts during active sessions, persists moved/resized overlay bounds with display metadata, registers tray/global-hotkey controls that call semantic session actions, exposes a compact native-caption/manual transcript intake, exposes a user-started browser speech bridge when Chromium provides `SpeechRecognition`/`webkitSpeechRecognition`, exposes user-started temporary media stream probes for microphone and display/system audio, and can record approved microphone or display/system audio in transient chunks for provider-backed transcription.
- `apps/desktop` lets Job Finder shortlisted jobs and application records deep-link into Interview Helper setup with target context. This is an explicit setup handoff only; live-session content still does not write back to Job Finder automatically.
- `apps/desktop` checks microphone readiness through Electron `systemPreferences` media access status and checks meeting/system capture readiness through Electron `desktopCapturer` source enumeration. Actual live audio streaming and STT remain adapter work.
- `apps/desktop` captures optional visual cue context through Electron `desktopCapturer`, writes only a temporary primary-display PNG, deletes it immediately, and stores metadata plus overlay-contamination disclosure instead of retaining raw screenshots by default.
- `packages/os-integration` currently reports static capability states for protected overlays, desktop audio, screenshots, and capture policy. Overlay protection is requested through Electron content protection, but automated capture-exclusion verification is still reported as `requested_unverified`.
- `packages/ai-providers` supplies deterministic Interview Helper providers for replayable development and test evidence, plus OpenAI-compatible cue-card and audio-transcription providers when `UNEMPLOYED_INTERVIEW_AI_API_KEY` or the shared `UNEMPLOYED_AI_API_KEY` is configured. Model cue output is schema-validated and falls back to deterministic cue cards on provider failure. Audio transcription uses transient `/audio/transcriptions` requests and returns normalized transcript text only.
- `packages/db` persists the structured Interview Helper workspace snapshot as local JSON, including setup state, sessions, overlay preferences, prep artifacts, diagnostics summaries, retained cue/transcript history, and additive transcript annotations.

Latest replayable desktop evidence:

- `pnpm validate:desktop`
- `pnpm --filter @unemployed/desktop ui:interview-helper`
- `pnpm --filter @unemployed/desktop ui:interview-helper-protection`
- artifacts: `apps/desktop/test-artifacts/ui/interview-helper/interview-helper-report.json`
- protection artifacts: `apps/desktop/test-artifacts/ui/interview-helper-protection/interview-helper-protection-report.json`

## Design Principles

- future session flows should reuse shared profile and application history
- document retrieval and AI dependencies should stay behind explicit adapters
- future authorized full capture exclusion must stay behind protected overlay surface adapters and explicit verification results, not hidden assumptions in session logic
- the main app must not be the live sensitive surface; live cue and transcript content belong in the two overlay windows while a session is active

## Boundaries

- `packages/interview-helper` owns prep/session state
- `packages/os-integration` owns overlay windows, hotkeys, and OS capture details
- `packages/knowledge-base` and `packages/ai-providers` are optional future integrations, not hard current dependencies

## Current Platform Limitations

- Microphone permission and desktop capture source readiness are Electron-backed in rehearsal. Browser speech recognition can feed microphone transcript segments where Chromium exposes it, renderer media probes can request temporary microphone/display streams without retention, and configured cloud transcription can consume approved transient MediaRecorder chunks. Durable local/platform STT adapters, automatic meeting-native caption extraction, and real hardware/user-permission validation still need target-platform work.
- On Windows, the automated Electron `desktopCapturer` protection harness did not detect separate overlay-window pixels in ordinary screen capture, and the main window no longer mirrors live cue/transcript text while capture is active.
- User-facing runtime protection state must still stay `Best effort` or `Requested` until platform-specific verification is run as part of the user's actual session; a prior harness pass does not prove meeting-app-specific exclusion.
- Windows validation has run through Electron on this machine. macOS and Linux platform validation still require target hosts because their audio, display-server, and capture-protection behavior cannot be proven from Windows.
