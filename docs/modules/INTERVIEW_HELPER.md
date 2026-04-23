# Interview Helper

## Purpose

Owns interview prep, live session state, transcript context, captures, and suggestion generation.

## Current State

- planned module, not the current active implementation focus
- should reuse shared profile, documents, and application history

## Boundaries

- `packages/interview-helper` owns session and prep state
- `packages/os-integration` owns overlay window lifecycle and hotkeys
- `packages/knowledge-base` and `packages/ai-providers` stay shared dependencies
