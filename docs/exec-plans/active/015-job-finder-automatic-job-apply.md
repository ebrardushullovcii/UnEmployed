# 015 Job Finder Automatic Job Apply

Status: active

Plan `015` is now active. Plan `007` completed the `Resume Workspace` hardening. Plan `010` completed the measurement-first browser-efficiency slice. The first implementation slice remains intentionally staged rather than jumping straight from the review-gated apply flow to queue-wide automatic submission.

## Goal

Evolve `Job Finder` from a review-gated one-job apply helper into a staged autonomous apply system:

1. land first-class apply data and artifact domains
2. ship a one-job `apply copilot`
3. promote that path into one-job true automatic submit
4. extend the same run model to queued batch execution with run-scoped approval

The eventual product target still includes true automatic submission, but the path there now explicitly assumes stronger answer memory, blocker artifacts, provider intelligence, and structured source-debug inputs instead of treating queue-wide auto-submit as the first implementation slice.

## Delivery Standard For Implementing Agents

This plan is not complete when the code merely compiles or one happy-path form submits once.

## Operator Safety Note

- User instruction on `2026-04-18`: do **not** run live-site application flows, real employer application submissions, or final-submit QA for this plan until the user explicitly re-authorizes that work.
- The current Milestone 1 foundation slice must stay non-submitting.
- Validation for this phase should stay deterministic and local: contracts, repository persistence, service orchestration, IPC wiring, desktop build, and docs checks are allowed; live application execution is not.

Required implementation bar:

- land reusable question, answer, blocker, consent, and replay domains before broad auto-submit
- ship one-job `apply copilot` before queued multi-submit automation
- prove generated answers stay grounded and auditable
- prove the run can skip blocked jobs and continue cleanly once queue execution lands
- prove explicit consent interrupts for sign-up or comparable decisions
- treat provider-aware public endpoints as intelligence inputs, not as a fake universal direct-submit path
- leave behind repeatable QA or harness coverage for copilot, single-job auto-submit, queue, blocker, and consent cases
- update docs in the same task so the workflow is not chat-only knowledge

## Research Inputs

- queued plans `011` through `017`
- Greenhouse Job Board API: `https://developers.greenhouse.io/job-board.html`
- Lever developer docs: `https://hire.lever.co/developer/documentation`

## Integrated Findings

1. The product needs an intermediate `apply copilot` milestone before broad automatic submit.
   - The browser flow still needs a strong question-detection, answer-grounding, and blocker-artifact pass that can stop safely before final submit.

2. The current profile is not rich enough to trust long-form screener automation on its own.
   - Richer narrative, proof-bank, and answer-bank data from queued plans `011` and `012` must shape how freeform answers are grounded.

3. Current source-debug guidance is too freeform to be the long-term control plane for broad apply automation.
   - Apply should consume typed provider, route, auth, question-surface, and apply-path hints when present, following the direction captured in queued plan `013`.

4. Provider APIs are useful as public intelligence surfaces, not as a universal candidate-side direct-submit path.
   - Greenhouse exposes public job and question surfaces, but application `POST` requires an employer API key.
   - Lever exposes posting application questions, but the documented API surfaces require employer-authenticated API or OAuth credentials.
   - That means provider-aware research can improve question modeling, prefill, route planning, and blocker classification, but the generic product path must still assume live-browser submit for arbitrary jobs.

5. Resume quality remains a prerequisite for apply automation being a product win.
   - `015` continues to depend on an approved non-stale tailored resume export from `007`, and the deeper resume-quality direction in queued plan `014` should improve the value of later automation without reopening the approval boundary.

Planning consequence:

- this plan now absorbs the comparative-review rethink directly into the main rollout instead of leaving those findings as an appendix

## Locked Product Decisions

