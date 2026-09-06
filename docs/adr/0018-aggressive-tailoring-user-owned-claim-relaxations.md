# ADR 0018: Aggressive tailoring may round years up by one and name listing technologies, at the user's own risk

Status: accepted (2026-09-06).

## Context

Aggressive tailoring was designed fail-closed (ADR-era grounding policy in `resume-generation-grounding.ts`): every metric had to appear verbatim in the cited evidence, every named word had to come from the evidence, and the fail-closed lexical policy rejected any unknown token. The candidate — the product's only user, editing their own resume — asked for two deliberate exceptions, because an exact-evidence resume can undersell a real practitioner:

- "I have worked with TypeScript 3, close to 4 years, and the job asks for 4" — the truthful figure is a rounding step away from the requirement.
- "The job names a library I never wrote down, but with my evidenced experience I would have used it or know how to use it" — the interview is where the claim gets proven.

Silently accepting either would break the product's grounding promise; refusing both makes aggressive mode materially weaker than the candidate wants. The middle path already exists in the verifier: `confirm_needed` claim assessments block export until the user confirms each claim with the ownership statement "I confirm this content is accurate and my own."

## Decision

In aggressive tailoring only, on lines the model itself flags `inferred` (so they are counted in the draft notes), the deterministic gate accepts two bounded relaxations and reports both through the existing user-confirmation flow:

- **Years rounding.** A years-of-experience figure may be stated one year above the cited evidence, but only when the target listing itself states that higher years figure (evidenced "3 years" may be stated as listed "4 years"). The metric must be a pure integer in a years context; percentages, money, and counts stay verbatim-evidence-required in every mode.
- **Listing-anchored technologies.** A named technology may come from the target job listing's own text (description, responsibilities, qualifications, key skills) — never from nowhere. The model is prompted to name only listing technologies the evidenced stack or domain implies; the gate cannot judge plausibility, so its bound is "the listing itself asked for it".

Everything else stays hard in every mode: the target employer, dates, titles, credentials, seniority, leadership, and every non-years number still require evidence, and a technology absent from both the evidence and the listing still rejects.

The workspace verifier runs the same relaxations in its most-permissive posture so accepted claims never flip to unsupported after acceptance, and maps every relaxed claim to `confirm_needed` (generated lines) or informational `review` (user-authored prose). The draft note states plainly that relaxed lines go beyond saved evidence and that confirming them is the user's responsibility. The user owns the honesty decision; the product never presents a relaxed claim as verified.

## Consequences

- Relaxed lines are counted in the `AI-inferred … came from aggressive tailoring` note, which now names both relaxations and the user-owned confirmation duty.
- The verifier's legacy quantified-claim scan applies the same one-year adjacency (anchored on the years unit, without token-overlap), so rounded claims surface as confirmations instead of `invented_metric` errors; the claim-evidence bank now includes the profile's own years-of-experience figure.
- Conservative and balanced drafts are unchanged: the generation gate only relaxes under aggressive mode plus the model's inferred flag. User-authored prose that matches a relaxation lands in informational review, matching the verifier's existing permissive posture.
- A future reader of the fail-closed lexical policy should not "fix" the listing-unit exception: it is the intended bound of this decision, and the safe-vocabulary list itself stays closed to technologies.

Rejected alternatives: a curated technology-adjacency map (brittle, maintenance-heavy, and still cannot judge "would have used it"); letting the gate accept any metric within a tolerance (unbounded beyond years); relaxing only the prompt and keeping the gate strict (the gate would reject every relaxed line, so nothing would change).
