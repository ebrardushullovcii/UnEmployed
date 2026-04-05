# Product

## Suite Shape

`UnEmployed` is one desktop app with two modules:
- `Job Finder`
- `Interview Helper`

The shared platform owns profile data, document ingestion, search, AI providers, browser sessions, and local persistence.

## Job Finder

- Import and normalize resumes and supporting documents
- Discover jobs through browser-driven workflows across configured targets
- Bootstrap unfamiliar job sources with a debug agent that learns auth, navigation, search, filter, and job-detail instructions for later runs
- Draft and edit tailored application materials in a dedicated resume workspace
- Current shipped behavior fills supported forms and routes applications through review before submission; queued follow-on work may widen this into more autonomous bounded automation later
- Track statuses, notes, and reminders in a first-class application table

## Interview Helper

- Build an interview prep workspace from resume, job description, emails, and notes
- Run a live session with transcript-aware context
- Show short cues in an overlay and deeper context in a full panel
- Persist transcripts, captures, and generated suggestions locally

## Product Defaults

- Desktop shell: Electron
- Browser runtime: Playwright with managed sessions first
- Storage: local-first SQLite
- AI runtime: provider abstraction with separate STT, chat, and vision roles

