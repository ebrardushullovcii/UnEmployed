# 019 Job Finder World-Class Resume Import

Status: active

This plan is the successor to completed `018` resume-import reliability work. `018` landed the right substrate: import runs, document bundles, field candidates, evidence-backed review, and safer canonical merges. It did not yet land world-class document understanding.

The user direction for this follow-on is explicit:

- optimize for the best extraction quality possible
- keep the default path free or near-free
- make the local-only path solid first before revisiting any server or paid fallback ideas
- privacy is not the current deciding constraint
- if paid or remote fallback is ever reconsidered later, variable third-party cost must stay bounded, ideally far below `$5` per user and never require a default architecture that trends above roughly `$5-$10` per user without an explicit override

## Goal

Turn resume import from a text-first parser with repair heuristics into a benchmarked, parser-ensemble, cost-capped document-understanding system that:

1. extracts high-quality candidate data from born-digital PDF, scanned PDF, DOCX, and messy multi-column resumes
2. preserves geometry, reading order, provenance, and parser lineage in a richer canonical document representation
3. uses `FelidaeAI Pro 2.5 / Minimax M2.5` for semantic extraction and reconciliation, not OCR or page-layout decoding
4. auto-applies only extremely safe fields, with near-zero silent wrong writes
5. handles hard documents locally through stronger OCR, layout recovery, composite confidence, and abstention instead of leaning on hidden remote fallback
6. leaves `012`, `014`, and `015` a materially stronger profile substrate instead of more heuristic residue

The target is not "better heuristics for the current CV." The target is a world-class import system with measurable quality, replayability, and cost control.

## Delivery Standard For Implementing Agents

This plan is not complete when a Python parser runs, a few new heuristics land, or one hard PDF finally imports correctly.

Required implementation bar:

- preserve the durable `018` run, bundle, and candidate substrate instead of replacing it with a new parallel import model
- replace the current text-first parser core behind `apps/desktop/src/main/adapters/resume-document.ts` with a pluggable executor architecture
- add a benchmark corpus and regression harness before trusting major parser-routing changes
- keep local parsing as the default shipped path
- keep this first execution slice fully local so parser quality is proved without depending on servers or paid services
- keep parser, OCR, and layout reconstruction outside the LLM; keep semantic extraction inside bounded stage prompts over structured blocks
- make composite confidence and abstention first-class so hard cases fail safely into review rather than silently overwriting profile data
- leave a clear handoff to `012` guided review instead of inventing another temporary review model
- document the zero-required-spend local-first envelope and defer remote spend policy to a later follow-on only if local-only quality still misses the bar

In plain terms: another agent should be able to read this plan, build the stronger importer, run the benchmark harness, and know both the expected quality bar and the allowed cost bar.

## Why This Work Exists

Completed `018` made resume import reviewable and safer, but the core document-understanding path is still not strong enough for the product bar.

Current repo reality:

- `apps/desktop/src/main/adapters/resume-document.ts` still builds many bundles from flattened text lines or `pdfjs`-grouped lines with `bbox: null`
- `packages/ai-providers/src/resume-import.ts` still selects stage context with heading-range and section-hint heuristics
- `packages/job-finder/src/internal/resume-import-workflow.ts` still contains increasingly complex parser-repair and page-flow heuristics that should not be the long-term strategy
- scanned PDF support, true per-page routing, and parser bakeoff scoring are still missing
- current regression confidence mostly proves that the latest heuristics work on the current fixture, not that the system is robust across resume formats

That leaves five product-level gaps:

1. document decoding is still too lossy before semantic extraction begins
2. the canonical bundle is not yet rich enough to be the long-term source of truth for reading order and evidence
3. parser quality is not benchmarked across a real corpus of resume layouts and scan qualities
4. the local parser worker, packaging, and model-distribution path are not yet designed well enough for a strong cross-platform desktop release
5. later plans still risk consuming noisy imported profile data if `019` does not fix the parser core now

