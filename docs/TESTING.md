# Testing

## Default Checks

- broad repo check: `pnpm verify`
- fast preflight: `pnpm verify:quick`
- affected-only check: `pnpm verify:affected`
- docs/guidance only: `pnpm validate:docs-only`
- package-local validation: `pnpm validate:package <package-name|alias|path>`
- source-generic guard: `pnpm source-generic:check`
- formatting: `pnpm format`, `pnpm format:check`
- dead-code cleanup: `pnpm knip`

## Pick Checks

| Change                       | Prefer                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------- |
| docs or agent guidance only  | `pnpm validate:docs-only`                                                        |
| package-local code           | `pnpm validate:package <alias>` first, then broader checks only if risk warrants |
| contracts or IPC             | `pnpm validate:contracts` plus affected package typecheck                        |
| discovery/source-debug       | `pnpm source-generic:check` plus focused package tests                           |
| desktop UI                   | `pnpm validate:desktop` plus the matching UI harness                             |
| broad cross-package behavior | `pnpm verify:affected` or `pnpm verify`                                          |

Common package aliases:

- `pnpm validate:desktop`
- `pnpm validate:job-finder`
- `pnpm validate:browser-agent`
- `pnpm validate:browser-runtime`
- `pnpm validate:contracts`

## Stop Rules

- Do not run `pnpm verify` for docs-only or guidance-only changes.
- Do not rerun a broad failing command unchanged; isolate the failing package or command first.
- If a failure is documented as pre-existing and unrelated, report it once and switch to focused validation.
- Rebuild desktop before judging benchmark/source changes because `apps/desktop/scripts/benchmark-job-finder-app.mjs` launches `out/main/index.cjs`.

## Guidance Checks

- `pnpm validate:docs-only` after shared guidance, skill, doc, or link changes

## Current Consolidated Release Evidence (2026-08-09)

### Computer Use usability remediation (2026-08-11)

- Audit and accepted screenshots: `docs/audits/DESKTOP_APP_COMPUTER_USE_USABILITY_AUDIT_2026-08-10.md` and `docs/audits/assets/desktop-app-computer-use-usability-2026-08-10/`.
- Focused regressions cover job-scoped résumé blocking, authoritative application attachment status, ended Interview Assist, opted-out text-only health, typed-question provenance, grounded Copilot advice, footer-aware/right-edge placement, managed-browser bound restoration, honest all-source discovery failure with retained partial success, failed source-check provenance, and profile-inferred search scope.
- Production-Electron replay uses an isolated synthetic `UNEMPLOYED_USER_DATA_DIR`, 1440×920 at 100% zoom, deterministic AI, browser-agent and final-submit authority off, and pointer-positioned wheel input over each nested scroll owner. The accepted replay must show the Profile footer action and Copilot launcher simultaneously without overlap and preserve independent pane scrolling.
- A deterministic run can verify failure-state semantics but cannot establish that the user's configured live provider/network transport is available. Re-run search and source checks through that configured path before claiming the original `fetch failed` environment is repaired. Do not weaken source-generic orchestration or add source-branded rescue logic.

### Normal-screen interaction closeout (2026-08-13)

- The final production build was exercised at 1440x920 against an isolated synthetic workspace. The pointer-owned scroll probe records the outer header at `0 -> 177`, center results at `0 -> 600`, right details at `0 -> 600`, a successful left-pane advance, and upward boundary handoff back to outer `0`. Evidence: `apps/desktop/test-artifacts/ui/normal-screen-final-20260813/nested-scroll-report.json` and `nested-scroll-owners.png`.
- Profile Copilot production geometry must keep both its wrapper and panel at left `16`, right `1424`, and width `1408` in a 1440 px window, then restore to the ordinary 480 px width. Evidence: `apps/desktop/test-artifacts/ui/normal-screen-final-20260813/copilot-maximized.png`.
- Final production journey evidence covers Profile setup/import/Copilot, Resume Studio editing/export/approval, apply queue consent/cancel/recovery, and Interview Helper setup/chat/popups/review/export. Run folders: `profile-setup-20260813-final-closeout`, `resume-workspace-20260813-final-closeout`, `apply-queue-controls-20260813-final-closeout`, `applications-queue-recovery-20260813-final-closeout`, and `interview-helper-basic-20260813-final-closeout` under `apps/desktop/test-artifacts/ui/`. Every harness uses isolated synthetic state and leaves final submission untouched.
- Apply cancellation/restart coverage must prove active browser work observes abort, late results cannot overwrite cancelled state, application page preparation closes prior app-owned tabs, graceful shutdown waits for the active promise, and a hard-restart snapshot converts an orphaned `running` run to `failed` with `completedAt` and explicit no-submit wording.
- Final integrated production harnesses: `capture-apply-queue-controls.mjs`, `capture-applications-queue-recovery.mjs`, `capture-resume-workspace.mjs`, and `capture-interview-helper-basic.mjs`. Their accepted 2026-08-13 evidence directories use the `*-final-integrated` labels under `apps/desktop/test-artifacts/ui/`.

