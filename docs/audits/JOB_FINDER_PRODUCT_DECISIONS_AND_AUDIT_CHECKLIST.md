# Job Finder Product Direction Checklist

Updated: 2026-07-27

This is the durable source of truth for the current Job Finder quality pass. It records product outcomes and decisions, not a prescribed test script.

## Core outcome

- [x] Help people produce more worthwhile applications, stronger job-specific résumés, and better interview chances than they would achieve without the product.
- [x] Serve first-time applicants through experienced professionals without requiring technical or power-user knowledge.
- [x] Keep the shortest useful journey clear: add a résumé, complete the highest-value missing context, find suitable jobs, review fit and résumé quality, approve what may be used, and apply.
- [x] Existing flows may be redesigned or replaced when that improves the core outcome.

## Experience priorities

- [x] Current-pass priority order: failure recovery and state integrity first; transparent ratings, recommendations, approvals, and failure explanations next. Accessibility improvements remain valuable but are not a primary focus of this pass.
- [x] Résumé-first onboarding is the obvious fast path; manual entry remains clear and viable.
- [x] Missing-information guidance is prioritized, grounded, and small enough to act on without exposing the full data model.
- [x] Coaching is proactive but non-intrusive, contextual, actionable, and non-repetitive.
- [x] Sources are arbitrary, user-configurable public pages. Do not add presets, endorsements, or source-specific product policy.
- [x] Jobs remain visible by default with explained mismatches. Users may explicitly enable strict collection for hard role, location, and work-mode criteria.
- [x] Ratings and ordering are evidence-led, useful for deciding what to pursue, and honest about gaps, uncertainty, and limited evidence.
- [x] Job details provide enough context to decide and always retain a clear path to the original listing.
- [x] Tailored résumés are compared with the original and target job; material changes, omissions, duplication, and improvement opportunities are first-class review content.
- [x] Feedback leads directly into iterative résumé improvement before approval.
- [ ] Quality takes priority over maximum speed, while progress and batching keep processing within a practical, useful wait.
- [x] Dense multi-pane surfaces preserve independent scrolling, visible actions, readable overflow, and usable layouts.

## Approval and application decisions

- [x] A job is not eligible for automatic application until its résumé choice is approved: a reviewed tailored résumé or an explicit original-résumé choice.
- [x] A clear approved state or batch authorization may replace a separate final confirmation for each application.
- [x] Approval communicates the exact jobs, résumé artifacts, scope, consequences, and revocation point unambiguously.
- [x] Automatic runs avoid one interruption per attempt and end with a quiet summary centered on failures, unusual cases, and required follow-up.
- [x] Preserve safeguards immediately before irreversible external submission.
- [x] Audits and automated acceptance must never perform a real final job submission, create external accounts, or use personal data.

## Trust, data, and control

- [x] Generated or scored output stays grounded in user-provided or user-confirmed evidence and never presents unsupported claims as fact.
- [x] Résumé import, extraction, review, replacement, cancellation, approval, and application use have truthful, distinguishable states.
- [ ] Users understand what remains local, what will be attached externally, and when an external action becomes authorized.
- [x] Users may retain workspace and résumé data as long as they choose.
- [x] Workspace reset is discoverable, deliberate, explains what is removed, and returns to a truthful first-run state.
- [ ] Settings and approvals are visibly saved, difficult to lose accidentally, and recoverable before submission.

## Paid-product quality bar

- [ ] The end-to-end journey is polished and reliable: no crashes, dead controls, lost edits, false success, contradictory status, unexplained wait, or hidden primary action.
- [ ] Empty, loading, partial, error, paused, stale, cancelled, approved, running, failed, and completed states explain what happened and what to do next.
- [ ] Failures preserve useful work and offer focused recovery without exposing transport or implementation jargon.
- [ ] Visual hierarchy, typography, spacing, focus, contrast, responsive behavior, scrolling, overflow, and long-content handling feel intentional.
- [ ] Weak, generic, duplicated, misleading, or unjustifiably confident ratings and generated output are treated as product defects.
- [ ] Release-critical claims require end-to-end visual evidence; unit coverage alone is insufficient.
- [ ] Job Finder changes avoid Interview Helper regressions.

## Current pass status

