# UnEmployed

UnEmployed is an agent-first desktop product for job search, resume preparation, safe application assistance, and planned interview support. This file is a glossary only; product behavior lives in `docs/PRODUCT.md`, boundaries in `docs/ARCHITECTURE.md`, and decisions in `docs/adr/`.

## Job Finder Language

**Resume coverage policy**:
The rule for which profile work-history records appear in a generated resume and at what level of detail.
_Avoid_: irrelevant jobs, hidden jobs

**Career-family fit**:
The relationship between a profile work-history record and the candidate's target professional lane.
_Avoid_: relevance

**Weak-fit work-history record**:
A work-history record close enough to the target lane to include in compact form or show as a review suggestion.
_Avoid_: irrelevant role

**Gap-coverage role**:
A weak-fit work-history record that may be worth compact inclusion because omitting it creates a meaningful work-history gap.
_Avoid_: filler job

**Resume review guidance**:
App-only guidance that explains why a resume draft item may need user review before export.
_Avoid_: export note, resume annotation

**Resume tailoring style**:
The user's preferred strength of resume rewriting for a target job, ranging from light touch to strong rewrite.
_Avoid_: aggression, creativity level

**Functional layout variety**:
Resume template variety based on section order, hierarchy, density, and content emphasis rather than color differences.
_Avoid_: theme color variety

**Apply visual checkpoint**:
A bounded screenshot and structured visual observation captured during safe apply to explain visible form state, blockers, validation, upload controls, or recovery needs.
_Avoid_: continuous apply recording, visual auto-submit

**Source-generic visual snapshot**:
A bounded browser screenshot captured to explain visible page state without encoding job-board-specific workflow rules.
_Avoid_: board-specific screenshot rule, visual shortcut

## Relationships

- A **Resume coverage policy** uses **Career-family fit** to decide whether a work-history record is omitted, compact, or detailed.
- A **Weak-fit work-history record** can become a **Gap-coverage role** when omitting it creates a meaningful continuity problem.
- **Resume review guidance** is shown inside the app and must not be rendered into exported resume content.
- **Functional layout variety** is the priority for resume templates; color changes alone do not justify a new apply-safe template.
- An **Apply visual checkpoint** and a **Source-generic visual snapshot** provide structured evidence only; browser actions, selectors, and workflow rules remain owned by typed workflow logic.

## Flagged Ambiguities

- "irrelevant jobs" was used for both unrelated work history and useful but weak-fit history; resolved: use **Career-family fit** for the relationship and **Resume coverage policy** for inclusion behavior.
