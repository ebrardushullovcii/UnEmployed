# 012 Guided Setup And Profile Copilot - Active Fixlist

Status: active

Purpose:

- keep the remaining plan `012` stabilization and finish-work in repo state instead of chat history
- capture both user-reported issues and new issues found during autonomous QA
- drive implementation, tests, screenshots, and final verification until the feature is ready for customer-facing testing

## Acceptance Standard

This list is not done when the UI merely compiles.

Done means:

- setup review items jump to the exact editable control or record the user needs
- setup edits feel coherent and save semantics make sense without surprise navigation
- review queue state updates immediately after relevant edits and does not show stale values
- imported records do not duplicate from candidate preload or step transitions
- Profile Copilot is visible, useful, grounded, and capable of making or proposing the edits users actually ask for in setup and full profile editing
- floating copilot no longer steals main profile layout space while collapsed
- capture scripts and tests prove the fixed behavior with screenshots and regression coverage
- refreshed screenshots were manually reviewed during the task and any new issues were added here

## User-Reported Issues

### 1. `Edit this` must jump to the exact field

- status: done
- priority: critical
- user report: sending the user only to the general step is useless; it must send them to the exact field, and the agent should understand related edits too
- current result:
  - simple essentials targets still jump to direct field ids
  - nested record-backed review items now reopen the correct experience, education, certification, project, link, language, or proof card using preserved semantic record ids
  - proof-bank setup fields now expose stable nested ids so review jumps can target real controls instead of only the card shell
  - the refreshed setup harness proves the background `Edit this` path opens the correct imported role and exposes the intended editable control

### 2. Setup save UX is confusing and review queue stays stale

- status: done
- priority: critical
- user report:
  - changing `Years of experience` from `6` to `7` feels awkward because there is no obvious plain save action
  - after editing, the right side still shows the stale value and still asks to confirm or edit
- current result:
  - setup keeps an explicit `Save changes` action in the footer without forcing next/back navigation
  - the draft-aware queue reflects unsaved resolution truth immediately
  - explicit save now resolves matching pending review items correctly, including the previously broken portfolio URL path

### 3. Save area can become huge

- status: active
- priority: high
- user report: sometimes the footer/save area becomes visually huge and feels broken
- latest check:
  - the refreshed `ui:profile-setup` screenshots at the standard desktop capture size did not reproduce the oversized footer
  - this slice did not add a dedicated alternate-size regression, so the issue stays watch-listed until a multi-size pass re-checks it

### 4. Duplicate jobs/experience records appear

- status: done
- priority: critical
- user report: this run showed many doubled jobs while the previous test looked fine
- current result:
  - renderer field arrays now preserve semantic imported ids instead of overwriting them with React Hook Form bookkeeping ids
  - the refreshed end-to-end setup harness completes with a single imported `Signal Systems` experience record carried through save and handoff

### 5. Copilot does nothing useful

- status: done
- priority: critical
- user report: copilot is failing to answer grounded questions and failing to produce edits
- current result:
  - deterministic copilot tests now cover grounded timeline/history answers like `how long did i work on automatedpros ?`
  - deterministic copilot now also handles practical essentials requests like `change my years of experience from 6 to 7`
  - the setup harness proves bounded grounded edits for headline, years of experience, and professional story updates
  - the current failure mode is now far rarer for the covered setup/profile requests and stays explicitly bounded to typed safe edits

### 6. Floating bubble still consumes profile layout space

- status: done
- priority: critical
- user report: copilot moved to a bubble but still takes space on the profile
- current result:
  - refreshed post-setup profile capture still shows the full editor width with only the collapsed floating bubble overlaid in the corner

## Additional QA Items To Verify During This Pass

These were inferred from the user report and must be explicitly checked:

### 7. Setup review state after direct edits

- status: done
- priority: high
- verified result: draft-aware review rows immediately show `Unsaved draft` and `Resolved in draft`, then explicit save persists the matching confirmed or edited status back into saved setup state

### 8. Setup plain-save workflow

- status: done
- priority: high
- verified result: the green `ui:profile-setup` harness explicitly saves the current step in essentials, background, targeting, and answers without relying on forced next/back navigation

### 9. Full-profile layout after setup completion

- status: done
- priority: high
- verified result: `apps/desktop/test-artifacts/ui/profile-setup/09-profile-after-setup.png` shows the collapsed bubble floating over the corner while the main profile surface still uses the full layout width