## User Direction This Plan Must Preserve

- extraction quality beats privacy concerns for now
- a free or near-free default path is preferred
- the local-only path should be made solid before revisiting any server or hosted fallback path
- the system should target effectively zero required third-party spend in normal use
- if later remote fallback is reconsidered, it should still target a blended cost far below `$5` per user in normal use and stay below roughly `$5-$10` per user without an explicit override

Implementation rules:

- the default path must remain local and cost-free except for the user's own hardware and the self-hosted model they already run
- remote or paid fallback work is explicitly deferred from this first execution slice; the importer should win or fail on the strength of the local stack first

## Dependency Contract With Existing Plans

### Relationship To `018`

`018` is completed and remains the substrate this plan builds on.

Implementation rules:

- keep `ResumeImportRun`, `ResumeDocumentBundle`, and `ResumeImportFieldCandidate` as the durable handoff and audit layer
- refactor parser internals and extraction policy without discarding the reviewable import-run model already landed

### Relationship To `012`

`012` should consume the stronger unresolved-candidate output from this plan rather than forcing setup to ask users to re-correct parser mistakes that could have been avoided.

Implementation rules:

- `019` owns parser quality, evidence quality, confidence, and conflict routing
- `012` owns the guided review UX on top of those artifacts

### Relationship To `014`

`014` depends on imported shared data being trustworthy enough for proof selection, experience grounding, and better resume drafting.

Implementation rule:

- do not treat `014` as the place to repair import-time structural mistakes

### Relationship To `015`

`015` depends on imported identity, experience, targeting, and reusable answer defaults being safe to reuse.

Implementation rule:

- if a field is not trustworthy enough to auto-apply in `019`, it is not trustworthy enough to silently drive apply behavior in `015`

## Locked Product Decisions

- Keep final candidate truth on `CandidateProfile` and `JobSearchPreferences`; do not create a second long-term canonical profile model.
- Keep the `018` import-run and candidate substrate as the durable audit and review boundary.
- Local parsing remains the default shipped path.
- This first execution slice is local-only; remote parsing and paid fallback are explicitly deferred until the local-only ceiling is measured.
- `M2.5` remains the semantic extraction and reconciliation model, not the OCR or layout engine.
- Parser, OCR, and layout recovery are deterministic executor concerns, not provider concerns.
- Auto-apply only high-confidence literal fields with direct evidence and no serious conflict.
- Use composite confidence, not raw model confidence alone, to decide auto-apply vs review vs abstain.
- Never infer sensitive candidate facts with no evidence, especially work authorization, sponsorship need, relocation willingness, availability, notice period, or salary expectations.
- Do not make any server or paid document API a dependency of the first strong importer slice.
- CPU-only packaging is the default target; GPU and server paths are later optimizations, not the release baseline.

## Product Outcome

When this plan lands, the app should be able to:

1. parse easy resumes locally with near-zero variable cost
2. route hard pages and hard documents through stronger OCR/layout recovery without changing downstream product logic
3. attach evidence and parser lineage to accepted or unresolved values
4. auto-apply only extremely safe facts and leave hard records reviewable
5. benchmark parser and extraction changes against a retained corpus instead of relying on anecdotal manual checks
6. ship a credible cross-platform local parser worker that does not depend on user-installed runtimes or hidden services

## Current Handoff Snapshot (2026-04-15)

