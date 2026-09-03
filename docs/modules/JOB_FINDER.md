# Job Finder

## Purpose

Owns profile, resume import, discovery, source-debug, resume workspace, review queue, applications, and apply orchestration.

## Current Baseline

- Guided setup and profile copilot create and maintain local-first candidate data.
- Resume import uses parser/text/vision evidence, review candidates, and explicit user confirmation before canonical writes.
- Discovery, source-debug, and apply preparation stay source-generic and use typed target instructions; users configure which sources run. See [ARCHITECTURE.md](../ARCHITECTURE.md) and [ADR 0007](../adr/0007-source-generic-browser-workflows.md).
- Agent discovery persists kept jobs incrementally: each successful extraction
  checkpoint runs new postings through the same triage/ledger/budget/merge path
  and commits them atomically (saved jobs, or staged pending jobs in
  discovery-only mode) with the ledger and run state. Every posting identity is
  processed at most once per target per content variant — repeat observations
  with unchanged listing fingerprints are suppressed; a materially changed
  re-extraction (richer description/evidence) is deliberately reprocessed so
  the upgrade merges into the existing saved/staged job with legacy duplicate
  accounting (found/duplicates yes, new/persisted/staged no). The final pass
  covers only unprocessed remainder plus such upgrades, keeping counters
  additive and idempotent. A failed incremental attempt rolls back and falls
  back to end-of-source persistence; cancellation keeps already committed jobs
  visible and marks the run truthfully partial. Checkpoints that carry no
  unprocessed postings take a lightweight run-state-only save (resume
  checkpoint durability without a saved-job delta commit or ledger rebase).
- Known incremental-discovery tradeoffs for live acceptance: budget selection
  is greedy per flush under the target's fixed fair-share cap — an early flush
  spends remaining slots on its best-ranked candidates and later, better
  candidates cannot displace already-persisted choices within a run (global
  cross-source ranking is unchanged and stays a possible follow-up); and when
  one identity arrives with several title/card variants, the merge keeps one
  row with the last-ranked variant's content while counting each observation.
- Every discovery result declares complete, partial, or unknown inventory
  coverage. Listing activity is derived for snapshots from exact listing
  identity, inventory, recency, and typed signals; it is not persisted onto the
  saved-job row or conflated with application status.
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
- Transient surfaces (Planning menu, Task Center, global search, saved views,
  CRM stage modal, profile source-debug/settings modals via
  `use-modal-focus-trap`, the Interview Helper delete-session dialog,
  discovery activity dialog, campaign rule builder, resume guided-edits and
  profile copilot dialogs) share the renderer-local LIFO overlay registry
  (`job-finder-overlay-ownership`): one Escape closes only the topmost layer,
  handlers honor `defaultPrevented` and IME composition, `/` and Cmd+B stay
  blocked while any layer is open, and Cmd/Ctrl+K always summons search.
  New covering surfaces must register through
  `useJobFinderOverlayOwnership`. Rapid review j/k/x keys stay outside the
  registry (shortcut surface, not an overlay), and the Resume Studio preview
  pane binds keys inside its iframe document, not app chrome.
- At CSS widths of at least 1440px, navigation uses a persistent 17rem sidebar
  with the grouped destinations. Below that breakpoint, the compact top
  navigation exposes the core flow and a `More` menu for the
  remaining destinations.
- Search plans are optional reusable campaign settings; the default plan is
  enough to begin finding jobs and never configure application volume. Fixed
  product safeguards allow at most 10 unique employer jobs per preparation run
  and 20 begun employer applications per local day. A paired immutable
  timestamp/local-date mark is written before browser work; dashboard capacity
  separates exact starts from uncertain legacy lineages and resets at the next
  local midnight. Resume approaches are optional reusable
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
- Refuse shortlist and preparation for an exact listing with derived `closed`
  activity; keep `inactive`, `stale`, and `unknown` truthful rather than treating
  them as confirmed closure.
- Preserve the explicit application-CV mode: tailored mode requires current approval, while original mode displays and attaches the unchanged imported source file without generating a new draft.
- Keep live submit disabled unless explicitly re-authorized.
- Treat browser visual evidence as schema-validated review/recovery context only.
- Never persist a paged or stale saved-job collection through a destructive
  replacement API; ordinary mutations must use the row-local repository commit.
- Employer exclusion is an exact-name, previewed, atomic, and reversible local
  preference. Domain evidence may corroborate identity but must never become a
  domain-wide exclusion.
- Company ownership requires an exact canonical name or user-approved merge
  alias. Legacy aliases and domains never own jobs; salary evidence binds the
  exact current job and offer evidence additionally binds its exact application
  record in one transaction-current commit.
- Application documents fail closed on stale question/application lineage.
  Company detail routes never substitute another company, and CRM timeline and
  confirmation UI preserve preparation-only truth and modal focus ownership.

## Where To Continue

- active work: `docs/STATUS.md` and `docs/TRACKS.md`
- product baseline: `docs/PRODUCT.md`
- package rules: `packages/job-finder/AGENTS.md`
