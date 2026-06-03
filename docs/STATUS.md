# Status

Read this only for active feature work, handoff updates, broad repo changes, or unclear current state.

## Current Truth

- Active work: none
- Completed baseline: desktop app, typed Electron boundaries, SQLite persistence, guided setup, profile copilot, discovery/source-debug, resume workspace, safe non-submitting apply, and the first integrated Interview Helper live-session workflow
- No active exec plan is open

## Durable Constraints

- Keep `packages/job-finder` as orchestration owner for Job Finder workflows.
- Keep `packages/browser-agent` for workflow policy, prompts, and structured browser outputs.
- Keep `packages/browser-runtime` generic.
- Keep discovery and source-debug source-generic; board-specific rescue logic in core flow is debt, not a pattern.
- Keep contracts typed and schema-validated.
- Keep live submit disabled unless explicitly re-authorized.
- Keep browser/apply visual output evidence-only; selectors, browser actions, saved-job behavior, generated answers, final-submit guidance, and site-specific workflow rules must not cross visual schemas.
- Keep Interview Helper capture, screenshots, overlays, cue generation, retention, and Job Finder write-back explicit, visible, auditable, and adapter-owned.
- Treat overlay protection as capability state with verification evidence, not a boolean.

## Reopenable Follow-Ups

- Validate Interview Helper macOS/Linux hardware behavior on target hosts.
- Add authorized meeting-platform caption or full capture-exclusion integrations only through approved platform paths.
- Continue reducing real-app `Check source` cost when fresh full-app evidence shows product friction.
- Clean persisted title/company quality when extracted jobs are otherwise useful and a concrete pattern is observed.
- Add resume-quality benchmark corpus cases only when fresh real outputs expose a missing regression class.
- Expand Applications recovery and retry tooling when concrete recovery failures appear.

## References

- Current goals: `docs/GOALS.md`
- Current tracks: `docs/TRACKS.md`
- Product baseline: `docs/PRODUCT.md`
- Architecture rules: `docs/ARCHITECTURE.md`
- Decisions: `docs/adr/README.md`
- Milestones: `docs/HISTORY.md`