- The desktop parser executor seam now attempts a spawned Python sidecar for PDF and DOCX before falling back to the embedded desktop parser, and the sidecar contract is validated through desktop adapter tests. The current worker is still a lightweight developer/runtime seam, not the final packaged cross-platform distribution described later in this plan.
- The desktop parser executor seam now attempts a spawned Python sidecar for PDF and DOCX before falling back to the embedded desktop parser, and the sidecar contract is validated through desktop adapter tests. Local desktop builds now also prepare a bundled native sidecar artifact for the current host platform and log whether the current runtime has a matching bundled target available. Cross-platform release packaging still requires building that native artifact on each target OS before packaging installers.
- The latest packaging hardening also lets runtime import use the bundled sidecar binary even when the Python script path is unavailable, and the bundled dependency set now includes `python-docx` so DOCX support does not silently fall back on clean packaged environments.
- The latest parser hardening also widens sidecar DOCX extraction to include table plus header/footer text, falls back to embedded DOCX parsing when sidecar output is suspiciously thin compared with embedded extraction, and renames the host-aware packaging helper to `prepare:resume-parser-sidecar:matrix` so release prep copy matches the native-per-host build reality.
- The newest benchmark-evidence follow-up also preserves mixed parser-manifest evidence in top-level benchmark reports through both `parserManifestVersion` and `parserManifestVersions`, so release QA can see when one retained replay mixed embedded and sidecar parser manifests instead of dropping that summary to `null`.
- Composite confidence is now wired through resume-import reconciliation so grounded parser-literal name, location, and profile-link values can replace stale or placeholder workspace values, while headline, summary, years-experience, and experience record assembly remain review-first in the current workflow.
- A runnable desktop benchmark harness now writes `resume-import-benchmark-report.json` under `apps/desktop/test-artifacts/ui/<label>/`, and scripted desktop test flows now force deterministic AI even when local model credentials exist so QA stays stable.
- The latest parser-repair slice removed the catastrophic hard-PDF identity failures on Aaron Murphy and Ryan Holstien by tightening literal candidate validation, stripping placeholder leakage from deterministic stage extraction, and teaching the deterministic parser the inline-header, company-first, and undated experience formats used by the retained PDFs.
- The latest retained benchmark report at `apps/desktop/test-artifacts/ui/qa-final-benchmark/resume-import-benchmark-report.json` reaches aggregate literal recall `1.000`, auto-apply precision `1.000`, experience record F1 `0.975`, and education record F1 `1.000`, with honest mixed-manifest reporting across `019-local-v1` and `019-python-sidecar-v1`. The text canary plus Ebrar, Aaron Murphy, Paul Asselin, and Ryan Holstien all pass under the current policy.
- The same final cleanup round also re-ran scripted desktop import evidence for both the committed TXT canary (`apps/desktop/test-artifacts/ui/qa-final-resume-import-fixture/`) and a hard PDF checkpoint (`apps/desktop/test-artifacts/ui/qa-final-resume-import-pdf/`), both landing in `extractionStatus: "ready"` with expected review-first behavior preserved for headline/summary.
- The latest 2026-04-15 follow-up also closes the remaining non-atomic success-path persistence gap: when an import completes successfully, canonical profile/search-preference updates and retained run artifacts now commit together through one repository operation instead of separate writes.
- The same 2026-04-15 hardening follow-up also gives every persisted import run a fresh stored bundle id, including refresh runs that rebuild a bundle from the current stored resume text, so retained import-bundle history no longer gets overwritten by later runs that share the same source resume.
- The next implementation focus should stay on parser-quality, routing, and packaging improvements guided by the benchmark output, but the main remaining release risk is now cross-platform packaged-sidecar validation: the intended local sidecar path is working on this host, yet installer-ready proof is still needed on `win32-x64`, `darwin-arm64`, `darwin-x64`, and `linux-x64` before release packaging is complete.

## Scope

### In Scope

- parser-executor architecture for local document decoding
- richer canonical resume document IR with geometry and provenance
- parser bakeoff and benchmark harness
- per-page and per-document routing policy
- deterministic extraction plus stage-scoped `M2.5` extraction over structured blocks
- composite confidence and abstention policy
- cross-platform sidecar packaging, model distribution, and operational constraints
- minimal snapshot or desktop status widening needed to expose route, parser quality, and honest import results

### Out Of Scope