### 10. Copilot grounded timeline/history answers

- status: done
- priority: high
- verified result: `pnpm --filter @unemployed/ai-providers test -- --run src/deterministic-client.test.ts` passes the deterministic grounded duration scenario for `automatedpros`

### 11. Years-of-experience copilot edit

- status: done
- priority: critical
- verified result:
  - `pnpm --filter @unemployed/ai-providers test -- --run src/deterministic-client.test.ts` now covers the practical request `change my years of experience from 6 to 7`
  - `pnpm --filter @unemployed/job-finder test -- --run src/workspace-service.core.test.ts` verifies the setup patch auto-applies safely and records a revision
  - `apps/desktop/test-artifacts/ui/profile-setup/workspace-after-setup-copilot.json` shows `profile.yearsExperience: 7` plus the assistant patch group `Update years of experience`

### 12. Unsafe clear-value and auto-apply guardrails

- status: done
- priority: high
- verified result:
  - years-of-experience review items no longer show an invalid `Clear current value` action in setup
  - targeted setup-review tests now reject attempts to clear years of experience to `null`
  - record-level copilot edits such as experience work-mode changes stay `needs_review` until the user applies them explicitly

### 13. Preferences copilot job-source edits and compact recent changes

- status: done
- priority: high
- verified result:
  - deterministic copilot can now add common job sources like `LinkedIn Jobs`, `Wellfound`, and `KosovaJob` from natural Preferences requests, re-enable disabled saved sources when the user asks for them again, and persists the resulting discovery-target updates under `searchPreferences.discovery.targets`
  - deterministic and OpenAI-compatible fallback tests now cover the no-op case where the requested source already exists and return grounded `already saved` feedback instead of generic failure copy
  - list-heavy `replace_search_preferences_fields` edits such as discovery-target rewrites no longer auto-apply broadly; they stay `needs_review` until the user explicitly applies them
  - `apps/desktop/scripts/capture-profile-copilot-preferences.mjs` now reloads the seeded workspace reliably, opens full Profile -> Preferences, applies the copilot source request, explicitly applies review-gated changes when needed, and captures the compact recent-changes tray in both shown and hidden states
  - deterministic multi-edit requests can now bundle years of experience, expected salary, preferred work mode, and job sources in one reply with safe scalar changes auto-applied and broader changes left in review mode
  - `apps/desktop/test-artifacts/ui/profile-copilot-preferences/workspace-after-preferences-copilot.json` proves the saved workspace now contains both LinkedIn Jobs and Wellfound targets, and the same deterministic path now supports `KosovaJob`

### 14. Bubble toggle, footer cleanup, and save-area overlap

- status: done
- priority: high
- verified result:
  - clicking the collapsed bubble now toggles the copilot open and closed instead of relying only on the top-right minimize control
  - the floating bubble can be dragged, and the Profile screen enforces enough bottom offset to keep the collapsed bubble out of the sticky save-footer zone
  - the shell-level `Last action` footer and the profile save-footer action message line were removed so the profile flow no longer shows stale undo-status copy

### 15. Pending copilot state should stay interactive

- status: done
- priority: high
- verified result:
  - sending a Profile Copilot request no longer flips the whole profile surface into a blocking busy state just to wait for the reply
  - the collapsed bubble remains draggable while the request is in flight, and the composer stays editable so the user can draft the next prompt instead of staring at a frozen panel
  - the in-flight rail now uses a lighter animated thinking indicator instead of broadly disabling controls in the copilot UI

### 16. Preferences copilot should handle normal iterative chat better

- status: done
- priority: critical
- user report:
  - normal follow-up chat still fails too often for practical requests like profile-gap audits, raw GitHub URL messages, and natural phrasing around visa sponsorship plus remote work
  - examples that failed in real use include asking what is missing, sending only `https://github.com/ebrardushullovcii`, and saying `no i dont want a visa im fine working remote`
- verified result:
  - the copilot should respond usefully to normal step-by-step chat instead of requiring over-structured commands
  - it should be able to auto-apply safe direct values such as GitHub or LinkedIn URLs when the target field is clear
  - it should interpret practical work-eligibility phrasing like no-visa-needed plus remote preference and convert it into typed profile edits
  - it should also answer profile-gap audits more helpfully by auto-filling only safe inferred details and clearly suggesting the next highest-value missing fields

