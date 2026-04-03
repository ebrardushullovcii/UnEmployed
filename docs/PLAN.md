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

The product should feel like one cohesive system, not two unrelated tools bundled together. The shared platform is part of the product, not just plumbing.

## Product Goals

- Help manage end-to-end job search work instead of just surfacing listings.
- Keep long-lived context in the app so each new application or interview session starts with the right documents and history.
- Support both an explicit UI workflow and agent-driven actions.
- Keep the repo maintainable for AI coding agents by making boundaries typed, validated, and testable.
- Keep the app local-first so the user owns the core data, history, and context.

## Operating Model

- One desktop shell with two first-class modules.
- Shared profile, shared knowledge base, shared application history, and shared assistant across both modules.
- UI-first workflows with agent acceleration, not chat-only workflows.
- Browser-driven job workflows rather than API-only assumptions.
- Explicit module boundaries so `Job Finder` and `Interview Helper` can evolve independently without becoming separate repos.

## Tech Direction

- Monorepo: `pnpm` workspaces + `turbo`
- Language: `TypeScript`
- Desktop shell: `Electron`
- Renderer: `React`
- Contracts and validation: `zod`
- Local storage: `SQLite`
- Browser automation: `Playwright`
- AI layer: pluggable provider interfaces for STT, chat, vision, and embeddings

## Engineering Principles

- Every important external boundary should be typed and schema-validated.
- Workflow state should use explicit enums and discriminated unions rather than loose objects and booleans.
- Package public APIs are the only supported import surface.
- Renderer code should not directly own browser automation, persistence, or OS-specific behavior.
- The repo is optimized for AI coding agents, so docs, contracts, and tests must make intent recoverable without rereading the whole codebase.

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
- `Global assistant`
  - shared chat/search surface over profile, applications, documents, transcripts, and notes
  - can answer questions, draft content, and open the right workflow with context preloaded

## Shared Data Model

- `Candidate profile`
  - structured profile fields derived from imported source documents
- `Documents`
  - resumes, cover letters, job descriptions, recruiter emails, notes, and captures
- `Knowledge items`
  - indexed chunks for retrieval across both modules
- `Applications`
  - postings, statuses, generated assets, notes, reminders, and event history
- `Interview workspaces`
  - prep bundles tied to a target application or job
- `Interview sessions`
  - transcript chunks, captures, suggestions, and session timeline events

## Shared Defaults

- Local-first persistence is the source of truth.
- Browser automation is managed-profile first.
- Batch approval is the default for job submissions.
- Full application history should be queryable from the same app that drafts and submits jobs.
- Interview prep should reuse application history and stored documents instead of starting from scratch.

## Module Plan

### Job Finder

- Import and normalize CV/resume data.
- Search for jobs through browser-driven workflows.
- Bootstrap unfamiliar job sources with a debug-agent workflow that learns reusable site instructions before normal discovery agents depend on them.
- Score and summarize jobs against profile and preferences.
- Generate, edit, and approve tailored resumes, then expand into cover letters and screener answers.
- Fill applications and queue them for batch approval by default.
- Track every application in a first-class table with status history.

#### Job Finder UX Defaults

- `Profile`
  - import CV/resume documents and supporting materials
  - normalize them into reusable structured profile state
- `Discovery`
  - find jobs, score fit, and show the why behind each match
- `Review Queue`
  - inspect draft materials and approve, skip, or edit before submission
- `Resume Workspace`
  - generate, edit, validate, preview, and approve a job-specific resume before the apply step
- `Applications`
  - first-class table for tracking status, notes, dates, and next actions
- `Settings`
  - preferences for targets, browser mode, generation rules, and defaults

#### Job Finder Workflow Defaults

- Discovery is browser-agent-first, with structured connectors added where clearly useful.
- If a user adds a target without usable instructions, run a bounded debug-agent workflow to map auth, navigation, search, filters, and job-detail access before treating that source as reusable.
- Submission mode defaults to batch approval.
- Generated outputs should stay grounded in imported documents, structured profile data, saved preferences, and bounded employer research that never invents candidate facts.
- Long-form generated answers are allowed as part of the workflow, but they should still be source-backed.
- Reminders and application event history are part of the core workflow, not an afterthought.

#### Job Application Status Baseline

- `discovered`
- `shortlisted`
- `drafting`
- `ready_for_review`
- `approved`
- `submitted`
- `assessment`
- `interview`
- `rejected`
- `offer`
- `withdrawn`
- `archived`

### Interview Helper

- Build a prep workspace from resume, job description, emails, notes, and application history.
- Provide a full chat/panel experience for interview prep and follow-up drafting.
- Run a live session with transcript-aware context and capture support.
- Show compact cues in a separate overlay window while preserving a full panel for deeper context.
- Persist transcripts, captures, and generated suggestions locally for later review.

#### Interview Helper UX Defaults

- `Prep Workspace`
  - assemble the target context before a live session
- `Live Session Panel`
  - full companion panel for deeper context and chat
- `Overlay`
  - compact cue surface for live use
- `Session History`
  - revisit prior transcripts, captures, and suggestions
- `Settings`
  - audio source, capture behavior, and model/provider defaults

#### Interview Helper Workflow Defaults

- Prep uses the selected application, resume variant, job description, emails, notes, and uploaded context.
- Live sessions combine transcript stream, rolling context, and captures.
- The overlay is a consumer of live session state, not the owner of it.
- Hotkeys, tray controls, and window policy must stay behind OS adapters.
- Platform-specific display and capture behavior should remain isolated behind adapters rather than leaking into module logic.

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

## Quality Bar

- Unit, contract, integration, and end-to-end tests should exist for important public behavior as the implementation grows.
- Deterministic fixtures and fake providers are preferred over live third-party dependencies in tests.
- Docs should be updated as part of the same work when behavior, architecture, contracts, or delivery shape changes.
- Durable knowledge belongs in repo docs, not in chat history.

## Agent Workflow Rules

- Use `AGENTS.md` and `docs/README.md` as the navigation layer.
- Use this document for durable product and rollout context.
- Use `docs/STATUS.md` for what is active right now.
- Use `docs/exec-plans/` for task- or PR-scoped implementation handoff.
- Keep durable decisions in `docs/decisions/`, not in chat history.
- If a change is being prepared for commit or PR handoff, update the relevant docs in the same task.
