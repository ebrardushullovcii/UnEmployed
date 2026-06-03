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
- saved jobs, discovery runs, discovery ledger, source intelligence, review queue items, source-debug evidence, and learned instruction artifacts
- resume drafts, export metadata, approval state, stale-state rules, templates, and manual entry ordering
- application records, apply runs, blocker state, consent state, replay checkpoints, and visual checkpoints
- browser visual snapshot requests, observation sets, reconciliations, source-debug visual findings, and apply visual summaries
- Interview Helper setup state, target context, rehearsal checks, protected surfaces, transcript segments, cue visual batches, cue cards, diagnostics, overlays, sessions, exports, transcript annotations, retention, and Job Finder follow-up actions

## Shared Semantics

- discovery, source-debug, and apply consume the newest instruction artifact for the exact target: latest `draft`, otherwise latest `validated`
- canonical profile writes from import happen only through accepted candidates or explicit user edits
- resume approval is separate from apply approval
- apply automation must refuse missing or stale approved resumes
- browser visual output is evidence-only; schema validation rejects selectors, browser-action directives, saved-job directives, generated answers, final-submit guidance, and site-specific workflow rules
- application-page visual capture requires explicit apply-run/action opt-in; browser-runtime must not infer screenshot capture from an ambient visual-capable AI client
- Interview Helper cue generation consumes bounded source-labeled transcript windows, target-context snapshots, selected prep artifacts, compact summary state, and active visual observations
- Interview Helper must not persist raw audio, raw provider payloads, raw prompts, raw full transcripts, or unpinned screenshots by default
- Interview Helper protected overlay state uses explicit states such as `verified_protected`, `requested_unverified`, `best_effort`, `unsupported`, `failed`, and `unknown`; product code must not collapse these into a boolean
- Interview Helper renderer/preload calls use narrow semantic actions instead of exposing Electron or Node primitives
- Interview Helper may write back to Job Finder only through explicit post-session actions validated by `JobFinderInterviewFollowUpInputSchema`

## Validation Expectations

- normalize browser extraction through schemas before saving jobs
- validate provider output before workflow code uses it
- keep import, source-debug, apply, and Interview Helper artifacts replayable and auditable
- store screenshots only through typed evidence refs or checkpoint metadata with explicit retention/redaction decisions
