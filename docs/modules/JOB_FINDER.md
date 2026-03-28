# Job Finder

## Purpose

Owns job discovery, drafting, application review, submission orchestration, and application tracking.

## Early Scope

- Candidate profile import and normalization
- Browser-driven LinkedIn discovery
- Job-source debug-agent bootstrap for unfamiliar discovery targets
- Custom per-job resume generation
- Review-gated `Easy Apply` workflow for supported paths
- Applications table with status, notes, attempt history, and failure reasons

## Active Slice

- Current execution plan: `docs/exec-plans/active/002-job-finder-linkedin-easy-apply.md`
- Discovery expansion plan: `docs/exec-plans/active/004-job-finder-adapter-driven-discovery.md`
- Next planned source-bootstrap plan: `docs/exec-plans/active/005-job-source-debug-agent.md`
- Next planned production-copy pass: `docs/exec-plans/active/006-profile-discovery-production-copy-pass.md`
- First source target: `LinkedIn`
- First submission path: `Easy Apply` only
- First approval mode: `review-before-submit`

## Current Implementation Snapshot

- Typed Job Finder contracts now cover profile/contact fields, stored resume-text extraction state, saved jobs, tailored assets, browser session state, application records, agent-provider status, and the desktop workspace snapshot
- The desktop app renders `Profile`, `Discovery`, `Review Queue`, `Applications`, and `Settings` surfaces, with the Profile screen now centered on top-of-page resume intake and simpler add/remove editors for list-style candidate data
- Desktop capture tooling now includes a profile-baseline flow that can hydrate a saved imported-profile snapshot and capture top-level shell tabs plus scrolled screenshots of every Profile subtab before renderer refactors land
- Job Finder now supports an OpenAI-compatible provider seam for resume-text profile extraction, job-fit assessment, and resume tailoring, with deterministic fallbacks kept in place for tests and offline use
- Browser discovery can run either through the deterministic catalog seed or an opt-in dedicated Chrome-profile LinkedIn browser agent backed by a user-authenticated local profile
- Discovery targets already leave room for per-target custom instructions, and the next planned extension is a debug-agent workflow that can learn and verify those instructions for newly added sources from the Profile Preferences flow
- The Discovery full-history view now keeps the current in-flight run visible alongside retained runs, marks the live run clearly, and auto-follows new activity until the user scrolls away
- The next planned UI polish pass keeps the current Profile fields and overall Discovery structure but trims developer-oriented copy, low-value statuses, and other text noise before broader capability expands again
- Desktop actions can import `txt`, `md`, `pdf`, and `docx` resumes, reset stale profile/search state before re-analysis, extract resume text for the profile agent, analyze that text into structured candidate details including grouped skills and repeatable records, supplement partial model output with deterministic cleanup, render generated resume text into a fixed template set, and create tracked apply attempts through typed preload flows
- The next profile-model redesign is documented in `docs/exec-plans/active/003-job-finder-profile-information-architecture.md`, now refined against current LinkedIn, Greenhouse, Workable, and Ashby patterns with a proposed split between candidate identity, eligibility, background, job-search preferences, and profile artifacts so the UI can separate ATS-critical facts from AI-derived resume content

## Agent Runtime Configuration

- `UNEMPLOYED_AI_API_KEY`: enables the OpenAI-compatible provider path
- `UNEMPLOYED_AI_BASE_URL`: optional override for the provider base URL; defaults to `https://ai.automatedpros.link/v1`
- `UNEMPLOYED_AI_MODEL`: optional override for the provider model; defaults to `FelidaeAI-Pro-2.5`
- `UNEMPLOYED_LINKEDIN_BROWSER_AGENT=0`: disables the dedicated Chrome-profile LinkedIn browser agent and falls back to the deterministic catalog runtime; desktop builds now enable the browser agent by default when this variable is unset
- `UNEMPLOYED_CHROME_PATH`: optional override for the local Chrome executable the agent should launch
- `UNEMPLOYED_CHROME_DEBUG_PORT`: optional override for the dedicated Chrome remote-debugging port; defaults to `9333`
- `UNEMPLOYED_BROWSER_HEADLESS=1`: optional headless mode for the dedicated browser agent when live browser UI is not required

## Resume Document Strategy

- Input sources: plain text, Markdown, PDF, and DOCX resumes are imported and normalized into stored text before the AI profile/tailoring agent runs
- Extraction path: `pdfjs-dist` handles PDF text recovery, `mammoth` handles DOCX raw-text extraction, and plain-text sources pass through directly
- Output path: the AI agent produces the resume text and section content, then Job Finder renders that content into a small fixed template set instead of asking the model to invent document layout from scratch
- Current artifact shape: generated resumes save a local HTML template file plus the underlying generated text content so the formatting layer stays inspectable and replaceable later

## Package Boundaries

- Contracts from `packages/contracts`
- Browser control from `packages/browser-runtime`
- Storage from `packages/db`
- Shared retrieval from `packages/knowledge-base`
