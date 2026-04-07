# 014 Job Finder Structured Source-Debug Artifacts

Status: ready

This plan is a prepared follow-on starting plan. It captures the next evolution of source-debug: move from primarily freeform learned guidance toward typed provider and navigation artifacts that discovery and apply can consume more directly and more reliably.

## Goal

Upgrade source-debug from a high-quality evidence and notes system into a stronger reusable control plane that can answer:

- what provider is this site using?
- what collection method should discovery prefer here?
- what are the stable listing, detail, and apply routes?
- what auth or consent markers matter?
- what selectors, controls, or route patterns are actually reliable?

## User Direction This Plan Must Preserve

The user explicitly wants the debugger to:

- look more deeply into the job provider
- decide whether APIs or better search pages exist
- be able to freely search the web for information about a job source — for example, whether public APIs exist, whether there are existing guides on how to navigate the site, or what ATS provider the site uses — using bounded web search (e.g. DuckDuckGo) and web fetch tools available to the agent at any phase
- treat the initial job-site URL as proof of the right site, not as the only true start point
- keep per-user instructions, but structure them better

## Why This Work Exists

The current source-debug system is already much stronger than a placeholder, but its learned artifacts are still mostly grouped guidance text arrays. That is good for review, but weaker than it should be for automation.

The next quality jump likely requires:

- typed route and provider artifacts
- clearer confidence and freshness rules
- structured override layering
- direct reuse by both discovery and apply workflows

## Locked Product Decisions

- Keep source-debug evidence curation and replay verification as core safety boundaries.
- Do not move site-specific workflow policy into `packages/browser-runtime`.
- Separate `site identity anchor` from `preferred collection or start method`.
- Allow source-debug to discover a better start route or collection method than the user-supplied URL.
- Keep user overrides possible, but store them in structured overlay fields rather than only freeform notes.
- Discovery and apply should be able to consume the resulting artifacts directly without reinterpreting long natural-language notes every time.

## Recommended Artifact Expansion

The learned artifact layer should be widened so it can retain structured facts such as:

### Provider intelligence

- provider or ATS classification
- provider confidence score
- public API availability and endpoint pattern when safe and public — the agent should be able to discover these by searching the web for provider documentation or API references and then fetching and reading those pages
- board token, slug, or provider identifier when known — may be discovered through web research as well

### Collection strategy

- preferred collection method: `api`, `listing_route`, `careers_page`, or `fallback_search`
- ranked starting routes
- stable search-route templates
- stable detail-route patterns
- known listing page markers

### Apply intelligence

- apply path type
- resume-upload capability hints
- known question-endpoint availability where public provider APIs expose it
- auth, consent, or sign-up markers

### Interaction and reliability

- stable control names or selector fingerprints
- failure fingerprints
- stale or broken route markers
- last successful verification timestamps

## Structured Override Model

Per-user overrides should be layered on top of learned artifacts in explicit fields such as:

- force preferred collection method
- deny a risky route
- add a known-good search path
- block certain provider behaviors for that user

Freeform notes may still exist for operator context, but the runtime should not depend on them as the main machine-readable control path.

## Scope

### In Scope

- widening source-debug artifact schemas
- stronger replay-verification expectations for new artifact kinds
- structured override layering
- discovery and apply consumption of the new artifact shapes
- renderer review surfaces for provider and route intelligence

### Out Of Scope

- full autonomous apply implementation itself
- unbounded or uncontrolled web crawling — the agent may do bounded web searches (rate-limited, small query count per run) and fetch specific URLs for research, but must not do open-ended scraping or crawl pages unrelated to the target source
- hidden raw transcript retention
- site-specific logic leakage into generic runtime primitives

## Workstreams

### 1. Artifact Model Expansion

- define new provider, route, and method fields
- define confidence, freshness, and verification rules
- keep older guidance text as a review layer if still useful

### 2. Source-Debug Research And Extraction

- let debug collect provider evidence, public API hints, and better route candidates
- the agent should have access to bounded web search and web fetch tools during any source-debug phase so it can look up whether the target site has a public API, what ATS provider it uses, whether navigation guides exist, or any other source-specific information that would help it produce better artifacts — this is not a separate phase, it is a capability the agent can call on whenever it would be useful
- search results and fetched content should be treated as research evidence and feed into the structured artifact fields (provider classification, API availability, collection method) rather than staying buried in freeform notes
- ensure bounded research and evidence capture remain visible and reviewable

### 3. Consumer Integration

- teach discovery to prefer the artifact's recommended collection method
- teach apply planning to consume apply-path and question-surface hints when available

### 4. Review UI Upgrade

- expose structured provider findings clearly in the Profile review surfaces
- keep edits limited to the safe editable fields

## Milestones

### Milestone 1: New structured artifact schema

- source-debug can store provider and route intelligence beyond plain guidance arrays

### Milestone 2: Discovery consumption

- discovery can choose better starts and collection methods from the learned artifacts

### Milestone 3: Apply-planning consumption

- apply planning can reuse the same structured intelligence instead of rediscovering it late

## Verification Expectations

Implementation work for this plan should be validated with at least:

- `pnpm --filter @unemployed/contracts test`
- `pnpm --filter @unemployed/job-finder test`
- `pnpm --filter @unemployed/desktop build`
- `pnpm docs:check`

Additional completion rule:

- leave behind replay-tested examples proving that a source-debug run can discover and persist a better collection start than the user-supplied anchor URL while still remaining bounded to the correct site

## Notes For A Deeper Follow-On Plan

- Decide whether provider research should remain wholly inside source-debug or whether a lighter provider-classification pass should run during discovery as well.
- Decide how route or API confidence decays over time and what counts as stale enough to force a re-debug.
- Decide which artifact fields should be user-editable versus review-only.