- The eventual target remains `true automatic submission`, not only better autofill with a human final click forever.
- The rollout is staged: shared apply domains -> one-job `apply copilot` -> one-job auto-submit -> queue automation.
- Queue automation is not the first milestone.
- The first shipped slice may fill, classify, and persist answers and artifacts, but it must pause before final submit.
- A single approval session may later authorize final submission for multiple jobs inside one bounded queued run, but only after the one-job auto-submit path is already trustworthy.
- The system no longer depends on a predefined supported-source or adapter allowlist as the primary control plane for apply automation.
- Any target may still be attempted through the live browser flow if the current run can prove enough context and safety at runtime.
- Public or auth-safe provider endpoints may be consumed for question modeling, field classification, route planning, or blocker classification when they materially help.
- Provider APIs that require employer credentials are optional future integrations, not the default generic submit path.
- Resume approval remains per job and stays mandatory; apply automation must refuse to continue without an approved, non-stale tailored resume export.
- Freeform screener answers may be generated and later auto-submitted, but only from structured profile data, imported user documents, saved preferences, reusable answer-bank or narrative or proof data, and the current job or application context. The app must never invent candidate facts.
- External login or signup flows are allowed only after explicit user consent in the live run. Existing-account login should be preferred over sign-up when the site offers both. Queue or session approval does not authorize silent account creation.
- When a job exits the safe path mid-run, the default behavior is `skip this job, record artifacts, continue the queue`.
- Minimum retained blocker artifacts are: blocking step, reason code, field snapshot or prompt text, screenshot refs, and a replay checkpoint.

## Why This Work Exists

Plan `007` makes resume approval, export, and apply-time resume safety real, but the current apply path is still intentionally narrow:

- `packages/job-finder` still routes final submit through `approveApply(jobId)`
- `packages/browser-runtime` still exposes `executeEasyApply()` as the main submit seam
- generic target flows still stop with manual or unsupported behavior instead of finishing end-to-end
- `ApplicationAttemptCheckpoint` is still too thin to become the durable home for answers, blocker evidence, consent state, and replay recovery
- source-debug apply knowledge is still mostly freeform guidance arrays rather than typed reusable intelligence
- current stored profile and answer memory are not yet strong enough to trust broad long-form screener automation

That leaves the product with six gaps:

1. The user still has to finish most application work manually even after the app knows the job, the resume, and the browser state.
2. The current submit seam is too narrow for broad live-browser application flows.
3. The system cannot yet capture enough structured question, answer, blocker, and replay data to make later automation trustworthy.
4. Long freeform screener automation is too risky until richer reusable candidate memory exists.
5. Apply planning still relies too much on freeform source-debug guidance instead of typed provider and route intelligence.
6. Queue automation cannot be trusted until one-job copilot and one-job auto-submit work cleanly first.

## Current Code And Contract Starting Points

The implementing agent should start from the current seams instead of inventing a parallel architecture:

- `packages/contracts/src/base.ts` already includes `ApprovalModeSchema` values through `full_auto`
- `packages/job-finder/src/internal/workspace-application-methods.ts` still funnels final submit through `approveApply(jobId)`
- `packages/browser-runtime/src/runtime-types.ts` still exposes `ExecuteEasyApplyInput` and `executeEasyApply()`
- `packages/browser-runtime/src/playwright-browser-runtime.ts` still treats generic target submission as manual or unsupported
- `packages/contracts/src/discovery.ts` still models `ApplicationAttemptCheckpoint` as only `id`, `at`, `label`, `detail`, and `state`
- `packages/contracts/src/source-debug.ts` still models `SourceInstructionArtifact` mostly around freeform `navigationGuidance`, `searchGuidance`, `detailGuidance`, and `applyGuidance` arrays
- `packages/contracts/src/discovery.ts` and related source-debug contracts already retain target guidance and apply-path hints that can seed the next iteration when widened into stronger structured inputs

## Product Direction

Plan `015` defines a staged apply evolution.

### Stage 1: Shared apply data foundation

Land first-class apply-run, question, answer, blocker, consent, and replay domains plus minimum structured apply-facing intelligence inputs so the app can capture and reuse what it learns.

