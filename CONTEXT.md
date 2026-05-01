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

**Resume review guidance**:
App-only guidance that explains why a resume draft item may need user review before export.
_Avoid_: export note, resume annotation

**Resume chronology**:
The ordering of included work-history records in reverse chronological order, newest role first.
_Avoid_: relevance ordering

**Gap-coverage role**:
A weak-fit work-history record that may be worth including because omitting it creates a meaningful unexplained work-history gap.
_Avoid_: filler job

**Meaningful work-history gap**:
A gap of six months or more between included work-history records.
_Avoid_: small gap, resume hole

**Resume tailoring style**:
The user's preferred strength of resume rewriting for a target job, ranging from light touch to strong rewrite.
_Avoid_: aggression, creativity level

**Work-history review suggestion**:
A derived app-only suggestion that explains why a work-history record should be included, hidden, or compacted.
_Avoid_: persistent relevance flag

**Functional layout variety**:
Resume template variety based on section order, hierarchy, density, and content emphasis rather than color differences.
_Avoid_: theme color variety

**Resume archetype coverage**:
Validation that resume generation and templates work across both the current real imported resume fixture corpus and synthetic candidate archetypes.
_Avoid_: one-profile optimization

**Representative resume visual review**:
Screenshot review of a selected template-and-fixture matrix that covers each layout purpose without requiring every possible combination.
_Avoid_: exhaustive screenshot grid

## Relationships

- A **Resume coverage policy** uses **Career-family fit** to decide whether a work-history record is omitted, compact, or detailed.
- A **Weak-fit work-history record** should remain user-reviewable instead of being silently treated as unrelated.
- A **Weak-fit work-history record** appears as a Resume Studio suggestion before it appears in generated resume output by default.
- **Resume review guidance** is shown inside the app and must not be rendered into exported resume content.
- **Resume chronology** orders the records selected by the **Resume coverage policy**; it does not rank roles by fit score.
- A **Gap-coverage role** can be recommended for compact inclusion even when its **Career-family fit** is weak.
- A **Gap-coverage role** is considered for compact inclusion when it covers a **Meaningful work-history gap**.
- **Resume tailoring style** changes how strongly grounded facts are framed for a target job; it does not allow invented roles, dates, achievements, or technical claims.
- **Resume tailoring style** can also change weak-fit defaults: light touch hides weak-fit records unless needed for a **Meaningful work-history gap**, balanced suggests them in Resume Studio, and strong rewrite may compactly include grounded weak-fit records by default with app-only review guidance.
- A **Work-history review suggestion** is derived from the profile, job, and **Resume tailoring style**; the durable user decision remains the draft include or hide state.
- **Functional layout variety** is the priority for resume templates; color changes are secondary and should not be treated as meaningful variety by themselves.
- New resume template choices are acceptable only when they add **Functional layout variety** beyond the existing catalog.
- New apply-flow resume templates must meet the same apply-safe benchmark and renderer bar before they become approval-eligible choices.
- **Resume archetype coverage** should include the repo's real imported resume fixtures and synthetic resume-quality benchmark profiles.
- Distinct resume fixture formats for the same candidate can both belong in **Resume archetype coverage** when their structure exercises different import and generation behavior.
- **Representative resume visual review** complements full automated benchmark coverage; it does not replace it.

## Example Dialogue

> **Dev:** "Should the resume include every past role?"
> **Domain expert:** "No. The **Resume coverage policy** should omit clearly unrelated roles, but dev and dev-adjacent roles should still be represented even when they are older."
>
> **Dev:** "What about a sales role with some technical support work?"
> **Domain expert:** "Treat it as a **Weak-fit work-history record**: suggest it in Resume Studio with a weak-relation note, and let the user decide whether it belongs on the resume."
>
> **Dev:** "Should the exported resume say a role has a weak relation?"
> **Domain expert:** "No. That is **Resume review guidance** and belongs only inside the app."
>
> **Dev:** "If an older developer role fits better than the current role, should it move above the current role?"
> **Domain expert:** "No. Use **Resume chronology**: newest included role first."
>
> **Dev:** "Should a weak-fit role stay hidden if omitting it creates a visible employment gap?"
> **Domain expert:** "Not always. Treat it as a **Gap-coverage role** and recommend compact inclusion when the continuity benefit is stronger than the fit concern."
>
> **Dev:** "How large does the gap need to be before the app points it out?"
> **Domain expert:** "Use a **Meaningful work-history gap**: six months or more between included roles."
>
> **Dev:** "Can a strong rewrite make an unrelated role sound like a developer job?"
> **Domain expert:** "No. **Resume tailoring style** can emphasize grounded technical evidence, but it cannot invent a better-fit career history."
>
> **Dev:** "Can strong rewrite include a weak-fit role automatically?"
> **Domain expert:** "Yes, but only compactly and only with grounded facts; the caution stays as app-only **Resume review guidance**."
>
> **Dev:** "Should weak-fit be stored as a permanent label on the role?"
> **Domain expert:** "No. Use a derived **Work-history review suggestion** and persist only the user's include or hide decision on the draft."
>
> **Dev:** "Should two resume templates count as different if only the colors change?"
> **Domain expert:** "No. We need **Functional layout variety**: different hierarchy, density, section order, and emphasis."
>
> **Dev:** "Can we add more templates?"
> **Domain expert:** "Yes, but only if each new template adds a distinct layout purpose instead of expanding the catalog with near-duplicates."
>
> **Dev:** "Can a new template be selectable before it passes the apply-safe checks?"
> **Domain expert:** "Not for the apply flow. New apply-flow templates must pass the same safety bar before approval eligibility."
>
> **Dev:** "Should template quality optimize only for the current user's resume?"
> **Domain expert:** "No. Use **Resume archetype coverage** so the catalog works for the current user and the broader fixture set."
>
> **Dev:** "Should two resumes for the same person both stay in the corpus?"
> **Domain expert:** "Yes, when they use meaningfully different formats that exercise different import and generation paths."
>
> **Dev:** "Do we need screenshots for every template and every fixture?"
> **Domain expert:** "No. Run the full automated matrix, then use **Representative resume visual review** for the combinations most likely to expose layout problems."

## Flagged Ambiguities

- "irrelevant jobs" was used for both unrelated work history and omitted useful dev history; resolved: use **Career-family fit** for the role relationship and **Resume coverage policy** for the inclusion behavior.
