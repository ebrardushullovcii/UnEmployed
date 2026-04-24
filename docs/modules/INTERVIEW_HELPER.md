# Interview Helper

## Purpose

Currently provides overlay UI types and helpers for interview session visualization.

Will own interview prep, live session state, transcript context, capture state, and suggestion generation once the full session module is implemented.

## Current State

- overlay UI types/helpers exist; full session state is planned, not active focus
- active runtime integration is limited to overlay-facing helpers and `packages/os-integration`

## Design Principles

- future session flows should reuse shared profile and application history
- document retrieval and AI dependencies should stay behind explicit adapters

## Boundaries

- `packages/interview-helper` owns prep/session state
- `packages/os-integration` owns overlay windows, hotkeys, and OS capture details
- `packages/knowledge-base` and `packages/ai-providers` are optional future integrations, not hard current dependencies
