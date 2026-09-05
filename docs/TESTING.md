# Testing

## Pick the smallest check

| Change                                             | Run                                                                                                        |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| package-local code                                 | `pnpm validate:package <alias>` (`desktop`, `job-finder`, `browser-agent`, `browser-runtime`, `contracts`) |
| contracts or IPC                                   | `pnpm validate:contracts` plus typecheck of affected packages                                              |
| discovery or source-debug                          | `pnpm source-generic:check` plus focused package tests                                                     |
| desktop UI                                         | `pnpm validate:desktop` plus the matching `ui:*` harness from `apps/desktop/package.json`                  |
| broad cross-package behavior                       | `pnpm verify:affected`                                                                                     |
| release candidate, only when the user declares one | `pnpm verify`, then `pnpm test:evidence` (ADR 0014)                                                        |

Other entry points: `pnpm test:correctness`, `pnpm test:performance` (serial, no coverage, by design), `pnpm test:coverage`, `pnpm format`, `pnpm knip`, `pnpm structure:check`.

## Stop rules

- Never stop a process you did not start. Stop only the Electron instance you launched, through its own handle or PID tree, and report survivors instead of sweeping. Pattern kills (`pkill -f electron`, `killall Electron`) hit the user's own dev instance and every other Electron app.
- Do not rerun a broad failing command unchanged; isolate the failing package or command first.
- If a failure is pre-existing and unrelated, report it once and switch to focused validation.
- Builds and full suites heat the laptop. Batch related fixes and build once per batch.

## Testing the built app

- Build first: `pnpm --filter @unemployed/desktop build`. Scripts that launch `out/main/index.cjs` run whatever was last built.
- Use a temporary user-data directory and synthetic data (`apps/desktop/test-fixtures/job-finder/resume-import-sample.txt`), never the user's real workspace. `docs/resume-tests/` includes personal resumes; it is not a synthetic fixture source.
- Serialize isolated Electron launches; audit for leftover processes you own before launching another.
- Harness commands live in `apps/desktop/package.json` (`ui:*`, `test:job-finder-*`, `test:interview-helper-*`). `:built` variants use the existing build; the others rebuild.
- For an isolated production import without a native picker: `node apps/desktop/scripts/seed-product-quality-audit.mjs --user-data-dir <dir> --resume <synthetic-resume>`.

## Safety rules

- Never run live-site final-submit flows. Every apply harness keeps `submitAuthorized: false` and `accountCreationAuthorized: false` and fails if any attempt, job, or application record reaches `submitted`.
- Live prepare-only runs use a temporary user-data directory, a fake profile, and an approved deterministic resume. Anonymous Workday must stop at the account gate with a `site_login_required` handoff; never attempt credentials.
- Interview Helper harnesses default to deterministic providers with AI credentials blanked. Live providers require `UI_INTERVIEW_HELPER_PROVIDER_MODE=configured` (see `docs/AI_PROVIDER_SETUP.md`).
- Never add personal resumes, live workspaces, credentials, or authenticated browser state to benchmark corpora.
- Fixtures must not seed approved resume exports through `upsertResumeExportArtifact({ isApproved: true })`; both repositories reject it. Use the repository seed or `approveResumeExport()`. The guard is the invariant under test.

## Fit calibration gate

- `pnpm job-finder:fit-calibration` (also in `pnpm verify`) compares against the single baseline `packages/job-finder/test-fixtures/fit-calibration-baseline-v9.json`. It fails on the quality gates and on any `schemaVersion`, `corpusVersion`, or `scorerVersion` drift between run and baseline.
- Bumping `MATCH_ASSESSMENT_SCORER_VERSION` is expected to fail the gate until the baseline is regenerated. Read the case diff first, then run `node scripts/run-fit-calibration-benchmark.cjs --output <new-baseline>` and rename the baseline file plus both `package.json` references together so exactly one baseline exists. `--report-only` never fails and is not a gate.

## Benchmarks

- Resume import: `pnpm --filter @unemployed/desktop benchmark:resume-import`
- Resume quality: `pnpm --filter @unemployed/desktop benchmark:resume-quality` (`-- --canary-only` for the canary)
- AI capabilities: `pnpm ai:benchmark plan | full <lane> | canary luna_high | full-report`. Keep each lane serial. Deterministic fallbacks are reported separately and never credited to the model.
- Live discovery audit: `pnpm --filter @unemployed/desktop audit:job-finder-live` needs network access and must never execute application actions.
