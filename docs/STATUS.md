# Status

Read this only for active feature work, handoff updates, broad repo changes, or unclear current state.

Updated: 2026-08-10

## Current Truth

- Deep production acceptance and agent-tool refinement are complete. The accepted production Electron evidence covers realistic scroll/zoom/window edges, background-operation interruption and stale-state races, conversational profile/search proposals, application documents, sensitive job-scoped assets, direct user handoffs, and proposal-first Guided Edits. The durable milestone is in `docs/HISTORY.md`; the screenshot-backed review is `docs/audits/JOB_FINDER_DEEP_ACCEPTANCE_REVIEW.html`.
- The roadmap implementation is integrated from résumé import through the final safe application checkpoint. Durable current behavior lives in `docs/PRODUCT.md`, `docs/CONTRACTS.md`, and `docs/TESTING.md`; the product handoff is `docs/audits/JOB_FINDER_COMPLETION_REVIEW.html`.
- Job Finder now has one customer-facing journey: Profile → Find jobs → Shortlisted → Applications. Task center and Needs you remain separate global destinations.
- Original CV and Tailor for this job are per-job choices. Settings supplies only the default for newly shortlisted jobs. Original-CV preparation verifies the selected file and digest without tailoring; tailored preparation requires the exact approved artifact and digest.
- Configured résumé generation asks the provider only for sparse evidence-cited prose proposals or abstention. Deterministic code owns candidate identity, chronology, complete work-history representation, skills, rendering, and fallback. Canonical employer/title/location metadata always wins over generated metadata.
- Discovery publishes settled API sources progressively, budgets by distinct retained jobs, and uses one collision-aware identity resolver for result merging and durable history. Changed, reactivated, inactive, known, and skipped state survives restart and appears in Search History/source health.
- Fit scoring/session revision uses one typed 22-field posting projection for scoring and cache identity. Unknowns and hard conflicts remain conservative; material visible-rank changes retain an explanation.
- Every classified source/application blocker persists as an exact Needs you action. Done verifies the exact blocker and schedules at most one run/job/result/checkpoint-scoped `prepare_only` retry. Mixed queues continue past blocked items.
- Final submission and account creation remain unavailable and unauthorized. Browser opening is not login proof. No current live flow clicked a final control, requested credentials, or recorded submitted state.
- Applications now includes a revisioned cover-letter/short-response workspace. Proposals are deterministically assembled from current approved profile evidence, retain exact job/application and optional attachment-question lineage, expose their evidence before approval, and become a verified CandidateAsset only after exact-revision approval. The user must still select and save the asset for the exact file question; export remains a separate local action. Focused contract/library/UI checks and the production Electron safe-preparation replay passed; broader live employer-form variety remains external acceptance work.
- Candidate Assets now enforce the approved local lifecycle. Imports default to `until_deleted`, with opt-in 30- and 90-day clocks beginning at successful import. Removal or expiry makes the asset unavailable immediately and places it in a seven-day Trash view; restore requires an explicit policy and starts a fresh clock. Startup and every asset operation retry expiry/purge enforcement, including strict aged-orphan cleanup after a one-hour in-progress safety window. Supporting-file application uploads use an adapter-owned byte loader that rechecks lifecycle, consent, size, and SHA-256 immediately before upload, so removal or tampering after initial selection blocks the write. Purge removes ordinary filesystem bytes and metadata without claiming forensic secure erase. Windows DACL hardening and generic PDF/DOCX/OCR extraction remain deferred scope.
- GPT-5.6 Luna through the Responses API is the default generative adapter, including structured JSON, image input, and tool continuations with `store: false`. Runtime reasoning remains configurable; the inspected development override used `high`. The official API remains the production path; the OpenAI-compatible loopback bridge is local development only. Audio transcription remains local Whisper or an explicit audio model.

## Current Acceptance Evidence

### Job Finder

