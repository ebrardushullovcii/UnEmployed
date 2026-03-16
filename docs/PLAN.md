# Project Plan

## End Goal

Build one dependable desktop application that manages the full loop of a job search:
- keep a high-quality, reusable candidate profile and document base
- discover, evaluate, tailor, track, and submit job applications through the `Job Finder`
- prepare for and support live interviews through the `Interview Helper`
- preserve all important context locally so future applications and interviews get smarter over time

The long-term target is not a loose collection of tools. It is one cohesive system with shared memory, shared workflows, and clear module boundaries.

## Product Shape

`UnEmployed` is one desktop application with two major modules:
- `Job Finder`
- `Interview Helper`

The app shares one local profile, one document/context store, one applications database, and one global assistant/chat surface.

## Product Goals

- Help manage end-to-end job search work instead of just surfacing listings.
- Keep long-lived context in the app so each new application or interview session starts with the right documents and history.
- Support both an explicit UI workflow and agent-driven actions.
- Keep the repo maintainable for AI coding agents by making boundaries typed, validated, and testable.

## Tech Direction

- Monorepo: `pnpm` workspaces + `turbo`
- Language: `TypeScript`
- Desktop shell: `Electron`
- Renderer: `React`
- Contracts and validation: `zod`
- Local storage: `SQLite`
- Browser automation: `Playwright`
- AI layer: pluggable provider interfaces for STT, chat, vision, and embeddings

## Shared Platform

- `Candidate profile`
  - imported resumes and supporting documents
  - normalized structured profile data
  - reusable answers and preferences
- `Knowledge base`
  - resumes, job descriptions, recruiter emails, notes, transcripts, and captures
  - local indexing and retrieval across both modules
- `Application CRM`
  - postings, statuses, events, reminders, and generated document variants
- `Browser runtime`
  - managed browser sessions first
  - optional attach/import path for existing Chrome sessions later
- `Desktop shell`
  - tray, hotkeys, module navigation, settings, and window management

## Module Plan

### Job Finder

- Import and normalize CV/resume data.
- Search for jobs through browser-driven workflows.
- Score and summarize jobs against profile and preferences.
- Generate tailored resumes, cover letters, and screener answers.
- Fill applications and queue them for batch approval by default.
- Track every application in a first-class table with status history.

### Interview Helper

- Build a prep workspace from resume, job description, emails, notes, and application history.
- Provide a full chat/panel experience for interview prep and follow-up drafting.
- Run a live session with transcript-aware context and capture support.
- Show compact cues in a separate overlay window while preserving a full panel for deeper context.
- Persist transcripts, captures, and generated suggestions locally for later review.

## Delivery Order

### Phase 1

- Repo foundation
- Canonical docs and agent context
- Desktop shell scaffold
- Shared contracts bootstrap

### Phase 2

- Profile import and normalization
- Database layer and knowledge-base foundations
- Initial app navigation and settings

### Phase 3

- First Job Finder vertical slice
- Job discovery, review queue, applications table, and draft generation

### Phase 4

- Expanded Job Finder workflows
- Form filling, submission orchestration, reminders, and event history

### Phase 5

- First Interview Helper vertical slice
- Prep workspace, transcript pipeline, overlay shell, and session history

### Phase 6

- Hardening
- Windows parity
- Native helper fill-ins where Electron is not enough
- Performance, recovery flows, and packaging

## Agent Workflow Rules

- Use `AGENTS.md` and `docs/README.md` as the navigation layer.
- Use this document for durable product and rollout context.
- Use `docs/STATUS.md` for what is active right now.
- Use `docs/exec-plans/` for task- or PR-scoped implementation handoff.
- Keep durable decisions in `docs/decisions/`, not in chat history.
- If a change is being prepared for commit or PR handoff, update the relevant docs in the same task.
