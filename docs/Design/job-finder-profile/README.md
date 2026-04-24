# Job Finder Profile References

Use this directory for profile-screen visual references only. The Job Finder profile captures candidate preferences and reusable application material; see `docs/PRODUCT.md` and `docs/ARCHITECTURE.md` for the durable product and architecture baseline.

## Retention Policy

- Keep active reference material small and easy to scan.
- Consolidate superseded baseline metadata into this README when a separate historical note no longer needs to stay as its own file.
- Keep a historical baseline only when it still helps screenshot comparison or regression review.
- Delete stale artifacts when they no longer help active design or regression work.

## Historical Baselines

### 2026-03-23 Profile Shell Baseline

- context: captured during `codex/profile-resume-polish` before later setup, resume, and profile work changed the active profile shell baseline
- branch at capture time: `codex/profile-resume-polish`
- artifact folder: `apps/desktop/test-artifacts/ui/profile-visual-baseline-2026-03-23/`
- artifact availability: historical comparison only; use current desktop UI harness outputs for fresh baseline captures
- viewport: `1440x920`
- rerun command at capture time: `pnpm --filter @unemployed/desktop ui:profile-baseline`
- note: retained only as historical comparison metadata, not as an active design brief
