# 009 Full App Production Copy Pass

Status: completed
This plan is complete and now serves as implementation background for later polish or follow-on cleanup.

## Goal

Run a full production-readiness pass on copy across every currently shipped desktop surface so the app reads like a confident product: shorter where it can be, clearer where it must be, and stronger in voice without losing safety, trust, or recovery guidance.

## Delivery Standard For Implementing Agents

This plan is not done when strings have been mechanically rewritten or shortened.

Required implementation bar:

- audit the whole shipped app, not just `Profile` and `Discovery`
- inspect the live UI through the desktop app and existing capture harnesses instead of relying only on code search
- treat copy as product design: remove or simplify low-value fields, helper blocks, badges, statuses, and controls when they do not earn their space
- allow narrow user-facing cleanup when the audit reveals obvious redundant or missing settings, labels, or controls
- preserve trust and recovery guidance for auth, approvals, export, stale state, retries, and destructive actions
- update docs and QA guidance in the same task if visible names, routes, or scripted flow assumptions change materially

In plain terms: another agent should be able to execute this plan and leave the shipped app feeling deliberate end-to-end, not just slightly less wordy.

## Locked Product Decisions

- Scope covers every currently shipped `Job Finder` surface plus shared desktop shell and shared settings surfaces.
- `Interview Helper` is not part of this pass unless it becomes a live shipped surface before implementation starts. If that happens, widen the kickoff inventory and update the plan docs first.
- Coverage is full-app, but execution priority is core Job Finder workflows first, then remaining Job Finder surfaces, then shared shell and settings.
- The target is all three at once: shorter copy, clearer copy, and a stronger product voice.
- The cleanup should be very aggressive about removing internal jargon, verbose helper text, hedging tone, prototype wording, and status overload.
- Internal, AI, and system language may stay visible only when it materially improves user trust, control, safety, or recovery. When kept, translate it into product language.
- If a shipped field, control, or setting is clearly useless, redundant, or only exposes implementation scaffolding, removing it is in scope.
- If the audit exposes an obvious missing small setting, label, explanation, or control that a shipped feature needs to make sense, add the smallest missing piece in the same pass.
- This is not a license for broad feature expansion, new workflow invention, or major information-architecture redesign.

## Why This Work Exists

The shipped behavior is stronger than the shipped wording.

Across the app, some copy still sounds like implementation scaffolding, narrated system state, or developer-facing explanation rather than a finished product. That creates four product problems:

1. Capable workflows feel less polished than they are.
2. Too many labels, helper blocks, and statuses compete for attention.
3. Internal concepts leak into the UI too literally, especially around AI, automation, and intermediate states.
4. The product feels less confident when the copy hedges, over-explains, or sounds provisional.

## What "Production-Ready Copy" Means Here

For this repo, production-ready copy means:

- every visible string helps the user decide, understand, trust, or act
- repeated concepts use the same names across screens
- buttons, tabs, statuses, and dialogs describe user outcomes rather than implementation mechanics
- helper text is sparse, specific, and only present when the UI alone is not enough
- warnings and blockers stay concrete about what happened and what the user can do next
- AI and automation language explains capability boundaries without sounding experimental, apologetic, or overly technical
- settings are understandable enough to configure confidently, including any user-visible automation controls or terms that would otherwise be undefined
- no shipped surface reads like debug output, raw enum text, placeholder scaffolding, or internal team notes

## Product Outcome

When this pass is done, the shipped desktop app should feel calmer, more confident, and more intentional:

1. Core workflows explain themselves with less text.
2. Important warnings and approvals remain obvious.
3. Internal status chatter is reduced or removed.
4. Shared terminology is consistent across `Profile`, `Discovery`, `Review Queue`, `Resume Workspace`, `Applications`, `Settings`, and the shared shell.
5. Obvious redundant or confusing user-facing fields and settings do not survive just because they already exist.

## Scope

### In Scope

- all currently shipped `Job Finder` surfaces: `Profile`, `Discovery`, `Review Queue`, `Resume Workspace`, `Applications`, and `Settings`
- shared shell copy: navigation labels, page framing, headers, empty states, shared dialogs, confirmations, toasts, banners, and route-level loading or error messaging
- product-facing AI, assistant, and automation wording, including progress text, summaries, recovery messages, and approval or safety language
- field labels, placeholders, helper text, section descriptions, table labels, filter labels, status labels, badge text, and action labels
- activity timelines, run summaries, history wording, retry messages, and user-visible state transitions
- removal of low-value statuses, helper blocks, fields, or controls that do not help the user
- minimal additions that close obvious shipped-product gaps exposed by the audit, especially in `Settings` and automation configuration surfaces
- docs and QA guidance updates if visible names, scripted flows, or capture expectations change

### Out Of Scope

- planned-but-not-shipped `Interview Helper` UI
- large layout redesigns or a new visual system
- major navigation or information-architecture rewrites
- broad new feature work not justified by the audit
- hidden developer logs, internal test labels, or code-only names that are not user-visible
- backend or contract work unless a narrow visible cleanup requires it
- speculative settings expansion beyond obvious, already-shipped usability gaps

