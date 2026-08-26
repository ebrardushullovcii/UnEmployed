# Product Quality Release Audit

> Historical audit: this document records the 2026-08-02 checkpoint and does
> not establish readiness for the current source. Current release state and
> gates live in `docs/STATUS.md`, `docs/TRACKS.md`, and the active sealed
> acceptance/persona plan.

## Final consolidated checkpoint — 2026-08-02

- Current Computer proof: `11-find-jobs-task-center-header-after.png`, `12-settings-top-cv-save-after.png`, and `13-settings-save-toast-cleared-after.png` close the final reported overlay/save-feedback regressions.
- Desktop validation: 87 files / 384 tests pass.
- Repository validation: 217 files / 1,660 tests pass with one intentional skip; 12-package lint/typecheck and the 52-case fit-calibration gate pass.
- Production build: 736 main / 2 preload / 2,093 renderer modules.
- Current Glean/Greenhouse final checkpoint: `passed_final_checkpoint_without_submit`; visible `Apply`; explicitly not clicked; original résumé verified; submitted ID arrays empty; final-submit authorization false.
- Export inspection: original and tailored application packets are schema v1 and record final submit/account creation false; diagnostic exports are schema v1 and remain allowlisted/redacted.
- Pnpm reliability: Turbo now runs through repository-pinned `pnpm@10.8.0` rather than inheriting a global pnpm 11 child command.
- Remaining external evidence: voluntarily signed-in Workday, macOS/Linux Interview Helper hosts, and optional Windows Narrator/physical-audio confirmation.

At that historical checkpoint, the release was considered ready for the user's
product review. The concise visual handoff was
`PRODUCT_QUALITY_IMPLEMENTATION_REVIEW.html`; the requirement-level disposition
was `PRODUCT_QUALITY_RELEASE_READINESS.md`.

Updated: 2026-07-31 (clean-v9 repeat-search and feedback follow-up)

## Scope

Living first-person audit for implementing `docs/audits/PRODUCT_QUALITY_PERFORMANCE_ROADMAP.html`.

Primary flow:

1. Fresh launch and onboarding.
2. Résumé import, extraction review, correction, and restart persistence.
3. Preferences and multi-source discovery.
4. Ranking/evidence review and repeated-search memory.
5. Original-CV and tailored-CV review.
6. Application preparation through the final safe pre-submit checkpoint.
7. Human-action handoff, queue independence, interruption, and recovery.

Shared-platform and limited Interview Helper work is secondary.

## Safety record

- Final-submit authorization stays `false`; no final application control is clicked.
- No external account is created.
- No password, OTP, CAPTCHA answer, verification link, or other credential is requested or stored.
- Synthetic candidate data and disposable workspaces are preferred.
- Real-listing evidence must record `submittedNeverOccurred: true` or the typed equivalent.

## Current-run evidence folder

`apps/desktop/test-artifacts/ui/product-quality-release-audit/`

Accepted screenshots are inspected before citation and use ordered names such as:

- `01-fresh-launch.png`
- `02-first-run-resume-choice.png`
- `03-import-review.png`
- `04-profile-after-import.png`
- `05-discovery-configured.png`
- `06-discovery-progress.png`
- `07-results-and-fit.png`
- `08-original-cv-review.png`
- `09-tailored-cv-review.png`
- `10-application-readiness.png`
- `11-user-action-request.png`
- `12-final-safe-checkpoint.png`
- `13-restart-recovery.png`

The current accepted clean-state sequence is
`apps/desktop/test-artifacts/ui/product-quality-release-audit/2026-07-31-clean-v7/01-fresh-onboarding.png`
through `10-restart-needs-you-zero.jpg`. It covers a fresh configured-provider PDF import, real Mercury discovery, contained assessment badges, original-CV preparation, the public Greenhouse final checkpoint, corrected application receipt, stale-action retirement, and restart persistence. The exact unchanged PDF is attached, United States `+1` is separated from `555 010 2401`, all seven detected answers are grounded, and the visible final `Submit application` control remains untouched.
Defects may add their own `before` and `after` pair.

## Severity

- `P0`: unsafe irreversible action, security/privacy breach, destructive loss, or application submission.
- `P1`: broken primary workflow, unsupported claim can approve/export, lost work/checkpoint, materially false state, or unrecoverable blocker.
- `P2`: substantial confusion, wrong ranking/extraction, major delay, inaccessible primary action, or weak recovery.
- `P3`: polish, copy, layout, daily-use friction, or non-blocking accessibility issue.

## Issue record template

### `AUD-###` — Short title

- **Severity / workflow:** `P#` — surface and step.
- **State:** open | implementing | fixed-awaiting-proof | verified | external.
- **What the user sees:** exact visible behavior.
- **Why it matters:** confusion, speed, trust, safety, accessibility, or recovery impact.
- **Reproduction:** numbered actions from a named clean/established state.
- **Before evidence:** current-run screenshot/report/log path.
- **Intended behavior:** concrete user outcome.
- **Implementation:** files or change summary.
- **Automated proof:** focused checks and result.
- **After evidence:** accepted screenshot/report path.
- **Performance evidence:** before/after values or `not latency-sensitive`.
- **Remaining risk:** explicit residual risk or `none observed in covered states`.

## Audit log

### `AUD-001` — Current integrated branch lacks a fresh release baseline

- **Severity / workflow:** `P2` — complete Job Finder flow.
- **State:** current focused automation, production build, clean onboarding/import through the real public Greenhouse final checkpoint, corrected receipt, and restart persistence are verified; the final established/failure/accessibility matrix remains open.
- **What the user sees:** the rebuilt app starts in Guided Setup, imports the synthetic PDF résumé, preserves original-CV mode, checks a real public source, returns eight current roles, orders the 92% reviewable result before the 90% result, contains recommendation badges, marks the shortlisted job `Original CV ready`, prepares the real form, and stops at the final control with `Needs you 0` after obsolete blockers retire.
- **Why it matters:** stale evidence can hide regressions and cannot satisfy the release definition.
- **Reproduction:** launch a disposable clean state and complete the primary flow visually.
- **Before evidence:** `apps/desktop/test-artifacts/ui/product-quality-release-audit/2026-07-31-clean-v5/01-guided-setup-start.jpg` through `11-results-layout-overflow-user-report.png` record the current first-run, import, discovery, ranking, repeat-search, and reported layout states.
- **Intended behavior:** every step is understandable, truthful, responsive, recoverable, and linked to current evidence.
- **Implementation:** the current coherent batch hardens grounded résumé extraction, public-provider source checks, conservative matching, result/detail layout, blocker persistence/resumption, catalog no-submit normalization, and interrupted-discovery recovery.
- **Automated proof:** the integrated Desktop UI batch passes 30 tests across 8 files; the integrated Job Finder batch passes 133 tests across 12 files; focused human-action, catalog no-submit, browser-agent, browser-runtime, and restart-recovery batches pass. Direct TypeScript checks pass for Contracts, AI Providers, Job Finder, Browser Agent, Browser Runtime, and Desktop. This is focused evidence, not a claim that `pnpm verify` ran.
- **After evidence:** the established-workspace evidence remains `12-results-layout-contained-wide-after.jpg`, `13-results-layout-contained-narrow-after.jpg`, `14-refreshed-ranking-mismatches-hidden.jpg`, `15-refreshed-ranking-mismatches-revealed.jpg`, `16-original-cv-badge-contained-narrow-after.jpg`, and `19-review-before-applying-contained-200-percent-after.jpg`. The current sequence is `2026-07-31-clean-v7/01-fresh-onboarding.png` through `10-restart-needs-you-zero.jpg`; `03-discovery-badges-contained.png` directly proves the user-reported badge stays inside its parent.
- **Performance evidence:** the real Mercury public-provider check returned HTTP 200 with 56 jobs in about 454 ms; the clean UI produced eight visible results in approximately 8.2 seconds. The fresh configured-provider PDF import completed in approximately 34–35 seconds, and the corrected real application replay recorded browser preparation `2.765s`, form preparation `6.860s`, and total `9.625s`.
- **Remaining risk:** broader multi-provider timing, keyboard/full-disclosure accessibility coverage, tailored-CV application integrity, voluntary sign-in recovery, and the final established/failure matrix remain open.

### `AUD-002` — Unknown salary and Easy Apply inflate candidate fit

- **Severity / workflow:** `P1` — Discovery ranking and trust.
- **State:** verified.
- **What the user sees:** listings with hidden salary can receive the same salary reward as listings meeting a configured minimum, and Easy Apply can add candidate-fit points.
- **Why it matters:** as much as 12 points can reflect unknown pay and application convenience rather than candidate suitability.
- **Reproduction:** score otherwise equivalent fixtures with missing versus qualifying salary and Easy Apply true versus false.
- **Before evidence:** code evidence in `packages/job-finder/src/internal/matching.ts`; current UI calls the overloaded value “Fit.”
- **Intended behavior:** unknown pay is neutral and application effort is separate from candidate suitability.
- **Implementation:** missing compensation is neutral instead of rewarded, missing qualification evidence remains explicit, and Easy Apply no longer contributes candidate-fit points.
- **Automated proof:** 22 focused matching tests pass, including missing-versus-qualifying compensation and application-convenience invariance.
- **After evidence:** the current Mercury result cards explain unknown compensation as unknown rather than a match; eight live roles were retained and ranked.
- **Performance evidence:** eight real Mercury jobs were visible about 1.3 seconds after starting discovery in the established audit workspace.
- **Remaining risk:** dimension-level score history has not yet been visually replayed across a migrated legacy workspace.

### `AUD-003` — Discovery counters and later-source budgets use misleading validated totals

- **Severity / workflow:** `P1` — Discovery quality, fairness, and progress truth.
- **State:** verified in deterministic multi-source automation; live before/after yield remains open.
- **What the user sees:** target staging can report cumulative pending jobs, while validated duplicates/known merges can consume later-source budget.
- **Why it matters:** progress is untruthful and duplicate-heavy early sources can hide better later-source choices.
- **Reproduction:** first source returns known/duplicate rows and second source returns new roles; compare target delta counters and retained results.
- **Before evidence:** July report recorded four then twelve staged for twelve total; code budgeted from cumulative `validJobsFound`.
- **Intended behavior:** per-target counters are deltas and budget is based on distinct newly retained identities with minimum exploration.
- **Implementation:** later-target collection budgets now use cumulative distinct retained jobs (`jobsPersisted + jobsStaged`) instead of cumulative validated rows, preserving the existing minimum exploration floor. Discovery-only target staging counts only that target's newly created jobs rather than the full pending collection.
- **Automated proof:** the 101-test Job Finder core suite includes a three-source regression: seven early validated rows collapse to one retained identity, later budgets widen to 10 and 8, target staged deltas reconcile as 1/10/8, 19 distinct jobs remain, and six duplicates are explicit.
- **After evidence:** automated run summary and target-execution assertions; current live multi-source replay remains to be repeated for visible before/after evidence.
- **Performance evidence:** duplicate-heavy early results no longer shrink later-source collection budgets; live first-distinct and distinct-yield timing remains pending.
- **Remaining risk:** cross-source identity quality, cancellation/cap edge cases, and visible live yield comparison.

### `AUD-004` — Previously explored jobs are filtered after expensive collection

- **Severity / workflow:** `P2` — repeated discovery speed and cost.
- **State:** verified for early skipping, versioned fingerprints, and safe refresh decisions; scale and scheduling remain open.
- **What the user sees:** repeat searches should extend the result set with unseen roles without re-adding identities the user already explored.
- **Why it matters:** repeated searches waste navigation, model, CPU, and user wait; ledger scans trend poorly at scale.
- **Reproduction:** run the same source twice and count detail navigation, enrichment, scoring calls, and wall time.
- **Before evidence:** `10-repeat-search-duplicates-before.png`; the earlier build expanded from 8 to 16 distinct visible roles in about 1.1 seconds, while code review showed known-identity lookup still scanning late in the pipeline.
- **Intended behavior:** a compact run index skips fresh unchanged postings before detail/model work and refreshes changed/expired/reactivated postings.
- **Implementation:** the persisted ledger now builds one compact normalized URL/provider-alias index per target and excludes known enriched/applied/dismissed jobs before matching; versioned card/detail/material fingerprints distinguish unchanged, materially changed, inactive, and reactivated same-ID sightings while legacy entries receive one safe refresh. Later thin-card sightings preserve prior enriched evidence.
- **Automated proof:** 15 focused ledger tests and one focused workspace-discovery integration test pass, including aliases, same-ID changes, legacy refresh, inactive/reactivated postings, and applied/dismissed precedence; typecheck, lint, and diff checks are clean.
- **After evidence:** `11-repeat-search-distinct-after.png`; the rebuilt repeat expanded 16 to 24 roles and all 24 visible job-card names were unique.
- **Performance evidence:** the rebuilt repeat produced eight unseen roles in about 2.15 seconds; automated call-boundary proof confirms known identities skip matching, while navigation/model counters remain pending typed telemetry.
- **Remaining risk:** production DOM/layout scale, persisted background scheduling, and live repeat-source timing remain open.

