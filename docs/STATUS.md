# Status

## Current Phase

Job Finder agent-first foundation with SQLite persistence, resume-text extraction, optional live LinkedIn browser automation, and review-gated apply tracking

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
- Replaced the JSON-backed workspace store with a SQLite-backed repository that persists saved jobs, tailored assets, application records, and application attempts locally
- Added a richer browser runtime contract plus a deterministic LinkedIn source adapter for discovery filtering and safe Easy Apply execution checkpoints
- Added real Job Finder mutations for editable profile data, discovery preferences, settings, local discovery runs, tailored resume content generation, and tracked apply attempts
- Added desktop UI controls for saving profile/preferences/settings and replacing the base resume through a native file picker
- Activated `packages/ai-providers` with an OpenAI-compatible job-agent client plus deterministic fallbacks for tests and offline use
- Expanded shared Job Finder contracts with agent-provider status, stored resume-text extraction state, browser driver metadata, live discovery provenance, and resume-generation metadata
- Added an opt-in dedicated-Chrome LinkedIn browser agent that can open its own persistent profile, extract live job listings, and safely pause unsupported Easy Apply flows
- Added resume-text-backed profile extraction and AI-assisted tailored resume generation so the desktop shell can derive candidate details from stored resume text instead of only manual entry
- Added resume ingestion for `txt`, `md`, `pdf`, and `docx` inputs using file-type-specific text extraction before the profile agent runs
- Added fixed template-driven resume output so generated resume text now renders into a small curated template set and saves a local HTML artifact instead of inventing document layout from scratch
- Fixed Electron-side PDF resume import so `pdfjs-dist` gets a local `DOMMatrix` polyfill before extraction runs, which removes the `job-finder:import-resume` crash seen on real uploads
- Fixed the bundled Electron PDF import path so `pdfjs-dist` resolves its worker from the installed package instead of looking for a missing `out/main/pdf.worker.mjs` file
- Improved PDF text extraction to preserve line structure by grouping text items by Y position, enabling accurate name and headline parsing from resume headers
- Added `firstName`, `lastName`, and optional `middleName` fields to `CandidateProfile` contract so parsed names are properly structured
- Refined resume parsing heuristics to extract concise headlines (up to 8 words, 64 chars) and filter out job titles from experience sections
- Fixed `inferName` and `inferHeadline` logic in deterministic parser to use word boundaries and stricter filters, avoiding false matches on skills/soft-skills sections
- Added a scripted desktop resume-import capture harness so agents can import a real file, reload the Electron workspace, inspect the resulting UI, and save workspace JSON without relying on the native file picker manually
- Improved deterministic resume analysis so imported resumes now produce a clean bio summary, normalized role headline, parsed location, cleaned phone format, cleared stale portfolio values, and fresh target-role/location state instead of leaking seeded profile data
- Tightened resume section parsing for more varied source formats by recognizing alternate summary/skills headings, extracting cleaner atomic skills from mixed lines, and suppressing generic success notes when no review warning is needed
- Polished the profile/settings layout by converting the profile surface to balanced column stacks, adding dedicated select styling for dropdowns, and exposing structured first/middle/last-name editing in the desktop UI
- Clarified the AI-first extraction path so `UNEMPLOYED_AI_API_KEY` activates FelidaeAI-Pro-2.5 for generic resume parsing while deterministic extraction remains a fallback only when no model key is present or the model call fails
- Changed workspace reset to a true fresh-start reset: it now clears saved jobs, tailored assets, application records, imported resume files, and the dedicated LinkedIn browser profile instead of restoring the Alex sample candidate
- Added desktop env-file loading plus a root `.env.example`, so FelidaeAI credentials can be supplied through `.env.local` and picked up automatically by the Electron main process instead of relying only on an inherited shell environment
- Added persisted resume-analysis provenance plus a visible profile badge so the UI now states whether the current resume was parsed by FelidaeAI or the deterministic fallback, and changed Settings reset to jump back to the fresh profile after clearing workspace state
- Added and then tightened a dedicated profile-information-architecture plan, now grounded in LinkedIn/Greenhouse/Workable/Ashby patterns with clearer priority tiers, a separate eligibility bucket, and explicit guidance on which sensitive fields not to collect by default
- Expanded the structured Profile-screen rollout so candidate data now includes richer identity/contact fields, work-eligibility/logistics, summary layers, grouped skill evidence, repeatable experience/education/certification/project/link/language records, and broader role-targeting preferences in the live desktop UI
- Tightened the structured Profile save path so partial experience/education/certification/link cards now persist as explicit drafts instead of being silently dropped, integer-only numeric fields validate before dispatch, and link/credential URLs plus link kinds are schema-validated
- Simplified the Profile screen so resume upload and parsing now sit at the top, provider-brand clutter is removed from that flow, and list-style profile data is managed through add/remove item editors instead of large newline textareas
- Expanded resume-analysis mapping so extracted output now feeds grouped skill buckets, professional-summary fields, structured experience records, public links, and spoken-language entries rather than only top-level profile strings
- Split the long Profile page into task-based tabs so resume intake, core profile editing, experience, background details, and targeting preferences can be worked on in smaller focused views instead of one long scroll
- Hardened resume import so replacing the base resume now resets profile/search-preference state to a fresh baseline before analysis, preventing seeded candidate data from leaking into imported tabs
- Added a deterministic extraction supplement behind the model-backed path so imported resumes still recover cleaner headline, skills, education, links, location parts, and structured experience fields when the AI response is partial or inconsistent
- Polished the Profile tab workflow with a single top-right save action, quieter resume copy, stacked section ordering, compact removable chips for repeatable list fields, and timezone inference from imported location data when resumes omit an explicit timezone
- Simplified the Profile tabs further by hiding the raw resume-text editor, replacing most chip-style list editors with bounded multiline textareas, and tightening the remaining skill-chip containers so dense skill buckets read more clearly
- Removed textarea resizing across the Profile surface so long-form inputs now stay fixed-height with scroll, and tightened skill-bucket editor sizing so add buttons and chip containers feel more even row-to-row
- Stabilized sparse skill buckets so pills stay compact instead of stretching in taller containers, and taught resume extraction to infer likely regional defaults like salary currency alongside timezone when location context is strong
- Reworked the desktop shell header so the oversized sidebar is gone, suite tabs stay pinned at the very top, the left wordmark is larger, bolder, and tighter to the edge, primary navigation sits lower in the title row with theme-aligned count dots, compact workspace stat cards now show label-plus-number only beside a gear-based Settings button, and the header controls are vertically aligned on a shared compact height while the renderer uses `lucide-react` for iconography instead of custom inline SVGs
- Added centered max-width shell constraints to the desktop chrome and page content so ultra-wide windows keep standard readable gutters instead of stretching navigation and forms edge to edge
- Restructured the desktop renderer into `app/`, `pages/`, `features/`, `components/ui/`, and `styles/`, added HashRouter-based app entrypoints, moved the Job Finder workspace loading into a feature hook, and introduced Tailwind v4 theme tokens while preserving the current visual language
- Pulled Electron window-shell creation and window-controls helpers into a dedicated main-process module so the desktop backend is less concentrated in `apps/desktop/src/main/index.ts`
- Split the Job Finder renderer feature into shared utils plus dedicated `profile`, `discovery`, `review-queue`, `applications`, and `settings` screen files, and switched shell navigation/checkbox interactions onto local Radix-backed Tabs and Checkbox primitives instead of raw repeated HTML controls
- Replaced the remaining renderer semantic class styling with Tailwind utility composition so `apps/desktop/src/renderer/src/styles/globals.css` is now mostly tokens/base styles, kept the original desktop visual language intact, and updated `apps/desktop/scripts/capture-ui.mjs` so UI capture follows the new tab-based navigation semantics
- Added a real `shadcn` setup for `apps/desktop` (`components.json`, alias wiring, generated UI source files), re-themed the generated primitives to the canonical `docs/Design/job-finder-*/mockup.html` palette and typography, and rebuilt the desktop shell plus key Job Finder screens around those actual shadcn components
- Ran a second screen-by-screen renderer pass against the profile, discovery, review-queue, applications, and settings HTML mockups so the live Electron screens now follow those specific layouts more closely, and updated `ui:capture` to target the renamed mockup-aligned screen headings during screenshot validation
- Converted the Job Finder renderer from internal tab-only switching to nested HashRouter subroutes (`/job-finder/profile`, `/job-finder/discovery`, `/job-finder/review-queue`, `/job-finder/applications`, `/job-finder/settings`), moved screen state/actions into a routed page context, and fixed the Electron renderer Tailwind pipeline plus scroll container sizing so the desktop screens render and scroll correctly in the real app
- Refactored the oversized Profile screen onto `react-hook-form` with reset-based form syncing, split it into overview / identity / history / preferences tabs plus dedicated profile tab components, and replaced the previous many-`useState` / many-`useEffect` form state approach with field-array driven editor sections
- Broke the remaining Job Finder screens into per-screen directories and focused subcomponents (`discovery/*`, `review-queue/*`, `applications/*`, `settings/*`) so each screen now has its own local composition layer instead of relying on one large file per screen
- Refactored the Electron main process into a clearer backend structure with `job-finder-runtime.ts` for workspace/service lifecycle, `ipc/*.ts` modules for system/window/job-finder handlers, and a slimmed `apps/desktop/src/main/index.ts` that only boots env loading, IPC registration, and window creation
- Reorganized the Electron backend again into explicit `setup/`, `routes/`, `services/job-finder/`, and `adapters/` areas so startup concerns are no longer mixed with request handlers or workflow logic, while keeping preload contracts stable
- Added a scripted profile-visual-baseline capture flow that hydrates the preferred imported-profile snapshot and records shell plus full Profile-tab screenshots under `apps/desktop/test-artifacts/ui/` for pre-refactor visual reference
- Tightened the post-refactor visual system by separating dark panel and form-field tones more clearly across Profile editing, aligning top-level add actions to input heights, broadening page-header title width, and simplifying zero-results Discovery into a cleaner two-column empty state so blank search sessions do not collapse into broken detail-panel layouts
- Refined the dark palette away from muddy tinted containers toward flatter neutral charcoal surfaces, fixed mixed-height form rows so short inputs stay pinned to their labels instead of centering beside taller textareas, and made the title-row navigation responsive enough to stop colliding with the top-right summary cards around compact desktop widths
- Reworked the Discovery left rail into one contained control surface with an integrated footer action, widened the discovery left column at desktop widths, and retuned the experience-card/input contrast so repeatable Profile records read as darker canvases with clearly elevated graphite fields instead of nearly identical dark fills
- Migrated all arbitrary Tailwind values (rounded, text, tracking, gap) to CSS custom properties defined in `globals.css` for consistent design tokens across the desktop app, and replaced all hardcoded hex colors with semantic CSS variables
- Added frontend best practices documentation to `apps/desktop/AGENTS.md` covering CSS custom properties usage, import path conventions, component architecture, file organization, TypeScript standards, styling patterns, accessibility requirements, and performance guidelines
- Hardened the post-polish follow-up pass by making combined profile-plus-preferences saves atomic, preserving existing profile/search data until imported resume analysis succeeds, normalizing legacy `workMode` string values at the contracts/database boundary, and tightening accessibility around selection controls, list editors, and review/applications panels
- Closed the next PR-review follow-up pass by pluralizing application record counts correctly, announcing Profile save/validation feedback through live regions, tightening personal-website inference so arbitrary third-party links do not get promoted into profile state, preserving saved links/projects/languages when extraction only yields invalid entries, and letting the profile-baseline capture harness reuse the shared workspace-input hydrate path
- Closed a third PR-review pass by fixing Switch thumb travel calculation, replacing aria-pressed with aria-current for record selection, pluralizing job counts, adding accessible match-score labels and aria-pressed for job selection, fixing telemetry-section heading semantics and note-key uniqueness, removing duplicate STATUS bullet text, preserving fallback experiences in merge logic, typing status-to-tone mappings explicitly, removing duplicate section-definition fallbacks, expanding timezone/currency region coverage, and exporting work-mode normalization utilities
- Added repo governance for PR-only `main` merges by configuring a live GitHub `main` ruleset, documenting `@ebrardushullovcii` plus `@vigani1` as the intended `main` maintainers, and adding repo-local CodeRabbit plus CODEOWNERS defaults so every PR gets reviewed without making CodeRabbit approval a merge gate
- Added a root `pnpm desktop:dev` shortcut so launching the Electron app no longer requires the longer workspace-filter command

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
