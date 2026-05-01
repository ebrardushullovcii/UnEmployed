# 028 Desktop QA Follow-Up And UX Hardening

Status: completed

## Goal

Turn the latest desktop screenshot QA findings into a concrete follow-up track that fixes high-confidence product defects, resolves the most important workflow and state-model problems, and closes the highest-value remaining test gaps before the next quality baseline is declared strong.

## Constraints

- preserve typed boundaries across desktop main, preload, renderer, and `@unemployed/contracts`
- keep discovery and source-debug behavior source-generic
- keep live submit disabled unless explicitly re-authorized
- treat screenshot artifacts as evidence, not as the product truth when live-flow verification contradicts them
- prefer fixes that make blocked states, approval states, and assistant states more truthful instead of adding more status copy around weak behavior

## Why This Was Queued

- the last QA pass produced a large, actionable desktop defect and UX backlog
- the findings were first recorded under local screenshot artifacts, but `apps/desktop/test-artifacts/` is ignored and will not travel with the branch
- this plan must therefore be self-contained enough to drive follow-up work from another machine without relying on ignored artifacts
- the follow-up spans multiple previously completed baselines: `012`, `015`, `022`, `025`, `026`, and `027`

## Current Findings To Address

Ignored local evidence sources used during the original pass:

- `apps/desktop/test-artifacts/ui/qa-full-20260430-issues.md`
- `apps/desktop/test-artifacts/ui/qa-full-20260430-ux-audit.md`

Those files are useful on the original machine, but this completed plan preserves the branch-visible background and acceptance context.

Highest-priority defects from the QA pass:

- `QA-001` resume import leaves headline and summary placeholders after import
- `QA-002` Resume Studio preview click does not focus the matching editor field reliably
- `QA-011` Applications details panel clips long next-step text horizontally
- `QA-017` narrow Find jobs layout starts mid-content under the fixed header
- `QA-018` Profile Copilot drawer opens underneath the global navigation
- `QA-021` Resume Studio after assistant edit can render a mostly blank workspace
- `QA-023` Find jobs blocked results panel lacks a primary source-specific recovery action
- `QA-024` Applications consent and cancel outcomes show contradictory stage and attempt statuses

## Branch-Visible Issue Summary

Use this section if the ignored artifacts are unavailable on the current machine.

### QA-001 Resume import leaves primary fields in placeholder or unresolved-review state

- both plain-text and PDF import paths successfully extracted identity and experience data
- the visible profile still left headline and summary in an unresolved or placeholder state instead of giving the user a confident imported result and a clear next required action

### QA-002 Resume Studio preview click does not reliably bring the matching editor field into view

- clicking a selected preview item could visibly leave the editor positioned on a different field or section
- the failure is about trust in preview-to-editor targeting, not only about test assertions

### QA-011 Applications details panel clips long next-step content

- long next-step and saved-next-step strings were visually cut off in the details column
- users cannot reliably read the recommended action or verify saved guidance

### QA-017 Narrow Find jobs loses page context

- narrow-width captures could begin mid-content under the fixed header
- the page title, blocking context, and primary action were not reliably visible together

### QA-018 Profile Copilot drawer opens underneath the top nav

- the drawer header was clipped under global navigation rather than opening as a complete overlay or contained panel

### QA-021 Resume Studio can look mostly blank after assistant interaction

- after a guided edit or assistant action, the workspace could show the request composer while the main preview/editor surface was effectively gone from view

### QA-023 Find jobs blocked state has diagnosis but no primary recovery CTA in the main panel

- the main results pane said search was blocked by browser or sign-in
- the actual sign-in CTA lived elsewhere in the current-search panel, making recovery unclear or off-screen

### QA-024 Applications consent and cancel outcomes use contradictory statuses

- consent-approved, consent-declined, and cancelled runs could still appear as `READY FOR REVIEW` or `NO APPLY ATTEMPT`
- latest activity, row stage, and detail-panel interpretation were not semantically aligned

## Branch-Visible UX Summary

- the product still reads too much like an internal automation console in high-stakes moments
- blocked states need one obvious next action in the visible viewport
- assistant surfaces need a collision-aware layout system instead of floating over content opportunistically
- Applications should behave like a next-action CRM rather than a telemetry-first run log
- responsive layouts need explicit master-detail rules so context and primary actions do not disappear into nested scroll

## Workstreams

### 1. Trust And Blocker Clarity

- fix blocked Find jobs states so the main panel contains the recovery CTA and next step
- remove contradictory browser/setup guidance in default discovery states
- make empty states produce momentum instead of passive status text

### 2. Applications State Model And Recovery UX

- split review stage, consent state, and apply-run outcome into truthful user-facing states
- fix tracker and details clipping issues across queue, consent, and recovery surfaces
- promote primary decisions above telemetry and metadata in the details panel

### 3. Assistant Overlay And Workspace Reliability

- fix Profile Copilot collisions with nav, sticky bars, and form content
- fix Resume Studio blank-after-assistant states
- preserve visible workspace context after assistant edits, save flows, and guards

### 4. Responsive And Layout Robustness

- remove narrow-width context loss in Find jobs and Profile source management
- reduce nested-scroll traps that hide primary CTAs
- ensure desktop standard widths do not horizontally clip key content and statuses

### 5. Profile And Resume Review Flow Quality

- make imported suggestion review produce a clearer next required action
- improve Resume Studio preview framing and preview-to-editor targeting trust
- surface better evidence and outcome summaries where assistant or apply systems make claims

## Remaining Tests To Run

### Live Product Flows

- LinkedIn sign-in -> recover -> rerun search
- Wellfound sign-in -> rerun search
- blocked search CTA should lead to a successful next action, not just browser open
- consent approved flow
- consent declined flow
- run cancelled flow
- recovery, rerun, and restage flows

