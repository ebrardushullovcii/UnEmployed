# Testing

## Required Commands

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm agents:check`
- `pnpm docs:check`

## UI Validation Commands

- `pnpm --filter @unemployed/desktop build`
- `pnpm desktop:dev`
- `pnpm --filter @unemployed/desktop ui:capture`
- `pnpm --filter @unemployed/desktop ui:resume-import`
- `pnpm --filter @unemployed/desktop ui:profile-baseline`

## Live Agent Config

- `UNEMPLOYED_AI_API_KEY` enables the OpenAI-compatible provider path used for resume extraction and resume tailoring.
- The desktop app now auto-loads root or `apps/desktop` `.env` / `.env.local` files before creating the AI client, so local FelidaeAI credentials do not need to be exported manually every time.
- `UNEMPLOYED_AI_BASE_URL` and `UNEMPLOYED_AI_MODEL` are optional overrides; the current defaults target the FelidaeAI OpenAI-compatible endpoint shared by the user.
- `UNEMPLOYED_BROWSER_AGENT=0` switches Job Finder back from the dedicated Chrome-profile browser agent to the deterministic catalog adapter; when unset, desktop builds now use the browser agent by default.
- `UNEMPLOYED_CHROME_PATH` optionally points the agent to a specific local Chrome install.
- `UNEMPLOYED_CHROME_DEBUG_PORT` optionally overrides the dedicated Chrome remote-debugging port; default is `9333`.
- Tests and CI should continue to rely on deterministic providers and fixtures unless a task explicitly calls for live-agent QA.
- Resume-import QA should cover at least one plain-text input path plus one extracted-document path (`pdf` or `docx`) when the ingestion layer changes.

## Desktop UI Capture Workflow

- Install workspace dependencies first with `pnpm install` so the desktop app and `playwright` are available locally.
- Use `pnpm --filter @unemployed/desktop ui:capture` for the default desktop review pass.
- Use `pnpm --filter @unemployed/desktop ui:resume-import` to run a scripted resume-import flow that bypasses the native picker through a test-only preload bridge, reloads the workspace, and saves screenshots plus workspace JSON.
- Use `pnpm --filter @unemployed/desktop ui:profile-baseline` to hydrate the preferred imported-profile snapshot and capture the current visual baseline for the shell plus every Profile subtab before larger UI refactors, including scroll-slice coverage for long surfaces.
- The capture script builds the desktop app first, launches Electron through Playwright, waits for the seeded Job Finder workspace to load, clicks through the current MVP screens, and saves screenshots for visual review.
- The resume-import capture defaults to `Resume.pdf` at the repo root; override with CLI flags like `--resume`, `--expected-name`, `--expected-headline`, `--expected-location`, `--expected-summary-contains`, and `--label`, or use the matching `UI_TEST_*` environment variables when validating other files.
- The profile-baseline capture defaults to `apps/desktop/test-artifacts/ui/resume-pdf-polish-v4/workspace-after-reload.json`; override with `--snapshot` or `UI_PROFILE_BASELINE_SNAPSHOT` when another imported-profile snapshot should drive the screenshots.
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