- full `012` guided-review UI implementation
- `014` resume renderer or ATS formatting work
- `015` apply automation
- remote parser workers, hosted OCR, or paid fallback services
- making a premium resume API the main import path
- broad privacy or compliance policy work beyond what is needed for the local-first slice

## Current Starting Points In Repo

### Import entrypoints and shell wiring

- `apps/desktop/src/main/services/job-finder/import-resume.ts`
- `apps/desktop/src/main/adapters/resume-document.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/main/routes/job-finder.ts`
- `apps/desktop/src/renderer/src/features/job-finder/components/profile/profile-resume-panel.tsx`

### Current import orchestration and review substrate

- `packages/job-finder/src/internal/resume-import-workflow.ts`
- `packages/job-finder/src/internal/workspace-snapshot-profile-methods.ts`
- `packages/job-finder/src/internal/profile-merge.ts`

### Current AI boundaries

- `packages/ai-providers/src/resume-import.ts`
- `packages/ai-providers/src/openai-compatible-resume-import.ts`
- `packages/ai-providers/src/deterministic/client.ts`

### Current contracts and persistence

- `packages/contracts/src/resume-import.ts`
- `packages/contracts/src/workspace.ts`
- `packages/db/src/internal/migrations.ts`
- `packages/db/src/file-repository.ts`

## Recommended Architecture

### 1. One Pipeline, Multiple Local Executors

The import pipeline should stay TypeScript-owned and contract-driven, with pluggable local parser executors behind the desktop adapter.

Recommended executor kinds:

- `local_pdf_text_probe`
- `local_pdf_layout`
- `local_docx`
- `local_ocr_layout`

Implementation rule:

- all local executors must return the same canonical IR shape so the rest of the workflow does not fork into separate product paths

### 2. Local Parser Sidecar First

The default local parser path should move heavy document decoding into a local Python sidecar invoked from Electron.

Recommended local stack:

- born-digital PDF text probe: `pypdf`
- born-digital PDF layout and coordinate recovery: `pdfplumber`
- scanned PDF and image-like pages: `PaddleOCR` with `PP-Structure`
- DOCX: `python-docx`
- fallback OCR only: `Tesseract`
- `mammoth` retained only as a fallback bridge during transition
- `docTR` kept as a near-term bakeoff candidate for hard scanned pages, not the default first ship

Implementation rules:

- keep the parser worker narrowly focused on document decoding, OCR, layout recovery, and block extraction
- keep orchestration, reconciliation, and canonical merge policy in TypeScript
- prefer a local subprocess or sidecar over a localhost service for the default desktop path
- use a CPU-only worker in the first shipped slice
- do not bet the whole importer on a single OCR engine; keep at least one alternate local OCR path for uncertain blocks during the bakeoff

### 2A. Page Triage, Preprocessing, And Hybrid Fusion

The largest remaining quality gains are likely to come from routing and targeted repair, not just swapping one parser library for another.

Recommended page or region triage outcomes:

- `native_first`
- `ocr_first`
- `hybrid_compare`

Recommended triage signals:

- PDF text object count and text density
- image coverage ratio
- invalid Unicode ratio or copy-paste coherence
- glyph diversity and suspicious repeated-symbol patterns
- page rotation or skew estimate
- column or sidebar likelihood
- parser disagreement on cheap probe passes

Recommended selective preprocessing steps:

- orientation detection and rotation
- deskew for scanned pages
- border or shadow crop
- contrast normalization
- light denoise
- adaptive binarization only when scan quality is poor
- OCR crop DPI normalization for uncertain blocks

Implementation rules:

- do not OCR entire documents by default when a healthy native text layer exists
- preprocess selectively, not as a blanket transform on every page
- when a page has both usable native text and suspicious regions, allow hybrid fusion instead of forcing a single winner for the whole page

### 3. Cross-Platform Packaging And Model Distribution

The local parser stack should be shipped in a way that is supportable across the desktop platforms we ship and does not depend on system-installed runtimes.

Recommended packaging direction:

