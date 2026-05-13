# Status

Read this for active feature work, handoff updates, broad repo changes, or unclear current state.

## Current Truth

- Completed foundations: `007`, `009`, `010`, `011`, `012`, `013`, `014`, `015`, `016`, `017`, `018`, `019`, `020`, `021`, `022`, `023`, `024`, `025`, `026`, `027`, `028`, `029`, `030`, `031`, `032`, `033`, `034`, `035`
- Active work: `036 Interview Helper Live Session Full Product`
- Baseline landed: desktop app, typed Electron boundaries, SQLite persistence, guided setup, profile copilot, discovery, resume workspace, safe non-submitting apply

## What Matters Now

- `036` is active: Interview Helper now has the first integrated deterministic desktop workflow: contracts, state machine, file-backed persistence, restart-to-`interrupted` recovery, main-process service hosting, typed preload APIs, a top-level route, Electron `desktopCapturer` screenshot context with immediate temporary-file cleanup, separate answer/transcript overlay BrowserWindows with Electron content-protection requests, tray/global-hotkey semantic controls, post-session review/export/delete flows, no live cue/transcript mirroring in the main window, and replayable desktop harness evidence. Windows Electron `desktopCapturer` protection evidence did not detect protected overlay pixels. It is not complete as a cross-platform hardware release yet: real microphone and meeting/system audio capture, local/platform/cloud STT adapters, meeting-app-specific capture exclusion, and macOS/Linux validation still need target-platform implementation/evidence. Future authorized full capture exclusion remains the highest-priority architectural constraint, so protected overlay surfaces must stay first-class `os-integration` capabilities with verification results instead of booleans or session-logic assumptions. Work from `docs/exec-plans/active/036-interview-helper-live-session-full-product.md`.
- `034` and `035` are completed: browser/source-debug now has generic bounded visual snapshot tooling, schema-safe visual observation contracts, retained screenshot metadata cleanup, and source-generic visual phase evidence; safe apply now has explicit orchestrator-owned visual checkpoint opt-in, schema-validated visual observations/checkpoints/reconciliations in application records and Applications UI, and no ambient runtime screenshot capture on application pages. Latest evidence is green for `pnpm verify:affected`, focused contracts/runtime/job-finder tests, desktop build, and Applications recovery UI harness; see `docs/exec-plans/completed/034-browser-source-debug-visual-evidence.md` and `docs/exec-plans/completed/035-apply-visual-assistance.md`
- `033` is completed: resume import now creates local temporary page images for PDF, DOCX, TXT, and MD, runs text and vision branches with separate provider roles and a graceful 10-minute default vision deadline, reconciles visual candidates/evidence into the existing setup review flow, and gives users actionable `Document text` / `Visual scan` choices for material conflicts; vision defaults to `FelidaeAI-Omni-3.6` and can reuse the shared AI provider key/base URL when vision-specific config is absent; latest real configured-Omni comparison across all six repo fixtures completed without vision failures/timeouts (`apps/desktop/test-artifacts/ui/resume-import-vision-comparison-full-fix-omni-600/resume-import-vision-comparison-report.json`) with literal recall `1.000`, education F1 `1.000`, experience F1 `0.906` vs normal `0.915`, auto-apply precision `1.000`, and lower unresolved rate `0.216` vs normal `0.285`; latest focused evidence is green for `pnpm validate:package ai-providers`, `pnpm validate:job-finder`, `pnpm validate:desktop`, and desktop build; see `docs/exec-plans/completed/033-parallel-vision-resume-import.md`
- `030` is completed: resume generation now uses a derived coverage policy instead of the old first-3 work-history cap, preserves grounded fallback history through AI normalization, surfaces weak-fit/gap/compact work-history review suggestions as app-only Resume Studio guidance, and extends replayable resume-quality evidence with real imported fixtures; see `docs/exec-plans/completed/030-resume-coverage-and-copy-quality.md`
- `031` is completed: the shipped apply-safe resume catalog now has eight stable template ids, neutral default coloring, and direct one-click template selection in Settings and Resume Studio: `Chronology Classic`, `Senior Brief`, `Modern Editorial`, `Engineering Spec`, `Proof Portfolio`, `Formal Proof`, `Longform Timeline`, and `Career Pivot Bridge`; see `docs/exec-plans/completed/031-functional-resume-template-variety.md`
- `032` is completed: Resume Studio now normalizes structured entry order through the shared draft/service path, defaults experience to current-then-newest-first chronology, preserves hide/show slots, exposes per-draft manual move and reset-to-chronology controls, and keeps preview/export order faithful; latest evidence is green for `pnpm validate:package contracts`, `pnpm validate:package job-finder`, `pnpm validate:package desktop`, `pnpm --filter @unemployed/desktop ui:resume-workspace`, and `pnpm validate:docs-only`; see `docs/exec-plans/completed/032-resume-studio-experience-ordering-and-manual-control.md`
- `029` is completed: the full-product hardening pass now lands truthful Settings sample-preview copy, stronger first-run Applications and Shortlisted CTAs, discovery blocker-first zero states, safer guided-setup/profile copilot insets, thin-profile resume fallback improvements, fresher resume-import auto-apply heuristics, refreshed Applications recovery evidence, and a decomposed Applications detail panel whose touched hotspot is now cleared from renderer structure warnings; refreshed evidence is green for `pnpm validate:desktop`, `pnpm validate:job-finder`, `pnpm --filter @unemployed/desktop ui:capture`, `pnpm --filter @unemployed/desktop ui:resume-import`, `pnpm --filter @unemployed/desktop ui:applications-recovery`, `pnpm --filter @unemployed/desktop ui:applications-queue-recovery`, `pnpm --filter @unemployed/desktop benchmark:resume-quality`, `pnpm --filter @unemployed/desktop benchmark:resume-import`, and `pnpm validate:docs-only`; see `docs/exec-plans/completed/029-full-product-critical-qa-and-improvement-plan.md`
- `027` is completed: the Job Finder resume experience UX reset now ships a materially stronger desktop `Settings` template-selection surface and `Resume Studio` editing surface with denser hierarchy, preview-height-aware page framing, draft identity editing, reliable preview-to-editor targeting, and accepted screenshot evidence under `apps/desktop/test-artifacts/ui/1440x920/settings.png`, `apps/desktop/test-artifacts/ui/resume-workspace/03-preview-recovered.png`, and `apps/desktop/test-artifacts/ui/resume-workspace/10-review-queue-gated.png`; `pnpm validate:package desktop` and repo build are green
- `028` is completed: desktop QA follow-up and UX hardening now keep blocked `Find jobs` recovery actions visible in the main results pane, preserve narrow-width discovery context, align Applications stage and consent semantics across tracker/detail surfaces, keep Resume Studio visible after assistant replies, harden Profile copilot/nav overlap, and refresh replayable QA harnesses with latest evidence under `apps/desktop/test-artifacts/ui/source-sign-in-prompts/`, `apps/desktop/test-artifacts/ui/resume-workspace/`, `apps/desktop/test-artifacts/ui/applications-recovery/`, and `apps/desktop/test-artifacts/ui/resume-import/`; `pnpm validate:desktop`, `pnpm validate:job-finder`, and desktop build are green
- `026` is completed: Job Finder now ships a resume catalog with enriched template metadata, truthful `apply-safe` and `share-ready` lane semantics, shared preview and export renderer ownership in desktop `src/shared`, materially distinct ATS-safe layouts, sample-content preview rendering in Settings plus live draft-backed previewing in Resume Studio, deterministic workspace-driven template recommendations, and service-layer approval plus auto-apply guards that refuse non-eligible templates
- `025` is completed: Job Finder now ships a preview-centered `Resume Studio` with truthful live preview, shared preview/export rendering, unsaved-preview messaging, preview failure fallback, preview-to-editor targeting, and widened desktop harness evidence under `apps/desktop/test-artifacts/ui/resume-workspace/` including `studio-preview-results.json`
- `024` is completed: Job Finder now ships six ATS-safe resume themes with default-theme settings, per-draft theme selection in Resume Workspace, draft-owned export and approval behavior, and expanded renderer plus benchmark coverage; the latest UI harness artifacts live under `apps/desktop/test-artifacts/ui/resume-workspace/` and the latest benchmark report lives under `apps/desktop/test-artifacts/ui/resume-quality-benchmark/`
- `023` is completed: candidate-backed visible-skill grounding, broader low-level sanitizer and validator coverage, two ATS-safe templates, and the replayable desktop benchmark now protect the resume-generation path; the latest benchmark report and persisted HTML artifacts live under `apps/desktop/test-artifacts/ui/resume-quality-benchmark/`
- `022` is completed: source sign-in prompts and source-aware browser entry now surface in `Profile` and `Find jobs`, with screenshot-reviewed desktop QA artifacts under `apps/desktop/test-artifacts/ui/source-sign-in-prompts/`
- `021` is completed: resume-import duplicate records, fresh-start placeholder replacement, optional-proof warning cleanup, and date-derived years-of-experience fallback are now part of the landed import baseline
- `020` is completed: Job Finder routes now use scoped pending lanes with clearer disabled and in-progress button feedback across desktop flows
- `017` completed the current-stack browser loop evaluation and did not justify a substrate change yet
- Future discovery/browser work should start from completed `017` evidence and stay source-generic
- Preserve evidence, replayability, approvals, consent interrupts, typed boundaries, and source-generic discovery
- Live submit remains disabled unless explicitly re-authorized
- Browser/apply vision is evidence-only: no selectors, action directives, saved-job behavior, generated answers, final-submit guidance, or site-specific workflow rules from visual output may cross schema boundaries

