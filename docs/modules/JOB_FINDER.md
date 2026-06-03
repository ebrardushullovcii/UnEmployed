# Job Finder

## Purpose

Owns profile, resume import, discovery, source-debug, resume workspace, review queue, applications, and apply orchestration.

## Current Baseline

- Guided setup and profile copilot create and maintain local-first candidate data.
- Resume import uses parser/text/vision evidence, review candidates, and explicit user confirmation before canonical writes.
- Discovery and source-debug stay source-generic and use typed target instructions.
- Resume Studio owns preview, export, approval, template selection, and manual experience ordering.
- Applications owns safe recovery and review state for non-submitting apply.

## Hard Rules

- Keep boundaries typed through `packages/contracts`.
- Do not hardcode one job board's routing, query maps, triage overrides, or recovery behavior into shared discovery.
- Preserve resume approval and stale-state checks before apply.
- Keep live submit disabled unless explicitly re-authorized.
- Treat browser visual evidence as schema-validated review/recovery context only.

## Where To Continue

- active work: `docs/STATUS.md` and `docs/TRACKS.md`
- product baseline: `docs/PRODUCT.md`
- package rules: `packages/job-finder/AGENTS.md`