### Large Job source libraries (2026-08-11)

- Focused component coverage loads 507 typed discovery targets and requires catalog-wide search/filtering, exactly 25 compact rows per page, quick enablement, one mounted detailed editor, source-specific action names, and enabled/total tab progress. Provider coverage requires EU-hosted Lever boards to use `api.eu.lever.co` while ordinary boards continue to use the default Lever API.
- Production-Electron acceptance uses an isolated workspace, 1440×920 at 100% zoom, browser-agent/live-AI/final-submit authority off, and the reviewed 507-source catalog with every source disabled. It must preserve all five Profile tabs, show zero document/inner horizontal overflow, paginate and search without mounting the full catalog, open exactly one editor, and record zero renderer errors.
- Pointer-owned scrolling is a release assertion: after the outer Profile header has yielded to its body, a wheel positioned over `#profile-section-scroll-area` must advance only that inner pane. The locked-layout handoff uses a native non-passive capture listener so a single wheel delta cannot move both nested scroll owners. Current evidence: `apps/desktop/test-artifacts/ui/job-sources-library-507-20260811/capture-report.json`.

### Production Electron journeys

- Greenhouse original CV: run `node apps/desktop/scripts/test-job-finder-complete-flow.mjs` against the built app in an isolated workspace. Accepted report: `apps/desktop/test-artifacts/job-finder/complete-flow-current-greenhouse/prepare-only-smoke-report.json`. It must prove current public listing selection, real import boundary, unchanged original asset and digest, verified upload/answers, named final control, `finalControl: reached_without_submit`, `submitAuthorized: false`, `submittedNeverOccurred: true`, and workspace cleanup.
- Ashby tailored CV: run the same harness with `JOB_FINDER_PREPARE_ONLY_RESUME_MODE=tailored_per_job` and the Ashby flow inputs. Accepted report: `apps/desktop/test-artifacts/job-finder/complete-flow-current-ashby-tailored-final-20260809/prepare-only-smoke-report.json`. It must prove generated draft quality/coverage, exact export and approval, verified upload, named final control, and no submit/account authority or occurrence.
- Workday anonymous: accepted report `apps/desktop/test-artifacts/job-finder/complete-flow-current-workday-final-20260809/prepare-only-smoke-report.json`. The expected result is `site_login_required` plus a resumable manual sign-in instruction—not a failure, inferred login, credential action, or final-control attempt.
- Fresh first-run journey: `apps/desktop/test-artifacts/ui/production-user-audit-20260809-final2/` covers import, setup Copilot, direct field review, readiness, completed Profile hierarchy, one-row 1440 px navigation, and the Profile → Find jobs continuation.
- Live public-provider audit: `apps/desktop/test-artifacts/job-finder/diverse-live-audit/summary.json` covers three synthetic profiles against current Greenhouse, Lever, and Ashby inventories. Accept the run only when visible/hidden ranking is target-aware, detail actions remain above the scroller, and generated résumés contain no unsupported numeric claims.
- Resume Studio/current primary journey: `apps/desktop/test-artifacts/ui/resume-workspace-luna-high/` covers preview failure/recovery, proof disclosure, template choice, live editing, a configured Luna-high Guided Edits response, export, approval, return to Shortlisted, visible Prepare application, and the safe Applications stop.
- Original-CV journey: `apps/desktop/test-artifacts/ui/original-cv-flow/` must show the exact imported asset, a per-job native radio choice, a sensitive-detail warning, and an enabled Prepare application action without tailoring.
- Action Inbox: `apps/desktop/test-artifacts/ui/action-inbox/capture-report.json` covers 1440 px, 900 px, and native 200% zoom. All contextual controls and shell destinations must be visible with zero horizontal overflow; credentials stay browser-only and both authorization flags stay false.
- Limited Interview Helper regression: `node apps/desktop/scripts/capture-interview-helper-basic.mjs` against the built app. `apps/desktop/test-artifacts/ui/interview-helper-basic/report.json` must prove two visible popup windows, typed send, temporary image attachment, copy, hide/reopen, resize, exact bounds restoration, renderer-reload persistence, configured local STT readiness, and no retained raw image bytes. This harness does not replace a live microphone/system-audio hardware pass.

### Résumé provider comparison

