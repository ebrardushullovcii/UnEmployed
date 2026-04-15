# CodeRabbit Review Log: PR 19 Batch Coverage

Date: `2026-04-15`
PR: `#19`
Branch: `feature/011-shared-data-expansion`
Reviewer: `CodeRabbit CLI (OSS)`

## Scope

- Full PR review could not run on OSS because CodeRabbit enforced the documented `150 files/review` cap.
- Successful local batch reviews completed for:
  - `apps/desktop/**` plus `docs/**` (`119` files)
  - non-browser `packages/**` plus root non-doc leftovers (`130` files)
- A later isolated Ubuntu worktree pass completed the remaining browser slice:
  - `packages/browser-agent/**`
  - `packages/browser-runtime/**`
  - review mode: temporary `main` worktree with only the browser-package PR diff materialized as uncommitted changes
- Full current-PR reruns still could not run on OSS after the later fixes because the branch remained above the limit (`276 files`, `126` over).

## Raw Coverage Notes

- Full-branch attempt against `main` failed with: `This PR contains 275 files, which is 125 over the limit of 150.`
- Batch review workaround used temporary `main` worktrees with only one slice materialized as uncommitted changes.

## Batch 1 Summary

Scope: `apps/desktop/**` + `docs/**`

Severity counts:

- critical: `2`
- major: `26`
- minor: `47`
- trivial: `108`

Highest-signal findings:

1. `apps/desktop/src/renderer/src/pages/use-job-finder-page-controller.ts`
   - missing `useMemo` dependencies can leave page context stale
2. `apps/desktop/src/main/adapters/resume-document-sidecar.ts`
   - unbounded sidecar `stdout` / `stderr` buffering risks memory exhaustion
3. `apps/desktop/src/main/adapters/scripts/parse_resume.swift`
   - OCR fallback can destroy line structure and degrade parser quality
4. `apps/desktop/scripts/prepare-resume-parser-sidecar.mjs`
   - packaged DOCX parsing may fail if `python-docx` is not bundled for PyInstaller
5. `apps/desktop/src/renderer/src/features/job-finder/hooks/use-job-finder-workspace.ts`
   - `sendProfileCopilotMessage` weakens typed IPC boundaries
6. `apps/desktop/test-fixtures/job-finder/profile-copilot-preferences-workspace.json`
   - fixture contained real PII
7. `apps/desktop/test-fixtures/job-finder/resume-import-sample.txt`
   - sample resume used real-looking personal URLs and phone data
8. `apps/desktop/src/renderer/src/features/job-finder/screens/profile-screen-hooks.ts`
   - payload derivation can go stale
9. `apps/desktop/src/renderer/src/pages/use-job-finder-page-controller-actions.ts`
   - copilot async responses can apply out of order
10. `apps/desktop/src/main/adapters/scripts/resume_parser_sidecar.py`
    - missing `filePath` may throw a raw `KeyError`

Deprioritized themes:

- doc bookkeeping
- test harness cleanup and query style
- CSS/token/readability nits

## Batch 2 Summary

Scope: non-browser `packages/**` + root non-doc leftovers

Severity counts:

- major: `11`
- minor: `25`
- trivial: `126`

Highest-signal findings:

1. `packages/db/src/file-repository-support.ts`
   - approved export sync is non-transactional and can leave partial DB state
2. `packages/db/src/file-repository-resume-methods.ts`
   - `approveResumeExport` sets `approvedExportId` without `approvedAt`
3. `packages/job-finder/src/internal/resume-import-reconciliation.ts`
   - collection candidate auto-apply can allow more than one winner in a group
4. `packages/job-finder/src/internal/matching-compensation.ts`
   - valid hourly/daily rates can be discarded
5. `packages/job-finder/src/internal/resume-import-literal-extraction.ts`
   - URL classification is too broad and can misclassify links
6. `packages/job-finder/src/internal/workspace-profile-copilot-methods.ts`
   - patch application can partially persist state on failure
7. `packages/job-finder/src/internal/resume-import-workflow.ts`
   - workspace save and import-artifact replacement are non-atomic