### Stage 2: One-job `apply copilot`

Let the app inspect the live form, classify fields and questions, upload the approved resume, fill safe grounded answers, suggest or fill grounded long-form answers, and pause safely before final submit while preserving structured artifacts.

### Stage 3: One-job true automatic submit

Reuse the same generalized apply runtime and artifact model, but add explicit submit approval, consent handling, submit execution, and positive confirmation for one eligible job.

### Stage 4: Queue automation and multi-submit approval

Once the single-job path is trustworthy, extend it into a bounded queue run with run-scoped approval, skip-and-continue handling, and per-job recovery artifacts.

This is still a future-direction plan, not a claim that the current shipped app already behaves this way.

## Relationship To Existing Work

### Relationship To `007`

Plan `007` is still the prerequisite slice.

`015` must reuse and preserve these `007` rules:

- the per-job `Resume Workspace` remains the source of truth for resume approval
- apply flows must use the approved non-stale tailored export, not the base resume
- stale or missing approved exports remain hard-stop conditions
- staged apply work may add copilot, run, approval, and queue orchestration, but it must not weaken resume approval, export validation, or staleness checks

`015` should not reopen `007` scope by redesigning resume generation, templates, or approval semantics. It consumes those outcomes and layers apply intelligence and automation on top of them.

### Relationship To `011`, `012`, And `014`

Queued plans `011`, `012`, and `014` capture assumptions this plan should absorb rather than fight later:

- `011` creates the shared candidate, job, answer, blocker, and replay roots that apply should reuse instead of inventing apply-only storage
- `012` expands guided setup and profile capture so later screener automation has stronger candidate memory
- `014` improves the quality and usability of the approved tailored resume artifact that apply depends on

Implementation rule:

- `015` should not wait for every adjacent plan to ship first, but it must adopt these data-model and product assumptions instead of cementing a thinner apply-only model that later plans would have to undo

### Relationship To `013`

Plan `013` captures the provider-aware and typed source-intelligence direction that apply should consume:

- use typed provider, route, auth, question-surface, and apply-path hints when present
- allow public or auth-safe provider question surfaces to improve question modeling and blocker classification where helpful
- do not treat provider direct-submit APIs as the default generic path when they require employer credentials
- keep `packages/browser-runtime` generic and keep provider-specific workflow policy in `packages/browser-agent` or `packages/job-finder`

### Relationship To `004` And `005`

Plans `004` and `005` already generalized discovery around target sites and learned guidance.

`015` should build on that work without reintroducing a rigid adapter-first submission model:

- use learned target guidance and prior attempt artifacts when they exist
- do not require a predefined supported-source allowlist before the runtime can attempt a live apply flow
- keep `packages/browser-runtime` generic and `packages/browser-agent` bounded even though the product no longer thinks in terms of only these adapters can submit

## Scope

### In Scope

- first-class apply-run, submit-approval, consent, blocker, question, answer, and replay domains
- minimum structured apply-facing source and provider intelligence consumption
- one-job `apply copilot` that can inspect, classify, upload, fill safe grounded answers, and pause safely before final submit
- one-job true automatic final submission after the copilot path is proven
- queued batch execution under one bounded session approval after the one-job path is proven
- general live browser application flows rather than only `easy_apply`
- inline applications, external redirects, bounded multi-step review flows, and resume upload flows
- short screener questions and long freeform screener answers
- generated freeform screener answers grounded in structured profile data, imported user docs, saved preferences, reusable answer-bank or narrative or proof data, and the current job or application context
- consent interrupts for login or signup or other explicit operator decisions that cannot be assumed from submit approval alone
- typed retained blocker artifacts and replay checkpoints when a job is skipped or paused
- run history, job-level result history, and retry or resume surfaces
- deterministic test coverage for orchestration, answer generation policy, blocker capture, skip-and-continue, and approval boundaries