- `apps/desktop/scripts/run-resume-quality-benchmark.mjs` accepts `--case-id`/`--case`, `--template-id`/`--template`, and `--use-configured-ai`. The IPC route must forward `useConfiguredAi` into `runDesktopResumeQualityBenchmark`; route coverage must not call an external provider.
- Compare providers on identical synthetic cases/templates and report latency, accepted/rejected AI contributions, grounding, role coverage, ATS rendering, and fallback separately. Do not treat deterministic fallback success as accepted model contribution.
- Current sparse-generation sample: Luna high `technical_matrix` 17.222 s (0 accepted / 1 rejected) and `classic_ats` 23.126 s (1 / 0); Felidae 9.098 s (0 / 5) and 9.821 s (0 / 4). All quality gates were 1.0 because deterministic fallback owns safety. The correct conclusion is that Felidae was faster in this sample while Luna produced one accepted grounded rewrite and avoided its earlier timeout.
- Final Luna-high recheck: `apps/desktop/test-artifacts/ui/luna-high-final/2026-08-09-luna-high-final/resume-quality-benchmark-report.json` completed `frontend_platform`/classic ATS in 11.207 s; `apps/desktop/test-artifacts/ui/luna-high-final/2026-08-09-luna-high-grounded/resume-quality-benchmark-report.json` completed `grounded_baseline`/classic ATS in 19.819 s. All gates were 1.0 and both sparse-generation calls abstained safely. The real configured Guided Edits journey completed successfully in 28.9 s.

### Integrated gate state

- Final verification: agent/docs/source-generic/structure checks passed; package lint and typecheck tasks passed; 52-case fit calibration passed with NDCG@10 0.951, P@5 0.900, R@10 1.000, weighted kappa 0.846, and zero explicit expectation failures; all 273 test files passed with 2,028 passing tests and one intentional skip. Use `vitest run --maxWorkers=4` for the broad Windows run so Chromium screenshot and strict wall-clock tests receive stable resources; the repeated-source performance test separately passed its 2,000 ms limit at 1,219 ms.
- The final gate reproduced three integration-only issues before going green: an unnecessary Profile Save test cast, source-only fresh workspaces appearing `in_progress`, and default five-second timeouts on multi-template résumé benchmark cases under full-suite contention. The fixes use safe DOM assertions, keep a discovery source as a readiness requirement without treating it as user progress, and assign explicit 10–20 second non-performance timeouts to heavy benchmark tests.
- The first broad run caught 10k identity/ledger index+resolve at 2,119 ms and repeated unchanged-source discovery at 2,435 ms against unchanged 2,000 ms budgets. Single-pass URL normalization, lower-allocation alias matching, and a mutable collision-safe live index reduced three focused runs to 815–1,045 ms and 348–356 ms respectively. The full suite is now green; budgets, corpora, and correctness assertions were not weakened.
- Computer Use's signed helper could not start on this host (`spawn EPERM`) after bounded retries. Do not claim Computer Use evidence. Current visual evidence came from the real production Electron app controlled by the root-owned Playwright harness; subagents did not launch app copies or GUI worktrees.

## Current Focused Release Evidence (2026-07-31)

