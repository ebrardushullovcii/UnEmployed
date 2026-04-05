# Status

## Current Phase

Plan `007` implementation and hardening. Plan `008` remains the next queued follow-on slice, plan `009` is complete as the current shipped wording baseline after a stronger second-pass product rewrite, and plan `010` remains queued after that.

## Snapshot

- The desktop shell is stable around typed Electron main, preload, and renderer boundaries.
- `Job Finder` persists local state in SQLite and supports profile editing, saved jobs, discovery history, tailored resume workflows, application records, and tracked apply attempts.
- Resume ingestion supports `txt`, `md`, `pdf`, and `docx`, with model-backed extraction plus deterministic fallback.
- The deterministic catalog path now keeps seeded browser session primitives in `packages/browser-runtime` while `packages/browser-agent` owns the catalog workflow policy layered on top of those primitives.
- Plans `003`, `004`, and `005` are no longer the active focus and now serve mainly as completed implementation background.
- Plan `007` is still the only active implementation plan; the `Resume Workspace` works in a bare-bones form and is being tightened into a more reliable usable slice.
- Plan `008` now has a concrete exec plan and intentionally defines a more autonomous future apply direction, but current shipped apply behavior remains more conservative until that work lands.
- The queued order after `007` is `008` automatic job apply, then `010` under `docs/exec-plans/queued/010-job-finder-browser-efficiency-and-speed.md` for browser efficiency and speed improvements across discovery and debugging.
- Plan `009` completed a stronger shipped-surface product rewrite across Job Finder and the shared shell, including clearer top-nav labels (`Find Jobs`, `Shortlisted`, `Applied`), removal of low-value internal fields, and capture-script alignment for the updated headings.
- Older milestone detail lives in `docs/HISTORY.md`.

## Active Work

- Finish the current bare-bones but working `Resume Workspace` flow under plan `007`.
- Improve resume composition quality and assistant edit reliability.
- Re-run targeted desktop QA around export, approval, and apply safety.
- Keep browser-agent ownership clear: prompts, transcript compaction, tool policy, and deterministic catalog workflow policy belong there, while runtime stays generic.
- Keep the queued `008` automatic-apply follow-on defined and ready, but do not start it until `007` settles.
- Treat the completed `009` pass as the current wording and product-language baseline for later UX polish and QA.

## Immediate Next Steps

- Close the remaining `007` functional gaps and rough edges.
- Re-run the resume-workspace harnesses and targeted service checks.
- Once `007` settles, start `008` from `docs/exec-plans/queued/008-job-finder-automatic-job-apply.md`, then keep `010` queued behind it while `009` remains completed background.

## Key References

- `docs/TRACKS.md`
- `docs/exec-plans/active/007-job-finder-resume-workspace.md`
- `docs/exec-plans/queued/008-job-finder-automatic-job-apply.md`
- `docs/exec-plans/completed/009-full-app-production-copy-pass.md`
- `docs/exec-plans/queued/010-job-finder-browser-efficiency-and-speed.md`
- `docs/HISTORY.md`
