# Historical Design Brief: Job Finder MVP Screens

Status: completed

This brief is kept as historical context for the first Job Finder UI slice. Later implementation and design work generalized beyond its original LinkedIn-first assumptions.

Design the screen system for a desktop app called `UnEmployed`.

This product will eventually have two modules:
- `Job Finder`
- `Interview Helper`

This task is only about the first `Job Finder` MVP.

Your job is to design the screens, navigation, states, and component structure for this first release. Assume the engineering details are still being finalized, so the UI should be practical, implementation-friendly, and tolerant of small backend changes.

## Current Design References

The current visual references for this slice live in `docs/Design/`.

Primary screen references:

- `docs/Design/job-finder-profile/`
- `docs/Design/job-finder-discovery/`
- `docs/Design/job-finder-review-queue/`
- `docs/Design/job-finder-applications/`
- `docs/Design/job-finder-settings/`

State references:

- `docs/Design/job-finder-state-login-required/`
- `docs/Design/job-finder-state-discovery-empty/`
- `docs/Design/job-finder-state-review-generation/`
- `docs/Design/job-finder-state-apply-paused/`
- `docs/Design/job-finder-state-submission-success/`

System reference:

- `docs/Design/tactical-command-design-system/README.md`

Interpretation notes:

- Use screenshots as the primary visual target.
- Treat `mockup.html` files as very basic agent-generated prototype references, not implementation source code.
- Do not reuse the prototype HTML as application code or as a model for production code quality.
- Treat the current design-system language as a visual-direction reference, not literal shipped product tone.
- Treat the current design set as workflow guidance, not a feature-complete specification.
- Do not assume every panel, metric, status chip, action, or settings control shown in the design must exist in the shipped MVP.
- Real implementation should preserve the layout intent while staying inside the scoped product and contract boundaries.

## Product Context

`UnEmployed` is a desktop app that helps a user manage the full job search loop with agent assistance. The product is UI-first, not chat-only. The user should feel like they are driving a workflow with automation helping in the right places.

The first Job Finder release should help one user:

1. upload a base resume and job preferences
2. run LinkedIn job discovery
3. save and review matching jobs
4. generate one custom resume for a selected job
5. approve a safe LinkedIn `Easy Apply` attempt
6. track what happened afterward

This is not a broad recruiting platform yet. It is a focused, supervised workflow for one source and one application path.

## Platform And UX Context

- This is a desktop application, not a website.
- Design for a primary desktop window first.
- Think in terms of an application workspace or cockpit, not a marketing page.
- The interface can be information-dense, but hierarchy must be clear.
- Automation should feel visible and supervised, not mysterious.
- There should be room for future growth without forcing the MVP to look like it already supports everything.

## Hard MVP Boundaries

Do not design outside these boundaries unless a light placeholder is useful.

- Source: `LinkedIn` only
- Apply path: `Easy Apply` only
- Approval mode: `review-before-submit` only
- Output requirement: one custom resume variant per selected job
- No external company-site redirects
- No automatic account creation in the normal flow
- No need for multi-site comparison views
- No need for a large resume-template gallery
- No need to design full autonomy or agent-only flows

## Primary UX Goals

- Make the next action obvious at every step.
- Keep the user oriented about where they are in the workflow.
- Make job fit and readiness understandable at a glance.
- Make tailored resume review feel central, not hidden.
- Make apply automation feel safe, pausable, and inspectable.
- Make the tracking/history area easy to scan later.

## Product Model The UI Should Reflect

The first workflow is:

`Profile -> Discovery -> Review Queue -> Apply -> Applications`

The interface should make this pipeline feel intentional.

The user first provides profile information, then discovers jobs, then reviews selected jobs with tailored assets, then approves an apply attempt, then tracks outcomes.

## Core Objects The UI Needs To Surface

Field names can change. Focus on the meaning of the objects.

- `Candidate profile`
  - base resume
  - parsed profile summary
  - target roles
  - preferred locations
  - work mode
  - seniority
  - salary hints
  - blacklist/whitelist preferences
- `Job search preferences`
  - what kinds of jobs the user wants discovery to target
- `Saved job`
  - job title
  - company
  - location
  - source
  - Easy Apply eligibility
  - fit summary
  - current workflow state
- `Match assessment`
  - basic fit score or fit explanation
  - short reasons why the job matches or does not match
- `Tailored resume asset`
  - one generated resume variant per selected job
  - generation state
  - preview state
  - version information if useful
- `Application attempt`
  - not started / ready / in progress / paused / submitted / failed / unsupported
  - timestamps and last known outcome
- `Browser/session state`
  - user logged in or not
  - discovery/apply session ready or blocked

## Information Architecture

Design around these 5 primary screens:

- `Profile`
- `Discovery`
- `Review Queue`
- `Applications`
- `Settings`

Also leave lightweight room in the shell for a future second module, `Interview Helper`, but do not design that module now.

## Screen Requirements

### 1. Profile

Purpose:

- capture the user's base resume and reusable job-targeting preferences

Must support:

- uploading or replacing a base resume
- showing that a resume has been parsed or is being parsed
- displaying a structured candidate summary
- editing target roles
- editing locations
- editing work mode preferences such as remote / hybrid / on-site
- editing seniority and broad targeting constraints
- setting resume-tailoring aggressiveness in a simple way
- leaving room for reusable screener answers, but not making them the dominant part of the screen