## Surface Priority Order

This is execution order, not scope reduction:

1. `Review Queue`, `Resume Workspace`, and apply-safety or approval messaging
2. `Discovery`
3. `Profile`
4. `Applications`
5. `Settings`
6. shared shell, dialogs, toasts, banners, empty states, loading states, and cross-surface consistency fixes

## Audit Categories

Every visible string or user-visible text cluster should be reviewed through these categories:

1. `Navigation and naming`
   - tabs, route titles, section headers, repeated feature names
2. `Actions and CTA language`
   - buttons, menu items, filter actions, confirmations, irreversible actions
3. `Form and field copy`
   - labels, placeholders, helper text, inline guidance, validation messages
4. `State and feedback`
   - loading, empty, success, warning, error, blocked, stale, retry, saved, exported, approved
5. `Status density`
   - badges, chips, timeline labels, summary rows, counters, run-state narration
6. `AI and automation language`
   - assistant wording, agent progress text, model or system explanations, automation boundaries
7. `Trust and recovery`
   - auth requirements, destructive warnings, apply safety, stale data, export failures, retry instructions
8. `Settings clarity`
   - option names, descriptions, defaults, advanced controls, automation knobs, and any undefined terms such as step-related controls if they are user-visible
9. `Redundant or missing product structure`
   - useless fields, duplicate settings, dead controls, missing minimal context, or obvious gaps exposed by the rewrite

## Decision Rubric

Each audited item should be classified as one of:

- `keep`: already strong and user-useful
- `rewrite`: concept is right, wording is wrong
- `shorten`: wording is useful but too long
- `remove`: text or control does not earn its space
- `merge`: two adjacent pieces of copy should become one clearer statement
- `add`: a missing small piece of product copy or control is needed for the shipped feature to make sense
- `restructure`: a small UI or content cleanup is needed because wording alone cannot fix the problem

## Internal, AI, And System Language Rule

Use this rule consistently:

- keep visible only the parts that improve trust, control, safety, or recovery
- translate implementation terms into product terms wherever possible
- avoid raw agent, runtime, or model jargon unless the user needs that detail to make a decision
- do not narrate every internal state transition just because the app can detect it
- when automation is uncertain or blocked, say what the user should expect next rather than exposing raw internal mechanics

## Workstreams

### 1. Surface Inventory And Baseline Review

- confirm the current shipped surface map before editing
- walk every shipped screen and shared shell surface
- use existing desktop capture flows where they already cover the UI and supplement with manual review for uncovered states
- build a per-surface audit list of visible strings, repeated concepts, status clutter, redundant helper text, useless fields, and obvious missing product cues

### 2. Copy System And Rewrite Decisions

- define the preferred product vocabulary for repeated concepts across the app
- identify which warnings and safety cues are non-negotiable
- mark each audited item with `keep`, `rewrite`, `shorten`, `remove`, `merge`, `add`, or `restructure`
- explicitly flag small UI or content cleanups that should happen in the same pass instead of leaving awkward leftovers

### 3. Core Workflow Cleanup

- apply the pass to the highest-value shipped flows first
- reduce status clutter, helper-text overload, and prototype wording
- rewrite AI and automation copy so it feels product-facing without becoming vague
- remove or consolidate useless fields, controls, or explanatory blocks where the audit clearly supports it

### 4. Remaining Surface Cleanup And Cross-App Consistency

- finish the remaining shipped screens, dialogs, toasts, banners, and shared states
- align terminology across routes, tables, filters, modals, and settings
- ensure the same user action is described the same way everywhere it appears

### 5. QA And Final Polish

- review the app end-to-end in the desktop shell after the rewrite lands
- confirm that clarity improved without hiding important warnings or recovery steps
- update docs or QA workflow notes if the visible product language or scripted routes materially changed

## Milestones

### Milestone 1: Full Inventory And Decision Pass

- all currently shipped surfaces are mapped
- every problematic string cluster has a decision classification
- all proposed removals or small structural cleanups are identified before broad edits start

Exit signal:

- another agent could execute the rewrite from the audit without inventing missing scope

### Milestone 2: Core Workflow Pass

- `Review Queue`, `Resume Workspace`, `Discovery`, `Profile`, and `Applications` feel clearly more product-like
- high-noise statuses and helper text are removed or rewritten
- the main user flows are shorter, clearer, and more confident

Exit signal:

- core workflows read like a shipped product rather than an implementation scaffold

### Milestone 3: Full Shipped-Surface Alignment

- `Settings`, shared shell surfaces, dialogs, toasts, banners, and edge states match the same voice and naming rules
- repeated concepts use one consistent label across the app
- obvious missing or redundant user-facing settings, fields, or controls exposed by the audit have been resolved

Exit signal:

- there are no glaring voice, naming, or status-density mismatches across shipped surfaces

