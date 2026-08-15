# Tracks

Use this file as the short execution queue. Detailed state belongs in `docs/STATUS.md`; completed chronology belongs in `docs/HISTORY.md`.

Updated: 2026-08-15

## Status Keys

- **Active**: implementation or an internal acceptance gate is still running.
- **Ready**: scoped work can start without another product decision.
- **Decision**: implementation waits for an explicit product choice.
- **External**: evidence requires user-controlled credentials, consent, hardware, or another host.
- **Authorization**: repository or external state must not change until the user explicitly approves it.
- **Completed**: current integrated implementation and acceptance are recorded elsewhere.

## Active

- None. The six phase-two feature slices are implemented and focused-verified (165 test files / 630 tests, zero failures); the final-gate reruns all passed (Contracts/DB/Job Finder/Desktop TypeScript, the affected Contracts/DB/Job Finder/Desktop ESLint scope, the feature Prettier check, and `git diff --check`), exactly one broad `pnpm verify` attempt was made and stopped before repository scripts ran because the pnpm 10.8.0 registry signature/package fetch verification failed (not bypassed or rerun, not claimed to pass), and Electron/Computer Use/visual QA was not run and remains a later separate stage. No worker or test loop is currently running.

## Ready Queue

- Final-gate reruns for the six-slice phase-two batch are complete and passed: Contracts/DB/Job Finder/Desktop TypeScript all passed, the affected Contracts/DB/Job Finder/Desktop ESLint scope passed, the feature Prettier check passed, and `git diff --check` passed; the focused suite passed 165 test files / 630 tests.
- The broad scripted gate (`pnpm verify`) had exactly one attempt that stopped before repository scripts ran because the pnpm 10.8.0 registry signature/package fetch verification failed; it was not bypassed or rerun and has not been claimed to pass. Electron/Computer Use/visual QA was not run in this closeout and remains a later separate stage. Do not exercise real final submission.

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

- Phase-two six-slice batch: advanced campaign rules and truthful pre-search funnel, local schedules/digests/in-app notifications, outcome analytics with manual outcome recording, resume strategies with per-job selection, company intelligence with merge review, and high-volume safeguards with recovery are implemented end to end and focused-verified — 165 test files / 630 tests with zero failures. Final-gate reruns passed: Contracts/DB/Job Finder/Desktop TypeScript all passed, the affected Contracts/DB/Job Finder/Desktop ESLint scope passed, the feature Prettier check passed, and `git diff --check` passed. Exactly one broad `pnpm verify` attempt was made and stopped before repository scripts ran because the pnpm 10.8.0 registry signature/package fetch verification failed; it was not bypassed or rerun and has not been claimed to pass. Electron/Computer Use/visual QA was not run in this closeout and remains a later separate stage. Exact state: `docs/exec-plans/active/job-finder-campaigns-dashboard-crm-scale.md`.
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
