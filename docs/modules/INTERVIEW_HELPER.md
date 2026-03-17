# Interview Helper

## Purpose

Owns interview prep, live transcript context, screenshot capture, and suggestion generation.

## Early Scope

- Prep workspace for interview context
- Full chat/panel interface
- Overlay with short cues
- Session persistence for transcripts, screenshots, and suggestions
- Global hotkeys and tray actions

## Package Boundaries

- Contracts from `packages/contracts`
- Audio and window integration from `packages/os-integration`
- Retrieval from `packages/knowledge-base`
- Provider abstractions from `packages/ai-providers`

## Overlay Boundary

- `packages/interview-helper` owns overlay content and state shape.
- `packages/os-integration` owns the actual overlay window lifecycle and any platform-specific display/capture policy.
- Keep these separate so future window-policy changes do not require rewrites through live session logic.
