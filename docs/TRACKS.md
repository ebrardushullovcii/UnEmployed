# Tracks

Use this file as the short execution queue. Detailed state belongs in `docs/STATUS.md`; completed chronology belongs in `docs/HISTORY.md`.

Updated: 2026-08-26

## Status Keys

- **Active**: implementation or an internal acceptance gate is still running.
- **Ready**: scoped work can start without another product decision.
- **Decision**: implementation waits for an explicit product choice.
- **External**: evidence requires user-controlled credentials, consent, hardware, or another host.
- **Authorization**: repository or external state must not change until the user explicitly approves it.
- **Completed**: current integrated implementation and acceptance are recorded elsewhere.

## Active

- **Active — temporary Muse Free provider dogfood:** ignored local configuration
  routes shared text and image-capable AI calls to OpenCode Zen
  `muse-spark-1.2-contributor-free` through Responses with requested `xhigh`
  reasoning. Synthetic text and one-pixel image probes pass; no end-to-end app,
  configured-tool, resume-quality, browser-agent, or Interview Helper capability
  acceptance exists yet. Run initial checks with synthetic data only. Before any
  private resume, application answer, credential, or interview input, obtain
  explicit informed consent because this contributor tier may use prompts and
  completions for Meta model training. Rotate the temporary conversation-shared
  key. Decide after capability/privacy review whether to revert to ADR 0010's
  mixed OpenCode Go production route or supersede that ADR and update the tracked
  defaults and acceptance evidence. Setup: `docs/AI_PROVIDER_SETUP.md`.

- **Active — autonomous application architecture reset:** ADR 0012 authorizes
  prepare-only, confirm-before-submit, and autonomous-submit modes under an
  explicit user-scoped authority envelope. Current code remains prepare-only.
  Both disposable comparisons are complete and recorded in ADR 0013: discovery
  becomes API-first, deterministic compact observation second, and bounded model
  escalation third; applications move to an explicit deterministic
  observe/propose/authorize/execute/verify protocol rather than a submit flag in
  the coupled driver. Additive contracts, the compact observer, compact-first
  ordinary-discovery integration, and a pure submission-policy gate are now
  implemented without widening production submission authority. Evaluate Profile
  Copilot operation tools and Resume Studio/editor foundations with the same
  measured-replacement rule.
  Preserve truthful evidence, exact application lineage, idempotency, revocation,
  and pause-on-unknown behavior without preserving current implementation
  structure for its own sake. Heavy validation is deferred and later serialized.
  Active plan:
  `docs/exec-plans/active/job-finder-autonomous-application-architecture.md`.

- **Active, paused — sealed acceptance and blind persona chain:** this chain
  currently certifies the prepare-only target superseded by ADR 0012. Do not
  enter freeze, seal a build, bind ATS results, prepare persona workspaces, or
  launch P01-P14 until the authority architecture and revised acceptance contract
  are implemented. The existing tooling and evidence remain useful historical
  baselines. The integrated
  implementation slices (listing activity/filters, complete company views,
  exact ApplicationRecord lineage, transaction-current CRM bulk updates,
  onboarding source opt-in, exact resume approval, 10-per-run and
  20-per-local-day safeguards, atomic employer exclusion, durable pre-browser
  start accounting, canonical/user-approved company ownership, salary/offer
  evidence, document lineage, fail-closed company/CRM UI truth) are complete.
  The acceptance tooling — immutable accepted-app seal/custody, persona
  seeder/launcher with CDP, strict/consumed verification, and measured startup
  geometry, the evidence init/record/aggregate harness, release-mirror
  fingerprint exclusion, and strict ATS binding with distinct safe-blocker
  truth — is implemented and focused-green but unaccepted. No exact-build
  sealed run, external seal custody, post-seal ATS binding result, prepared
  persona workspace, or persona session exists for the current source, and the
  broad non-Electron gate is stale against it. Strict ATS bound mode and the
  accepted-app production-like probe have passed focused tests, static
  validation, and independent safety review. Job Finder stays the priority
  track: the simplification/fix wave that followed the pre-fix live dogfood
  journeys is code complete at focused level (focused tests green in the
  current dirty tree), but it has no broad-gate, fresh-build, or rebuilt live
  evidence yet. The exact remaining chain precedes the hard freeze: run the
  broad non-Electron gate once, make exactly one production build, then
  replay one fresh live complete journey against that build — including
  résumé export through the explicit test-API chooser bypass and a separately
  observed human native Save As/Cancel pass in production mode — and only
  then freeze. User-owned external gates below and the dirty-tree/no-commit
  freeze rules in `docs/TESTING.md` are unchanged. Exact sequence, restart
  rules, and thresholds:
  `docs/exec-plans/active/job-finder-sealed-acceptance-and-blind-personas.md`.

