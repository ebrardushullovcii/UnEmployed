# Contracts

Use this doc for cross-package contract rules, workflow semantics that span packages, public invariants, and external-boundary validation expectations. Put field-level schema/type definitions and field-specific validation rules in `packages/contracts` JSDoc; use `packages/contracts/README.md` for package-level guidance and schema organization.

## Rules

- every external boundary gets a schema in `packages/contracts`
- prefer discriminated unions and explicit status enums over loose objects
- use narrow capability-based IPC payloads
- use typed result shapes for recoverable workflow outcomes
- do not import package internals across workspace boundaries

## Main Shared Domains

See `docs/ARCHITECTURE.md` for the authoritative package ownership and data-flow map behind these domains.

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
- apply automation must refuse missing or stale approved resumes; the staleness rules are the approval-state and stale-state checks for resume-affecting profile, settings, and saved-job changes in `packages/job-finder/src/internal/resume-workspace-staleness.ts`
- persist structured artifacts and summaries, not raw hidden worker transcripts

## Validation Expectations

- normalize browser extraction through schemas before saving jobs
- validate provider output before workflow code uses it
- keep import, source-debug, and apply artifacts replayable and auditable
