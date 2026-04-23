# Project Plan

Use this doc for durable direction. Use `docs/STATUS.md` and `docs/TRACKS.md` for current work.

## End Goal

Build one dependable desktop app that owns the full loop:

- maintain a strong reusable candidate profile and document base
- discover, tailor, review, track, and safely apply to jobs in `Job Finder`
- prepare for and support live interviews in `Interview Helper`
- keep important context local so the system improves over time

## Product Shape

- one Electron desktop app
- two modules: `Job Finder` and `Interview Helper`
- one shared local profile, knowledge base, application history, and assistant surface

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

1. shared repo, docs, shell, contracts, and persistence
2. `Job Finder` core profile, import, discovery, resume, and apply workflows
3. `Interview Helper` prep and live-session workflows
4. hardening, packaging, and platform parity

## Engineering Rules

- keep external boundaries typed and schema-validated
- keep package public APIs as the only supported import surface
- keep browser, persistence, and OS behavior out of renderer-owned code
- keep durable knowledge in repo docs, not chat history
