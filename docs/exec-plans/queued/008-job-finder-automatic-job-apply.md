# 008 Job Finder Automatic Job Apply

Status: ready

This plan is defined but not started. It is the next queued follow-on work after plan `007` hardens the `Resume Workspace`.

## Goal

Enable `Job Finder` to run true automatic applications for either one selected job or a queued batch of jobs, using a live browser flow, an approved non-stale resume artifact, generated profile-grounded screener answers, session-scoped multi-submit approval, and skip-with-artifacts recovery when a job cannot be submitted safely.

## Delivery Standard For Implementing Agents

This plan is not complete when the code merely compiles or one happy-path form submits once.

Required implementation bar:

- ship both one-job and queue-driven automatic submission from the same run model
- prove the run can skip blocked jobs and continue cleanly
- prove explicit consent interrupts for sign-up or comparable decisions
- prove generated answers stay grounded and auditable
- leave behind repeatable QA or harness coverage for queue, blocker, and consent cases
- update docs in the same task so the workflow is not chat-only knowledge

## Locked Product Decisions

- The target outcome is `true automatic submission`, not only more automation with a human final click.
- A single approval session can authorize final submission for multiple jobs inside one queued run.
- Single-job and queue-driven automation are both first-class in the same delivery.
- The system no longer depends on a predefined supported-source or adapter allowlist as the primary control plane for apply automation.
- Any target may be attempted through the live browser flow if the current run can prove enough context and safety at runtime.
- Resume approval remains per job and stays mandatory; automatic apply must refuse to continue without an approved, non-stale tailored resume export.
- Freeform screener answers may be generated and auto-submitted, but only from structured profile data, imported user documents, saved preferences, and the current job or application context. The app must never invent candidate facts.
- External login or signup flows are allowed only after explicit user consent in the live run. Existing-account login should be preferred over sign-up when the site offers both. Queue or session approval does not authorize silent account creation.
- When a job exits the safe automation path mid-run, the default behavior is `skip this job, record artifacts, continue the queue`.
- Minimum retained blocker artifacts are: blocking step, reason code, field snapshot, screenshot refs, and a replay checkpoint.

## Why This Work Exists

Plan `007` makes resume approval, export, and apply-time resume safety real, but the current apply path is still intentionally narrow:

- `packages/job-finder` still routes final submit through `approveApply(jobId)`
- `packages/browser-runtime` still exposes `executeEasyApply()` as the main submit seam
- generic target flows still stop with manual or unsupported behavior instead of finishing end-to-end
- the current review model is still shaped around one job and one immediate apply approval
- attempt records do not yet preserve enough structured blocker evidence to make queue automation safe and recoverable

That leaves the product with five gaps:

1. The user still has to finish most application work manually even after the app knows the job, the resume, and the browser state.
2. The approval model is too narrow for high-throughput automation because it authorizes one immediate job action instead of one bounded run.
3. The runtime is still biased toward `easy_apply` and explicit supported branches rather than a broader live browser form-filling model.
4. The system cannot yet auto-submit long freeform screeners while preserving answer provenance and non-invention guarantees.
5. Queue automation cannot be trusted until blocked jobs leave better artifacts and can be skipped without derailing the rest of the run.

## Current Code Starting Points

The implementing agent should start from the current seams instead of inventing a parallel architecture:

- `packages/contracts/src/base.ts` already includes `ApprovalModeSchema` values through `full_auto`
- `packages/job-finder/src/internal/workspace-application-methods.ts` still funnels final submit through `approveApply(jobId)`
- `packages/browser-runtime/src/runtime-types.ts` still exposes `ExecuteEasyApplyInput` and `executeEasyApply()`
- `packages/browser-runtime/src/playwright-browser-runtime.ts` still treats generic target submission as manual or unsupported
- `packages/contracts/src/discovery.ts` and related source-debug contracts already retain target guidance and apply-path hints that can be consumed when present

## Product Direction

Plan `008` intentionally changes the queued direction of `Job Finder`.

Current shipped behavior remains more conservative until implementation lands, but the planned direction after `007` is:

- autonomous browser-driven apply on any target page the live run can navigate safely
- one session approval for one bounded automation run
- multiple final submits allowed inside that approved run
- live consent interrupts for account creation or comparable explicit decisions
- skip-and-continue handling for blocked jobs instead of treating every unexpected branch as a full-run failure
- runtime proof and typed artifacts as the safety boundary, not a hardcoded supported-source list

