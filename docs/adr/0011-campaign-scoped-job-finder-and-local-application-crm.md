# ADR 0011: Campaign-scoped Job Finder and local application CRM

## Status

Accepted

## Context

Job Finder must support both a person narrowing a broad search to a small set of strong opportunities and a person processing hundreds or thousands of openings. The previous workspace had one global search configuration and an application record primarily shaped around safe browser preparation. That could not preserve independent search goals, explain campaign-specific progress, or track the employer relationship after an application was prepared or manually sent.

The existing application execution state is also safety-sensitive. `submitted` means a real external submission was observed. A user manually tracking an application as Applied must not manufacture that browser-execution fact.

## Decision

- Make job-search campaigns durable workspace records. Each campaign owns its mode, search preferences, enabled sources, thresholds, limits, stop rules, schedule, application policy, progress, and history.
- Migrate every existing workspace into one default precision campaign without deleting or rewriting existing profile, job, source, discovery, application, or Needs you data.
- Bind new discovery work to the active campaign when the run starts. Switching campaigns later cannot move another campaign's run or progress.
- Keep one persisted workspace-level browser/application activity pause. Pausing stops or blocks browser-owned discovery, source checking, and application preparation; resuming permits future work but never replays an external action.
- Add a defaulted CRM payload to each application record for lifecycle stage, timeline, contacts, reminders, interviews, notes, Candidate Asset references, tags, and compensation/offer details.
- Keep CRM tracking truth separate from browser execution truth. Manually selecting Applied or a later employer stage updates the CRM payload and timeline but never changes a legacy preparation record to `submitted`, never creates a submission timestamp, and never grants submit authority.
- Derive dashboard, Kanban, table, calendar, duplicate hints, rates, and recommended actions from persisted local facts. Missing evidence remains unavailable instead of being estimated.
- Keep connected email/calendar detection behind later typed integrations. This decision adds local tracking and export only; it does not authorize credentials or external account access.

## Consequences

### Positive

- Beginners get one guided next action while high-volume users get independent campaigns, throughput, batches, and operational status.
- Existing workspaces remain usable through a deterministic default campaign.
- Application preparation, manual job-search tracking, and actual submission receipts remain distinguishable and auditable.
- The local CRM can evolve toward email/calendar integrations without granting those permissions now.

### Negative

- Workspace snapshots, repository compatibility, service orchestration, Electron APIs, and renderer state all grow.
- Campaign-aware discovery and CRM projections require explicit identifiers and migration tests instead of inferring ownership from whichever campaign is currently selected.
- Large workspaces need bounded projections, local search, pagination, and careful renderer performance checks.

## Rejected alternatives

- Keep campaigns as renderer-only saved filters: rejected because progress/history would be lost or misattributed across restart.
- Store campaign/CRM state in a separate untyped database: rejected because it would split the local source of truth and bypass existing schema migration guarantees.
- Reuse `ApplicationRecord.status = submitted` for manual Applied tracking: rejected because it would falsely claim an external action occurred and weaken the no-submit safety boundary.
- Enable connected email/calendar or browser submission as part of this change: rejected because both require separate permissions, provider contracts, and explicit user authorization.

## Related decisions

- ADR 0006: Safe non-submitting apply boundary
- ADR 0007: Source-generic browser workflows
- ADR 0010: OpenCode Go mixed text and vision routing
