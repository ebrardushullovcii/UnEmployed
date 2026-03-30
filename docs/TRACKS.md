# Tracks

`STATUS.md` answers "what is happening in the repo right now?"

`TRACKS.md` answers "what workstreams exist, what is already being worked on, and what can another agent pick up next?"

Use one track per meaningful workstream, not per person or per chat.

## How To Use This File

- Read `docs/STATUS.md`, then `docs/TRACKS.md`, then the linked exec plan before starting non-trivial work.
- If you take a track, update its `status`, `last updated`, `current focus`, and `next step`.
- If you stop mid-stream, set the track to `handoff` or `blocked` and leave the next concrete action.
- Keep deep implementation detail in the linked exec plan or module docs; keep this file short and current.
- Keep longer completed-history context in `docs/HISTORY.md`, not in active track notes.
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
- last updated: `2026-03-21`
- scope: define the minimal Job Finder schemas and repository seams for the supported apply path slice
- linked plan: `docs/exec-plans/active/002-job-finder-browser-apply.md`
- code areas: `packages/contracts`, `packages/db`
- current focus: typed Job Finder contracts now include discovery/apply attempt data and the desktop repository is SQLite-backed
- next step: add richer migration coverage and resume artifact storage once live browser execution adds more schema pressure
- blockers: none
- notes: current implementation persists profile, preferences, saved jobs, tailored assets, application records, and apply attempts into a local SQLite database with a legacy JSON fallback path

### `JF-02 Job Finder Screen Design`

- status: `done`
- last updated: `2026-03-23`
- scope: design the MVP screens and states for the first Job Finder slice
- linked plan: `docs/exec-plans/active/002-job-finder-browser-apply.md`
- linked brief: `docs/exec-plans/active/002-job-finder-browser-apply-ui-brief.md`
- code areas: `docs/Design`, `apps/desktop`
- current focus: finalized visual references are implemented as a first interactive desktop shell with native mac traffic lights, a centered title-row navigation cluster, compact top-right summary cards, a gear-based Settings control, page-level UI QA refinements, and standard max-width shell constraints so ultra-wide windows keep comfortable readable gutters
- next step: keep using the desktop UI capture workflow to tighten shell density, applications detail behavior, and compact-size usability before deeper functionality expands
- blockers: none
- notes: screenshots are the primary visual target; `mockup.html` files are prototype-only references and the design set is directional rather than feature-complete; use `pnpm --filter @unemployed/desktop ui:capture` for screenshot-based shell review, `pnpm --filter @unemployed/desktop ui:profile-baseline` for the current preferred imported-profile baseline before larger refactors, and the reset action in Settings to restore the seeded workspace quickly; the current polish pass improved count-badge padding, stat label/value spacing, replaced the oversized sidebar with a centered title-row nav and compact top-right stat cards, restored suite tabs to the very top, made the left wordmark larger and bolder while tightening it to the edge, removed stat-card captions so only labels and numbers remain, aligned nav/card/settings controls more cleanly on a shared compact height, kept native mac title-bar behavior, removed the ready and updated chips, reduced top-bar hover noise, tightened button sizing, synced fullscreen state, balanced oversized panels, improved page-level active-state clarity, preserved compact-height readability, supported the documented `1024x768` review size in the real window, shared centered top-tab styling across Mac and Windows, and used `lucide-react` for shell icons instead of custom inline SVGs

### `JF-03 Browser Runtime And Target-Site Discovery`

- status: `done`
- last updated: `2026-03-26`
- scope: build the generic browser primitives and the first target-site discovery boundary
- linked plan: `docs/exec-plans/active/002-job-finder-browser-apply.md`
- code areas: `packages/browser-runtime`, `packages/job-finder`, `packages/browser-agent`
- current focus: completed AI browser agent implementation with LLM tool calling for autonomous target-site job discovery; agent controls navigation strategy, timeouts, retry logic; targets up to the configured job count from the configured target using the user's profile; includes URL validation (single-target), AbortController cancellation, and compact conversation management
- next step: monitor real-world usage for edge cases in auth recovery, pagination handling, and selector robustness
- blockers: none
- notes: AI browser agent replaces old deterministic discovery; keeps source selectors out of the generic runtime; discovery writes through repository boundary with deduping; includes cancellation support via `job-finder:cancel-agent-discovery` IPC