- Electron main spawns a local parser sidecar over `stdin` or `stdout` JSON messages
- build the parser worker as a one-folder frozen distribution rather than a self-extracting one-file bundle
- ship parser binaries and model files under app resources instead of inside `asar`
- version model packs separately from code with a manifest and hashes
- sign the desktop binaries and parser worker

Implementation rules:

- do not depend on user-installed Python
- do not make the worker a localhost HTTP service in the first slice
- optimize for installer reliability and CPU-only portability before worrying about GPU acceleration

### 4. Rich Canonical IR (`ResumeDocumentBundle` v2)

The current bundle should be widened so it can preserve structure well enough for both deterministic extraction and review evidence.

Recommended added concepts:

- parser executor kind and parser version
- page-level text density and OCR confidence
- block bounding boxes and source parser lineage
- optional span or line references within blocks
- reading-order confidence
- document-level and page-level quality warnings
- route provenance showing whether a page came from local text probe, local layout extraction, OCR, or alternate local parser

Implementation rule:

- the canonical IR is the source of truth for evidence, review, and benchmark replay; the final profile remains downstream of it

### 5. Routing Policy And Per-Page Fallback

Resume pages should route based on actual document quality signals rather than one parser path per file extension.

Recommended routing signals:

- file kind
- page count
- extracted text density
- scanned-page likelihood
- copy-paste or Unicode coherence from the native text layer
- PDF text object count and image coverage ratio
- suspicious token-shape rates from the first probe pass
- repeated header or footer noise
- multi-column or sidebar likelihood
- parser confidence and warnings from the first pass

Recommended route order:

1. easy DOCX -> local DOCX parser
2. likely born-digital PDF -> local PDF text probe
3. low-text or image-heavy pages -> local OCR/layout parser
4. pages with weak ordering or geometry -> local PDF layout parser
5. uncertain blocks or suspicious fields -> targeted repair pass with alternate OCR or alternate local parser when justified
6. pages still below threshold -> abstain and leave stronger review evidence instead of hidden guessing

Implementation rule:

- routing must be page-aware where possible so one bad scanned page does not force the whole document into the heaviest local path

### 5A. Reading Order, Section Detection, And Targeted Repair

The importer should treat wrong reading order and wrong section boundaries as first-class failure modes rather than incidental parser bugs.

Recommended core additions:

- reconstruct reading order from geometry, column segmentation, indentation, and gap analysis instead of trusting raw extractor order
- detect sections from typography, spacing, alignment, and heading lexicons before field extraction begins
- attach wrapped bullet continuations and date or location satellites before experience extraction
- run targeted repair passes only on uncertain blocks or fields such as contact lines, date ranges, company or title headers, and broken bullet groups
- allow selective ensemble comparison for uncertain spans, such as native text vs OCR, or `PaddleOCR` vs `Tesseract` or `docTR`, instead of running every engine on every page

Implementation rule:

- targeted repair and selective ensemble logic should be exception paths for uncertain spans, not the normal path for every document

### 6. Deterministic Extraction Before LLM Extraction

Keep deterministic extraction first, but narrow it to fields where literal evidence is strong.

Expected deterministic targets:

- email
- phone
- public links
- raw location lines
- explicit dates
- degree strings
- certification names
- spoken language lines

Implementation rule:

- deterministic extraction still writes candidates, evidence, and confidence through the same candidate layer; it does not bypass the audit path

### 7. Section-Scoped `M2.5` Extraction Over Structured Blocks

The LLM should receive structured blocks from the richer IR, not flattened text blobs whenever a narrower context exists.

Recommended stage set:

- `classify_resume_structure`
- `extract_identity_summary`
- `extract_experience_records`
- `extract_education_background`
- `extract_shared_memory`
- `reconcile_resume_candidates`

Implementation rules:

- stage prompts must include block ids, page numbers, and section hints
- the model may assemble and label records, but it should not be asked to guess layout or OCR truth that the parser layer failed to recover