This is a future-direction plan, not a claim that the current shipped app already behaves this way.

## Relationship To Existing Work

### Relationship To `007`

Plan `007` is the prerequisite slice.

`008` must reuse and preserve these `007` rules:

- the per-job `Resume Workspace` remains the source of truth for resume approval
- automatic apply must use the approved non-stale tailored export, not the base resume
- stale or missing approved exports remain hard-stop conditions
- apply automation may add queue or session orchestration, but it must not weaken resume approval, export validation, or staleness checks

`008` should not reopen `007` scope by redesigning resume generation, templates, or approval semantics. It consumes those outcomes and layers autonomous submit behavior on top of them.

### Relationship To `004` And `005`

Plans `004` and `005` already generalized discovery around target sites and learned guidance.

`008` should build on that work without reintroducing a rigid adapter-first submission model:

- use learned target guidance, apply-path guidance, and prior attempt artifacts when they exist
- do not require a predefined supported-source allowlist before the runtime can attempt a live apply flow
- keep `packages/browser-runtime` generic and `packages/browser-agent` bounded even though the product no longer thinks in terms of only these adapters can submit

## Scope

### In Scope

- true automatic final submission for a single selected job
- true automatic final submission for a queued batch of jobs under one bounded session approval
- general live browser application flows rather than only `easy_apply`
- inline applications, external redirects, bounded multi-step review flows, and resume upload flows
- short screener questions and long freeform screener answers
- generated freeform answers grounded in structured profile data, imported user docs, saved preferences, and the current job or application context
- consent interrupts for login or signup or other explicit operator decisions that cannot be assumed from session approval alone
- typed retained blocker artifacts and replay checkpoints when a job is skipped
- run history, job-level result history, and retry or resume surfaces
- deterministic test coverage for orchestration, answer generation policy, blocker capture, skip-and-continue, and approval boundaries

### Out Of Scope

- captcha bypass, 2FA bypass, paywall bypass, or secret harvesting
- silent account creation without an explicit live consent step
- unrestricted background automation that survives app restart and keeps submitting unattended
- parallel multi-tab or multi-window submission as a first requirement; queue processing can remain sequential in v1
- automatic upload of arbitrary extra documents that were not already approved or selected for that job
- cover-letter generation or outreach workflows as part of the same slice
- pretending every live page can be auto-submitted just because the browser reached it
- removing typed contracts or package boundaries in the name of flexibility

## Workflow Shape

### Single-Job Flow

1. The user opens a saved job that already has an approved, non-stale tailored resume export.
2. The user starts an automatic apply run for that one job.
3. The app shows a session-approval prompt that clearly states the job scope and that the run may perform the final submit action automatically.
4. Once approved, the runtime opens the live browser flow, fills the application, uploads the approved resume, answers screeners, submits, and confirms the result.
5. The app records the attempt, checkpoints, generated answers, evidence refs, and final outcome.

### Queue Flow

1. The user selects multiple eligible jobs.
2. The app snapshots the ordered queue into one automation run.
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
- session approval alone is not enough to authorize silent sign-up

## Safety Model And Approval Boundaries

### Candidate-Fact Boundary

The app may tailor, rewrite, shorten, expand, or reframe content, but it must never invent candidate facts.

Allowed grounding inputs for auto-filled answers:

- structured profile data
- imported resume and user-owned documents
- saved user preferences
- current job description, field labels, and visible application context

Disallowed inputs for candidate claims:

- inferred facts from employer marketing pages
- invented years, employers, titles, metrics, certifications, clearances, or legal status
- guesses about questions whose meaning remains unclear after bounded analysis

### Resume Boundary

Automatic apply is never allowed to silently fall back to the base resume.

Required rule:

- if the selected job does not have an approved, non-stale tailored resume export that still exists on disk, the job is ineligible for automatic submission and must be recorded as blocked or skipped

### Session-Approval Boundary

The final submit boundary moves from per-job immediate approval to a bounded run approval.

Required rules:

- session approval must bind to a concrete run id and the job ids included when the run starts
- that approval can authorize multiple submits inside that same run
- it must not silently extend to new jobs added later
- it must expire when the run completes, is cancelled, or the app session ends
- it must be revocable while the run is in progress

### Consent Boundary

Some actions are allowed only with explicit live consent.

Required consent-gated cases:

- account creation or sign-up
- `do you already have an account` decisions that change whether the run proceeds into login or sign-up
- any clearly user-identity-specific flow the app cannot safely assume from prior approval alone