### `JF-04 Tailored Resume Path`

- status: `in_progress`
- last updated: `2026-03-20`
- scope: create one solid custom-resume workflow for a selected job
- linked plan: `docs/exec-plans/active/002-job-finder-browser-apply.md`
- code areas: `packages/job-finder`, `apps/desktop`
- current focus: the app can now analyze stored resume text, derive profile details, and generate versioned tailored resume content through an AI-provider seam with deterministic fallback
- next step: expand the template catalog, improve generated HTML output, and decide whether browser-print PDF or DOCX templating should be the next export target
- blockers: live uploads still need a more final export format than the current saved HTML artifact
- notes: cover letters stay deferred unless the main slice lands cleanly first; current tailoring keeps model output grounded in stored resume text, profile state, and job data, then renders that text through a fixed template set instead of freeform document layout generation

### `JF-05 Review-Gated Easy Apply Execution`

- status: `in_progress`
- last updated: `2026-03-20`
- scope: automate a narrow supported apply path submission path with tracked outcomes
- linked plan: `docs/exec-plans/active/002-job-finder-browser-apply.md`
- code areas: `packages/job-finder`, `packages/browser-runtime`, `apps/desktop`
- current focus: the app now records explicit apply attempts, checkpoints, submitted outcomes, and safe paused branches across both deterministic and live-browser Easy Apply execution
- next step: broaden supported field filling, add retry helpers in Applications, and QA real authenticated submit paths with exportable tailored assets
- blockers: live browser execution still depends on authenticated-session integration, selector hardening, and generated artifact upload support
- notes: stop on unsupported flows instead of guessing; paused attempts now persist locally with next-action guidance and field-level context from the browser agent

### `JF-06 AI Provider And Resume Extraction`

- status: `in_progress`
- last updated: `2026-03-24`
- scope: wire the first model-backed Job Finder agents for profile extraction, fit assessment, and resume tailoring
- linked plan: `docs/exec-plans/active/002-job-finder-browser-apply.md`
- code areas: `packages/ai-providers`, `packages/job-finder`, `apps/desktop`
- current focus: resume analysis now maps into grouped skills, professional-summary fields, structured experience records, public links, and spoken languages, the OpenAI-compatible path now falls back to deterministic field completion when model output is partial or inconsistent on real imported resumes, and deterministic personal-website inference now ignores arbitrary platform/employer/course links unless they look like a true top-level personal site
- next step: improve provider-level observability, richer fit summaries, and broader structured extraction coverage for education, certifications, and projects on difficult PDF and DOCX resumes
- blockers: model quality still depends on extracted text quality from the imported resume source
- notes: current env surface is `UNEMPLOYED_AI_API_KEY`, optional `UNEMPLOYED_AI_BASE_URL`, and optional `UNEMPLOYED_AI_MODEL`; imported `pdf` resumes extract through `pdfjs-dist`, imported `docx` resumes extract through `mammoth`, and plain-text or markdown files pass straight through

### `JF-07 Profile Information Architecture`

- status: `in_progress`
- last updated: `2026-03-25`
- scope: redesign the candidate profile data model and Profile screen so hiring-relevant details are grouped more clearly for ATS alignment, resume tailoring, and browser automation
- linked plan: `docs/exec-plans/active/003-job-finder-profile-information-architecture.md`
- code areas: `packages/contracts`, `packages/job-finder`, `apps/desktop`
- current focus: the live profile surface now keeps resume import and analysis in a persistent top panel, uses simpler review tabs for basics, experience, background, and preferences, shows tab-level completion progress based on filled inputs, opens repeatable records inside collapsible cards to reduce vertical noise, preserves current profile/search data until a replacement resume is actually analyzed, saves profile-plus-preference edits atomically, announces validation/save feedback through polite live regions, has a repeatable screenshot-baseline workflow that now reuses the shared workspace-input hydrate path, uses flatter neutral panel-versus-field tones, keeps mixed-height rows top-aligned, and renders Discovery search controls inside one wider contained left-rail surface
- next step: keep using screenshot passes to polish the remaining dense profile editors plus discovery/review/applications composition, then extend extraction/tailoring to rely more directly on education, certification, and project records
- blockers: none
- notes: the refined plan now leans on current ATS and hiring-platform field patterns; the live implementation keeps backward compatibility by extending `CandidateProfile` and `JobSearchPreferences` with structured sections rather than replacing them outright, while still avoiding unnecessary sensitive-data collection by default; the current preferred imported-profile visual state is documented locally via `docs/Design/job-finder-profile/current-branch-baseline-2026-03-23.md` and `apps/desktop/test-artifacts/ui/profile-visual-baseline-2026-03-23/`; the profile page now treats resume import as the source layer above the edit tabs instead of a sibling tab, Discovery zero-results now intentionally collapses into a two-column state so blank searches no longer render a broken empty detail column, the left rail is now a single contained control card with the action footer inside it, compact desktop captures at `1024x768` and `1100x720` now complete without the title-row nav being blocked by top-right stat cards, and the current PR-review hardening pass also tightened keyboard/ARIA semantics for record selection and list editing, fixed singular-vs-plural application-record labels, and prevents invalid extracted link/project/language payloads from wiping saved profile data while review-only actions stay visibly disabled until implemented