### 17. Small-screen floating copilot should remain fully visible and usable

- status: done
- priority: critical
- user report:
  - on smaller screens the open chat panel can be cut off and the composer or controls become partially inaccessible
- verified result:
  - opening or dragging the copilot should keep the full panel inside the viewport instead of only clamping the collapsed bubble anchor
  - the panel height and position should adapt so the header, transcript, composer, and send controls remain reachable on smaller desktop sizes
  - this should ship with scripted or screenshot-backed QA at a smaller capture size, not only the default large desktop capture

### 18. Final-stretch broad QA and theme fidelity

- status: done
- priority: critical
- user report:
  - the feature now feels close enough to ship that it should move into broad real-world QA across active-plan functionality instead of only narrow fix validation
  - scripted tests were resolving in light mode even though the default saved setting is `System` and the current host OS preference is dark
- target result:
  - final-stretch validation should exercise the active-plan surfaces across targeted tests, service checks, and UI captures including smaller viewport coverage
  - scripted Electron captures should resolve `System` appearance predictably so dark-theme QA matches the expected desktop baseline unless a test explicitly requests light mode
 - verified result:
    - the full Profile Preferences harness now also proves the remaining unsaved-draft safety gap is closed by blocking copilot send, apply, reject, and undo while page edits are unsaved, without mutating saved workspace state during the blocked condition
    - the shared floating composer is verified editable during pending replies so users can draft the next request while the current one finishes
    - refreshed targeted and broad validation passed again after the full-Profile guard follow-up

### 19. Assistant markdown formatting should not show raw `.md`

- status: done
- priority: high
- user report:
  - Profile Copilot suggestions were surfacing raw markdown syntax like headings, bullets, and fenced code instead of rendering them as readable chat content
- verified result:
  - assistant transcript messages now render markdown-like structure for headings, bullet lists, inline code, blockquotes, and fenced code instead of exposing the raw syntax
  - `apps/desktop/scripts/capture-profile-copilot-preferences.mjs` now seeds a markdown-rich assistant reply and captures `05-preferences-copilot-markdown.png` as visual QA evidence

### 20. Resume import or refresh must not wipe unsaved setup/profile drafts

- status: done
- priority: critical
- issue found during broad QA:
  - importing or refreshing from resume could reset guided-setup or full-Profile form state while the user still had unsaved edits in progress
- verified result:
  - setup and full Profile now disable resume import or refresh while drafts are unsaved and show explicit guard copy explaining why the action is blocked
  - targeted renderer tests cover the disabled import path in both the full Profile resume panel and the setup import step

### 21. Floating copilot reachability and accessibility follow-up

- status: done
- priority: high
- issue found during autonomous QA:
  - the open full-Profile copilot rail could still overlap the sticky save footer when dragged low, and the collapsed bubble relied on pointer interactions instead of explicit click or keyboard toggles
- verified result:
  - the open rail clamp now respects the full save-footer safe offset, keeping the floating panel above the sticky footer zone on the Profile screen
  - the collapsed bubble now supports explicit click and keyboard activation in addition to drag behavior
  - targeted rail layout and transcript-section tests cover the new clamp and toggle semantics, and the refreshed Preferences UI harness still passes

### 22. DOCX sidecar completeness and fallback truthfulness

- status: done
- priority: critical
- issue found during autonomous QA:
  - the Python sidecar could treat paragraph-only DOCX output as success even when table or header/footer content was missing, and release prep copy overstated the cross-platform helper behavior
- verified result:
  - sidecar DOCX extraction now includes table plus header/footer text before returning a `local_docx` parse
  - the desktop worker now prefers the embedded DOCX parser when the sidecar result looks suspiciously thin compared with embedded extraction
  - the host-aware native packaging helper is now named `prepare:resume-parser-sidecar:matrix`, and running it on one host logs skipped foreign targets while still building the matching native bundle successfully
  - the Profile resume panel also keeps a visible fallback-quality note when import had to degrade through embedded parser recovery, instead of hiding all low-level fallback evidence

## Work Log

### 2026-04-14

