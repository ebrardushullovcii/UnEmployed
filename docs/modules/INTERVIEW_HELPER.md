# Interview Helper

## Purpose

Will own interview prep, live session state, transcript context, captures, and suggestion generation.

## Current State

- planned module, not the current active implementation focus
- should reuse shared profile and application history from `packages/contracts` plus shared documents and retrieval from `packages/knowledge-base`

## Boundaries

- `packages/interview-helper` owns session and prep state
- `packages/os-integration` owns overlay window lifecycle and hotkeys
- `packages/knowledge-base` and `packages/ai-providers` stay shared dependencies
