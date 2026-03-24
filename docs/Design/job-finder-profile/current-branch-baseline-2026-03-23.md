# Current Branch Baseline (2026-03-23)

This note documents the current `codex/profile-resume-polish` visual baseline before the larger renderer refactor is merged in.

## Why this exists

- Preserve the current polished Profile layout and shell spacing as a regression reference.
- Keep a concrete screenshot set for the top-level Job Finder tabs and every Profile subtab.
- Make it easy to rerun the same capture flow later and compare before/after the refactor.

## Capture source

- Branch at capture time: `codex/profile-resume-polish`
- HEAD at capture time: `b0dce83`
- Preferred imported-profile snapshot: `apps/desktop/test-artifacts/ui/resume-pdf-polish-v4/workspace-after-reload.json`
- Capture output folder: `apps/desktop/test-artifacts/ui/profile-visual-baseline-2026-03-23/`
- Capture report: `apps/desktop/test-artifacts/ui/profile-visual-baseline-2026-03-23/capture-report.json`
- Viewport: `1440x920`

## What the capture includes

- Top-level shell tabs at the current polished branch state:
  - `Profile`
  - `Discovery`
  - `Review Queue`
  - `Applications`
  - `Settings`
- Profile subtabs with the preferred imported-profile state hydrated before capture:
  - `Resume`
  - `Core Profile`
  - `Experience`
  - `Background`
  - `Preferences`
- For each Profile subtab, the artifact set includes:
  - one top-of-page screenshot
  - one full-page screenshot
  - one sequential scroll series so every visible field state is documented in viewport-sized slices

## Artifact layout

- Top-level shell screenshots: `apps/desktop/test-artifacts/ui/profile-visual-baseline-2026-03-23/top-tabs/`
- Profile tab screenshots: `apps/desktop/test-artifacts/ui/profile-visual-baseline-2026-03-23/profile-tabs/`
- Long screens now also include sequential viewport scroll slices so internal app scrolling is fully documented instead of relying only on single-frame captures.

File naming is intentionally direct:

- top tabs: `<screen>-top.png`, `<screen>-full.png`
- profile tabs: `<tab>-top.png`, `<tab>-full.png`, `<tab>-scroll-01.png`, `<tab>-scroll-02.png`, ...

## Important context

- The shell still starts from the clean seeded Job Finder workspace.
- The capture flow then hydrates `profile`, `searchPreferences`, and `settings` from the imported-profile snapshot so the saved Profile polish is what gets documented.
- The screenshot artifacts are local validation output and should stay uncommitted.

## Rerun command

```bash
pnpm --filter @unemployed/desktop ui:profile-baseline
```

Optional overrides:

- `UI_CAPTURE_LABEL=<label>` or `--label <label>` to save into a new artifact folder
- `UI_PROFILE_BASELINE_SNAPSHOT=<path>` or `--snapshot <path>` to drive the capture from another saved workspace snapshot
