Status: ready

Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

Inline comments:
In `@apps/desktop/src/main/adapters/scripts/resume_parser_sidecar.py`:
- Line 708: The f-string for artifact_id uses nested double quotes which
requires Python 3.12+; replace the inner double quotes with single quotes so the
fallback expression uses
hashlib.sha256(file_path.encode('utf-8')).hexdigest()[:16] instead of
file_path.encode("utf-8") to restore compatibility on Python ≤3.11—update the
expression that sets artifact_id (referencing artifact_id,
request.get("artifactId"), file_path and hashlib.sha256) accordingly.

In `@apps/desktop/src/renderer/src/components/ui/chip.tsx`:
- Line 8: The class string in the Chip component uses a non-existent utility
"wrap-break-word" which gets ignored; update the class list in the Chip
component (the string assigned in
apps/desktop/src/renderer/src/components/ui/chip.tsx) to replace
"wrap-break-word" with the Tailwind utility "break-words" so the element
correctly applies word-wrapping; apply the same replacement to other affected
components (e.g., ReviewQueueListPanel, ResumeWorkspaceSidebar) where
"wrap-break-word" appears.

In `@docs/exec-plans/queued/coderabbitai-review.md`:
- Line 15: The document shows a contradiction: the entry window_confirm_modal is
marked { status: open, reason: "Requires app modal refactor; deferred" } while
the document-level "Status: ready" remains — reconcile these by either updating
the document-level status to in_progress (or other non-ready state) until all
open items like window_confirm_modal are resolved, or explicitly mark
window_confirm_modal as deferred and add a clear deferred-scope policy note;
locate the window_confirm_modal entry and the "Status: ready" heading and make
the chosen change (update the heading status or annotate window_confirm_modal
with a deferred flag and a reference to the blocking issue).

In `@packages/ai-providers/src/browser-visual-analysis.test.ts`:
- Around line 58-96: Remove the unnecessary cast in createSourceDebugInput: the
object literal passed to createInput is already compatible with the expected
Partial<BrowserVisualAnalysisInput>, so delete the trailing "as
Partial<BrowserVisualAnalysisInput>" in createSourceDebugInput; leave the object
shape intact so TypeScript will error if BrowserVisualAnalysisInput gains
required fields in the future (references: createSourceDebugInput, createInput,
BrowserVisualAnalysisInput).

In `@packages/ai-providers/src/openai-compatible-resume-import.ts`:
- Around line 194-197: The prompt examples in openai-compatible-resume-import.ts
use single-quoted pseudo-objects (e.g., "{section:'skill', key:'skills',
recordId:null}") which violates the JSON-only requirement; update the prompt
strings to use valid JSON with double quotes and proper null/boolean literals
(e.g., {"section":"skill","key":"skills","recordId":null}) for every example
occurrence including targets for skill, education, certification, link, project,
and language so the model receives syntactically correct JSON examples.
- Around line 325-346: The code repeats the magic numbers 80 and 24 for
adjudication block/candidate limits; introduce named constants (e.g.
ADJUDICATION_BLOCK_LIMIT and ADJUDICATION_CANDIDATE_LIMIT) at module scope and
replace all literal usages: the slice calls
(input.adjudicationInput.documentBundle.blocks.slice(0, 80) and
input.adjudicationInput.candidates.slice(0, 24)) and the truncation checks
(length > 80 and length > 24) should use the new constants so the slicing and
warning logic remain consistent; update any other occurrences in this file that
reference those same limits to use the constants.

In `@packages/browser-runtime/src/playwright-browser-runtime.ts`:
- Around line 554-560: The selection logic currently prefers a leftover blank
tab over an already-matching target page; update the fallback order so
exactTargetPage is chosen first. In the block that computes exactTargetPage,
blankPage and page (using areStructurallyEquivalentHttpUrls, isHttpUrlLike and
context.newPage()), change the final assignment to pick exactTargetPage ??
blankPage ?? (await context.newPage()) so an existing page whose URL matches
normalizedTargetUrl is reused before falling back to a non-HTTP blank page or
creating a new page.

