# 033 Parallel Vision Resume Import

Status: ready

## Goal

- Improve resume import reliability by running the current parser/text/model flow and an omni vision flow in parallel, then reconciling both into the existing reviewable candidate pipeline.

## Core Idea

- Render every supported source resume into a visual representation when possible and send that representation to the vision-capable omni model: direct page images for PDFs, a stable rendered representation for DOCX, and a simple rendered preview for TXT/MD when useful.
- Implement the vision path for every currently supported import type in this plan: PDF, DOCX, TXT, and MD.
- Preserve the source visual layout where it matters: PDF images should be page-faithful, DOCX should use a best-effort document-faithful rendered intermediate such as PDF before image conversion, and TXT/MD may use normalized readable page images because their visual form is lower value.
- Do not send raw PDF, DOCX, TXT, or MD files to omni; the app must locally produce image inputs first because the vision model only sees images.
- Treat locally generated resume images as temporary import artifacts by default; persist only structured candidates and evidence metadata unless debug or benchmark retention is explicitly enabled.
- Keep the existing document parser, literal extraction, and text model stages running at the same time.
- Keep import usable when either branch fails: text-only candidates can complete without omni, and omni-backed candidates can complete when the text flow fails.
- If local image generation fails, degrade that import to text-flow only with a non-blocking warning; treat normal-condition image-generation failure for any supported file type as a plan-level defect before completion.
- Normalize the omni result into the same resume-import candidate contracts as the current flow.
- Allow omni or Pro-assisted normalization to use non-side-effecting extraction tool calls that record temporary extraction artifacts for the import run.
- Preserve lightweight evidence locations for visual extraction, including source branch, file type, page number, optional region hint, confidence, and uncertainty notes.
- Add an adjudication step that compares text-flow and vision-flow candidates by evidence, confidence, conflicts, source file type, and parser quality signals.
- Expect Pro to participate frequently as a normalization/adjudication step when omni output is messy, low-confidence, or materially conflicts with the text flow, while still allowing deterministic reconciliation to bypass Pro for clear cases.
- Revamp the existing import confirmation UI so material text-vs-vision conflicts are shown as explicit choices, with the recommended value and alternatives visible to the user.
- Label choices by user-facing evidence source, such as document text and visual scan, instead of exposing model names in the normal confirmation UI.

## Guardrails

- Do not let omni write directly to the canonical profile; keep user review and accepted-candidate writes intact.
- Do not change auto-apply or canonical profile write semantics; this plan improves import candidates and confirmation quality only.
- Model tool calls may record temporary extraction artifacts only; app code owns validation, reconciliation, review-candidate creation, and canonical writes.
- Prefer the Pro/text path for text reasoning and the omni path for visual/layout evidence.
- Prefer clean native text for exact literal values such as names, dates, emails, URLs, company names, and titles; prefer omni for layout recovery, scanned content, section grouping, columns, and weak parser output.
- Use Pro for hard normalization/adjudication, not for direct canonical writes.
- Treat conflicts as review items unless confidence and evidence are clearly stronger on one side.
- Do not hide material disagreements between text and vision extraction; route them into the existing user confirmation flow.
- Keep chat and vision provider roles explicit and separately configurable.
- Configure Pro/text and omni/vision as separate model roles instead of overloading the existing text model setting.
- Add a narrow resume-vision provider interface for this work instead of introducing generic multimodal chat across packages.
- Track model context windows explicitly: Pro is expected around 200k tokens and omni around 139k tokens, with roughly 30k tokens reserved as headroom for retries, normalization, and compaction-safe recovery.
- Send normal short resumes to omni in one request when safe, but support bounded page batching for long CVs or image-heavy documents while preserving page numbers across chunks.
- Bound omni runtime with a timeout so slow or failed vision analysis never blocks the existing import path indefinitely.

## Open Details

- Decide whether adjudication is deterministic first, Pro-assisted, or hybrid.
- Choose the DOCX rendered intermediate strategy, likely DOCX to PDF or equivalent document-faithful rendering before image conversion.
- Define the local image-generation pipeline for each file type before provider integration.
- Treat completion as all-file-type support; do not define a PDF-only or partial shipping slice.
- Define the temporary extraction artifact schema and allowed non-canonical extraction tools.
- Define when deterministic reconciliation is enough and when Pro normalization/adjudication is required.
- Define env/config/status fields for the separate vision provider role, including model, base URL, API key, timeout, readiness, and context-window/headroom metadata.
- Define a narrow resume-vision provider contract, such as extracting temporary visual resume artifacts from generated page images and page metadata.
- Define omni page-batching limits and merge behavior for multi-chunk visual extraction results.
- Define the conflict-choice UI shape for imported fields with multiple plausible values.
- Define confirmation UI copy for recommended values, alternatives, low confidence, and different-values-found states.
- Do not build pixel-perfect screenshot overlays or click-to-highlight visual annotations in this plan.
- Define progress/status copy for text-only completion, vision comparison completion, vision timeout, and vision-only recovery.
- Define debug and benchmark modes that may retain generated page images for replayable evidence.

## Completion Bar

- PDF, DOCX, TXT, and MD each have a local image-generation path.
- Each supported file type can run text-flow and vision-flow in parallel.
- Vision timeout or failure does not break text-flow import completion.
- Local image-generation failure does not break text-flow import completion, but normal-condition image generation works for every supported file type before completion.
- Text-flow failure can still produce omni-backed review candidates.
- Temporary extraction artifacts validate and reject malformed model or tool-call output.
- Pro normalization/adjudication is covered for messy or conflicting extraction output.
- Import conflict choices appear in the existing confirmation UI with recommended values and alternatives.
- Canonical profile writes still happen only through accepted candidates or explicit user edits.
- Auto-apply behavior is unchanged by this plan.
- Generated page-image retention is temporary by default, with opt-in debug/benchmark retention only.
- Resume import benchmark or test coverage includes at least one case per supported file type.
