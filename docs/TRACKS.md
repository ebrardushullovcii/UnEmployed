# Tracks

Use this file as the short execution queue. Detailed state belongs in `docs/STATUS.md`; completed chronology belongs in `docs/HISTORY.md`.

Updated: 2026-08-20

## Status Keys

- **Active**: implementation or an internal acceptance gate is still running.
- **Ready**: scoped work can start without another product decision.
- **Decision**: implementation waits for an explicit product choice.
- **External**: evidence requires user-controlled credentials, consent, hardware, or another host.
- **Authorization**: repository or external state must not change until the user explicitly approves it.
- **Completed**: current integrated implementation and acceptance are recorded elsewhere.

## Active

- **Active — Job Finder 2026-08-20 production recovery:** the 1,000-row
  truncation and stale full-replacement paths, strict release-test graph, Home
  truth, Discovery layout, navigation/focus/keyboard behavior, scroll chaining,
  compact page chrome, and first-route loading are implemented in the dirty
  candidate. Acceptance is the source-bound production command documented in
  `docs/TESTING.md`; all required repository, coverage, exact-build Electron,
  screenshot-inspection, and final adversarial gates must be green for the same
  source before this track moves to Completed. Interview Helper receives only
  shared-platform regression coverage, by user direction.

- The current customer-facing flow is Profile → Find jobs → Shortlisted →
  Applications. The 15.5rem sidebar is persistent only at CSS widths of at least
  1440px; smaller widths use the compact flow navigation and `Planning &
  settings` menu. Search plans and Resume approaches remain optional reusable
  settings, and Shortlisted's tailored-draft preparation is sequential and
  bounded to at most 10 drafts, each still requiring individual review and
  approval.

- Release status remains active and unaccepted until the exact-source
  production, Electron, screenshot-inspection, adversarial, and cleanup gates
  are green for the current dirty candidate. Older 2026-08-19 evidence does not
  accept this source.

- The exact-source normal-use checkpoint is green: production desktop build,
  isolated prepare-only Greenhouse flow, 41 focused Profile/Strong
  rewrite/Shortlisted/bulk-draft/review tests, 22 Home/navigation tests, desktop
  typecheck, desktop lint, and `git diff --check`. Further extreme-zoom,
  minimum-viewport, and exhaustive recovery testing is deferred by user
  direction for this pass, so this checkpoint does not move the release track
  to Completed.

- The 2026-08-19 516/226/226/511 scale replay and unpacked Windows package are
  historical evidence for the older source. They do not accept the current dirty
  candidate or replace the 2026-08-20 source-bound gate.

- Phase-two closeout is implementation-complete and focused/production-harness verified. The integrated focused batch passed 59 test files / 770 tests with zero failures, including 4 safeguard files / 92 tests; navigation checks passed 9/9 reachability and 16/16 shell assertions. Affected lint, typecheck, Prettier, and `git diff --check` checks passed, and the production desktop build passed. The hardened Electron harness produced 40 captures at 1440×920, 1280×720, and native 200% zoom with zero runtime errors, safety violations, horizontal-overflow findings, or unreachable controls; nested-scroll movement passed 40/40. Evidence: `apps/desktop/test-artifacts/ui/phase-two-absolute-final/`. Its initial broad attempt was blocked before scripts ran; the later 2026-08-19 repository-wide gate passed after release-hardening integration. The exact state is recorded in `docs/exec-plans/active/job-finder-campaigns-dashboard-crm-scale.md`.

## Ready Queue

- Historical final-gate checks for the older six-slice phase-two source passed: Contracts/DB/Job Finder/Desktop TypeScript, the affected lint scope, Prettier, and `git diff --check` were green; the integrated focused suite passed 59 files / 770 tests with zero failures, including 4 safeguard files / 92 tests. The production desktop build passed. The hardened phase-two Electron harness passed 40/40 nested-scroll checks and recorded zero runtime, safety, overflow, and unreachable-control findings across 40 captures at desktop, compact, and native 200% zoom. The later 2026-08-19 broad scripted gate also passed for that source. These results do not accept the current dirty candidate; do not exercise real final submission.

## Decision Required

- None. Windows DACL hardening and generic PDF/DOCX/OCR extraction remain deferred product scope rather than release-blocking decisions.

## External

- User deployment review: with explicit consent, walk the current Job Finder using the user's private résumé, judge extraction and generated wording, and report concrete UX/quality defects with screenshots. Use `docs/audits/JOB_FINDER_DEEP_ACCEPTANCE_REVIEW.html` as the review guide.
- Resume an authenticated Workday application checkpoint only after voluntary browser sign-in and explicit user confirmation. Never infer authentication from navigation.
- Validate Interview Helper microphone/system audio, popup, screenshot, and capture-protection behavior on macOS/Linux target hosts.
- Run personal screen-reader/reduced-motion acceptance during deployment review.
- Re-run discovery search and source checks with the user's configured live provider/network path to confirm transport availability. Product failure classification, exact retry, retained partial work, and stale-guidance provenance are covered locally; provider/network availability is not.

