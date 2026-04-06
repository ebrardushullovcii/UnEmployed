# Status

## Current Phase

Plan `007` implementation and hardening remain active. Plan `010` browser-efficiency work is now in progress as a focused measurement and idle-gap reduction slice across discovery and source-debug. Plan `008` remains the next queued follow-on implementation plan, but it has now been re-authored as a staged apply evolution: shared apply domains, one-job apply copilot, one-job auto-submit, then queue automation. Plan `015` is now the next queued shared-data follow-on after `008`, focused on expanding reusable narrative, answer, blocker, and enriched job context without forking the storage model. Plan `009` completed as the current shipped wording baseline after stronger rewrite and later structural polish passes.

## Snapshot

- The desktop shell is stable around typed Electron main, preload, and renderer boundaries.
- `Job Finder` persists local state in SQLite and supports profile editing, saved jobs, discovery history, tailored resume workflows, application records, and tracked apply attempts.
- Resume ingestion supports `txt`, `md`, `pdf`, and `docx`, with model-backed extraction plus deterministic fallback.
- The deterministic catalog path now keeps seeded browser session primitives in `packages/browser-runtime` while `packages/browser-agent` owns the catalog workflow policy layered on top of those primitives.
- Plans `003`, `004`, and `005` are no longer the active focus and now serve mainly as completed implementation background.
- Plan `007` remains an active implementation plan; the `Resume Workspace` works in a bare-bones form and is being tightened into a more reliable usable slice.
- Plan `008` now has a concrete staged exec plan that keeps true auto-submit as the end state, but intentionally starts with stronger apply data plus a one-job apply-copilot step before queue automation; current shipped apply behavior remains more conservative until that work lands.
- Plan `010` is now active for a measurement-first pass that adds live wait-state visibility, retained timing summaries, a test-only performance snapshot, and initial browser-speed tightening across discovery and debugging.
- The current `010` tightening pass now also budgets discovery across the remaining targets, removes serial model-backed fit scoring from discovery merge, narrows discovery-hot-path SQLite reads and writes, flushes queued search-results extraction earlier when the agent stalls, and stops cold discovery sources earlier after repeated zero-yield extraction passes.
- The current `010` source-debug tightening pass now also reuses same-host learned route hints as transient later-phase starting URLs, prefers current-run hints over stale cleared guidance once new routes are learned, records the actual phase starting URL in evidence, and favors collection-first probe routing when no proven search route exists.
- The current `010` source-debug tightening pass now also ignores malformed wildcard/template route hints when deriving phase starting URLs and blocks repeated evidence-recording click/fill misses across common name variants so source-debug phases stop burning turns on the same failed interaction.
- The current `010` source-debug tightening pass now also forces early closeout for phase-driven browser runs once evidence has stalled after enough proof is already collected, so phases do not spend nearly their full step budget waiting for a late `finish` call.
- Plan `009` completed a stronger shipped-surface product rewrite across Job Finder and the shared shell, including clearer top-nav labels (`Find jobs`, `Shortlisted`, `Applications`), removal of low-value internal fields, and capture-script alignment for the updated headings.
- Later follow-on polish on top of that baseline added a checklist-style readiness panel in `Shortlisted`, action-oriented filters in `Applications`, a more consolidated two-column `Settings` page, and optional-detail sections in `Profile` so the main editing path stays more focused.
- The latest hardening pass tightened `Shortlisted` truthfulness by separating resume/browser readiness from supported apply-path readiness, synced `Applications` filtered selection back to controller state, and fixed the resume-import harness heading selector for strict-mode Playwright runs.
- Plan `008` now directly absorbs the comparative-review findings: richer answer and blocker domains, stronger provider and source-debug intelligence inputs, a one-job apply-copilot milestone before broad auto-submit, and the explicit rule that provider APIs may improve question modeling but are not a universal direct-submit path without employer credentials.
- Older milestone detail lives in `docs/HISTORY.md`.

## Active Work

- Finish the current bare-bones but working `Resume Workspace` flow under plan `007`.
- Improve resume composition quality and assistant edit reliability.
- Re-run targeted desktop QA around export, approval, and apply safety.
- Keep browser-agent ownership clear: prompts, transcript compaction, tool policy, and deterministic catalog workflow policy belong there, while runtime stays generic.
- Measure and reduce browser-heavy silent idle time under plan `010`, with named waiting states for discovery and source-debug plus the first low-risk runtime tightening wins.
- Keep the queued `008` automatic-apply follow-on defined and ready, but do not start it until `007` settles.
- Treat the completed `009` pass as the current wording and product-language baseline for later UX polish and QA, including the newer structural cleanups layered on top of it.

## Immediate Next Steps

- Close the remaining `007` functional gaps and rough edges.
- Re-run the resume-workspace harnesses and targeted service checks.
- Continue the active `010` slice by running representative discovery and source-debug benchmarks, inspecting the retained timing snapshot, and using those measurements to tighten browser-heavy behavior further.
- Re-run LinkedIn discovery first on the new build, then compare the retained timing snapshot against Wellfound and Kosovajob to confirm whether the new cold-source stop removes most of the long tail or whether search-results extraction timeouts are now the dominant remaining bucket.
- Re-run LinkedIn source-debug on the new build to confirm that collection-first later-phase routing trims the remaining zero-yield phase cost and reduces the quiet gap after the earlier runtime drop.
- Re-run LinkedIn source-debug on the new build to confirm that malformed route hints no longer seed bad starting URLs and repeated search/card evidence failures stop consuming phase budget.
- Re-run LinkedIn source-debug on the new build to confirm that phase-driven closeout now lands far earlier than the old max-step timeout path and cuts whole minutes, not just seconds.
- Once `007` settles, start `008` from `docs/exec-plans/queued/008-job-finder-automatic-job-apply.md`, with `009` completed as background. Plan `008` now defines a staged evolution: stronger apply data and artifacts first, then one-job apply copilot, then one-job auto-submit, then queue submission.

## Key References

- `docs/TRACKS.md`
- `docs/exec-plans/active/007-job-finder-resume-workspace.md`
- `docs/exec-plans/active/010-job-finder-browser-efficiency-and-speed.md`
- `docs/exec-plans/queued/008-job-finder-automatic-job-apply.md`
- `docs/exec-plans/queued/015-job-finder-shared-data-expansion.md`
- `docs/exec-plans/completed/009-full-app-production-copy-pass.md`
- `docs/HISTORY.md`
