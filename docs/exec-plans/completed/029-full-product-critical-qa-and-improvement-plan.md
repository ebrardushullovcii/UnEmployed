# 029 Full Product Critical QA And Improvement Plan

Status: completed

## Goal

Turn the latest full-product validation pass into a branch-visible improvement plan that raises product trust, removes remaining screenshot-backed UX contradictions, strengthens weak benchmark cases, and reduces the biggest delivery risks before the next quality baseline is called strong.

## Constraints

- preserve typed boundaries across desktop main, preload, renderer, and `@unemployed/contracts`
- keep discovery and source-debug behavior source-generic
- keep live submit disabled unless explicitly re-authorized
- treat benchmark reports and screenshots as product evidence, not just test artifacts
- prioritize improvements that make the product more truthful and actionable before adding more ornamental status copy

## What Landed

- Settings now labels seeded resume-template previews truthfully instead of implying personalized candidate-backed output.
- Applications and Shortlisted first-run states now lead with clearer next actions instead of mirrored passive empty-state copy.
- Discovery now prioritizes missing-profile/search-definition blockers ahead of misleading startup language.
- Guided setup and profile copilot surfaces now use safer insets that avoid lower-right collision with important content.
- Resume import now auto-applies more grounded identity and summary fields, reduces duplicate review noise, and improves deterministic benchmark truth.
- Thin-profile resume fallback quality improved enough to clear the previously repeated benchmark failure class.
- Applications detail/readability work now preserves long next-step guidance and recovery context while the detail panel has been decomposed into smaller typed renderer units.
- Applications status helpers now avoid stale consent-derived stage/activity labels after records later move to interview, archived, or other downstream statuses.

## Final Validation Snapshot

### Broad validation

- targeted validation completed across desktop UI, resume import, job-finder, benchmarks, and docs
- `pnpm structure:check` remains warn-only repo-wide, but the touched Applications detail-panel hotspot is no longer listed in renderer over-budget warnings

### Desktop product evidence

- refreshed screenshot evidence is accepted under `apps/desktop/test-artifacts/ui/1440x920/`
- Applications follow-up and recovery evidence is accepted under:
  - `apps/desktop/test-artifacts/ui/applications-recovery/`
  - `apps/desktop/test-artifacts/ui/applications-queue-recovery/`
  - `apps/desktop/test-artifacts/ui/applications-consent-states/`

### Benchmarks

- `pnpm --filter @unemployed/desktop benchmark:resume-quality` passed
- `pnpm --filter @unemployed/desktop benchmark:resume-import` passed

### Remaining non-blocking quality debt

- React test output still emits `act(...)` warnings around `ResumeThemePicker`
- repo-wide large-file hotspots still exist outside the completed `029` Applications detail-panel decomposition work

## Completion Summary

### QA-029-001 Settings preview truthfulness

- completed: preview language now matches the seeded sample-preview reality

### QA-029-002 Applications first-run momentum

- completed: Applications and related first-run flows now present clearer next actions and CTA paths

### QA-029-003 Guided setup collision risk

- completed: safer offset/inset treatment keeps launcher overlap from obscuring key setup content in the validated desktop flow

### QA-029-004 Discovery blocker truthfulness

- completed: missing definition/setup blockers are now presented before browser-startup language

### QA-029-005 Applications detail readability

- completed: long follow-up text and recovery context remain readable, and the detail panel has been decomposed into focused typed sections

### QA-029-006 Thin-profile resume quality

- completed: thin-profile fallback behavior improved and benchmark validation reran green

### QA-029-007 Resume import friction

- completed: import auto-apply heuristics, summary/experience fallback, and deterministic benchmark expectations were improved and revalidated

### QA-029-008 Maintainability hotspot follow-up

- completed for the touched renderer surface: `applications-detail-panel.tsx` was split into smaller focused components and no longer appears in `pnpm structure:check` renderer warnings

## What It Means Now

- the latest broad product hardening pass is now part of the shipped baseline instead of a queued follow-up
- Applications behaves more like a follow-up workspace than a single monolithic telemetry surface
- resume import and thin-profile resume generation are materially less fragile while remaining truthful and grounded
- reopen this track only for a fresh screenshot-backed contradiction, benchmark regression, or new hotspot work in another touched surface

## Latest Evidence Pointers

- desktop validation: `pnpm validate:desktop`
- job-finder validation: `pnpm validate:job-finder`
- docs validation: `pnpm validate:docs-only`
- screenshot evidence: `apps/desktop/test-artifacts/ui/1440x920/`
- Applications flow evidence: `apps/desktop/test-artifacts/ui/applications-recovery/`, `apps/desktop/test-artifacts/ui/applications-queue-recovery/`, `apps/desktop/test-artifacts/ui/applications-consent-states/`
- resume quality benchmark: `apps/desktop/test-artifacts/ui/resume-quality-benchmark/023-local-benchmark-v1/resume-quality-benchmark-report.json`
- resume import benchmark: `apps/desktop/test-artifacts/ui/resume-import-benchmark/resume-import-benchmark-report.json`
- current import behavior snapshot: `apps/desktop/test-artifacts/ui/resume-import/resume-import-report.json`
- current consent-state truth snapshot: `apps/desktop/test-artifacts/ui/applications-consent-states/consent-state-report.json`