In `@packages/contracts/src/visual.ts`:
- Around line 426-440: The Apply checkpoint's superRefine block repeats four
near-identical forEach calls for value.blockers, value.fieldControls,
value.validationErrors and value.buttonStates; replace those with the same
textArrays loop pattern used earlier (the [key, entries] tuple iteration) and
call addVisualTextIssues(ctx, [key, index], text) for each entry so validation
is consistent and future arrays are handled by a single loop (locate the
superRefine block in BrowserVisualObservationSetSchema and the
addVisualTextIssues calls to update).

In `@packages/job-finder/src/internal/resume-import-reconciliation.ts`:
- Around line 922-937: The switch in sourceLabelForCandidate(candidate:
ResumeImportFieldCandidate) lacks an exhaustiveness guard so new sourceKind
variants could fall through and return undefined; add a final default branch
that asserts the impossible case (e.g., call an assertNever or throw with
candidate.sourceKind) to force compile-time exhaustiveness for
ResumeImportFieldCandidate.sourceKind and ensure the function always returns a
string; locate sourceLabelForCandidate and add the never-check referencing
candidate.sourceKind (or the ResumeImportFieldCandidateSourceKind type) as the
guard.
- Around line 960-976: hasTextVisionMaterialConflict is incorrectly building
normalizedValues from all candidates (including reconciler/adjudicator), which
causes false conflicts; update the function so it first filters candidates to
only the two relevant sources (candidate.sourceKind === "vision_omni" and
sourceLabelForCandidate(candidate) === "Document text") and then compute
normalizeText(...) over that filtered list (using candidate.valuePreview ??
buildValuePreview(candidate.value) ?? JSON.stringify(candidate.value)); keep the
rest of the logic the same so the size check only reflects diversity between
vision and document text.

In `@packages/job-finder/src/internal/workspace-profile-setup-review-methods.ts`:
- Around line 193-202: The fallback using "??
currentSetupContext.latestResumeImportRun" in the resolvedRun() expression is
unreachable because the surrounding guard already ensures
currentSetupContext.latestResumeImportRun is truthy; remove the redundant
null-coalescing fallback and treat the value as non-null (e.g., call
resolvedRun() with a non-null assertion or otherwise rely on the existing guard)
to make intent clear; update references to resolvedRun() and usages like
resolvedRun()! so they rely on the surrounding truthy check of
currentSetupContext.latestResumeImportRun.

---

Outside diff comments:
In
`@apps/desktop/src/renderer/src/features/job-finder/components/profile/setup/profile-setup-screen-sections.tsx`:
- Around line 283-330: The comparison UI is shown when
(linkedCandidate?.conflictChoices?.length ?? 0) > 0 but
getCandidateConflictLabel() treats a real conflict as length >= 2, causing
single-choice imports to be forced into comparison mode; change those checks to
use >= 2 (or reuse getCandidateConflictLabel() truthiness) so the comparison
block (the outer conditional rendering using
(linkedCandidate?.conflictChoices?.length ?? 0) > 0) and the disable condition
on the Confirm Button (the expression (linkedCandidate?.conflictChoices?.length
?? 0) > 0) only activate when conflictChoices.length >= 2.

---

Duplicate comments:
In `@docs/exec-plans/queued/coderabbitai-review.md`:
- Around line 2-4: Update the stale frontmatter values: set created_at to the
PR's actual creation timestamp (or current ISO timestamp) and set
expiration_date to a future date far enough out (e.g., 30–90 days from now) so
the queued plan remains valid; keep or verify target_ref
("coderabbitai-inline-review") is correct for this PR. Ensure the timestamps use
ISO 8601 format (e.g., "YYYY-MM-DDTHH:MM:SS.sssZ") and commit the updated
frontmatter so docs/exec-plans/queued/coderabbitai-review.md reflects the
current PR context and a future expiration window.