## Reopenable Follow-Ups

- Continue reducing real-app `Check source` cost when fresh full-app evidence shows product friction
- Clean persisted title/company quality when extracted jobs are otherwise useful and a concrete pattern is observed
- Treat Kosovajob `0` persisted jobs as context-dependent, not automatically a failure, because the board can have few suitable matches for the current resume
- Add new resume-quality benchmark corpus cases only when fresh real outputs expose a missing regression class

## Latest 017 Snapshot

- Landed: LinkedIn query-first starts, route hygiene, Chrome attach reuse, extraction fixes, benchmark harness session reuse/scoping fixes, source-debug finish-state cleanup, catalog-runtime ownership cleanup, and several source-generic cleanup passes
- Latest truthful rebuilt reruns: LinkedIn can persist `5` jobs in single-target `Search now` and `6` in LinkedIn-only `run_all`; Kosovajob persists `0` in both flows
- Benchmark reminder: rebuild desktop first because `apps/desktop/scripts/benchmark-job-finder-app.mjs` launches `out/main/index.cjs`
- Volatile benchmark detail lives in `docs/exec-plans/completed/017-experiment-tracker.md`

## Hard Decisions

- Keep `packages/job-finder` as orchestration owner
- Keep `packages/browser-agent` for workflow policy, prompts, and structured outputs
- Keep `packages/browser-runtime` generic
- Keep shared discovery logic source-generic; board-specific rescue logic in core flow is debt, not a model to repeat
- Keep contracts typed and schema-validated
- Keep docs short; volatile benchmark-by-benchmark history belongs in completed plan trackers, not here

