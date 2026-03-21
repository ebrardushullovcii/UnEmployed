# Tracks

`STATUS.md` answers "what is happening in the repo right now?"

`TRACKS.md` answers "what workstreams exist, what is already being worked on, and what can another agent pick up next?"

Use one track per meaningful workstream, not per person or per chat.

## How To Use This File

- Read `docs/STATUS.md`, then `docs/TRACKS.md`, then the linked exec plan before starting non-trivial work.
- If you take a track, update its `status`, `last updated`, `current focus`, and `next step`.
- If you stop mid-stream, set the track to `handoff` or `blocked` and leave the next concrete action.
- Keep deep implementation detail in the linked exec plan or module docs; keep this file short and current.
- When a track finishes, update the relevant docs and move follow-up work into the ready queue instead of leaving hidden context in chat.

## Status Keys

- `ready`: clear next step, not actively being worked
- `in_progress`: currently owned by an active work session
- `handoff`: partial progress exists and another agent can continue
- `blocked`: cannot move until another track or decision lands
- `done`: completed and reflected in docs/code

## Active Tracks

### `JF-01 Contracts And Persistence`

- status: `done`
- last updated: `2026-03-20`
- scope: define the minimal Job Finder schemas and repository seams for the LinkedIn `Easy Apply` slice
- linked plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- code areas: `packages/contracts`, `packages/db`
- current focus: typed Job Finder contracts now include discovery/apply attempt data and the desktop repository is SQLite-backed
- next step: add richer migration coverage and resume artifact storage once live LinkedIn execution adds more schema pressure
- blockers: none
- notes: current implementation persists profile, preferences, saved jobs, tailored assets, application records, and apply attempts into a local SQLite database with a legacy JSON fallback path

### `JF-02 Job Finder Screen Design`