Implementation rule:

- queue or session approval does not cover these actions by default

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
- a requested upload asset is unavailable
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

### Recommended Shared Domains

- `ApplyAutomationRunState`
  - `draft`
  - `awaiting_session_approval`
  - `running`
  - `paused_for_consent`
  - `completed`
  - `cancelled`
  - `failed`
- `ApplyAutomationJobState`
  - `planned`
  - `validating`
  - `running`
  - `submitted`
  - `skipped`
  - `blocked`
  - `failed`
- `ApplyAutomationBlockerReason`
  - `resume_missing`
  - `resume_stale`
  - `auth_required`
  - `signup_consent_required`
  - `site_protection`
  - `field_interpretation_failed`
  - `question_grounding_failed`
  - `asset_unavailable`
  - `submit_confirmation_missing`
  - `unexpected_navigation`
- `ApplyAutomationConsentRequest`
- `ApplyAutomationRun`
- `ApplyAutomationJobResult`
- `ApplicationQuestionRecord`
- `ApplicationArtifactRef`
- `ApplicationReplayCheckpoint`

### Contract Guidance

- keep `ApprovalModeSchema`, but stop treating `full_auto` as meaning submit forever without any bounded run approval
- add a separate run-scoped approval domain instead of overloading `JobSearchPreferences.approvalMode`
- keep `ApplicationAttempt` as the durable high-level attempt record
- add structured sibling domains for answer records, blocker artifacts, and replay state instead of packing everything into checkpoint strings
- do not overload `ApplicationAttemptState` alone to represent queue-level orchestration; add a sibling run or job state domain
- keep workspace snapshots lightweight by returning run summaries plus current job state rather than every raw artifact inline

## Persistence And Repository Direction

The repository must preserve enough detail for recovery and audit.

Recommended persisted collections or tables:

- automation runs
- automation job results
- consent requests or consent history
- question-answer records
- artifact refs and blocker evidence
- replay checkpoints

Required storage rules:

- store results per job, not only per run
- keep ordered queue position and run-scoped job lists
- make it easy to load the latest run for a job and the latest blocker artifacts for a skipped job
- keep screenshot refs and field snapshots outside the renderer snapshot unless the UI explicitly requests them
- mirror filtering and ordering semantics in both in-memory and file-backed repositories

## Runtime And Package Responsibilities

### `packages/job-finder`

Owns:

- run creation and queue orchestration
- eligibility checks before a job enters the queue
- session-approval policy
- consent policy
- answer-grounding policy
- blocker classification
- persistence of runs, results, question records, and artifacts
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
- generalize the apply runtime into a broader application-flow execution interface that is not limited to `easy_apply`

### `packages/browser-agent`

Owns bounded live-browser reasoning tasks such as:

- field and question interpretation
- review-step classification
- deciding which visible controls matter on the current page
- bounded submit-readiness reasoning
- optional use of prior learned target guidance
- prompts, transcript compaction, and tool policy for those bounded workflows
- deterministic catalog workflow policy layered over generic runtime primitives when seeded or fallback paths need filtering, eligibility gates, checkpoint shaping, or approved-resume usage rules

It should not become the owner of product approval policy or application state persistence.

### `apps/desktop`

Owns:

- starting single-job or queue automation runs
- session-approval UI
- consent-interrupt UI
- live queue progress UI
- run history, skipped-job review, and retry controls
- typed preload and IPC surfaces for the new automation actions

## Workstreams

### 1. Contracts And Persistence Shape

- add the automation run, job result, consent, blocker, answer, artifact, and replay domains
- extend repository state and IPC payloads
- add deterministic contract tests
- keep renderer snapshots lightweight

### 2. General Apply Runtime

- replace the narrow `easy_apply` submit seam with a general live apply-flow runtime
- support inline pages, external redirects, multi-step review screens, and resume upload flows
- require positive submission confirmation
- consume learned target guidance when present, but do not require a supported-source allowlist

### 3. Answer Grounding And Screener Automation

- classify application fields and screeners
- map simple structured answers directly from profile data
- generate long freeform answers from user-owned profile data, imported docs, saved preferences, and the current job or application context
- store answer provenance and the final submitted answer text
- block rather than invent when grounding is insufficient

### 4. Session Approval And Queue Orchestration

- create one run model that works for both one-job and multi-job execution
- bind session approval to the run id and initial job list
- process jobs sequentially
- skip and continue on blocked jobs
- allow revoke, cancel, retry, and rerun flows

