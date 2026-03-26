# Status

## Current Phase

Job Finder foundation with local persistence, structured profile editing, resume ingestion, and review-gated browser-assisted application workflows

## Snapshot

- The desktop shell is runnable and organized around typed Electron main, preload, and renderer boundaries.
- `Job Finder` persists local state in SQLite and already supports profile editing, saved jobs, tailored assets, application records, and tracked apply attempts.
- Resume ingestion supports `txt`, `md`, `pdf`, and `docx`, with model-backed extraction plus deterministic fallback and provenance tracking.
- The browser-runtime layer supports both deterministic discovery fixtures and an opt-in dedicated Chrome-profile LinkedIn agent with safe-stop behavior for unsupported flows.
- The renderer now uses routed screen structure, feature-local composition, shared design tokens, and a repeatable Playwright screenshot workflow for UI QA.
- Older completed milestones now live in `docs/HISTORY.md` so this file stays useful as a handoff snapshot.

## Active Work

- Harden the new Job Finder agent workflow now that local persistence, resume-text extraction, optional live browser discovery, and attempt tracking exist
- Keep improving the live authenticated LinkedIn browser path now that the managed Playwright runtime can open real discovery and Easy Apply sessions
- Keep the durable project plan and commit-time doc workflow explicit for future agents
- Keep the desktop capture workflow available for regression checks while functional work expands
- Preserve safe-stop behavior for unsupported apply branches instead of widening automation blindly
- Add real exportable tailored resume artifacts so live Easy Apply flows can upload generated documents without falling back to the stored base resume
- Keep the new template pipeline stable while deciding whether downstream export should target browser-printed PDF, DOCX templating, or both
- Continue the profile-information-architecture rollout by connecting the new structured identity, eligibility, summary, skill, experience, project, and language records to resume extraction, tailoring prompts, and apply-form answers

## Immediate Next Steps

- Harden the live LinkedIn browser runtime with selector coverage, auth recovery, and broader supported field filling
- Add richer document export and artifact storage for tailored resumes beyond the current saved HTML template output
- Expand the Applications screen with filtering, retry helpers, and attempt-centric recovery flows
- Add richer fallback extraction and cleanup for edge-case PDF and DOCX resumes that do not yield clean text on the first pass
- Keep improving structured resume extraction so imported resumes fill deeper education, certification, and project records with less cleanup after import

## Key References

- `docs/TRACKS.md` for current workstream ownership and next actions
- `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md` for the main Job Finder delivery plan
- `docs/exec-plans/active/003-job-finder-profile-information-architecture.md` for the active profile rollout
- `docs/HISTORY.md` for older completed milestones

## Recently Completed

- `2026-03-26`: implemented AI browser agent for autonomous LinkedIn job discovery with LLM tool calling, replacing the old deterministic discovery button; agent controls navigation strategy, timeouts, and retry logic; targets up to the configured job count from LinkedIn search results using the user's profile preferences
- `2026-03-24`: tightened repo guidance so `AGENTS.md`, `docs/README.md`, `docs/AGENT_CONTEXT.md`, and `apps/desktop/AGENTS.md` are shorter, clearer, and less duplicative
- `2026-03-24`: configured PR-only `main` governance with a live GitHub ruleset, CodeRabbit defaults, and `.github/CODEOWNERS`
- `2026-03-24`: added a root `pnpm desktop:dev` shortcut for local desktop startup
- `2026-03-23`: aligned the desktop renderer around routed screens, shared tokens, and real `shadcn` primitives while keeping the existing visual language
- `2026-03-21`: expanded structured profile editing, resume extraction cleanup, and imported-profile visual QA workflows