### `AUD-005` — Human-action handoffs are split and treat approval as resolution

- **Severity / workflow:** `P1` — source sign-in and application recovery.
- **State:** every classified application blocker now persists, verifies with kind-appropriate evidence, and resumes through exact prepare-only lineage; live authenticated success remains open.
- **What the user sees:** every unresolved source or application action is grouped under `Needs you`; Open hands off to the dedicated browser, Done checks the exact blocker, unchanged state truthfully becomes `still blocked`, and a changed blocker becomes a new pending request instead of a false success.
- **Why it matters:** the app must never claim that opening a page or pressing Done completed a browser-owned step without proof, and it must recover without credentials, infinite loops, or final-submit authority.
- **Reproduction:** exercise each classified application blocker, choose Done with the same blocker, clear the blocker, replace it with a different blocker, restart Electron, and inspect the exact request/result/checkpoint lineage.
- **Before evidence:** `17-action-inbox-empty-after.jpg` showed the grouped shell only; the first populated Open replay left every card control disabled for more than 33 seconds while page navigation awaited the default browser timeout.
- **Intended behavior:** one stable request identity per blocker kind/code/question set/origin/path, a Done-to-verifying transition, truthful same/cleared/changed outcomes, bounded retries, and one exact-scoped prepare-only resume while independent work continues.
- **Implementation:** all classified blockers persist to the Action Inbox. Authentication kinds verify `source_access`; non-authentication kinds verify `page_blocker_absent`. Stable identity ignores prose, query strings, details, and evidence while binding kind, code, sorted question IDs, and normalized origin/path. Done schedules exactly one run/job/result/checkpoint-scoped `prepare_only` retry. Same blocker, failure, or stale lineage stays blocked; no blocker resolves; a new blocker resolves the prior request and creates a new pending request. Claim/CAS/idempotency, restart, and multi-instance protections prevent duplicate browser execution or late overwrite.
- **Automated proof:** the current 51-test focused human-action batch passes without warning and covers every application blocker code, stable identity, same/cleared/changed classification, exact-lineage retry, simultaneous confirmation, stale checkpoints, durable receipt finalization, restart, and multi-instance races. Every retry keeps `submitAuthorized: false` and `accountCreationAuthorized: false`.
- **After evidence:** `20-action-inbox-populated-after.png` shows the real populated LinkedIn handoff; `21-action-inbox-still-blocked-after.png` shows Done truthfully returning `still blocked`; `22-action-inbox-attempt-cap-after.png` shows the disabled fourth verification with Open/Skip/Cancel still available. A second Electron launch restored the same `still blocked` three-attempt state. The older isolated `action-inbox-release-final` capture remains scoped card/control evidence; current all-six-destination native 200% shell acceptance lives in `AUD-031`.
- **Performance evidence:** the rebuilt warm-page Open had controls enabled by the first observation at 5.4 seconds; the read-only blocked verification had settled by the first observation at 7.8 seconds. The hard navigation bound is eight seconds, excluding cold Chrome debugger startup and user wait.
- **Remaining risk:** live application-blocker UI proof, stale-state acceptance, and a live authenticated success replay after voluntary user sign-in; the app never asks for or stores credentials.

### `AUD-006` — Résumé references did not prove individual generated claims

- **Severity / workflow:** `P1` — tailored résumé trust and approval.
- **State:** implemented, automated-verified, and production-smoke-verified against an isolated copy of the established workspace.
- **What the user sees:** Resume Studio now summarizes supported, generated-blocking, and user-edited-review claims, then exposes candidate-only evidence snippets per claim behind bounded progressive disclosure.
- **Why it matters:** plausible wording must not appear grounded by the wrong job, project, or listing language.
- **Reproduction:** inspect generated bullets, stored `sourceRefs`, validation results, and approval rules across real cases.
- **Before evidence:** current code applies shared refs broadly and uses a global token-overlap support bank.
- **Intended behavior:** every AI claim has candidate-only exact/paraphrase/review/unsupported assessment; unsupported cannot approve/export; edits invalidate old proof.
- **Implementation:** every visible included section text, section bullet, entry summary, and entry bullet now receives an exact, paraphrase, review, or unsupported assessment with its origin, locator, content hash, candidate-only evidence snippets, deterministic verifier version, and assessment time. Job and research sources are rejected by contract. Unsupported claims and weak generated review claims become normal blocking validation errors. Export validates and persists before rendering, while approval requires a validation result whose draft hash exactly matches the current content.
- **Automated proof:** 134 focused contract, quality, and workspace tests plus 20 focused Resume Studio/Profile UI tests pass. Coverage includes schema compatibility, rejection of job/research evidence, exact grounding, generated no-evidence blocking, user-edited review behavior, text- and origin-only hash invalidation, pre-render export blocking with a persisted locator issue, stale-hash approval rejection, candidate-only UI copy, blocker/user-edit distinction, and a six-claim initial DOM limit.
- **After evidence:** the new Claim trust panel sorts blockers first, labels claim origin and status, shows up to three candidate-only evidence snippets per expanded claim, warns when unsaved edits make validation stale, and reveals claims six at a time.
- **Performance evidence:** the 14-test desktop résumé benchmark passes in 3.34 seconds, including contamination, thin-profile, broader archetype, ATS-template, and real imported résumé cases; the claim panel initially mounts only six claim rows.
- **Production proof:** a fresh rebuilt Electron process opened an isolated copy of the established workspace, migrated the legacy draft through `Save draft`, displayed 38 supported claims with zero generated blockers, and expanded candidate evidence from Profile, Saved proof, and Original resume. No export, approval, application preparation, browser launch, or real-profile write occurred.
- **Remaining risk:** semantic-verifier calibration beyond deterministic lexical evidence and broader production-corpus measurement.

### `AUD-007` — Résumé history and source/export byte integrity are recoverable and enforced

- **Severity / workflow:** `P1` — original/tailored résumé trust, rollback, and application safety.
- **State:** implemented and verified through automated, live startup/restart, save/restore, export/approval, tamper, and missing-file recovery evidence.
- **What the user sees:** Resume Studio shows five saved versions at a time with actor, mutation, reason, time, bounded change detail, legacy compatibility, and an explicit Restore action. Restoring returns the exact earlier content as a new review-required version. New imports and exports now have measured byte identity, and application receipts can carry the verified SHA-256 plus exact original/HTML/PDF format.
- **Why it matters:** “unchanged original,” approved tailored output, and rollback are enforced byte/state guarantees rather than promises based on filenames or extracted text.
- **Reproduction:** import a résumé, inspect the saved private copy, render HTML/PDF, approve, mutate or delete each file, attempt original/tailored preparation, build more than 100 revisions across two drafts, restore, restart, and inspect approval plus lineage.
- **Before evidence:** earlier revisions lacked full snapshots and CAS, source/export artifacts had no enforced byte digest, approval state could survive a restore incorrectly after SQLite reopen, and revision history had no persisted cap.
- **Intended behavior:** every mutation snapshots prior state atomically; rollback is restart-safe; approval becomes stale; the saved private import and exact rendered output have SHA-256 identity; approval/pre-apply refuse missing or changed bytes; retained history is bounded per draft.
- **Implementation:** import hashes the saved private working copy. Startup recovery copies readable legacy source references into app-owned storage and backfills SHA-256 only when no prior digest exists; a prior digest mismatch, unreadable source, or missing source clears active-use path/digest and leaves extracted profile evidence in place with explicit replacement guidance. Original-CV review readiness now requires both the private path and digest. Rendering hashes the exact requested HTML or final PDF and persists that exact format. Active tailored approval and original/tailored pre-apply resolution reject missing files, missing integrity records, or SHA-256 mismatches before browser/application work; the verified digest and format flow into the redacted privacy receipt. Resume revisions retain the full prior draft plus legacy identity/sections, actor, mutation kind, parent/restore lineage, before/after state hashes, and a bounded diff. Manual saves, manual/assistant patches, section regeneration, full regeneration, and restore commit atomically behind expected-timestamp CAS. Repositories retain the newest 100 revisions only for the affected draft. Exact restore revalidates, clears approval/export readiness, and persists that invalidation across restart; SQLite approval synchronization now updates both indexed columns and serialized JSON.
- **Automated proof:** the focused cross-layer batch passes 150 tests covering private-copy hashing, rendered HTML/PDF hashing and format, malformed/missing digest compatibility, original/tailored tamper and missing-file rejection, approval-time rejection, privacy-receipt propagation, exact pre-mutation snapshots, no-op suppression, stale editor/AI rejection, atomic failure, 100-per-draft retention without cross-draft deletion, SQLite close/reopen integrity, exact restore, restore lineage, approval/export invalidation, and original-profile preservation. A separate 16-test focused recovery/UI/queue batch covers external-source migration, idempotent private-copy reuse, safe digest backfill, recorded-digest mismatch blocking, missing-file evidence preservation, visible replacement guidance, and application-readiness gating. Nineteen focused Resume Studio history/screen/controller tests continue to prove bounded paging, legacy non-restorable rows, pending protection, save-before-restore, action refresh, and truthful loading.
- **After evidence:** fresh production Electron Computer Use against a minimal isolated copy of the established profile changed Chronology Classic to Modern Editorial, saved one version, displayed `You / Saved draft / Template changed`, restored the prior version, returned the preview to Chronology Classic, appended a `Restore / Restored version` row, showed two saved versions, and displayed `Earlier draft restored. Review it before exporting or approving again.` The run never exported, approved, opened a browser, prepared an application, or touched the real profile.
- **Legacy migration evidence:** a disposable workspace began with an external Casey source path and no digest. The rebuilt app copied the exact 1,286 bytes to `documents/resumes/resume_1785452305525-661b8dafd72b-casey-engineer.txt`, persisted SHA-256 `661b8dafd72b4c8b62d83ef630601e25eb715d96233a41ee4f53583fae1c3ee1`, and kept `Your resume is ready to reuse` across restart. After the external source was moved aside, another restart remained healthy from the app-owned copy. Screenshots: `2026-07-31-clean-v8/24-legacy-resume-migrated-ready-after.png`, `25-legacy-resume-migration-survives-restart.png`, and `26-migrated-resume-independent-after-source-removal.png`.
- **Performance evidence:** the latest independent SQLite benchmark retained exactly 100 rows and measured 20 samples per mutation: atomic save p50 `1.35 ms` / p95 `2.60 ms`; restore-style mutation p50 `1.38 ms` / p95 `2.91 ms`; both pass the generous `750 ms` p95 host gate while exact final-draft, cap, and restore-lineage assertions remain enforced.
- **Recorded-mismatch evidence:** `2026-07-31-clean-v8/27-resume-digest-mismatch-minimum-window.png` shows the 1024×720 recovery state, and `28-resume-digest-mismatch-high-zoom.png` shows the full Replace resume action and explanation at native high zoom. Startup cleared active-use integrity instead of trusting the changed 1,287-byte source while preserving extracted profile details.
- **Remaining risk:** repeat the integrity matrix on macOS/Linux packaging; the covered Windows original/tailored/readable-legacy/mismatch/missing-file paths have live proof.

### `AUD-008` — Full workspace refreshes amplify discovery cost

