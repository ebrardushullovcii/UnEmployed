# Status

## Current Phase

Plans `007`, `010`, and `011` are now completed, and the queued roadmap is now centered on `012` guided setup plus profile copilot, `013` source intelligence and faster discovery, `014` resume correctness and output quality, `015` staged apply automation, `016` shared agent auto compaction, and `017` browser substrate evaluation and direction. The main product sequence now starts from `012`, while `016` remains a pull-forward infrastructure enabler and `017` remains a later benchmark-and-decision plan.

## Snapshot

- The desktop shell is stable around typed Electron main, preload, and renderer boundaries.
- `Job Finder` persists local state in SQLite and supports profile editing, saved jobs, discovery history, tailored resume workflows, application records, and tracked apply attempts.
- Shared data roots now retain richer candidate narrative, proof-bank, reusable screener answers, application identity defaults, enriched saved-job context, and structured apply-memory summaries instead of forcing later workflows to reconstruct that context repeatedly.
- The queue now needs to optimize for the real user loop, not only for contract dependencies: collect the right profile data, make source intelligence and discovery materially better, make resumes usable, then automate apply.
- Brand-new workspaces still land in the broad `Profile` editor; there is no guided setup route, setup-state model, or profile-side copilot yet.
- Discovery is live, but the shipped surface still behaves like one full agent run across all enabled targets; provider-aware fast paths, one-target execution, stronger seen/applied dedupe, and clearer browser closeout are not the default flow yet.
- Source-debug already retains useful evidence and replay data, but its learned artifacts are still mostly freeform guidance arrays rather than the typed control plane later discovery and apply work want.
- The `Resume Workspace` is the strongest implemented workflow, but the current output quality is still below the release bar because thin section modeling, weak formatting, job-description bleed, and insufficient assistant editability can still produce poor artifacts.
- Apply is still conservative and one-job oriented; it is not yet the staged apply-copilot, auto-submit, and queue system described in plan `015`.
- Resume ingestion supports `txt`, `md`, `pdf`, and `docx`, with model-backed extraction plus deterministic fallback.
- The deterministic catalog path now keeps seeded browser session primitives in `packages/browser-runtime` while `packages/browser-agent` owns the catalog workflow policy layered on top of those primitives.
- Plans `003`, `004`, and `005` are no longer the active focus and now serve mainly as completed implementation background.
- Plan `007` completed with the resume workspace functional and tightened, including review-queue apply gating aligned with approved export reality, checklist-style readiness views, truthful supported-versus-manual apply-path messaging, and handoff clarity for apply safety.
- Plan `015` now has a concrete staged exec plan that keeps true auto-submit as the end state, but it should follow the stronger shared data, setup, source-intelligence, discovery, and resume groundwork now captured in queued plans `011`, `012`, `013`, and `014`.
- Plan `010` completed with measurement-first browser efficiency improvements including named waiting states, retained timing summaries, test-only performance snapshots, dynamic per-target discovery budgets, deterministic merge fit scoring, narrower hot-path SQLite persistence, earlier deferred-extraction flushes, early shutdown for cold discovery sources, source-debug later-phase route reuse, guards against malformed route hints and repeated interaction failures, and early closeout for stalled evidence collection.

- Plan `009` completed a stronger shipped-surface product rewrite across Job Finder and the shared shell, including clearer top-nav labels (`Find jobs`, `Shortlisted`, `Applications`), removal of low-value internal fields, and capture-script alignment for the updated headings.
- Later follow-on polish on top of that baseline added a checklist-style readiness panel in `Shortlisted`, action-oriented filters in `Applications`, a more consolidated two-column `Settings` page, and optional-detail sections in `Profile` so the main editing path stays more focused.
- The latest hardening pass tightened `Shortlisted` truthfulness by separating resume/browser readiness from supported apply-path readiness, synced `Applications` filtered selection back to controller state, and fixed the resume-import harness heading selector for strict-mode Playwright runs.
- Plan `015` now directly absorbs the comparative-review findings: richer answer and blocker domains, stronger provider and source-debug intelligence inputs, a one-job apply-copilot milestone before broad auto-submit, and the explicit rule that provider APIs may improve question modeling but are not a universal direct-submit path without employer credentials.
- Plans `012`, `013`, `014`, and `015` should be treated as one end-to-end product sequence rather than unrelated options. Completed `011` now supplies the durable shared roots that `012` collects and edits, `013` reuses for stronger source intelligence and discovery, `014` consumes for better resume quality, and `015` uses for apply automation.
- The repo already has partial browser-agent transcript compaction, and queued plan `016` is now an execution-ready pull-forward enabler for the longest-running discovery, source-debug, and future apply agents rather than a mandatory queue item ahead of visible product work.
- Plan `017` is now a proper benchmark-and-decision plan for the later browser-substrate choice. It should still run only after representative post-`013` and post-`015` flows exist, but it is no longer just an undeveloped direction note.
- Older milestone detail lives in `docs/HISTORY.md`.

## Active Work

- Keep the queued follow-on roadmap centered on the product loop: `012` -> `013` -> `014` -> `015`, with completed `011` treated as the new shared-data baseline and `016` and `017` pulled forward only when they become the next concrete blocker.
- Treat the completed `007`, `009`, and `010` passes as the current functional and wording baselines for later UX polish and QA.

## Immediate Next Steps

- Start `012` next so the app turns the completed `011` shared roots into a guided setup flow and profile copilot instead of leaving profile quality bottlenecks in the broad editor.
- Start `013` next after setup as the merged source-intelligence and faster-discovery workstream: typed source intelligence first, then provider-aware discovery, one-target plus run-all execution, richer job-detail persistence, durable seen/applied dedupe, and clearer browser closeout behavior.
- Move `014` after that, but treat its first slice as resume correctness and editability rather than template breadth: fix thin section shaping, duplicate or target-job bleed, unreliable assistant mutations, and weak ATS-safe output before experimenting with extra visual polish.
- Start `015` only after the stronger data, setup, source-intelligence, discovery, and resume foundations are in place; it remains the final major queued product sequence, not the first follow-on.
- Pull `016` forward only if the longer-running discovery or apply agents start degrading because conversation growth becomes the next concrete blocker.
- Leave `017` sequenced after the main product work until representative post-`013` and post-`015` flows exist to benchmark against.
- Use the retained timing snapshot from `010` for ongoing performance baseline comparisons across discovery and source-debug flows.

## Key References

- `docs/TRACKS.md`
- `docs/exec-plans/completed/007-job-finder-resume-workspace.md`
- `docs/exec-plans/completed/010-job-finder-browser-efficiency-and-speed.md`
- `docs/exec-plans/completed/009-full-app-production-copy-pass.md`
- `docs/exec-plans/completed/011-job-finder-shared-data-expansion.md`
- `docs/exec-plans/queued/012-job-finder-guided-setup-and-profile-copilot.md`
- `docs/exec-plans/queued/013-job-finder-source-intelligence-and-faster-discovery.md`
- `docs/exec-plans/queued/014-job-finder-resume-output-and-template-quality.md`
- `docs/exec-plans/queued/015-job-finder-automatic-job-apply.md`
- `docs/exec-plans/queued/016-shared-agent-auto-compaction.md`
- `docs/exec-plans/queued/017-browser-substrate-evaluation-and-direction.md`
- `docs/HISTORY.md`
