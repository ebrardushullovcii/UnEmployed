# 027 Job Finder Resume Experience UX Reset

Status: completed

## Goal

Take full ownership of the Job Finder resume experience UX reset by redesigning the `Settings` resume-template surface and the `Resume Studio` preview surface until they are materially better in usability, hierarchy, readability, and confidence while staying truthful to the shipped product semantics.

## Explicit Mandate

- treat the current 025 and 026 UI as replaceable implementation detail, not as a layout to preserve
- redesign from first principles if needed, including information architecture, component structure, controls, copy, visual hierarchy, and state presentation
- keep only the product truths and safety constraints that must remain correct; everything else can be rethought
- drive decisions with real screenshots across meaningful UI states, test-backed capture flows, and direct visual review of the results
- optimize for the best end-user outcome, not for minimizing diffs

## Constraints

- preserve typed boundaries across contracts, job-finder orchestration, and desktop main, preload, and renderer layers
- keep preview and export on one shared renderer so preview truthfulness is not weakened by the redesign
- keep template eligibility, approval safety, and saved-draft-authoritative semantics intact unless a stricter truthful UX is needed
- preserve ATS-safe behavior for shipped `apply-safe` templates
- keep the redesign within the existing product theme and design language, but do not preserve weak layouts or weak interaction patterns for consistency's sake

## What Landed

- the `Settings` resume-template surface was redesigned around clearer hierarchy, stronger family and variant framing, denser desktop information use, and more grounded default-template guidance
- the desktop `Resume Studio` was reworked into a tighter preview plus editor workspace with a more truthful page-first hierarchy, a right-side editor that fills the remaining width, and less cramped theme strategy controls
- the preview surface now measures real rendered height, keeps the export-faithful page in view while editing, and supports more reliable preview-to-editor targeting across sections, entries, bullets, and draft identity fields
- structured editing now exposes draft-owned identity fields directly, removes weak provenance clutter from the main editing path, and gives multiline editing controls meaningfully more room
- shared preview targeting contracts and renderer anchors now keep header, section, entry, and bullet selections stable across desktop rendering and editor focus behavior
- desktop preview click handling now works across iframe document boundaries and is covered by updated tests

## Validation

- `pnpm validate:package desktop`
- `pnpm --filter @unemployed/job-finder build`
- `pnpm build`

## What It Means Now

- Job Finder now ships a materially stronger desktop resume experience whose template selection and editing flows better match the importance of resume review work
- the preview remains truthful to export behavior while making it easier to inspect, click, and edit the exact content the user sees on the page
- users can now edit visible resume identity content alongside the rest of the structured draft, which closes a major gap between previewed output and editable controls
- reopen this track only for a concrete desktop resume UX regression, a preview-targeting or focus regression, or a truthful preview and export mismatch backed by fresh evidence

## Latest Evidence Pointers

- accepted `Settings` capture: `apps/desktop/test-artifacts/ui/1440x920/settings.png`
- accepted `Resume Studio` captures: `apps/desktop/test-artifacts/ui/resume-workspace/03-preview-recovered.png` and `apps/desktop/test-artifacts/ui/resume-workspace/10-review-queue-gated.png`
- focused preview evidence: `apps/desktop/test-artifacts/ui/resume-workspace/studio-preview-results.json`
