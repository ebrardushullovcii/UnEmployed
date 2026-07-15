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

## Structure Checks

- `pnpm structure:check` for large-file and hotspot warnings
- `pnpm hotspots` for the biggest files and concentration areas

## Source-Generic Discovery Guard

- `pnpm source-generic:check` rejects source-branded helper declarations in shared discovery/browser-agent workflow code
- focused coverage includes `packages/browser-agent/src/agent/search-results-budget.test.ts`

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

## Running Desktop Benchmarks

- Run from the repo root: `pnpm --filter @unemployed/desktop build`
- Do this before desktop benchmark scripts or benchmark-backed source/debug checks because `apps/desktop/scripts/benchmark-job-finder-app.mjs` launches `out/main/index.cjs`, and stale build output can invalidate results
- Historical benchmark detail is no longer kept as plan docs; use current benchmark reports under `apps/desktop/test-artifacts/ui/` and git history when old run detail is needed.
- `pnpm --filter @unemployed/desktop audit:job-finder-live` compares the built app's discovery results with the current full Remote/Greenhouse and Aircall/Lever provider inventories using `docs/resume-tests/Ebrar.pdf`. It runs in a temporary user-data directory with discovery-only, original-CV, review-before-submit safety settings and writes `apps/desktop/test-artifacts/job-finder/live-discovery-audit/live-discovery-audit-report.json` plus a rendered `evidence-ledger.png`; it requires network access and must never be changed to execute application actions.

## Safety Rules

- do not run live-site submit flows or final-submit QA unless the user explicitly re-authorizes it
- validate apply work with deterministic contracts, service tests, and desktop harnesses by default
- The live prepare-only harness must use a temporary user-data directory and fake profile, approve a current deterministic resume before apply, and fail if any attempt, job, or application record reaches `submitted`. Source URL, label, roles, exact-job enforcement, and intermediate-write authorization are configurable through `JOB_FINDER_PREPARE_ONLY_*` environment variables. Intermediate writes require the dedicated flag and desktop test API; final submit remains false and DOM submission stays guarded.
- `test:job-finder-complete-flow` is the Greenhouse live acceptance gate for the original-CV journey. It queries the configured public board for a current matching vacancy, imports `test-fixtures/job-finder/resume-import-sample.txt` through the real extraction boundary, rediscovers the exact listing, shortlists it, verifies the imported CV remains unchanged, fills the application, and requires the final pre-submit checkpoint.
- `test:job-finder-ashby-flow` runs the same original-CV safety journey against a dynamically selected current Ashby vacancy. `test:job-finder-workday-flow` uses an exact Workday candidate-experience listing and, when run anonymously, requires the expected `site_login_required` human handoff instead of treating sign-in as a failure or attempting credentials.
- `test:job-finder-ats-matrix` builds once and runs the current Greenhouse, Ashby, and Workday cases. Every underlying harness keeps final-submit authorization false and fails if any submitted state appears.
- Current accepted reports live under `apps/desktop/test-artifacts/job-finder/complete-flow-current-{greenhouse,ashby,workday}/prepare-only-smoke-report.json`. Greenhouse and Ashby must reach a named final control with the unchanged resume upload verified and explicitly not clicked; anonymous Workday must stop at the account gate with `submittedNeverOccurred: true`.
- `ui:source-sign-in-prompts` captures desktop and narrow evidence for source configuration plus the browser-owned `I'm signed in — retry` handoff. The harness must prove that the UI says credentials are never handled and retries only after explicit user confirmation.
- The original-CV desktop harness persists the setting through the real UI, verifies Review Queue shows the imported filename and extracted text without a tailored-generation action, requires the visible primary `Start apply copilot` action, and writes screenshots plus `summary.json` under `apps/desktop/test-artifacts/ui/original-cv-flow/`.
- capture artifacts under `apps/desktop/test-artifacts/ui/`; they are QA output, not source files
- The default Interview Helper harness must prove that starting an interview opens two visible popup windows (answer and transcript), while the main-window conversation, popup typed sends, temporary pasted/selected image attachments, explicit screen-context capture, copy controls, no retained raw image bytes, source-labeled transcript, and configured local STT readiness continue to work. Visible popup acceptance also requires real pointer drags, native edge resizing, hide/reopen from both popup and main controls, preservation of an in-progress draft during a workspace event, and an end/restart cycle restoring the exact saved bounds. `ui:interview-helper-popups` is the automated visual/interaction gate; Computer Use supplies native-window acceptance.
- `test:interview-helper-audio:built` must exercise renderer recording, typed IPC, FFmpeg, and local Whisper for both microphone and Windows meeting/system-audio sources. The standalone local-command smoke test should use synthesized speech when diagnosing machine configuration.
- `test:interview-helper-live-system-audio` is the Windows real-loopback acceptance gate. Start audible media first, optionally set `INTERVIEW_HELPER_LIVE_AUDIO_SOURCE_URL` for report attribution, and require a multi-word meeting-audio transcript, microphone-disabled consent, visible answer/transcript popups, grounded cue/chat with an image attachment, pause/resume, end/review/export, and no retained raw audio/image bytes. Evidence is written under `apps/desktop/test-artifacts/interview-helper/live-system-audio-podcast/`.
- Local STT quality should be evaluated with real speech as well as synthesized smoke audio. On the current host, `ggml-base.en` produced a coherent 18-word live sample in about 9.3 seconds end to end; `tiny.en` was faster but materially less accurate and is not the preferred quality baseline.
- The deeper overlay/protection harnesses remain separate evidence for capture exclusion, layout persistence, interaction mode, and panic-hide; ordinary popup visibility is now part of the default acceptance path.
- Interview Helper provider changes should include `pnpm validate:package ai-providers`; model-backed cue tests must prove schema validation, bounded transcript payloads rather than raw transcript blobs, one retry before deterministic fallback on provider failure, and service-level quiet fallback cards when generated cue output fails validation. Screenshot vision tests must prove transient screenshot image payloads cross the provider boundary and only normalized observations are retained. Audio transcription tests must prove transient audio chunks are sent through the provider boundary and raw audio is not retained in the Interview Helper workspace; local-command STT tests must also prove temporary audio files are cleaned up.
- validate browser visual evidence changes with contract guard tests, source-generic checks, focused browser-agent/browser-runtime/job-finder tests, and desktop Applications recovery UI evidence when apply surfaces change

Track-specific validation and product-bar requirements live in the handoff layer: `docs/STATUS.md`, `docs/TRACKS.md`, and the active plan under `docs/exec-plans/active/`.

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
- required case/template results fail the command when canonical work-history representation, fragment-free included bullets, professional experience-summary, grounded skill, keyword, page-target, or ATS render rates fall below `1.0`; conservative tailoring may represent an intentionally hidden role through explicit editor/review guidance, while balanced and aggressive modes require visible representation
- `date_quality` and `work_history_review` remain diagnostic categories when the rendered output is correct but imported source evidence still requires human confirmation
