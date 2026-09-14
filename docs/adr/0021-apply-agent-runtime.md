# ADR 0021: Apply agent runtime

Status: accepted

## Context

Applications were prepared by a fixed script: eight passes over the page, deterministic inspection, and a stop. It could only finish a form whose shape it already anticipated, it spent passes on short forms and ran out on long ones, and every new kind of page meant new code. ADR 0012 authorised full application automation behind an explicit authority document, and ADR 0013 set the shape: observe, propose, authorise, execute, verify. Discovery already works this way — the agent is told the goal and decides when it is done, a stall gets one warning before the run ends, and it can stop itself by saying it is stuck.

## Decision

An application form is worked by an agent loop rather than a fixed number of passes, in `packages/browser-agent/src/apply/`.

The agent never touches the page. It proposes one bounded action — inspect the form, answer this field, attach this file, move to the next step, send it, or finish — and a deterministic executor binds that proposal to the page as it is at that moment, to the exact application the run belongs to, and to the saved authority document before anything is written. A proposal made against a page that has since changed is refused rather than applied to whatever now sits in that slot.

Answers are sourced in a fixed order: a fact the person already stated in their profile, then the resume going out with this application, then an answer they saved before, then free text written for the question and grounded in those three. Only the last of those comes from the model, and only for a genuinely free-text field with nothing stored for it; every written answer records what it was grounded in. A question none of those can answer is not guessed at — it pauses into Needs you with the exact wording from the page and a suggestion when one is plausible.

Anything the person declares about themselves — equal-opportunity self-identification, background-check consent, certifying that answers are true, accepting terms, privacy and marketing consent — is answered only when the saved authority document names that exact kind in `preApprovedAttestationKinds`. An empty list, the default, means every declaration pauses. Pay is the same: `salaryDisclosure` defaults to leaving it to the person.

There is no step quota. Safety ceilings on steps and elapsed time exist and sit far above what an honest application needs. What is bounded is going nowhere: the same warn-then-stop stall rule discovery uses, and a `stuck: true` finish the agent can call itself. Every ending is one plain sentence the person reads as-is.

Sending stays behind its own deterministic preflight: authority for this exact application, a final control that really is one, every required answer present, every required file attached, no visible problem on the page, and this really being the last screen. Then exactly one click, then verification from the employer's own page. An uncertain outcome is recorded as uncertain and never retried.

Nothing per-site exists anywhere in this path. The agent reads the form (ADR 0007).

## Consequences

The loop is source-generic and the same code reads a single-page form, a form split over several screens, and an in-page modal. Form families are proved by fixtures rather than by branches.

Job Finder owns the seam (`packages/job-finder/src/internal/agent-application-preparation.ts`): it installs the prepare-only guard, runs the loop, and turns the result into the application record. Playwright's `Page` does not cross that boundary — whoever owns the browser builds the page hands.

The fixed eight-pass script is gone. `packages/browser-runtime/src/playwright-application-flow.ts` keeps only what is still a browser mechanic — the prepare-only mutation guard, the service-worker sentinel, resume byte verification, and the result builder — and shrank from about 5900 lines to about 1900. Its form inspection, grounded-answer resolution, blocker detection and fill routines were replaced by the agent path; the phone-country handling moved up into answer sourcing, where deciding which country a number belongs to is a decision rather than a mechanic.

The runtime no longer decides how a form is filled. `executeApplicationFlow` opens the page, watches for service workers, and hands the caller one open page's worth of bounded operations through `ApplyPageSession`; `prepareApplicationForm` is a required part of its input, so a run that has no preparer cannot start. Job Finder supplies that preparer for every mode. A build with no model available stops the application and says so as an outage, because the model is part of the product rather than something the person configures.