- **Severity / workflow:** `P2` — progressive discovery and large workspaces.
- **State:** open.
- **What the user sees:** not yet visually measured; each source completion can trigger another complete workspace replacement and the final flow requests another snapshot.
- **Why it matters:** large histories increase SQLite parsing, IPC bytes, renderer work, flicker risk, and action latency.
- **Reproduction:** seed 0/100/500/2,000 jobs and record reads, snapshot bytes, serialization, commit count, and renderer duration during multi-source discovery.
- **Before evidence:** current snapshot reads roughly sixteen collections and whole discovery state is one large JSON value.
- **Intended behavior:** committed versioned deltas during progress, one initial/recovery snapshot, stale-delta protection, and atomic upserts.
- **Implementation:** planned after earlier state migrations.
- **Automated proof:** pending revision/race/gap/equality/scale tests.
- **After evidence:** pending no-flicker/lost-selection UI evidence.
- **Performance evidence:** target delta <=250KB and application p95 <=100ms initially.
- **Remaining risk:** high state-consistency risk.

### `AUD-009` — Plain-text imports paid a vision-processing penalty

- **Severity / workflow:** `P2` — résumé import speed and first-run trust.
- **State:** verified.
- **What the user sees:** a small TXT résumé remained on “Importing” for about 75 seconds in the earlier build.
- **Why it matters:** the first meaningful action felt frozen even though plain text needs no page rendering or vision model.
- **Reproduction:** import the Casey sample TXT in a disposable clean workspace and time selection-to-review.
- **Before evidence:** `02-txt-import-still-running-60s.png` and `03-txt-import-complete-75s.png`.
- **Intended behavior:** TXT and Markdown use deterministic text parsing immediately; PDF and DOCX retain their richer extraction path.
- **Implementation:** plain-text and Markdown imports skip vision-image generation; grounded work-mode inference, job-specific skills, and deterministic evidence supplementation prevent sparse provider output or cross-role skill leakage from deleting supported résumé content. Persisted `ResumeImportRun` timing now records the four concurrent remote stages with duration, provider identity, provider-versus-deterministic-fallback source, and candidate count, plus text, literal, reconciliation, finalization, and total durations. Final timing values use a run-row-only upsert after atomic import finalization, and telemetry failure cannot fail an already completed import.
- **Automated proof:** the complete AI Providers suite passes 180 tests. The focused telemetry regression passes 37 tests across 4 files and the broader telemetry verification passes 59 across 4 files; direct TypeScript checks plus targeted Prettier, ESLint, and diff checks pass. Casey retains both jobs and all six bullets; Cedar remains remote; Northstar receives only role-grounded skills.
- **After evidence:** `resume-import-after/resume-import-benchmark-report.json` plus `apps/desktop/test-artifacts/ui/product-quality-release-audit/2026-07-31-clean-v5/02-txt-import-targeting.jpg`.
- **Performance evidence:** local deterministic extraction completes in about 73–131 ms. Live TXT imports have varied from roughly 21–44 seconds; persisted telemetry shows more than 99.8% of the measured 44.3-second run was spent in four concurrent remote AI stages, isolating the current bottleneck from local parsing.
- **Remaining risk:** use persisted stage/provider/fallback/candidate-count evidence to reduce remote-stage latency and add real PDF/DOCX production-provider benchmarks; native file-picker control remains less reliable than the deterministic test import path under Computer Use.

### `AUD-010` — Search-source deep link landed at the top of Profile

- **Severity / workflow:** `P2` — discovery setup navigation.
- **State:** verified.
- **What the user sees:** “Edit search sources and preferences” opened Profile but left the user far above Job sources.
- **Why it matters:** the link did not complete the navigation it promised and made configuration feel hidden.
- **Reproduction:** open Find jobs and activate the source/preferences deep link.
- **Before evidence:** observed in the clean-08 Computer audit.
- **Intended behavior:** the Preferences tab opens with Job sources in view and focus lands on the section heading.
- **Implementation:** the deep-link focus helper scrolls the target section into view and focuses its heading without resetting the outer screen scroller.
- **Automated proof:** two focused deep-link tests pass.
- **After evidence:** `09-source-deep-link-and-safe-copilot-after.png`.
- **Performance evidence:** the destination was visible in under one second in the rebuilt app.
- **Remaining risk:** none observed in the covered Windows state.

### `AUD-011` — Profile Copilot covered the primary save control

- **Severity / workflow:** `P1` — profile/preferences completion.
- **State:** verified.
- **What the user sees:** the floating Copilot launcher overlapped Save changes near the bottom-right corner.
- **Why it matters:** a persistent assistant affordance blocked the primary action needed to continue discovery setup.
- **Reproduction:** open Profile preferences at the Job sources section in the earlier layout.
- **Before evidence:** observed during the clean-08 Computer audit.
- **Intended behavior:** floating assistance never occludes primary controls.
- **Implementation:** the launcher’s bottom safe offset is 112 pixels in the affected layout.
- **Automated proof:** eight focused layout tests pass.
- **After evidence:** `09-source-deep-link-and-safe-copilot-after.png` shows the complete Save changes button and separate launcher.
- **Performance evidence:** not latency-sensitive.
- **Remaining risk:** small-window and high-scaling visual matrix remains part of final acceptance.

### `AUD-012` — Ready Check contradicted unresolved import review

- **Severity / workflow:** `P1` — résumé extraction trust.
- **State:** verified.
- **What the user sees:** the review queue still contained required decisions while Ready Check said everything was ready.
- **Why it matters:** contradictory status can push a user forward with uncertain or incorrect profile data.
- **Reproduction:** import a résumé that emits non-optional review items and inspect Ready Check before resolving them.
- **Before evidence:** `04-review-count-mismatch-and-redundant-confirmation.png`.
- **Intended behavior:** any pending non-optional review item keeps the section in Needs review.
- **Implementation:** readiness now includes pending required review work instead of only checking profile field presence.
- **Automated proof:** two focused readiness tests pass.
- **After evidence:** `13-resume-review-truth-context-after.png` shows Needs review, an exact live count of eight, and no stale 17-suggestion message after restart.
- **Performance evidence:** not latency-sensitive.
- **Remaining risk:** visual proof and cross-step count reconciliation are still open.

### `AUD-013` — Application preparation looked frozen and recovery waited too long

- **Severity / workflow:** `P2` — application preparation feedback and speed.
- **State:** verified for feedback, safe retained-conflict recovery, stage-level timing, and constant full-scan complexity during stability; live cold mutation-required timing remains open.
- **What the user sees:** the earlier build could sit on the final-review preparation screen for roughly 50–60 seconds without an immediate explanatory state.
- **Why it matters:** users cannot distinguish deliberate browser work from a hung workflow.
- **Reproduction:** prepare the top Mercury role from the established clean-08 workspace.
- **Before evidence:** `07-final-review-preparation-stuck.png`.
- **Intended behavior:** show immediate prepare-only progress and detect a stable form quickly while retaining the final-submit boundary.
- **Implementation:** the renderer emits a start message, form stability sampling uses 750 ms intervals for 12 samples instead of 1.5 seconds for 30, and typed execution timings persist with every attempt and render in Applications. Before any retained-page mutation, a read-only grounded-control preflight detects saved-profile conflicts and stops immediately. For mutation-required work, grounded controls are prefiltered, per-field revalidation and stability use controls-only inspection, an overwritten full inspection was removed, and one complete page/action/blocker inspection still runs after stability.
- **Automated proof:** all 25 browser-runtime application-flow tests pass, including zero-write retained-conflict recovery, a 30-unsupported-control case, and the full 12-sample persistent-failure window; both stability cases keep body/action/frame scans at exactly two while guard, persisted-value, late-widget, rerendered-final-control, and no-submit assertions remain green. Ten application-status tests verify that every paused pre-submit record renders `Needs action` even when no consent was required.
- **After evidence:** `14-apply-progress-and-safe-boundary-after.jpg` shows the immediate `Preparing safely...` state and explicit final-submit boundary; `15-retained-recovery-safe-stop-after.jpg` records the safe terminal state; `16-apply-stage-timing-after.jpg` records the baseline timing. `19-apply-status-and-2s-timing-after.jpg` proves the rebuilt optimized run displays `Needs action`, the exact manual blocker, and the improved persisted timing card.
- **Performance evidence:** on the same retained public Greenhouse conflict, the baseline recorded browser `1s`, form `46s`, visual `<1s`, total `48s`; the read-only preflight recorded browser `2s`, form `<1s`, visual `<1s`, total `2s`. This removes roughly 46 seconds from the known-conflict recovery path while preserving every existing page value and the no-submit boundary.
- **Remaining risk:** the controls-only improvement is automated rather than live-timed. Benchmark cold and mutation-required form work across more listings/source families and retain exact stage counters in the accepted reports.

### `AUD-014` — Real Greenhouse flow reaches the safe pre-submit checkpoint

- **Severity / workflow:** `P1` — end-to-end application safety and usefulness.
- **State:** verified in a rebuilt production replay, including the corrected receipt and restart.
- **What the user sees:** eight real Mercury roles, evidence-based fit, unchanged-original résumé mode, the exact imported PDF attached, United States `+1` separated from `555 010 2401`, visa sponsorship `No`, `Portland, Oregon`, and the untouched `Submit application` control.
- **Why it matters:** this proves the primary path reaches the real final review boundary without pretending an application was submitted, while the durable receipt must agree with the visible form.
- **Reproduction:** use Mercury Careers, choose the top role, select original CV, prepare the public Greenhouse form, then inspect Applications.
- **Before evidence:** no current-run public-listing proof existed at audit start.
- **Intended behavior:** preserve the selected CV, fill only grounded safe fields, ignore hidden framework shims, record every visible answer accurately, and stop before the final control.
- **Implementation:** current discovery, visual-checkpoint consent, exact-original attachment, exact custom-combobox answers, conservative phone-country selection, pre-click no-submit guard re-arming, and final checkpoint were exercised together. Hidden framework controls are excluded, CSS-in-JS phone widgets carry their selected country identity, structured `Oregon` grounds `United States` without accepting an ambiguous shared `+1`, and profile import now derives a country only from unambiguous state/province data. Managed Chrome repairs only stale clean-exit markers, preserves profile/auth preferences, launches with the current crash-restore suppression switch, and exits gracefully before forced cleanup.
- **Automated proof:** all 83 browser-runtime tests pass, including US-versus-Canada shared-code counterexamples, hidden-phone-shim handling, adversarial submit-guard mutation, graceful Chrome lifecycle, and the unchanged final-submit boundary. The focused profile-location suite passes 9/9.
- **After evidence:** `2026-07-31-clean-v7/08-corrected-greenhouse-final-safe-checkpoint.jpg` shows the real final control untouched; `09-corrected-final-receipt-needs-you-zero.jpg` shows the corrected application state, and `10-restart-needs-you-zero.jpg` proves restart persistence. Exact listing URL was `https://job-boards.greenhouse.io/mercury/jobs/6110081004`.
- **Performance evidence:** the corrected replay recorded browser setup `2.765s`, form preparation `6.860s`, visual checks `<1ms`, and total `9.625s`.
- **Remaining risk:** tailored-CV application integrity, another ATS/source family, voluntary sign-in handoff, and the broader failure/zoom matrix remain open.

### `AUD-015` — Paused application looked ready after consent

- **Severity / workflow:** `P1` — application tracker truth.
- **State:** verified.
- **What the user sees:** the detail panel showed “Ready after consent” while the latest attempt said Needs follow-up and required manual field review.
- **Why it matters:** consent approval is not application readiness; the badge could cause a user to miss unfinished work.
- **Reproduction:** open the prepared Mercury application after the runtime clears a field and safely pauses.
- **Before evidence:** `08-application-needs-action-safe-stop.png` and the current rebuilt-app Computer replay.
- **Intended behavior:** a consented but paused attempt is labeled Needs action; the exact next step remains visible.
- **Implementation:** stage presentation now distinguishes paused from ready after consent.
- **Automated proof:** all nine focused application-status tests pass.
- **After evidence:** `12-application-needs-action-after.png` shows Needs action in both the tracker row and detail badge while the exact manual-review next step remains visible.
- **Performance evidence:** not latency-sensitive.
- **Remaining risk:** verify wording at narrow width and with other paused blocker kinds.

### `AUD-016` — Import review repeated saved facts and proposed unsupported education fields