### Out Of Scope

- employer-authenticated ATS integrations as the generic default path for arbitrary jobs
- queue automation as the very first milestone
- captcha bypass, 2FA bypass, paywall bypass, or secret harvesting
- silent account creation without an explicit live consent step
- unrestricted background automation that survives app restart and keeps submitting unattended
- parallel multi-tab or multi-window submission as a first requirement; queue processing can remain sequential in v1
- automatic upload of arbitrary extra documents that were not already approved or selected for that job
- cover-letter generation or outreach workflows as part of the same slice
- pretending every live page can be auto-submitted just because the browser reached it
- removing typed contracts or package boundaries in the name of flexibility

## Workflow Shape

### One-Job `Apply Copilot` Flow

1. The user opens a saved job that already has an approved, non-stale tailored resume export.
2. The user starts an `apply copilot` run for that one job.
3. The app opens the live browser flow and may also consume a public or auth-safe provider question surface when that helps classify the form.
4. The runtime uploads the approved resume, fills deterministic grounded answers, proposes or fills grounded long-form answers, and pauses on ambiguous, consent-gated, or unsupported cases.
5. The flow stops before final submit.
6. The app records question records, answer provenance, blocker artifacts, checkpoints, and current review-ready state.

### Single-Job Automatic Submit Flow

1. The user starts an automatic submit run for one eligible job.
2. The app shows a submit-approval prompt that clearly states the job scope and that the run may perform the final submit action automatically.
3. The runtime reuses the same generalized apply flow to fill the application, upload the approved resume, answer screeners, submit, and confirm the result.
4. The app records the attempt, checkpoints, generated answers, evidence refs, and final outcome.

### Queue Flow

1. The user selects multiple eligible jobs.
2. The app snapshots the ordered queue into one bounded automation run.
3. The app asks once for session approval covering the exact jobs in that run.
4. The runtime processes the jobs sequentially.
5. If a job is blocked, the app records the blocker artifacts, marks the job skipped or blocked, and continues with the next job by default.
6. The run ends with a summary of submitted, skipped, blocked, failed, and remaining jobs.

### Consent Interrupt Flow

Some events are not ordinary blockers. They are explicit operator decisions.

Examples:

- `Do you already have an account on this external site?`
- `This site requires sign-up before apply. Continue into a bounded account-creation path?`
- `A manual verification step is required right now.`

Required behavior:

- the current job pauses behind a typed consent request
- the user can `continue`, `skip job`, or `cancel run`
- if the user declines or the prompt expires, the job is skipped and the queue continues
- submit approval alone is not enough to authorize silent sign-up

## Safety Model And Approval Boundaries

### Candidate-Fact Boundary

The app may tailor, rewrite, shorten, expand, or reframe content, but it must never invent candidate facts.

Allowed grounding inputs for auto-filled or suggested answers:

- structured profile data
- imported resume and user-owned documents
- saved user preferences
- reusable answer-bank entries
- narrative and proof-bank data
- current job description, field labels, and visible application context

Disallowed inputs for candidate claims:

- inferred facts from employer marketing pages
- invented years, employers, titles, metrics, certifications, clearances, or legal status
- guesses about questions whose meaning remains unclear after bounded analysis

### Resume Boundary

Apply assistance or automation is never allowed to silently fall back to the base resume.

Required rule:

- if the selected job does not have an approved, non-stale tailored resume export that still exists on disk, the job is ineligible and must be recorded as blocked or skipped

### Phase Approval Boundary

Approval semantics now change by milestone instead of jumping straight to queue-wide `full_auto`.

Required rules:

- in the `apply copilot` milestone, the flow may navigate, inspect, upload, and fill, but it must stop before final submit
- in the one-job auto-submit milestone, final submit requires explicit approval bound to the current run id and job id
- in the queue milestone, one approval session may authorize multiple submits only for the concrete run id and job ids included when the run starts
- queue approval must not silently extend to new jobs added later
- submit approval must expire when the run completes, is cancelled, or the app session ends
- approval must be revocable while the run is in progress