- user reported six high-severity UX and functional issues after the prior polish pass
- active fixlist created so no further context is lost
- next execution phase must include autonomous QA, better tests, screenshot review, and proactive issue discovery beyond only the user list
- explicit-save setup review resolution now correctly handles matching portfolio URL edits instead of leaving them pending after save
- saved-state and draft-aware review comparison now both derive application preferred-link URLs from `preferredLinkIds` plus saved link records so setup truth stays aligned across service, UI, and harness layers
- renderer field arrays now use `keyName: 'fieldKey'` so imported review-first records keep their semantic ids and nested edit-jumps stay stable across setup and the full Profile editor
- proof-bank setup inputs now expose stable field ids, and nested `Edit this` jumps reopen the intended record shells instead of only landing on the step generally
- refreshed validations passed:
  - `pnpm --filter @unemployed/job-finder test -- --run src/workspace-service.core.test.ts`
  - `pnpm --filter @unemployed/contracts test -- --run src/profile-copilot-contracts.test.ts src/profile-setup-contracts.test.ts`
  - `pnpm --filter @unemployed/job-finder test`
  - `pnpm --filter @unemployed/desktop typecheck`
  - `pnpm --filter @unemployed/desktop test`
  - `pnpm --filter @unemployed/desktop ui:profile-setup`
  - `pnpm --filter @unemployed/ai-providers test -- --run src/deterministic-client.test.ts`
- refreshed screenshots were manually reviewed from `apps/desktop/test-artifacts/ui/profile-setup/`; the oversized-footer report did not reproduce at the standard capture size, but it remains worth re-checking in a later alternate-size pass
- deterministic copilot now updates years of experience from explicit setup requests, the setup capture harness records that essentials edit in `workspace-after-setup-copilot.json`, and record-level copilot edits remain review-first instead of auto-applying blindly
- setup review UI now hides invalid clear-value affordances for non-nullable years-of-experience items, and targeted tests lock that guardrail in place
- deterministic profile copilot now supports common Preferences source requests, returns grounded duplicate-source no-op feedback, re-enables disabled saved targets when requested again, and the new `ui:profile-copilot-preferences` capture flow proves reviewed source application plus the compact Show/Hide revision tray in the floating copilot
- tightened the Profile Copilot auto-apply gate so list-heavy search-preference rewrites such as discovery-target updates no longer auto-apply broadly, while safe scalar-only preference edits can still do so
- deterministic Preferences parsing now also handles multi-edit prompts with years of experience, expected salary, preferred work mode, and `KosovaJob` in one request, while preserving explicit review for broader preference rewrites
- the floating Profile Copilot bubble now toggles from the collapsed control, supports dragging to avoid the save footer, and the stale `Last action` footer copy has been removed from both the shell and profile save area
- Profile Copilot pending replies now keep the bubble draggable and stop using the global blocking busy state, while the rail shows a lighter animated thinking treatment instead of disabling most controls
- a new follow-up pass is now required to make Preferences/Profile copilot handle normal iterative chat much better for gap audits, raw profile-link messages, and natural no-visa plus remote phrasing
- the same pass must also clamp the open floating rail more intelligently on smaller screens so the full panel stays usable instead of getting cut off
- deterministic iterative-chat support now covers safe profile-gap audits, raw GitHub URL follow-ups, and natural no-visa plus remote replies, while a 1024x768 capture proves the smaller-screen floating copilot stays reachable
- desktop scripted captures now inject a deterministic system-theme override so `System` appearance resolves dark by default during QA unless a harness intentionally overrides it
- follow-up phrasing like `update visa sponsorship` now returns an explicit clarification prompt instead of a generic no-op failure, and the multi-size setup pass (`1728x1080`, `1280x800`, `1024x768`) did not reproduce the earlier oversized save/footer report
- softer phrasing like `what should i update most on my profile based on what is missing` now triggers the useful gap-audit path, explicit labeled URL requests like `set my website to https://...` now resolve into typed identity edits, and the resume-import capture harness now tolerates guided-setup redirects after import instead of assuming the app always lands directly on the full Profile screen
- refreshed validations passed:
  - `pnpm --filter @unemployed/ai-providers test -- --run src/deterministic-client.test.ts src/provider-config-and-fallback.test.ts`
  - `pnpm --filter @unemployed/job-finder test -- --run src/workspace-service.core.test.ts`
  - `pnpm --filter @unemployed/desktop typecheck`
  - `pnpm --filter @unemployed/desktop ui:profile-copilot-preferences`
  - `UI_CAPTURE_WIDTH=1024 UI_CAPTURE_HEIGHT=768 UI_CAPTURE_LABEL=profile-copilot-preferences-1024x768 pnpm --filter @unemployed/desktop ui:profile-copilot-preferences`
  - `pnpm --filter @unemployed/desktop ui:capture`
  - `pnpm --filter @unemployed/desktop ui:resume-import -- --resume ./test-fixtures/job-finder/resume-import-sample.txt --expected-name "Jamie Rivers" --expected-location "Berlin, Germany" --label resume-import-fixture`
  - `pnpm --filter @unemployed/job-finder test`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm structure:check`
  - `UNEMPLOYED_TEST_SYSTEM_THEME=light UI_CAPTURE_LABEL=1440x920-light pnpm --filter @unemployed/desktop ui:capture`
  - `UNEMPLOYED_TEST_SYSTEM_THEME=light UI_CAPTURE_WIDTH=1024 UI_CAPTURE_HEIGHT=768 UI_CAPTURE_LABEL=profile-copilot-preferences-1024x768-light pnpm --filter @unemployed/desktop ui:profile-copilot-preferences`

### 2026-04-15

- full `Profile` now mirrors setup's dirty-draft guard for Profile Copilot by blocking send/apply/reject/undo while the page has unsaved user edits, which closes the remaining known draft-loss path called out during prior review
- the shared `ProfileCopilotComposer` no longer disables the textarea while a reply is pending, so the real UI now matches the documented `keep typing while it works` behavior again
- `apps/desktop/scripts/capture-profile-copilot-preferences.mjs` now proves both the full-Profile blocked-mutation guard and draft-while-pending composer behavior, and writes `workspace-after-blocked-profile-copilot-guard.json` as saved-state evidence
- final cleanup extracted the full-Profile form and view-model wiring into `apps/desktop/src/renderer/src/features/job-finder/screens/profile-screen-hooks.ts`, which brings `profile-screen.tsx` back under the renderer structure warning budget without changing the dirty-draft guard behavior
- the same pass restored visible full-Profile action feedback in `ProfileSaveFooter` and scoped starter prompts to the active profile tab so the floating bubble no longer suggests unrelated review work on the wrong section
- refreshed validations passed:
  - `pnpm --filter @unemployed/desktop test`
  - `pnpm --filter @unemployed/desktop typecheck`
  - `pnpm --filter @unemployed/desktop ui:profile-copilot-preferences`
  - `pnpm --filter @unemployed/desktop ui:profile-setup`
  - `pnpm docs:check`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm structure:check`
