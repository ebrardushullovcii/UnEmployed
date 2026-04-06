# 013 Job Finder Deterministic Discovery And Provider Research

Status: ready

This plan is a prepared follow-on starting plan. It captures the deeper discovery redesign implied by the recent comparative review: prefer deterministic collection methods first, research the provider before browsing blindly, keep a durable job ledger, and stop doing expensive work on jobs whose titles already fail the user's targeting rules.

## Goal

Make `Job Finder` discovery materially faster and more deliberate by shifting the workflow toward:

- provider-aware collection
- official or stable public endpoints when available
- title-first triage before expensive enrichment
- better dedupe and seen-job tracking
- structured user overrides instead of loose notes

## User Direction This Plan Must Preserve

The user explicitly wants discovery to:

- use the initial site URL mainly to confirm the correct site, not necessarily as the only starting point
- let debugging decide whether the best collection method is an API, search page, careers page, or another stable route
- keep per-user instructions, but structure them better
- do less work for clearly unwanted jobs by filtering on title first
- keep stronger durable tracking of seen and handled jobs
- optimize aggressively because discovery is still too slow

## Why This Work Exists

The active `010` work is already reducing visible waiting and obvious waste, but the next big gains likely require a deeper product-level shift:

- too much discovery still starts from generic browser exploration
- provider research is not yet a first-class stage
- title rejection often happens too late
- seen-job tracking and source-level ledgers are not yet strong enough
- freeform user notes are helpful but not strong enough as structured workflow inputs

## Comparative Inputs And Reference Sources

### Local comparative reference

- the `career-ops` scan workflow notes

Key takeaways from `career-ops`:

- the exact machine-local path used during prep was intentionally removed here; keep only durable docs references or the summarized takeaways below in committed plans

- use tiered collection methods
- separate tracked-company scanning from broad search fallback
- dedupe against a seen-job ledger before deeper work
- collect title and URL first, then enrich later

### External reference sources worth copying from selectively

- Greenhouse Job Board API: `https://developers.greenhouse.io/job-board.html`
- Lever developer docs and posting/application capabilities: `https://hire.lever.co/developer/documentation`

Implementation rule:

- prefer public or auth-safe provider endpoints only
- do not rely on secret harvesting, scraping behind auth walls, or destructive rate-unfriendly probing

## Locked Product Decisions

- The user-provided starting URL becomes a `site identity anchor`, not a forced collection start point.
- Discovery should research the provider before committing to a collection method.
- Public APIs, structured job-board endpoints, and stable search routes should beat generic page wandering when they are available and trustworthy.
- Title-first triage should happen before expensive detail extraction whenever the source exposes enough title metadata.
- Per-user discovery instructions should remain supported, but they should be stored in structured fields rather than only long freeform text.
- The system should retain a durable job ledger for seen URLs, seen provider IDs, title-only skips, inactive jobs, and already-enriched jobs.

## Discovery Strategy Recommendation

### Stage 0: Provider research

Before treating a target as a generic site, the system should try to determine:

- which ATS or provider is in use
- whether a public listing API exists
- whether a stable search results route exists
- whether a stable job-detail route pattern exists
- whether there is a better start page than the user-supplied anchor URL

Potential methods:

- bounded inspection of page structure and script hints on the target site
- bounded same-host route inspection
- bounded web lookup for known public provider docs or board patterns

### Stage 1: Cheap collection first

Preferred collection order:

1. public provider or job-board API
2. stable structured search/listing page
3. careers page card extraction
4. broader fallback search only when the source still lacks a stable listing path

### Stage 2: Title-first triage

For each discovered candidate job, do cheap filtering first using:

- title
- company
- location if already visible
- work mode if already visible

If the job clearly fails targeting rules at this stage, do not pay for deeper extraction.

### Stage 3: Detail enrichment only for promising jobs

Only after title-first triage passes should the system spend more time on:

- full description extraction
- responsibilities and qualifications parsing
- richer fit scoring
- employer research

## Durable Job Ledger Requirement

Add or formalize a ledger that can record per discovered item:

- provider key
- board token or provider slug when known
- canonical URL
- external source job ID when known
- first seen at
- last seen at
- discovery target that found it
- collection method used
- title-first triage result
- skip reason if rejected early
- enrichment status
- inactive or removed status when later checks show the listing disappeared

The ledger should make it cheap to answer:

- have we seen this job before?
- did we skip it intentionally?
- did we already enrich it?
- did it disappear later?

## Structured User Overrides

Replace loose discovery-only notes with clearer structured override concepts such as:

- preferred role-title phrases
- hard exclude title phrases
- preferred route hints
- provider-specific notes
- allow or deny detail enrichment thresholds

Freeform notes may remain, but they should not be the only durable control surface.

## Scope

### In Scope

- provider detection and research stage
- API-first or structured-route-first discovery when supported
- title-first triage
- seen-job ledger and skip tracking
- structured user discovery overrides
- benchmark and QA updates for the faster discovery path

### Out Of Scope

- full parallel multi-target discovery as the required first solution
- secret or auth-gated provider APIs
- broad internet crawling detached from configured targets
- weakening result quality just to reduce timing numbers

## Workstreams

### 1. Provider Research Layer

- define how discovery classifies a provider or ATS
- define how the debug flow stores provider findings
- define how the collection method gets selected from those findings

### 2. Cheap-First Discovery Pipeline

- add listing-level title triage before detail extraction
- add early exits for low-fit jobs
- preserve enough evidence for later audit without doing full enrichment

### 3. Durable Ledger And Dedup

- add ledger storage and update rules
- add reuse of prior seen-job information across runs
- improve inactive or removed job handling

### 4. Structured User Controls

- formalize per-user overrides so discovery can consume them deterministically
- keep the renderer controls understandable and compact

## Milestones

### Milestone 1: Provider-aware method selection

- the system can choose between API, listing route, or page navigation more deliberately

### Milestone 2: Title-first triage and ledger

- the system stops paying for deeper work on clearly irrelevant jobs
- seen-job tracking is durable and queryable

### Milestone 3: Benchmark and QA proof

- representative targets show faster runs without lower-quality saves

## Verification Expectations

Implementation work for this plan should be validated with at least:

- `pnpm --filter @unemployed/contracts test`
- `pnpm --filter @unemployed/job-finder test`
- `pnpm --filter @unemployed/browser-runtime typecheck`
- `pnpm --filter @unemployed/desktop build`
- `pnpm docs:check`

Additional completion rule:

- leave behind representative benchmark notes showing the effect of provider-aware collection and title-first triage on at least one API-friendly target, one structured search-route target, and one generic fallback target

## Notes For A Deeper Follow-On Plan

- Decide whether the ledger belongs entirely in `packages/db` as dedicated repository storage or partly in workspace state summaries with deeper details retained elsewhere.
- Decide how aggressive provider research may be before it becomes too close to a second crawler.
- Decide whether company watchlists should become a first-class discovery mode separate from broader target scans.
