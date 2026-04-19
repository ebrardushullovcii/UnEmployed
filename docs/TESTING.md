# Testing

## Baseline Repo Checks

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm structure:check`

## Fast Validation Loops

- `pnpm verify:quick` runs the fastest repo-wide preflight we expect before wider validation: docs, structure, lint, and typecheck.
- `pnpm verify:affected` runs docs plus structure checks first, then uses Turborepo `--affected` filtering for lint, typecheck, and test on the packages changed relative to the current branch base.
- `pnpm format` applies the canonical repo formatter in place.
- `pnpm format:check` checks formatting without mutating files.
- `pnpm knip` reports unused files, exports, and dependencies so cleanup happens before review feedback has to point it out.

## Guidance Validation

- Run `pnpm agents:sync` after changing repo-wide guidance, registry entries, or project-local skills.
- Run `pnpm agents:check` after changing generated adapter sources, registry entries, required package guides, or project-local skills.
- Run `pnpm docs:check` after changing canonical docs, root guidance, or internal markdown links.
- Run `pnpm verify:quick` after repo-level script or tooling changes before the broader `pnpm verify` pass.

## Structure Checks

- `pnpm structure:check` reports oversized source files and concentration hotspots in warn-only mode.
- Current warning budgets: general source files at `800` lines, desktop renderer components at `400` lines, and package entrypoints at `200` lines unless they are mostly barrel exports.
- Current future hard-fail threshold is `1200` lines for a single source file; keep new work comfortably below it instead of treating that number as a target.
- Use `pnpm hotspots` when you want a quick ranking of the largest files and most concentrated workspaces before starting a larger refactor.

## UI Validation Commands

- `pnpm --filter @unemployed/desktop build`
- `pnpm desktop:dev`
- `pnpm --filter @unemployed/desktop benchmark:resume-import`
- `pnpm --filter @unemployed/desktop ui:capture`
- `pnpm --filter @unemployed/desktop ui:resume-import`
- `pnpm --filter @unemployed/desktop ui:profile-baseline`
- `pnpm --filter @unemployed/desktop ui:profile-setup`
- `pnpm --filter @unemployed/desktop ui:profile-copilot-preferences`
- `pnpm --filter @unemployed/desktop ui:applications-copilot-review`
- `pnpm --filter @unemployed/desktop ui:applications-recovery`
- `pnpm --filter @unemployed/desktop ui:applications-queue-recovery`
- `pnpm --filter @unemployed/desktop ui:apply-queue-controls`
- `pnpm --filter @unemployed/desktop ui:resume-workspace`
- `pnpm --filter @unemployed/desktop ui:resume-workspace-dirty`

## Appearance QA

- Validate both resolved dark and resolved light output whenever renderer theme tokens, shared primitives, or desktop shell surfaces change.
- Confirm that `Settings -> Appearance` persists `System`, `Light`, and `Dark`, and that `System` follows the current OS preference after reload.
- Confirm that when the OS preference cannot be detected at startup, `System` falls back to dark instead of light.
- Scripted Electron UI captures should force a deterministic system-theme override when visual review depends on a known resolved theme. The current harness default should resolve `System` to dark unless a capture explicitly overrides `UNEMPLOYED_TEST_SYSTEM_THEME`.
- Check the highest-risk contrast surfaces in both themes: page headers, muted helper text, field placeholders, focus borders, panel borders, status badges, status banners, progress tracks, modal scrims, and scrollbars.
- Confirm the app applies the saved appearance before the workspace snapshot resolves so startup does not flash dark when the resolved theme should be light.

## Resume Workspace Demo Standard

- Treat the resume-workspace feature as incomplete until the desktop UI has been exercised through a real scripted or manual run that proves generation, editing, assistant changes, export, approval, and apply gating.
- Prefer a repeatable Playwright or Electron capture harness over one-off manual clicking whenever the flow changes.
- Save screenshot artifacts and any supporting JSON snapshots under `apps/desktop/test-artifacts/ui/` during validation runs; treat them as QA evidence, not committed source files.
- Resume-workspace safety changes should also prove the non-happy paths they touch, especially stale-after-edit behavior, upstream-change staleness, unsaved-edit navigation guards, and missing-approved-file apply refusal.
- When the workflow expands, update this file and the relevant active or queued exec plan in the same task so later agents inherit the exact demo path instead of rediscovering it from chat context.

## Apply Automation Safety

- Until the user explicitly re-authorizes it, do not run live-site application flows, real employer submission attempts, or final-submit QA for Plan `015` work.
- Validate early apply-automation slices with deterministic contract, repository, service, IPC, and desktop-build checks instead.
- Treat any future live apply QA as an explicit opt-in gate, not the default local validation loop.
- The current deterministic apply-copilot slice should prove that approved-resume upload memory, grounded answer capture, retained artifacts, and replay checkpoints persist while the run remains `paused` or `awaiting_review`; do not accept tests that report `submitted` for the copilot path.
- Use `pnpm --filter @unemployed/desktop ui:applications-copilot-review` when Applications review surfaces or apply-copilot detail loading changes; it proves the safe copilot path still pauses before submit and that the raw persisted question, answer, artifact, and checkpoint data renders in the Applications detail panel.
- Use `pnpm --filter @unemployed/desktop ui:applications-recovery` when Applications run-history selection or safe retry/rerun controls change; it proves older runs can be selected for review, that fresh non-submitting copilot or auto-run recovery actions create new runs from the Applications screen, and that reruns retain a replay checkpoint showing the prior saved apply context.
- Use `pnpm --filter @unemployed/desktop ui:applications-queue-recovery` when Applications queue recovery controls change; it proves a historical queue run can show which jobs will be restaged versus excluded, render a richer per-job queue outcome summary, then restage only its remaining or skipped jobs into a fresh safe queue run from the Applications screen.
- Use `pnpm --filter @unemployed/desktop ui:apply-queue-controls` when Review Queue multi-select staging, Applications queue approval controls, consent handling, skip-and-continue behavior, or cancel-run flows change; it proves the safe non-submitting queue path can stage multiple approved jobs, pause on consent, resume after consent approval, skip blocked jobs after consent decline, and cancel a queued run while retaining Applications evidence.

## Source-Debug QA

- Validate that Profile Preferences keeps `Debug source` disabled until a target has a valid absolute starting URL.
- Validate that Discovery can open the dedicated Chrome profile even before any prior browser-profile session has been recorded.
- Validate that source-debug completion copy matches the actual retained run state for `paused_manual`, `cancelled`, `failed`, and `interrupted` runs.
- Ensure the Profile source-debug review modal traps focus while open, announces loading and error states clearly, and that inline learned-instruction edits only mutate the editable instruction fields.
- Confirm that `Verify` replays the selected learned-instruction artifact, leaves the reviewed artifact intact, and promotes or drafts a successor artifact based on the new replay result.

## Plan 010 Performance Snapshot

- Enable the desktop test API with `UNEMPLOYED_ENABLE_TEST_API=1` when you need retained timing data during a local benchmark or QA run.
- After running discovery or source-debug in the desktop app, inspect `await window.unemployed.jobFinder.test?.getPerformanceSnapshot()` from DevTools to fetch the latest retained timing snapshot.
- Discovery timing currently lives on `latestDiscoveryRun.summary.timing` and `latestDiscoveryRun.targetExecutions[].timing`.
- Source-debug timing currently lives on `latestSourceDebugRun.run.timing`, `latestSourceDebugRun.attempts[].timing`, and `latestSourceDebugRun.run.phaseSummaries[].timing`.
- Use `totalDurationMs`, `firstActivityMs` or `firstProgressMs`, `longestGapMs`, and the grouped stage or wait-reason durations to explain long visible idle spans before making further runtime changes.
- The retained `013` live benchmark harness lives at `scripts/benchmark-013-live.test.ts`; it is manual-only, skips during normal `pnpm test`, and should be run only with `UNEMPLOYED_RUN_013_LIVE_BENCHMARK=1` plus an explicit `BENCHMARK_VARIANT` when you intentionally want live before-vs-after measurement output.

## Live Agent Config

- `UNEMPLOYED_AI_API_KEY` enables the OpenAI-compatible provider path used for resume extraction and resume tailoring.
- The desktop app now auto-loads root or `apps/desktop` `.env` / `.env.local` files before creating the AI client, so local FelidaeAI credentials do not need to be exported manually every time.
- `UNEMPLOYED_AI_BASE_URL` and `UNEMPLOYED_AI_MODEL` are optional overrides; the current defaults target the FelidaeAI OpenAI-compatible endpoint shared by the user.
- `UNEMPLOYED_AI_TIMEOUT_MS` sets the general model request timeout in milliseconds.
- `UNEMPLOYED_AI_RESUME_TIMEOUT_MS` overrides the timeout for resume extraction specifically; raise it when resume uploads fall back after a provider timeout.
- `UNEMPLOYED_BROWSER_AGENT=0` switches Job Finder back from the dedicated Chrome-profile browser agent to the deterministic catalog adapter; when unset, desktop builds now use the browser agent by default. The legacy `UNEMPLOYED_LINKEDIN_BROWSER_AGENT` name is still accepted as a fallback when the newer variable is unset.
- `UNEMPLOYED_CHROME_PATH` optionally points the agent to a specific local Chrome install.
- `UNEMPLOYED_CHROME_DEBUG_PORT` optionally overrides the dedicated Chrome remote-debugging port; default is `9333`.
- Tests and CI should continue to rely on deterministic providers and fixtures unless a task explicitly calls for live-agent QA.
- The desktop test API should keep scripted UI harnesses on deterministic AI paths even when local `.env` files enable the live OpenAI-compatible provider for regular manual runs.
- Resume-workspace export now opens the native Save dialog during regular desktop use; keep the desktop test API path deterministic and dialog-free so `ui:resume-workspace` and related harnesses can still export without OS-level picker automation.
- Resume-import QA should cover at least one plain-text input path plus one extracted-document path (`pdf` or `docx`) when the ingestion layer changes.
- The bundled resume parser sidecar is platform-specific. Build the sidecar artifact on each target OS or CI runner (`win32-x64`, `darwin-arm64`, `darwin-x64`, `linux-x64`) before packaging installers for that platform.
- `pnpm --filter @unemployed/desktop prepare:resume-parser-sidecar` prepares the current host platform bundle; `pnpm --filter @unemployed/desktop prepare:resume-parser-sidecar:matrix` is a host-aware helper that logs the full supported matrix but only builds the target matching the current host platform because sidecar binaries are native artifacts.
- `pnpm desktop:dev` and `pnpm --filter @unemployed/desktop build` now run sidecar preparation in best-effort mode so local development does not hard-fail on thin environments; explicit sidecar preparation commands remain strict and should be used for release or parser-quality validation.
- Current committed deterministic resume-import fixture: `apps/desktop/test-fixtures/job-finder/resume-import-sample.txt`.

## Resume Import Quality Process

- Treat resume import quality as a benchmarked product surface, not as a one-off parser tweak.
- Any change touching parser routing, OCR, preprocessing, document IR, stage extraction, reconciliation, confidence policy, or auto-apply policy should add or update at least one regression fixture or reviewed correction example.
- Maintain a small pinned canary set for fast replay and a broader retained corpus for fuller benchmark runs.
- Benchmark gold for experience and education should reflect the reviewed record truth the workflow is expected to surface, even when those records remain review-first and are not auto-applied into the canonical profile.
- Keep a stable error taxonomy for resume-import failures, including at minimum `READING_ORDER`, `SECTION_BOUNDARY`, `FIELD_MISATTRIBUTION`, `DATE_RANGE`, `ORG_TITLE_SWAP`, `OCR_NOISE`, `MISSING_EVIDENCE`, `OVERCONFIDENT_AUTO_APPLY`, and `UNRESOLVED_SHOULD_HAVE_RESOLVED`.
- Keep parser worker version, OCR or model-pack version, and prompt or reconciliation version pinned and comparable in benchmark output.
- Do not promote raw user corrections straight into gold fixtures. Review, sanitize, or synthesize them first, then add them deliberately as regression assets.
- Any increase in unresolved output is acceptable only when it clearly reduces silent wrong writes and the benchmark report makes that tradeoff explicit.
- Prefer routing, preprocessing, and targeted repair improvements before adding more parser or model complexity.

## Resume Import Release Gates

- No critical resume-import canary regression is allowed.
- No new silent wrong auto-apply on benchmark documents is allowed.
- Accepted-field precision for safe auto-apply fields should stay flat or improve.
- Record-level quality for experience and education should stay flat or improve within the agreed benchmark tolerance.
- Evidence coverage on accepted fields should not regress without explicit rationale.
- Importer-affecting changes should be compared against the previous pinned benchmark baseline, not judged only by anecdotal manual checks.

## Desktop UI Capture Workflow

- Install workspace dependencies first with `pnpm install` so the desktop app and `playwright` are available locally.
- Use `pnpm --filter @unemployed/desktop ui:capture` for the default desktop review pass.
- Use `pnpm --filter @unemployed/desktop benchmark:resume-import` to replay the retained resume corpus through the desktop importer and save `resume-import-benchmark-report.json` under `apps/desktop/test-artifacts/ui/<label>/`.
- Benchmark reports should keep a top-level parser-manifest summary: `parserManifestVersion` may be a single manifest id or a `mixed:` summary, and `parserManifestVersions` should list every manifest observed across the replayed corpus so release evidence stays honest when one run spans embedded and sidecar routes.
- Use `pnpm --filter @unemployed/desktop ui:resume-import` to run a scripted resume-import flow that bypasses the native picker through a test-only preload bridge, reloads the workspace, opens the Experience tab, and saves screenshots plus workspace JSON including `experience-tab-review.json`.
- When running `ui:resume-import` from `apps/desktop`, use repo-relative resume paths like `../../docs/resume-tests/...`; from the repo root, use `./docs/resume-tests/...`.
- Use `pnpm --filter @unemployed/desktop ui:profile-baseline` to hydrate the preferred imported-profile snapshot and capture the current visual baseline for the shell plus every Profile subtab before larger UI refactors, including scroll-slice coverage for long surfaces.
- Use `pnpm --filter @unemployed/desktop ui:profile-setup` to validate the guided-setup route, persisted setup-state redirects, import-driven setup review items, draft-aware queue truth during unsaved essentials edits, explicit-save resolution of matching review items such as portfolio URL, nested background `Edit this` reopen behavior, bounded Profile Copilot edits including a years-of-experience change in Essentials, readiness completion, and the post-setup handoff back into the full Profile editor.
- Guided setup and full Profile should keep resume import or refresh disabled while user edits are unsaved, and the guard copy should explain that importing now would overwrite the current draft.
- Use `pnpm --filter @unemployed/desktop ui:profile-copilot-preferences` to validate the full-Profile Preferences copilot flow, including review-gated addition of common job sources like LinkedIn Jobs, Wellfound, and KosovaJob, persisted discovery-target updates in the saved workspace snapshot after explicit apply, bundled multi-edit prompts for work mode and salary alongside source changes when the harness covers them, re-enabling disabled saved sources when requested again, bubble toggle or drag behavior around the save area, proof that the composer remains editable while a reply is pending, proof that unsaved full-Profile edits block copilot send/apply/reject/undo mutations until save, the compact Show/Hide recent-changes tray behavior, and markdown-like transcript rendering for assistant headings, bullets, inline code, blockquotes, and fenced code.
- Use `pnpm --filter @unemployed/desktop ui:applications-copilot-review` to validate the richer Applications apply-copilot detail surface; it reuses the seeded resume-workspace demo, approves the tailored PDF, launches apply copilot from Shortlisted, then captures the Applications panel once raw persisted review details have loaded and writes `apply-run-details.json` plus `workspace-after-review.json` under `apps/desktop/test-artifacts/ui/<label>/`.
- Use `pnpm --filter @unemployed/desktop ui:applications-recovery` to validate the Applications recovery surface; it reuses the seeded resume-workspace demo, starts a safe copilot run, restages a safe auto run from Applications, selects an older run from run history, then reruns the safe copilot path and writes `workspace-initial.json`, `workspace-after-auto-restage.json`, `workspace-after-copilot-rerun.json`, `rerun-review-data.json`, and `run-history-summary.json` under `apps/desktop/test-artifacts/ui/<label>/`.
- Use `pnpm --filter @unemployed/desktop ui:applications-queue-recovery` to validate the Applications queue recovery surface; it stages a deterministic safe queue, records a skipped-job source run, then proves Applications can show which jobs will be restaged versus excluded, render a richer per-job queue outcome summary, and restage only the remaining or skipped jobs from that historical queue into a fresh safe queue run while preserving `source-workspace.json`, `recovered-workspace.json`, and `queue-recovery-summary.json` under `apps/desktop/test-artifacts/ui/<label>/`.
- Use `pnpm --filter @unemployed/desktop ui:apply-queue-controls` to validate the staged queue-control surface; it hydrates a deterministic approved-resume demo with two queue-eligible jobs plus one blocked job, uses the Shortlisted multi-select checkboxes to stage a queue run, then captures Applications evidence in `queue-consent-paused.json`, `queue-consent-approved-workspace.json`, `queue-consent-declined-workspace.json`, and `queue-cancelled-run.json` under `apps/desktop/test-artifacts/ui/<label>/`.
- For floating-copilot layout work, include at least one reduced viewport pass such as `1024x768` so the open rail proves header, transcript, composer, and actions remain reachable instead of slipping under the viewport edge.
- Resume-workspace changes should also ship with a dedicated capture flow that can open Review Queue, enter `/job-finder/review-queue/:jobId/resume`, trigger or verify resume generation, perform at least one manual edit, send at least one assistant request, export and approve the resume, and capture the resulting UI states.
- Use `pnpm --filter @unemployed/desktop ui:resume-workspace` for the current scripted demo of the complete resume flow; it forces the deterministic catalog runtime, hydrates a reviewable demo workspace through the test-only preload bridge, and writes screenshots plus `workspace-after-demo.json` under `apps/desktop/test-artifacts/ui/resume-workspace/`.
- The scripted resume-workspace harness should stay independent from live provider availability: if local AI credentials exist, the capture flow must still use the deterministic desktop test runtime so assistant and generation steps remain stable and repeatable.
- The resume-workspace capture should now also verify richer grounding UX: company-site targeting appears in Review Queue and the workspace shows structured job context plus saved research coverage.
- Use `pnpm --filter @unemployed/desktop ui:resume-workspace-dirty` when dirty-state protections change; it proves save-before-action or confirm-before-leave behavior for refresh, assistant requests, clear approval, shell navigation, and back navigation, and writes JSON assertions under `apps/desktop/test-artifacts/ui/resume-workspace-dirty/`.
- When apply-safety logic changes, pair the desktop capture flows with targeted service tests for stale approvals and missing-approved-file rejection because the happy-path demo still will not exercise every guarded failure state by itself.
- The capture script builds the desktop app first, launches Electron through Playwright, waits for the seeded Job Finder workspace to load, clicks through the current MVP screens, and saves screenshots for visual review.
- The resume-import capture defaults to `Resume.pdf` at the repo root; override with CLI flags like `--resume`, `--expected-name`, `--expected-headline`, `--expected-location`, `--expected-summary-contains`, and `--label`, or use the matching `UI_TEST_*` environment variables when validating other files.
- Recommended deterministic import check for the current `018` + `019` pipeline: `pnpm --filter @unemployed/desktop ui:resume-import -- --resume ./test-fixtures/job-finder/resume-import-sample.txt --expected-name "Jamie Rivers" --expected-location "Berlin, Germany" --label resume-import-fixture`.
- Current hard-PDF QA checkpoints after the latest `019` repair slice: `pnpm --filter @unemployed/desktop ui:resume-import -- --resume "../../docs/resume-tests/Aaron Murphy Resume.pdf" --label quality-aaron` and `pnpm --filter @unemployed/desktop ui:resume-import -- --resume "../../docs/resume-tests/Ryan Holstien Resume.pdf" --label quality-ryan` when invoked from `apps/desktop`.
- The deterministic scripted import harness should currently treat headline and summary as review-first fields unless the workflow policy explicitly changes; do not assume the canary TXT fixture auto-applies them.
- The profile-baseline capture now requires an explicit snapshot path. The old default snapshot-path fallback was removed, so pass `--snapshot <path>` or set `UI_PROFILE_BASELINE_SNAPSHOT` to the workspace snapshot you want to use for screenshots.
- Migration example: `pnpm --filter @unemployed/desktop exec node ./scripts/capture-profile-baseline.mjs --snapshot ./test-fixtures/job-finder/profile-baseline-workspace.json`.
- Current committed baseline fixture for shared-profile QA: `apps/desktop/test-fixtures/job-finder/profile-baseline-workspace.json`.
- The current default capture size is `1440x920`.
- The current standard multi-size review pass covers `1728x1080`, `1440x920`, `1280x800`, and `1024x768`.
- Override capture size with environment variables when needed, for example: `UI_CAPTURE_WIDTH=1280 UI_CAPTURE_HEIGHT=800 UI_CAPTURE_LABEL=1280x800 pnpm --filter @unemployed/desktop exec node ./scripts/capture-ui.mjs`.
- Captures are written to `apps/desktop/test-artifacts/ui/<label>/`.
- The script uses a temporary user-data directory on each run so screenshots start from a clean seeded state instead of inheriting an old local workspace.
- Capture artifacts are validation output only and should not be committed.
- Current `011` shared-data validation artifacts land under `apps/desktop/test-artifacts/ui/profile-visual-baseline-<date>/` and `apps/desktop/test-artifacts/ui/resume-workspace/` when the standard profile-baseline and resume-workspace harnesses run successfully.

## Testing Model

- Unit tests for pure logic
- Contract tests for schemas and public package interfaces
- Integration tests for adapter boundaries
- Electron UI capture runs for desktop boot, screen navigation, and screenshot-based review of the current shell
- Electron UI capture runs now include a scripted resume-import path so agents can validate extracted profile state against real files instead of seeded data only
- Broader end-to-end tests later for browser runtime, job discovery, and live interview flows

## Foundation Expectations

- Fixtures must be deterministic
- Fake providers should replace real model/browser dependencies in tests
- Repo checks must fail on doc drift and adapter drift, not just code failures
- UI capture artifacts should be treated as validation outputs, not committed source files
