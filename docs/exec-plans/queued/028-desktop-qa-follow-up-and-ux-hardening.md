# 028 Desktop QA Follow-Up And UX Hardening

Status: queued

## Goal

Turn the latest desktop screenshot QA findings into a concrete follow-up track that fixes high-confidence product defects, resolves the most important workflow and state-model problems, and closes the highest-value remaining test gaps before the next quality baseline is declared strong.

## Constraints

- preserve typed boundaries across desktop main, preload, renderer, and `@unemployed/contracts`
- keep discovery and source-debug behavior source-generic
- keep live submit disabled unless explicitly re-authorized
- treat screenshot artifacts as evidence, not as the product truth when live-flow verification contradicts them
- prefer fixes that make blocked states, approval states, and assistant states more truthful instead of adding more status copy around weak behavior

## Why This Is Queued

- the last QA pass produced a large, actionable desktop defect and UX backlog
- the findings are saved under screenshot artifacts today, but they still need a repo-native execution track for work on another machine
- the follow-up spans multiple previously completed baselines: `012`, `015`, `022`, `025`, `026`, and `027`

## Current Findings To Address

Primary defect log:

- `apps/desktop/test-artifacts/ui/qa-full-20260430-issues.md`

Second-pass UX and product audit:

- `apps/desktop/test-artifacts/ui/qa-full-20260430-ux-audit.md`

Highest-priority defects from the QA pass:

- `QA-001` resume import leaves headline and summary placeholders after import
- `QA-002` Resume Studio preview click does not focus the matching editor field reliably
- `QA-011` Applications details panel clips long next-step text horizontally
- `QA-017` narrow Find jobs layout starts mid-content under the fixed header
- `QA-018` Profile Copilot drawer opens underneath the global navigation
- `QA-021` Resume Studio after assistant edit can render a mostly blank workspace
- `QA-023` Find jobs blocked results panel lacks a primary source-specific recovery action
- `QA-024` Applications consent and cancel outcomes show contradictory stage and attempt statuses

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

- `apps/desktop/test-artifacts/ui/qa-full-20260430-issues.md`
- `apps/desktop/test-artifacts/ui/qa-full-20260430-ux-audit.md`
- `apps/desktop/test-artifacts/ui/qa-full-20260430-source-sign-in/find-jobs-desktop.png`
- `apps/desktop/test-artifacts/ui/qa-full-20260430-apply-queue-controls/04-applications-queue-consent-approved.png`
- `apps/desktop/test-artifacts/ui/qa-full-20260430-profile-copilot-preferences/02-preferences-after-copilot.png`
- `apps/desktop/test-artifacts/ui/qa-full-20260430-resume-workspace/08-after-assistant.png`
