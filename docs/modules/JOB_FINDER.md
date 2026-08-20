# Job Finder

## Purpose

Owns profile, resume import, discovery, source-debug, resume workspace, review queue, applications, and apply orchestration.

## Current Baseline

- Guided setup and profile copilot create and maintain local-first candidate data.
- Resume import uses parser/text/vision evidence, review candidates, and explicit user confirmation before canonical writes.
- Discovery and source-debug stay source-generic and use typed target instructions.
- Large source catalogs live in a dedicated Profile tab with catalog-wide search/status filters, 25-row pages, quick opt-in enablement, and one detailed source editor mounted at a time; imported records remain disabled until explicitly enabled.
- Reusable provider adapters normalize public Ashby boards and exact Workday candidate-experience job endpoints; unsupported or authenticated paths remain explicit browser-owned human handoffs.
- Lever provider inference selects the matching default or EU public API from the source hostname without introducing board-specific workflow policy.
- Discovery fit review includes a persisted requirement-evidence ledger with listing quotations, exact profile/experience/project citations, hard-gap states, and conservative action recommendations.
- API-backed sources start their independent inventory reads concurrently; limited result sets prefer distinct role options, use cleaned employer labels, keep unconstrained preferences score-neutral, and penalize unsupported requirements or adjacent titles instead of inflating them.
- Resume Studio owns preview, export, approval, template selection, and manual experience ordering.
- Applications owns safe recovery and review state for non-submitting apply.
- The normal user flow is Profile → Find jobs → Shortlisted → Applications.
  Needs you, Task center, and Settings support that flow without adding steps.
- Sign-in recovery opens the dedicated browser and waits for an explicit `I'm signed in — retry` action; the app never asks for, receives, or stores account credentials.
- Home distinguishes no configured sources, a configured first search, and
  historical zero current metrics instead of sending every zero state back to
  setup.
- Desktop routes use compact page chrome, explicit scroll ownership with residual
  wheel/keyboard chaining, and route-level loading with post-paint preload for
  the core Profile, Find jobs, Shortlisted, and Applications journey.
- At CSS widths of at least 1440px, navigation uses a persistent 15.5rem sidebar
  with the grouped destinations. Below that breakpoint, the compact top
  navigation exposes the core flow and a `Planning & settings` menu for the
  remaining destinations.
- Search plans are optional reusable campaign settings; the default plan is
  enough to begin finding jobs. Resume approaches are optional reusable
  role-family rules and are contextual from Shortlisted job review; reusing one
  never approves or makes a résumé application-ready.
- First-use Profile setup offers Light edit, Balanced rewrite, and Strong
  rewrite. Strong rewrite remains evidence-bound and review-required, with no
  invented facts or numbers and no automatic approval or submission.
- Shortlisted can prepare the next up to 10 eligible tailored drafts in
  sequence. Each draft still requires individual review and approval; nothing
  is exported, approved, queued, submitted, or sent automatically.

## Hard Rules

- Keep boundaries typed through `packages/contracts`.
- Do not hardcode one job board's routing, query maps, triage overrides, or recovery behavior into shared discovery.
- Preserve resume approval and stale-state checks before apply.
- Preserve the explicit application-CV mode: tailored mode requires current approval, while original mode displays and attaches the unchanged imported source file without generating a new draft.
- Keep live submit disabled unless explicitly re-authorized.
- Treat browser visual evidence as schema-validated review/recovery context only.
- Never persist a paged or stale saved-job collection through a destructive
  replacement API; ordinary mutations must use the row-local repository commit.

## Where To Continue

- active work: `docs/STATUS.md` and `docs/TRACKS.md`
- product baseline: `docs/PRODUCT.md`
- package rules: `packages/job-finder/AGENTS.md`
