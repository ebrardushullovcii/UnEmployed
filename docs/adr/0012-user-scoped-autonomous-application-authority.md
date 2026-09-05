# User-Scoped Autonomous Application Authority

Status: accepted

Supersedes [ADR 0006](0006-safe-non-submitting-apply-boundary.md).

## Context

The prepare-only boundary was intentionally temporary: ADR 0006 required a new
explicit authorization before live submission could become product scope. On
2026-08-26 the product owner explicitly authorized full application automation,
including final submission, when the user has selected and scoped that authority
through product preferences or settings.

The product goal is the outcome, not the current browser loop, state machine, or
UI. The existing implementation remains prepare-only until a replacement
authority contract is implemented and accepted; this decision does not turn an
internal flag or legacy apply mode into submission permission.

## Decision

Job Finder will support explicit application automation modes:

- `prepare_only`: fill and prepare, then stop before final submission
- `confirm_before_submit`: prepare automatically and require confirmation before
  the final submission action
- `autonomous_submit`: execute and submit within a user-defined authority envelope

The authority envelope must be explicit, inspectable, revocable, and scoped. It
must cover at least campaign or job scope, application volume, resume and answer
policy, intermediate employer-site writes, account behavior, final submission,
stop conditions, and expiry. Existing workspaces stay `prepare_only` until the
user chooses a broader mode.

Autonomous mode may perform final submission and other ordinary application
steps that fall inside the saved policy. It must pause rather than guess when a
step falls outside that policy, requires unknown eligibility or legal facts,
needs unavailable credentials or MFA, presents CAPTCHA or anti-bot challenges,
or cannot prove whether an action already occurred. The product must not bypass
security challenges or treat preferences as consent to an unseen material
attestation.

Every external mutation and submission attempt must be idempotent where the site
allows it, bound to one exact application lineage, and recorded with authority,
inputs, observed result, uncertainty, and recovery facts. Internal intent never
proves an employer-site outcome.

Model output alone is never application authority. A model may inspect state and
propose the next bounded action, but a deterministic policy executor must bind
that action to the current page observation, exact application lineage, and
saved authority envelope before any external mutation. Final submission uses a
separate preflight and outcome-verification path and is never retried when the
site outcome is uncertain.

The current 10-per-run and 20-per-local-day limits remain implementation defaults
during migration. They may become user-configurable safeguards only through an
explicit policy and contract change; they are not silently removed by this ADR.

Before expanding the runtime, the team will compare the current orchestration
against simpler deterministic, tool-first agent, and hybrid browser designs.
Current discovery, profile editing, resume editing, and browser-control
approaches may be replaced if another design produces better truthful outcomes.

## Consequences

- The current prepare-only sealed-acceptance and blind-persona chain is paused;
  it cannot certify the newly authorized end state.
- Contracts, persistence, browser runtime, product copy, safeguards, receipts,
  tests, and acceptance must distinguish the three modes explicitly.
- Final-submit controls may be used only by the new typed authority path. Legacy
  flags and current prepare-only APIs remain non-submitting.
- Platform terms and account risk must be disclosed without pretending that a
  warning substitutes for user choice or technical safety.
- Product and architecture work should optimize for reliable end-to-end results,
  not preserve the current agent loop or UI structure.
