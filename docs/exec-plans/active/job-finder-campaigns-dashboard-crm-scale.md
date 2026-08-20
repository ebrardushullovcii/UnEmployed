# Job Finder Campaigns, Dashboard, CRM, And Scale

Status: active

## 2026-08-20 production-recovery overlay

The campaign program remains the product baseline, but its older acceptance
artifacts do not accept the current source. The active recovery closes the
confirmed 1,000-row persistence loss and stale collection-replacement races,
restores separate correctness/performance/coverage gates, and repairs Home,
Discovery, navigation, focus, keyboard, scrolling, responsive chrome, copy, and
cold-route regressions. Final acceptance must use the exact-build production
wrapper in `docs/TESTING.md`, synthetic isolated data, more than 1,000 records,
real wheel/keyboard events, and current-run screenshot inspection. No release is
accepted while any required gate is red, unrun, stale, or tied to another source
fingerprint.

## Goal

Turn Job Finder into a campaign-based command center that works for both careful, small-set searches and high-volume discovery/application preparation. Add durable campaigns, a truthful home dashboard, consistent list search, and a complete local application CRM without weakening source-generic discovery or the current prepare-only submission boundary.

## Product decisions

- Every workspace has at least one campaign. Existing workspaces migrate into a sensible default campaign without losing jobs, sources, history, resume state, applications, or Needs you lineage.
- Campaign mode is user-selectable and customizable. `precision` defaults to retaining roughly 10-25 strong candidates and deeper review. `scale` defaults to hard eligibility filtering, larger pools, grouping, reusable job-family resume variants, controlled batches, and explicit stop rules.
- The dashboard reports only persisted facts. Missing denominators, unknown dates, and unavailable rates stay unavailable instead of being estimated.
- Applications remain prepare-only. This program may model `applied` and later CRM stages for truthful manual tracking, but it does not authorize browser submission, credentials, account creation, or external authenticated actions.
- DeepSeek V4 handles ordinary text/tool work. Luna handles image-only work. Local Whisper or an explicit audio model remains separate.
- Search is local, keyboard-accessible, and predictable. It must not reset unrelated filters, selection, pane layout, or campaign state.

## Safety and compatibility constraints

- Preserve every inherited dirty or user-owned file.
- Keep typed contracts, typed IPC/preload, schema validation, parameterized SQLite operations, and migration coverage.
- Keep browser workflow policy source-generic and below Job Finder orchestration.
- Preserve application receipts, Candidate Assets, recovery, consent, Needs you lineage, and `submitAuthorized: false`.
- No real submissions, credentials, accounts, deployments, commits, pushes, or PR updates.
- The hardened phase-two Electron replay was run against the production build with synthetic data, no browser agent, and prepare-only safety settings. It is not a substitute for authenticated-site or final-submit acceptance.

## Workstreams and ownership

### Campaign core and dashboard

- Contracts for campaign settings, modes, limits, stop rules, progress, history, and dashboard summaries.
- Repository migration and default-campaign backfill.
- Campaign orchestration, campaign-scoped discovery/history, and truthful dashboard projection.
- Campaign management and Job Search Home UI.

### Application CRM

- Typed lifecycle, custom stages/tags, timeline events, contacts, reminders, interviews, offers, notes, attachments, and automation settings.
- Durable repository operations and migration compatibility.
- Kanban, table, calendar, details/timeline, manual status changes, exports, duplicate hints, and recommended CRM action.

### Search and high-volume UX

- Shared list-search behavior and inventory of every meaningful Job Finder list.
- Search for results, shortlisted jobs, applications, Needs you, history, assets/documents, campaigns, and other discovered list surfaces.
- Global local search, saved views, density, columns, sticky bulk actions, keyboard review, undo, pane persistence, global activity pause, and consistent states where they fit existing ownership.

### Integration and docs

