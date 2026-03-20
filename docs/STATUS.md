# Status

## Current Phase

Job Finder UI-first iteration with custom window chrome and capture workflow

## Completed In This Repo

- Chosen monorepo baseline: `pnpm + turbo + TypeScript`
- Chosen desktop baseline: `Electron + React`
- Installed global skills for browser automation, docs, transcription, screenshots, and security
- Added canonical repo docs, including a durable project plan
- Expanded the durable project plan so the full big-picture product context lives in the repo
- Added generated adapter pipeline for `CLAUDE.md` and Cursor rules
- Standardized repo-local skills under `.agents/skills` with `.claude/skills` as a compatibility link
- Removed unnecessary module-specific repo-owned skills and kept stack skills repo-local
- Added repo-local stack skills for Electron, React, TypeScript, Zod, Vitest, SQLite, Playwright, and agent workflow docs
- Added a workspace-local TypeScript language-server entrypoint and root solution `tsconfig.json`
- Simplified repo maintenance scripts and added explicit overlay/window-policy seams
- Added minimal workspace layout and a runnable desktop shell scaffold
- Verified `pnpm verify` and desktop production build
- Added the first active `Job Finder` exec plan for LinkedIn `Easy Apply`
- Added a Job Finder screen-design brief and `docs/TRACKS.md` workboard for multi-agent handoff
- Consolidated the current Job Finder design references under `docs/Design/` with prototype-usage guidance
- Added typed Job Finder contracts, in-memory repository seams, and browser-session stubs for the first slice
- Replaced the placeholder desktop shell with an initial Job Finder workspace using typed preload data and seeded module surfaces
- Replaced the in-memory repository with file-backed local persistence for the seeded Job Finder workspace
- Added interactive desktop actions for moving jobs into review, generating seeded tailored resumes, dismissing jobs, and creating submitted application records
- Replaced the native desktop menu/title chrome with a custom draggable title bar and window controls
- Added a Playwright-based desktop UI capture workflow so agents can launch the app, navigate screens, and review screenshots during polish work
- Tightened the desktop shell breakpoints so large, medium, compact, and fullscreen sizes stay usable during UI-first iteration
- Added a workspace reset action and temporary-user-data UI capture flow so repeat visual review starts from a stable seeded state
- Documented the desktop UI capture workflow, standard screen sizes, and artifact locations so future agents can rerun the same visual checks reliably
- Tightened sidebar metric cards, panel count badges, stat spacing, and heading hierarchy so dense screens read more cleanly during UI-first iteration
- Refined the mac desktop chrome with traffic-light window controls and stronger button affordance while keeping sidebar cards contained inside the shell
- Switched macOS from custom window buttons to native hidden-inset traffic lights and moved the top module switcher away from the centered layout
- Ran a page-by-page desktop UI QA pass and tightened oversized panels, stat-card grouping, active states, and settings action layout across the current shell
- Added a final compact-height polish pass so profile, discovery, review, applications, and settings stay tighter and more readable at smaller desktop sizes
- Lowered the desktop minimum width to `1024` so the documented compact review size is reachable in the real app window, not just capture automation
- Softened the sidebar cards, reduced top-bar hover treatment, tightened button sizing, and synced native fullscreen state back into the shell for macOS polish
- Removed the top-bar ready chip and timestamp chip so the mac module tabs sit cleanly centered in the title bar
- Kept the sidebar metric cards visible in compact desktop layouts instead of hiding them at smaller heights and widths
- Unified the cross-platform top tab styling so Mac and Windows now share the same centered title-bar tabs, with only the native window buttons differing
- Reduced headline, label, chip, button, sidebar, and list typography so the shell reads less oversized and more information-dense across desktop sizes

## Active Work

- Tighten desktop UI polish and screen-level details before widening deeper functionality
- Keep the current custom window chrome and desktop capture workflow stable during UI iteration
- Replace the current browser-session stub with real browser runtime and source-adapter behavior after the shell feels right
- Keep the durable project plan and commit-time doc workflow explicit for future agents
- Keep the design references usable without letting prototype HTML become a second source of truth

## Immediate Next Steps

- Use `pnpm --filter @unemployed/desktop ui:capture` to inspect the current shell and keep polishing the UI
- Tighten the custom title bar, navigation density, and screen spacing based on capture output
- Start the first real LinkedIn discovery adapter only after the current UI shell is in a better place