### 8. Composite Confidence And Abstention

The importer should move from single-value confidence thresholds to a structured confidence model.

Recommended confidence inputs:

- parser quality
- OCR confidence
- evidence quality
- cross-parser agreement
- cross-stage agreement
- normalization risk
- conflict with existing confirmed profile data
- field sensitivity policy

Recommended final resolutions:

- `auto_apply`
- `needs_review`
- `abstain`

Implementation rule:

- prefer abstention over clever guessing, especially for experience assembly and sensitive user facts

### 9. Benchmark Corpus And Regression Harness

Quality should be measured against a retained corpus before and after parser or prompt changes.

Required fixture classes:

- born-digital PDF
- scanned PDF
- DOCX
- multi-column resumes
- resumes with sidebars or creative layouts
- academic CVs
- international or multilingual resumes
- low-quality image-derived PDFs

Required process assets:

- a small pinned canary set for fast local replay before broader corpus runs
- a stable importer error taxonomy such as `READING_ORDER`, `SECTION_BOUNDARY`, `FIELD_MISATTRIBUTION`, `DATE_RANGE`, `ORG_TITLE_SWAP`, `OCR_NOISE`, `MISSING_EVIDENCE`, and `OVERCONFIDENT_AUTO_APPLY`
- a parser manifest that pins worker version, OCR model pack version, prompt or reconciliation version, and benchmark baseline version
- captured user-correction lineage for later triage into reviewed regressions

Required measurements:

- field exact match for literal fields
- record-level F1 for experience and education
- evidence attachment rate
- auto-apply precision
- unresolved rate by document class
- import latency by route
- CPU runtime and memory profile on target desktop hardware

Implementation rule:

- no major parser-routing change should land without replay against the retained corpus
- no importer bug fix is complete until it adds or updates at least one regression fixture or reviewed correction example
- user corrections should not automatically become gold data; reviewed or sanitized equivalents should be promoted deliberately into the benchmark set

## Field Policy

### Auto-apply candidates only when extremely safe

- email
- phone
- public profile links
- explicit degree strings
- explicit certification names
- explicit spoken languages
- raw dates when direct evidence is strong and no conflict exists

### Review by default

- experience record assembly
- project extraction
- skill normalization and grouping
- summary and headline candidates
- proof-bank suggestions
- answer-bank suggestions
- application identity defaults beyond direct copied contact details

### Never infer if absent

- work authorization
- sponsorship need
- relocation willingness
- travel willingness
- notice period
- availability
- salary expectations

## Package Ownership Recommendation

- `packages/contracts`: widened IR, parser-route provenance, confidence breakdown, worker version metadata, and benchmark result contracts
- `packages/db`: migration-safe persistence for widened bundles, route metadata, benchmark artifacts, and local parser telemetry
- `packages/job-finder`: routing policy, deterministic extraction, reconciliation, accepted patch application, and snapshot exposure
- `packages/ai-providers`: stage-specific extraction and reconciliation contracts plus deterministic parity, but not product-level routing or merge policy
- `apps/desktop/src/main`: local parser sidecar orchestration, packaging-aware worker lifecycle, and file-ingest executor selection
- `apps/desktop/src/renderer`: honest import-status and review summary widening only where needed for this slice

## Recommended Implementation Sequence

The lowest-risk landing order is:

1. freeze a benchmark corpus and scoring harness
2. add the parser-executor seam and sidecar protocol without changing downstream merge policy yet
3. add per-page triage, selective preprocessing, and routing signals before deeper semantic changes
4. run the parser bakeoff and choose the default local stack with evidence
5. land cross-platform packaging and model-distribution decisions for the local worker
6. widen the canonical IR and persist route provenance plus parser-quality signals
7. rebuild routing, reading-order recovery, section detection, and composite confidence on top of the chosen parser stack
8. narrow the LLM to structured-block extraction and reconciliation over the richer IR
9. expose review-ready unresolved output cleanly to `012`