- Resolve shared barrels, workspace snapshots, IPC/preload, shell navigation, and compatibility defaults.
- Update PRODUCT, ARCHITECTURE, CONTRACTS, TESTING, STATUS, TRACKS, HISTORY/ADR where durable decisions require it.
- Correct routing drift to DeepSeek V4 for ordinary text/tool work and Luna for image-only work.

## Implementation order

1. Inventory current contracts, repository schema/migrations, workspace snapshot, lists, and application state.
2. Land contracts and compatibility defaults before widening services or UI.
3. Land persistence migrations and repository operations with focused migration/security tests.
4. Land campaign/dashboard and CRM services, then renderer integration.
5. Land shared search/high-volume UX after the durable projections exist.
6. Integrate package barrels, Electron IPC/preload, shell, and docs.
7. Run package-local tests/lint/typecheck throughout. Run broad scripted verification only after coherent integration.

## Focused acceptance

- An existing workspace opens with one default campaign and identical existing user data.
- Precision and scale campaigns persist independent settings and progress.
- Dashboard counts can be traced to persisted jobs, applications, actions, reminders, interviews, and source health.
- Every specified list has search, count, no-match behavior, keyboard access, and stable selection/filter semantics.
- CRM lifecycle changes persist across restart; timeline, reminders, interviews, contacts, offers, notes, attachments, tags, custom stages, calendar, no-response automation, duplicate hints, CSV, and JSON work locally.
- Discovery remains source-generic and application automation remains prepare-only.

## Campaign enforcement checkpoint

- Enforced now: only an active campaign can start discovery; enabled source IDs are normalized from that campaign's saved search preferences; completed runs and newly found jobs stay bound to the campaign that started the run; minimum fit and retained-job limits control campaign membership; preparation batch and daily preparation limits gate new preparation runs; the global activity pause gates and stops browser/application work; and apply preparation pauses on configured login/signup blockers, changed or unexpected forms, unresolved human-answer/eligibility uncertainty, or a configured cumulative blocked/failed rate after its minimum sample.
- Enforced now: local run-now/daily/selected-time schedules with time-zone-aware start times, pause windows, campaign limits, and persisted run facts; automatic role-family resume-strategy recommendations and per-job strategy selection are also enforced, while reuse never approves or readies an artifact. Analysis concurrency remains saved policy rather than a runtime cap; the UI describes it as such.

## Phase one scripted checkpoint

- Complete on 2026-08-15: guidance, docs, source-generic checks, structure checks, all 14 package lint and typecheck tasks, and the 52-case fit calibration pass.
- The historical phase-one broad test gate passed 2,100 tests: 2,099 ordinary tests ran in parallel and the timing-sensitive repeated-source benchmark ran in an isolated worker without changing its 2,000 ms CPU budget. One live benchmark remains intentionally skipped. This does not establish a passing phase-two broad gate.
- Broad production Electron and visual acceptance remains separate and must be repeated after phase two is coherently integrated.

## Phase two — faster review and deeper job-search operations

Status: all six slices below are implemented in the current checkout (typed contracts, migration-safe persistence, pure operations, service methods, typed IPC/preload, renderer screens, and focused tests). The integrated focused closeout passed 59 test files / 770 tests with zero failures, including 4 safeguard files / 92 tests. Navigation checks passed 9/9 reachability and 16/16 shell assertions. Affected lint, typecheck, Prettier, and `git diff --check` checks passed, and the production desktop build passed. The hardened Electron replay passed 40 captures at 1440×920, 1280×720, and native 200% zoom with zero runtime errors, safety violations, horizontal-overflow findings, or unreachable controls; nested-scroll movement passed 40/40. Evidence is under `apps/desktop/test-artifacts/ui/phase-two-absolute-final/`. The later 2026-08-19 release-hardening integration also passed the repository-wide `pnpm verify` gate and a final 516-job/511-source production scale replay with zero renderer errors; exact evidence is recorded in `docs/STATUS.md` and `docs/TESTING.md`.

