# Contracts

Use this doc for cross-package contract rules and important shared semantics. Put field-level schema/type definitions, validation rules, and field semantics in `packages/contracts` JSDoc or `packages/contracts/README.md`.

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

## Current Shared Semantics

- discovery, source-debug, and apply consume the newest instruction artifact for the exact target: latest `draft`, otherwise latest `validated`
- canonical profile writes from import happen only through accepted candidates or explicit user edits
- resume approval is separate from apply approval
- apply automation must refuse missing or stale approved resumes
- persist structured artifacts and summaries, not raw hidden worker transcripts

## Validation Expectations

- normalize browser extraction through schemas before saving jobs
- validate provider output before workflow code uses it
- keep import, source-debug, and apply artifacts replayable and auditable
