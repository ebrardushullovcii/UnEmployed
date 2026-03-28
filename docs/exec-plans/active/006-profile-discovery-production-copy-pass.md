# 006 Profile And Discovery Production Copy Pass

Status: active

## Goal

Run a full production-readiness pass on the text across the `Profile` and `Discovery` surfaces so the UI keeps its current structure and field coverage but drops developer-oriented wording, low-value statuses, and unnecessary copy.

## Why This Work Exists

The current UI direction is in a good place, and the existing Profile fields are already close to the right product shape.

What still feels unfinished is the amount of text that explains too much, exposes internal state too literally, or adds noise without helping the user act.

That creates four product problems:

1. Some labels, helper text, and statuses feel written for the team building the app instead of the person using it.
2. Profile and Discovery can feel busier than they need to because too many text elements compete for attention.
3. Internal concepts that are useful during development can make the product feel less confident when shown directly in the UI.
4. Verbose copy makes the app feel less polished even when the underlying flow is already solid.

## Product Direction

- Keep the overall UI direction.
- Keep the current Profile field set unless a specific field is clearly unnecessary.
- Prefer shorter, calmer, production-ready text.
- Remove statuses, badges, helper text, and labels that do not help a real user make a decision or complete a task.
- Rewrite necessary explanatory text so it sounds product-facing rather than implementation-facing.
- Preserve important recovery guidance, warnings, and trust-building context where it actually helps.

## In Scope

- Profile page labels, helper text, placeholders, section descriptions, empty states, status text, and save feedback
- Discovery page labels, helper text, badges, filters, empty states, activity wording, summaries, and zero-results messaging
- Production-facing naming for agent activity where the feature stays visible to the user
- Removal or reduction of developer-only concepts that leaked into the UI during implementation

## Out Of Scope

- Large layout redesigns
- Changing the core Profile field model as part of this pass
- Reworking the full visual design system
- Broad copy work across Applications, Review Queue, Settings, or Interview Helper in the same task unless a shared string clearly needs to move with this pass

## UX Principles

- Every visible string should earn its space.
- If a status does not help the user decide, recover, or trust the system, remove it.
- Prefer direct language over explanatory filler.
- Favor one clear sentence over multiple stacked hints.
- Preserve useful specificity when something fails, is blocked, or needs attention.
- Hide implementation details unless they materially help the user.

## Audit Lens

Review Profile and Discovery text through these buckets:

### 1. Keep

- text that is already clear, concise, and user-useful

### 2. Rewrite

- text that is useful in concept but sounds internal, verbose, or uncertain

### 3. Simplify

- text that should stay but can be made shorter or merged with nearby copy

### 4. Remove

- text that is purely decorative, repetitive, obvious from context, or only useful to developers

## Specific Areas To Review

### Profile

- tab labels and section headings
- completion/status chips and save-state wording
- field-level helper text and placeholders
- resume-import guidance and analysis messaging
- preference text around discovery targets and related controls

### Discovery

- page-level action labels
- activity timeline wording
- target badges, adapter labels, and experimental messaging
- summary counts and result-state labels
- empty states, zero-results states, and retry guidance

## Desired Outcome

When this pass is done, Profile and Discovery should feel more like a shipped product and less like a tool that still exposes its internal scaffolding.

The user should still understand what the app is doing, but the product should stop narrating low-value implementation details.

## Workstreams

### 1. Text Inventory

- capture all visible strings in Profile and Discovery
- note where the same idea is repeated in multiple places
- flag strings that are obviously internal or overly verbose

### 2. Copy Decision Pass

- classify each string as keep, rewrite, simplify, or remove
- identify statuses and badges that can disappear entirely
- keep only the guidance that improves trust, recovery, or task completion

### 3. UI Cleanup Implementation

- apply the approved copy changes
- remove dead UI text where no replacement is needed
- tighten nearby spacing or structure only when the removed text leaves obvious gaps

### 4. Product QA

- review Profile and Discovery end-to-end with fresh eyes
- confirm the app still communicates important state clearly
- make sure simplified text did not erase necessary warnings or recovery guidance

## Milestones

### Milestone 1: Inventory And Classification

- build the string/status inventory
- bucket items into keep, rewrite, simplify, and remove

Exit signal:

- the team has a concrete list of what text stays, changes, or disappears before edits start

### Milestone 2: Profile Cleanup

- apply the production copy pass to Profile
- remove low-value statuses and helper text

Exit signal:

- Profile keeps the same useful fields but reads more clearly with less noise

### Milestone 3: Discovery Cleanup

- apply the production copy pass to Discovery
- simplify activity wording and user-facing status language

Exit signal:

- Discovery still explains itself, but only with text that helps the user understand or act

### Milestone 4: QA And Final Polish

- run visual and product QA on the cleaned-up flows
- fix any gaps introduced by removing text

Exit signal:

- Profile and Discovery feel production-ready in both wording and signal-to-noise ratio

## Quality Bar

- Do not remove clarity in the name of minimalism.
- Do remove anything that reads like internal implementation commentary.
- Keep warnings, auth requirements, and recovery steps concrete when they matter.
- Prefer product language over engineering language.
- Keep user trust high by showing meaningful state, not every internal state.
- Update docs and screenshots or QA artifacts as needed when visible text changes materially.

## Relationship To Existing Work

This pass sits on top of the current Profile and Discovery implementation rather than replacing it.

It is a polish and production-readiness workstream that should make the current surfaces feel more intentional before more capability is layered on top.