- Deep production acceptance produced 104 current screenshots across the deep matrix, résumé flow, and first-run flow, with zero renderer/console errors and zero document/main horizontal overflow. It covered minimum-window and native 125–200% zoom states, long/nested scrolling, background navigation/settings changes, proposal-before-approval, application preparation, queue recovery, and the final safe checkpoint. Review: `docs/audits/JOB_FINDER_DEEP_ACCEPTANCE_REVIEW.html`.
- Greenhouse original-CV flow: current Glean listing; synthetic résumé import; exact original asset unchanged; seven supported questions; upload verified; visible `Apply` control; final control untouched; final-submit authorization false; temporary workspace deleted. Report: `apps/desktop/test-artifacts/job-finder/complete-flow-current-greenhouse/prepare-only-smoke-report.json`.
- Ashby tailored-CV flow: current Constructor listing; five-section one-page grounded draft; zero validation issues; exact approved artifact; five questions; upload verified; visible `Submit Application`; untouched. Report: `apps/desktop/test-artifacts/job-finder/complete-flow-current-ashby-tailored-final-20260809/prepare-only-smoke-report.json`.
- Workday anonymous flow: current AMAT listing; `site_login_required`; visible instruction to sign in manually and retry; no credentials or inferred authentication; no submitted state. Report: `apps/desktop/test-artifacts/job-finder/complete-flow-current-workday-final-20260809/prepare-only-smoke-report.json`.
- Fresh first-run evidence covers import, setup Copilot, exact imported-field review links, readiness, one-row desktop navigation, nonblocking optional suggestions, and the Profile → Find jobs continuation. Artifacts: `apps/desktop/test-artifacts/ui/production-user-audit-20260809-final2/`.
- Live public-provider ranking evidence covers three synthetic profiles and current Greenhouse, Lever, and Ashby inventories. Engineering retained 1 of 18 as reviewable, support retained 2 of 18, and career change retained 4 of 17; every generated résumé had zero unsupported numeric claims. Report: `apps/desktop/test-artifacts/job-finder/diverse-live-audit/summary.json`.
- Resume Studio current-build evidence covers preview failure/recovery, claim-proof disclosure, template selection, live editing, a successful configured Luna-high Guided Edits response, export, approval, return to Shortlisted, the visible primary Prepare application action, and the safe Applications stop. Artifacts: `apps/desktop/test-artifacts/ui/resume-workspace-luna-high/`.
- Original-CV evidence names the exact imported asset, exposes the per-job Original/Tailored radio choice and sensitive-detail warning, and keeps Prepare application visible. Artifacts: `apps/desktop/test-artifacts/ui/original-cv-flow/`.
- Action Inbox current-build evidence covers 1440 px, 900 px, and native 200% zoom. Every Open/Done/Skip/Cancel control and shell destination remains reachable with zero horizontal overflow; browser-only credentials and false account/final-submit authority are recorded. Report: `apps/desktop/test-artifacts/ui/action-inbox/capture-report.json`.

### Interview Helper shared-platform regression

- The current production build opens two visible answer/transcript popup windows. Typed popup chat, temporary screenshot attachment, copy, hide/reopen, resize, persisted bounds, renderer reload, and configured local STT readiness passed. Raw image bytes were not retained. Live microphone/system-audio hardware capture was not repeated in this pass. Report: `apps/desktop/test-artifacts/ui/interview-helper-basic/report.json`.
- This is a limited Windows regression, not a new Interview Helper product-expansion claim.

### Configured model comparison

- Sparse Luna-high generation: `technical_matrix` 17.222 s with 0 accepted / 1 rejected rewrite; `classic_ats` 23.126 s with 1 accepted / 0 rejected. All deterministic quality gates remained 1.0.
- Felidae on the same synthetic cases: 9.098 s and 9.821 s, with 0 accepted / 5 and 0 accepted / 4. It remained faster, while fallback kept quality gates at 1.0.
- Luna improved accepted grounded contribution and avoided the earlier timeout; it did not beat Felidae's latency in this narrow sample. No private résumé was transmitted.
- The final configured recheck completed `frontend_platform` in 11.207 s and `grounded_baseline` in 19.819 s. All gates were 1.0 and sparse generation safely abstained; the separate live Guided Edits journey succeeded in 28.9 s.

