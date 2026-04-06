# Status

## Current Phase

Plans `007` and `010` are now completed. The queued roadmap is now organized around prerequisites and renumbered to match that order: start with shared data expansion in plan `011`, then guided setup plus profile copilot in plan `012`, then deeper resume output quality in plan `013`, then structured source-debug artifacts in plan `014`, then deterministic discovery and provider research in plan `015`, then shared agent auto compaction in plan `016`, and only then treat plan `017` automatic apply as the main follow-on implementation sequence. Plan `018` remains a cross-cutting runtime-direction note that should inform later substrate decisions but should not displace the higher-value product and data prerequisites. Plan `009` completed as the current shipped wording baseline after stronger rewrite and later structural polish passes.

## Snapshot

- The desktop shell is stable around typed Electron main, preload, and renderer boundaries.
- `Job Finder` persists local state in SQLite and supports profile editing, saved jobs, discovery history, tailored resume workflows, application records, and tracked apply attempts.
- Resume ingestion supports `txt`, `md`, `pdf`, and `docx`, with model-backed extraction plus deterministic fallback.
- The deterministic catalog path now keeps seeded browser session primitives in `packages/browser-runtime` while `packages/browser-agent` owns the catalog workflow policy layered on top of those primitives.
- Plans `003`, `004`, and `005` are no longer the active focus and now serve mainly as completed implementation background.
- Plan `007` completed with the resume workspace functional and tightened, including review-queue apply gating aligned with approved export reality, checklist-style readiness views, truthful supported-versus-manual apply-path messaging, and handoff clarity for apply safety.
- Plan `017` now has a concrete staged exec plan that keeps true auto-submit as the end state, but it no longer reads as the best immediate next implementation step; it should follow the stronger shared data, setup, source-debug, and compaction groundwork now captured in queued plans `011`, `012`, `014`, and `016`.
- Plan `010` completed with measurement-first browser efficiency improvements including named waiting states, retained timing summaries, test-only performance snapshots, dynamic per-target discovery budgets, deterministic merge fit scoring, narrower hot-path SQLite persistence, earlier deferred-extraction flushes, early shutdown for cold discovery sources, source-debug later-phase route reuse, guards against malformed route hints and repeated interaction failures, and early closeout for stalled evidence collection.

- Plan `009` completed a stronger shipped-surface product rewrite across Job Finder and the shared shell, including clearer top-nav labels (`Find jobs`, `Shortlisted`, `Applications`), removal of low-value internal fields, and capture-script alignment for the updated headings.
- Later follow-on polish on top of that baseline added a checklist-style readiness panel in `Shortlisted`, action-oriented filters in `Applications`, a more consolidated two-column `Settings` page, and optional-detail sections in `Profile` so the main editing path stays more focused.
- The latest hardening pass tightened `Shortlisted` truthfulness by separating resume/browser readiness from supported apply-path readiness, synced `Applications` filtered selection back to controller state, and fixed the resume-import harness heading selector for strict-mode Playwright runs.
- Plan `017` now directly absorbs the comparative-review findings: richer answer and blocker domains, stronger provider and source-debug intelligence inputs, a one-job apply-copilot milestone before broad auto-submit, and the explicit rule that provider APIs may improve question modeling but are not a universal direct-submit path without employer credentials.
- Queued plans `011` through `016` should be treated as a dependency-shaped bundle rather than unrelated options: `011` feeds `012`, `013`, `015`, and `017`; `014` feeds `015` and `017`; `016` should be in place before the longest-running agent-heavy apply flows.
- The repo already has partial browser-agent transcript compaction, but queued plan `016` now captures the follow-on need for shared token-budget auto compaction that all long-running agents and orchestrators can reuse, with a configurable default around `150_000` tokens.
- Plan `018` now captures the current directional conclusion that `agent-browser` is the leading future browser-substrate candidate if speed and quality dominate the decision, while `UnEmployed` should still keep its own orchestration, source-debug model, and approval logic and continue deeper benchmarking later before any large migration choice is locked.
- Older milestone detail lives in `docs/HISTORY.md`.

## Active Work

- Keep the queued follow-on roadmap dependency-driven: `011` -> `012` -> `013` -> `014` -> `015` -> `016` -> `017`, with `018` informing runtime decisions in parallel.
- Treat the completed `007`, `009`, and `010` passes as the current functional and wording baselines for later UX polish and QA.

## Immediate Next Steps

- Start `011` first so the missing shared narrative, answer-bank, blocker, and richer job context domains exist before the follow-on product work tries to consume them.
- Start `012` next so the app actually collects the richer data that `011` makes possible and exposes the guided setup plus profile-copilot direction.
- Start `013` after that so the improved profile memory and proof-bank data can directly lift resume output quality instead of forcing a second pass later.
- Start `014` before or alongside the next deep discovery and apply work so source-debug stops being the main freeform control plane.
- Start `015` only after the structured artifact direction in `014` is clear enough that provider-aware discovery does not have to invent a second overlapping site-intelligence model.
- Treat `016` as a shared enabler that should land before the longest-running apply or multi-agent workflows, even if it is implemented in parallel with later queue work.
- Start `017` only after the stronger data, setup, and source-debug foundations are in place; it remains the final major queued product sequence, not the first follow-on.
- Use the retained timing snapshot from `010` for ongoing performance baseline comparisons across discovery and source-debug flows.

## Key References

- `docs/TRACKS.md`
- `docs/exec-plans/completed/007-job-finder-resume-workspace.md`
- `docs/exec-plans/completed/010-job-finder-browser-efficiency-and-speed.md`
- `docs/exec-plans/completed/009-full-app-production-copy-pass.md`
- `docs/exec-plans/queued/011-job-finder-shared-data-expansion.md`
- `docs/exec-plans/queued/012-job-finder-guided-setup-and-profile-copilot.md`
- `docs/exec-plans/queued/013-job-finder-resume-output-and-template-quality.md`
- `docs/exec-plans/queued/014-job-finder-structured-source-debug-artifacts.md`
- `docs/exec-plans/queued/015-job-finder-deterministic-discovery-and-provider-research.md`
- `docs/exec-plans/queued/016-shared-agent-auto-compaction.md`
- `docs/exec-plans/queued/017-job-finder-automatic-job-apply.md`
- `docs/exec-plans/queued/018-browser-substrate-evaluation-and-direction.md`
- `docs/HISTORY.md`