### Resume Studio Reliability

- assistant edit keeps preview and editor visible
- preview click scrolls and focuses the matching editor field
- save, refresh draft, export, approve, and reopen later all preserve truthful state
- dirty-state guards after shell navigation and browser back navigation

### Responsive And Interaction Coverage

- narrow-width coverage for `Profile`, `Find jobs`, `Resume Studio`, and `Applications`
- resize behavior while drawers and detail panels are open
- keyboard tab order, visible focus, escape handling, and focus trap behavior for drawers and modals

### Persistence And Platform Coverage

- restart app mid-flow and verify restoration of edits, queue state, and approvals
- non-macOS parser sidecar and packaging validation
- installer, signing, and notarization flows when release work resumes

## How To Recreate Evidence On Another Machine

Run these from `apps/desktop` after building or validating desktop as needed.

### Core validation

- `pnpm validate:desktop`
- `pnpm --filter @unemployed/desktop build`

### Screenshot harnesses

- `UI_CAPTURE_LABEL="qa-followup-source-sign-in" node ./scripts/capture-source-sign-in-prompts.mjs`
- `UI_CAPTURE_LABEL="qa-followup-resume-workspace" node ./scripts/capture-resume-workspace.mjs`
- `UI_CAPTURE_LABEL="qa-followup-resume-workspace-dirty" node ./scripts/capture-resume-workspace-dirty.mjs`
- `UI_CAPTURE_LABEL="qa-followup-resume-import" node ./scripts/capture-resume-import.mjs --resume "./test-fixtures/job-finder/resume-import-sample.txt"`
- `UI_CAPTURE_LABEL="qa-followup-resume-import-pdf" node ./scripts/capture-resume-import.mjs --resume "../../docs/resume-tests/Ryan Holstien Resume.pdf"`

### Benchmarks used during the original pass

- `pnpm --filter @unemployed/desktop benchmark:resume-import`
- `pnpm --filter @unemployed/desktop benchmark:resume-quality -- --canary-only`

### Notes

- `capture-profile-baseline.mjs` requires an explicit committed snapshot path
- screenshot output will again go to ignored `apps/desktop/test-artifacts/`, so summarize any new findings back into tracked docs before switching machines

## Recommended Execution Order

1. fix `QA-023`, `QA-015`, `QA-016`, and `QA-017` together as one discovery/sign-in clarity pass
2. fix `QA-024`, `QA-011`, `QA-013`, and `QA-022` together as one Applications state-model and layout pass
3. fix `QA-018`, `QA-019`, `QA-009`, and `QA-021` together as one assistant-surface reliability pass
4. fix `QA-001`, `QA-002`, `QA-010`, and `QA-020` together as one profile and Resume Studio trust pass
5. rerun targeted harnesses, then live-flow QA for sign-in, consent, recovery, and responsive behavior

## Acceptance Bar

- every blocked state has one obvious primary recovery action in the visible viewport
- application rows never show contradictory latest activity, stage, and attempt status
- assistant surfaces never overlap nav, form content, or chat content
- Resume Studio remains visible and reviewable after every assistant action
- narrow-width layouts preserve page context and a visible primary action
- the next QA pass can explain what happened, what is blocked, what the user should do, and what happens next on every major screen

## Latest Evidence Pointers

- branch-visible summary: this plan
- validation: `pnpm validate:desktop`, `pnpm validate:job-finder`, `pnpm --filter @unemployed/desktop build`
- latest desktop QA reruns: `apps/desktop/test-artifacts/ui/source-sign-in-prompts/capture-report.json`, `apps/desktop/test-artifacts/ui/resume-workspace/studio-preview-results.json`, `apps/desktop/test-artifacts/ui/applications-recovery/run-history-summary.json`, `apps/desktop/test-artifacts/ui/resume-import/resume-import-report.json`

## Completion Summary

- `QA-023` is resolved: blocked `Find jobs` states now keep a primary recovery CTA in the main results pane for both empty and stale-results states, and the narrow-width captures under `apps/desktop/test-artifacts/ui/source-sign-in-prompts/` show the blocked context and visible action together.
- `QA-024` is resolved to the current contract model: Applications now derives truthful user-facing stage, latest-activity, and next-step labels from consent and attempt semantics across the records table and detail surfaces instead of relying only on raw persisted status labels.
- `QA-017` is resolved: narrow discovery layout now preserves page context by showing results/context before filters.
- `QA-018` is resolved: Profile Copilot now respects a shared navigation-safe inset and no longer opens under the top navigation.
- `QA-021` is resolved: Resume Studio keeps preview/editor visible after assistant replies, and `studio-preview-results.json` records preserved preview recovery, click-to-focus, and assistant-follow-up evidence.
- `QA-011` is resolved: long Applications next-step copy now wraps in both tracker and detail panels.
- `QA-001` is partially improved and now truthful: imported placeholder identity states are called out as review-needed in Profile, and `resume-import-report.json` confirms the sample import still leaves headline/summary in review-needed placeholder state rather than falsely presenting them as final.
- `QA-002` is improved and verified for the current desktop path: `studio-preview-results.json` records successful preview click-to-focus on the matching editor field.

## Remaining Follow-Ups

- Run `pnpm --filter @unemployed/desktop ui:resume-workspace-dirty` on the next pass so the updated assistant-field selector path is covered by the dirty-state harness too.
- Add a dedicated desktop UI harness or seeded scenario for consent-requested and consent-declined Applications states so the rendered stage semantics are covered beyond unit tests and recovery history evidence.
- Resume import remains intentionally truthful rather than auto-resolving headline/summary placeholders; if product wants stronger automatic identity completion, track that as a separate scoped follow-up instead of weakening review semantics.