## Verification State

- Final verification passes guidance, documentation, source-generic structure, all package lint and typecheck tasks, the 52-case/four-cohort fit calibration, and all 257 test files / 1,902 passing tests with one intentional skip.
- The consolidated gate additionally caught and fixed a Profile Save test lint violation, source-only fresh workspaces incorrectly appearing started, and default five-second timeouts on heavy multi-template résumé benchmark cases. The final uninterrupted gate is green.
- The first broad run exposed identity/ledger host timings of 2,119 ms and 2,435 ms against unchanged 2,000 ms budgets. Production normalization/indexing was optimized without raising budgets or weakening collision safety. Three focused runs measured the 10k path at 815–1,045 ms and repeated unchanged-source work at 348–356 ms; both also pass inside the final broad suite.
- Focused batches for résumé grounding/coverage/import, progressive discovery, application recovery, workspace deltas, performance evidence, responsive shell/action inbox, Resume Studio, and Interview Helper are green. Exact commands and evidence live in `docs/TESTING.md` and the linked audit reports.

## Durable Constraints

- `packages/job-finder` owns Job Finder orchestration.
- `packages/browser-agent` owns browser workflow policy, prompts, and structured outputs; `packages/browser-runtime` stays generic.
- Discovery and source-debug remain source-generic. Board-specific rescue logic in core product flow is debt, not a pattern.
- Cross-package and Electron boundaries stay typed and schema-validated; no untyped IPC or `any`.
- Credentials, security answers, CAPTCHA solving, MFA, legal consent, external account creation, and final submission remain user-owned.
- Visual analysis is evidence-only. It cannot create selectors, browser actions, candidate facts, submission guidance, or saved-job policy.
- Interview Helper capture, audio, screenshots, overlays, cue generation, retention, and Job Finder write-back remain explicit, visible, auditable, and adapter-owned.

## Remaining External or User Review

- Review the integrated Job Finder with the user's private résumé before deployment; synthetic quality gates cannot establish personal wording preference.
- Continue an authenticated Workday checkpoint only after a voluntary browser sign-in and explicit Done confirmation.
- Validate Interview Helper capture/audio behavior on macOS and Linux target hosts.
- Run screen-reader and personal reduced-motion review during deployment acceptance; current automated/native evidence covers keyboard focus, non-color status, 900 px, and 200% zoom.
- Computer Use's signed helper failed to launch with `spawn EPERM` after bounded retries. Current visual evidence was gathered from the real production Electron app by the root-owned Playwright harness; no subagent GUI or mock web app was used.

## Deferred Product Scope

- Candidate Asset timed retention, Trash, restore, and ordinary purge are implemented. Stronger per-user Windows DACL hardening, generic PDF/DOCX text extraction, and OCR remain intentionally deferred; current `0700`/`0600` modes are best-effort Node permission hints on Windows, not an explicit DACL or secure-erase guarantee.

## References

- Deep acceptance review: `docs/audits/JOB_FINDER_DEEP_ACCEPTANCE_REVIEW.html`
- Product completion review: `docs/audits/JOB_FINDER_COMPLETION_REVIEW.html`
- Living release audit: `docs/audits/PRODUCT_QUALITY_RELEASE_AUDIT.md`
- Tracks: `docs/TRACKS.md`
- Product: `docs/PRODUCT.md`
- Architecture: `docs/ARCHITECTURE.md`
- Contracts: `docs/CONTRACTS.md`
- Testing: `docs/TESTING.md`
- Completed milestones: `docs/HISTORY.md`