## Explicit Authorization

- Commit, push, create/update a remote branch, or open a PR only after the user accepts the intended scope and explicitly authorizes that exact repository action.

## Completed Context

- Phase-two six-slice batch: advanced campaign rules and truthful pre-search funnel, local schedules/digests/in-app notifications, outcome analytics with explicit campaign/application identity, resume strategies with enforced generation policies, company intelligence with merge review, and high-volume safeguards with recovery are implemented. The integrated focused closeout passed 59 test files / 770 tests with zero failures, including 4 safeguard files / 92 tests; the production desktop build passed; and the hardened Electron harness passed 40/40 nested-scroll checks with zero runtime, safety, overflow, or unreachable-control findings across 40 captures at 1440×920, 1280×720, and native 200% zoom. The initial broad attempt was blocked before scripts ran; the later 2026-08-19 repository-wide gate passed. Exact state: `docs/exec-plans/active/job-finder-campaigns-dashboard-crm-scale.md`.
- AI capability reliability core: shared typed tool-task runtime; dedicated value-setting tools with runtime-owned metadata; temporary profile/résumé proposal drafts with validation repair; valid paged tool results; classified transport retries; progress/time/provider-cost/safety stop rules; persisted browser checkpoints; page-two extraction recovery; and truthful fallback attribution for chat, résumé vision, browser vision, and Interview cues. The current Luna High hard canary passes 11/11 with zero fallback. Acceptance report: `docs/audits/LUNA_HIGH_AND_PRODUCTION_ACCEPTANCE_2026-08-12.html`; decisions: `docs/adr/0009-luna-high-default-and-capability-contracts.md` and `docs/adr/0010-opencode-go-mixed-text-and-vision-routing.md`.

- AI model capability benchmark: 330/330 frozen synthetic outcomes across Luna high, Luna max, and Sol low, 671 provider calls, exact completeness checks, and independent qualitative review. The current owner-selected route is OpenCode Go with DeepSeek V4 Flash for normal text/tool work and Luna High for image-only work. Full report: `docs/audits/AI_MODEL_CAPABILITY_BENCHMARK_FULL_2026-08-12.html`; routing ADR: `docs/adr/0010-opencode-go-mixed-text-and-vision-routing.md`; contract-first agent ADR: `docs/adr/0009-luna-high-default-and-capability-contracts.md`.
- Roadmap implementation: fit/cache truth, durable job identity/freshness, progressive discovery, action handoff/resumption, résumé grounding/coverage/versioning/cache/quality gates, per-job CV choice, application readiness/recovery/packet/receipt, workspace deltas, scale/persistence, saved-state feedback, Task center, diagnostic/performance evidence, Windows Interview health, and the current customer-facing Job Finder journey.
- Current Windows production evidence: fresh first-run setup, three-profile live public-provider ranking, original-CV and configured Luna-high tailored-CV journeys, Greenhouse original-CV safe checkpoint, Ashby tailored-CV safe checkpoint, anonymous Workday sign-in handoff, responsive Action Inbox, and limited Interview Helper popup regression.
- Deep production acceptance: 104 current screenshots across the deep matrix, résumé flow, and first-run flow; zero renderer/console errors; zero document/main horizontal overflow; final submission/account creation remained disabled and untouched.
- Candidate Asset lifecycle: opt-in 30/90-day retention starts after successful import, removal/expiry enters seven-day Trash, restore selects a fresh policy/clock, and startup/lazy enforcement performs ordinary filesystem purge without a secure-erase claim.
- Résumé presentation: all eight apply-safe families use distinct flat, print-aware typography and restrained accents; card/pill document chrome is removed while preview editing hooks and ATS-safe export semantics remain intact.
- Computer Use usability remediation: thirteen recorded findings are addressed across job-scoped résumé validation, authoritative attachment status, Interview lifecycle/health/source labels/popup close reconciliation, conversational and collision-safe Profile Copilot behavior, browser-bound persistence, honest discovery/source-check failure semantics, and profile-inferred discovery without a mandatory title.
- Job-source library scale: sources have a dedicated Profile tab with catalog-wide search/status filters, 25-row pagination, one mounted detailed editor, explicit opt-in enablement, truthful progress, EU Lever provider routing, and production-Electron pointer-scroll evidence against 507 disabled records.
- Final integrated gate: guidance/docs/source-generic checks, package lint/typechecks, fit calibration, and 273/273 test files pass; 2,028 tests pass with one intentional skip. The 100-candidate repeated-source check retains margin under the unchanged 2,000 ms budget at 1,219 ms in its focused run.
- Full details and exact artifacts: `docs/STATUS.md`, `docs/TESTING.md`, `docs/audits/JOB_FINDER_DEEP_ACCEPTANCE_REVIEW.html`, and `docs/audits/JOB_FINDER_COMPLETION_REVIEW.html`.
- Older milestones: `docs/HISTORY.md`.
