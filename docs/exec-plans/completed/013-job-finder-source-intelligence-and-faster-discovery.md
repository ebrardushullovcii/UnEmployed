# 013 Job Finder Source Intelligence And Faster Discovery

Status: completed

Completed on `2026-04-16`.

This plan merged the earlier source-debug typed-artifact follow-up and the discovery redesign follow-up into one coherent source-intelligence and faster-discovery delivery slice.

## Final Implementation Summary

- Source-debug artifacts now persist typed source intelligence instead of relying only on freeform guidance arrays, and the final review flow can override curation with structured provider, route, collection, apply, reliability, and override intelligence.
- Discovery now consumes the typed source-intelligence model directly so provider-aware method selection, starting-route choice, and later UI summaries reuse the same reviewed control plane.
- Discovery supports one-target and run-all execution on the same target-level pipeline through `runDiscovery(targetId?)`, `runAgentDiscovery(..., targetId?)`, and `runDiscoveryForTarget(targetId, ...)`.
- Provider-aware collection now prefers public APIs when grounded and safe, with Greenhouse and Lever public collection support wired through the shared discovery pipeline.
- Discovery now applies title-first triage before expensive enrichment so obvious title, location, or work-mode misses are rejected early.
- A durable discovery ledger now tracks seen, skipped, enriched, applied, and inactive jobs with provider-aware identity matching, and later runs can skip already-handled jobs without redoing expensive work.
- Dismissing pending discovery jobs, archiving saved jobs, and successful apply submission now write durable ledger status updates so intentional user handling survives future runs.
- Saved jobs preserve richer discovery-time context and provenance, including collection method, typed source-intelligence summaries, and provider metadata for later review, resume, and apply flows.
- Discovery run history now records explicit browser closeout details so the UI can tell the user whether the browser was closed or intentionally kept alive for session reuse.
- The desktop shell now exposes a first-class single-target `Search this source` action from both Discovery and Profile surfaces, and discovery history/detail views surface typed intelligence and closeout status.

## Acceptance Criteria

- typed source intelligence from source-debug -> pass -> `packages/contracts/src/source-debug.ts`, `packages/job-finder/src/internal/workspace-source-intelligence.ts`, `packages/job-finder/src/internal/workspace-source-instruction-synthesis.ts`, and renderer review/detail surfaces now persist and display structured intelligence.
- provider-aware discovery method selection -> pass -> `workspace-source-intelligence.ts` detects Greenhouse, Lever, LinkedIn, Ashby, Workday, and iCIMS patterns; Greenhouse and Lever public API collection routes are implemented and discovery emits provider-aware progress messaging.
- one-target and run-all execution share one pipeline -> pass -> `workspace-discovery-methods.ts` drives `runDiscovery(targetId?)`, `runAgentDiscovery(..., targetId?)`, and `runDiscoveryForTarget(...)` through one target-level execution path; service test coverage proves single-target execution only runs the requested source.
- title-first triage before expensive enrichment -> pass -> `applyDiscoveryTitleTriage(...)` runs before persistence/enrichment and run summaries now retain `jobsSkippedByTitleTriage` counts.
- durable seen/skipped/applied/enriched/inactive ledger -> pass -> `workspace-discovery-ledger.ts` now retains ledger entries with provider-aware matching, applied timestamps, skip reasons, inactive marking, and durable status writes from dismiss/archive/apply flows.
- richer saved-job persistence -> pass -> discovery and saved-job provenance now retain collection method, provider metadata, source intelligence, compensation/context fields, and later desktop detail views surface those summaries.
- explicit browser closeout / detach clarity -> pass -> discovery run summaries retain `browserCloseout` with label, detail, runtime status, driver, and timestamp; renderer activity/history UI renders that summary.
- tests, docs, and handoff updates -> pass -> service tests, contracts, desktop build, browser-agent tests, browser-runtime typecheck, and docs updates landed together; this completed plan now captures the durable handoff state.

## Verification Evidence

Validated in this completion pass:

- `pnpm --filter @unemployed/contracts test`
- `pnpm --filter @unemployed/job-finder test`
- `pnpm --filter @unemployed/browser-agent test`
- `pnpm --filter @unemployed/browser-runtime typecheck`
- `pnpm --filter @unemployed/desktop build`
- `pnpm docs:check`

Representative evidence anchored in repo state:

- API-friendly target evidence -> Greenhouse and Lever public provider collection is implemented in `packages/job-finder/src/internal/workspace-source-intelligence.ts` and routed through discovery when typed intelligence marks `preferredMethod: "api"`.
- Structured listing-route evidence -> source-debug review coverage now proves `preferredMethod: "listing_route"` survives synthesis and review (`packages/job-finder/src/workspace-service.source-debug.review.test.ts`).
- Generic fallback evidence -> collection-method inference still falls back to `fallback_search` when no API or stable route is grounded, and the same shared pipeline executes that path through browser-agent discovery.
- One-target vs run-all evidence -> `packages/job-finder/src/workspace-service.core.discovery-scenarios.ts` proves remaining-job budgeting across multiple targets, early stop once enough jobs exist, and single-target execution with `scope: "single_target"`.
- Browser closeout evidence -> discovery scenario coverage asserts `browserCloseout.mode === "kept_alive"` when `keepSessionAlive` is enabled, and renderer discovery activity/history surfaces render the explicit closeout summary.
- Durable ledger evidence -> `packages/job-finder/src/workspace-service.core.resume-apply-scenarios.ts` proves dismissing and applying jobs writes durable ledger statuses.

## Notes For Follow-On Planning

- Live benchmark evidence for the shipped `013` slice is retained in `docs/exec-plans/completed/013-benchmark-results.md`; use that report for the measured before-vs-after discovery and source-debug comparison instead of relying on chat history.
- Add targeted service tests for public API provider collection and title-triage skip counters if later work expands provider coverage beyond the current grounded Greenhouse and Lever fast paths.
- Consider a dedicated scripted desktop QA harness for single-target discovery and discovery-history closeout messaging if later UX work changes the Discovery screen substantially.
- Keep future apply automation (`015`) consuming the same typed provider, route, auth, and apply hints rather than rebuilding source intelligence late in the apply flow.
