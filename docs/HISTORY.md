# History

Use this file for condensed repo milestones and notable completed changes.

`docs/STATUS.md` stays short and current.

## 2026-04-05

- Tightened the handoff layer by shortening `docs/STATUS.md` and `docs/TRACKS.md`, moving stale Job Finder foundation plans out of `active`, and trimming local guidance that had started duplicating canonical docs.
- Added a missing `packages/browser-agent/AGENTS.md` guide and slimmed the generated Claude and Cursor adapters so they point agents to the smallest relevant doc set first.
- Reclassified plans `003` through `005` as completed background, renamed the old discovery plan around the generic-discovery direction that actually shipped, and queued future `008` automatic apply, `009` full-app copy pass, and `010` browser-efficiency work in the handoff docs.

## 2026-03-26

- Added AI-driven LinkedIn job discovery agent with persistent Chrome authentication and cancellation support

## 2026-03-24

- Tightened repo guidance so `AGENTS.md`, `docs/README.md`, `docs/AGENT_CONTEXT.md`, and `apps/desktop/AGENTS.md` are clearer, less duplicative, and better aligned with current agent-doc best practices.
- Configured PR-only `main` governance with a live GitHub ruleset, repo-local CodeRabbit defaults, and `.github/CODEOWNERS` naming `@ebrardushullovcii` plus `@vigani1` as the intended merge maintainers.
- Added a root `pnpm desktop:dev` shortcut so local desktop startup no longer depends on the longer workspace-filter command.

## 2026-03-23

- Stabilized the desktop renderer around routed Job Finder screens, shared design tokens, real `shadcn` primitives, and clearer main-process/backend package boundaries.
- Added a repeatable imported-profile screenshot baseline workflow for visual regression review across the shell and Profile subtabs.
- Completed multiple desktop polish passes to improve compact-width behavior, title-row navigation, panel hierarchy, field contrast, and accessibility details.

## 2026-03-21 to 2026-03-22

- Expanded the structured Profile rollout with richer identity, eligibility, summary, skill, experience, education, certification, project, link, language, and targeting data.
- Refactored the oversized Profile surface onto `react-hook-form`, split it into focused tabs, and tightened atomic save plus validation feedback behavior.
- Hardened imported-resume cleanup and deterministic fallback extraction so real resumes map into more trustworthy structured profile state.

## 2026-03-20

- Landed the first agent-first Job Finder foundation with typed contracts, local persistence, saved jobs, tailored assets, application records, and tracked apply attempts.
- Added multi-format resume ingestion for `txt`, `md`, `pdf`, and `docx`, plus AI-backed extraction with deterministic fallback and provenance tracking.
- Added a browser-runtime layer with deterministic LinkedIn discovery plus an opt-in dedicated Chrome-profile agent for live authenticated discovery and safe-stop `Easy Apply` execution.
- Documented the active Job Finder execution plans, design references, screenshot capture workflow, and live workboard handoff model.

## Earlier Foundation

- Chosen monorepo baseline: `pnpm`, `turbo`, and `TypeScript`.
- Chosen desktop baseline: `Electron` and `React`.
- Standardized repo-local skills under `.agents/skills`, with generated adapters for Claude and Cursor.
- Added canonical docs, ADRs, and validation commands so future agents can recover context without relying on chat history.
