# Contracts

Use this for cross-package contract rules and workflow semantics. Put field-level details in `packages/contracts` JSDoc or README.

## Rules

- every external boundary gets a schema in `packages/contracts`
- prefer discriminated unions and explicit status enums over loose objects
- use narrow capability-based IPC payloads
- use typed result shapes for recoverable workflow outcomes
- do not import package internals across workspace boundaries

## Shared Domains

- candidate profile, search preferences, proof, narrative, and reusable answers
- resume import runs, document bundles, field candidates, and setup review items
- saved jobs, typed requirement assessments, resume evidence citations, fit recommendations, discovery runs, discovery ledger, source intelligence, review queue items, source-debug evidence, and learned instruction artifacts
- resume drafts, export metadata, approval state, stale-state rules, templates, manual entry ordering, and the persisted `resumeApplicationMode`
- application records, apply runs, blocker state, consent state, replay checkpoints, and visual checkpoints
- browser visual snapshot requests, observation sets, reconciliations, source-debug visual findings, and apply visual summaries
- Interview Helper setup state, target context, rehearsal checks, chat messages/turns, temporary image attachments, protected surfaces, transcript segments, cue visual batches, cue cards, diagnostics, overlays, sessions, exports, transcript annotations, retention, and Job Finder follow-up actions

## Shared Semantics

- discovery, source-debug, and apply consume the newest instruction artifact for the exact target: latest `draft`, otherwise latest `validated`
- canonical profile writes from import happen only through accepted candidates or explicit user edits
- deterministic job-fit recommendations remain evidence-backed: hard conflicts or unsupported required requirements cannot produce a strong-fit/original-CV recommendation, while the numeric score remains a ranking signal rather than proof of qualification
- resume approval is separate from apply approval; original-CV mode uses the user's per-job Apply Copilot action as the decision to use the unchanged imported file
- apply automation must refuse missing or stale approved resumes
- application execution receives `ApplicationResumeArtifact`, discriminated as `tailored_export` or `original_upload`, with the exact attachment path and source identity
- prepare-only apply calls carry explicit false submit authorization; `intermediateMutationsAuthorized` is a distinct optional browser-runtime capability and does not authorize DOM/final submission; filled form answers remain `answered` until an application is actually submitted
- browser visual output is evidence-only; schema validation rejects selectors, browser-action directives, saved-job directives, generated answers, final-submit guidance, and site-specific workflow rules
- application-page visual capture requires explicit apply-run/action opt-in; browser-runtime must not infer screenshot capture from an ambient visual-capable AI client
- Interview Helper cue generation consumes bounded source-labeled transcript windows, target-context snapshots, selected prep artifacts, compact summary state, and active visual observations
- Interview Helper explicit chat sends always generate a response and may contain at most four schema-validated PNG/JPEG/WebP inputs; stored attachment metadata excludes raw base64 bytes
- Interview Helper renderers receive schema-validated workspace-change events through the typed preload subscription, allowing the main window and popup windows to stay synchronized without renderer reloads
- popup copy actions use a bounded, schema-validated clipboard-write input; renderers never receive raw Electron clipboard primitives
- Interview Helper core disclosure acceptance does not imply capture permission; microphone, meeting/system-audio, and screenshot actions must each enforce their corresponding consent field
- Interview Helper persists only bounded chat message/attachment metadata; audio-provider work is serialized separately and only schema-validated outcomes enter the serialized workspace mutation path
- Interview Helper must ignore empty/non-speech audio results rather than persist them as transcript segments or use them for cue generation
- Interview Helper must not persist raw audio, raw provider payloads, raw prompts, raw full transcripts, or unpinned screenshots by default
- Interview Helper protected overlay state uses explicit states such as `verified_protected`, `requested_unverified`, `best_effort`, `unsupported`, `failed`, and `unknown`; product code must not collapse these into a boolean
- Interview Helper renderer/preload calls use narrow semantic actions instead of exposing Electron or Node primitives
- Interview Helper may write back to Job Finder only through explicit post-session actions validated by `JobFinderInterviewFollowUpInputSchema`

## Validation Expectations

- normalize browser extraction through schemas before saving jobs
- validate provider output before workflow code uses it
- keep import, source-debug, apply, and Interview Helper artifacts replayable and auditable
- store screenshots only through typed evidence refs or checkpoint metadata with explicit retention/redaction decisions