- **Severity / workflow:** `P1` — résumé extraction review quality.
- **State:** verified for the established imported workspace.
- **What the user sees:** review cards no longer repeat values already saved or expose all-caps record labels and serialized JSON as primary content; education, language, experience, project, and other records render as readable summaries.
- **Why it matters:** noisy or weakly grounded suggestions waste review time and make the importer feel untrustworthy.
- **Reproduction:** import the Casey sample, save accepted values, rebuild review items, and inspect education candidates whose evidence omits the proposed fields.
- **Before evidence:** `04-review-count-mismatch-and-redundant-confirmation.png`.
- **Intended behavior:** exact saved values do not return as work; education fields survive only when their evidence supports them; evidence is concise and unique.
- **Implementation:** reconciliation rejects saved scalar/list/experience/education values with `already_matches_workspace_value`, grounds education subfields, filters no-op review drafts, resolves stale saved cards, and deduplicates evidence fragments. Structured imported values now render as human-readable typed cards while the raw local source value stays behind a closed disclosure.
- **Automated proof:** 14 focused reconciliation/review-item tests and 7 focused Profile suggestion/panel tests pass, plus Job Finder/Desktop typecheck, lint, and diff checks.
- **After evidence:** `13-resume-review-truth-context-after.png` shows grounded contextual values; the rebuilt Profile component now presents examples such as `Education · Budapest University of Technology` and `Language · Albanian` without primary-surface JSON.
- **Performance evidence:** fewer review cards and smaller evidence snippets; end-to-end review-time measurement remains pending.
- **Production proof:** the fresh rebuilt Electron process rendered imported Education and Language suggestions as readable labeled cards with the raw structured value closed behind `View source value`; no real-profile suggestion was accepted or rejected.
- **Remaining risk:** model-provider prose quality and broader PDF/DOCX corpus coverage remain open.

### `AUD-017` — Apply preparation did not state the exact safety contract before opening the browser

- **Severity / workflow:** `P1` — application readiness and trust.
- **State:** verified in the established Shortlisted workspace; broader fixture matrix remains open.
- **What the user sees:** a compact readiness block names the exact original or tailored CV, redacted destination origin/path, required sign-in/account/manual-answer actions, authorized preparation writes, and a final-submit value of `Disabled for this run` before the browser opens.
- **Why it matters:** the user can distinguish preparation permission from application-submission permission before any external page changes.
- **Implementation:** readiness facts are derived from current job, CV mode/artifact, blocker state, and active run settings; destination query/fragment data is removed and the CTA says `Prepare this application`.
- **Automated proof:** six focused readiness tests cover exact original-CV filename, URL-secret redaction, user gates, preparation writes, and disabled final submit.
- **After evidence:** direct Computer Use on the rebuilt production Electron app confirmed `Authorized for preparation`, `Disabled for this run`, and `Prepare this application` on the real five-job Shortlisted screen; no application action was started.
- **Remaining risk:** capture tailored, stale/missing CV, Greenhouse/Ashby/Workday, narrow, and 200% zoom variants.

### `AUD-018` — Prepared applications lacked a truthful data/write receipt

- **Severity / workflow:** `P1` — application privacy and auditability.
- **State:** implemented and automated; live synthetic capture remains open.
- **What the user sees:** new application results can show four concise groups: Stayed local, Sent to a model, Written to the site, and Safety boundary, plus the redacted destination and exact CV filename.
- **Why it matters:** users need to know which facts remained local, whether a model participated, which external fields were actually written, and whether account creation or final submission happened.
- **Implementation:** `ApplyExecutionResult` now carries typed runtime-observed successful field/upload writes. `ApplyJobResult` stores a nullable v1 receipt with lineage, safe origin/path, CV identity without local path, local/model categories, verified writes, and explicit false account-creation/final-submit facts. Existing results remain readable with no receipt.
- **Automated proof:** 12 focused contract/builder/UI tests and all 25 prepare-only runtime tests pass; the runtime test proves exact profile and resume writes while the final control remains untouched. Contracts, Browser Runtime, Job Finder, and Desktop typechecks plus touched-file lint pass.
- **After evidence:** the rebuilt production Electron app opened the established Applications empty state cleanly and the established Shortlisted screen retained the full readiness card; the real profile has no application records, so no user data was mutated merely to manufacture a receipt screenshot.
- **Remaining risk:** isolated live original/tailored receipt capture, receipt export, model-participating provider proof, and failure/retry history remain.

### `AUD-019` — Repeat discovery did not summarize what materially changed

- **Severity / workflow:** `P2` — repeat discovery speed and comprehension.
- **State:** implemented for persisted activity and source-generic refresh deadlines; digest UI expansion remains open.
- **Implementation:** post-collection reconciliation now creates an order-independent v1 freshness digest with explicit new, unchanged, materially changed, and reactivated counts before triage.
- **Automated proof:** 22 scheduler/ledger tests pass, including all four digest classes, order determinism, legacy no-fingerprint refresh behavior, aliases, the 24-hour card-only deadline, seven-day enriched deadline, terminal no-refresh states, and the 10,000-entry scale gate; the 101-test discovery core suite and Job Finder typecheck/lint pass.
- **Automated performance proof:** a deterministic 100-candidate repeated-source benchmark records one source inventory per run while skipping all 100 unchanged enriched candidates before downstream review on the repeat. Root verification measured 1,651 ms cold versus 497 ms repeated, with zero reviewed or staged repeat candidates and the eight retained UI results unchanged.
- **Remaining risk:** inactive/skipped/duration/warning presentation, persisted background scheduling, and broader live provider-repeat timing remain.

### `AUD-020` — Application evidence could not be taken outside the app safely

- **Severity / workflow:** `P2` — application review, portability, and support.
- **State:** implemented and automated; saved-file visual inspection remains open.
- **What the user sees:** each new Application data receipt includes an explicit `Export packet` control that opens a local JSON save dialog.
- **Why it matters:** a user can retain or inspect the exact preparation record without copying opaque internal state or implying that an application was submitted.
- **Implementation:** the portable v1 packet contains exact run/job/result lineage, safe listing and application origin/path, CV identity without its local path, prepared questions and answer provenance, consent decisions, replay checkpoints, and the privacy receipt. It excludes credentials and raw browser state; schema validation strips unknown local-path data and allows `submissionOccurred` only when both submitted result state and receipt proof agree.
- **Automated proof:** five contract redaction/lineage/submission-consistency tests, one exact service-builder path/provenance test, two main-process cancel/save/file-integrity tests, desktop typecheck, and two Applications receipt/export-control tests pass.
- **Remaining risk:** export and inspect a synthetic original- and tailored-CV packet through the production save dialog.

### `AUD-021` — Fresh unchanged listings had no bounded refresh deadline

- **Severity / workflow:** `P2` — repeat discovery freshness and avoided work.
- **State:** automated policy implemented; live timing remains open.
- **Implementation:** new, materially changed, legacy, and reactivated postings refresh immediately; unchanged card-only evidence refreshes after 24 hours; unchanged detail-enriched evidence refreshes after seven days; applied and intentionally skipped postings are never scheduled. Expired unchanged evidence re-enters enrichment instead of being skipped.
- **Automated proof:** the combined scheduler/ledger suite passes 22 tests and the 101-test discovery-core workflow remains green; the 10,000-entry identity lookup remains inside its two-second host gate.
- **Remaining risk:** persisted background scheduling/telemetry and live repeated-source timing remain; deterministic provider timestamp and per-target fairness evidence now pass.

### `AUD-022` — Large-workspace restart integrity lacked a realistic regression gate

- **Severity / workflow:** `P2` — established-user startup, persistence, and scale.
- **State:** service/SQLite, pure renderer view-model, and isolated production Electron DOM/layout scale verified.
- **Implementation:** a deterministic benchmark persists 1,000 jobs, 900 review items, 200 application records/attempts/runs/results, and 100 user-action requests/events, then reads, serializes, closes, reopens, and compares the normalized snapshot byte-for-byte. The production Find Jobs result surface now renders one accessible 50-row page at a time, with Previous/Next controls and selected-job-aware page targeting.
- **Automated proof:** the focused persistence run produced a 3,161,446-byte snapshot and 5,365,760-byte SQLite file; initialization was 404 ms, first read 296 ms, first serialization 9 ms, reopen 102 ms, restart read 326 ms, and restart serialization 12 ms, all inside the generous five-second regression budget. A renderer benchmark then exercised real selection, application-filter/latest-attempt, unresolved-action, and job-label view-model helpers across 1,000 jobs, 100 review items, 200 applications, 400 attempts, and 100 actions for 50 full passes in 21 ms under a 1,500 ms gate. The React DOM regression renders exactly 50 result buttons and 512 nodes from 1,000 jobs in 102 ms on the current host.
- **Production proof:** isolated production Electron/Chromium with temporary user data rendered 1,000 jobs as 50 result buttons and 725 total DOM nodes in 662 ms reload-to-ready; forced layout took 0.4 ms, page-two navigation stayed at 50 buttons and 725 nodes, and document/main/list horizontal overflow remained zero. Evidence: `apps/desktop/test-artifacts/ui/product-quality-release-audit/renderer-dom-scale/renderer-dom-scale-report.json` and `apps/desktop/test-artifacts/ui/product-quality-release-audit/renderer-dom-scale/renderer-dom-scale-page-2.png`.
- **Remaining risk:** broader mutation responsiveness, narrow/zoom distribution, and real production-profile distribution at 1,000 jobs.

### `AUD-023` — Performance limits had no typed fail-versus-warning policy

- **Severity / workflow:** `P2` — release confidence and regression detection.
- **State:** deterministic and discovery-live policy implemented; historical environment comparison remains open.
- **Implementation:** typed performance-budget evaluations record budget identity, unit, observed value, limit, sample floor, regression percentage, status, and human-readable detail. Deterministic comparisons pass through the exact configured allowance and fail above it. Live SLO misses warn below five samples and fail once the sample floor is met. The desktop performance snapshot now evaluates discovery first-activity p95 at three seconds, API-source duration p95 at five seconds, and browser-source longest-gap p95 at thirty seconds.
- **Automated proof:** seven controlled evaluation/aggregation tests cover the exact 10% boundary, deterministic failure, low-sample warning, sufficient-sample failure, in-budget live values, and discovery aggregation.
- **Remaining risk:** persist environment/corpus metadata, add historical before/after comparison, cover twenty-job scorer p95 and API p50 separately, and render warnings in a support-facing diagnostic surface.

### `AUD-024` — Browser-owned gates collapsed into generic or login-only language

- **Severity / workflow:** `P1` — human-action clarity and safe recovery.
- **State:** all kinds classified/presented; four source-access-verifiable kinds persist and resume; capability-specific verifiers remain open.
- **What the user sees:** Needs you gives distinct labels, guidance, Open text, and completion text for login, signup, MFA, email verification, CAPTCHA, account choice, manual answer, legal consent, external redirect, manual upload, and other.
- **Why it matters:** the product no longer tells a user to sign in when the actual responsibility is a security challenge, file attachment, legal decision, or answer; a kind still never grants permission.
- **Implementation:** legacy requests default safely to `other`; explicit application blocker classifications override conservative legacy-code mapping. Login, signup, MFA, and email-verification blockers create kind-specific deduplicated requests with exact run/job/result/checkpoint scope and may resume only after source-access proof. CAPTCHA, account choice, manual answer, legal consent, upload, redirect, and other are deliberately excluded because authenticated-origin proof cannot establish their exact completion.
- **Automated proof:** the focused roadmap batch passes 92 tests, including three compatibility contracts, twenty exhaustive blocker mappings, twelve UI presentations, and sixteen application persistence/resumption cases; every command remains browser-only with account creation and submission false.
- **Remaining risk:** add typed capability probes and deterministic/live capture for the seven challenge/control-specific kinds before allowing persistence or Done verification for them.

### `AUD-025` — Fresh setup could obscure review controls and integrity demos could overstate proof

