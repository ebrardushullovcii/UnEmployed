# Testing

## Baseline Repo Checks

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm structure:check`

## Guidance Validation

- Run `pnpm agents:sync` after changing repo-wide guidance, registry entries, or project-local skills.
- Run `pnpm agents:check` after changing generated adapter sources, registry entries, required package guides, or project-local skills.
- Run `pnpm docs:check` after changing canonical docs, root guidance, or internal markdown links.

## Structure Checks

- `pnpm structure:check` reports oversized source files and concentration hotspots in warn-only mode.
- Current warning budgets: general source files at `800` lines, desktop renderer components at `400` lines, and package entrypoints at `200` lines unless they are mostly barrel exports.
- Current future hard-fail threshold is `1200` lines for a single source file; keep new work comfortably below it instead of treating that number as a target.
- Use `pnpm hotspots` when you want a quick ranking of the largest files and most concentrated workspaces before starting a larger refactor.

## UI Validation Commands

- `pnpm --filter @unemployed/desktop build`
- `pnpm desktop:dev`
- `pnpm --filter @unemployed/desktop ui:capture`
- `pnpm --filter @unemployed/desktop ui:resume-import`
- `pnpm --filter @unemployed/desktop ui:profile-baseline`
- `pnpm --filter @unemployed/desktop ui:resume-workspace`
- `pnpm --filter @unemployed/desktop ui:resume-workspace-dirty`

## Appearance QA

- Validate both resolved dark and resolved light output whenever renderer theme tokens, shared primitives, or desktop shell surfaces change.
- Confirm that `Settings -> Appearance` persists `System`, `Light`, and `Dark`, and that `System` follows the current OS preference after reload.
- Check the highest-risk contrast surfaces in both themes: page headers, muted helper text, field placeholders, focus borders, panel borders, status badges, status banners, progress tracks, modal scrims, and scrollbars.
- Confirm the app applies the saved appearance before the workspace snapshot resolves so startup does not flash dark when the resolved theme should be light.

## Resume Workspace Demo Standard

- Treat the resume-workspace feature as incomplete until the desktop UI has been exercised through a real scripted or manual run that proves generation, editing, assistant changes, export, approval, and apply gating.
- Prefer a repeatable Playwright or Electron capture harness over one-off manual clicking whenever the flow changes.
- Save screenshot artifacts and any supporting JSON snapshots under `apps/desktop/test-artifacts/ui/` during validation runs; treat them as QA evidence, not committed source files.
- Resume-workspace safety changes should also prove the non-happy paths they touch, especially stale-after-edit behavior, upstream-change staleness, unsaved-edit navigation guards, and missing-approved-file apply refusal.
- When the workflow expands, update this file and the relevant active or queued exec plan in the same task so later agents inherit the exact demo path instead of rediscovering it from chat context.

## Source-Debug QA

- Validate that Profile Preferences keeps `Debug source` disabled until a target has a valid absolute starting URL.
- Validate that Discovery can open the dedicated Chrome profile even before any prior browser-profile session has been recorded.
- Validate that source-debug completion copy matches the actual retained run state for `paused_manual`, `cancelled`, `failed`, and `interrupted` runs.
- Ensure the Profile source-debug review modal traps focus while open, announces loading and error states clearly, and that inline learned-instruction edits only mutate the editable instruction fields.
- Confirm that `Verify` replays the selected learned-instruction artifact, leaves the reviewed artifact intact, and promotes or drafts a successor artifact based on the new replay result.

## Live Agent Config

- `UNEMPLOYED_AI_API_KEY` enables the OpenAI-compatible provider path used for resume extraction and resume tailoring.
- The desktop app now auto-loads root or `apps/desktop` `.env` / `.env.local` files before creating the AI client, so local FelidaeAI credentials do not need to be exported manually every time.
- `UNEMPLOYED_AI_BASE_URL` and `UNEMPLOYED_AI_MODEL` are optional overrides; the current defaults target the FelidaeAI OpenAI-compatible endpoint shared by the user.
- `UNEMPLOYED_BROWSER_AGENT=0` switches Job Finder back from the dedicated Chrome-profile browser agent to the deterministic catalog adapter; when unset, desktop builds now use the browser agent by default. The legacy `UNEMPLOYED_LINKEDIN_BROWSER_AGENT` name is still accepted as a fallback when the newer variable is unset.
- `UNEMPLOYED_CHROME_PATH` optionally points the agent to a specific local Chrome install.
- `UNEMPLOYED_CHROME_DEBUG_PORT` optionally overrides the dedicated Chrome remote-debugging port; default is `9333`.
- Tests and CI should continue to rely on deterministic providers and fixtures unless a task explicitly calls for live-agent QA.
- The desktop test API should keep scripted UI harnesses on deterministic AI paths even when local `.env` files enable the live OpenAI-compatible provider for regular manual runs.
- Resume-workspace export now opens the native Save dialog during regular desktop use; keep the desktop test API path deterministic and dialog-free so `ui:resume-workspace` and related harnesses can still export without OS-level picker automation.
- Resume-import QA should cover at least one plain-text input path plus one extracted-document path (`pdf` or `docx`) when the ingestion layer changes.

## Desktop UI Capture Workflow

- Install workspace dependencies first with `pnpm install` so the desktop app and `playwright` are available locally.
- Use `pnpm --filter @unemployed/desktop ui:capture` for the default desktop review pass.
- Use `pnpm --filter @unemployed/desktop ui:resume-import` to run a scripted resume-import flow that bypasses the native picker through a test-only preload bridge, reloads the workspace, and saves screenshots plus workspace JSON.
- Use `pnpm --filter @unemployed/desktop ui:profile-baseline` to hydrate the preferred imported-profile snapshot and capture the current visual baseline for the shell plus every Profile subtab before larger UI refactors, including scroll-slice coverage for long surfaces.
- Resume-workspace changes should also ship with a dedicated capture flow that can open Review Queue, enter `/job-finder/review-queue/:jobId/resume`, trigger or verify resume generation, perform at least one manual edit, send at least one assistant request, export and approve the resume, and capture the resulting UI states.
- Use `pnpm --filter @unemployed/desktop ui:resume-workspace` for the current scripted demo of the complete resume flow; it forces the deterministic catalog runtime, hydrates a reviewable demo workspace through the test-only preload bridge, and writes screenshots plus `workspace-after-demo.json` under `apps/desktop/test-artifacts/ui/resume-workspace/`.
- The scripted resume-workspace harness should stay independent from live provider availability: if local AI credentials exist, the capture flow must still use the deterministic desktop test runtime so assistant and generation steps remain stable and repeatable.
- The resume-workspace capture should now also verify richer grounding UX: company-site targeting appears in Review Queue and the workspace shows structured job context plus saved research coverage.
- Use `pnpm --filter @unemployed/desktop ui:resume-workspace-dirty` when dirty-state protections change; it proves save-before-action or confirm-before-leave behavior for refresh, assistant requests, clear approval, shell navigation, and back navigation, and writes JSON assertions under `apps/desktop/test-artifacts/ui/resume-workspace-dirty/`.
- When apply-safety logic changes, pair the desktop capture flows with targeted service tests for stale approvals and missing-approved-file rejection because the happy-path demo still will not exercise every guarded failure state by itself.
- The capture script builds the desktop app first, launches Electron through Playwright, waits for the seeded Job Finder workspace to load, clicks through the current MVP screens, and saves screenshots for visual review.
- The resume-import capture defaults to `Resume.pdf` at the repo root; override with CLI flags like `--resume`, `--expected-name`, `--expected-headline`, `--expected-location`, `--expected-summary-contains`, and `--label`, or use the matching `UI_TEST_*` environment variables when validating other files.
- The profile-baseline capture requires an explicit snapshot path. Pass `--snapshot <path>` or set `UI_PROFILE_BASELINE_SNAPSHOT` to the workspace snapshot you want to use for screenshots.
- The current default capture size is `1440x920`.
- The current standard multi-size review pass covers `1728x1080`, `1440x920`, `1280x800`, and `1024x768`.
- Override capture size with environment variables when needed, for example: `UI_CAPTURE_WIDTH=1280 UI_CAPTURE_HEIGHT=800 UI_CAPTURE_LABEL=1280x800 pnpm --filter @unemployed/desktop exec node ./scripts/capture-ui.mjs`.
- Captures are written to `apps/desktop/test-artifacts/ui/<label>/`.
- The script uses a temporary user-data directory on each run so screenshots start from a clean seeded state instead of inheriting an old local workspace.
- Capture artifacts are validation output only and should not be committed.

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
