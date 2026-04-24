# Interview Helper

## Purpose

Currently provides overlay UI types and helpers for interview session visualization.

Will own interview prep, live session state, transcript context, capture state, and suggestion generation once the full session module is implemented.

## Current State

- partially implemented with overlay UI types and helpers; full session state logic is planned but not yet the active implementation focus
- current active runtime integration is limited to overlay-facing helpers and `packages/os-integration`, not full interview session orchestration

## Design Principles

- future session flows should reuse shared profile and application history from `packages/contracts`
- any future document retrieval or AI dependencies should stay behind explicit adapters instead of becoming assumed module coupling

## Boundaries

- `packages/interview-helper` will own session and prep state when session state logic is implemented; that includes capture state such as transcripts, capture metadata, and suggestion context. Current exports are limited to overlay UI types and helpers such as `LiveCue`, `InterviewOverlayModel`, and `toOverlayWindowState`
- `packages/os-integration` owns capture implementation details such as overlay window lifecycle, hotkeys, and any OS-specific capture mechanism
- `packages/knowledge-base` and `packages/ai-providers` are optional shared integrations when future session features need them, not hard current dependencies of the module