- **Severity / workflow:** `P1` — first-run profile review and résumé-integrity acceptance.
- **State:** implementation, focused Desktop UI proof, direct typecheck, production build, and a fresh rebuilt Guided Setup/PDF-import/original-CV/Mercury replay through shortlist are complete; live browser/apply proof remains open.
- **Reproduction:** launch an isolated production workspace, import the synthetic Casey résumé, enter Guided Setup, and inspect the bottom of the review queue at 1440×920.
- **Audit walkthrough:**
  1. Launch the production build with a disposable user-data directory.
  2. Import the synthetic Casey résumé through the test-only local seeder and independently compare the exact copied bytes and recorded SHA-256.
  3. Review imported suggestions, enter targeting, and inspect every bottom-of-queue control at 1440×920.
  4. Select and save original-CV mode, restart the same isolated workspace, and confirm the unchanged-CV setting persists.
  5. Complete synthetic targeting and inspect the no-source discovery state without opening an external browser.
  6. Check the current public Mercury Greenhouse source, inspect the returned result set and hard-conflict filter, and stop before starting any real application.
- **Before evidence:** `apps/desktop/test-artifacts/ui/product-quality-release-audit/05-issue-copilot-overlaps-review-controls.png` shows the collapsed Profile Copilot covering review controls.
- **Implementation:** Guided Setup now docks the collapsed Copilot in normal document flow and restores the existing fixed, space-reserving panel only while open. Demo résumé integrity fixtures now materialize exact-hash, structurally valid deterministic PDFs under the OS temporary directory rather than root-relative `/tmp` paths or header-only placeholders.
- **Automated proof:** the current Desktop UI integration batch passes 30 tests across 8 files, desktop TypeScript validation passes, and PDF.js parses the deterministic source fixture as a one-page PDF with the recorded SHA-256. The current production Electron build completes with 727 main-process modules, 2 preload modules, and 2,078 renderer modules.
- **Production proof:** the earlier isolated built Electron flow imported `casey-engineer.txt`, independently matched the copied resume SHA-256 (`661b8dafd72b4c8b62d83ef630601e25eb715d96233a41ee4f53583fae1`), saved `Use my original CV unchanged`, and preserved that selection across restart. The current `2026-07-31-clean-v6` replay started from fresh Guided Setup, imported `casey-engineer.pdf`, completed Profile, saved `Use my original CV unchanged`, configured the public Mercury source, returned eight roles, and showed the shortlisted 92% Design Systems role as `Original CV ready`. `02-pdf-import-complete-targeting-review.jpg` records the completed import/review state, `03-pdf-extraction-second-role-two-achievements.jpg` records the second retained job and its two grounded achievements, and `04` through `10` record profile completion, original-CV selection, source setup, results, contained assessments, and shortlist state.
- **Safety proof:** the clean-v6 replay opened the managed browser, prepared the public Greenhouse form, attached the exact original PDF, and stopped with `Submit application` visible and untouched. It did not submit, grant final-submit authority, create an account, or handle credentials.
- **Remaining risk:** rebuild and replay the corrected phone-persistence receipt, then separately capture the rebuilt docked Copilot at desktop, narrow, and native 200% zoom. The shell-level true-200% navigation regression is verified in `AUD-031`.

### `AUD-026` — Explicit salary conflicts and foreign currencies could produce false fit confidence

- **Severity / workflow:** `P1` — discovery ranking truth and recommendation safety.
- **State:** implementation, focused Vitest, direct type/lint validation, and current production build complete; compensation-specific live visual proof remains open.
- **Reproduction:** configure a USD minimum salary, then compare otherwise identical listings with no pay, USD pay above the minimum, USD pay below the minimum, and EUR/GBP pay.
- **What was wrong:** below-minimum pay added only a prose gap, so an otherwise strong listing could keep a strong/original-ready recommendation. EUR/GBP values were also written to annual-USD fields and compared numerically without an exchange-rate source.
- **Implementation:** match assessments now carry scorer version 2 and a typed compensation dimension with `not_requested`, `unknown`, `meets_minimum`, `below_minimum`, and `currency_incomparable` states plus evidence confidence and comparable values. Only explicit USD evidence populates annual-USD fields. Unknown and incomparable pay add zero suitability; comparable pay above the minimum adds only the existing bounded preference effect; pay below the minimum receives a penalty, a 71-point ceiling, a review-first recommendation, and a direct rationale. Easy Apply remains outside suitability.
- **User-facing behavior:** the evidence ledger now shows a concise Compensation check with Meets minimum, Below minimum, Pay unknown, or Currency not compared instead of hiding the dimension inside one aggregate percentage.
- **Automated proof:** the current integrated Job Finder batch passes 133 tests across 12 files, including compensation and scorer coverage. Contracts, Job Finder, and Desktop TypeScript checks pass; touched production files pass ESLint/diff checks; and the production Electron build completes with 727 main-process modules, 2 preload modules, and 2,078 renderer modules.
- **Executable smoke:** the actual scorer produced version 2 with an otherwise identical USD-above listing at 94, USD-below at 71 with `review_before_applying`, and EUR at the neutral 94 with `currency_incomparable`; the pure evaluator also normalized `USD 50-60/hr` to `104000-124800` annual USD and retained EUR as non-USD.
- **Remaining risk:** capture explicit comparable, below-minimum, unknown, and foreign-currency compensation cards at wide/narrow/200% scale; the labeled scorer calibration itself is complete in `AUD-029`.

### `AUD-027` — Discovery recomputed identical fit assessments across ranking, merge, and restart

- **Severity / workflow:** `P1` — discovery latency and large-workspace responsiveness.
- **State:** versioned session/cache implementation, focused Vitest, direct type/lint validation, and production build complete; broader live pipeline timing remains open.
- **What was wrong:** budgeting calculated a full deterministic assessment only to rank each posting, merge calculated it again, cross-target duplicates repeated the work, and every discovery start recalculated all persisted jobs because saved assessments had no safe invalidation metadata.
- **Implementation:** one assessment session now owns the scorer version, a stable profile/preference context fingerprint, a dedicated scoring-input posting fingerprint, a run-local cache, and exact persisted reuse. Budget ranking and merge share the session. Existing and pending jobs reuse their saved assessment only when scorer, context, and every scoring-relevant posting field match; legacy or changed values miss safely. Provider timestamps, status, provenance, and prior assessment metadata are deliberately excluded from the posting fingerprint because they do not affect fit truth.
- **Correctness proof:** the executable session smoke computed an unchanged posting once across repeated reads, reused the resulting persisted assessment with zero calculations in a new session, and recalculated exactly once after a material description change. Contract defaults keep legacy rows safe with null fingerprints.
- **Performance proof:** five in-process 500-posting replays measured a median `537.73 ms` for 1,000 uncached full assessments versus `278.27 ms` for the session path, a `48.3%` reduction with full computations falling from 1,000 to 500. This clears the roadmap's initial 40% CPU-reduction target on the controlled host smoke; production pipeline timing remains required.
- **Automated proof:** the current integrated Job Finder batch passes 133 tests across 12 files; direct Contracts, Job Finder, and Desktop TypeScript checks and touched production lint/diff checks pass. Coverage includes same-run identity reuse, persisted reuse, scorer/context/posting invalidation, and exactly 500 full calculations for 1,000 reads across 500 unique postings. The production build also passes.
- **Remaining risk:** persist a formal benchmark report with environment metadata, measure the real multi-source pipeline and large established inventory, and precompute deeper candidate evidence maps only if scoring remains material after cache reuse.

### `AUD-028` — One aggregate fit percentage hid why a role ranked where it did

- **Severity / workflow:** `P1` — discovery fit review, ranking trust, and shortlist decisions.
- **State:** implementation, focused Vitest, direct type/lint validation, production build, and current wide/narrow/status-card UI proof complete. Established normal-size keyboard disclosure acceptance now passes in `AUD-041`; alternate-size long-evidence and screen-reader acceptance remain.
- **What the user sees:** result and detail surfaces retain the overall recommendation, while the detail evidence panel now presents one compact single-column Fit breakdown with five checks: Role and requirements, Your preferences, Compensation, Application effort, and Evidence coverage. A required-gap callout stays visible; the full requirement-by-requirement ledger is available behind a native disclosure instead of occupying the page by default.
- **Why it matters:** one percentage cannot explain whether a result is a direct role match, merely convenient to apply to, missing comparable preference evidence, or backed by a thin listing. Users need to distinguish fit, preference, effort, and evidence quality without treating unknown data as positive evidence.
- **Reproduction:** compare otherwise similar listings with exact versus adjacent roles, configured versus missing preference fields, Easy Apply versus external application paths, and detailed versus card-only requirement evidence; inspect the result recommendation and detail Fit breakdown without changing the inputs used by the aggregate scorer.
- **Implementation:** scorer/session version 3 adds schema-defaulted typed assessments for role suitability, preference alignment, application effort, and evidence confidence alongside the existing compensation assessment. Role suitability cites listing title, saved target roles, and required core evidence. Preference alignment considers configured location, work mode, seniority, employment type, and preferred company only when comparable evidence exists. Application effort interprets the application path and human-action checkpoints but does not feed suitability. Evidence confidence counts supportable positive and negative requirement comparisons and explicitly describes supportability rather than hiring odds. Legacy and version 2 persisted assessments safely recompute through the versioned session fingerprints.
- **Scoring invariants:** unknown evidence remains neutral; a company outside a preferred-company list is neutral rather than a hard conflict; Easy Apply may lower estimated application effort but never raises fit; evidence coverage is not a probability or quality judgment. This slice does not change the aggregate score, ordering, or conservative recommendation policy.
- **Automated proof:** the integrated Job Finder batch passes 133 tests across 12 files and the integrated Desktop UI batch passes 30 tests across 8 files. Direct Contracts, Job Finder, and Desktop TypeScript checks plus touched production lint/diff checks pass. The production Electron build completes with 727 main-process modules, 2 preload modules, and 2,078 renderer modules.
- **Executable smoke:** in-process scorer/session smokes pass for the version 3 dimension output and exact fingerprint invalidation while preserving existing aggregate/recommendation behavior.
- **Performance evidence:** five current in-process runs over 500 unique postings and 1,000 reads measured a full-calculation median of `507.36 ms` and a version 3 session median of `275.38 ms`, a `45.7%` reduction with exactly 500 calculations per run. The previous version 2 session median was `278.27 ms`, so this controlled smoke shows no measured session regression; it is not a formal production-pipeline result.
- **After evidence:** `12-results-layout-contained-wide-after.jpg`, `13-results-layout-contained-narrow-after.jpg`, `16-original-cv-badge-contained-narrow-after.jpg`, and `19-review-before-applying-contained-200-percent-after.jpg` prove current recommendation-card containment at wide, narrow, and 200% scale.
- **Remaining risk:** repeat the full disclosure with long evidence at 1024×720, narrow layout, and native 200% zoom plus a legacy workspace; normal-size keyboard interaction now passes, and shell navigation/badge containment already pass native 200% acceptance.

### `AUD-029` — Score-first ordering and uncalibrated role evidence could promote unsafe or misleading matches