8. `packages/contracts/src/profile-copilot.ts`
   - empty-value payloads can pass `requireAtLeastOneField`
9. `packages/job-finder/src/internal/resume-import-workflow.ts`
   - `runId` generation can collide
10. `packages/db/src/file-repository-resume-methods.ts`
    - `resolution` and `resolutions` filters can conflict

Deprioritized themes:

- test-only guard and suffix cleanup
- helper extraction and naming cleanup
- explicit return type / readability suggestions with no runtime change

## Fix Tracking

This review log is intentionally tracked so later sessions can update fix status against the retained CodeRabbit findings instead of re-discovering them from scratch.

Fixed in the current worktree after the original batch review:

- `packages/job-finder/src/internal/workspace-profile-copilot-methods.ts`
  - auto-applied copilot patch groups now persist through an atomic repository write that updates profile data, setup state, revisions, and final patch-group `applyMode` together
- `packages/job-finder/src/internal/resume-import-workflow.ts`
  - successful resume-import finalization now persists profile/search-preference changes and import artifacts in one repository operation instead of split writes
- `apps/desktop/src/renderer/src/features/job-finder/hooks/use-job-finder-workspace.ts`
  - the renderer action wrapper now keeps explicit typed annotations on the Profile Copilot and source-debug bridge callbacks instead of relying on weaker implicit inference at the `window.unemployed` boundary
- `apps/desktop/src/renderer/src/features/job-finder/screens/profile-screen-hooks.ts`
- `apps/desktop/src/renderer/src/features/job-finder/components/profile/setup/profile-setup-screen-hooks.ts`
  - profile and setup form draft comparisons now stay aligned to the same persisted baseline during prop-driven resets so the UI does not briefly compute dirty state against a mismatched snapshot
- `packages/browser-agent/src/catalog-session-agent/session-agent.ts`
  - catalog Easy Apply now pauses whenever the detected screening-question set is non-empty instead of only checking the older narrow keyword shortlist, so relocation, travel, availability, self-introduction, career-transition, and contact-detail questions can no longer be silently dropped while the run is reported as submitted
- `packages/browser-agent/src/catalog-session-agent/discovery.ts`
  - deterministic catalog agent discovery now keeps the same Easy Apply eligibility gate as the simpler catalog discovery path instead of returning unsupported or non-eligible jobs to the seeded agent flow
- `packages/browser-agent/src/catalog-session-agent/session-agent.ts`
  - catalog session methods now reject through Promise paths when the browser session is not ready, and seeded agent discovery now fails clearly when `startingUrls` is empty instead of silently reporting progress against `about:blank`
- `packages/browser-agent/src/tooling/get-interactive-elements-tool.ts`
  - interactive-element discovery now excludes inert and disabled controls before surfacing candidates, and range inputs are labeled as `slider` instead of a generic textbox
- `packages/browser-runtime/src/playwright-browser-runtime-utils.ts`
  - Windows Chrome candidate discovery no longer adds the invalid bare `\\Google\\Chrome\\Application\\chrome.exe` path when `LOCALAPPDATA` is unset, and `validateJobPostings()` now correctly accepts unknown input before validating it at runtime
- `packages/job-finder/src/internal/resume-workspace-patches.ts`
  - resume patch application restores a compile-time exhaustiveness guard for unsupported patch operations
- `packages/job-finder/src/internal/workspace-application-resume-support.ts`
  - shared resume-workspace narrative fallback now includes `nextChapterSummary` so next-step-only narrative data is not dropped
- `packages/job-finder/src/internal/resume-import-workflow.ts`
  - every resume-import run now persists a fresh stored bundle id, preventing later refresh runs from overwriting earlier document-bundle history by reusing the same bundle primary key
- `apps/desktop/src/renderer/src/features/job-finder/components/job-finder-shell.tsx`
  - removed the unused shell-level `actionMessage` prop instead of keeping an ignored renderer prop path alive
