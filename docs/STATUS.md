# Status

## Current Phase

Job Finder foundation with local persistence, structured profile editing, resume ingestion, and review-gated browser-assisted application workflows

## Snapshot

- The desktop shell is runnable and organized around typed Electron main, preload, and renderer boundaries.
- `Job Finder` persists local state in SQLite and already supports profile editing, saved jobs, tailored assets, application records, and tracked apply attempts.
- Resume ingestion supports `txt`, `md`, `pdf`, and `docx`, with model-backed extraction plus deterministic fallback and provenance tracking.
- The browser-runtime layer now supports adapter-driven discovery with deterministic fixtures, a dedicated Chrome-profile LinkedIn agent enabled by default in desktop builds unless explicitly disabled, and an explicitly experimental hostname-bounded `generic_site` path.
- Discovery targets now have a clear next planned step: a job-source debug agent that can learn and verify reusable instructions for newly added sources when the user cannot author them manually.
- The renderer now uses routed screen structure, feature-local composition, shared design tokens, and a repeatable Playwright screenshot workflow for UI QA.
- The Profile screen now keeps resume import and analysis in a persistent top panel, with lighter review tabs for basics, experience, background, and preferences plus tab-level completion progress.
- Older completed milestones now live in `docs/HISTORY.md` so this file stays useful as a handoff snapshot.

## Active Work

- Harden the new Job Finder agent workflow now that local persistence, resume-text extraction, optional live browser discovery, and attempt tracking exist
- QA and harden the new adapter-driven multi-target discovery flow now that LinkedIn, retained run history, target configuration, and the discovery activity timeline are wired end-to-end
- Keep `generic_site` in scope as an explicitly experimental adapter so the architecture works toward the real end goal without pretending arbitrary sites are already fully solved
- Define the job-source debug-agent workflow so a newly added target in Profile Preferences can bootstrap reusable instructions by probing auth, layout, search, filters, and job-detail navigation
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
- Start the next source-bootstrap slice by designing the Profile Preferences debug entrypoint, the sequential orchestrator, and the verified instruction artifact for newly added job sources
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

- `2026-03-28`: updated the Discovery full-history modal so the current in-flight run stays visible alongside retained runs, with a clear live state and auto-follow behavior for new events until the user scrolls away
- `2026-03-27`: completed the adapter-driven discovery refactor with nested discovery preferences, retained run history, activity timeline events, adapter-scoped session state, provenance tracking, sequential multi-target orchestration, and desktop target/timeline UI updates while keeping LinkedIn discovery working
- `2026-03-26`: implemented AI browser agent for autonomous LinkedIn job discovery with LLM tool calling, replacing the old deterministic discovery button; agent controls navigation strategy, timeouts, and retry logic; targets up to the configured job count from LinkedIn search results using the user's profile preferences
- `2026-03-25`: refocused the Profile screen around a persistent resume source panel, simpler tab labels, and collapsible record cards so resume-driven editing feels less dense
- `2026-03-24`: tightened repo guidance so `AGENTS.md`, `docs/README.md`, `docs/AGENT_CONTEXT.md`, and `apps/desktop/AGENTS.md` are shorter, clearer, and less duplicative
- `2026-03-24`: configured PR-only `main` governance with a live GitHub ruleset, CodeRabbit defaults, and `.github/CODEOWNERS`
- `2026-03-24`: added a root `pnpm desktop:dev` shortcut for local desktop startup
- `2026-03-23`: aligned the desktop renderer around routed screens, shared tokens, and real `shadcn` primitives while keeping the existing visual language
- `2026-03-21`: expanded structured profile editing, resume extraction cleanup, and imported-profile visual QA workflows
