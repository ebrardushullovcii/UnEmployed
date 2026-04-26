# 022 Job Finder Source Sign-In Prompts And Source-Aware Browser Entry

Status: ready

## Goal

If a website is detected to require login, or the product has strong evidence that results are materially better after login, make that need explicit in the UI and give the user a direct, source-aware sign-in path from both Profile and Find Jobs near the relevant search actions.

This work should ship with real production ownership: do not preserve weak architecture just because it already exists, and do not hesitate to refactor, rewrite, or re-architect the relevant state, runtime, or UI layers when that is the best way to deliver a durable outcome for real users.

## Problem Statement

- some sources already produce auth-related evidence, but the product does not turn that evidence into a focused user action
- users can be told to open the browser and sign in, but the current flow is generic and can leave them guessing which source needs attention and where to go
- the current browser session action opens the shared browser profile, but it is not source-aware and does not directly guide the user into the correct sign-in surface
- the sign-in need should be visible in both `Profile` and `Find jobs`, especially near `Check source`, `Search now`, and `Search jobs`
- this work must align with the broader push toward scoped pending state, stronger action feedback, and production-safe workflow ownership instead of preserving the current shape for its own sake

## Delivery Posture

- fully own the feature end to end as if it is shipping to production users now
- prefer the smallest correct change when it is enough, but make large changes when the current architecture is the real problem
- add or widen contracts first when behavior needs a stronger typed model
- write missing tests instead of relying on manual confidence
- capture screenshots of the real rendered UI, review the experience as a user would see it, and keep improving copy, layout, hierarchy, and action clarity until the result feels production-ready rather than merely functional
- keep going through implementation, verification, and follow-up cleanup unless a true product decision is required
- preserve source-generic discovery rules: use reusable evidence, typed semantics, and generic heuristics rather than hardcoded site branches

## Constraints

1. Keep main, preload, and renderer concerns separate
2. Keep contracts typed and schema-validated
3. Do not add board-specific workflow policy in `job-finder` orchestration or renderer code
4. Do not automate credential entry, credential storage, or any behavior that weakens user consent or session safety
5. Preserve the shared dedicated browser profile model and its existing single-resource ownership semantics
6. Keep discovery, source-debug, and apply evidence replayable and auditable
7. Keep live submit disabled unless explicitly re-authorized

## Product Bar

- users can clearly see when a source needs sign-in versus when sign-in is only recommended for better coverage
- users can act on that guidance from `Profile` and `Find jobs` without guessing which source needs attention
- the browser action is source-aware enough to take the user directly to the relevant source entry surface when possible
- the UI language is specific, calm, and actionable instead of generic browser-error wording
- pending and disabled states remain scoped to the real shared resource boundaries
- the UI must be reviewed in screenshots after implementation, and any confusing, weak, awkward, cramped, noisy, or visually low-confidence states found in those screenshots must be polished before the work is treated as done

## Proposed Direction

1. Add a typed source-access prompt model in `packages/contracts`
2. Derive source-level access prompts from existing source-debug and source-intelligence evidence in `packages/job-finder`
3. Distinguish at least two user-facing states:
   - `login_required`: source-debug or runtime evidence shows auth is blocking the next useful step
   - `login_recommended`: guest access works, but evidence shows broader or better results when signed in
4. Extend the shared browser-session open path so the product can request a source-aware browser entry instead of only a generic open action
5. Surface sign-in CTAs near source actions in `Profile` and near search controls in `Find jobs`
6. Keep detection source-generic by grounding it in auth markers, blocker summaries, manual prerequisite summaries, and learned instruction intelligence rather than per-board branches

## Expected Architecture Changes

- contracts:
  - add source-access prompt types and snapshot fields that describe which source needs attention and why
  - add typed input for source-aware browser open requests if the IPC surface needs parameters
- job-finder service:
  - derive prompt state from source-debug attempts, warnings, and synthesized intelligence
  - resolve target-aware browser open requests to the correct source and entry URL
- browser runtime:
  - widen the session-open interface if needed so the shared browser profile can open at a specific relevant URL without exposing renderer-side browser control
- desktop main/preload:
  - expose the new typed action through IPC and preload only
- renderer:
  - add reusable sign-in callouts and buttons in Profile and Discovery
  - keep browser pending scoped to the shared browser session lane while preserving per-target affordances in the UI

## Key UX Changes

- `Find jobs`
  - show a focused sign-in prompt near the main search controls when any enabled source needs attention
  - show per-source sign-in actions in the single-source search area when the need is specific to one target
  - replace overly generic copy like "Open browser" when a clearer source-aware sign-in action is available
- `Profile`
  - show a sign-in action near `Check source` and `Search now` inside each source row when that source needs attention
  - make it clear whether the user should sign in first, then rerun `Check source`, `Search now`, or `Search jobs`
- browser status language
  - avoid claiming the app knows the user is signed in unless that is actually what the evidence supports

## UX QA Requirement

- treat screenshot review as a required validation step, not optional polish
- capture updated screenshots for both `Profile` and `Find jobs` after the sign-in prompts land
- review those screenshots specifically for:
  - whether the sign-in action is easy to notice near the relevant search controls
  - whether the required versus recommended distinction is immediately understandable
  - whether the hierarchy between `Sign in`, `Check source`, `Search now`, and `Search jobs` is clear
  - whether spacing, emphasis, and copy feel production-quality on desktop and narrow layouts
  - whether the UI looks trustworthy and intentional instead of like a bolted-on warning block
- if screenshot review exposes UX weakness, continue iterating on the implementation instead of stopping at the first technically correct version

## Risks To Manage

- confusing a generic open-browser action with a source-specific sign-in action
- introducing board-specific detection branches that violate the source-generic boundary
- widening runtime interfaces in a way that leaks browser internals into renderer or weakens typed IPC boundaries
- misclassifying auth-limited guest access as fully blocked, or vice versa
- regressing the current scoped pending-state work by reintroducing broad disable fan-out

## Next Steps

1. Design the minimal typed contract for source access prompts and source-aware browser open input
2. Implement evidence-based derivation in `packages/job-finder` from existing source-debug and intelligence data
3. Extend the browser open path so it can target the relevant source entry URL safely through main/preload
4. Add Profile and Discovery sign-in affordances near the existing search and source actions
5. Tighten copy and visual states so required versus recommended sign-in is obvious
6. Capture screenshots of the updated `Profile` and `Find jobs` experiences and iterate on UI and UX quality until the rendered result is strong
7. Add focused contracts, service, renderer, and runtime coverage
8. Validate with desktop, contracts, job-finder, and source-generic checks before considering the work complete

## Validation

- `pnpm validate:contracts`
- `pnpm validate:job-finder`
- `pnpm validate:desktop`
- `pnpm validate:browser-runtime` if the runtime interface changes
- `pnpm source-generic:check`
- relevant renderer tests for Profile and Discovery sign-in surfaces
- relevant desktop UI harnesses for the updated Profile and Find Jobs flows
- screenshot capture for the updated `Profile` and `Find jobs` states, followed by at least one explicit UI/UX review pass and any necessary polish changes

## Success Criteria

- the product can explain which source needs sign-in and why
- users can start the correct sign-in flow directly from the source they are working with
- source-aware browser entry works through typed boundaries only
- auth-required and auth-recommended states are covered by deterministic tests
- the implementation stays source-generic and does not regress current pending-state safety
- screenshot review confirms the rendered UI is clear, polished, and worth shipping without obvious UX confusion or half-finished visual treatment
