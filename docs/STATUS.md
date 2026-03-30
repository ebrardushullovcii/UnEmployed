# Status

## Current Phase

Job Finder foundation with local persistence, structured profile editing, resume ingestion, and review-gated browser-assisted application workflows

## Snapshot

- The desktop shell is runnable and organized around typed Electron main, preload, and renderer boundaries.
- `Job Finder` persists local state in SQLite and already supports profile editing, saved jobs, tailored assets, application records, and tracked apply attempts.
- Resume ingestion supports `txt`, `md`, `pdf`, and `docx`, with model-backed extraction plus deterministic fallback and provenance tracking.
- The browser-runtime layer now supports adapter-driven discovery with deterministic fixtures, a dedicated Chrome-profile LinkedIn agent enabled by default in desktop builds unless explicitly disabled, and an explicitly experimental hostname-bounded `generic_site` path.
- Discovery targets now have a source-debug bootstrap flow: Profile Preferences can launch a sequential debug run that learns bounded source guidance for discovery, detail navigation, and apply-entry paths, stores structured attempt/evidence artifacts, validates replayable instructions before promoting them, forwards the active target guidance into live discovery and the supported LinkedIn apply runtime, shows the learned instructions separately from the manual override field in Preferences, lets the user edit or remove individual learned-instruction rows directly from the target card, curates those instructions toward reusable site-specific guidance instead of raw phase boilerplate, keeps thin route-only findings in `draft` until the run proves a repeatable entry path plus stronger search/filter and detail/apply guidance, now requires at least one positively proven reusable search/filter or recommendation-route signal before validation can pass, prefers visible controls over URL-parameter shortcuts when the UI already exposes reusable search/filter surfaces, treats recommendation and `show all` routes as first-class discovery evidence when they are real, no longer pre-blocks source-debug behind LinkedIn-specific session readiness checks, now uses a DOM-backed interactive-control fallback plus looser role-name matching when the accessibility snapshot is thin, preserves complete assistant/tool-call context during transcript compaction so long runs do not trip provider tool-calling errors, forces source-debug phases to emit explicit structured finish data or fall back to typed partial-evidence outcomes near step limits, persists completion-mode and phase-evidence metadata on attempts and phase summaries, exposes a compact per-target source-debug review modal in Profile Preferences, ties the visible browser window to live discovery/source-debug run lifetime by opening it at run start and closing it at run end or cancellation, explicitly terminates the spawned Chrome process when a run shuts down so the browser does not linger after completion, teaches the worker to return to the top of long pages and re-check header controls before giving up on visible search/filter UI, uses a target's visible draft artifact automatically during discovery/apply instead of hiding it behind a separate accept step, and treats internal agent/runtime failures as run failures instead of learned instructions.
- The renderer now uses routed screen structure, feature-local composition, shared design tokens, and a repeatable Playwright screenshot workflow for UI QA.
- The Profile screen now keeps resume import and analysis in a persistent top panel, with lighter review tabs for basics, experience, background, and preferences plus tab-level completion progress.
- Older completed milestones now live in `docs/HISTORY.md` so this file stays useful as a handoff snapshot.

## Active Work

- Harden the new Job Finder agent workflow now that local persistence, resume-text extraction, optional live browser discovery, and attempt tracking exist
- QA and harden the new adapter-driven multi-target discovery flow now that LinkedIn, retained run history, target configuration, and the discovery activity timeline are wired end-to-end
- Keep `generic_site` in scope as an explicitly experimental adapter so the architecture works toward the real end goal without pretending arbitrary sites are already fully solved
- QA and harden the new modular source-debug workflow now that targets can store draft/validated instruction artifacts, manual-prerequisite pauses, apply guidance, and replay verification results
- Run a production copy pass on Profile and Discovery so user-facing text is shorter, clearer, and less developer-oriented
- Keep improving the live authenticated LinkedIn browser path now that the managed Playwright runtime can open real discovery and Easy Apply sessions
- Keep the durable project plan and commit-time doc workflow explicit for future agents
- Keep the desktop capture workflow available for regression checks while functional work expands
- Preserve safe-stop behavior for unsupported apply branches instead of widening automation blindly
- Add real exportable tailored resume artifacts so live Easy Apply flows can upload generated documents without falling back to the stored base resume
- Keep the new template pipeline stable while deciding whether downstream export should target browser-printed PDF, DOCX templating, or both
- Continue the profile-information-architecture rollout by connecting the new structured identity, eligibility, summary, skill, experience, project, and language records to resume extraction, tailoring prompts, and apply-form answers

## Immediate Next Steps

- Run real desktop QA on the new target editor plus discovery timeline surfaces and tighten any copy/layout gaps the first live users hit
- Audit Profile and Discovery text for developer-only statuses, verbose helper copy, and low-value labels, then remove or rewrite them for a more production-ready feel
- Run desktop QA on the new `Debug source` target action, instruction-status copy, and recent source-debug history surfaces, then tighten any rough edges in wording and state transitions
- Harden the experimental `generic_site` path against more hostile page structures and add more stable identity checks before treating it as more than a bounded experiment
- Harden the live LinkedIn browser runtime with selector coverage, auth recovery, and broader supported field filling
- Add richer document export and artifact storage for tailored resumes beyond the current saved HTML template output
- Expand the Applications screen with filtering, retry helpers, and attempt-centric recovery flows
- Add richer fallback extraction and cleanup for edge-case PDF and DOCX resumes that do not yield clean text on the first pass
- Keep improving structured resume extraction so imported resumes fill deeper education, certification, and project records with less cleanup after import

