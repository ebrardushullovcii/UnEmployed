# 014 Job Finder Resume Content Correctness And ATS Output

Status: completed

Completed on `2026-04-18`.

This plan shipped the first release-bar resume-quality pass for `Job Finder`. The repo no longer treats resume quality as an open scaffolding problem: structured drafting, deterministic sanitation, assistant patch batching, ATS-safe rendering, and end-to-end approval/apply validation are now in place.

## Final Implementation Summary

- The thin provider-to-draft bridge is widened into a structured resume model with real section entries for summary, experience, skills, projects, education, certifications, and supporting skills or language content instead of only four flat preview sections.
- Resume sanitation and validation now detect and surface duplicate bullets, duplicate section content, job-description bleed, thin output, keyword stuffing, filler language, stale approval, and page overflow instead of only the earlier limited checks.
- Assistant edits now preflight against the current draft, reject invalid targets as a batch, and leave the draft unchanged when any patch in the group cannot be applied safely.
- Desktop rendering now produces a real ATS-safe single-column `Classic ATS` export with structured entries, grounded contact metadata, experience history, and supporting sections rather than a summary-card style PDF.
- The final product decision for this slice is now explicit: `Classic ATS` is the only shipped resume layout during the ATS-first phase. The previously exposed `modern_split` and `compact_exec` layouts are removed from the live template catalog so template variety no longer competes with parser safety or recruiter readability.
- Legacy settings or stored drafts that still reference retired template ids now normalize back to `Classic ATS`; previously approved drafts tied to a retired layout are reopened as stale so the user must export a fresh ATS-first PDF before apply.

## Acceptance Criteria

- grounded structured draft model -> pass -> `packages/contracts/src/resume.ts`, `packages/ai-providers/src/shared.ts`, `packages/ai-providers/src/deterministic/tailoring.ts`, and `packages/job-finder/src/internal/resume-workspace-structure.ts` now support structured resume entries and section families beyond the old four-section bridge.
- stronger deterministic sanitation and validation -> pass -> `packages/job-finder/src/internal/resume-workspace-helpers.ts` now flags duplicate section content, job-description bleed, thin output, keyword stuffing, and filler language in addition to prior checks.
- reliable assistant correction path -> pass -> `packages/job-finder/src/internal/workspace-application-methods.ts` now validates assistant patch groups before persistence, and service tests prove failed batches leave the draft unchanged.
- one ATS-safe default output -> pass -> `apps/desktop/src/main/adapters/job-finder-document-manager.ts` now ships a single-column `Classic ATS` renderer only, aligning with external ATS guidance that favors single-column layouts and avoiding tables or multi-column reading-order risk.
- explicit ATS-first template decision -> pass -> settings now describe the fixed `Classic ATS` layout instead of exposing alternate layouts, and `normalizeJobFinderSettings(...)` plus `normalizeResumeDraftTemplate(...)` route unsupported legacy template ids back to the shipped default.
- approval and apply safety preserved -> pass -> stale-after-edit, stale-after-settings-change, and stale-after-retired-layout paths still force a fresh export before approval or apply.

## Verification Evidence

Validated in the completion pass:

- `pnpm --filter @unemployed/ai-providers test`
- `pnpm --filter @unemployed/contracts test`
- `pnpm --filter @unemployed/db test`
- `pnpm --filter @unemployed/job-finder test`
- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop ui:resume-workspace`
- `pnpm --filter @unemployed/desktop ui:resume-workspace-dirty`
- `pnpm docs:check`

Representative evidence anchored in repo state:

- structured approved resume evidence -> `apps/desktop/test-artifacts/ui/resume-workspace/workspace-after-demo.json` shows the approved export containing Summary, Experience, Core Skills, and Education with a successful apply handoff from the approved PDF.
- dirty-state safety evidence -> `apps/desktop/test-artifacts/ui/resume-workspace-dirty/dirty-state-results.json` still proves save-before-refresh, save-before-assistant, approval clearing, and unsaved-navigation guards.
- assistant batch-failure evidence -> `packages/job-finder/src/workspace-service.core.resume-apply-scenarios.ts` proves a mixed valid-plus-invalid assistant patch batch leaves the draft unchanged and reports the failure clearly.
- ATS-first layout decision evidence -> `apps/desktop/src/main/adapters/job-finder-document-manager.ts`, `apps/desktop/src/renderer/src/features/job-finder/screens/settings/settings-editable-defaults.tsx`, and `packages/job-finder/src/internal/workspace-helpers.ts` now keep only `Classic ATS` active and normalize unsupported legacy template ids.

## Notes For Follow-On Planning

- Do not reopen multiple resume templates casually. Any future template expansion should be a new explicit plan with its own ATS and recruiter-readability bar, not a silent regression back to alternate layouts during routine polish.
- `015` should now treat `014` as a stable prerequisite: apply automation can rely on one approved ATS-first PDF path instead of having to reason about multiple layout variants.
- If later work revisits template breadth, keep `Classic ATS` as the baseline control and require before-vs-after parser/readability evidence rather than relying on aesthetic preference.
