# Interview Helper

## Purpose

Will own interview prep, live session state, transcript context, capture state, and suggestion generation once the full session module is implemented.

## Current State

- partially implemented with overlay UI types and helpers; full session state logic is planned but not yet the active implementation focus
- should reuse shared profile and application history from `packages/contracts` plus shared documents and retrieval from `packages/knowledge-base`

## Boundaries

- `packages/interview-helper` will own session and prep state when session state logic is implemented; that includes capture state such as transcripts, capture metadata, and suggestion context. Current exports are limited to overlay UI types and helpers such as `LiveCue`, `InterviewOverlayModel`, and `toOverlayWindowState`
- `packages/os-integration` owns capture implementation details such as overlay window lifecycle, hotkeys, and any OS-specific capture mechanism
- `packages/knowledge-base` and `packages/ai-providers` stay shared dependencies