## Key References

- `docs/TRACKS.md` for current workstream ownership and next actions
- `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md` for the main Job Finder delivery plan
- `docs/exec-plans/active/003-job-finder-profile-information-architecture.md` for the active profile rollout
- `docs/exec-plans/active/004-job-finder-adapter-driven-discovery.md` for the adapter-driven discovery, target configuration, and activity-timeline refactor
- `docs/exec-plans/active/005-job-source-debug-agent.md` for the next source-bootstrap workflow that learns and validates reusable site instructions
- `docs/exec-plans/active/006-profile-discovery-production-copy-pass.md` for the production-ready copy cleanup across Profile and Discovery
- `docs/HISTORY.md` for older completed milestones

## Recently Completed

- `2026-03-29`: tightened source-debug toward reusable operator guidance by forcing stronger proof of entry paths, visible search/filter controls, recommendation or `show all` routes, filtering tool-chatter out of learned instructions, hardening LinkedIn auth detection, removing target-level LinkedIn session gating from discovery/source-debug orchestration, clearing prior learned instructions for a target before a fresh `Debug source` rerun rebuilds them, teaching the browser-agent to surface recommendation/search/filter controls from either accessibility or DOM signals so surfaces like LinkedIn `Show all` are less likely to be missed, fixing transcript compaction so provider tool-calling sessions no longer get broken by orphaned `tool` messages, teaching source-debug workers to keep exploring until they explicitly `finish` instead of auto-stopping after the first sampled job, and tightening promotion so “controls were visible but not proven” stays `draft` while visible UI surfaces are preferred over direct URL hacks
- `2026-03-29`: hardened source-debug phase completion so task-packet runs get a forced final closeout turn before timeout, synthesize typed partial-evidence findings when the worker still fails to `finish`, persist completion-mode plus phase-evidence metadata through runtime/orchestrator storage, added a typed `getSourceDebugRunDetails` IPC path, and exposed a compact Profile Preferences review modal that shows per-phase outcomes, end reasons, evidence counts, and existing accept/verify actions for retained runs
- `2026-03-29`: tied the visible browser lifetime to live discovery/source-debug run lifetime by adding explicit runtime `closeSession()` support, opening the browser session when agent discovery or source-debug starts, and closing it again on completion, failure, or cancellation so an open browser remains a reliable signal that the run is still active
- `2026-03-30`: tightened generic landing-page probing by adding a `scroll_to_top` worker tool plus stronger prompt guidance to re-check header search/filter controls after scrolling long pages, hardened source-instruction promotion so visibility-only or disproof-only search guidance cannot validate, and updated runtime shutdown to terminate the spawned Chrome process instead of leaving the browser window open after discovery/source-debug ends
- `2026-03-30`: tightened active learned-instruction selection so live discovery and supported apply flows now use the current draft or validated instruction artifact for the matching target, exposed inline edit/remove controls for learned instruction rows in Profile Preferences, filtered more runtime/tool chatter (`extract_jobs`, `get_interactive_elements`, pointer-event and timeout hints) out of stored guidance, suppressed contradictory “no visible filters” lines when phase evidence already saw named controls, and escalated browser shutdown from gentle close to process fingerprint termination when needed so the browser window does not linger after a run ends
- `2026-03-28`: updated the Discovery full-history modal so the current in-flight run stays visible alongside retained runs, with a clear live state and auto-follow behavior for new events until the user scrolls away
- `2026-03-28`: landed the first source-debug bootstrap architecture with dedicated source-debug contracts/persistence, a reusable sequential artifact orchestrator, worker transcript compaction, replay-gated instruction artifacts, apply-path validation guidance, and a Profile Preferences `Debug source` action
- `2026-03-27`: completed the adapter-driven discovery refactor with nested discovery preferences, retained run history, activity timeline events, adapter-scoped session state, provenance tracking, sequential multi-target orchestration, and desktop target/timeline UI updates while keeping LinkedIn discovery working
- `2026-03-26`: implemented AI browser agent for autonomous LinkedIn job discovery with LLM tool calling, replacing the old deterministic discovery button; agent controls navigation strategy, timeouts, and retry logic; targets up to the configured job count from LinkedIn search results using the user's profile preferences
- `2026-03-25`: refocused the Profile screen around a persistent resume source panel, simpler tab labels, and collapsible record cards so resume-driven editing feels less dense
- `2026-03-24`: tightened repo guidance so `AGENTS.md`, `docs/README.md`, `docs/AGENT_CONTEXT.md`, and `apps/desktop/AGENTS.md` are shorter, clearer, and less duplicative
- `2026-03-24`: configured PR-only `main` governance with a live GitHub ruleset, CodeRabbit defaults, and `.github/CODEOWNERS`
- `2026-03-24`: added a root `pnpm desktop:dev` shortcut for local desktop startup
- `2026-03-23`: aligned the desktop renderer around routed screens, shared tokens, and real `shadcn` primitives while keeping the existing visual language
- `2026-03-21`: expanded structured profile editing, resume extraction cleanup, and imported-profile visual QA workflows