### `JF-08 Adapter-Driven Discovery And Activity Timeline`

- status: `in_progress`
- last updated: `2026-03-28`
- scope: refactor the current single-target browser agent into an adapter-driven multi-target discovery system with a chat-like activity timeline and future-ready worker orchestration
- linked plan: `docs/exec-plans/active/004-job-finder-adapter-driven-discovery.md`
- code areas: `packages/contracts`, `packages/job-finder`, `packages/browser-agent`, `packages/browser-runtime`, `apps/desktop`
- current focus: nested discovery contracts, retained run history, activity-event translation, adapter-scoped session state, target normalization, sequential multi-target orchestration, and desktop target/timeline UI are now landed together, including a full-history modal that can keep following the current live run
- next step: run broader live QA against a few authenticated target sites, then tighten selector robustness, low-confidence skips, and timeline wording based on real traces
- blockers: none
- notes: multi-target discovery shipped sequentially first with persisted pending jobs, recent run history, discovery provenance, and a read-only activity timeline; the full-history modal now includes the current live run with auto-follow-until-scroll-away behavior; the generic target-site path remains hostname-bounded, and bounded parallel workers remain a later feature once event ordering, cancellation, and session behavior are stable

### `JF-09 Job Source Debug Agent`

- status: `handoff`
- last updated: `2026-03-30`
- scope: bootstrap reusable source instructions for newly added discovery targets when the user cannot author them manually
- linked plan: `docs/exec-plans/active/005-job-source-debug-agent.md`
- code areas: `packages/contracts`, `packages/job-finder`, `packages/browser-agent`, `packages/browser-runtime`, `apps/desktop`
- current focus: source-debug now forces a final phase-closeout turn near step limits, persists typed completion-mode plus phase-evidence metadata on attempts and phase summaries, synthesizes partial-evidence findings instead of dropping them silently when a worker times out without `finish`, keeps those partial runs in `draft`, exposes a typed run-details IPC path, gives Profile Preferences a compact review modal with per-phase outcome, end-reason, evidence-count, and accept/verify actions, uses only the active accepted-or-validated instruction artifact for the matching target during live discovery/apply, ties the visible browser window to live discovery/source-debug run lifetime by opening it when the run starts and closing it when the run ends, explicitly terminates the spawned Chrome process on run shutdown, gives the worker a `scroll_to_top` escape hatch so it can re-probe header search/filter controls after exploring long landing pages, now hands richer per-phase timestamps, attempted actions, compaction state, and ephemeral review-transcript lines into a dedicated end-of-run instruction reviewer before persistence, and explicitly frames learned artifacts as future-run instructions instead of sampled-run reports
- next step: rerun live source-debug on a few distinct target sites, verify that the final reviewer keeps later proven guidance while dropping earlier failed duplicates, confirm recommendation modules can flow into fuller search/filter pages when those routes exist, verify that homepage text search plus visible city or industry selects are captured when present, and tighten any remaining DOM-first control heuristics if the live runs still miss obvious visible controls
- blockers: none
- notes: source-debug stays artifact-first and does not persist raw worker chat by default; the orchestrator stores active/recent run summaries in discovery state while dedicated repository collections retain runs, attempts, evidence refs, and instruction artifacts; replay verification is the current promotion gate for validated instructions, and apply-path guidance currently means safe apply-entry instructions rather than autonomous submission for arbitrary sources; the newest draft or validated artifact for a target is now active automatically for that same target during discovery/apply, and the Profile target card exposes inline edit/remove controls for each learned instruction row; source-debug now lets the worker report auth blockers during the access phase instead of pre-pausing the run based on a single-target session preflight, a fresh `Debug source` rerun clears prior learned instructions for that target before rebuilding them, the browser-agent now falls back to visible DOM controls when `ariaSnapshot()` under-reports obvious search/filter/`show all` surfaces, transcript compaction now keeps matching assistant tool-call messages with their tool results so provider tool-calling sessions remain valid, validation now requires at least one positively proven reusable search/filter or recommendation-route signal instead of accepting only “not proven” search coverage, timeout-only partial evidence now stays reviewable in run details without qualifying the learned instruction artifact for validation, the new final reviewer consumes richer phase-level review packets at the end rather than bloating the worker prompt context mid-run, and extraction/sample-size chatter such as `0 or 1 jobs extracted` is now treated as non-instructional noise unless it reflects a durable site constraint

