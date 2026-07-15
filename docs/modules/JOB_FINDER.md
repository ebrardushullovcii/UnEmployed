# Job Finder

## Purpose

Owns profile, resume import, discovery, source-debug, resume workspace, review queue, applications, and apply orchestration.

## Current Baseline

- Guided setup and profile copilot create and maintain local-first candidate data.
- Resume import uses parser/text/vision evidence, review candidates, and explicit user confirmation before canonical writes.
- Discovery and source-debug stay source-generic and use typed target instructions.
- Reusable provider adapters normalize public Ashby boards and exact Workday candidate-experience job endpoints; unsupported or authenticated paths remain explicit browser-owned human handoffs.
- Discovery fit review includes a persisted requirement-evidence ledger with listing quotations, exact profile/experience/project citations, hard-gap states, and conservative action recommendations.
- API-backed sources start their independent inventory reads concurrently; limited result sets prefer distinct role options, use cleaned employer labels, keep unconstrained preferences score-neutral, and penalize unsupported requirements or adjacent titles instead of inflating them.
- Resume Studio owns preview, export, approval, template selection, and manual experience ordering.
- Applications owns safe recovery and review state for non-submitting apply.
- Sign-in recovery opens the dedicated browser and waits for an explicit `I'm signed in — retry` action; the app never asks for, receives, or stores account credentials.

## Hard Rules

- Keep boundaries typed through `packages/contracts`.
- Do not hardcode one job board's routing, query maps, triage overrides, or recovery behavior into shared discovery.
- Preserve resume approval and stale-state checks before apply.
- Preserve the explicit application-CV mode: tailored mode requires current approval, while original mode displays and attaches the unchanged imported source file without generating a new draft.
- Keep live submit disabled unless explicitly re-authorized.
- Treat browser visual evidence as schema-validated review/recovery context only.

## Where To Continue

- active work: `docs/STATUS.md` and `docs/TRACKS.md`
- product baseline: `docs/PRODUCT.md`
- package rules: `packages/job-finder/AGENTS.md`
