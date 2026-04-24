# Job Finder

## Purpose

Owns profile, resume import, discovery, source-debug, resume workspace, review queue, applications, and apply orchestration.

## Responsibilities

- Own guided setup, profile copilot, resume import, discovery, source-debug, resume workspace, review queue, applications, and apply flows.
- Keep boundaries typed through `packages/contracts`.
- Treat source instructions and browser recovery as generic capabilities, not hardcoded board branches.
- Preserve resume approval and stale-state checks before apply; keep live submit disabled unless explicitly re-authorized.

## Important Defaults

- profile and resume data are local-first
- source-debug and discovery use typed target instructions
- resume approval is required before apply work
- live submit remains intentionally disabled unless explicitly re-authorized

## Where To Continue

- active work: `docs/STATUS.md` and `docs/TRACKS.md`
- product baseline: `docs/PRODUCT.md`
- package rules: `packages/job-finder/AGENTS.md`