- **Severity / workflow:** `P1` — discovery ranking quality, recommendation safety, and user trust.
- **State:** scorer/session version 4 implementation, hardened calibration, focused Vitest, production build, and current live Mercury result proof complete.
- **What the user could see:** a numerically high `skip` result could outrank a lower-scoring strong fit, repeated verification could change tie ordering, generic engineering targets could absorb sales or unrelated domain roles, talent pools could appear actionable, and thin listings could receive apply-ready recommendations despite unresolved geography, clearance, or required-skill evidence.
- **Before evidence:** the fixed 52-case version 3 baseline across four cohorts failed five release gates: NDCG@10 `0.864`, precision@5 `0.850`, recall@10 `1.000`, exact disposition agreement `0.500`, quadratic weighted kappa `0.610`, counterexample pass rate `66.7%`, four incomplete apply-ready recommendations, and two misleading titles in the top five. Hard-conflict top-five count remained zero. `apps/desktop/test-artifacts/ui/product-quality-release-audit/2026-07-31-clean-v6/07-mercury-discovery-8-results-8s.jpg` additionally captured the real-user display defect where a 90% reviewable card appeared before a 92% reviewable card.
- **Implementation:** discovery separates hard-mismatch safety from reviewable-card display order. Clear `skip` results remain below reviewable jobs, reviewable cards sort by descending displayed fit, and equal-score ties retain recommendation, detail quality, stable posted/first-seen/discovered chronology, title, company, and ID tie-breaks. The renderer sorts a copied display list and preserves equal-score source order, so source records and scorer formulas are unchanged. Role-family assessment distinguishes the primary occupation from business or domain qualifiers, rejects non-opening talent pools, and keeps sales-oriented or otherwise mismatched roles out of credible engineering matches. High-precision structured evidence covers Go, SQL, Salesforce, customer-success capabilities, and design capabilities. Remote-geography eligibility and clearance use supported/unknown/conflict states so missing evidence cannot become a false positive and explicit conflicts remain blocking. The versioned 52-case harness adds four cohorts, standard ranking metrics, hard safety gates, deterministic reverse replay, 18 named counterexamples, explicit case expectations, baseline comparison, and report-only diagnostics.
- **Ranking explanation:** isolated rank-change evidence records the prior and current rank positions plus the observed scoring, recommendation, requirement, or eligibility changes. It does not guess whether an unexplained move came from profile edits versus preference edits.
- **Automated proof:** 71 focused matching tests and the 52-case/four-cohort calibration pass. The display-order correction additionally passes 36 focused matching/ranking tests and all 30 discovery UI tests; Job Finder and Desktop direct typechecks, focused ESLint, Prettier, and the source-generic guard pass. The previously recorded integrated Job Finder batch is 133 tests across 12 files, and the current production Electron build passes.
- **After evidence:** `apps/desktop/test-artifacts/job-finder/fit-calibration/fit-calibration-report.json` records scorer version 4 over 52 cases and four cohorts: NDCG@10 `0.916`, precision@5 `0.900`, recall@10 `1.000`, exact disposition agreement `0.750`, quadratic weighted kappa `0.846`, zero explicit-expectation failures, all 18 counterexamples passing, and zero hard conflicts in the top five, incomplete apply-ready recommendations, misleading titles in the top five, or unsafe hard-conflict recommendations. Replay against `fit-calibration-baseline-v4.json` reports zero metadata, aggregate, or case changes. `apps/desktop/test-artifacts/ui/product-quality-release-audit/2026-07-31-clean-v6/11-ranking-92-before-90.jpg` proves the corrected live reviewable-card order.
- **Performance evidence:** this slice is a ranking-quality and safety calibration, not a production-latency claim; the existing controlled scorer/session benchmark remains the current speed evidence.
- **Remaining risk:** the 92%-before-90% correction is proven for the clean Mercury set; broader live multi-source and established production-sized ordering plus the keyboard/full-disclosure acceptance matrix remain.

### `AUD-030` — Review-before-applying badge leaves its parent Overall Assessment card

- **Severity / workflow:** `P2` — live result review, readability, and ranking trust.
- **State:** verified at rebuilt wide/narrow layouts, the enforced 1024×720 minimum production window, and native Electron 200% result-detail zoom.
- **What the user sees:** in the user-reported results view, the `Review before applying` badge leaves its parent Overall Assessment card and draws over the neighboring Posted card.
- **Why it matters:** a primary recommendation visibly breaks containment, makes the explanation difficult to scan, and undermines trust in the result evidence.
- **Reproduction:** inspect the user-reported crop, then open the rebuilt production app at its enforced minimum 1024×720 window, select a review-before-applying result, and inspect the parent Overall Assessment card. Do not describe the dimensions as identical.
- **Before evidence:** `apps/desktop/test-artifacts/ui/product-quality-release-audit/2026-07-31-clean-v5/11-results-layout-overflow-user-report.png` is a 904×604 user-provided crop. It proves the containment defect but is smaller than the supported production window and is not a like-for-like viewport comparison.
- **Intended behavior:** every status badge wraps inside its own parent; the Overall Assessment card has enough width for its badge and explanation at supported sizes and scale factors.
- **Implementation:** the shared status badge now has an explicit maximum width and safe wrapping, and the Overall Assessment card spans both summary columns with `min-width: 0` containment.
- **Automated proof:** the integrated Desktop UI batch passes 30 tests across 8 files, including explicit status-badge and detail-card containment assertions; the related live matching batch also passes.
- **After evidence:** `apps/desktop/test-artifacts/ui/product-quality-release-audit/2026-07-31-clean-v5/12-results-layout-contained-wide-after.jpg`, `13-results-layout-contained-narrow-after.jpg`, `16-original-cv-badge-contained-narrow-after.jpg`, `19-review-before-applying-contained-200-percent-after.jpg`, `20-review-before-applying-contained-rebuilt-960-after.jpg`, `22-review-before-applying-contained-true-200-percent-after.jpg`, `23-review-before-applying-contained-minimum-window-after.jpg`, and `24-review-before-applying-contained-fresh-build-minimum-window-after.jpg` show the badge inside its parent. `24` is the strongest minimum-supported 1024×720 proof because it follows the fresh successful 727-main/2-preload/2,078-renderer production build; `23` is the matching pre-final-build minimum-window capture, and `22` is native Electron `webContents` zoom-factor-2 acceptance. The current clean sequence adds `2026-07-31-clean-v6/08-assessment-badge-contained.jpg` and `09-review-before-applying-contained.jpg`, with `09` directly proving the `Review before applying` badge stays inside Overall Assessment. Screenshot `20` remains supporting rebuilt containment evidence, not a supported 960px-window claim.
- **Latest direct comparison:** the user-reported screenshot was compared in the same visual input with `2026-07-31-clean-v6/09-review-before-applying-contained.jpg`; `15-review-before-applying-contained-final-build.jpg` then re-proved the exact `REVIEW BEFORE APPLYING` label inside Overall Assessment in the rebuilt 1024×720 app. The fresh clean-v7 replay independently re-proves the same containment in `03-discovery-badges-contained.png`. The integrated badge/detail/CTA batch passes 42 tests.
- **Performance evidence:** not latency-sensitive.
- **Remaining risk:** no parent-containment defect remains in the covered result states; `AUD-031` now separately verifies all-six-destination shell reflow at native 200% zoom.

### `AUD-031` — Primary navigation clips at 200% display scale

- **Severity / workflow:** `P1` — primary navigation and accessibility at high scale.
- **State:** verified in focused shell tests and a native Electron `webContents` zoom-factor-2 Computer replay.
- **What the user saw:** the earlier forced-device-scale stress run kept desktop proportions, clipped `Needs you`, and placed Settings offscreen; the corrected native 200% product-zoom layout reflows all six destinations into visible, reachable rows.
- **Why it matters:** a supported accessibility scale makes primary destinations difficult or impossible to reach visually, so the end-to-end workflow cannot be called production-ready at that scale.
- **Reproduction:** stress reproduction uses `--force-device-scale-factor=2`; acceptance uses the production Electron window with `webContents` zoom factor 2. Open Job Finder and inspect all six primary destinations plus result/detail containment. Do not treat the two scale mechanisms as interchangeable.
- **Before evidence:** `apps/desktop/test-artifacts/ui/product-quality-release-audit/2026-07-31-clean-v5/17-results-200-percent-nav-clipped-before.jpg` records the forced-device-scale navigation stress; `18-results-200-percent-content-clipped-before.jpg` records its content constraint. These are reproduction evidence, not native product-zoom acceptance.
- **Intended behavior:** the shell reflows at high scale, every destination stays visible and keyboard-reachable, and neither the document nor primary content has horizontal overflow.
- **Implementation:** the shell now switches to a compact, wrapping high-scale layout instead of preserving the full desktop header row.
- **Automated proof:** focused shell/navigation responsive-layout tests pass. The native Electron Computer replay then proves Profile, Find jobs, Shortlisted, Applications, Needs you, and Settings are simultaneously visible and reachable at true 200% zoom.
- **After evidence:** `apps/desktop/test-artifacts/ui/product-quality-release-audit/2026-07-31-clean-v5/21-shell-true-200-percent-nav-contained-after.jpg` shows all six destinations at native `webContents` zoom factor 2; `22-review-before-applying-contained-true-200-percent-after.jpg` shows result-detail containment at the same zoom.
- **Performance evidence:** not latency-sensitive.
- **Remaining risk:** no navigation-containment defect remains in the covered native 200% state; broader keyboard-only Fit disclosure, reduced-motion, and final matrix work remain outside this issue.

## Flow evidence

### `AUD-032` — Repeated apply runs create duplicate Needs You cards for one job

- **Severity / workflow:** `P2` — human-action inbox clarity and recovery.
- **State:** verified in focused automation and the rebuilt live replay.
- **What the user sees:** one Mercury application with two saved runs produced two nearly identical actionable cards and a `Needs you 2` count, even though only the latest handoff could represent the current blocker.
- **Why it matters:** duplicate actions make the user repeat obsolete work and make the inbox count untrustworthy.
- **Reproduction:** pause one application, open its browser step, rerun Apply Copilot, and inspect Needs You.
- **Before evidence:** the clean-v6 live replay showed one application, two runs, and two same-job action cards after run `1a3794a5`.
- **Intended behavior:** preserve complete request/event history while only the newest request for a job remains actionable.
- **Implementation:** user-action contracts include a terminal `superseded` state and dedicated `supersede` event. After each application handoff is persisted, same-job requests are ordered by `createdAt` plus ID; every older nonterminal request transitions atomically to `superseded`, with bounded stale-revision retries. A newer blocker-free final checkpoint also retires older actionable same-job requests while leaving unrelated jobs and discovery-source login actions untouched; delayed older successes cannot clear a newer handoff.
- **Automated proof:** the focused application user-action suite passes 24/24, including newer-handoff and blocker-free-success ordering regressions; Contracts and Job Finder typechecks pass.
- **After evidence:** `2026-07-31-clean-v7/09-corrected-final-receipt-needs-you-zero.jpg` shows `Needs you 0` immediately after the successful replay; `10-restart-needs-you-zero.jpg` proves that state persists while all historical runs remain in Applications.
- **Performance evidence:** one indexed workspace read plus bounded same-job transitions per new handoff; scale measurement remains open.
- **Remaining risk:** multi-job mixed-blocker live acceptance remains open; no stale same-job action survived the covered success/restart state.

### `AUD-033` — Résumé import quality is strong locally but historical provider work dominated readiness

- **Severity / workflow:** `P2` — first-run speed and extraction trust.
- **State:** local extraction, deterministic profile quality, canary corpus, and fresh configured-provider production timing verified for the Casey PDF.
- **What the user sees:** the older clean-v6 PDF import retained the right content but its persisted text run took about 60.6 seconds and deferred vision completed about 153 seconds after start.
- **Why it matters:** accurate extraction still feels broken when onboarding waits on redundant remote inference.
- **Implementation:** shared-memory work is deterministic local, remote identity/experience/background stages have 25/25/20-second deadlines, and vision is deferred so text readiness is not blocked.
- **Automated proof:** 112 focused resume/parser/provider/import tests pass. Casey PDF and TXT score `1.00` for literal precision/recall, experience F1, education F1, evidence coverage, and auto-apply precision. The three-case declared canary corpus also passes every accuracy metric at `1.00`.
- **After evidence:** the packaged PDF sidecar preserved 14/14 expected facts, both jobs, all six achievements, education, contact data, eight years, and 12 skills. Five cold runs were 2.41–3.04 seconds with identical 1,245-character output and no warnings; deterministic profile parsing took 26.6 ms, and 1,000 warm parses measured p50 5.364 ms / p95 7.158 ms.
- **Performance evidence:** Casey TXT full local import 147.56 ms; Casey PDF full local import 2,484.47 ms; packaged cold PDF p50 2,842.33 ms and observed max 3,044.28 ms.
- **Performance evidence:** the fresh production configured-provider PDF import reached the reviewable profile in approximately 34–35 seconds; local/cold-sidecar figures remain the lower-bound parser baseline above.
- **Remaining risk:** a broader real résumé corpus and repeated configured-provider timing are still required; one historical import note continued to describe background visual reconciliation after text readiness.

### `AUD-034` — Tailored-résumé progress is unreadable and replays after navigation

- **Severity / workflow:** `P2` — résumé generation feedback and user confidence.
- **State:** fixed in focused tests and verified in the rebuilt Electron app.
- **What the user saw:** the prior circular fill covered the percentage with the same dark color, looked visually unfinished, and restarted its visible estimate from zero after leaving and returning to Shortlisted.
- **Implementation:** generation now uses a labelled horizontal progress bar, keeps the numeric estimate outside the fill, supports reduced motion, and retains a bounded per-job displayed-progress value while the same operation remains pending. Settled operations clear the remembered value.
- **Automated proof:** 5 progress-helper tests and 3 preview-panel tests pass, including route revisit, settled-state reset, readable percentage, and progressbar semantics.
- **After evidence:** `apps/desktop/test-artifacts/ui/product-quality-release-audit/2026-07-31-clean-v8/12-resume-progress-readable-live-after.png` shows the live rebuilt app at `78% estimated`; `13-resume-progress-return-completed.png` shows the generated draft after leaving and returning. The operation completed before a second pending-state screenshot could be captured, so non-replay persistence is proved by the focused regression rather than inferred from the completed screenshot.
- **Remaining risk:** test reduced-motion behavior through the full live generation animation matrix.