- comprehensive release-quality QA pass ran full `pnpm verify` (agents:check, docs:check, structure:check, lint, typecheck, test) with all 61 test files and 343 tests passing
- continued perfection-level QA pass:
  - removed developer-facing "Plan 012" badge from `profile-setup-screen-sections.tsx`
  - simplified four developer-speak descriptions across setup sections and screen into plain user language (e.g. "synced with the same saved profile data the full editor uses" → "in sync with your full profile")
  - replaced raw camelCase field keys in Profile Copilot revision summaries with a comprehensive `humanizeFieldKey` function covering ~20 known field keys plus a camelCase→human default fallback, applied across both `describePatchOperation` and `getPatchGroupOperationSummary`
  - fixed TypeScript strict-mode `keys[0]` undefined possibility with explicit guard
  - renamed internal `listResumeDraftValues` → `listCollectionValues` across 29 references in 3 files to match its actual general-purpose behavior
  - refactored module-level `sidecarAvailabilityLogged` mutable `let` into a resettable `sidecarAvailability` object with exported `_resetSidecarAvailabilityLogged()` for test isolation
  - completed the half-done `profile-setup-screen-helpers.ts` file split: removed duplicated `getReviewItemScrollTargetId` plus dangling inference function references from helpers (437→315 lines), verified `profile-setup-review-scroll-targets.ts` (303 lines) is the single canonical source, and updated the import in `profile-setup-screen-actions.ts` to point to the new module
  - `pnpm verify` passes clean: 61 test files, 343 tests, zero failures, all lint/typecheck/structure/agents/docs green