### Rapid Review

- Add a campaign-scoped, keyboard-first review queue for shortlist, reject, inspect, undo, multi-select, bulk actions, and side-by-side comparison.
- Keep the decision card factual: title, company, location, compensation, freshness, recommendation, strongest reason, hard conflicts, and missing evidence.
- Every action must move predictably to the next item while preserving a reversible local decision trail.

### Advanced campaign rules

Implemented and verified by focused checks and the phase-two production harness.

- Add enabled/disabled Must have, Prefer, and Never rules for the evidence-backed fields already present in job contracts.
- Keep hard exclusions separate from ranking preferences and show each rule's origin plus measured remove/downgrade counts.
- Show a pre-search funnel only when it is derived from real local jobs or a completed earlier run; never invent an estimate.

### Local schedules and digests

Implemented and verified by focused checks and the phase-two production harness.

- Enforce run-now, daily, and selected-time local schedules, pause windows, campaign limits, and the existing safe stop conditions.
- Persist a campaign digest for new, changed, reactivated, inactive, known, skipped, and failed-source outcomes.
- Add in-app notifications for strong new matches and blocked work. No external email or push integration is included.

### Grouped Needs you

- Group only blockers whose normalized meaning, scope, revision, consent, and answer policy are proven compatible.
- Show the exact number of jobs a reusable answer can unblock, retain per-job lineage, and support safe snooze.
- Credentials, CAPTCHA, MFA, legal consent, account creation, and final submission remain strictly per-job/user-owned and cannot be broadened.

### Outcome learning and resume strategies

Implemented and verified by focused checks and the phase-two production harness.

- Add campaign/source/title/company/resume-strategy outcome views with visible sample size and uncertainty.
- Suggestions remain inspectable, optional, resettable, and separate from objective job facts.
- Add named role-family resume strategies with base resume, template, headline/skills/coverage policy, tailoring strength, evidence boundaries, campaign default, and per-job selection reason.
- Reuse never makes a stale or unapproved artifact application-ready.

### Company intelligence and high-volume safeguards

Implemented and verified by focused checks and the phase-two production harness.

- Add company entities/pages with openings, applications, outcomes, contacts, notes, salary/offer evidence, source history, preferences, and conservative duplicate-review/merge handling.
- Add per-company/time-window caps, simultaneous-application conflict checks, stale/closed/suspicious signals, abnormal-failure pauses, quality-review sampling, contradictory-answer protection, and explicit recovery guidance.

### Phase two implementation order

1. Extend contracts and migration-safe persistence for rules, schedules/digests, grouped decisions, outcomes, strategies, companies, and safeguards.
2. Add pure projections and service operations before wiring renderer actions.
3. Integrate Rapid Review, rule builder, schedule/digest, grouped Needs you, analytics, strategy, and company screens through typed IPC/preload.
4. Write focused contract, repository, service, renderer, and safety tests while each boundary lands. The integrated focused closeout passes 59 test files / 770 tests with zero failures, including 4 safeguard files / 92 tests.
5. Run the affected lint/typecheck/format/diff checks and production build, then run the hardened phase-two Electron replay (`pnpm --filter @unemployed/desktop ui:job-finder-phase-two`) against synthetic data. The replay passes 40 captures, 40/40 nested-scroll checks, and zero runtime/safety/overflow/unreachable findings. The original broad attempt was blocked before scripts ran; a later 2026-08-19 integrated `pnpm verify` run passed.

## Later explicit phases

- Connected email/calendar ingestion and provider authentication.
- Real browser submission authority, which requires a new safety-critical authorization contract and explicit user approval.
- Broad production Electron, Computer Use, authenticated-site, and native-platform visual acceptance.

## Closeout checkpoint — 2026-08-15

