# Job Finder

## Purpose

Owns job discovery, drafting, application review, submission orchestration, and application tracking.

## Early Scope

- Candidate profile import and normalization
- Browser-driven LinkedIn discovery
- Custom per-job resume generation
- Review-gated `Easy Apply` workflow for supported paths
- Applications table with status, notes, attempt history, and failure reasons

## Active Slice

- Current execution plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- First source target: `LinkedIn`
- First submission path: `Easy Apply` only
- First approval mode: `review-before-submit`

## Current Implementation Snapshot

- Typed Job Finder contracts now cover profile, preferences, saved jobs, tailored assets, browser session state, application records, and the desktop workspace snapshot
- The desktop app now renders an initial Job Finder shell with `Profile`, `Discovery`, `Review Queue`, `Applications`, and `Settings` surfaces
- Current data is seeded through a file-backed local repository and a stub browser-session runtime so the vertical slice can move into real discovery next without losing interactive desktop state
- Desktop actions can already move jobs into review, generate seeded resume previews, dismiss discovery jobs, and create submitted application records through typed preload flows

## Package Boundaries

- Contracts from `packages/contracts`
- Browser control from `packages/browser-runtime`
- Storage from `packages/db`
- Shared retrieval from `packages/knowledge-base`

