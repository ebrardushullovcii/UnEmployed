# 031 Functional Resume Template Variety

Status: ready

## Goal

Rebuild the resume template catalog around functional layout variety, using realistic draft evidence from `030` so users get meaningfully different apply-safe choices instead of near-duplicate visual treatments.

This plan depends on `docs/exec-plans/queued/030-resume-coverage-and-copy-quality.md` for improved long-history and mixed-history draft inputs.

## Constraints

- preserve shared preview/export renderer ownership so Settings previews, Resume Studio preview, exports, and benchmark artifacts cannot drift
- prioritize functional layout variety over color/palette changes
- keep all apply-flow templates single-column, table-free, escaped, `data-ats-safe="true"`, and benchmark eligible only after passing validation
- new approval-eligible templates must pass the same apply-safe renderer and benchmark bar as existing templates
- keep draft-owned `templateId` as the export and approval source of truth
- keep live submit disabled unless explicitly re-authorized

## Implementation Plan

### Catalog Shape

- Redesign the existing six templates around distinct layout purposes instead of near-duplicate visual treatments:
  - conservative chronology-first
  - dense senior timeline
  - skills-first technical
  - projects/proof-first
  - credentials-first
  - polished modern default
- Add new template IDs only when they add a distinct layout purpose beyond the rebuilt six; do not add color-only variants.
- Candidate additions if they remain materially distinct after renderer exploration:
  - long-history timeline layout for candidates with many roles
  - hybrid career-pivot layout for mixed backgrounds with dev-adjacent evidence
- Widen contracts, catalog metadata, renderer tests, picker tests, and benchmark expectations for any new template IDs.

### Renderer And UI

- Keep one shared renderer for Settings sample previews, Resume Studio live preview, exports, and benchmark HTML.
- Refine layout hierarchy, section order, density, and content emphasis per template; avoid counting palette changes as meaningful variety.
- Keep catalog copy truthful about each layout purpose and apply-safe status.
- Ensure Settings and Resume Studio template picker behavior remains stable for existing and any new template IDs.

### Evidence

- Run the full automated template x archetype matrix, including synthetic cases and real-fixture cases introduced by `030`.
- Use representative visual review instead of exhaustive screenshot review:
  - at least one artifact per distinct layout purpose
  - targeted review for both Ebrar fixtures on long-history/mixed-history layouts
  - review any new template before marking it approval eligible

## Test Plan

- `apps/desktop`:
  - renderer tests prove each template remains ATS-safe and structurally distinct
  - catalog preview tests cover every shipped template ID
  - theme picker/catalog tests cover metadata, recommendations, and new IDs if added
- `packages/contracts`:
  - widen `ResumeTemplateId` and workspace snapshot tests if new template IDs ship
- `packages/job-finder`:
  - approval and auto-apply guards accept only benchmark/apply-eligible templates
- Benchmarks and harnesses:
  - `pnpm validate:package contracts` if template IDs change
  - `pnpm validate:package job-finder`
  - `pnpm validate:package desktop`
  - `pnpm --filter @unemployed/desktop benchmark:resume-quality`
  - `pnpm --filter @unemployed/desktop ui:resume-workspace`
  - `pnpm validate:docs-only`

## Done When

- The template catalog provides visibly different layout purposes, not just color or spacing variants.
- Any new template ID is fully wired through contracts, catalog, renderer, UI, benchmark selection, and approval safety.
- Real fixture and synthetic resume-quality outputs remain ATS-safe across all approval-eligible templates.
- Representative screenshot evidence covers each distinct layout purpose and high-risk long-history/mixed-history cases.