- [x] Fresh local Electron startup verified with an isolated user-data directory.
- [x] First-run hierarchy redesigned around direct résumé import and manual-entry choices; empty setup, review, and copilot panels no longer compete before data exists.
- [x] Cancelled/no-selection résumé import now reports that nothing changed instead of claiming success.
- [x] Default discovery now preserves jobs outside soft preferences; strict collection is an explicit, explained preference while explicit exclusions remain hard.
- [x] Contextual copilot suggestions are compact, dismissible, and limited to unresolved grounded review items.
- [x] Ratings now identify their evidence boundary in the job detail: listing requirements are compared with the approved profile, and unknown details do not count as evidence.
- [x] Every saved job exposes its original listing URL and a safe copy action, including an explicit recovery message if clipboard access fails.
- [x] Automatic-application approval names the exact jobs in scope, explains that the authorization uses the current approved résumé artifacts without another per-job confirmation, and remains revocable before the run starts.
- [x] Completed automatic runs surface a quiet latest-run summary that emphasizes failed, blocked, or skipped jobs instead of interrupting each attempt.
- [x] Workspace retention and reset are explicit in Settings; reset names everything removed and requires a destructive confirmation before clearing local state.
- [x] Manual onboarding survives a full app close/reopen. The reopened Profile no longer mislabels the untouched résumé placeholder as a failed import or shows the epoch import date.
- [x] Production rebuild plus the recovery and résumé-workspace visual harnesses pass; the recovery harness now scrolls its off-screen action into view instead of failing on an independently scrolled detail pane.
- [x] Three fictional profiles (senior engineering, customer support, and an operations-to-marketing career change) completed live discovery against five arbitrary public, no-login Greenhouse, Lever, and Ashby sources.
- [x] Role-family scoring now sharply separates unrelated work from plausible adjacent roles and explains the downgrade; generic talent-pool invitations no longer rank as open jobs.
- [x] Pipe-delimited location headers, associate degrees, and graduation-only years import correctly. Tailored drafts retain grounded summaries and the visible corpus introduced no unsupported numeric claims.
- [x] Nontechnical résumés render a neutral Skills heading, job context counts saved research accurately, and a single graduation year no longer renders as a duplicate range.
- [x] Visual Computer Use confirmed independent discovery-detail scrolling, original-listing recovery, résumé review, approved-PDF gating, and actionable browser-not-ready guidance.
- [x] Closing the production app during active public-source discovery and reopening the same workspace cancels the interrupted run truthfully, preserves prior jobs, clears the active run, and supplies a retryable warning.
- [x] A fresh first-time Computer Use pass with a fictional senior frontend profile exposed and fixed malformed and duplicated education output: JSON-encoded records normalize before reconciliation, redundant school-as-location and duplicated summary fields are removed, an evidence-identical raw line is rejected when a grounded structured record represents it, and equivalent split/combined degree records merge into one education entry.
- [x] Resume-inferred scalar target roles and locations preserve commas as part of one value. `Portland, Oregon` no longer becomes separate `Portland` and `Oregon` search areas, and role titles such as `Director, Product` remain atomic.
- [x] Deterministic skill grounding uses phrase boundaries, so collaborator professions such as “product designers” no longer become candidate skills or inflate discovery fit explanations as `Product Design`.
- [x] Résumé-import elapsed time now begins only after a file is selected. Time spent in the native file picker is shown as waiting for selection rather than falsely reported as document-processing time.
- [x] The same isolated fictional workspace completed public no-login discovery against an arbitrary user-configured Greenhouse source, retained eight saved results and exact listing links, and reopened after a full Electron process restart with the résumé, profile, source, and result count intact.
- [x] Computer Use reproduced the reported Profile Copilot defect at the 1024×720 minimum: the expanded panel covered essential setup fields and the collapsed bubble floated above the page bottom. The panel now docks beneath the fixed navigation, reserves a right-side content rail while open, collapses to a predictable 20 px bottom anchor, and remains usable after form scrolling, window resize, screen navigation, and a full Electron restart.
- [x] A narrow-pane breakpoint sweep reproduced the reported Discovery action-label escape and horizontal scrollbar. Discovery now keeps Shortlist, Hide, and Copy actions in a pane-anchored vertical footer with contained labels and reserved scroll space; the populated Shortlisted pane uses the same pattern so Start Apply Copilot and Open Resume Workspace remain reachable after deep scrolling.
- [x] Route transitions reset screen scroll. Opening the résumé workspace from a deeply scrolled Shortlisted pane now lands at the complete workspace header instead of clipping the job title and starting mid-document.
- [x] Route-entry scroll reset now runs before paint and again on the next animation frame. Computer Use reproduced the late-layout failure after opening the résumé workspace from a focused lower action, then verified that the rebuilt workspace consistently opens with Back, Reload, job title, status, and job context visible.
- [x] The Settings reset flow uses an explicit in-app destructive dialog with Cancel and “Reset workspace” actions instead of an ambiguous native Cancel/OK prompt. Computer Use verified focus and cancellation without deleting the fictional audit workspace.
- [x] Tailored résumé sanitization removes experience-summary sentences that repeat visible bullets while preserving distinct grounded context. The populated fictional draft exposed this quality defect; focused quality coverage now prevents the repeated prose/bullet pattern from returning.
- [x] A dedicated visual boundary pass covered the populated Profile, Discovery, Search history, Shortlisted, résumé workspace, Applications, and Settings surfaces. Wide locked layouts consume the page header before handing wheel input to nested panes; pane-bottom actions remain visible; keyboard Home/End and repeated wheel input reach both boundaries; the Settings reset dialog keeps focus and its destructive action fully contained.
- [x] The Profile Copilot bubble now supports full-distance native pointer dragging instead of stopping after the first small movement. Its collapsed drop point is clamped and persisted locally, survives navigation and restart, returns after minimizing, and a later single click still expands it. Expansion always docks below navigation beside a reserved form rail rather than covering essential fields.
- [x] Transition-time résumé refresh is explicit and recoverable. The studio disables adjacent editing/export controls and announces “Working on your resume…”, while Shortlisted shows live “Preparing resume” progress if the user navigates away. The live preview iframe is replaced by an in-app progress surface while work is pending, preventing the detached blank preview layer that previously covered most of the destination route.
- [x] A content-density and voice pass removed repeated browser guidance, reduced duplicate Applications empty-state actions, shortened Profile/setup/review/history instructions, and replaced manual-like Copilot and application-tracker wording with concise, specific language. Computer Use verified the revised hierarchy on the first-run choice screen, populated Profile, empty Applications, Shortlisted, and the expanded Copilot panel.
- [ ] Remaining external risk: arbitrary sources can change markup, restrict automated access, or expose incomplete listing detail; the app must continue to surface per-source warnings and preserve completed results.
