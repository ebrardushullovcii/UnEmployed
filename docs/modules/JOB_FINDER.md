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

## Package Boundaries

- Contracts from `packages/contracts`
- Browser control from `packages/browser-runtime`
- Storage from `packages/db`
- Shared retrieval from `packages/knowledge-base`

