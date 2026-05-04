# 030 Resume Coverage And Copy Quality

Status: completed

## Goal

Make generated resumes show the right amount of work history and improve role-specific copy before full application-process testing.

This plan uses the domain language in `CONTEXT.md` and records the key product tradeoff in `docs/adr/0001-resume-coverage-and-apply-safe-template-catalog.md`.

## Constraints

- preserve typed boundaries across `@unemployed/contracts`, `@unemployed/job-finder`, `@unemployed/ai-providers`, and desktop main/preload/renderer
- keep exported resumes normal ATS-safe documents; app-only review guidance must never render into exported resume content
- keep reverse chronological work-history order for included roles; do not reorder exported experience by fit score
- persist only user include/hide decisions through existing draft state; do not add a permanent relevance flag to profile records
- keep live submit disabled unless explicitly re-authorized

## What Landed

- Added a derived resume coverage policy in `@unemployed/ai-providers` that classifies work-history records as detailed, compact, suggested-hidden, or omitted using career-family fit, meaningful gap coverage, and resume tailoring style.
- Replaced the old deterministic first-3-experience cap with coverage-policy selection while preserving reverse chronological resume chronology, `profileRecordId` mapping, grounded role-specific copy, and duplicate-phrase protection.
- Hardened AI-assisted resume draft normalization so provider output cannot silently drop fallback dev/dev-adjacent or gap-coverage entries, cannot invent unknown `profileRecordId` mappings, and preserves derived coverage metadata.
- Added typed contract support for app-only work-history review suggestions, `work_history_review` validation issues, and `templateIds` filtering for resume-quality benchmark requests.
- Surfaced Resume Studio work-history review suggestions next to affected experience entries with existing include/hide patch behavior; guidance persists after patch/save flows and remains app-only instead of rendering into preview/export text.
- Extended resume import and resume-quality benchmark coverage with the real fixture corpus from `docs/resume-tests/`, including both Ebrar fixture formats plus Aaron Murphy, Paul Asselin, and Ryan Holstien.
- Fixed desktop benchmark IPC forwarding for `templateIds` and refreshed the Resume Studio UI harness so guided edits are captured reliably.

## Final Validation Snapshot

- `pnpm validate:package contracts` passed.
- `pnpm validate:package ai-providers` passed.
- `pnpm validate:package job-finder` passed.
- `pnpm validate:package desktop` passed.
- `pnpm --filter @unemployed/desktop benchmark:resume-import` passed with aggregate literal recall `1.000` and auto-apply precision `1.000`.
- `pnpm --filter @unemployed/desktop benchmark:resume-quality` passed with aggregate grounded visible skill rate `1.000`, ATS render pass rate `1.000`, keyword coverage `1.000`, and issue-free case rate `0.600`.
- `pnpm --filter @unemployed/desktop ui:resume-workspace` passed and wrote refreshed artifacts under `apps/desktop/test-artifacts/ui/resume-workspace/`.
- `pnpm validate:docs-only` passed.
- final static review found no high-signal bugs or regressions in the uncommitted implementation.

## What It Means Now

- Dev and dev-adjacent history is no longer silently dropped by a fixed first-3 cap.
- Weak-fit and gap-coverage records are reviewable in Resume Studio with app-only guidance, while the durable user decision remains the draft include/hide state.
- Resume tailoring style changes weak-fit defaults without allowing invented roles, dates, achievements, metrics, or technical claims.
- Real imported fixtures and synthetic archetypes both participate in resume-quality evidence, giving `031` realistic long-history and mixed-history drafts to use for template-variety work.
- Reopen this track only for a new coverage-policy regression, app-only guidance leaking into exports, benchmark evidence exposing a new real-fixture quality issue, or a provider normalization gap that drops grounded fallback history.

## Latest Evidence Pointers

- resume quality benchmark: `apps/desktop/test-artifacts/ui/resume-quality-benchmark/023-local-benchmark-v1/resume-quality-benchmark-report.json`
- resume import benchmark: `apps/desktop/test-artifacts/ui/resume-import-benchmark/resume-import-benchmark-report.json`
- Resume Studio harness artifacts: `apps/desktop/test-artifacts/ui/resume-workspace/`