### `JF-10 Profile And Discovery Production Copy Pass`

- status: `ready`
- last updated: `2026-03-27`
- scope: remove low-value, verbose, and developer-oriented text from the Profile and Discovery flows so the shipped UI reads like a product rather than an internal prototype
- linked plan: `docs/exec-plans/active/006-profile-discovery-production-copy-pass.md`
- code areas: `apps/desktop`, `packages/job-finder`, `docs/Design`
- current focus: define a cleanup pass that keeps the current fields and overall UI structure but trims noisy statuses, over-explained helper copy, and internal-language labels that do not help end users
- next step: audit every visible label, helper text, badge, status, empty state, and timeline phrase in Profile and Discovery, then group each item into keep, rewrite, simplify, or remove before implementation starts
- blockers: none
- notes: this pass should bias toward shorter user-facing copy, fewer badges and status callouts, and less exposure of implementation concepts unless they directly help the user complete a task or recover from a problem

## Ready Queue

- Add richer tailored resume export/storage beyond persisted preview content.
- Expand Applications with filters, retry controls, and attempt-centric recovery views.
- Add broader runtime tests for unsupported Easy Apply branches, live-browser extraction, and resume-import flows.
- Improve cleanup and fallback extraction so difficult PDF and DOCX resumes yield cleaner structured text before the agent runs.

## Recently Completed