### `AUD-035` — Needs you is presented as a sequential workflow step

- **Severity / workflow:** `P2` — navigation hierarchy and action discoverability.
- **State:** fixed and verified at normal and high zoom.
- **What the user saw:** `Needs you` sat inside the Profile → Find jobs → Shortlisted → Applications sequence even though it is a cross-workflow notification inbox.
- **Implementation:** the main workflow pill now contains Profile, Find jobs, Shortlisted, Applications, and Settings; `Needs you` is a separate labelled notification/action group with a bell and unresolved count.
- **Automated proof:** shell navigation tests verify that the workflow group excludes Needs you, the notification group exposes the unresolved count, and all six destinations remain reachable.
- **After evidence:** `apps/desktop/test-artifacts/ui/product-quality-release-audit/2026-07-31-clean-v8/11-find-jobs-stable-controls-established-after.png` shows the separated control at normal zoom; `14-needs-you-separate-high-zoom-after.png` shows all five workflow destinations plus the separate Needs you control visible together at native high zoom.
- **Remaining risk:** broader keyboard-only focus-order acceptance remains part of the release matrix.

### `AUD-036` — Find Jobs controls change columns after results arrive

- **Severity / workflow:** `P2` — discovery continuity and spatial predictability.
- **State:** fixed in layout tests and verified against an established 24-job workspace.
- **What the user saw:** source/search controls began on the left in the empty state but moved to the center once results existed.
- **Implementation:** established discovery now keeps Current Search in the first column, Job Results in the center, and Job Details on the right, matching the empty-state starting position.
- **Automated proof:** the discovery layout regression asserts stable search → results → details ordering and the bounded three-column grid.
- **After evidence:** `apps/desktop/test-artifacts/ui/product-quality-release-audit/2026-07-31-clean-v8/11-find-jobs-stable-controls-established-after.png` shows Current Search left, 19 shown/5 hidden results centered, and the selected Greenhouse job detail on the right.
- **Remaining risk:** rerun the same spatial check at the enforced minimum production window and narrow single-column breakpoint.

### `AUD-037` — Supporting résumé context hides Resume Studio's primary workbench

- **Severity / workflow:** `P1` — tailored résumé review, export, and approval.
- **State:** fixed in focused tests and verified through rebuilt Electron export, approval, restart, and tamper-rejection flows.
- **What the user saw:** opening Resume Studio placed the large job-context and claim-trust surface ahead of the preview and export controls, forcing substantial nested scrolling before the primary task was visible.
- **Why it matters:** the user enters Resume Studio to inspect and approve a concrete document; hiding that task behind supporting evidence makes the flow feel broken and makes export controls difficult to discover or operate.
- **Implementation:** job context and claim trust are now a native, keyboard-accessible disclosure collapsed by default. Its summary shows the current draft status and checked-claim count, while the live preview, Save, Refresh, Export PDF, and approval controls remain immediately visible. Reduced-motion users do not receive the disclosure-chevron transition.
- **Automated proof:** the new disclosure regression plus all 13 Resume Workspace screen tests pass 14/14; direct Desktop typecheck and touched-file lint pass.
- **After evidence:** `apps/desktop/test-artifacts/ui/product-quality-release-audit/2026-07-31-clean-v8/15-resume-studio-primary-entry-after.png` shows the rebuilt workspace opening with the 19-claim disclosure collapsed and Export PDF visible. `16-tailored-pdf-approved-after.png` shows the exact exported PDF approved, `17-tailored-resume-ready-before-browser.png` shows Shortlisted using `casey-tailored-integrity.pdf` with both résumé readiness checks green and final submit disabled, and `18-tailored-resume-ready-after-restart.png` proves the same exact approval survives restart.
- **Integrity evidence:** the live export is 63,610 bytes with SHA-256 `D34BF91A9C05881313F8FB7E42C793AC2CC7D5F8ED98EE71C11E5415BA3643E4`. Appending one byte changed the digest to `66CF84A86BC22B102F3DC36C60A370A3F9DE820A819268CD219EF578FD93CABC`; Apply Copilot rejected the changed file before opening or writing to an application. `19-tailored-pdf-tamper-rejected-after.png` records the original protection and `21-tailored-pdf-tamper-clean-error-after.png` records the rebuilt customer-facing error without Electron IPC boilerplate. The original 63,610-byte PDF was restored and its original digest reverified afterward.
- **High-zoom evidence:** `apps/desktop/test-artifacts/ui/product-quality-release-audit/2026-07-31-clean-v8/22-resume-studio-high-zoom-after.png` shows the title, collapsed trust disclosure, preview, and Save/Refresh/Export/Clear Approval controls together at native high zoom.
- **Remaining risk:** no Resume Studio or Profile recovery containment defect remains in the covered Windows normal, minimum-window, and native high-zoom states.

### `AUD-038` — Dedicated Chrome could leave Job Finder stuck on “Starting browser”

- **Severity / workflow:** `P1` — browser-backed discovery and Apply Copilot readiness.
- **State:** fixed in Browser Runtime and verified in the rebuilt Electron app.
- **What the user saw:** Chrome opened and exposed a healthy local debugging endpoint, but Job Finder could remain indefinitely on `Starting browser`, disabling all browser-backed actions.
- **Why it matters:** a visible browser with an app that still says it is starting looks broken and blocks the primary discovery/application workflow.
- **Implementation:** Browser Runtime now attaches to Chrome's advertised DevTools WebSocket endpoint instead of asking Playwright to rediscover it through HTTP, caps attach retries, and treats foregrounding as a one-second best-effort action so window-manager focus cannot stall readiness.
- **Automated proof:** the focused Browser Runtime batch passes 29/29, including direct WebSocket endpoint selection and a never-resolving `bringToFront` regression.
- **After evidence:** `apps/desktop/test-artifacts/ui/product-quality-release-audit/2026-07-31-clean-v8/20-browser-ready-in-3-seconds-after.png` follows a direct production Electron launch; the rebuilt app reached `Ready` in 2,989 ms while the isolated managed Chrome profile was open.
- **Remaining risk:** repeat cold-start timing on slower Windows hosts and macOS/Linux remains open.

### `AUD-039` — Missing approved PDF recovery was easy to miss at the bottom of Shortlisted

- **Severity / workflow:** `P1` — safe application preparation and recovery.
- **State:** fixed in layout tests and verified in the rebuilt Electron app.
- **What the user saw:** the initial missing-file message appeared at the bottom of a tall readiness rail and could be partially outside the visible viewport.
- **Why it matters:** a safety stop is only useful when the user can understand how to recover without guessing or retrying blindly.
- **Implementation:** the Apply Copilot footer is now a non-overlapping flex item instead of an absolute overlay. Missing approved files still fail before browser navigation or form writes, and the application record exposes a direct recovery next step.
- **Automated proof:** the mission-panel regression verifies the footer sits below the bounded scroll area; the current complete repository gate passes 203 test files with one intentional skip.
- **After evidence:** `apps/desktop/test-artifacts/ui/product-quality-release-audit/2026-07-31-clean-v8/23-missing-pdf-recovery-visible-after.png` shows Applications immediately after the real safety stop: `Export and approve a tailored resume before retrying apply copilot.`, `No apply attempt`, and `Apply copilot blocked before launch.` The employer form never opened. The original 63,610-byte PDF was restored and its approved SHA-256 reverified afterward.
- **Remaining risk:** no recovery-message reachability defect remains in the covered missing-tailored and recorded-original-digest-mismatch states.

### `AUD-041` — Fit evidence needed live keyboard-only disclosure proof

- **Severity / workflow:** `P1` — ranking trust and accessibility.
- **State:** verified for the established normal-size Windows flow; alternate-size long-evidence, reduced-motion, and screen-reader acceptance remain.
- **What the user sees:** selecting a different result by keyboard moves visible focus to the updated detail heading. One Tab reaches `Review requirement evidence`; Enter expands all six evidence rows, and Enter again collapses them without losing focus.
- **Why it matters:** the score is only trustworthy if a keyboard user can reach the cited listing/profile evidence without tabbing through the entire result inventory or losing their place after disclosure changes.
- **Reproduction:** activate the established app, Tab through the shell to Find Jobs, select a different result with Enter, Tab once from the focused detail heading, then press Enter twice.
- **Intended behavior:** result activation establishes a deterministic detail focus handoff; the native disclosure is keyboard-operable and preserves focus on expansion and collapse.
- **After evidence:** `apps/desktop/test-artifacts/ui/product-quality-release-audit/2026-07-31-clean-v8/29-keyboard-fit-evidence-expanded.png` shows the focused disclosure with all six requirement rows visible; `30-keyboard-fit-evidence-collapsed-focus-restored.png` shows the collapsed disclosure with the same control still visibly focused.
- **Remaining risk:** repeat the long-evidence disclosure at 1024×720, narrow layout, and native 200% zoom; complete reduced-motion and screen-reader checks separately.

### `AUD-040` — Unchanged résumé imports repeated expensive remote analysis