### Consent Boundary

Some actions are allowed only with explicit live consent.

Required consent-gated cases:

- account creation or sign-up
- `do you already have an account` decisions that change whether the run proceeds into login or sign-up
- any clearly user-identity-specific flow the app cannot safely assume from prior approval alone

Implementation rule:

- queue or session approval does not cover these actions by default

### Provider Boundary

Provider-aware apply research is allowed, but it does not erase the generic browser safety rules.

Required rules:

- public or auth-safe provider surfaces may help detect questions, required fields, or likely blocker states
- if a direct provider submit path requires employer credentials that are not configured, treat that path as informational only and continue with the browser path or block the job safely
- do not move provider-specific HTTP submission logic into `packages/browser-runtime`

### Submit-Confirmation Boundary

Do not mark a job as `submitted` unless the runtime positively confirms submission.

Positive confirmation can include:

- a terminal success page
- a stable confirmation banner or state
- a terminal URL or application-state change that the runtime can verify

If final confirmation is missing, the job must not be marked `submitted`. It should remain paused, failed, or blocked with retained evidence.

### Skip-And-Continue Boundary

There is no predefined supported-source list, but blocked cases still exist at runtime.

When the runtime cannot continue safely, it must:

- stop the current job
- retain the blocker artifacts
- mark the reason with a typed code
- move to the next queued job by default unless the event is a live consent request

## Explicit Unsupported-Case Behavior

This plan intentionally drops the old idea that support is decided ahead of time by source or adapter. Support is now earned at runtime on the current flow.

A job becomes `automation_blocked` or `unsupported_for_this_run` when the live flow hits conditions such as:

- missing or stale approved resume
- login required and cannot be satisfied
- sign-up required and the user does not consent
- captcha, 2FA, or site protection blocks progress
- the app cannot interpret a field or question safely
- a long freeform answer cannot be grounded well enough
- a requested upload asset is unavailable
- a provider direct-submit path requires employer credentials that are unavailable and no safe browser path succeeds
- the final submission state cannot be confirmed
- navigation drifts into a page the run cannot classify well enough

Default behavior:

- skip the job
- record the blocker artifacts
- continue the queue

Minimum retained artifacts for every skipped or blocked job:

- blocking step or stage
- typed reason code
- field snapshot or visible prompt text
- screenshot refs
- replay checkpoint or nearby recovery state

## Domain And Contract Direction

Add schemas before widening behavior.

The exact names can change if a tighter fit emerges, but the implementing agent should not have to invent the product model from scratch.

Implementation rule:

- do not bake queue-only or automation-only assumptions into the core domains, because the first delivery slice is `apply copilot`, not queue automation

### Recommended Shared Domains

- `ApplyRunMode`
  - `copilot`
  - `single_job_auto`
  - `queue_auto`
- `ApplyRunState`
  - `draft`
  - `awaiting_submit_approval`
  - `running`
  - `paused_for_user_review`
  - `paused_for_consent`
  - `completed`
  - `cancelled`
  - `failed`
- `ApplyJobState`
  - `planned`
  - `question_capture`
  - `filling`
  - `awaiting_review`
  - `submitting`
  - `submitted`
  - `skipped`
  - `blocked`
  - `failed`
- `ApplyBlockerReason`
  - `resume_missing`
  - `resume_stale`
  - `auth_required`
  - `signup_consent_required`
  - `site_protection`
  - `field_interpretation_failed`
  - `question_grounding_failed`
  - `required_human_input`
  - `asset_unavailable`
  - `provider_submit_auth_unavailable`
  - `submit_confirmation_missing`
  - `unexpected_navigation`
- `ApplyRun`
- `ApplyJobResult`
- `ApplySubmitApproval`
- `ApplicationQuestionRecord`
- `ApplicationAnswerRecord`
- `ApplicationArtifactRef`
- `ApplicationReplayCheckpoint`
- `ApplicationConsentRequest`

