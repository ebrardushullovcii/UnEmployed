Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

Inline comments:
In `@apps/desktop/src/main/adapters/scripts/resume_parser_sidecar.py`:
- Around line 518-528: The card frame uses hard-coded coordinates
(rounded_rectangle((36, 36, 1204, 1718), ...)) which assume a 1240×1754 canvas;
update encode_page_image (the block that creates Image.new, draw =
ImageDraw.Draw, and calls draw.rounded_rectangle) to compute the rectangle
coordinates and corner radius relative to the provided width/height (e.g.,
compute left/top/right/bottom as margins based on width/height and radius as a
fraction of min(width,height)) so the inner card stays centered and
proportionally inset for any canvas size; ensure render_lines_to_svg_data_url
callers remain compatible and use the same relative margin logic when
positioning title and body text.
- Around line 473-483: split_text_into_pages uses a 42-line page size but
encode_page_image and render_lines_to_svg_data_url hard-code lines[:48], causing
inconsistent truncation; introduce a single constant (e.g.,
MAX_VISION_LINES_PER_PAGE) and use it everywhere: set split_text_into_pages's
default max_lines_per_page to that constant (or call it from the constant), and
replace any lines[:48] in encode_page_image and render_lines_to_svg_data_url
with lines[:MAX_VISION_LINES_PER_PAGE] (or remove the extra slicing and rely on
split_text_into_pages) so all places derive the cap from the same identifier.
- Around line 1084-1100: The failure response currently returns placeholder
identifiers instead of echoing the original request's identifiers; update
build_vision_images_failure_response to accept the parsed request (or its
identifiers) and copy runId, sourceResumeId, and sourceFileKind from that
parsed_request into the "artifact" object (instead of the hardcoded
"resume_vision_run_pending", "resume_source_pending", "unknown"); then update
the call site in main() where build_vision_images_failure_response is invoked to
pass parsed_request (or the extracted identifiers) so the failure response
correlates with the originating run and resume.
- Around line 1103-1128: The except block should reuse the previously parsed
request object instead of blindly re-parsing raw_input: keep the local variable
request (from json.loads(raw_input)) in scope and, when the call to
build_response or build_vision_images_response raises, extract request_id =
request.get("requestId", "unknown_request") and operation =
request.get("operation") to decide which failure builder to call; only attempt
json.loads(raw_input) as a fallback if the initial json.loads failed (i.e.,
request is not set), and remove the silent try/except that swallows
JSONDecodeError. Reference: main, raw_input, request,
build_vision_images_response, build_response,
build_vision_images_failure_response, build_failure_response.
- Around line 651-679: The loop leaks pypdfium2 PdfPage and PdfBitmap handles
because page = pdf[page_index] and bitmap = page.render(...) are not closed per
iteration; after creating the PNG bytes, call bitmap.close() (or
bitmap.release()/close equivalent on PdfBitmap) and then page.close() (or
PdfPage.close) before continuing to the next page, ensuring these calls occur in
a per-iteration finally/block so each page and its bitmap are released
immediately rather than waiting for pdf.close(); update the loop around the
creation of pil_image/raw/digest/images.append to close bitmap and page
regardless of errors.

In
`@apps/desktop/src/renderer/src/features/job-finder/components/profile/setup/profile-setup-screen-sections.tsx`:
- Around line 283-318: The callout rendering the import comparison (the outer
div wrapping linkedCandidate?.conflictChoices — the element using
rounded-(--radius-field) with hard-coded classes border-amber-500/30,
bg-amber-500/10 and text-amber-200/90) should use semantic CSS custom properties
instead of Tailwind palette tokens; add warning tokens in globals.css (e.g.,
--surface-warning, --surface-warning-border, --text-warning) and replace the
three hard-coded classes with equivalents that reference those tokens (and keep
existing semantic tokens like --radius-field and text-foreground-soft where
applicable) so the callout follows the app theme and contrast rules.

In `@apps/desktop/src/renderer/src/pages/job-finder-page.tsx`:
- Around line 60-65: Replace the ad-hoc Tailwind arbitrary font sizes by
swapping the class text-[1.15rem] on the h2 with the project's headline token
(e.g., text-(--text-headline)) and replace the other text-[0.9rem] occurrence
(near lines 78–82) with the appropriate body/tiny token (e.g.,
text-(length:--text-tiny) or the matching --text-* custom property used
elsewhere); update the className strings where dialogTitleId is used and the
sibling element's className to remove arbitrary rem values and use the global
CSS custom property tokens so the components adhere to the project's typographic
scale.
- Around line 27-99: The dialog is missing aria-describedby for the explanatory
paragraph; in ApplyCopilotVisualCheckpointDialog create a second id (e.g., const
descriptionId = useId()), add aria-describedby={descriptionId} to the dialog
container (the element with role="dialog") and assign id={descriptionId} to the
descriptive <p> that explains screenshots so screen readers announce it when the
dialog opens.