- Desktop UI integration: 30 passing tests across 8 files; Job Finder integration: 133 passing tests across 12 files.
- Focused safety/recovery: 51 human-action tests, 11 catalog no-submit tests, 39 affected Browser Runtime tests, 86 focused Browser Agent tests, and 5 restart-recovery tests pass.
- Resume extraction: the complete AI Providers suite passes 180 tests; local deterministic extraction is about 73–131 ms; live TXT imports have varied from roughly 21–44 seconds. Persisted `ResumeImportRun` timing records each of four concurrent remote stages (duration, provider identity, provider/fallback source, candidate count) plus text/literal/reconciliation/finalization/total durations. Numeric timing uses a run-row-only post-finalization upsert, and telemetry failure cannot fail the completed import. The focused telemetry regression passes 37 tests/4 files and the broader verification passes 59/4; direct TypeScript, targeted Prettier/ESLint, and diff checks pass. More than 99.8% of the measured 44.3-second run was remote-stage time, not parser latency. The focused resume-analysis cache suite proves compatible unchanged imports skip provider calls, source/parser/provider/prompt/schema/policy/context changes miss, missing digests disable caching, partial provider outcomes are not reused, and refresh recomputes.
- Source/ranking: 66 focused source tests and 71 matching tests pass; the real Mercury public-provider check returned HTTP 200 with 56 jobs in about 454 ms, and the rebuilt UI retained 24 jobs, showed 19, and hid 5 hard conflicts.
- Not-interested feedback coverage must prove legacy schema defaults, bounded reason validation, local persistence, scoring isolation, duplicate/alias preservation, explicit undo/reset, and keyboard-reachable reason chips. Hidden jobs are a separate projection and must not disappear without an undo path.
- Direct TypeScript checks pass for Contracts, AI Providers, Job Finder, Browser Agent, Browser Runtime, and Desktop. Broad lint passes outside Browser Agent; each modified Browser Agent production file passes focused lint.
- The fresh production Electron build passes with 743 main-process modules, 2 preload modules, and 2,098 renderer modules. Current visual acceptance is recorded in the consolidated 2026-08-09 artifact paths above.
- Current Computer evidence proves recommendation-card containment at the enforced 1024×720 minimum production window and native Electron 200% zoom. A `webContents` zoom-factor-2 replay shows Profile, Find jobs, Shortlisted, Applications, Needs you, and Settings together and reachable in the reflowed shell. A smaller screenshot crop is not proof of a supported sub-minimum viewport.
- Navigation acceptance also verifies that `Needs you` is a separate notification/action group and that all workflow destinations plus the notification control remain visible at high zoom. Discovery layout acceptance compares empty and established states so Current Search cannot change columns after results load.
- Tailored-résumé progress acceptance requires a readable visible percentage, progressbar semantics, no regression to zero after route revisit while the operation is pending, cleanup after settlement, and reduced-motion-safe transitions.
- Resume Studio acceptance starts with the preview and export/approval controls visible while job context and claim trust are collapsed but keyboard-accessible. A live tailored path must export an exact PDF, verify its bytes, approve it, return to Shortlisted, and show that exact file ready without granting final-submit authority.
- Résumé visual acceptance must render the current production-Electron export to PDF and then PNG, inspect every shipped template for readable hierarchy, consistent margins, clean rules, sensible page breaks, no clipping/overlap/broken glyphs, and no card-like application chrome, and compare the integrated result against a current-run baseline. Preview editing hooks must remain editor-only and absent from export markup.
- Candidate Asset lifecycle coverage must prove `until_deleted` defaulting, opt-in 30/90-day clocks beginning at successful import, immediate application-resolution rejection after removal/expiry, seven-day Trash metadata, explicit-policy restore with a fresh clock, startup/lazy enforcement, ordinary byte-plus-metadata purge, transient purge retry behavior, legacy-record normalization, recent-orphan preservation plus aged-orphan cleanup, typed restore IPC with no raw path exposure, authoritative Settings refresh/retry/disabled controls, and keyboard reachability. Application-flow coverage must prove Candidate Asset artifacts contain no durable path, request verified bytes immediately before `setInputFiles`, reject removal/tampering after initial resolution, retain no external-write receipt for the blocked upload, and never grant final-submit authority.
- For Computer Use acceptance of the app's own browser runtime, launch the built Electron executable directly with an isolated `UNEMPLOYED_USER_DATA_DIR`; do not nest the app inside Playwright's Electron launcher. Measure `Open browser` through visible `Ready`, verify the dedicated profile and DevTools endpoint, and fail the run if it remains on `Starting browser`.
- Use native Electron `webContents` zoom factor 2 for true 200% acceptance. `--force-device-scale-factor=2` remains a useful high-DPI stress reproduction, but it is not interchangeable with product zoom acceptance and must be labeled separately.
- This is intentionally focused evidence. It does not claim a new `pnpm verify` run.

## Structure Checks

- `pnpm structure:check` for large-file and hotspot warnings
- `pnpm hotspots` for the biggest files and concentration areas

## Source-Generic Discovery Guard

- `pnpm source-generic:check` rejects source-branded helper declarations in shared discovery/browser-agent workflow code
- focused coverage includes `packages/browser-agent/src/agent/search-results-budget.test.ts`
- multi-source discovery coverage must reconcile validated, duplicate, staged, and persisted counters and prove duplicate-heavy early identities do not shrink later-source exploration budgets
- resume-integrity/versioning coverage must prove saved-private-copy SHA-256, exact rendered HTML/PDF digest and format, malformed/missing legacy digest handling, tailored approval-time tamper or missing-file rejection, original/tailored pre-apply tamper or missing-digest rejection before an application attempt, digest/format propagation into privacy receipts, legacy revision compatibility, exact pre-mutation snapshots, no-op suppression, stale-save and slow-generation CAS rejection, atomic failure, 100-per-draft retention without cross-draft deletion, SQLite close/reopen chain integrity, exact restore across restart, approval/export invalidation including synchronized SQLite JSON/index state, original-profile preservation, bounded history UI, and save-before-restore behavior; the current focused cross-layer batch proves these behaviors with 150 tests
- fit-truth coverage must prove legacy scorer compatibility, explicit compensation states, same-currency interval normalization across hourly/monthly/yearly wording, unknown and cross-currency neutrality without exchange-rate guesses, bounded above-minimum preference, below-minimum score/recommendation protection, ordering counterexamples, and Easy Apply isolation from suitability; catalog-agent and catalog-runtime helpers must retain unknown or cross-currency listings while excluding only explicit same-currency floors below the saved minimum
- match-dimension coverage must prove typed safe defaults plus cited role suitability, preference alignment, application effort, and evidence-confidence outcomes; preference fixtures must cover location, work mode, seniority, employment type, and preferred company only when comparable evidence exists; unknown evidence must remain neutral, Easy Apply must affect effort only, and evidence confidence must measure supportability rather than hiring odds
- dimension and calibration fixtures must prove scorer/session version 4 keeps unknown evidence neutral and effort outside fit, orders conservative recommendation before aggregate score, blocks hard geography/clearance/required-evidence conflicts, and produces a deterministic ranking-change audit against the labeled 52-case/four-cohort baseline
- single-assessment coverage must prove one full calculation per unique scorer/context/posting input across budget and merge, persisted reuse only for exact version 4 fingerprints, safe legacy/profile/preference/material-posting invalidation, cross-target dedupe, and a 500-posting replay with stable output/order and measured before/after CPU; the current five-run in-process smoke measured `507.36 ms` full versus `275.38 ms` session median (`45.7%` reduction), exactly 500 calculations per run, and no measured regression from the prior version 2 session median of `278.27 ms`
- Fit breakdown UI coverage must prove one compact five-row single-column list, the overall recommendation on result and detail surfaces, a visible required-gap callout, requirements behind a native disclosure, keyboard disclosure operation, recommendation-badge containment at wide/narrow/200% scale, and separate zero-overflow shell navigation acceptance at 200% device scale