- **Severity / workflow:** `P1` — résumé import latency and provider cost.
- **State:** implemented and automated-verified; repeated real-format timing remains.
- **What the user saw:** importing unchanged résumé bytes could repeat the same multi-stage remote analysis even when every analysis dependency was unchanged.
- **Why it matters:** current live imports spend more than 99.8% of measured time in remote AI stages, so safe reuse removes the dominant avoidable wait without weakening extraction quality.
- **Implementation:** a fresh local parse first establishes compatibility; completed expensive analysis is reusable only when the app-owned source SHA-256 and exact parser manifest/executors, text and vision provider/model endpoint fingerprints, prompt/schema/reconciliation-policy versions, and normalized profile/search context all match. A hit clones the retained bundle and candidates into a new auditable run; it never aliases or mutates the prior run. Partial/failed/timed-out work, missing candidates or bundles, missing/invalid source digests, any incompatible fingerprint, and explicit refresh runs always recompute. Refresh bypass is intentional because that path does not reread and re-hash source bytes.
- **Privacy and ownership:** the cache persists no new raw source bytes, credentials, browser state, or external paths. Import still copies the selected file into app-owned storage and hashes that saved copy before cache eligibility is considered.
- **Automated proof:** 5 focused tests prove provider-call avoidance on a compatible hit; source-byte and parser misses; provider/prompt/schema/policy/context invalidation; digestless disablement; partial-result rejection; and refresh recomputation. The broader 55-test résumé import/contracts/SQLite regression batch remains green.
- **Remaining proof:** repeat representative PDF and DOCX imports through the production desktop adapter and record cold-versus-hit latency with identical reviewed candidates.
  | Step | State | General health | Accepted evidence | Notes |
  | -------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 1. Fresh launch | verified | clean production launch opens directly into a clear Guided Setup entry | `2026-07-31-clean-v6/01-fresh-launch-profile-setup.jpg` | Disposable clean state. |
  | 2. First-run résumé choice | verified | import and manual-entry paths are explicit, with local-workspace and review-before-approval copy | `2026-07-31-clean-v6/01-fresh-launch-profile-setup.jpg` | No documentation assumptions needed. |
  | 3. Import and review | partial | grounded PDF extraction keeps 14/14 expected facts, both Casey jobs, all six achievements, education, contact data, eight years, and 12 skills; the fresh configured-provider production import completed in approximately 34–35 seconds | `2026-07-31-clean-v7/02-fresh-pdf-import-complete.png`, 112 focused tests, five cold sidecar runs, 9 profile-location tests | Broader real-résumé and repeated configured-provider timing remain. |
  | 4. Profile and preferences | partial | clean setup completes, original-CV mode saves, and the public Mercury source saves without relying on docs | `2026-07-31-clean-v6/04-setup-complete-profile.jpg`, `05-original-cv-setting-saved.jpg`, `06-mercury-source-saved.jpg` | Same-workspace restart persistence and broader preference recovery remain. |
  | 5. Discovery | partial | the clean Mercury run returns eight visible results in approximately 8.2 seconds; established evidence still covers a 56-job provider inventory, 24 retained roles, 19 shown, 5 hidden hard conflicts, and deterministic freshness/known-job behavior | `2026-07-31-clean-v6/07-mercury-discovery-8-results-8s.jpg`, live Computer timing, HTTP 200 in about 454 ms, 66 focused source tests, 133 integrated Job Finder tests | Screenshot 07 proves the eight-result state; the elapsed value comes from the live run. Persisted background scheduling and broader repeated/multi-provider timing remain. |
  | 6. Fit review | partial | scorer/session v4 keeps unknown neutral and effort separate; reviewable cards now show descending displayed fit (92% before 90%), hard mismatches stay below them, recommendation badges remain contained, and established-state keyboard selection/disclosure focus is live-proven | `2026-07-31-clean-v7/03-discovery-badges-contained.png`, clean-v8 screenshots `29` and `30`, clean-v6 ranking proof, 36 focused ranking tests, 30 discovery UI tests | Alternate-size long evidence and broader established/multi-source ordering remain. |
  | 7. Résumé choice/review | verified | original-CV mode, tailored export/approval/restart/tamper recovery, high-zoom Studio, legacy external-source migration, and recorded-digest mismatch recovery are live-proven | original-CV evidence plus clean-v8 screenshots `15` through `28`, 150 integrity tests, 14 workspace tests | No covered Windows integrity/recovery gap remains. |
  | 8. Application readiness | partial | pre-browser UI names the exact CV, destination, browser/user gates, preparation writes, disabled final submit, and live-form expectations; changed tailored bytes are rejected with an actionable error before any application write | clean-v7 screenshots `08` and `09`, clean-v8 `21`, real Computer replay, 12 focused UI tests | Missing-file recovery is live-proven; minimum-window/high-zoom recovery and live non-Greenhouse application replays remain. |
  | 9. Human-action handoff | partial | blockers persist and verify through exact-lineage prepare-only retries; newer same-job handoffs and blocker-free success retire obsolete actions while preserving history | `09-corrected-final-receipt-needs-you-zero.jpg`, 24/24 focused lifecycle tests | Voluntarily signed-in success and mixed-job live acceptance remain; no credentials, account creation, or submit authority. |
  | 10. Final safe checkpoint | verified | the real Mercury form contains the exact original PDF and seven grounded answers with the final control visible and untouched; runtime/catalog paths remain `prepare_only` | `08-corrected-greenhouse-final-safe-checkpoint.jpg`, 83 browser-runtime tests, 11 catalog no-submit tests | `submitAuthorized: false`; final control was never clicked. |
  | 11. Restart/recovery | partial | corrected `Needs you 0`, application receipt, jobs, and history survive a full Electron restart; interrupted discovery recovery also retains prior work | `10-restart-needs-you-zero.jpg`, 5 focused restart-recovery tests, SQLite/restart evidence | Full live interruption matrix and cold-versus-retained timing corpus remain. |

## Evidence limits

- Screenshots prove visible hierarchy, copy, state, layout, and parts of focus behavior, not full accessibility, persistence, safety, or performance.
- Deterministic fixtures support failure/blocker coverage but do not replace public-listing comparison.
- Signed-in sources require browser-owned user handoff; credentials and security challenges stay outside agent control.
- macOS/Linux Interview Helper evidence requires those hosts and cannot be inferred from Windows.

## Latest verification

- The final broad `pnpm verify` gate passes agent/docs/source-generic/structure checks, all package lint and typecheck tasks, the 52-case fit-calibration quality gate, and 203 test files with one intentional skip. It includes application-action lifecycle, restart-persistent SQLite action evidence, the public-provider ATS matrix, copied-source migration, resume integrity, collision-safe identity aliases, repeat-search digest, resettable local feedback, résumé analysis caching, and prepare-only browser guards.
- The last full verification gate before the scorer-version 3 and 4 changes passed on 2026-07-30 through the checked-in Node/Turbo/Vitest toolchain: agent/docs/source-generic/structure checks, all 23 package lint/typecheck tasks, 166 test files, 1,333 passing tests, and one intentionally skipped live benchmark test. That older gate is retained as baseline evidence, not verification of `AUD-028` or `AUD-029`.
- The final production Electron build completed with 731 main-process modules, 2 preload modules, and 2,081 renderer modules. Clean-v7 screenshots `03`, `08`, `09`, and `10` remain the badge, final-boundary, corrected-receipt, and restart proofs; clean-v9 screenshots `31` through `39` add the current feedback, repeat-search, feedback restart/reset, keyboard, and 1024-pixel-wide proof.
- Post-login application resumption uses atomic claim/CAS protections and stable blocker identity; all classified blockers persist and schedule at most one exact `prepare_only` retry. Catalog/browser execution tests prove no submitted result or timestamp can be produced from catalog paths.
- The live Mercury public-provider check returned HTTP 200 with 56 jobs in about 454 ms; the clean UI returned eight roles in about 8.2 seconds. The fresh configured-provider Casey PDF import completed in approximately 34–35 seconds; local/cold-sidecar parsing remains 2.41–3.04 seconds, and 14/14 expected facts survived.
- The accepted clean-v7 sequence proves fresh Guided Setup, configured-provider PDF import/review, Profile completion, saved original-CV mode, public Mercury discovery, corrected ranking, contained badges, visible Shortlisted CTA, managed Chrome launch without the restore prompt, exact original-PDF attachment, correct country/phone and custom answers, the untouched final Greenhouse submit control, `Needs you 0`, and restart persistence. Evidence is `apps/desktop/test-artifacts/ui/product-quality-release-audit/2026-07-31-clean-v7/01-fresh-onboarding.png` through `10-restart-needs-you-zero.jpg`.

## Release status

The covered original-CV public Greenhouse path is production-ready through the final safe checkpoint: correct visible fields, exact PDF fingerprint, 7/7 grounded answers, truthful receipt, obsolete actions retired, restart persistence, and zero submission. Tailored-CV export/approval/restart/tamper/missing-file recovery is now live-proven as well. The established-state keyboard path now reaches a changed result's detail heading and expands/collapses all six requirement-evidence rows with focus restoration. Remaining acceptance work includes voluntary signed-in recovery plus alternate-size long-evidence, reduced-motion, screen-reader, and final failure/recovery matrices; the user explicitly chose not to sign in during this pass. Greenhouse, Ashby, and anonymous Workday coverage is already recorded in the live ATS matrix. Every application execution remains `prepare_only` with `submitAuthorized: false` and `accountCreationAuthorized: false`; no final application control was clicked.

### `AUD-043` — Search history did not explain changes or isolate failed-source recovery

- **Severity / workflow:** `P1` — repeated discovery trust and partial-failure recovery.
- **State:** established wide production visual acceptance and focused automated proof complete; narrow and mixed-failure retry acceptance remain.
- **What the user saw:** persisted history showed totals and raw events but did not summarize what changed since earlier searches, expose source health, or offer a recovery action for one failed source.
- **Why it matters:** repeat searches should explain useful new work and avoided work without forcing users to read an event log, and one unhealthy source must not trigger an expensive replay of every healthy source.
- **Implementation:** discovery target executions now persist typed new, unchanged, changed, reactivated, newly inactive, known, and skipped counts. Run summaries aggregate those counts with warnings, duration, and per-source health using backward-compatible defaults. Search History presents the digest in a responsive definition list and source health in labeled cards. A failed source exposes an accessible retry control wired only to the existing exact-target operation and disabled during conflicting all-source or same-source work.
- **Automated proof:** 15 focused contract, orchestration, and renderer tests pass. Coverage proves legacy defaults, aggregate counts/health/warnings/duration, accessible labels, exact target retry scoping, and conflicting-run disablement.
- **After evidence:** `apps/desktop/test-artifacts/ui/product-quality-release-audit/2026-07-31-clean-v9/34-search-history-change-digest-legacy.png` proves backward-compatible legacy presentation and healthy source status. A real public Mercury repeat then completed in about one second; `35-search-history-fresh-change-digest.png` visibly reports 0 new, 55 unchanged, 1 changed, 0 reactivated, 0 inactive, 56 known, and 23 skipped. The event detail independently reports the 56-job candidate inventory and versioned digest. No application action occurred.
- **Remaining proof:** capture narrow Search History with a mixed healthy/failed run, exercise the exact failed-source retry, and time opening history against a representative 10k ledger.

### `AUD-044` — Editing a source URL reused guidance learned for the old site

- **Severity / workflow:** `P1` — discovery correctness and source trust.
- **State:** renderer and service implementation plus focused automated proof complete; rebuilt production UI acceptance remains.
- **What the user saw:** after changing an existing source from a Greenhouse board URL to an unrelated unavailable URL, the next search still used the old Greenhouse provider artifact and reported the prior board's API error.
- **Why it matters:** a stable target ID must not let learned routes, provider intelligence, or debug lineage cross into a different site. That can waste time, misreport source health, and search the wrong provider.
- **Implementation:** a changed trimmed starting URL now clears validated/draft instruction references, debug lineage, verification time, and status at the renderer boundary and in both service save paths. The source remains configured but explicitly needs a fresh check; whitespace-only edits retain valid guidance.
- **Automated proof:** five focused helper and workspace-service tests pass, including both preferences-only and combined profile/preferences saves. Touched Job Finder lint and typecheck pass.
- **Before evidence:** `40-search-history-mixed-source-warning.jpg` shows the mixed healthy/warning run where the changed unavailable source still reported the stale Greenhouse 404 provider path.
- **Remaining proof:** rebuild Electron, repeat the URL change, verify the old provider artifact is not used, and capture the corrected source-health result.

### `AUD-042` — Hidden jobs had no reason, learning boundary, or undo

- **Severity / workflow:** `P1` — discovery trust and everyday control.
- **State:** established pointer, keyboard, restart persistence/reset, 1024-pixel-wide, and native 200% acceptance plus focused automated proof complete.
- **What the user saw:** `Hide result` immediately removed a job without explaining why, showing what was remembered, or offering a recovery path.
- **Why it matters:** users need a reversible local preference without turning subjective feedback into job facts, opaque scoring, or a silent hard filter.
- **Implementation:** `Not interested` opens keyboard-operable reason chips for role, seniority, location, work mode, compensation, company, missing requirement, duplicate, and other. Confirmation persists a versioned local feedback record, archives pending or saved jobs without losing them, and exposes them in a `Hidden by you` disclosure. `Show again and reset` restores discovery and clears the feedback. Duplicate rediscovery preserves explicit hidden state while retaining the newly computed factual assessment; feedback never enters scoring.
- **Automated proof:** focused contract tests cover legacy null migration, bounded enum validation, and malformed input. Job Finder tests cover persistence, score isolation, duplicate rediscovery, and undo/reset. Renderer tests cover reason-chip pressed state, explicit confirmation, and a non-overlapping responsive action footer.
- **After evidence:** `apps/desktop/test-artifacts/ui/product-quality-release-audit/2026-07-31-clean-v9/31-not-interested-reason-picker.png` shows the local, scoring-neutral reason picker and explicit confirmation. `32-not-interested-hidden-result.png` shows the selected result removed, count updated, and `Hidden by you (1)` recovery disclosure. `33-not-interested-restored-reset.png` shows the exact job restored and feedback reset. `36-not-interested-persists-after-restart.png` proves the hidden reason and recovery control survive a full Electron relaunch; `37-not-interested-reset-after-restart.jpg` proves the exact job returns, the count restores to 31, and the reset confirmation is visible after relaunch. `38-not-interested-keyboard-confirmed.jpg` proves keyboard-only reason selection and confirmation; `39-not-interested-picker-1024-wide.jpg` shows every reason and both actions contained and reachable at 1024-pixel width. `41-not-interested-picker-native-200-percent.jpg` proves the expanded picker remains scrollable, every reason is visible, and the disabled confirmation plus Cancel stay contained and reachable at the native Electron 200% zoom cap. The picker was cancelled without changing job state. The run used an isolated production workspace and never opened an application flow.
- **Remaining proof:** none for this control; wider release accessibility work remains tracked separately.
