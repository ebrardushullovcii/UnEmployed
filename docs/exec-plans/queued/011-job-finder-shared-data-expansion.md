# 011 Job Finder Shared Data Expansion

Status: ready

This plan is a prepared follow-on starting plan. It captures the shared data work needed to support stronger discovery, stronger resume quality, and future apply automation without forcing each workflow to rediscover or re-ask for the same information.

## Goal

Expand the `Job Finder` data model so the app can store and actually reuse richer candidate, job, employer, question, answer, blocker, and automation-run context.

This plan is not only about adding fields. It is about making sure the new data is consumed by:

- discovery
- resume tailoring
- apply assistance and automation
- later interview prep when useful

## Why This Work Exists

The repo already has a stronger structured profile than most job tools, but the comparative review exposed five gaps:

1. narrative and proof-bank data are still thinner than they should be
2. common screener-answer data is not yet first-class enough
3. saved-job data is missing several fields that matter for triage and automation readiness
4. question, answer, blocker, and replay data are not yet first-class domains
5. too much downstream behavior still depends on reconstructing context instead of reusing stored context

## Locked Product Decisions

- Add contracts before widening behavior.
- Keep candidate facts, employer context, and generated answers as separate domains.
- Treat proof points and answer banks as first-class data, not loose notes.
- Add richer job and employer fields only when they can be grounded and reused.
- Do not pack future blocker artifacts, answer provenance, and replay state into freeform checkpoint strings.
- The new data must be consumed by discovery and apply flows, not only stored for later admiration.

## Required Shared Domains

### 1. Candidate narrative and proof domain

Reuse or extend existing schema roots such as `SavedJob`, source-debug evidence refs, and repository-state snapshots before introducing any new top-level store. New top-level domains require explicit justification and review.

Extension checklist:

- locate the closest existing schema or repository root that already owns the surrounding workflow data
- extend that schema with fields or nested sub-schemas before inventing a parallel store
- update shared contracts, repository persistence, and migration notes together
- document any genuinely new top-level domain and why the existing roots could not support it cleanly

Add or formalize storage for:

- exit story or career narrative
- differentiators or superpowers
- proof points with hero metrics
- preferred case studies or demos
- role-family relevance tags for proof points

### 2. Candidate answer-bank domain

Add or formalize storage for canonical reusable answers such as:

- work authorization
- visa sponsorship
- relocation
- travel
- notice period
- availability
- salary expectations
- public link preferences
- short bio or intro answer

### 3. Job and employer enrichment domain

Add or formalize storage for:

- application URL distinct from canonical detail URL when applicable
- first seen, last seen, and last verified active timestamps
- normalized compensation fields when recoverable
- ATS or provider classification
- sponsorship or clearance hints
- relocation or travel hints
- remote geography constraints
- keyword sets with basic weighting or priority
- employer or provider-level reusable metadata where that separation proves useful

### 4. Apply-question and answer-provenance domain

Add or formalize storage for:

- detected questions
- field types and classifications
- candidate-grounded answer candidates
- final submitted answer text
- answer provenance back to profile, documents, or prior approved answers

### 5. Blocker, artifact, and replay domain

Add or formalize storage for:

- blocker reason codes
- blocking step snapshots
- screenshot refs
- relevant URLs
- replay checkpoints
- consent requests and decisions

## Consumption Rules

### Discovery must consume this data

Discovery should use stored targeting and candidate context for:

- title-first triage
- role-family relevance
- company or geography preference filtering
- compensation filtering
- low-value source suppression

### Resume tailoring must consume this data

Resume generation should use stored narrative and proof-bank data for:

- stronger summary framing
- better project selection
- better proof-point promotion
- better role-family emphasis

### Apply workflows must consume this data

Apply assistance and automation should use stored answer-bank and question history for:

- canonical screener answers
- consistent wording across applications
- grounded freeform answer generation
- blocker recovery and retry planning

Implementation rule:

- if a new field is added but not used by at least one meaningful workflow, the implementation is incomplete

## Scope

### In Scope

- shared contract expansion across candidate, saved-job, and application-related domains
- repository storage and migration planning
- workflow integration requirements for discovery, resume, and apply
- renderer-visible summaries where needed

### Out Of Scope

- broad analytics or telemetry systems detached from product workflows
- storing secrets such as passwords
- unbounded employer intelligence collection with no concrete consumer

## Workstreams

### 1. Domain Audit And Schema Design

- identify missing candidate, job, employer, and application subdomains
- define which package owns each schema and repository path

### 2. Workflow Consumption Mapping

- map each new data field to discovery, resume, or apply consumers
- reject fields that have no real product use yet

### 3. Persistence And Migration Planning

- define how the SQLite repository and workspace snapshots should expose new data without bloating the renderer unnecessarily

### 4. UX Surfacing And Editing

- identify where users can review or edit the new narrative, proof, answer, and blocker data
- keep advanced automation data inspectable without overwhelming the main UI

## Milestones

### Milestone 1: Candidate and job model expansion

- the app can store the missing narrative, proof, answer-bank, and richer job context fields

### Milestone 2: Discovery and resume consumption

- discovery and resume flows actually use the new data

### Milestone 3: Apply and blocker domain expansion

- question, answer, blocker, and replay domains are first-class enough to support later apply work cleanly

## Verification Expectations

Implementation work for this plan should be validated with at least:

- `pnpm --filter @unemployed/contracts test`
- `pnpm --filter @unemployed/db test`
- `pnpm --filter @unemployed/job-finder test`
- `pnpm docs:check`

Additional completion rule:

- leave behind an explicit field-to-consumer map in the implementation notes or plan updates so later agents can see which new data powers discovery, resume, and apply behavior directly

## Notes For A Deeper Follow-On Plan

- Evaluate whether employer or provider metadata deserves its own first-class entity or should remain attached to saved jobs and learned source artifacts for now.
- Determine which answer-bank entries are safe to auto-apply and which require per-job confirmation.
- Choose how much of the blocker and replay model should be visible in the main `Applications` surface versus a deeper troubleshooting view.