This plan remains as the durable record of the closeout. The implementation and focused/Electron verification are complete, and the later 2026-08-19 release-hardening pass supplied a passing repository-wide scripted gate. No HISTORY/ADR update is part of this closeout.

### Fully implemented and verified

- Phase one: durable precision/scale campaigns, the Job Search Home dashboard, campaign-scoped lists, global/local collection search, workspace activity pause, and the local application CRM.
- The phase-one scripted gate passed all package lint/typecheck tasks and 2,100 tests, with one intentional live skip and the timing-sensitive performance case run separately under its unchanged budget. Phase two passed the integrated focused checks and the hardened production Electron replay described above.

### Implemented and focused-verified

- Rapid Review: campaign-scoped queue, keyboard decisions, undo, bulk actions, and comparison.
- Local campaign scheduler foundations: persisted schedules, run-now/daily/selected-time evaluation, digests, in-app notification records, typed service/IPC/preload boundaries, and the desktop scheduler service.
- Grouped Needs you answers: compatibility projection, exact job lineage, atomic all-or-nothing application, snooze, typed Electron bridge, and the Needs you UI.
- Focused feature verification passed 59 test files / 770 tests with zero failures, including 4 safeguard files / 92 tests. Navigation checks passed 9/9 reachability and 16/16 shell assertions. Contracts/DB/AI Providers/Job Finder/Desktop TypeScript, the affected lint scope, the feature Prettier check, and `git diff --check` passed; the production desktop build passed.
- The phase-two Electron replay passed 40 captures at 1440×920, 1280×720, and native 200% zoom with zero runtime errors, safety violations, horizontal-overflow findings, or unreachable controls; nested-scroll movement passed 40/40. Evidence is under `apps/desktop/test-artifacts/ui/phase-two-absolute-final/` and the run left zero Electron processes.

- Advanced campaign rules and truthful pre-search funnel: enabled/disabled Must have/Prefer/Never rules over evidence-backed fields, provenance and measured remove/downgrade/unknown counts, and a funnel projection derived only from the campaign's retained jobs.
- Local schedules, digests, and notifications: run-now/daily/selected-time enforcement with pause windows and persisted run facts, truthful digests, in-app notifications for strong matches and blocked/failed work, campaign management UI, and the desktop scheduler service.
- Outcome analytics and manual outcome recording: user-controlled outcome events, campaign/source/title/company/resume-strategy buckets with real sample size and uncertainty, conservative inspectable/resettable suggestions, and the applications outcome recorder.
- Resume strategies and per-job selection: named role-family strategies with base resume, template, headline/skills/coverage policy, tailoring strength, evidence boundaries, campaign default, and per-job recommendation/selection with reason; reuse never approves, readies, or un-stales an artifact.
- Company intelligence and merge review: company entities with openings, applications, outcomes, contacts, notes, salary/offer evidence, source history, preferences, and explicit merge-review decisions.
- High-volume safeguards and recovery: company application caps, simultaneous-application conflicts, listing signals, abnormal-failure pauses, batch sample reviews, contradictory-answer detections, reversible dismissals, and explicit recovery guidance.
- Each slice has typed contracts, pure operations, workspace-service methods, typed IPC/preload routes, renderer screens, and focused test files, and is covered by the focused feature verification above.

### Repository-wide gate caveat

- The closeout's initial broad attempt was blocked before repository scripts ran; the later 2026-08-19 integrated `pnpm verify` run passed.
- The phase-two production Electron harness did run and passed; authenticated-site testing, live provider/network validation, Computer Use on external sites, and final-submit testing remain outside this closeout.

### Partial or incomplete

- The historical package-manager verification failure was superseded by the passing 2026-08-19 integrated `pnpm verify` run.

### Deferred from the phase-two wishlist

- External email/push integrations, connected-account ingestion, authenticated-site acceptance, and any real final-submit authority.
- Broader live-site/network/provider acceptance and native-platform coverage beyond the synthetic Electron harness.
