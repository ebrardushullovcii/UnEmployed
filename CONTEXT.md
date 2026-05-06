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

**Parallel vision resume import**:
Resume import behavior where the existing text/parser flow and a vision-model flow run at the same time, then reconcile into reviewable import candidates before any canonical profile write.
_Avoid_: vision-only import, omni overwrite

**Import conflict choice**:
A user-facing resume import review item that presents multiple plausible extracted values for the same profile field and asks the user which value is correct.
_Avoid_: silent arbitration, hidden conflict

**Temporary extraction artifact**:
A validated import-run artifact produced from parser, text model, or vision model output before reconciliation and user confirmation decide whether any value becomes a review candidate or canonical profile data.
_Avoid_: temp profile, model save

**Source-generic visual snapshot**:
A bounded browser screenshot captured to explain visible page state without encoding job-board-specific workflow rules.
_Avoid_: board-specific screenshot rule, visual shortcut

**Apply visual checkpoint**:
A bounded screenshot and structured visual observation captured during safe apply to explain form state, blockers, validation, upload controls, or recovery needs.
_Avoid_: continuous apply recording, visual auto-submit

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
- **Parallel vision resume import** may run for every supported resume file type, but exact literal values from clean native text remain stronger evidence than visual readings.
- **Parallel vision resume import** uses vision evidence primarily for visual/layout recovery, scanned content, section grouping, columns, and weak parser output.
- An **Import conflict choice** should be used when text-flow and vision-flow evidence disagree on a material field and neither value is clearly disposable.
- **Parallel vision resume import** should be non-blocking: either branch can provide reviewable candidates, and a failed or slow vision branch must not prevent text-flow import completion.
- **Parallel vision resume import** sends locally generated images to the vision model; raw resume documents are not treated as vision-model inputs.
- **Parallel vision resume import** treats generated page images as temporary sensitive artifacts unless an explicit debug or benchmark mode retains them.
- A model tool call in **Parallel vision resume import** may create a **Temporary extraction artifact**, but it must not write canonical profile data or bypass user confirmation.
- Pro may participate in **Parallel vision resume import** as a frequent normalizer or adjudicator when vision output is messy or conflicts with text evidence, but canonical writes still belong to app code and user confirmation.
- Pro/text and omni/vision are separate model roles in **Parallel vision resume import**; model configuration and readiness should not overload a single text-model setting.
- **Parallel vision resume import** should use a narrow resume-vision provider interface rather than a generic multimodal chat interface.
- Model prompts in **Parallel vision resume import** should reserve context-window headroom, currently expected around 30k tokens, so retries, normalization, and recovery do not run at the provider limit.
- **Parallel vision resume import** may send short resumes to omni in one request, but long CVs and image-heavy documents should use bounded page batches with page numbers preserved for reconciliation.
- **Parallel vision resume import** is complete only when every currently supported import type has a local image-generation path and vision extraction path.
- **Parallel vision resume import** degrades to text-flow only when local image generation fails at runtime, but normal-condition image-generation failure for a supported file type is not acceptable as completed work.
- **Parallel vision resume import** should preserve source layout for PDF and DOCX visual extraction, while TXT and MD can use normalized readable renderings because their original visual form is less meaningful.
- **Temporary extraction artifacts** should carry lightweight evidence locations such as source branch, file type, page number, region hint, confidence, and uncertainty notes; full visual annotation UI is not part of the initial plan.
- **Parallel vision resume import** improves extracted candidates and conflict review only; it does not change auto-apply behavior or canonical profile write consent semantics.
- An **Import conflict choice** should label alternatives by user-facing evidence source, such as document text and visual scan, rather than by model/provider names.
- A **Source-generic visual snapshot** can support source-debug by default on weak signals, while normal discovery should use stricter triggers when visual evidence is needed to recover from poor or ambiguous results.
- **Source-generic visual snapshot** capture belongs to generic browser runtime primitives, while trigger policy and interpretation belong to browser-agent workflow policy.
- **Source-generic visual snapshot** screenshots may be persisted for source-debug evidence, but normal discovery should treat screenshots as temporary by default and persist only structured findings unless explicit debug or benchmark retention is enabled.
- **Source-generic visual snapshot** output should be structured observation evidence only; browser actions remain owned by browser-agent tools and policy.
- Visual observations from a **Source-generic visual snapshot** should be normalized before they become durable source-debug findings or learned instructions; normal discovery can use validated observations as temporary recovery context.
- Every source-debug phase may request a **Source-generic visual snapshot**, but phase start alone is not enough; the snapshot needs a phase-relevant weak signal.
- **Source-generic visual snapshot** capture is viewport-first, may crop to a relevant region when known, and should use full-page screenshots only when source-debug evidence cannot be captured otherwise.
- An **Apply visual checkpoint** can be used conservatively during normal safe apply when DOM evidence is weak, and more aggressively after apply pauses or fails for recovery guidance.
- **Apply visual checkpoint** output should be structured observation evidence only; safe apply actions remain owned by typed apply workflow logic and user consent.
- **Apply visual checkpoint** screenshots are temporary by default and should be persisted only as selected evidence for paused/failed recovery, user review, or explicit debug/benchmark retention.
- **Apply visual checkpoint** observations supplement DOM-derived field snapshots but must not silently override them.
- Pro may normalize **Apply visual checkpoint** observations into recovery summaries or question context, but apply workflow code owns browser actions and gates.

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