### 5. Consent Interrupts And Recovery

- add explicit consent requests for sign-up or comparable identity-specific flows
- add timeout or decline behavior that skips the job and continues the queue
- preserve replay checkpoints so blocked jobs can be retried without reconstructing context from scratch

### 6. Desktop UX, QA, And Docs

- add run launch surfaces and approval copy
- add live progress, current-step, and per-job outcome UI
- add skipped-job review with blocker artifacts
- add deterministic and live QA harnesses
- update the queued-product docs and testing guidance in the same task

## Milestones

### Milestone 1: Automation Run Domain

- land shared contracts, repository storage, and IPC seams for automation runs, job results, blocker artifacts, and consent requests

Exit signal:

- the app can create and persist one run with one or more jobs and surface typed status and history without executing live submit yet

### Milestone 2: Single-Job Autonomous Submit

- land the generalized live apply runtime
- execute one real job end-to-end with resume upload, screener handling, final submit, and confirmation detection

Exit signal:

- one eligible job can be automatically submitted end-to-end with retained question records and blocker artifacts when needed

### Milestone 3: Queue Automation And Multi-Submit Approval

- bind one approval session to a queued run
- process multiple jobs sequentially
- skip blocked jobs and continue automatically

Exit signal:

- one approved queue can submit multiple jobs without asking again for every final submit, while still recording per-job outcomes and skips

### Milestone 4: Consent Interrupts And External Signup

- pause current jobs for explicit sign-up or comparable consent-gated flows
- allow continue, skip, or cancel decisions
- return cleanly to the queue afterward

Exit signal:

- the run can survive consent-gated jobs without corrupting the queue state or silently creating accounts

### Milestone 5: Hardening, QA, And Docs

- add deterministic and targeted live validation
- add UI harnesses for queue runs, skips, and consent prompts
- update `docs/STATUS.md`, `docs/TRACKS.md`, `docs/modules/JOB_FINDER.md`, `docs/CONTRACTS.md`, `docs/ARCHITECTURE.md`, and `docs/TESTING.md` as needed

Exit signal:

- the automation run is demonstrable, recoverable, and documented well enough that another agent can execute the flow without reconstructing intent from chat

## Failure Modes That Must Work

- approved resume missing at run start
- approved resume becomes stale before submit
- auth expires before the application opens
- the site asks whether the user already has an account
- the user declines sign-up consent
- captcha or 2FA appears
- a field label or question meaning cannot be interpreted safely
- a long freeform answer cannot be grounded well enough
- the site asks for an unavailable extra attachment
- submit is clicked but no confirmation can be proven
- the queue is cancelled mid-run
- a previously blocked job is retried later from retained checkpoint context

## Recommended Execution Order

1. Land contracts, repository storage, and IPC surfaces.
2. Generalize the runtime for one-job end-to-end automatic submission.
3. Add screener answer grounding, answer records, and blocker artifacts.
4. Add queue orchestration, session approval, and consent interrupts.
5. Add desktop launch and recovery surfaces, then leave behind deterministic and live QA coverage.

## Quality Bar

- Do not silently submit without a run-scoped approval.
- Do not silently create accounts.
- Do not silently fall back to the base resume.
- Do not invent candidate facts in generated answers.
- Do not mark `submitted` without positive confirmation.
- Do preserve per-job blocker artifacts, screenshots, and replay checkpoints.
- Do keep queue processing stable when one job fails or is skipped.
- Do keep browser-runtime generic, browser-agent bounded, and orchestration in `packages/job-finder`.
- Do update docs and QA workflows in the same task as implementation.

## Verification Expectations

Implementation work for this plan should be validated with at least:

- `pnpm --filter @unemployed/contracts test`
- `pnpm --filter @unemployed/db test`
- `pnpm --filter @unemployed/job-finder test`
- `pnpm --filter @unemployed/browser-runtime typecheck`
- `pnpm --filter @unemployed/desktop build`
- `pnpm verify`
- `pnpm docs:check`

Additional completion rule:

- leave behind dedicated desktop QA or capture harnesses for one-job auto-apply, queue auto-apply, blocker skip-and-continue, and consent-interrupt handling so another agent does not have to rediscover the demo path from chat

## Docs To Keep Updated During Implementation

- `docs/STATUS.md`
- `docs/TRACKS.md`
- `docs/modules/JOB_FINDER.md`
- `docs/CONTRACTS.md`
- `docs/ARCHITECTURE.md`
- `docs/TESTING.md`