- `2026-03-26`: completed AI browser agent for autonomous target-site job discovery with LLM tool calling; new `@unemployed/browser-agent` package; replaced deterministic discovery with AI-driven "Run AI Agent Discovery" button; targets up to the configured job count from the configured target using the user's profile preferences; includes cancellation support and URL validation
- `2026-03-30`: added a final source-instruction reconciliation pass so the source-debug orchestrator now deduplicates stronger guidance by family, prefers later proven controls and routes over earlier weaker failure notes, and persists fewer contradictory learned-instruction lines
- `2026-03-30`: added a dedicated end-of-run source-instruction reviewer fed with richer phase timestamps, attempted actions, compaction summaries, and ephemeral review-transcript lines so final curation can resolve contradictions with more context than the synthesized findings alone
- `2026-03-30`: tightened source-debug prompts and curation so learned artifacts are framed as future-run instructions rather than sampled-run reports, and filtered extraction/sample-size chatter such as `0 or 1 jobs extracted` out of the final artifact
- `2026-03-24`: tightened repo guidance so the root and desktop `AGENTS.md` files, `docs/README.md`, `docs/AGENT_CONTEXT.md`, and `docs/STATUS.md` now separate navigation, handoff, and history more cleanly
- `2026-03-24`: configured PR-only `main` governance with a live GitHub ruleset, added repo-local CodeRabbit defaults, and checked in `.github/CODEOWNERS` naming `@ebrardushullovcii` plus `@vigani1` as the intended merge maintainers
- `2026-03-24`: added a root `pnpm desktop:dev` shortcut and updated repo docs so local desktop startup no longer depends on the longer workspace-filter command
- `2026-03-20`: added `docs/exec-plans/active/002-job-finder-browser-apply.md` as the first active Job Finder delivery plan
- `2026-03-20`: bootstrapped `docs/TRACKS.md` as the live workboard for parallel agent handoffs
- `2026-03-20`: consolidated the current Job Finder design references and prototype policy under `docs/Design/`
- `2026-03-20`: implemented the first typed Job Finder workspace shell with contracts, in-memory repository seams, and desktop preload wiring
- `2026-03-20`: switched the seeded Job Finder workspace to file-backed persistence and interactive desktop actions
- `2026-03-20`: upgraded Job Finder to SQLite persistence, deterministic browser discovery/apply orchestration, editable profile/settings flows, and persisted application attempts
- `2026-03-20`: added the first agent-first Job Finder foundation with an OpenAI-compatible provider seam, resume-text analysis, opt-in Playwright browser automation, and AI-assisted resume drafting
- `2026-03-20`: added multi-format resume ingestion (`txt`, `md`, `pdf`, `docx`) plus fixed template-driven HTML resume output for generated assets
- `2026-03-20`: fixed the Electron PDF import path by polyfilling `DOMMatrix` before `pdfjs-dist` loads, so real resume uploads no longer fail with `job-finder:import-resume`
- `2026-03-20`: fixed bundled PDF worker resolution so desktop resume import uses the installed `pdfjs-dist` worker module instead of a missing `out/main/pdf.worker.mjs` file
- `2026-03-20`: added a scripted Electron resume-import capture flow with a test-only preload bridge, so agents can validate real imported profile state and screenshots without touching the native picker manually
- `2026-03-20`: tightened deterministic resume parsing and merge behavior so imported profile summaries, locations, contact fields, and targeting data update from the actual resume instead of preserving stale seeded values
- `2026-03-20`: polished the imported-profile UI layout/dropdowns and expanded deterministic parsing for alternate summary/skills sections, with scripted screenshot validation for both settings dropdowns and resume-import output
- `2026-03-20`: reinforced the AI-provider path so FelidaeAI-Pro-2.5 is the explicit generic resume extraction engine whenever `UNEMPLOYED_AI_API_KEY` is available, with deterministic parsing kept as a safety fallback rather than the primary path
- `2026-03-20`: changed workspace reset to a true fresh-start reset that clears persisted resume/job/application data and the browser-agent profile instead of reseeding the sample candidate
- `2026-03-20`: added automatic desktop `.env` / `.env.local` loading and a root `.env.example` so FelidaeAI can be activated reliably for local resume extraction without manual shell export steps
- `2026-03-20`: added persisted resume-analysis provenance in workspace state plus a visible profile badge for AI-vs-fallback parsing, and made Settings reset return the app to the cleared fresh-profile view
- `2026-03-20`: expanded the profile-information-architecture slice with researched identity/contact, eligibility, summary, skills, experience, education, certifications, projects, links, languages, and broader targeting sections in the live Profile screen instead of leaving them only in the plan
- `2026-03-20`: fixed the structured Profile save path so half-filled repeatable cards persist as drafts, integer-only numeric fields validate before IPC, and link/credential URLs plus link kinds are enforced at the contract boundary
- `2026-03-21`: simplified the Profile screen around top-of-page resume intake plus add/remove list editors, and expanded resume-analysis mapping into grouped skills, professional summary fields, structured experience records, links, and spoken languages
- `2026-03-21`: split the long Profile screen into focused tabs for resume, core profile, experience, background details, and preferences so editing is easier without a long scrolling form
- `2026-03-21`: validated a real `Resume.pdf` import through the desktop capture harness, reset stale seeded profile/search data before analysis, and tightened extraction cleanup so imported tabs hold more trustworthy resume-derived values
- `2026-03-21`: polished the Profile tabs with a single save action, quieter resume text editing, stacked section layout for dense tabs, compact chip-style list editing, and fallback timezone inference from imported location data
- `2026-03-21`: hid the raw resume-text editor from the Profile tab, replaced most chip-based list editors with multiline scroll areas, and tightened the remaining skill-bucket chip containers for clearer dense editing
- `2026-03-21`: removed textarea resizing across the Profile tabs so long-form fields stay fixed-height with scroll, and rebalanced skill-bucket editor sizing so add buttons and chip containers read more consistently
- `2026-03-21`: kept sparse skill buckets from stretching visually and expanded resume extraction defaults so location context can now infer likely salary currency as well as timezone when confidence is high
- `2026-03-21`: added centered max-width constraints to the desktop title bar and main content so the shell follows a more standard container pattern on large and zoomed-out displays