### Contract Guidance

- keep `ApprovalModeSchema`, but stop treating `full_auto` as meaning submit forever without any bounded run approval
- add a separate run-scoped submit-approval domain instead of overloading `JobSearchPreferences.approvalMode`
- keep `ApplicationAttempt` as the durable high-level attempt record
- add neutral apply-run domains instead of names that assume every run auto-submits
- keep answers, blocker artifacts, consent requests, and replay checkpoints as sibling first-class domains instead of packing everything into checkpoint strings
- widen `SourceInstructionArtifact` or add a sibling apply-intelligence domain so apply can consume typed provider, route, auth, question-surface, and apply-path hints instead of only freeform guidance arrays
- generalize `executeEasyApply()` into a broader apply-flow execution interface that can run in `prepare_only` and `submit_when_ready` modes, or an equivalent typed split
- keep workspace snapshots lightweight by returning run summaries plus current job state rather than every raw artifact inline

## Persistence And Repository Direction

The repository must preserve enough detail for recovery and audit.

Recommended persisted collections or tables:

- apply runs
- apply job results
- submit approvals
- consent requests or consent history
- question records
- answer records
- artifact refs and blocker evidence
- replay checkpoints

Required storage rules:

- store results per job, not only per run
- keep ordered queue position, run mode, and run-scoped job lists
- make it easy to load the latest copilot run for a job and the latest blocker artifacts for a skipped job
- keep screenshot refs and field snapshots outside the renderer snapshot unless the UI explicitly requests them
- mirror filtering and ordering semantics in both in-memory and file-backed repositories
- do not store passwords, provider secrets, or equivalent credentials in this domain
- do not turn raw provider payload dumps into the main durable contract unless they are normalized or referenced by a bounded artifact record

## Runtime And Package Responsibilities

### `packages/job-finder`

Owns:

- run creation and mode selection (`copilot` versus auto-submit)
- eligibility checks before a job enters a run
- choosing between live-page analysis and auth-safe provider question-surface consumption when known
- submit-approval policy
- consent policy
- answer-grounding policy
- blocker classification
- persistence of runs, results, question records, answers, and artifacts
- updates to review, application, and retry state

### `packages/browser-runtime`

Owns:

- browser session lifecycle
- page navigation
- safe interaction primitives
- upload execution
- submit action execution
- confirmation-detection primitives

Direction change:

- the current `executeEasyApply()` seam is too narrow for this plan
- generalize the apply runtime into a broader application-flow execution interface that can stop before submit or continue through submit and confirmation
- do not move provider-specific HTTP submission logic into the generic runtime

### `packages/browser-agent`

Owns bounded live-browser or normalized-question-surface reasoning tasks such as:

- field and question interpretation
- review-step classification
- deciding which visible controls matter on the current page
- bounded submit-readiness reasoning
- optional use of prior learned target guidance or public provider question-surface hints
- prompts, transcript compaction, and tool policy for those bounded workflows
- deterministic workflow policy layered over generic runtime primitives when seeded or fallback paths need filtering, eligibility gates, checkpoint shaping, or approved-resume usage rules

It should not become the owner of product approval policy or apply-state persistence.

### `apps/desktop`

Owns:

- starting one-job copilot runs, one-job auto-submit runs, and queued runs
- submit-approval UI
- consent-interrupt UI
- live progress UI
- question-review and blocker-review surfaces
- run history, skipped-job review, and retry controls
- typed preload and IPC surfaces for the new apply actions

## Workstreams

### 1. Shared Apply Domains And Repository Expansion

- add the apply run, submit approval, consent, blocker, question, answer, artifact, and replay domains
- extend repository state and IPC payloads
- add deterministic contract tests
- keep renderer snapshots lightweight

### 2. Structured Apply Intelligence Inputs