### Milestone 4: QA, Regression, And Evidence

- desktop capture and manual review confirm the app still communicates blockers, approvals, retries, and safety states correctly
- regressions caused by aggressive copy removal are fixed
- docs are updated if surface names or QA expectations changed

Exit signal:

- the full shipped app feels production-ready in wording, signal-to-noise ratio, and trust cues

## Recommended Execution Order

### Slice 1: Inventory And Baseline

**Goal**: know every shipped surface and every recurring wording problem before broad edits start.

**Work**:

- confirm whether the shipped surface set still matches this plan at kickoff
- run existing capture flows and supplement with manual review for uncovered states
- create a working inventory of string clusters, repeated terms, status overload, redundant helper text, and obvious UI clutter
- note any fields, settings, or controls that should be removed or minimally added as part of the copy pass

**Verification**:

```bash
pnpm --filter @unemployed/desktop build
pnpm --filter @unemployed/desktop ui:capture
pnpm --filter @unemployed/desktop ui:resume-import
pnpm --filter @unemployed/desktop ui:profile-baseline
pnpm --filter @unemployed/desktop ui:resume-workspace
```

**Done when**: the later implementation work can proceed from a concrete inventory instead of exploratory guessing.

### Slice 2: Core Workflow Rewrite

**Goal**: the highest-value shipped flows feel like a finished product first.

**Work**:

- rewrite or remove copy in `Review Queue`, `Resume Workspace`, `Discovery`, `Profile`, and `Applications`
- strip prototype language, hedging, and low-value narrated states
- translate AI or system language into product language where it should stay visible
- remove redundant fields or controls and add small missing user-facing clarifiers where the audit clearly supports it

**Verification**:

```bash
pnpm --filter @unemployed/desktop build
pnpm --filter @unemployed/desktop ui:resume-import
pnpm --filter @unemployed/desktop ui:profile-baseline
pnpm --filter @unemployed/desktop ui:resume-workspace
```

**Done when**: core flows are materially shorter, clearer, and more confident without losing safety or recovery guidance.

### Slice 3: Remaining Surfaces And Shared Shell

**Goal**: the rest of the shipped app matches the same voice, density, and naming rules.

**Work**:

- finish `Settings`, shell framing, dialogs, toasts, banners, route-level empty or error states, and any remaining shared surfaces
- remove lingering inconsistent terminology and status clutter
- resolve obvious redundant or missing settings or controls surfaced by the audit

**Verification**:

```bash
pnpm --filter @unemployed/desktop build
pnpm --filter @unemployed/desktop ui:capture
```

**Done when**: there is no obvious mismatch between top-level flows and the rest of the shipped app.

### Slice 4: QA, Regression, And Docs

**Goal**: prove the product still communicates what matters after an aggressive cleanup.

**Work**:

- review the app end-to-end in the desktop shell
- manually inspect states not fully covered by harnesses, especially `Discovery`, `Applications`, `Settings`, and shared dialogs
- confirm both light and dark appearance anywhere the pass materially changes visible state density, banners, badges, or helper text
- update `docs/TESTING.md`, module docs, or other canonical docs if visible names or scripted QA expectations changed

**Verification**:

```bash
pnpm verify
pnpm --filter @unemployed/desktop build
pnpm --filter @unemployed/desktop ui:capture
pnpm --filter @unemployed/desktop ui:resume-import
pnpm --filter @unemployed/desktop ui:profile-baseline
pnpm --filter @unemployed/desktop ui:resume-workspace
pnpm docs:check
```

**Done when**: the app passes repo checks and the copy pass is backed by real UI review, not just code edits.

## Quality Bar

- be aggressive about removing text, but not reckless about losing meaning
- if a status does not change a user decision, it should usually disappear
- helper text should be the exception, not the default
- prefer direct product language over internal implementation language
- keep important auth, approval, stale-state, export, destructive-action, and recovery warnings concrete
- the same concept should not have different names on different screens
- if a field, setting, or control becomes obviously useless once the copy is cleaned up, remove it rather than preserving dead weight
- if a shipped feature is confusing because one small setting, explanation, or label is missing, add the minimal missing piece in the same pass
- do not hide AI or automation boundaries so much that the user loses trust or control
- do not leave placeholder, experimental, or prototype-feeling wording in any shipped surface

## Failure Modes To Avoid

- making the app shorter but more ambiguous
- deleting safety or recovery guidance that users actually need
- leaving AI or system jargon visible in one surface but translated in another
- cleaning up labels while keeping redundant fields or dead settings that still clutter the UI
- solving only `Profile` and `Discovery` while leaving the rest of the shipped app inconsistent
- preserving raw internal state names because they were easy to reuse from the existing code
- adding explanatory walls of text instead of fixing the underlying product wording or structure

## Relationship To Existing Work

This plan sits on top of the current shipped desktop implementation.

It is a polish and production-readiness pass, not a new feature vertical. The intended result is a calmer, more confident product surface before more capability is layered onto the app.