Important states:

- first-run empty state
- uploading/parsing in progress
- profile ready
- parsing or validation issue

Primary actions:

- upload resume
- replace resume
- edit profile/preferences
- save changes
- continue to discovery

### 2. Discovery

Purpose:

- run LinkedIn job discovery and turn results into saved jobs the user can act on

Must support:

- showing whether the LinkedIn/browser session is ready
- clearly showing when login is required
- starting discovery from saved preferences
- displaying results in a layout that supports quick scanning and detail inspection
- showing a basic fit summary for each job
- showing whether a job is `Easy Apply` eligible
- allowing save, shortlist, or move-to-review actions

Important states:

- login required
- ready to search
- search in progress
- partial results while running, if useful
- no results
- results loaded
- extraction warning or partial failure

Primary actions:

- start discovery
- inspect job details
- save job
- shortlist job
- move selected job toward review/tailoring

### 3. Review Queue

Purpose:

- hold the jobs that are closest to action and make approval decisions easy

Must support:

- showing selected job context
- showing fit summary and important job facts
- showing whether the job is ready for tailoring or ready for apply
- previewing the tailored resume variant for that job
- indicating when resume generation is pending, running, ready, or failed
- showing lightweight readiness notes before apply
- allowing approve, skip, archive, or defer actions

Important states:

- no jobs ready yet
- tailoring not started
- tailoring in progress
- resume ready for review
- blocked by missing asset
- blocked by browser/session state
- apply paused because of unsupported flow

Primary actions:

- generate tailored resume
- inspect tailored resume
- approve apply attempt
- skip or archive job
- open application history/details

### 4. Applications

Purpose:

- show the tracked history of saved jobs and application attempts after work has started

Must support:

- scanning jobs/applications by status
- seeing last attempt, last update, and next action
- opening a selected record to inspect notes, events, and failure reasons
- clearly distinguishing active, paused, submitted, rejected, and archived states

Important states:

- empty state
- mixed-status pipeline
- paused or failed attempts needing attention
- successful submission history

Primary actions:

- filter by status
- sort by recency or priority
- open details
- retry or continue a paused flow later

Suggested application statuses to account for:

- `discovered`
- `shortlisted`
- `drafting`
- `ready_for_review`
- `approved`
- `submitted`
- `assessment`
- `interview`
- `rejected`
- `offer`
- `withdrawn`
- `archived`

### 5. Settings

Purpose:

- hold system-level preferences relevant to this MVP without becoming a dumping ground

Must support:

- LinkedIn/browser session preferences
- document generation defaults that matter in the first slice
- high-level apply safety defaults

Important states:

- default settings only
- edited but unsaved state
- validation issue state if needed

Primary actions:

- save settings
- reset where appropriate

Do not over-design this screen for future features that do not exist yet.

## Shared Interaction Patterns

- A selected job should probably open in a persistent detail panel, drawer, or split-view layout.
- Review and approval actions should stay close to the current job and current asset.
- Browser/session state should be visible anywhere it can block progress.
- Attempt history should be readable without looking like a raw developer log.
- The user should always understand whether the system is waiting on them or working for them.

## States That Must Be Designed

- first-run empty state
- resume upload/parsing state
- login required state
- discovery running state
- discovery results state
- no-results state
- tailored resume generating state
- ready-for-review state
- apply in progress state
- apply paused / unsupported state
- apply success state
- apply failure with a recoverable next step

## Visual Direction

- Desktop productivity tool, not consumer social UI
- Modern and intentional, but not flashy
- Calm confidence over hype
- Strong hierarchy, clear panels, readable tables/lists
- Good use of density without clutter
- Make room for status, logs, and review affordances
- Avoid generic SaaS-dashboard blandness if possible
- Preserve the current strong workspace feel without pushing the UI so far into mission-console styling that it stops feeling grounded as a shipped product

## Important Constraints

- The product is supervised automation, not invisible automation.
- The UI should never imply that the system can safely handle every LinkedIn flow.
- The first release should feel narrow but real.
- Do not design the interface as if it already supports many job boards or many application paths.
- Keep implementation realism in mind: the initial engineering slice is intentionally constrained.
- Treat design references as directional, not exhaustive; do not widen scope just because a concept appears in a mockup.

## What Can Stay Flexible

- exact fit-score formula
- exact schema field names
- exact resume rendering pipeline
- exact resume template count beyond a small initial set
- whether cover letters appear in the first shipped review flow
- how many LinkedIn question branches are supported in v1

## What You Should Produce

- a clear navigation model for this Job Finder workflow
- screen designs for `Profile`, `Discovery`, `Review Queue`, `Applications`, and `Settings`
- key empty, loading, active, paused, success, and failure states
- a lightweight component inventory for job rows/cards, fit summaries, browser/session indicators, resume preview areas, approval controls, and history/timeline views
- notes on any provisional assumptions where backend details can be filled in later

## Main Warning

Do not design this as if it is already a complete job-search operating system. It is the first narrow but useful slice of one. The design should help the user move confidently through a supervised workflow from profile setup to discovery to tailored resume review to approved `Easy Apply` to tracked outcome.