- widen source-debug and apply-facing artifacts just enough that apply can consume typed provider, route, auth, and question-surface hints
- consume public or auth-safe provider question surfaces when they materially improve classification or blocker detection
- do not design around employer-authenticated direct-submit APIs as the generic path

### 3. General Apply Runtime

- replace the narrow `easy_apply` submit seam with a general live apply-flow runtime
- support inline pages, external redirects, multi-step review screens, and resume upload flows
- support both `prepare_only` and `submit_when_ready` behavior, or an equivalent typed split
- require positive submission confirmation

### 4. One-Job `Apply Copilot`

- classify application fields and screeners
- map simple structured answers directly from profile or answer-bank data
- generate long freeform answers from user-owned profile data, imported docs, reusable answer-bank or narrative or proof data, and the current job or application context
- pause on ambiguous items, unsupported flows, or before final submit
- store question records, answer provenance, blocker artifacts, and replay checkpoints

### 5. One-Job Auto-Submit

- add explicit one-job submit approval
- reuse the same runtime and artifact model to submit and confirm one job end-to-end
- support consent interrupts and clean recovery

### 6. Queue Automation And Multi-Submit Approval

- create one run model that works for both one-job and multi-job execution
- bind session approval to the run id and initial job list
- process jobs sequentially
- skip and continue on blocked jobs
- allow revoke, cancel, retry, and rerun flows

### 7. Desktop UX, QA, And Docs

- add run launch surfaces and approval copy
- add live progress, current-step, and per-job outcome UI
- add question-review and skipped-job blocker review surfaces
- add deterministic and live QA harnesses
- update the queued-product docs and testing guidance in the same task

## Milestones

### Milestone 1: Apply Domains And Structured Inputs

- land shared contracts, repository storage, and IPC seams for apply runs, submit approvals, question records, answer records, blocker artifacts, consent requests, and replay checkpoints
- land minimum structured apply-intelligence inputs so apply no longer depends only on freeform guidance arrays

Exit signal:

- the app can create and persist one non-submitting `copilot` run with typed status and history without executing live submit yet

### Milestone 2: One-Job `Apply Copilot`

- land the generalized live apply runtime in review-safe mode
- inspect one real job end-to-end with resume upload, screener handling, retained question records, and a pause before final submit

Exit signal:

- one eligible job can be brought to a filled or review-ready state with retained answer provenance, blocker artifacts, and replay checkpoints, without auto-submitting

### Milestone 3: Single-Job Autonomous Submit

- add explicit one-job submit approval
- execute one eligible job end-to-end with final submit and confirmation detection

Exit signal:

- one eligible job can be automatically submitted end-to-end with retained question records and blocker artifacts when needed

### Milestone 4: Queue Automation And Multi-Submit Approval

- bind one approval session to a queued run
- process multiple jobs sequentially
- skip blocked jobs and continue automatically

Exit signal:

- one approved queue can submit multiple jobs without asking again for every final submit, while still recording per-job outcomes and skips

### Milestone 5: Hardening, QA, And Docs

- add deterministic and targeted live validation
- add UI harnesses for copilot runs, queue runs, skips, and consent prompts
- update `docs/STATUS.md`, `docs/TRACKS.md`, `docs/modules/JOB_FINDER.md`, `docs/CONTRACTS.md`, `docs/ARCHITECTURE.md`, and `docs/TESTING.md` as needed

Exit signal:

- the staged apply system is demonstrable, recoverable, and documented well enough that another agent can execute the flow without reconstructing intent from chat

## Failure Modes That Must Work

- approved resume missing at run start
- approved resume becomes stale before submit
- auth expires before the application opens
- the site asks whether the user already has an account
- the user declines or ignores sign-up consent
- captcha or 2FA appears
- a field label or question meaning cannot be interpreted safely
- a long freeform answer cannot be grounded well enough
- a public provider question surface exists but the direct provider submit path requires employer credentials
- provider hints and the live page diverge enough that the app cannot trust autofill without pausing
- the site asks for an unavailable extra attachment
- submit is clicked but no confirmation can be proven
- submit approval is revoked mid-run
- the queue is cancelled mid-run
- a previously blocked job is retried later from retained checkpoint context