Implementation rule:

- do not reopen server or paid fallback discussion until the local benchmark and local packaging path are proven and the remaining failure modes are measured

## Milestones

### Milestone 0: Benchmark corpus and scoring harness

Goal: stop judging import quality by anecdotes.

Implementation work:

- create a seeded corpus with gold annotations for key fields and records
- add scoring for literal-field precision, record-level F1, evidence coverage, and unresolved rates
- freeze a small canary set for faster local replay during iteration
- add an importer error taxonomy so failures are grouped by actual failure mode instead of one flat bucket
- freeze the current importer as the baseline to beat

Exit criteria:

- parser and extraction changes can be compared against a saved baseline on the same documents

### Milestone 1: Executor seam and local sidecar

Goal: separate parser execution from import policy.

Implementation work:

- add a typed parser request and response contract
- implement a local parser sidecar subprocess for document decoding
- keep the current desktop adapter as the orchestrator over executor selection
- define the worker protocol around structured page, block, and quality signals rather than flat text only
- add the first page-triage and selective-preprocessing hooks to the worker contract so later routing does not require another protocol reshape

Exit criteria:

- local document parsing can happen through the sidecar without changing the downstream import-run shape

### Milestone 2: Parser bakeoff and local stack selection

Goal: choose the local parser stack with evidence, not intuition.

Implementation work:

- compare current `pdfjs` extraction against `pdfplumber`
- compare a fast native-PDF probe path against a richer layout-aware PDF path
- compare current DOCX path against `python-docx`
- compare OCR-quality results for `PaddleOCR/PP-Structure` and fallback OCR only
- compare `docTR` selectively on hard scanned or image-heavy pages
- evaluate `Docling` as a candidate alternate parser, but do not lock it unless license and runtime audit pass cleanly

Exit criteria:

- the repo has a documented default local parser stack and evidence for why it won the bakeoff

### Milestone 3: Windows packaging and local operational hardening

Goal: make the local parser worker shippable, supportable, and reliable on Windows.

Implementation work:

- choose the local worker packaging strategy and document why it won
- bundle parser binaries and model assets in a packaging-safe layout
- add version checks and worker health checks
- capture worker startup, timeout, and failure behavior for QA

Exit criteria:

- the parser worker can be launched locally without depending on system runtimes or ad hoc developer setup

### Milestone 4: IR v2 and route provenance

Goal: preserve enough structure that later extraction and review are grounded in better evidence.

Implementation work:

- widen `ResumeDocumentBundle`
- persist page quality, parser lineage, and route provenance
- attach richer block geometry and confidence where available

Exit criteria:

- accepted and unresolved candidates can point back to richer evidence than flattened line text

### Milestone 5: Composite confidence and structured extraction

Goal: make acceptance and review decisions trustworthy.

Implementation work:

- add confidence-breakdown logic
- tighten deterministic extraction to safe literal fields
- refit stage selection and prompts around the richer IR
- add reading-order recovery, section detection, and targeted repair passes where uncertainty is high
- add abstention paths where ambiguity remains high

Exit criteria:

- hard documents produce better unresolved candidates instead of bad auto-applies

### Milestone 6: Handoff to setup and QA hardening

Goal: leave the next product layers a clean substrate.

Implementation work:

- expose stronger unresolved summaries to workspace snapshots
- update desktop QA harnesses to capture route, parser, and candidate evidence
- document release rules and benchmark expectations
- capture reviewed user corrections with import-run lineage so they can feed later regression triage

Exit criteria:

- `012` can build guided review on top of materially stronger candidates and evidence instead of parser clean-up work

## Verification Expectations

Implementation work for this plan should be validated with at least:

- parser-side unit tests for request or response normalization
- benchmark harness runs across the retained corpus
- `pnpm --filter @unemployed/contracts test`
- `pnpm --filter @unemployed/db test`
- `pnpm --filter @unemployed/job-finder test`
- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop ui:resume-import`
- `pnpm docs:check`

Additional completion rules:

- prove the new local parser stack beats the current baseline on at least one born-digital PDF, one scanned PDF, one DOCX, and one multi-column resume class
- prove that accepted-field precision improved or stayed flat while unresolved-candidate quality improved on the hard cases
- prove that the local-only route still handles the difficult tail better than the current baseline even when no server or paid fallback exists
- prove that the canary set remains free of critical regressions before broader importer changes are considered ready

## Cost Guardrails

The architecture must be able to operate under the following default economic policy:

- target normal blended import cost: effectively free beyond the user's own hardware and existing self-hosted `M2.5`
- target shipped first slice: zero required parser or OCR service spend
- accept some installer-size and local CPU-cost tradeoff if it materially improves extraction quality
- if later remote fallback is reconsidered, keep the existing user budget target of far below `$5` per user and below roughly `$5-$10` per user without an explicit override

Implementation rules:

- do not let the first strong importer depend on any hosted parser or OCR service
- record enough local performance and failure telemetry that later remote-fallback decisions can be made from evidence rather than guesswork
- prefer adding routing, preprocessing, and targeted repair intelligence before adding broader model or parser complexity

## Paying Things And Approximate Costs

All figures below are planning estimates and are included only for future research reference. They are not part of the current local-only execution slice.

### Required to ship the first strong version

- none beyond your own existing self-hosted `M2.5` setup

### Optional later, if local-only eventually proves insufficient

- small CPU-only parser worker or container for low-volume remote fallback: roughly `$10-$40` per month depending on provider and uptime policy
- medium CPU worker for more frequent OCR or concurrent traffic: roughly `$25-$80` per month
- burst GPU capacity for heavier OCR only if the CPU path becomes too slow: often far more expensive and should stay optional until real volume proves it is needed

Recommended planning assumption:

- ignore this lane for the first execution slice; revisit only if benchmark data shows the local ceiling is still too low

### Optional later managed OCR or layout references

- Google Document AI Enterprise Document OCR: about `$1.50` per `1,000` pages for the first `5,000,000` pages, then about `$0.60` per `1,000` pages after that
- Google Document AI Layout Parser: about `$10` per `1,000` pages
- AWS Textract Detect Document Text: about `$0.0015` per page for the first `1,000,000` pages, then about `$0.0006` per page after that

Implication for a typical `3`-page resume:

- Google OCR only: about `$0.0045` per resume
- Google Layout Parser on all `3` pages: about `$0.03` per resume
- AWS OCR only: about `$0.0045` per resume

That means a cheap OCR/layout fallback lane could stay far below the user's allowed cost ceiling if it is ever revisited later for the hard-document tail.

### Managed services that are likely too expensive to be the default path

- AWS Textract tables/forms features are much more expensive than plain OCR and should not be the default resume-import fallback
- LlamaParse pricing is credit-based, with `1,000` credits equal to about `$1.25`, free `10K` credits on the free plan, and paid plans starting around `$50` per month; this is worth benchmarking, but not necessary for the first recommended path
- premium resume-specific APIs such as Affinda, Textkernel, DaXtra, Sovren, or RChilli should be treated as later benchmark candidates only if the cheaper OCR-plus-LLM architecture still misses the product bar

## Not In This Slice

- full `012` guided setup review UX
- resume rendering or formatting work from `014`
- apply automation from `015`
- remote parser workers, hosted OCR, or paid fallback services
- privacy-policy or enterprise-compliance work beyond the minimum needed for the local-first slice

## Follow-On After This Plan

Only after this plan lands should the queue expect:

- `012` to build guided low-confidence review on top of stronger parser evidence and better unresolved candidates
- `014` to rely on imported proof and experience data with a meaningfully higher trust bar
- `015` to reuse imported identity and answer defaults with less downstream validation debt
- any new discussion of server or paid fallback to happen from benchmark evidence, not as a substitute for the local-only parser quality pass
