# Status

Read this only for active feature work, handoff updates, broad repo changes, or unclear current state.

## Current Truth

- Active work: none
- Completed baseline: desktop app, typed Electron boundaries, SQLite persistence, guided setup, profile copilot, discovery/source-debug, resume workspace, original-or-tailored application CV selection, safe non-submitting apply, and the first integrated Interview Helper live-session workflow
- Fresh Windows evidence now covers an 80-result real-PDF resume replay, a discovery-only comparison against complete current Remote/Greenhouse and Aircall/Lever inventories with rendered requirement/resume evidence, dynamically selected current Greenhouse and Ashby vacancies from synthetic resume import through their final pre-submit checkpoints in original-CV mode, an anonymous current Workday vacancy through its explicit sign-in handoff, visible persisted Interview chat, movable answer/transcript native popup windows that restore their exact positions after an end/restart cycle, image attachments, local Whisper, microphone/system-audio ingestion, a real Stremio loopback session through cue/chat/pause/resume/review/export, and the target-generic prepare-only browser driver
- Interview cue quality now rejects invented personal STAR stories, removes false screenshot-access disclaimers when model-backed vision evidence exists, and explicitly degrades screenshot-dependent questions when only a deterministic attachment placeholder is available. Production-build acceptance verified the corrected end-session UI transition and review state.
- Job Finder public-source discovery now starts independent provider inventories concurrently and uses evidence-calibrated scoring: unconstrained location/work-mode/salary fields are neutral, specific European eligibility regions no longer collapse into a generic Europe match, unsupported requirements and adjacent titles lower the score, source labels are cleaned into employer labels, and small result budgets favor distinct roles. The current Remote/Greenhouse plus Aircall/Lever replay returned 12 enriched distinct roles with zero duplicate title/company groups while final submit remained out of scope.

## Durable Constraints

- Keep `packages/job-finder` as orchestration owner for Job Finder workflows.
- Keep `packages/browser-agent` for workflow policy, prompts, and structured browser outputs.
- Keep `packages/browser-runtime` generic.
- Keep discovery and source-debug source-generic; board-specific rescue logic in core flow is debt, not a pattern.
- Keep contracts typed and schema-validated.
- Keep live submit disabled unless explicitly re-authorized.
- Keep sign-in browser-owned: never request or store credentials, and require explicit user confirmation before retrying only the blocked source or application.
- Keep browser/apply visual output evidence-only; selectors, browser actions, saved-job behavior, generated answers, final-submit guidance, and site-specific workflow rules must not cross visual schemas.
- Keep Interview Helper capture, screenshots, overlays, cue generation, retention, and Job Finder write-back explicit, visible, auditable, and adapter-owned.
- Treat overlay protection as capability state with verification evidence, not a boolean.

## Reopenable Follow-Ups

- Validate Interview Helper macOS/Linux hardware behavior on target hosts.
- Add authorized meeting-platform caption or full capture-exclusion integrations only through approved platform paths.
- Continue reducing real-app `Check source` cost when fresh full-app evidence shows product friction.
- Continue cleaning persisted title/company quality only when a new concrete extraction pattern survives the current provider-label normalization.
- Add resume-quality benchmark corpus cases only when fresh real outputs expose a missing regression class.
- Expand the source-generic requirement vocabulary only when fresh live listings expose a concrete missing technology, qualification, authorization, or domain pattern; keep ambiguous evidence review-first.
- Expand Applications recovery and retry tooling when concrete recovery failures appear.

## Current Acceptance Gaps

- Production Playwright reached a dynamically selected current Greenhouse vacancy's DOM-backed final `Apply` control with a disposable fake profile and a freshly imported synthetic original CV. All seven detected questions, including the unchanged resume upload, were verified as answered; intermediate ATS writes were separately authorized, final submit authorization remained false, the control was not clicked, no submitted state was recorded, and the temporary workspace was deleted.
- The live ATS matrix now also reaches Ashby's `Submit Application` checkpoint with five detected questions and the unchanged resume upload verified, while anonymous Workday discovery reaches the exact current listing and stops at `site_login_required`. All three reports record final-submit authorization false and `submittedNeverOccurred: true`.
- Desktop and narrow captures prove the source sign-in prompt exposes separate browser-open and `I'm signed in — retry` actions, explains that credentials remain in the browser, and scopes the retry to the blocked source.
- Resume-quality gates now cover canonical work-history representation, comma-fragment regressions, and professional experience summaries; deeper claim-entailment scoring remains reopenable when fresh outputs expose a concrete gap.
- Local Whisper, microphone, and Windows system-audio paths are runnable on this host. A real system-audio-only run with `base.en` produced an intelligible 18-word sample in about 9.3 seconds, kept both popup windows visible, completed the full session lifecycle, and retained no raw audio/image bytes; microphone capture was intentionally disabled for that run and macOS/Linux hardware behavior remains unverified.
- Visible chat, persisted bounded chat history, and temporary image attachments work; richer Job Finder target/profile context can be deepened after the basic interaction proves stable in daily use.

## References

- Current goals: `docs/GOALS.md`
- Current tracks: `docs/TRACKS.md`
- Product baseline: `docs/PRODUCT.md`
- Architecture rules: `docs/ARCHITECTURE.md`
- Decisions: `docs/adr/README.md`
- Milestones: `docs/HISTORY.md`
