# Contracts

Use this for cross-package contract rules and workflow semantics. Put field-level details in `packages/contracts` JSDoc or README.

## Rules

- every external boundary gets a schema in `packages/contracts`
- prefer discriminated unions and explicit status enums over loose objects
- use narrow capability-based IPC payloads
- use typed result shapes for recoverable workflow outcomes
- do not import package internals across workspace boundaries

## Main Shared Domains

- candidate profile, search preferences, proof, narrative, and reusable answers
- resume import runs, document bundles, field candidates, and setup review items
- saved jobs, discovery runs, discovery ledger, source intelligence, and review queue items
- resume drafts, export metadata, approval state, and stale-state rules
- application records, apply runs, blocker state, consent state, and replay checkpoints
- source-debug runs, evidence refs, and learned instruction artifacts
- compaction policy and lightweight compaction snapshots for long-running agent work
- browser visual snapshot requests/refs, observation sets, reconciliations, evidence summaries, source-debug visual findings, and apply visual checkpoints
- Interview Helper setup state, target-context snapshots, rehearsal checklists, protected overlay surfaces, transcript segment ingestion, transcript annotations, cue visual batches, cue cards, diagnostics, overlay snapshots, live sessions, export payloads, and semantic session actions

## Current Shared Semantics

- discovery, source-debug, and apply consume the newest instruction artifact for the exact target: latest `draft`, otherwise latest `validated`
- canonical profile writes from import happen only through accepted candidates or explicit user edits
- resume approval is separate from apply approval
- apply automation must refuse missing or stale approved resumes; the staleness rules are the approval-state and stale-state checks for resume-affecting profile, settings, and saved-job changes in `packages/job-finder/src/internal/resume-workspace-staleness.ts`
- persist structured artifacts and summaries, not raw hidden worker transcripts
- browser visual output is evidence-only and schema validation rejects selectors, browser-action directives, saved-job directives, generated answers, final-submit guidance, and site-specific workflow rules
- application-page visual capture requires explicit apply-run/action opt-in (`visualCheckpointsEnabled` defaults false); browser-runtime must not infer screenshot capture from an ambient visual-capable AI client
- Interview Helper cue generation consumes bounded source-labeled transcript windows, target-context snapshots, selected prep artifacts, compact summary state, and active visual observations. It must not resend raw full transcripts or persist raw audio, raw provider payloads, raw prompts, or unpinned screenshots by default.
- Interview Helper model-backed cue providers must validate the model response into the shared cue-card schema before display and must fall back to a safe deterministic cue card on transient provider failure.
- Interview Helper cue generation must mark the bounded transcript segments used for each cue through `usedInCueIds`, so review/export code can audit cue grounding without reconstructing prompts.
- Interview Helper live transcript ingestion uses a typed source-labeled payload for `microphone`, `meeting_audio`, and `meeting_native_transcript`; partial updates may replace an existing segment id and final/stable non-microphone segments may trigger cue generation according to session sensitivity.
- Interview Helper transient audio transcription IPC accepts only a session id, `microphone` or `meeting_audio` source, MIME type, bounded base64 audio chunk, timing, and language. The raw audio payload is provider input only and must not be retained in workspace/session state.
- Interview Helper transcript annotations are additive review records. Corrections and notes retain the referenced original transcript text and must not overwrite the source transcript segment.
- Interview Helper protected overlay state uses explicit states such as `verified_protected`, `requested_unverified`, `best_effort`, `unsupported`, `failed`, and `unknown`; product code must not collapse these into a boolean or label requested protection as verified protection.
- Interview Helper overlay layout preferences store each protected surface's bounds, display id, opacity, visibility, interaction mode, and requested protection policy separately from session history.
- Interview Helper renderer/preload calls use narrow semantic actions (`toggle_listening`, `force_cue`, `capture_screenshot`, `capture_screenshot_and_force_cue`, overlay toggles, `panic_hide`, `end_session`) instead of exposing Electron or Node primitives.

## Validation Expectations

- normalize browser extraction through schemas before saving jobs
- validate provider output before workflow code uses it
- keep import, source-debug, and apply artifacts replayable and auditable
- store screenshots only through typed evidence refs or checkpoint metadata with explicit retention/redaction decisions; normal discovery and normal apply screenshots are temporary by default