- **Active — release and deployment gates:** the shell is implemented for 1440px
  desktop, compact widths, keyboard use, long labels, and practical native
  Electron 125% zoom at a normal desktop window — the current low-vision
  acceptance point after the user removed native 200% zoom from current
  acceptance on 2026-08-24 because it collapses into a mobile-like layout with
  low diagnostic value (existing 200% harness runs and evidence stay historical
  records, not current requirements) — but screen-reader acceptance is still
  pending. Live current-source Electron sessions are the primary UX evidence;
  automated suites stay mandatory guardrails and integrity checks that never
  substitute for them.
  Live relevance, private-resume and
  generated-draft quality, configured provider/network transport, authenticated
  ATS behavior, credentials/consent, account creation, and final submit remain
  user-controlled external gates. No exact-build, broad-release, live-quality,
  accessibility, authenticated-ATS, or persona-completion claim is current.

## Ready Queue

- **Ready after the sealed acceptance run — canonical blind persona wave:** the
  fixed 14-persona manifest, deterministic resume/job corpora, accepted-app seed
  pipeline, external custody index, and tester launcher are prepared and
  focused-green but unaccepted. After the stable source passes the final sealed run and the expected seal digest is held
  outside the repository, run one single sequential `--persona all` preparation
  into a fresh empty destination root plus a fresh custody root, re-check the
  sealed wave with read-only `--verify-all`, then launch independent UI-only
  testers through the custody-bound launcher (`--attempt` for relaunch/retest).
  No persona has launched or completed. The protocol, thresholds, and stop
  conditions are in `docs/TESTING.md`; sequence and restart rules live in
  `docs/exec-plans/active/job-finder-sealed-acceptance-and-blind-personas.md`.
  The wave measures the quality-over-speed bar — boundary understanding,
  save/approval durability, and paid-product finish — and cannot replace
  private-resume, live-source, authenticated-ATS, or personal-accessibility
  deployment review.

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

- Current-source dogfood unblock: Job Finder package validation passes 137 files /
  1,795 tests; Desktop package validation passes 275 files / 2,613 tests plus its
  prepare-only report-binding check; AI Providers passes 28 files / 398 tests;
  the production Desktop build passes; legacy company aliases are repaired by
  migration 14 without deleting workspace data; and the rebuilt app opens the
  real Profile, Find jobs, Shortlisted, and Applications surfaces.
  Autonomous final submission remains tracked separately and disabled.
- Save-retry revision hardening: Profile, setup, Resume Studio, and Settings now
  retire exact-request retries on every supported user edit, including edits
  inside already-dirty forms and field-array append/remove actions. Hydration,
  canonical reseeds, save echoes, discard, and assistant-origin changes remain
  silent; focused edit-signal suites pass 65/65.
