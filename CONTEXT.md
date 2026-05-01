# UnEmployed

UnEmployed is an agent-first desktop product for job search, resume preparation, and safe application assistance. This context captures product language that should stay stable across docs, UI, and implementation plans.

## Language

**Resume coverage policy**:
The rule for which profile work-history records appear in a generated resume and at what level of detail.
_Avoid_: irrelevant jobs, hidden jobs

**Career-family fit**:
The relationship between a profile work-history record and the candidate's target professional lane.
_Avoid_: relevance

**Weak-fit work-history record**:
A work-history record that is close enough to the target lane to include by default only in compact form or show as a review suggestion.
_Avoid_: irrelevant role

## Relationships

- A **Resume coverage policy** uses **Career-family fit** to decide whether a work-history record is omitted, compact, or detailed.
- A **Weak-fit work-history record** should remain user-reviewable instead of being silently treated as unrelated.

## Example Dialogue

> **Dev:** "Should the resume include every past role?"
> **Domain expert:** "No. The **Resume coverage policy** should omit clearly unrelated roles, but dev and dev-adjacent roles should still be represented even when they are older."

## Flagged Ambiguities

- "irrelevant jobs" was used for both unrelated work history and omitted useful dev history; resolved: use **Career-family fit** for the role relationship and **Resume coverage policy** for the inclusion behavior.
