# CodeRabbit Review Findings

Status: ready

Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

Inline comments:
In `@apps/desktop/src/main/adapters/scripts/resume_parser_sidecar.py`:
- `encode_page_image` / `draw.rounded_rectangle`: The card frame uses hard-coded
  coordinates (36, 36, 1204, 1718) that assume a 1240x1754 canvas; compute
  card_margin, card_radius, text_x, title_y, body_start_y, and line_gap as
  proportional fractions of the supplied width/height so the inner card stays
  centered and proportionally inset for any canvas size; apply the same
  relative-margin logic in `render_lines_to_svg_data_url` for SVG rect and text
  coordinates.
- `split_text_into_pages` / `lines[:48]`: `split_text_into_pages` uses a 42-line
  default but `encode_page_image` and `render_lines_to_svg_data_url` cap at
  `lines[:48]`; introduce `MAX_VISION_LINES_PER_PAGE = 48` and use it as the
  default for `split_text_into_pages` and as the slice cap everywhere so all
  callers derive the limit from the same identifier.
- `build_vision_images_failure_response`: The failure response returns placeholder
  identifiers (`"resume_vision_run_pending"`, `"resume_source_pending"`,
  `"unknown"`) instead of echoing the originating request identifiers; accept an
  `Optional[Dict[str, Any]]` request argument and extract `runId`,
  `sourceResumeId`, and `fileKind` from it into the `"artifact"` object so the
  failure correlates with the originating run and resume.
- `main()` / except block: The except block re-parses `raw_input` with a silent
  `try/except` even when `request = json.loads(raw_input)` already succeeded;
  declare `request: Optional[Dict[str, Any]] = None` before the try block, reuse
  it in the except to extract `requestId` and `operation`, and only attempt a
  fallback `json.loads(raw_input)` if the initial parse failed (request is None),
  removing the silent `JSONDecodeError` swallow.
- `render_pdf_images` / `page = pdf[page_index]` / `bitmap = page.render(...)`:
  The loop leaks `PdfPage` and `PdfBitmap` handles because neither is closed per
  iteration; wrap `bitmap = page.render(...)` and `bitmap.to_pil()` in a nested
  try/finally that calls `bitmap.close()` then `page.close()` on every iteration
  regardless of errors.

In `@apps/desktop/src/renderer/src/features/job-finder/components/profile/setup/profile-setup-screen-sections.tsx`:
- `linkedCandidate?.conflictChoices` outer div: The import-comparison callout uses
  hard-coded Tailwind palette tokens (`border-amber-500/30`, `bg-amber-500/10`,
  `text-amber-200/90`) instead of semantic CSS custom properties; replace with
  `border-(--warning-border)`, `bg-(--warning-surface)`, and
  `text-(--warning-text)` which are already defined in globals.css for both light
  and dark themes.

In `@apps/desktop/src/renderer/src/pages/job-finder-page.tsx`:
- `ApplyCopilotVisualCheckpointDialog` / `text-[1.15rem]` / `text-[0.9rem]`:
  Replace the arbitrary font sizes with project tokens: `text-[1.15rem]` =>
  `text-(length:--text-section-title)` on the h2; `text-[0.9rem]` =>
  `text-(length:--text-item)` on the description paragraph.
- `ApplyCopilotVisualCheckpointDialog` / `role="dialog"`: The dialog is missing
  `aria-describedby`; create `const descriptionId = useId()`, add
  `aria-describedby={descriptionId}` to the `role="dialog"` element, and assign
  `id={descriptionId}` to the descriptive `<p>` so screen readers announce the
  explanation when the dialog opens.

In `@apps/desktop/src/renderer/src/pages/use-job-finder-page-controller.ts`:
- `resolveApplyCopilotVisualCheckpointRequest` / `setApplyCopilotVisualCheckpointRequest`:
  The functional updater calls `request?.onResolve(visualCheckpointsEnabled)` as
  a side effect inside the setter, which can fire twice under React Strict Mode;
  capture `applyCopilotVisualCheckpointRequest` from the closure, call
  `setApplyCopilotVisualCheckpointRequest(null)` directly, then invoke
  `currentRequest?.onResolve(visualCheckpointsEnabled)` outside the updater.

In `@packages/ai-providers/src/openai-compatible-resume-import.ts`:
- `adjudicateOpenAiCompatibleResumeImportCandidates` / system prompt: The
  adjudication prompt lacks a concrete JSON candidate example; add a rule "Each
  candidate target must be an object, not a string." and an example candidate
  showing `target`, `conflictChoices`, and `visualEvidence` fields so the model
  returns well-formed candidates that `normalizeTarget` will not drop.
- `buildCandidateConfidenceBreakdown` / `normalizationRisk: 0.1` / `conflictRisk: 0.34`:
  The two literals should be named constants; define
  `POST_ADJ_NORMALIZATION_RISK = 0.1` and `POST_ADJ_CONFLICT_RISK = 0.34` near
  `ADJUDICATION_BLOCK_LIMIT` with a comment explaining they represent
  post-adjudication weighting, then reference those names in the
  `.map(...)` call.

---

Duplicate comments:
In `@packages/contracts/src/visual.ts`:
- `SITE_SPECIFIC_WORKFLOW_RULE_PATTERN`: The pattern matches "indeed" and "lever"
  as standalone words, triggering false positives on common English prose
  ("Indeed, this is correct"; "leverage"); restrict these two ambiguous names to
  site-reference context (preceded by on/at/via/through/using, or followed by
  `.com`) while keeping the remaining unambiguous brand names with plain word
  boundaries.


Duplicate comments:
In `@packages/contracts/src/visual.ts`:
- `SITE_SPECIFIC_WORKFLOW_RULE_PATTERN`: The pattern matches "indeed" and "lever"
  as standalone words, triggering false positives on common English prose
  ("Indeed, this is correct"; "leverage"); restrict these two ambiguous names to
  site-reference context (preceded by on/at/via/through/using, or followed by
  `.com`) while keeping the remaining unambiguous brand names with plain word
  boundaries.