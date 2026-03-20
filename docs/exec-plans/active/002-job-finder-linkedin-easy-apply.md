# 002 Job Finder LinkedIn Easy Apply

Status: active

## Goal

Deliver the first real `Job Finder` vertical slice for `LinkedIn Easy Apply` with custom per-job resumes, review-gated submission, and local tracking.

## Why This Slice

- It exercises the full `Job Finder` loop without spreading across multiple job sites too early.
- It keeps the browser automation target narrow enough to learn from real failures before generalizing.
- It creates the core seams the rest of `Job Finder` will need anyway: contracts, persistence, browser orchestration, UI surfaces, and application tracking.

## Scope

### In Scope

- Base resume upload and candidate preference capture
- LinkedIn browser-driven job discovery
- Save, normalize, dedupe, and score discovered jobs
- Generate a custom resume variant for a selected job
- Review queue for approval before submission
- LinkedIn `Easy Apply` support for simple, known paths
- Local persistence for jobs, resume variants, and apply attempts

### Out Of Scope

- Non-LinkedIn job sites
- External company-site apply redirects
- Private or undocumented APIs as a required path
- Automatic account creation in the default flow
- Full-auto submissions across unknown branches
- Advanced reminders, outreach, or recruiter CRM features
- A large template library or highly polished document rendering system

## Product Defaults

- First source: `LinkedIn`
- First apply path: `Easy Apply` only
- First approval mode: `review-before-submit`
- Main flow never creates accounts automatically
- One custom resume variant per selected job is the required tailoring output
- Unknown or risky apply states must stop safely rather than guessing

## Scope Guardrails

- Build one source adapter before designing for many.
- Build one apply mode before enabling more automation.
- Build enough tailoring to support one good custom resume path before adding cover letters and broad answer generation.
- Keep browser runtime generic, but keep LinkedIn-specific logic out of the generic layer.
- Prefer simple, inspectable workflow state over ambitious autonomy.

## User Flow

1. User uploads a base resume and sets job preferences.
2. User starts a LinkedIn discovery run and logs in if needed.
3. The app saves matching jobs and shows a basic fit summary.
4. User selects a saved job and generates a custom resume variant.
5. User reviews the job, resume variant, and apply readiness.
6. User approves an `Easy Apply` attempt.
7. The app performs the supported apply flow and records the outcome.

## Workstreams

### 1. Contracts

Add the first real Job Finder domain contracts in `packages/contracts`.

Expected early contracts:

- `JobSearchPreferences`
- `TailoringMode`
- `ApprovalMode`
- `JobPosting`
- `SavedJob`
- `MatchAssessment`
- `TailoredAsset`
- `ApplicationAttempt`
- `ApplicationEvent`
- `ApplyOutcome`

Notes:

- Keep schemas narrow and explicit.
- Prefer enums and discriminated unions over booleans.
- Leave room for future site-specific data without over-modeling it now.

### 2. Persistence

Add repository interfaces in `packages/db` for the first Job Finder slice.

Required persisted domains:

- candidate profile basics
- job search preferences
- saved jobs
- tailored resume variants
- application attempts and events

Notes:

- Dedupe rules can start simple: source + canonical URL + title/company/location heuristics.
- Storage details and migrations can stay minimal until real schema pressure appears.

### 3. Browser Runtime

Add generic browser/session primitives in `packages/browser-runtime`.

Expected capabilities:

- start or resume a browser session
- navigate to pages
- wait for expected states
- extract structured data
- click, type, select, and upload files
- expose checkpoints for recovery and review

Notes:

- Keep auth-state handling explicit.
- Do not put LinkedIn selectors or page branching in the generic runtime.

### 4. Job Finder Orchestration

Implement the first orchestration layer in `packages/job-finder`.

Responsibilities:

- run discovery through injected adapters
- normalize and score saved jobs
- coordinate resume tailoring requests
- manage review queue state
- manage the first apply attempt state transitions

Notes:

- Browser, persistence, and generation concerns should stay behind adapters.
- Keep orchestration readable rather than prematurely abstract.

### 5. Desktop UI

Replace the placeholder shell with the first Job Finder workflow surfaces in `apps/desktop`.

Companion brief:

- `docs/exec-plans/active/002-job-finder-linkedin-easy-apply-ui-brief.md`

Expected screens:

- `Profile`
- `Discovery`
- `Review Queue`
- `Applications`
- `Settings`

Notes:

- Start with practical workflow views, not polished design depth.
- Expand preload and main-process IPC only through typed contracts.

### 6. LinkedIn Adapter

Implement one LinkedIn adapter on top of the browser runtime.

Required behavior:

- detect whether the user needs to log in
- run job search from saved preferences
- read listing summaries and job details
- identify `Easy Apply` eligible jobs
- save normalized jobs for review
- execute simple supported `Easy Apply` paths

Notes:

- Do not try to handle every LinkedIn branch in v1.
- Unsupported flows should stop with a useful recorded reason.

### 7. Resume Tailoring

Implement one solid custom-resume flow for selected jobs.

Required behavior:

- take base resume + profile + job description
- generate one tailored resume variant for the selected job
- store the result as a versioned asset

Notes:

- Start with two templates at most.
- Final rendering details can stay flexible until implementation makes the best path clearer.
- Cover letters may be deferred if they slow down the first end-to-end slice.

### 8. Testing

Add tests that protect the first slice without creating a large test burden too early.

Required early coverage:

- contract tests for new schemas
- unit tests for job scoring and orchestration rules
- repository integration tests for persistence boundaries
- focused adapter tests for LinkedIn normalization and supported apply states

Notes:

- Use deterministic fixtures.
- Prefer fixture-driven browser checks over brittle end-to-end breadth.

## Milestones

### Milestone 1: Foundations For The Slice

- Add Job Finder contracts
- Add repository interfaces
- Add typed desktop-to-main seams for Job Finder actions
- Add Job Finder navigation skeleton

Exit signal:

- the app can hold structured profile/preferences state and display empty Job Finder workflow surfaces

### Milestone 2: Discovery And Saved Jobs

- Implement LinkedIn discovery for supported search paths
- Normalize, dedupe, score, and persist jobs
- Show saved jobs in the desktop UI

Exit signal:

- the user can run discovery and review saved LinkedIn jobs locally

### Milestone 3: Tailored Resume Path

- Generate and save a custom resume variant for a selected job
- Show the tailored asset in the review flow

Exit signal:

- the user can go from saved job to custom resume variant inside the app

### Milestone 4: Review-Gated Easy Apply

- Support a narrow `Easy Apply` automation path
- Require approval before submission
- Persist attempt logs and outcomes

Exit signal:

- the user can approve and run a supported apply attempt with tracked results

## Acceptance Criteria

- A user can save a base profile and job preferences.
- A user can discover and persist LinkedIn jobs.
- A user can generate a custom resume variant for a selected saved job.
- A user can review tailored assets before submission.
- The app can complete at least simple supported `Easy Apply` cases.
- Unsupported apply paths stop safely and leave a recoverable record.
- Jobs, tailored assets, and apply attempts are persisted locally.

## Deferred Follow-Up

- cover letters as a default part of the flow
- external apply redirects
- additional job sites
- more approval modes in active use
- optional account-creation agent
- LinkedIn-specific skill/playbook once real failure modes are known

## Docs To Keep Updated During Execution

- `docs/STATUS.md`
- `docs/TRACKS.md`
- `docs/modules/JOB_FINDER.md`
- `docs/CONTRACTS.md` when shared schemas expand
- `docs/ARCHITECTURE.md` if package boundaries or ownership change