## Resume Integrity And Versioning Performance

- replay the independent persistence proof with `pnpm exec vitest run packages/db/src/resume-draft-revision-retention.performance.test.ts`
- prefill exactly 100 retained revisions, measure only the atomic repository commit, use 20 save-style and 20 restore-style samples, and keep exact cap, final-draft, restore-lineage, and approval-invalidation assertions outside the timing gate
- latest independent evidence: atomic save p50 `1.35 ms` / p95 `2.60 ms`; restore-style mutation p50 `1.38 ms` / p95 `2.91 ms`; both remain below the generous `750 ms` p95 host gate

## Desktop Core

- `pnpm desktop:dev`
- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop typecheck`
- `pnpm --filter @unemployed/desktop lint`

## Desktop UI Harnesses

- `pnpm --filter @unemployed/desktop ui:capture`
- `pnpm --filter @unemployed/desktop ui:resume-import`
- `pnpm --filter @unemployed/desktop ui:profile-setup`
- `pnpm --filter @unemployed/desktop ui:profile-baseline`
- `pnpm --filter @unemployed/desktop ui:profile-copilot-preferences`
- `pnpm --filter @unemployed/desktop ui:source-sign-in-prompts`
- `pnpm --filter @unemployed/desktop ui:resume-workspace`
- `pnpm --filter @unemployed/desktop ui:resume-workspace-dirty`
- `pnpm --filter @unemployed/desktop ui:original-cv-flow`
- `pnpm --filter @unemployed/desktop ui:applications-copilot-review`
- `pnpm --filter @unemployed/desktop ui:applications-recovery`
- `pnpm --filter @unemployed/desktop ui:applications-queue-recovery`
- `pnpm --filter @unemployed/desktop ui:interview-helper`
- `pnpm --filter @unemployed/desktop ui:interview-helper-basic:built`
- `pnpm --filter @unemployed/desktop test:interview-helper-audio:built`
- `pnpm --filter @unemployed/desktop test:interview-helper-live-system-audio`
- `pnpm --filter @unemployed/desktop test:job-finder-prepare-only`
- `pnpm --filter @unemployed/desktop test:job-finder-prepare-only:built`
- `pnpm --filter @unemployed/desktop test:job-finder-complete-flow`
- `pnpm --filter @unemployed/desktop test:job-finder-complete-flow:built`
- `pnpm --filter @unemployed/desktop test:job-finder-ashby-flow`
- `pnpm --filter @unemployed/desktop test:job-finder-workday-flow`
- `pnpm --filter @unemployed/desktop test:job-finder-ats-matrix`
- `pnpm --filter @unemployed/desktop ui:interview-helper-protection`
- `pnpm --filter @unemployed/desktop ui:apply-queue-controls`
- `pnpm --filter @unemployed/desktop ui:action-inbox:built`

## Running Desktop Benchmarks

- Run from the repo root: `pnpm --filter @unemployed/desktop build`
- Do this before desktop benchmark scripts or benchmark-backed source/debug checks because `apps/desktop/scripts/benchmark-job-finder-app.mjs` launches `out/main/index.cjs`, and stale build output can invalidate results
- Historical benchmark detail is no longer kept as plan docs; use current benchmark reports under `apps/desktop/test-artifacts/ui/` and git history when old run detail is needed.
- `pnpm --filter @unemployed/desktop audit:job-finder-live` compares the built app's discovery results with the current full Remote/Greenhouse and Aircall/Lever provider inventories using `docs/resume-tests/Ebrar.pdf`. It runs in a temporary user-data directory with discovery-only, original-CV, review-before-submit safety settings and writes `apps/desktop/test-artifacts/job-finder/live-discovery-audit/live-discovery-audit-report.json` plus a rendered `evidence-ledger.png`; it requires network access and must never be changed to execute application actions.

## Configured AI Capability Benchmark

- `pnpm ai:benchmark plan` validates and prints the frozen synthetic corpus without making provider calls.
- `pnpm ai:benchmark full <lane>` runs one lane serially and resumes only validated artifacts. Supported lane IDs are `luna_high`, `luna_max`, and `sol_low`.
- `pnpm ai:benchmark full-report` requires exactly 330 unique outcomes and writes the machine-readable aggregate for the run.
- `pnpm ai:benchmark lane-report <lane> [run-label]` scores one complete 110-case lane without requiring the other configured models. The fresh Luna acceptance label is `post-runtime-20260812`.
- `pnpm ai:benchmark canary luna_high` runs the 11 hardest representative cases across every supported AI family. The 2026-08-12 post-remediation run passed 11/11 with zero fallback; durations ranged from 6.05 s to 73.90 s, and paginated discovery completed in 27.83 s during the consolidated run.
- Keep each lane serial. Different lanes may run concurrently because their seeded schedules and manifests are isolated.
- Never add personal résumé/profile fixtures, live workspaces, credentials, authenticated browser state, application actions, or final submission to this corpus.
- Treat model-contribution scores as triage evidence. A deterministic fallback must be reported separately and cannot be credited to the model.
- The completed 2026-08-12 report is `docs/audits/AI_MODEL_CAPABILITY_BENCHMARK_FULL_2026-08-12.html`; ignored raw artifacts are under `.tmp/ai-evals/full_v2_b09aba7db2da/`.
- The post-runtime Luna-only comparison and production-Electron acceptance report is `docs/audits/LUNA_HIGH_AND_PRODUCTION_ACCEPTANCE_2026-08-12.html`; its ignored raw lane is under `.tmp/ai-evals/full_v2_b09aba7db2da_post-runtime-20260812/`. That full lane predates the dedicated value tools, transport retry, visual normalization, and pagination extraction fixes; use the current hard canary as the acceptance checkpoint until a new full lane is intentionally requested.

## Safety Rules

- do not run live-site submit flows or final-submit QA unless the user explicitly re-authorizes it
- validate apply work with deterministic contracts, service tests, and desktop harnesses by default
- The live prepare-only harness must use a temporary user-data directory and fake profile, approve a current deterministic resume before apply, and fail if any attempt, job, or application record reaches `submitted`. Source URL, label, roles, exact-job enforcement, and intermediate-write authorization are configurable through `JOB_FINDER_PREPARE_ONLY_*` environment variables. Intermediate writes require the dedicated flag and desktop test API; final submit remains false and DOM submission stays guarded.
- Privacy-receipt coverage must prove query/fragment and local-path redaction, exact resume identity, typed runtime write evidence, empty model-use truth when no model participates, false account-creation/final-submit authority, and `finalSubmitOccurred: false`; Applications UI coverage must render Stayed local, Sent to a model, Written to the site, and Safety boundary groups without showing an empty receipt for legacy results. Application-packet coverage must additionally prove local-path stripping, destination query/fragment removal, exact answer provenance/checkpoints, and rejection of false submitted status; the desktop export control must remain an explicit local save action.
- `test:job-finder-complete-flow` is the Greenhouse live acceptance gate for the original-CV journey. It queries the configured public board for a current matching vacancy, imports `test-fixtures/job-finder/resume-import-sample.txt` through the real extraction boundary, rediscovers the exact listing, shortlists it, verifies the imported CV remains unchanged, fills the application, and requires the final pre-submit checkpoint.
- `test:job-finder-ashby-flow` runs the same original-CV safety journey against a dynamically selected current Ashby vacancy. `test:job-finder-workday-flow` uses an exact Workday candidate-experience listing and, when run anonymously, requires the expected `site_login_required` human handoff instead of treating sign-in as a failure or attempting credentials.
- `test:job-finder-ats-matrix` builds once and runs the current Greenhouse, Ashby, and Workday cases. Every underlying harness keeps final-submit authorization false and fails if any submitted state appears.
- Current accepted reports live under `apps/desktop/test-artifacts/job-finder/complete-flow-current-{greenhouse,ashby,workday}/prepare-only-smoke-report.json`. Greenhouse and Ashby must reach a named final control with the unchanged resume upload verified and explicitly not clicked; anonymous Workday must stop at the account gate with `submittedNeverOccurred: true`.
- `ui:source-sign-in-prompts` captures desktop and narrow evidence for source configuration plus the browser-owned `I'm signed in — retry` handoff. The harness must prove that the UI says credentials are never handled and retries only after explicit user confirmation.
- Action Inbox acceptance must cover a populated real blocker, Open returning control within its bounded navigation timeout, Done producing still_blocked on a visible login page without reading or entering credentials, the three-attempt circuit breaker, and restart persistence. Application coverage must prove exact run/job/result/checkpoint binding and that a login-blocked queue item does not stop an unrelated item from reaching review; every runtime call must keep `submitAuthorized: false`. Authenticated success may be accepted only after a user voluntarily signs in; automated positive-path tests must use synthetic strong account markers.
- Manual-action-kind coverage must exhaustively render all 11 labels and cover every classified application blocker code. Authentication kinds verify source access; non-authentication kinds verify exact blocker absence. Same blocker/failure/stale stays blocked, no blocker resolves, and a changed blocker resolves the prior request while creating a new pending request. Stable identity must bind kind/code/sorted question IDs/origin/path without being split by prose, query, detail, or evidence changes.
- `ui:action-inbox:built` seeds one application and one discovery-source request into an isolated production Electron workspace, then captures desktop, 900px, and 200% scale. Its report must show every contextual Open/Done/Skip/Cancel control visible, browser-only credentials, and both account creation and final submission false. Inspect the images as well as JSON, and repeat the current production shell separately: a scoped action-inbox harness cannot supersede a later 200% navigation regression.
- Application resumption tests must prove simultaneous Done confirmations share one exact `prepare_only` retry, every retry keeps `submitAuthorized: false` and `accountCreationAuthorized: false`, stale lineage performs no browser work or overwrite, restart after a durable result receipt does not replay, and a newly observed blocker is persisted rather than treated as success.
- Application-document coverage must prove exact job/application/question lineage; relevance-ranked, deduplicated, concise authoritative profile evidence; evidence visibility in preview; non-empty and bounded user edits saved as new review-required CAS revisions; stale-revision rejection; accurate `cover_letter` versus `application_response` CandidateAsset classification without renderer paths; live refresh of the exact file-question picker; and explicit local export receipts. Approval/selection tests must continue to show that neither account creation nor final submission is authorized.
- Change-digest coverage must prove backward-compatible zero defaults, per-source aggregation for new/unchanged/changed/reactivated/newly inactive/known/skipped counts, warnings and duration, partial-failure health, and an accessible failed-source retry that passes only the exact target ID and is disabled during conflicting work.
- The discovery-ledger scale regression must construct 10,000 entries, build the compact alias index, resolve every canonical/tracking/source-ID variant, and stay below the generous two-second host budget. Focused identity coverage must also prove colliding source IDs are narrowed by a unique URL/provider alias, ambiguous or conflicting aliases return no match, same source IDs across provider sources stay isolated by provider identity, legacy URL-only collisions remain ambiguous, and recording an ambiguous posting preserves every existing row; keep broader workspace serialization/render/restart scale separate. Freshness coverage must classify new, unchanged, materially changed, and reactivated listings and prove the persisted v1 digest is stable regardless of provider result order. Refresh scheduling must prove immediate work for new/changed/legacy/reactivated postings, a 24-hour card-only deadline, a seven-day enriched deadline, and no scheduled refresh for applied/intentionally skipped postings. The full-workspace scale regression must persist 1,000 jobs plus representative application/action history, serialize below its generous five-second gate, reopen SQLite, and recover the same normalized snapshot byte-for-byte. The renderer-scale regression must separately exercise the actual pure selection, application filtering/latest-attempt, unresolved-action, and job-label view-model helpers over 1,000 jobs and representative history for repeated passes under a generous host gate; production DOM/layout evidence remains a distinct visual check.
- Catalog/browser application coverage must prove every execute path normalizes to `prepare_only`; legacy submit-capable modes pause; no result can contain a submitted outcome or `submittedAt`; and final controls remain untouched.
- Restart-recovery coverage must prove a persisted running discovery becomes explicit failed/interrupted state on reopen, clears the active run, and retains already saved jobs plus discovery history without automatically replaying external work.
- Performance-budget evaluation must fail deterministic measurements only when they exceed the configured regression allowance (10% by default), treat low-sample live SLO misses as warnings, promote repeated misses to failures once the sample floor is met, and expose typed evaluations through the performance snapshot. Discovery SLO aggregation currently covers first distinct useful job p95, API-source duration p95, and browser-source longest-gap p95.
- Unified Job Finder performance evidence must keep one ordered entry for resume import, resume generation, discovery, application preparation, persistence, IPC, and a representative renderer commit. It reuses persisted import/discovery/application stage timings and measures the workspace snapshot read already performed for the report; missing generation, IPC, or renderer observations remain explicitly `unavailable`, stage-only records remain `partial`, and a measured `0 ms` remains `available`. Settings exposes the same typed snapshot on demand, while the strict diagnostic export includes only timing IDs, numeric measurements, sample/budget status, and no arbitrary detail payloads.
- Application-flow performance tests must keep complete body/action/frame scans constant through form-stability sampling, including the full bounded failure window; controls-only inspection may optimize revalidation but must preserve mutation guards, persisted-value checks, late-widget recovery, and the final no-submit inspection.
- The original-CV desktop harness persists the setting through the real UI, verifies Review Queue shows the imported filename and extracted text without a tailored-generation action, requires the visible primary `Start apply copilot` action, and writes screenshots plus `summary.json` under `apps/desktop/test-artifacts/ui/original-cv-flow/`.
- For an isolated production import without a native file-picker handoff, run `node apps/desktop/scripts/seed-product-quality-audit.mjs --user-data-dir <isolated-dir> --resume <synthetic-resume>`. The seeder requires the test API, disables the browser agent, never performs application work, and writes `product-quality-audit-seed.json`; independently compare its recorded SHA-256 with the exact copied file bytes before accepting integrity evidence.
- Guided Setup visual acceptance must prove the collapsed Profile Copilot stays in normal flow without covering review controls; opening may use the existing fixed panel only while the layout reserves its right rail. Check desktop, narrow, and 200% zoom.
- capture artifacts under `apps/desktop/test-artifacts/ui/`; they are QA output, not source files
- The default Interview Helper harness must prove that starting an interview opens two visible popup windows (answer and transcript), while the main-window conversation, popup typed sends, temporary pasted/selected image attachments, explicit screen-context capture, copy controls, no retained raw image bytes, source-labeled transcript, and configured local STT readiness continue to work. Visible popup acceptance also requires real pointer drags, native edge resizing, hide/reopen from both popup and main controls, preservation of an in-progress draft during a workspace event, and an end/restart cycle restoring the exact saved bounds. `ui:interview-helper-popups` is the automated visual/interaction gate; Computer Use supplies native-window acceptance.
- `test:interview-helper-audio:built` must exercise renderer recording, typed IPC, FFmpeg, and local Whisper for both microphone and Windows meeting/system-audio sources. The standalone local-command smoke test should use synthesized speech when diagnosing machine configuration.
- `test:interview-helper-live-system-audio` is the Windows real-loopback acceptance gate. Start audible media first, optionally set `INTERVIEW_HELPER_LIVE_AUDIO_SOURCE_URL` for report attribution, and require a multi-word meeting-audio transcript, microphone-disabled consent, visible answer/transcript popups, grounded cue/chat with an image attachment, pause/resume, end/review/export, and no retained raw audio/image bytes. Evidence is written under `apps/desktop/test-artifacts/interview-helper/live-system-audio-podcast/`.
- Local STT quality should be evaluated with real speech as well as synthesized smoke audio. On the current host, `ggml-base.en` produced a coherent 18-word live sample in about 9.3 seconds end to end; `tiny.en` was faster but materially less accurate and is not the preferred quality baseline.
- The deeper overlay/protection harnesses remain separate evidence for capture exclusion, layout persistence, interaction mode, and panic-hide; ordinary popup visibility is now part of the default acceptance path.
- Interview Helper provider changes should include `pnpm validate:package ai-providers`; model-backed cue tests must prove schema validation, bounded transcript payloads rather than raw transcript blobs, one retry before deterministic fallback on provider failure, and service-level quiet fallback cards when generated cue output fails validation. Screenshot vision tests must prove transient screenshot image payloads cross the provider boundary and only normalized observations are retained. Audio transcription tests must prove transient audio chunks are sent through the provider boundary and raw audio is not retained in the Interview Helper workspace; local-command STT tests must also prove temporary audio files are cleaned up.
- validate browser visual evidence changes with contract guard tests, source-generic checks, focused browser-agent/browser-runtime/job-finder tests, and desktop Applications recovery UI evidence when apply surfaces change