## Next Step

- Work from `docs/exec-plans/active/036-interview-helper-live-session-full-product.md` for Interview Helper implementation.

## Key References

- `docs/exec-plans/active/036-interview-helper-live-session-full-product.md`
- `docs/TRACKS.md`
- `docs/exec-plans/completed/035-apply-visual-assistance.md`
- `docs/exec-plans/completed/034-browser-source-debug-visual-evidence.md`
- `docs/exec-plans/completed/033-parallel-vision-resume-import.md`
- `docs/exec-plans/completed/030-resume-coverage-and-copy-quality.md`
- `docs/exec-plans/completed/031-functional-resume-template-variety.md`
- `docs/exec-plans/completed/032-resume-studio-experience-ordering-and-manual-control.md`
- `docs/adr/0001-resume-coverage-and-apply-safe-template-catalog.md`
- `docs/exec-plans/completed/029-full-product-critical-qa-and-improvement-plan.md`
- `docs/exec-plans/completed/027-job-finder-resume-experience-ux-reset.md`
- `docs/exec-plans/completed/028-desktop-qa-follow-up-and-ux-hardening.md`
- `docs/exec-plans/completed/026-job-finder-resume-template-families-variants-and-catalog-selection.md`
- `docs/exec-plans/completed/025-job-finder-resume-studio-live-preview-and-editing.md`
- `docs/exec-plans/completed/024-job-finder-resume-theme-catalog-and-selection.md`
- `docs/exec-plans/completed/023-job-finder-world-class-resume-generation-quality.md`
- `docs/exec-plans/completed/022-job-finder-source-sign-in-prompts-and-source-aware-browser-entry.md`
- `docs/exec-plans/completed/020-job-finder-scoped-button-pending-state-and-feedback.md`
- `docs/exec-plans/completed/017-browser-substrate-evaluation-and-direction.md`
- `docs/exec-plans/completed/017-experiment-tracker.md`
- `docs/exec-plans/completed/019-job-finder-world-class-resume-import.md`
- `docs/exec-plans/completed/021-job-finder-resume-import-duplicate-record-deduplication.md`
- `docs/exec-plans/completed/015-job-finder-automatic-job-apply.md`