## Recommended Execution Order

1. Land shared domains, repository storage, IPC surfaces, and minimal structured apply-intelligence inputs.
2. Generalize the runtime beyond `executeEasyApply()` so the same flow can run in `prepare_only` and `submit_when_ready` modes, or an equivalent typed split.
3. Ship one-job `apply copilot` with question capture, answer provenance, blocker artifacts, and replay checkpoints.
4. Add one-job auto-submit with explicit submit approval, consent interrupts, and positive confirmation.
5. Add queue orchestration and multi-submit approval.
6. Add or widen provider-aware public question-surface fast paths only where they materially improve coverage, without turning employer-authenticated APIs into the generic path.

## Quality Bar

- Do not treat the current profile alone as sufficient grounding for every long-form answer.
- Do not assume Greenhouse- or Lever-style provider APIs are a generic direct-submit path without employer credentials.
- Do not silently submit without the explicit approval required for the current phase.
- Do not silently create accounts.
- Do not silently fall back to the base resume.
- Do not invent candidate facts in generated answers.
- Do not mark `submitted` without positive confirmation.
- Do preserve per-job question records, answer provenance, blocker artifacts, screenshots, and replay checkpoints.
- Do keep queue processing stable when one job fails or is skipped.
- Do keep browser-runtime generic, browser-agent bounded, and orchestration in `packages/job-finder`.
- Do update docs and QA workflows in the same task as implementation.

## Verification Expectations

Implementation work for this plan should be validated with at least:

- For the current Milestone 1 non-submitting foundation slice, do not exercise live application submission paths even if later milestones eventually require them. Leave live apply QA for a separately authorized follow-up.

- `pnpm --filter @unemployed/contracts test`
- `pnpm --filter @unemployed/db test`
- `pnpm --filter @unemployed/job-finder test`
- `pnpm --filter @unemployed/browser-agent test`
- `pnpm --filter @unemployed/browser-runtime test`
- `pnpm --filter @unemployed/browser-runtime typecheck`
- `pnpm --filter @unemployed/desktop build`
- `pnpm verify`
- `pnpm docs:check`

Additional completion rule:

- leave behind dedicated desktop QA or capture harnesses for one-job `apply copilot`, one-job auto-submit, queue auto-apply, blocker skip-and-continue, consent-interrupt handling, and at least one provider-aware public question-surface path when such a path is used

## Docs To Keep Updated During Implementation

- `docs/STATUS.md`
- `docs/TRACKS.md`
- `docs/modules/JOB_FINDER.md`
- `docs/CONTRACTS.md`
- `docs/ARCHITECTURE.md`
- `docs/TESTING.md`

## Exec-Plan Lifecycle

When work on this plan begins:
- Move the exec plan file from `docs/exec-plans/queued/` to `docs/exec-plans/active/`
- Update the plan file's `Status:` header (e.g., change from `ready` to `in_progress`)
- Update `docs/TRACKS.md` to change the track status from `ready` to `in_progress`

When preparing for handoff, creating a commit/PR, or when the plan becomes stale:
- Update `docs/STATUS.md` to reflect the current state
- Update `docs/TRACKS.md` to move the track to `handoff` if work is incomplete
- If the plan is no longer driving implementation, move it from `docs/exec-plans/active/` to `docs/exec-plans/completed/` and set its `Status:` to `completed`
- Update any relevant module docs in `docs/modules/`

When the plan is complete:
- Move the exec plan file from `docs/exec-plans/active/` to `docs/exec-plans/completed/`
- Update the plan file's `Status:` header to `completed`
- Update `docs/STATUS.md` to reflect completion and next steps
- Update `docs/TRACKS.md` to mark the track as `done` and note completion
