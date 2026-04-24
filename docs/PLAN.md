# Project Plan

Use this doc for durable direction. Use `docs/STATUS.md` and `docs/TRACKS.md` for current work.

## End Goal

Build one local-first desktop app for profile/document memory, job discovery through safe non-submitting apply, and interview prep/live support.

## Product Shape

- one Electron desktop app
- modules: `Job Finder`, `Interview Helper`
- shared profile, knowledge base, application history, assistant surface

## Durable Product Decisions

- local-first persistence is the source of truth
- workflows are UI-first with agent acceleration, not chat-only
- browser-driven job workflows are a first-class product surface
- typed contracts and package boundaries matter more than convenience imports
- shared data should be reused instead of rebuilt per workflow

## Shared Platform

- candidate profile and reusable answers
- document ingestion and retrieval
- application CRM and history
- browser runtime and source intelligence
- desktop shell, tray, hotkeys, and settings
- shared assistant over profile, jobs, applications, and documents

## Delivery Order

1. shared repo, docs, shell, contracts, persistence
2. `Job Finder` profile, import, discovery, resume, apply
3. `Interview Helper` prep and live-session workflows
4. hardening, packaging, platform parity

## Engineering Rules

- keep external boundaries typed and schema-validated
- keep package public APIs as the only supported import surface
- keep browser, persistence, and OS behavior out of renderer-owned code
- keep durable knowledge in repo docs, not chat history