- status: `done`
- last updated: `2026-03-20`
- scope: design the MVP screens and states for the first Job Finder slice
- linked plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- linked brief: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply-ui-brief.md`
- code areas: `docs/Design`, `apps/desktop`
- current focus: finalized visual references are implemented as a first interactive desktop shell with native mac traffic lights, tighter sidebar cards, clearer panel hierarchy, and page-level UI QA refinements
- next step: keep using the desktop UI capture workflow to tighten shell density, applications detail behavior, and compact-size usability before deeper functionality expands
- blockers: none
- notes: screenshots are the primary visual target; `mockup.html` files are prototype-only references and the design set is directional rather than feature-complete; use `pnpm --filter @unemployed/desktop ui:capture` for screenshot-based UI review and the reset action in Settings to restore the seeded workspace quickly; the current polish pass improved count-badge padding, stat label/value spacing, sidebar metric containment, native mac title-bar behavior, centered tabs, removed the ready and updated chips, reduced top-bar hover noise, tighter button sizing, fullscreen-state sync, oversized-panel balance, page-by-page active-state clarity, compact-height readability, real-window support for the documented `1024x768` review size, always-visible sidebar metrics on compact desktop layouts, shared centered top-tab styling across Mac and Windows, and a smaller typography scale across headlines, labels, chips, buttons, and list rows

### `JF-03 Browser Runtime And LinkedIn Discovery`

- status: `in_progress`
- last updated: `2026-03-20`
- scope: build the generic browser primitives and the first LinkedIn discovery adapter boundary
- linked plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- code areas: `packages/browser-runtime`, `packages/job-finder`
- current focus: browser-runtime now supports both the deterministic catalog path and an opt-in dedicated Chrome-profile LinkedIn browser agent that can launch its own profile, prompt for login, and extract live jobs through that session
- next step: harden selector coverage, add better auth recovery, and support broader search/result pagination without weakening the safe-stop behavior
- blockers: live LinkedIn execution still depends on user-authenticated sessions and selector hardening against real page variation
- notes: keep LinkedIn selectors and recovery logic out of the generic runtime; discovery already writes back through the repository boundary, dedupes by source job identity, and now records whether jobs came from the catalog seed or the live Chrome-profile agent

### `JF-04 Tailored Resume Path`

- status: `in_progress`
- last updated: `2026-03-20`
- scope: create one solid custom-resume workflow for a selected job
- linked plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- code areas: `packages/job-finder`, `apps/desktop`
- current focus: the app can now analyze stored resume text, derive profile details, and generate versioned tailored resume content through an AI-provider seam with deterministic fallback
- next step: expand the template catalog, improve generated HTML output, and decide whether browser-print PDF or DOCX templating should be the next export target
- blockers: live uploads still need a more final export format than the current saved HTML artifact
- notes: cover letters stay deferred unless the main slice lands cleanly first; current tailoring keeps model output grounded in stored resume text, profile state, and job data, then renders that text through a fixed template set instead of freeform document layout generation

### `JF-05 Review-Gated Easy Apply Execution`

- status: `in_progress`
- last updated: `2026-03-20`
- scope: automate a narrow LinkedIn `Easy Apply` submission path with tracked outcomes
- linked plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- code areas: `packages/job-finder`, `packages/browser-runtime`, `apps/desktop`
- current focus: the app now records explicit apply attempts, checkpoints, submitted outcomes, and safe paused branches across both deterministic and live-browser Easy Apply execution
- next step: broaden supported field filling, add retry helpers in Applications, and QA real authenticated submit paths with exportable tailored assets
- blockers: live browser execution still depends on authenticated-session integration, selector hardening, and generated artifact upload support
- notes: stop on unsupported flows instead of guessing; paused attempts now persist locally with next-action guidance and field-level context from the browser agent

### `JF-06 AI Provider And Resume Extraction`

- status: `in_progress`
- last updated: `2026-03-20`
- scope: wire the first model-backed Job Finder agents for profile extraction, fit assessment, and resume tailoring
- linked plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- code areas: `packages/ai-providers`, `packages/job-finder`, `apps/desktop`
- current focus: OpenAI-compatible provider config is now supported through explicit env vars, deterministic fallbacks keep tests stable, and the Profile screen can analyze extracted resume text into structured candidate data
- next step: improve provider-level observability, richer fit summaries, and better extraction cleanup for difficult PDF and DOCX resumes
- blockers: model quality still depends on extracted text quality from the imported resume source
- notes: current env surface is `UNEMPLOYED_AI_API_KEY`, optional `UNEMPLOYED_AI_BASE_URL`, and optional `UNEMPLOYED_AI_MODEL`; imported `pdf` resumes extract through `pdfjs-dist`, imported `docx` resumes extract through `mammoth`, and plain-text or markdown files pass straight through

### `JF-07 Profile Information Architecture`

- status: `in_progress`
- last updated: `2026-03-20`
- scope: redesign the candidate profile data model and Profile screen so hiring-relevant details are grouped more clearly for ATS alignment, resume tailoring, and browser automation
- linked plan: `docs/exec-plans/active/003-job-finder-profile-information-architecture.md`
- code areas: `packages/contracts`, `packages/job-finder`, `apps/desktop`
- current focus: the researched profile-information-architecture slice is now live in contracts and the Profile screen, covering richer identity/contact, eligibility/logistics, summary layers, grouped skills, repeatable experience/education/certification/project/link/language records, and broader targeting preferences while staying compatible with the existing save flow
- next step: map resume-analysis output into the new structured records, then use those sections directly in tailoring prompts and apply-form answer generation
- blockers: none
- notes: the refined plan now leans on current LinkedIn, Greenhouse, Workable, and Ashby field patterns; the live implementation keeps backward compatibility by extending `CandidateProfile` and `JobSearchPreferences` with structured sections rather than replacing them outright, while still avoiding unnecessary sensitive-data collection by default

## Ready Queue

- Add richer tailored resume export/storage beyond persisted preview content.
- Expand Applications with filters, retry controls, and attempt-centric recovery views.
- Add broader runtime tests for unsupported Easy Apply branches, live-browser extraction, and resume-import flows.
- Improve cleanup and fallback extraction so difficult PDF and DOCX resumes yield cleaner structured text before the agent runs.

## Recently Completed

- `2026-03-20`: added `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md` as the first active Job Finder delivery plan
- `2026-03-20`: bootstrapped `docs/TRACKS.md` as the live workboard for parallel agent handoffs
- `2026-03-20`: consolidated the current Job Finder design references and prototype policy under `docs/Design/`
- `2026-03-20`: implemented the first typed Job Finder workspace shell with contracts, in-memory repository seams, and desktop preload wiring
- `2026-03-20`: switched the seeded Job Finder workspace to file-backed persistence and interactive desktop actions
- `2026-03-20`: upgraded Job Finder to SQLite persistence, deterministic LinkedIn discovery/apply orchestration, editable profile/settings flows, and persisted application attempts
- `2026-03-20`: added the first agent-first Job Finder foundation with an OpenAI-compatible provider seam, resume-text analysis, opt-in Playwright LinkedIn browser automation, and AI-assisted resume drafting
- `2026-03-20`: added multi-format resume ingestion (`txt`, `md`, `pdf`, `docx`) plus fixed template-driven HTML resume output for generated assets
- `2026-03-20`: fixed the Electron PDF import path by polyfilling `DOMMatrix` before `pdfjs-dist` loads, so real resume uploads no longer fail with `job-finder:import-resume`
- `2026-03-20`: fixed bundled PDF worker resolution so desktop resume import uses the installed `pdfjs-dist` worker module instead of a missing `out/main/pdf.worker.mjs` file
- `2026-03-20`: added a scripted Electron resume-import capture flow with a test-only preload bridge, so agents can validate real imported profile state and screenshots without touching the native picker manually
- `2026-03-20`: tightened deterministic resume parsing and merge behavior so imported profile summaries, locations, contact fields, and targeting data update from the actual resume instead of preserving stale seeded values
- `2026-03-20`: polished the imported-profile UI layout/dropdowns and expanded deterministic parsing for alternate summary/skills sections, with scripted screenshot validation for both settings dropdowns and resume-import output
- `2026-03-20`: reinforced the AI-provider path so FelidaeAI-Pro-2.5 is the explicit generic resume extraction engine whenever `UNEMPLOYED_AI_API_KEY` is available, with deterministic parsing kept as a safety fallback rather than the primary path
- `2026-03-20`: changed workspace reset to a true fresh-start reset that clears persisted resume/job/application data and the LinkedIn browser profile instead of reseeding the sample candidate
- `2026-03-20`: added automatic desktop `.env` / `.env.local` loading and a root `.env.example` so FelidaeAI can be activated reliably for local resume extraction without manual shell export steps
- `2026-03-20`: added persisted resume-analysis provenance in workspace state plus a visible profile badge for AI-vs-fallback parsing, and made Settings reset return the app to the cleared fresh-profile view
- `2026-03-20`: expanded the profile-information-architecture slice with researched identity/contact, eligibility, summary, skills, experience, education, certifications, projects, links, languages, and broader targeting sections in the live Profile screen instead of leaving them only in the plan