In `@apps/desktop/src/renderer/src/pages/use-job-finder-page-controller.ts`:
- Around line 305-316: The updater passed to
setApplyCopilotVisualCheckpointRequest is doing side effects (calling
request?.onResolve) which can run twice under React Strict Mode; change
resolveApplyCopilotVisualCheckpointRequest to first read the current
applyCopilotVisualCheckpointRequest from state (the value managed alongside
setApplyCopilotVisualCheckpointRequest), then call
setApplyCopilotVisualCheckpointRequest(null) and only after that invoke
request?.onResolve(visualCheckpointsEnabled). In short: stop invoking
request.onResolve inside the state-updater — capture the current request value,
clear state, then call request.onResolve outside the updater in
resolveApplyCopilotVisualCheckpointRequest.

In `@packages/ai-providers/src/openai-compatible-resume-import.ts`:
- Around line 311-319: Update the adjudication prompt passed to
input.fetchModelJson("adjudicateResumeImportCandidates") to include a concrete
JSON candidate example mirroring extractOpenAiCompatibleResumeImportStage
(showing required fields and that "target" must be an object) and include an
example visualEvidence ref and conflictChoices usage; this ensures the model
returns well-formed candidates that normalizeTarget won’t drop and documents
that conflictChoices is an accepted field. Reference the existing payload call
and extractOpenAiCompatibleResumeImportStage and add the sample candidate JSON
and a short rule like "target must be an object" plus an example visualEvidence
and conflictChoices entry in the prompt text.
- Around line 364-376: The two magic numbers passed into
buildCandidateConfidenceBreakdown (normalizationRisk: 0.1 and conflictRisk:
0.34) should be replaced by named module-level constants so their intent is
clear and they can be tuned in one place; define descriptive constants (e.g.,
POST_ADJ_NORMALIZATION_RISK and POST_ADJ_CONFLICT_RISK) near the existing
truncation limits, add a short comment explaining these represent
post-adjudication weighting (or that they match/override extract-path defaults),
and then use those constant names in the .map(...) call that builds
confidenceBreakdown instead of the hardcoded literals.

---

Duplicate comments:
In `@docs/exec-plans/queued/coderabbitai-review.md`:
- Line 141: The file ends without the required EOF newline; ensure the last line
"current PR context and a future expiration window." is followed by exactly one
trailing newline (no extra blank lines) so the file terminates with a single
newline character to satisfy MD047.
- Line 1: The document currently starts with the literal line "Status: ready"
which triggers MD041; add a top-level H1 as the very first line (for example
start the file with "# <Title>"), then move the existing "Status: ready" line
immediately below that heading so the file begins with a first-level heading
followed by the status line.
- Around line 8-140: Replace brittle "Line XXX"/"Around line YYY" references in
coderabbitai-review.md with durable anchors and grepable identifiers: for each
comment mention the symbol it targets (e.g., artifact_id /
request.get("artifactId") / hashlib.sha256, window_confirm_modal,
createSourceDebugInput, BrowserVisualAnalysisInput, Chip component class string
/ "wrap-break-word", ADJUDICATION_BLOCK_LIMIT and ADJUDICATION_CANDIDATE_LIMIT,
exactTargetPage/blankPage selection logic in playwright-browser-runtime,
BrowserVisualObservationSetSchema/addVisualTextIssues, sourceLabelForCandidate
and hasTextVisionMaterialConflict,
resolvedRun/currentSetupContext.latestResumeImportRun) and replace the
line-number note with a short code-anchor (function/type/component name or a
concise quoted grep snippet) plus an optional commit/PR permalink; ensure each
entry now points to a stable symbol or snippet and update the frontmatter
timestamps (created_at, expiration_date) similarly to use ISO8601 and a future
expiration date.

In `@packages/contracts/src/visual.ts`:
- Around line 174-189: The current overly-broad regex guards
(CSS_SELECTOR_PATTERN, DIRECT_ACTION_PATTERN,
SITE_SPECIFIC_WORKFLOW_RULE_PATTERN) are flagging normal prose in many
superRefine paths (label, description, summary, promptHint, fieldKindHint,
domSummary, visualSummary, recommendedHandling and the string arrays inside
BrowserVisualObservationSetSchema and ApplyVisualCheckpointSchema); tighten them
by: (1) narrowing CSS_SELECTOR_PATTERN so it only matches real selectors
(require selector tokens like >, :, ::, = or quoted attribute values like
[data-attr="..."], or typical selector punctuation such as :has( or .#
sequences), not any bracketed phrase), (2) narrowing DIRECT_ACTION_PATTERN to
imperative/command context (match verbs at sentence start or followed by an
object/target e.g., ^\s*(click|type|press|tap|fill|choose)\b or require a
following noun/selector), and (3) restrict SITE_SPECIFIC_WORKFLOW_RULE_PATTERN
to true site references (use word boundaries plus context words like on/at or
domain-like tokens, or require exact match of known site names rather than
matching substrings like "indeed" or "lever" in arbitrary prose); update those
three regexes accordingly so safeParse superRefine no longer strips legitimate
descriptive fields.