- `packages/db/src/repository-types.ts`
- `packages/db/src/file-repository.ts`
- `packages/db/src/file-repository-resume-methods.ts`
- `packages/db/src/in-memory-repository.ts`
  - added focused atomic repository seams plus coverage in both file-backed and in-memory repository tests

Verification run for these fixes:

- `pnpm --filter @unemployed/db test`
- `pnpm --filter @unemployed/db typecheck`
- `pnpm --filter @unemployed/job-finder test`
- `pnpm --filter @unemployed/job-finder typecheck`
- `pnpm --filter @unemployed/desktop typecheck`
- `pnpm --filter @unemployed/desktop lint`
- `pnpm --filter @unemployed/browser-agent test`
- `pnpm --filter @unemployed/browser-agent typecheck`
- `pnpm --filter @unemployed/browser-runtime test`
- `pnpm --filter @unemployed/browser-runtime typecheck`

## Batch 3 Summary

Scope: `packages/browser-agent/**` + `packages/browser-runtime/**`

Execution notes:

- Direct review from the mounted Windows worktree was not usable because Linux git saw the whole `/mnt/d` repo as modified.
- The successful workaround used a clean Ubuntu clone of the branch, fetched `main`, then created a temporary `main` worktree with only the browser-package PR diff applied as uncommitted changes.
- The isolated browser batch review completed successfully with `coderabbit review --agent --type uncommitted`.

Highest-signal validated findings fixed from this batch:

1. `packages/browser-agent/src/catalog-session-agent/session-agent.ts`
   - Promise-returning session-agent methods were still throwing synchronously when the session was not ready
2. `packages/browser-agent/src/catalog-session-agent/session-agent.ts`
   - seeded agent discovery silently fell back to `about:blank` when `startingUrls` was empty
3. `packages/browser-agent/src/catalog-session-agent/discovery.ts`
   - seeded catalog agent discovery could surface non-Easy-Apply jobs that the runtime cannot safely automate
4. `packages/browser-agent/src/tooling/get-interactive-elements-tool.ts`
   - DOM interactive-element scan still included inert or disabled controls and mislabeled range inputs
5. `packages/browser-runtime/src/playwright-browser-runtime-utils.ts`
   - Windows Chrome candidate construction could emit an invalid path when `LOCALAPPDATA` was unset

Deprioritized browser-batch themes:

- test helper typing cleanup
- helper extraction or naming cleanup with no behavior change
- comments, constants, and refactors that did not change runtime behavior

## Unresolved Thread Audit

- A later GitHub thread audit fetched `43` unresolved bot review threads on PR `#19` (`20` CodeRabbit, `23` Copilot).
- The still-valid items from that audit were fixed in the current worktree across `desktop`, `job-finder`, `ai-providers`, `browser-agent`, `contracts`, and docs.
- Fixed follow-up themes included:
  - discovery detail truthfulness for normalized compensation and security-clearance hints
  - honest normalized-compensation labeling in the resume workspace sidebar
  - remote-geography hints no longer inferred for clearly non-remote jobs
  - motivation-only narrative evidence indexing
  - next-chapter-only narrative fallback now reaches resume-workspace shared profile summaries
  - application-identity edits no longer stale approved resume drafts
  - resume patch application restores a compile-time exhaustiveness guard for unsupported operations
  - unique fallback bundle ids for refresh imports
  - model timeout propagation plus safer timeout env parsing
  - resume-import staged fallback no longer risks invoking the deterministic fallback twice
  - macOS parser path resolution, Swift runtime lookup, and larger child-process buffers
  - no-text resume imports now stop at metadata persistence instead of running the full import workflow
  - catalog Easy Apply now pauses whenever detected screening questions still require manual review instead of falsely reporting submission
- A later re-audit found no still-valid unresolved bot thread on the browser files reviewed in Batch 3.
- Remaining unresolved GitHub bot threads are either already fixed in repo state, positive/non-actionable notes, comments that conflict with current repo validation rules (for example, active exec-plan files must keep `Status: active` to satisfy `pnpm docs:check`), or larger follow-up concerns that remain outside this PR-hardening slice.
