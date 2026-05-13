# Interview Helper

## Purpose

Owns the Interview Helper live-session workflow: setup, rehearsal, target-context snapshotting, transcript-first cue context, visual cue augmentation, overlay view models, session retention, post-session review, prep artifact conversion, export, and hard-delete behavior.

## Current State

- `packages/contracts` defines Interview Helper setup, rehearsal, capability, protected surface, transcript, cue-card, visual batch, overlay, session, export, and IPC payload schemas.
- `packages/interview-helper` hosts the deterministic session state machine and retention policy behind adapter interfaces for audio capture, screenshots, protected overlays, cue cards, vision, transcription, and summaries. Persisted active sessions are marked `interrupted` on service restart and never resume capture automatically.
- `apps/desktop` hosts the service in Electron main, exposes typed preload methods, creates the top-level Interview Helper route, opens two separate Electron overlay windows for live answer cues and live transcripts during active sessions, persists moved/resized overlay bounds with display metadata, and registers tray/global-hotkey controls that call semantic session actions.
- `apps/desktop` checks microphone readiness through Electron `systemPreferences` media access status and checks meeting/system capture readiness through Electron `desktopCapturer` source enumeration. Actual live audio streaming and STT remain adapter work.
- `apps/desktop` captures optional visual cue context through Electron `desktopCapturer`, writes only a temporary primary-display PNG, deletes it immediately, and stores metadata plus overlay-contamination disclosure instead of retaining raw screenshots by default.
- `packages/os-integration` currently reports static capability states for protected overlays, desktop audio, screenshots, and capture policy. Overlay protection is requested through Electron content protection, but automated capture-exclusion verification is still reported as `requested_unverified`.
- `packages/ai-providers` currently supplies deterministic Interview Helper providers for replayable development and test evidence.
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

- Microphone permission and desktop capture source readiness are Electron-backed in rehearsal. Real microphone streams, meeting/system audio streams, local/platform STT, and cloud fallback still need live adapter implementation and hardware/user-permission validation.
- On Windows, the automated Electron `desktopCapturer` protection harness did not detect separate overlay-window pixels in ordinary screen capture, and the main window no longer mirrors live cue/transcript text while capture is active.
- User-facing runtime protection state must still stay `Best effort` or `Requested` until platform-specific verification is run as part of the user's actual session; a prior harness pass does not prove meeting-app-specific exclusion.
- Windows validation has run through Electron on this machine. macOS and Linux platform validation still require target hosts because their audio, display-server, and capture-protection behavior cannot be proven from Windows.