Track-specific validation and product-bar requirements live in the handoff layer: `docs/STATUS.md` and `docs/TRACKS.md`. Completed evidence belongs in the linked audit reports, test artifacts, `docs/HISTORY.md`, and git history rather than a completed execution plan.

## Resume Import Notes

- when import or parser routing changes, validate at least one plain-text path and one extracted-document path
- release packaging for the parser sidecar still needs target-OS validation per platform

## Resume-Import Benchmark

- replay with `pnpm --filter @unemployed/desktop benchmark:resume-import`
- corpus is declared in `apps/desktop/src/main/services/job-finder/resume-import-benchmark.ts`

## Resume-Quality Benchmark

- replay with `pnpm --filter @unemployed/desktop benchmark:resume-quality`
- canary-only replay: `pnpm --filter @unemployed/desktop benchmark:resume-quality -- --canary-only`
- corpus is declared in `apps/desktop/src/main/services/job-finder/resume-quality-benchmark.ts`
- report path: `apps/desktop/test-artifacts/ui/<label>/<benchmark-version>/resume-quality-benchmark-report.json`
- persisted HTML artifacts are written under `apps/desktop/test-artifacts/ui/<label>/<benchmark-version>/<caseId>/<templateId>/`
- required case/template results fail the command when canonical work-history representation, fragment-free included bullets, professional experience-summary, grounded skill, keyword, page-target, or ATS render rates fall below `1.0`; every canonical role must remain available in the editor, conservative tailoring preserves usable continuity roles compactly, and balanced/aggressive modes may intentionally hide weak or unrelated roles so relevant evidence receives the recruiter-facing space
- focused résumé-quality regressions also require an exact target-role headline, job-supported skills first, target-aware project ranking, duplicate-metric suppression, two-page targeting for experienced candidates, and bounded aggressive-mode responsibility inference that still rejects invented hard facts
- `date_quality` and `work_history_review` remain diagnostic categories when the rendered output is correct but imported source evidence still requires human confirmation