- Phase-two six-slice batch: advanced campaign rules and truthful pre-search funnel, local schedules/digests/in-app notifications, outcome analytics with explicit campaign/application identity, resume strategies with enforced generation policies, company intelligence with merge review, and high-volume safeguards with recovery are implemented. The integrated focused closeout passed 59 test files / 770 tests with zero failures, including 4 safeguard files / 92 tests; the production desktop build passed; and the hardened Electron harness passed 40/40 nested-scroll checks with zero runtime, safety, overflow, or unreachable-control findings across 40 captures at 1440×920, 1280×720, and native 200% zoom. The initial broad attempt was blocked before scripts ran; the later 2026-08-19 repository-wide gate passed. Exact state: `docs/exec-plans/active/job-finder-campaigns-dashboard-crm-scale.md`.
- AI capability reliability core: shared typed tool-task runtime; dedicated value-setting tools with runtime-owned metadata; temporary profile/résumé proposal drafts with validation repair; valid paged tool results; classified transport retries; progress/time/provider-cost/safety stop rules; persisted browser checkpoints; page-two extraction recovery; and truthful fallback attribution for chat, résumé vision, browser vision, and Interview cues. The current Luna High hard canary passes 11/11 with zero fallback. Acceptance report: `docs/audits/LUNA_HIGH_AND_PRODUCTION_ACCEPTANCE_2026-08-12.html`; decisions: `docs/adr/0009-luna-high-default-and-capability-contracts.md` and `docs/adr/0010-opencode-go-mixed-text-and-vision-routing.md`.

- AI model capability benchmark: 330/330 frozen synthetic outcomes across Luna high, Luna max, and Sol low, 671 provider calls, exact completeness checks, and independent qualitative review. The current owner-selected route is OpenCode Go with DeepSeek V4 Flash for normal text/tool work and Luna High for image-only work. Full report: `docs/audits/AI_MODEL_CAPABILITY_BENCHMARK_FULL_2026-08-12.html`; routing ADR: `docs/adr/0010-opencode-go-mixed-text-and-vision-routing.md`; contract-first agent ADR: `docs/adr/0009-luna-high-default-and-capability-contracts.md`.
- Roadmap implementation: fit/cache truth, durable job identity/freshness, progressive discovery, action handoff/resumption, résumé grounding/coverage/versioning/cache/quality gates, per-job CV choice, application readiness/recovery/packet/receipt, workspace deltas, scale/persistence, saved-state feedback, Task center, diagnostic/performance evidence, Windows Interview health, and the current customer-facing Job Finder journey.
- Historical Windows production evidence: fresh first-run setup, three-profile live public-provider ranking, original-CV and configured Luna-high tailored-CV journeys, Greenhouse original-CV safe checkpoint, Ashby tailored-CV safe checkpoint, anonymous Workday sign-in handoff, responsive Action Inbox, and limited Interview Helper popup regression. Most cited artifact directories for these runs no longer exist locally (only the live public-provider ranking summary remains inspectable); see the acceptance-evidence audit in `docs/STATUS.md`.
- Deep production acceptance: 104 current screenshots across the deep matrix, résumé flow, and first-run flow; zero renderer/console errors; zero document/main horizontal overflow; final submission/account creation remained disabled and untouched.
- Candidate Asset lifecycle: opt-in 30/90-day retention starts after successful import, removal/expiry enters seven-day Trash, restore selects a fresh policy/clock, and startup/lazy enforcement performs ordinary filesystem purge without a secure-erase claim.
- Résumé presentation: all eight apply-safe families use distinct flat, print-aware typography and restrained accents; card/pill document chrome is removed while preview editing hooks and ATS-safe export semantics remain intact.
- Computer Use usability remediation: thirteen recorded findings are addressed across job-scoped résumé validation, authoritative attachment status, Interview lifecycle/health/source labels/popup close reconciliation, conversational and collision-safe Profile Copilot behavior, browser-bound persistence, honest discovery/source-check failure semantics, and profile-inferred discovery without a mandatory title.
- Job-source library scale: sources have a dedicated Profile tab with catalog-wide search/status filters, 25-row pagination, one mounted detailed editor, explicit opt-in enablement, truthful progress, EU Lever provider routing, and production-Electron pointer-scroll evidence against 507 disabled records.
- Final integrated gate: guidance/docs/source-generic checks, package lint/typechecks, fit calibration, and 273/273 test files pass; 2,028 tests pass with one intentional skip. The 100-candidate repeated-source check retains margin under the unchanged 2,000 ms budget at 1,219 ms in its focused run.
- Full details and exact artifacts: `docs/STATUS.md`, `docs/TESTING.md`, `docs/audits/JOB_FINDER_DEEP_ACCEPTANCE_REVIEW.html`, and `docs/audits/JOB_FINDER_COMPLETION_REVIEW.html`.
- Older milestones: `docs/HISTORY.md`.
