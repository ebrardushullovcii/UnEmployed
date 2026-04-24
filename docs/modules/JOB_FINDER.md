# Job Finder

## Purpose

Owns profile, resume import, discovery, source-debug, resume workspace, review queue, applications, and apply orchestration.

## Responsibilities

- Own guided setup, profile copilot inputs, resume import, discovery, source-debug, resume workspace, review queue, applications, and apply flows.
- Keep package boundaries typed through `packages/contracts`; desktop IPC should call package APIs rather than package internals.
- Treat discovery targets, learned source instructions, and browser recovery state as generic source capabilities, not hardcoded board branches.
- Preserve resume approval and stale-state checks before apply work, and keep live submit disabled unless explicitly re-authorized.

## Important Defaults

- profile and resume data are local-first
- source-debug and discovery use typed target instructions
- resume approval is required before apply work
- live submit remains intentionally disabled unless explicitly re-authorized

## Where To Continue

- active work: `docs/STATUS.md` and `docs/TRACKS.md`
- product baseline: `docs/PRODUCT.md`
- package rules: `packages/job-finder/AGENTS.md`