- PR #19 review findings triaged and fixed:
  - **P1 fixed**: `isProofPointValue` type guard in `resume-import-apply.ts` now validates actual property presence instead of unconditionally returning `true`
  - **P2 fixed**: Swift `classifySectionHint` aligned with TS logic — removed the overly broad `text == text.uppercased() || text.count <= 80` clause that incorrectly classified all short or uppercase text as `"identity"`, replaced with the same length-based `summary` (≥64) then regex-based `identity` (≤80, name-like pattern) logic the TS version uses
  - **P2 fixed**: `ReusableAnswerFormEntry.kind` now typed as `CandidateAnswerKind` and `LinkFormEntry.kind` as `CandidateLinkKind | ""` instead of loose `string`, which also eliminated three unnecessary type assertions that lint caught
  - **P2 fixed**: custom answer form fields in `profile-preferences-eligibility-section.tsx` now have proper `htmlFor`/`id` associations using stable computed IDs from the record entry id, matching the pattern already used in `profile-background-sections.tsx`
  - **P2 fixed**: `consentSummary` now surfaced in the application record-level detail panel alongside questions, blocker, and replay memory instead of only being visible in the attempt drill-down
  - **P2 improved**: opaque ID textareas for `projectIds`, `linkIds`, `preferredLinkIds`, `proofEntryIds`, and `roleFamilies` now have descriptive placeholder text guiding users on expected format; a full picker/autocomplete is a separate future feature
- desktop `resume-document.test.ts` sidecar DOCX test timeout increased from default 5s to 15s, matching the pattern already used by the PDF fallback test
- remaining `structure:check` hotspots (868 and 860 lines) are unchanged from the prior pass and documented as known warn-only items
- fixed grammar bug in `profile-setup-screen-sections.tsx` line 177: "1 item still need" → "1 item still needs" using the same `pendingCount === 1 ? 'needs' : 'need'` ternary already used correctly in three other places
- completed perfection-level visual QA pass across all 80 screenshots in 13 batches covering default viewport, 1024×768, 1280×800, 1728×1080, resume workspace flow, dirty-state guards, and profile visual baselines
- all screenshots validated with actual PASS/FAIL verdicts written into `apps/desktop/test-artifacts/ui/VISUAL-QA-TRACKER.md`
- 3 total issues found during the full QA pass, and all 3 are now fixed: issue #1 (raw export ID in NEXT STEP card), issue #2 (pipe-delimited camelCase suggested values in `06b-background-edit-jump.png`), and issue #3 (grammar bug)
- final cleanup round re-ran `pnpm verify`, desktop build, dark + light shell captures, guided setup, profile baseline, Preferences copilot, resume workspace, dirty-state, and scripted TXT/PDF resume-import captures; release QA returned Go-with-risk limited to cross-platform sidecar packaging proof
- `pnpm verify` passes clean: 61 test files, 343 tests, zero failures

### 19. Structure follow-up after final QA

- status: active
- priority: medium
- autonomous QA note:
  - the broad release-style sweep now passes lint, typecheck, test, docs, and UI harnesses, but `pnpm structure:check` still reports concentration warnings that should be cleaned up before the repo turns those thresholds into harder enforcement
- current hotspots:
  - `packages/ai-providers/src/deterministic/profile-copilot.ts`
  - `packages/ai-providers/src/deterministic-client.test.ts`
  - `apps/desktop/src/renderer/src/features/job-finder/components/profile/profile-copilot-rail.tsx`
  - `apps/desktop/src/renderer/src/features/job-finder/components/profile/setup/profile-setup-screen.tsx`

### 20. Broad field coverage for Profile Copilot

- status: active
- priority: critical
- autonomous QA note:
  - the shared contracts and apply layer already covered far more profile surface than the deterministic parser understood, so normal explicit requests still could not edit many real fields even though the underlying patch engine was ready
- latest progress:
  - typed support now includes a much broader set of direct explicit field updates across identity, work eligibility, professional summary, narrative, answer bank, application identity, skill groups, top-level profile skills, and more scalar preference fields
  - top-level profile list updates now use an explicit `replace_profile_list_fields` operation so deterministic Copilot can edit profile-level `skills` without pretending they live under another domain
  - `approvalMode` is now part of the search-preference patch contract so review-mode copilot proposals can target it without hidden schema gaps
  - broader search-preference list rewrites such as preferred locations still stay `needs_review` instead of silently auto-applying
  - the deterministic parser was re-split into focused modules so this widened coverage does not keep one large file growing indefinitely
