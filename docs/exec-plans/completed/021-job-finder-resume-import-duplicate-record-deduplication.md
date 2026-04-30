# 021 Job Finder Resume Import Duplicate Record Deduplication

Status: completed

## Goal

Eliminate intermittent duplicate resume-import records, with the highest priority on duplicated experience entries, so imports are stable, reviewable, and safe to ship for real users.

## What Landed

- logical duplicate identity and completeness scoring for experience and education candidates
- reconciliation and canonical-merge hardening so equivalent records collapse across generated ids, date-format drift, and `Current` versus empty-end variants
- renderer prefill dedupe that preserves the richer canonical row without pulling runtime-only imports into the renderer bundle
- fresh-start placeholder replacement for grounded identity fields, fresh-start grounded experience auto-merge, and non-blocking optional proof suggestions
- deterministic extraction fixes for wrapped summaries, `10+ years` grounding, and date-derived `yearsExperience` when work history is dated but the summary does not state a literal years count
- regression coverage across deterministic parsing, stage grounding, reconciliation, renderer review behavior, and real desktop import flows

## Latest Evidence

- real desktop imports now complete cleanly for `docs/resume-tests/Ryan Holstien Resume.pdf` and `docs/resume-tests/Aaron Murphy Resume.pdf`
- Aaron fresh-start import now lands with `yearsExperience: 10` derived from dated work history, avoiding the previous placeholder `0` and the fake setup review item
- remaining top-level review noise is limited to legitimate education review and optional proof suggestions

## Validation

- `pnpm --filter @unemployed/ai-providers test -- deterministic/resume-parser.test.ts resume-import.test.ts`
- `pnpm validate:package job-finder`
- `pnpm --filter @unemployed/desktop ui:resume-import -- --resume "docs/resume-tests/Ryan Holstien Resume.pdf"`
- `pnpm --filter @unemployed/desktop ui:resume-import -- --resume "docs/resume-tests/Aaron Murphy Resume.pdf"`

## What It Means Now

- duplicate-record handling, fresh-start placeholder replacement, grounded experience auto-merge, and optional-proof warning cleanup are part of the current resume-import baseline
- reopen this area only for a new real import regression, a supported-parser/platform change, or a concrete source-generic quality improvement that current validation does not cover
