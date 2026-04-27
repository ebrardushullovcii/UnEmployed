Status: ready

Verify each finding against the current code and only fix it if needed.

In `@apps/desktop/scripts/capture-source-sign-in-prompts.mjs` around lines 1 - 2,
The ESLint errors indicate the global window identifier is missing; update the
file-level globals comment (the existing /_ global document, HTMLElement _/
declaration at the top of capture-source-sign-in-prompts.mjs) to include window
as well so ESLint recognizes window as a defined global and the `'window' is not
defined` errors at lines referencing window are resolved.

Verify each finding against the current code and only fix it if needed.

Inline comments:
In `@apps/desktop/scripts/capture-resume-workspace.mjs`:

- Around line 277-290: The functions templateFamilySection and
  clickLocatorViaDom contain dead/unused parts: remove or wire them through. For
  templateFamilySection, either delete the unused function or replace all callers
  that should use it (e.g., where clickButtonInFamilySection is used) to call
  templateFamilySection if that was the intended helper; ensure the codebase
  consistently uses one family-section helper name (templateFamilySection or
  clickButtonInFamilySection) and update references accordingly. For
  clickLocatorViaDom, either remove the unused description parameter from the
  signature and all calls, or consume it inside clickLocatorViaDom (e.g., include
  description in a timeout/error message when locator.waitFor fails or in a debug
  log) so the passed strings like "recommended engineering spec template button"
  are actually used; update call sites to match the new signature if you change
  it.
- Around line 241-251: The ESLint false-positives come from scripts under
  apps/desktop/scripts using browser globals inside the window.evaluate callbacks
  (e.g., getActiveEditorLabel -> window.evaluate using document, HTMLElement,
  HTMLButtonElement); update eslint.config.mjs to add browser globals for that
  file pattern by extending the apps/desktop/scripts/** (and scripts/**)
  languageOptions.globals to include ...globals.browser alongside ...globals.node
  so those DOM globals are recognized during linting.

In `@apps/desktop/src/main/routes/job-finder.ts`:

- Around line 344-357: The handler for "job-finder:test-set-resume-preview-mode"
  currently coerces any payload to "ok"; replace that coercion with explicit
  schema validation: import or define a Zod enum schema (e.g.,
  JobFinderResumePreviewModeSchema = z.enum(["ok","fail_once"]) or reuse the
  exported JobFinderResumePreviewModeSchema from `@unemployed/contracts`), call
  JobFinderResumePreviewModeSchema.parse(payload) inside the ipcMain.handle
  callback to get a typed mode, and pass that parsed mode into
  setJobFinderWorkspaceServiceTestEnv; this ensures invalid payloads throw and
  match the other handlers' .parse(payload) pattern.

In `@apps/desktop/src/main/services/job-finder/resume-quality-benchmark.ts`:

- Around line 1057-1077: The createResumeDraft implementation fabricates a
  SavedJob (using SavedJobSchema.parse and id: validatedJob.sourceJobId) which can
  collide with seeded fixture jobs; instead, pass the original validated
  JobPosting to fixture.overrideDraft and stop synthesizing
  id/status/matchAssessment/provenance. Change createResumeDraft to call
  fixture.overrideDraft({ baseDraft, job: validatedJob }) and update
  fixture.overrideDraft's parameter/type to accept a JobPosting (or loosen to the
  fields it reads: title, company, atsProvider, responsibilities) rather than
  requiring a SavedJobSchema, removing the SavedJobSchema.parse(...) and the id
  assignment from this code path.
- Around line 1218-1224: The benchmark currently calls
  createJobFinderWorkspaceService(...) inside the inner loop, recreating
  everything per (fixture, template) run; to reduce cost, move creation of
  long-lived, reusable pieces (createInMemoryJobFinderRepository and
  createCatalogBrowserSessionRuntime) out of the per-template loop so they are
  instantiated once per fixture and reused across templates, while still creating
  a fresh AI client/state and calling createJobFinderWorkspaceService or a
  lightweight factory that accepts the reused repository/browserRuntime plus the
  template-specific aiClient/templateId before each generateResume run; ensure the
  per-iteration try/finally still shuts down only the per-template resources
  (aiClient and workspace-level ephemeral state) and that the reused
  repository/browserRuntime are torn down after all templates for that fixture
  complete.
- Around line 1189-1196: The temp directory created by mkdtemp (tempRoot) can
  leak if templates is empty because mkdtemp is called before the early-throw;
  move the empty-template validation so it runs before calling mkdtemp, or
  alternatively wrap the mkdtemp + subsequent logic inside the existing
  try/finally so rm(tempRoot, …) always runs; update the function where tempRoot
  and mkdtemp are used (resume-quality-benchmark, variables tempRoot and templates
  and the call to selectBenchmarkTemplateIds) to ensure the templates.length check
  happens prior to mkdtemp or that mkdtemp is inside the try block guarded by the
  finally that removes tempRoot.
- Around line 1255-1281: Sanitize and guarantee non-empty notes before pushing
  results: when building notes in the results.push block, only include the
  template note if asset.templateName?.trim().length > 0 (use trimmed value for
  the template string) and replace spreading asset.notes with a sanitized array
  like (asset.notes ?? []).map(n => typeof n === 'string' ? n.trim() :
  '').filter(s => s.length > 0) so every element satisfies the
  NonEmptyStringSchema; this ensures the schema parse that validates notes will
  not throw.

In
`@apps/desktop/src/renderer/src/features/job-finder/components/resume-theme-picker.test.tsx`:

- Around line 130-149: The test sets globalScope.IS_REACT_ACT_ENVIRONMENT = true
  at module-evaluation time which leaks into other suites; change this to set and
  restore the flag inside a beforeAll/afterAll pair so it's only true for this
  suite: in resume-theme-picker.test.tsx import beforeAll and afterAll from
  vitest, call beforeAll(() => { globalScope.IS_REACT_ACT_ENVIRONMENT = true })
  and in afterAll restore the previous value (save it before setting) or delete
  the property, leaving the existing afterEach teardown
  (root/container/vi.clearAllMocks) unchanged; reference the globalScope variable
  and the IS_REACT_ACT_ENVIRONMENT symbol when making the change.

In
`@apps/desktop/src/renderer/src/features/job-finder/components/resume-theme-picker.tsx`:

- Around line 304-308: selectedFamilyId is computed but never scrolled into view
  when selectedThemeId changes; add logic in the ResumeThemePicker component to
  scroll the corresponding family <section> into view. Create a ref map (e.g.,
  familySectionRefs using useRef<Record<string, HTMLElement | null>>()) and assign
  each family's section element to familySectionRefs[family.id], then add a
  useEffect that watches selectedThemeId (or selectedFamilyId) and when it changes
  calls familySectionRefs[selectedFamilyId]?.scrollIntoView({ block: 'nearest' }).
  Ensure you reference selectedFamilyId, selectedTemplate,
  getResumeTemplateFamilyId and familySelected when locating the correct section
  to attach the ref and trigger the scroll.
- Around line 309-314: The shortlist compare pane currently computes
  visibleComparedThemes from filteredThemes, causing compared items (tracked by
  comparedThemeIds and seeded from selectedThemeId) to disappear when
  lane/density/recommended filters narrow results; change visibleComparedThemes to
  derive from the full unfiltered themes array (not filteredThemes) so shortlisted
  variants always remain visible regardless of active filters, and additionally
  compute a hidden count (e.g., hiddenComparedCount = comparedThemeIds.length -
  filteredThemes.filter(t => comparedThemeIds.includes(t.id)).length) if you want
  to show a "N shortlisted variants hidden by current filters" hint in the UI.
- Around line 235-258: The current mapping sorts [...templates] twice to obtain
  firstTemplate and again for templates, then performs an outer sort by
  templates[0]?.sortOrder which is redundant and unstable when two families share
  the same sortOrder; fix by sorting each family's templates once (store as
  sortedTemplates), compute a stable family-level key such as familySortOrder =
  sortedTemplates[0]?.sortOrder ?? Number.MAX_SAFE_INTEGER and familyId =
  getResumeTemplateFamilyId(firstTemplate), return templates: sortedTemplates, and
  finally sort the families array by (familySortOrder, familyId) as a tie-breaker
  so ordering is deterministic across re-renders; update references to templates,
  firstTemplate, getResumeTemplateFamilyId, and getResumeTemplateFamilyLabel
  accordingly.
- Around line 476-484: The inline radial-gradient in resume-theme-picker.tsx
  (the iframe wrapper class
  bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.95),rgba(226,232,240,0.92))])
  hardcodes colors and bypasses design tokens; replace it by defining a CSS custom
  property (e.g., --resume-preview-frame) in globals.css that composes existing
  tokens like --surface-panel / --surface-overlay-subtle / --surface-panel-border
  and supports dark mode, then reference that property from the element’s Tailwind
  class (update the div/iframe wrapper class to use the custom property, e.g.,
  bg-[var(--resume-preview-frame)] or bg-(--resume-preview-frame)); ensure
  renderResumeTemplateCatalogPreviewHtml usage remains unchanged and test the
  preview in both light and dark themes.

In
`@apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/resume-section-editor.tsx`:

- Around line 41-61: The selection useEffect in resume-section-editor.tsx is
  forcing focus to the first control (firstControl?.focus) even when the user
  clicked inside the same target, which steals caret; modify the effect (the
  useEffect that uses props.isSelected, props.selectedEntryId, entryRefs.current
  and sectionRef.current) to first check whether document.activeElement is already
  a descendant of the computed target (e.g.
  target.contains(document.activeElement)) and only call firstControl?.focus({
  preventScroll: true }) when that check is false; still call
  target.scrollIntoView({ block: "nearest" }) regardless so preview-driven
  selection continues to scroll.

In
`@apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/resume-studio-preview-pane.tsx`:

- Around line 145-163: The warning branch in the className ternary (inside the
  map over props.preview.warnings in resume-studio-preview-pane.tsx) uses
  hard-coded amber Tailwind classes; replace those with the design-system CSS
  custom properties --warning-border, --warning-surface and --warning-text so
  theming works correctly. Concretely, update the branch that currently returns
  'border-amber-500/20 bg-amber-500/10 text-amber-200' to use equivalent classes
  that reference the CSS vars (e.g., border set to var(--warning-border),
  background to var(--warning-surface) and text color to var(--warning-text))
  while keeping the same surrounding cn invocation, class concatenation, and
  key/markup for each warning.
- Around line 48-95: The effect currently reads frameRef.current.contentDocument
  synchronously causing a race with <iframe srcDoc=...> parsing; modify the
  useEffect so it waits for the iframe's load event before calling selectTargets
  and adding the click handler: get the frame element from frameRef.current,
  attach a strongly-typed load listener that grabs frame.contentDocument, runs
  selectTargets (which should query the loaded document) and adds
  document.addEventListener('click', handleClick) where handleClick still uses
  parseSelectionTarget and props.onSelectTarget; on cleanup remove both the load
  listener from the iframe and the click listener from the loaded document (store
  the loaded document in a local variable or ref so you can remove the exact
  listener), and keep deps as [props.onSelectTarget, props.preview,
  props.selectedEntryId, props.selectedSectionId] without any `as any` casts.

In
`@apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/resume-workspace-screen.test.tsx`:

- Around line 154-196: The test currently captures originalScrollIntoView as a
  wrapper that calls HTMLElement.prototype.scrollIntoView, then in afterEach sets
  HTMLElement.prototype.scrollIntoView to another wrapper, creating an indirection
  chain across suites; instead capture the real original method once by assigning
  a constant to HTMLElement.prototype.scrollIntoView (e.g. originalScrollIntoView
  = HTMLElement.prototype.scrollIntoView) and in afterEach restore the prototype
  by directly setting HTMLElement.prototype.scrollIntoView =
  originalScrollIntoView; update the beforeEach/afterEach that stub and restore
  scrollIntoView (and keep the ResizeObserver stubbing logic) so the prototype is
  restored to the genuine original, not a wrapper.

In
`@apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/resume-workspace-screen.tsx`:

- Around line 255-292: The debounce effect may allow an old preview response to
  win because previewRequestRef.current is only incremented inside refreshPreview;
  change the effect so it invalidates in-flight previews immediately by
  incrementing previewRequestRef.current (e.g., previewRequestRef.current += 1)
  before scheduling the setTimeout (and again when clearing the
  workspace/unsetting draft) so any outstanding promises returned by
  props.onPreviewDraft no longer match; ensure this logic references
  previewRequestRef, refreshPreview, draft, hasUnsavedChanges, and the cleanup
  path that clears the workspace so setPreview/setPreviewStatus cannot be called
  with stale results.

In
`@apps/desktop/src/renderer/src/features/job-finder/screens/settings/settings-editable-defaults.test.tsx`:

- Around line 126-145: The second resume template fixture in
  settings-editable-defaults.test.tsx is missing the optional
  ResumeTemplateDefinition fields fitSummary and avoidSummary which all other
  fixtures include; update the second fixture object (the one with id
  'classic_ats') to add fitSummary and avoidSummary properties (strings or empty
  strings as used in other tests) so the fixture shape matches
  ResumeTemplateDefinition and stays consistent with resume-theme-picker.test.tsx,
  resume-workspace-editor-panel.test.tsx, and resume-workspace-screen.test.tsx.

In `@apps/desktop/src/shared/job-finder-resume-catalog.ts`:

- Around line 180-196: Remove the unreachable fallback and magic-string
  fallback: in getLocalResumeTemplateDefinition replace the ternary chain that
  falls back to resumeTemplates[1]! with a direct non-null asserted first element
  (resumeTemplates[0]!) and in getDefaultApplySafeResumeTemplateId drop the ??
  'classic_ats' magic string and instead use resumeTemplates[0]!.id as the final
  fallback; update uses of resumeTemplates in both functions
  (getLocalResumeTemplateDefinition and getDefaultApplySafeResumeTemplateId) to
  rely on the non-null assertion of resumeTemplates[0] to satisfy the type checker
  rather than silencing it with dead branches.
- Around line 12-157: The desktop exposes presentation labels in resumeTemplates
  (see job-finder-resume-catalog.ts) that flow via listLocalResumeTemplates() →
  createLocalJobFinderDocumentManager() → documentManager.listResumeTemplates(),
  but workspace-service tests in workspace-service.test-runtimes.ts return old
  labels (e.g., "Classic ATS"); fix by aligning the test runtime mock to return
  the desktop presentation-style labels (e.g., "Swiss Minimal - Standard",
  "Executive Brief - Dense", etc.) or, better, extract and export a shared
  label/enum from `@unemployed/contracts` and import it into both
  job-finder-resume-catalog.ts and workspace-service.test-runtimes.ts so
  documentManager.listResumeTemplates() uses the same label definitions across
  desktop and workspace-service.

In `@packages/contracts/src/resume-workspace-contracts.test.ts`:

- Around line 277-338: The YAML/JSON fixture passed to
  ResumeQualityBenchmarkReportSchema.parse has misaligned indentation for the
  templates property (the "templates" key and its array entries are indented two
  spaces deeper than sibling keys like benchmarkVersion,
  persistedArtifactsDirectory, and cases); fix by aligning the "templates" key and
  its array elements to the same indentation level as those siblings in the object
  literal so the templates array is flush with
  benchmarkVersion/persistedArtifactsDirectory/cases, leaving
  ResumeQualityBenchmarkReportSchema.parse and all other keys unchanged.
- Around line 340-402: The test title "parses enriched resume template metadata"
  is misleading because the assertion only checks workspace.draft.templateId;
  rename the test to something accurate (e.g., "parses draft templateId for
  template themes" or "parses draft.templateId") and keep the assertion targeting
  JobFinderResumeWorkspaceSchema.parse(...) and workspace.draft.templateId
  unchanged; also add the missing semicolons in the test block so punctuation is
  consistent (fix the lines around the expect and the closing object literals),
  and leave sharedProfile: {} as-is since JobFinderResumeWorkspaceSchema accepts a
  default empty object.

In `@packages/job-finder/src/internal/resume-workspace-structure.ts`:

- Around line 442-447: The function buildResumeRenderDocument currently ignores
  the options parameter; either remove ResumeRenderOptions and the options
  parameter, or wire it through so includePreviewAnchors controls whether
  per-section/entry anchors/ids are emitted. Specifically, update
  buildResumeRenderDocument to accept ResumeRenderOptions.includePreviewAnchors
  and, when true, add the id field (or anchor metadata) to each generated section
  and entry in the returned ResumeRenderDocument (or set a renderFlag on the
  document that downstream renderer reads); ensure all producers that call
  buildResumeRenderDocument (and the types for ResumeRenderDocument, sections, and
  entries) are updated to reflect the conditional presence of id/anchor metadata.

In `@packages/job-finder/src/internal/workspace-application-methods.ts`:

- Around line 179-188: Extract the template-eligibility check (the logic that
  uses ctx.documentManager.listResumeTemplates().find(...), checks
  draft.templateId and calls isResumeTemplateApplyEligible) into a shared helper
  (e.g., validateApplyTemplate(templateId, ctx, jobTitle) or similar) that throws
  the same error message when the template is not eligible, then replace the
  inline check in the current apply flow with a call to that helper and add a call
  to the helper at the start of approveApply() before executing any
  already-approved export so pre-existing approved resumes are re-validated;
  ensure both locations reuse the identical error text and reference
  draft.templateId and isResumeTemplateApplyEligible.

In `@packages/job-finder/src/internal/workspace-helpers.ts`:

- Around line 119-131: The fallback resolution for resume templates can pick a
  non-apply-safe or ineligible template: update the logic that computes
  fallbackTemplateId (currently using defaultApplySafeTemplate and
  availableResumeTemplates[0]) so that it searches availableResumeTemplates for
  the first template where getResumeTemplateDeliveryLane(template) ===
  "apply_safe" && isResumeTemplateApplyEligible(template) and uses its id; only if
  none exist, fallback to the hardcoded "classic_ats" (optionally assert in
  development if no apply_safe eligible template is found). Ensure this change
  keeps selectedTemplateAvailable semantics unchanged and makes
  normalizeJobFinderSettings idempotent by always persisting an apply_safe +
  eligible resumeTemplateId when possible.

In `@packages/job-finder/src/internal/workspace-service-contracts.ts`:

- Around line 200-217: The two benchmark harness stubs that declare they satisfy
  JobFinderDocumentManager have a mismatched renderResumeArtifact signature:
  renderResumeArtifact must accept a single input object including job, profile,
  renderDocument, templateId, settings and optional targetPath; update each
  stubbed implementation of renderResumeArtifact to take that full input parameter
  (matching the interface) and propagate or ignore fields as appropriate, keeping
  the return type as Promise<RenderedResumeArtifact> so the implementations
  conform to JobFinderDocumentManager and the new required templateId is accepted.

In `@packages/job-finder/src/workspace-service.core.resume-apply-scenarios.ts`:

- Around line 1729-1742: The test currently picks an export with
  resumeExportArtifacts.find(artifact => artifact.jobId === "job_ready") which can
  return the earlier classic_ats export; change the selection to explicitly target
  the export for the template you just saved/exported (e.g., filter by both jobId
  and templateId === "modern_split") so approvedExport is the
  modern_split/share-ready export; update the line that assigns approvedExport
  (and any related assertions) to use resumeExportArtifacts.find(artifact =>
  artifact.jobId === "job_ready" && artifact.templateId === "modern_split") so the
  test asserts approval behavior against the correct export, relying on
  workspaceService.getResumeWorkspace, saveResumeDraft, exportResumePdf, and
  approveResume.
- Line 671: Current assertion only checks preview.revisionKey isn't exactly
  `resume_preview_${workspace.draft.id}`; instead validate the key's shape by
  asserting it contains the draft id prefix and a non-empty unique suffix (e.g.,
  ensure preview.revisionKey startsWith `resume_preview_${workspace.draft.id}` and
  that the remainder after that prefix is non-empty or matches a regex for a
  hash/timestamp). Update the test around the preview variable
  (preview.revisionKey) to assert both the expected prefix including
  workspace.draft.id and that the suffix is present and/or matches a uniqueness
  pattern rather than comparing to a single constant string.

---

Duplicate comments:
In `@apps/desktop/src/main/services/job-finder/resume-quality-benchmark.ts`:

- Around line 1079-1093: The includesKeywordCoverage function currently uses
  substring matching and can false-positive on aliases (e.g., "sql" in "mysql");
  update includesKeywordCoverage to perform whole-token/phrase-aware matching
  instead of normalizedContent.includes(target) by either reusing the existing
  matchesWholePhrase helper from resume-workspace-helpers.ts or by compiling each
  normalized target into a word-boundary aware regex (escaping the target) and
  testing against normalizedContent; keep the same early-return when
  normalizedTargets is empty and ensure normalizedTargets are filtered and
  normalized as before.

In
`@apps/desktop/src/renderer/src/features/job-finder/components/resume-theme-picker.tsx`:

- Around line 427-571: The radiogroup wrapper (role="radiogroup") and each
  variant button (role="radio") lack roving tabindex and arrow-key navigation:
  make each radio button rendered in resume-theme-picker.tsx set
  tabIndex={selected ? 0 : -1}, maintain a flattened list of variant refs (e.g.,
  createRef/map keyed by theme.id) and implement an onKeyDown handler on each
  radio to handle ArrowUp/ArrowDown/ArrowLeft/ArrowRight by computing the next
  index in the flattened variants list, calling the existing onChange(themeId) to
  update selection and programmatically focusing the corresponding ref (do not use
  document.querySelector), and ensure focus movement works across families; keep
  other controls tabbable but ensure the radiogroup behaves as a single tab stop.

In
`@apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/resume-workspace-editor-panel.tsx`:

- Line 31: Replace the hard-coded resumeThemeLabelId constant with a
  React-generated unique id using useId(): import useId from React (or use `const
resumeThemeLabelId = useId()` inside the ResumeWorkspaceEditorPanel component)
  and use that id for the label `id` and the picker's `aria-labelledby` so each
  mounted panel instance gets a stable, SSR-safe unique id; ensure the change
  occurs where `resumeThemeLabelId` is declared and referenced in
  ResumeWorkspaceEditorPanel.

Verify each finding against the current code and only fix it if needed.

Inline comments:
In
`@apps/desktop/src/renderer/src/features/job-finder/components/profile/profile-background-sections.tsx`:

- Around line 48-49: Add the missing pending prop to each Button so the new
  Button API exposes the pending rail/ARIA state: in
  ProfileBackgroundSupportingDetailSection and ProfileBackgroundProofBankSection,
  update every Button that currently only forwards
  disabled={props.isProfileSetupPending} to also pass
  pending={props.isProfileSetupPending}; this includes the Add buttons for
  link/language/proof and each per-row Remove button referenced in the diff for
  functions/components ProfileBackgroundSupportingDetailSection and
  ProfileBackgroundProofBankSection (ensure every Button instance at the commented
  locations—around lines for Add at L70/L86/L249 and Remove at
  L153/L200/L287—receives pending={props.isProfileSetupPending} in addition to the
  existing disabled prop).

In
`@apps/desktop/src/renderer/src/features/job-finder/components/profile/profile-background-tab.tsx`:

- Around line 43-44: The four action Button instances in
  profile-background-tab.tsx currently only set disabled={isProfileSetupPending};
  update each to also forward pending={isProfileSetupPending} (same pattern used
  in profile-experience-tab.tsx) so the Button component receives both disabled
  and pending props and restores the aria-busy/pending rail; look for the Button
  usages that reference isProfileSetupPending and add
  pending={isProfileSetupPending} to each.

In
`@apps/desktop/src/renderer/src/features/job-finder/screens/discovery/discovery-filters-panel.tsx`:

- Around line 216-220: The current rendering in discovery-filters-panel.tsx
  lower-cases producer-supplied free text via
  primarySourceAccessPrompt.rerunLabel.toLowerCase(), which mangles proper
  nouns/acronyms; update the span that constructs the sentence (the JSX around
  primarySourceAccessPrompt.rerunLabel) to render the label verbatim (remove the
  .toLowerCase() call) so the UI displays the producer-provided casing unchanged
  (e.g., use `Then ${primarySourceAccessPrompt.rerunLabel}.` instead of
  lower-casing), preserving punctuation/spacing as needed.
- Around line 188-223: The primarySourceAccessPrompt CTA is being duplicated in
  multiple places when sourceAccessPrompts[0].targetId is included in
  enabledTargets; update the rendering logic so the primary card
  (primarySourceAccessPrompt block) is only shown when its target is NOT already
  enabled (i.e., primarySourceAccessPrompt.targetId is not in enabledTargets) or
  alternatively skip rendering the per-target card when targetPrompt ===
  primarySourceAccessPrompt; modify the condition around the
  primarySourceAccessPrompt render (and/or the per-target render where
  targetPrompt is used) to check
  enabledTargets/includes(primarySourceAccessPrompt.targetId) or a
  reference-equality check against targetPrompt before rendering, leaving
  onOpenBrowserSessionForTarget and isBrowserSessionPendingForTarget usage
  unchanged.
- Around line 127-133: The neutral-session detection is brittle because
  isNeutralBrowserSessionSnapshot checks browserSession.label === "Session status
  unavailable"; replace this fragile string check by either using a dedicated
  discriminator supplied by the producer (e.g., add and check
  browserSession.isNeutral or browserSession.kind in BrowserSessionStateSchema) or
  import and call a type guard exported from the producer (e.g.,
  isNeutralBrowserSession(browserSession)), and if neither is available fallback
  to the structural check only (browserSession.driver === "catalog_seed" &&
  browserSession.status === "unknown") and remove the label equality; update the
  browserSessionSnapshot assignment to rely on the new discriminator/type-guard
  instead of the literal label string and keep NEUTRAL_SESSION_SNAPSHOT behavior
  unchanged.

In
`@apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/resume-workspace-editor-panel.test.tsx`:

- Around line 147-218: Add a second test in
  resume-workspace-editor-panel.test.tsx that mounts ResumeWorkspaceEditorPanel
  with isWorkspacePending={true} (reuse container/root setup and
  availableResumeTemplates/draft fixtures) then query the same scrollRegion
  (container?.querySelector('.overflow-y-auto')) and assert that the radios inside
  it (scrollRegion?.querySelectorAll('[role="radio"]')) are disabled (check each
  element for disabled property or aria-disabled="true"); keep the same mock
  callbacks (onApplyPatch, onSelectEntry, etc.) and cleanup logic as the existing
  test so the new spec mirrors the non-pending case but validates the
  disabled-while-pending behavior.

In `@apps/desktop/src/shared/job-finder-resume-catalog.ts`:

- Around line 200-228: The current listLocalResumeTemplateFamilies uses
  primaryTemplate.familyDescription ?? primaryTemplate.fitSummary ??
  primaryTemplate.description which can surface a variant-specific fitSummary when
  the primary lacks familyDescription; change this to compute a family-level
  description across all templates in the family: search templates for the first
  non-empty familyDescription (e.g. templates.find(t =>
  t.familyDescription)?.familyDescription) and use that as the family description;
  only if no template in the family has a familyDescription then optionally fall
  back to a safe default (or omit fitSummary/description), and replace the
  existing description expression in listLocalResumeTemplateFamilies (currently
  using primaryTemplate) with this computed familyDescription variable.

In
`@docs/exec-plans/completed/023-job-finder-world-class-resume-generation-quality.md`:

- Line 17: Reword the awkward sentence that repeats “across” to improve
  readability: replace the existing line referencing the replayable benchmark
  command (pnpm --filter `@unemployed/desktop` benchmark:resume-quality) with a
  concise sentence such as “A replayable end-to-end benchmark is available at pnpm
  --filter `@unemployed/desktop` benchmark:resume-quality, exercising generation,
  sanitation, validation, and HTML rendering over a fixed corpus with 5 scenarios
  × 6 themes (30 cases) across all six ATS-safe templates.” Ensure the new
  sentence preserves the command, the tested stages (generation, sanitation,
  validation, HTML render), the fixed corpus, and the 5×6=30 case/count across the
  six templates.

In `@packages/ai-providers/src/deterministic/tailoring.ts`:

- Around line 58-68: The code computes a symmetric overlap via
  calculateQualityOverlap(left,right) but then calls it again as reverseOverlap
  and compares them, which is redundant; either make the metric asymmetric (if
  intent is "value contained in entry") by changing calculateQualityOverlap to
  divide by leftTokens.length (use leftTokens.length or
  Math.max(leftTokens.length,1) as the denominator) so
  calculateQualityOverlap(value, entry) != calculateQualityOverlap(entry, value),
  or remove the reverseOverlap call and the && reverseOverlap < 0.72 check
  entirely and only use overlap; update the call sites that reference
  reverseOverlap (the variable named reverseOverlap and its comparison block)
  accordingly.
- Around line 138-158: formatMonthYear contains two dead branches: the
  `.replace(/\./g, '')` and `?? ''` in the namedMonthMatch handling and the final
  regex test are unreachable. Fix by simplifying the namedMonthMatch handling in
  formatMonthYear: use namedMonthMatch[1].toLowerCase() (no optional chaining, no
  replace/??) when looking up monthByName and keep the existing month
  normalization logic, and remove the final /^([A-Z][a-z]{2})\s+(\d{4})$/ test
  entirely so the function falls through to `return null` when no pattern matches.

In `@packages/job-finder/src/internal/resume-import-candidate-utils.ts`:

- Around line 117-121: The code iterates candidates twice to build
  blockingReviewCandidates and optionalProofCandidates; refactor to a single-pass
  partition over candidates (e.g., using a for loop or reduce) that tests
  isBlockingReviewCandidate and isOptionalProofCandidate and pushes into two
  arrays, and while collecting blocking items also capture the first five labels
  into leadingLabels—update places referencing blockingReviewCandidates,
  optionalProofCandidates, leadingLabels (and the predicates
  isBlockingReviewCandidate/isOptionalProofCandidate) to use the new partitioned
  arrays.

In `@packages/job-finder/src/internal/resume-import-reconciliation.ts`:

- Around line 96-103: The isFreshStartProfile heuristic is too loose and can
  false-positive when id changed but placeholders remain; update
  isFreshStartProfile to require the firstName/lastName sentinel (firstName ===
  "New" && lastName === "Candidate") in addition to the existing
  fullName/headline/location placeholder checks (PROFILE_PLACEHOLDER_HEADLINE and
  PROFILE_PLACEHOLDER_LOCATION) before returning true, or alternatively simplify
  to only return true when profile.id === "candidate_fresh_start" to match
  workspace-profile-setup-review-methods.ts; apply the chosen guard inside the
  isFreshStartProfile function so shouldAutoApplyPlaceholderReplacement cannot run
  on non-fresh profiles.
- Around line 339-398: shouldAutoApplyPlaceholderReplacement currently allows
  placeholder replacements to auto-apply without honoring the model's
  recommendation (e.g., "abstain" or "needs_review"); modify
  shouldAutoApplyPlaceholderReplacement to fetch
  recommendationForCandidate(candidate) and return false unless it is "auto_apply"
  (or otherwise explicitly allow only trusted recommendations), so that candidates
  with recommendation === "abstain" or "needs_review" cannot bypass the normal
  short-circuit in shouldAutoApply; update the function to perform this check
  early (before per-field heuristics) using recommendationForCandidate and ensure
  any tests that expect abstain behavior are adjusted.

In `@packages/job-finder/src/internal/resume-record-identity.ts`:

- Around line 80-90: The function normalizeRecordEndDate contains a redundant
  ternary since normalizeRecordDate already yields "present" for current inputs;
  update normalizeRecordEndDate so after the isCurrent check it directly returns
  the result of normalizeRecordDate(value) (i.e., replace `return normalizedDate
=== "present" ? "present" : normalizedDate;` with `return normalizedDate;`)
  while keeping the early `if (isCurrent === true) return "present";` and
  referencing the normalizeRecordEndDate and normalizeRecordDate functions.

In `@packages/job-finder/src/internal/resume-workspace-primitives.ts`:

- Around line 117-149: tokenOverlap currently creates leftEntries via
  [...leftTokens] only to filter and get length; replace that allocation by
  iterating leftTokens directly and use leftTokens.size (and rightTokens.size) for
  the denominator to avoid the fresh array allocation. Update the tokenOverlap
  function to compute matched by looping over leftTokens (or using Array.from if
  you prefer) and return matched / Math.min(leftTokens.size, rightTokens.size); no
  other callers (e.g., dedupeLongResumeLines) need changes.

In `@packages/job-finder/src/internal/workspace-source-access-prompts.ts`:

- Around line 177-181: The code is defaulting updatedAt to the sentinel date new
  Date(0).toISOString() when both latestRun?.updatedAt and
  activeInstruction?.updatedAt are missing, which produces a misleading "1970"
  timestamp; change the fallback so updatedAt is either the caller-provided
  snapshot time (inject a now/timestamp parameter and use that as the fallback) or
  set updatedAt to null and update the IsoDateTimeSchema to accept nullable
  values, then update both occurrences (the updatedAt assignment using
  latestRun/activeInstruction at the two sites) to use the injected now or null
  instead of new Date(0).toISOString(); ensure any consumers that expect a string
  handle null appropriately.
- Around line 167-181: The prompt object sets targetUrl to target.startingUrl
  while the browser entry resolver (resolveSourceBrowserEntryUrl) would return
  learnedStartingUrls[0] ?? target.startingUrl, causing a contract mismatch;
  update the prompt construction in the branch that builds the
  "prompt_login_required" item to call resolveSourceBrowserEntryUrl(target,
  learnedStartingUrls) and use its return value for targetUrl (or, if intentional,
  add a clear comment next to prompt.targetUrl explaining why it should remain the
  raw target.startingUrl), ensuring the symbols referenced are prompt.targetUrl,
  resolveSourceBrowserEntryUrl, learnedStartingUrls, and target.startingUrl so the
  two paths remain consistent.

---

Outside diff comments:
In `@packages/job-finder/src/internal/profile-setup-review-items.ts`:

- Around line 355-489: Extract the repeated candidateDrafts.some predicate into
  a small helper (e.g. hasDraftForTarget(candidateDrafts, domain: string, key?:
  string)) colocated near hasMeaningfulText, then replace each inline predicate —
  the checks in the headline, currentLocation, yearsExperience, experience.record,
  search_preferences.targetRoles blocks and the
  work_eligibility/search_preferences.locations guard — with calls to that helper;
  support an optional key parameter so the broadened work_eligibility check can
  pass only domain or both domain and key as needed.

---

Duplicate comments:
In `@apps/desktop/src/main/services/job-finder/resume-quality-benchmark.ts`:

- Around line 1077-1095: The code synthesizes a SavedJob (setting id =
  validatedJob.sourceJobId and other fields) before calling fixture.overrideDraft
  in createResumeDraft, which can create duplicate id collisions; instead pass the
  original JobPosting data (validatedJob) and remove synthesized SavedJob fields
  so overrideDraft consumes a JobPosting/structural subset; update the
  createResumeDraft implementation to call fixture.overrideDraft with validatedJob
  (or a shaped object containing only title, company, atsProvider,
  responsibilities) and change fixture.overrideDraft's parameter type/signature
  from SavedJob to JobPosting/that subset (update related types/usages and remove
  reliance on SavedJobSchema validation here).
- Around line 1207-1216: The temp directory created by mkdtemp (tempRoot) can
  leak if selectBenchmarkTemplateIds returns an empty array because mkdtemp is
  called before the templates.length check; move the eligibility check
  (templates.length === 0) to before calling mkdtemp, or alternatively move the
  mkdtemp call inside the try block immediately after the check so tempRoot is
  only created when there is at least one template and will always be cleaned up
  in the existing try/finally; look for listLocalResumeTemplates,
  selectBenchmarkTemplateIds, mkdtemp, tempRoot and adjust their ordering
  accordingly.
- Around line 1297-1300: The notes array can contain empty/whitespace strings
  which will fail ResumeQualityBenchmarkCaseResultSchema
  (z.array(NonEmptyStringSchema)) when ResumeQualityBenchmarkReportSchema.parse is
  called; update the construction of notes for each asset so you trim and filter
  out falsy/whitespace-only entries: include `Template:
${asset.templateName.trim()}.` only if asset.templateName after trim is
  non-empty, and replace `...(asset.notes ?? [])` with a mapped/filtered version
  that trims each note and excludes empty results before spreading into notes so
  the final array only contains valid non-empty strings acceptable to
  ResumeQualityBenchmarkCaseResultSchema.

In
`@apps/desktop/src/renderer/src/features/job-finder/screens/discovery/discovery-filters-panel.tsx`:

- Around line 145-146: The visibility predicate is wrong: change the
  isBrowserSessionVisible expression from Boolean(chromeProfileSession) &&
  !isNeutralBrowserSessionSnapshot to use OR so a real session is shown if either
  source provides it (Boolean(chromeProfileSession) ||
  !isNeutralBrowserSessionSnapshot); update the variable definition
  (isBrowserSessionVisible) so UI blocks that render displaySessionSnapshot, the
  Browser badge, and the login/blocked/ready callout (which read
  chromeProfileSession and browserSession/isNeutralBrowserSessionSnapshot) become
  visible whenever there is a real chromeProfileSession or the global
  browserSession is non-neutral.

In
`@apps/desktop/src/renderer/src/pages/use-job-finder-page-controller-actions.ts`:

- Around line 179-205: The inner catch inside runAction that wraps await
  onSuccess(result) is unconditionally setting a generic refresh-failure message
  and returning, which swallows the handled-refresh tag; update that inner catch
  (the one around onSuccess) to detect handled refresh errors (use
  isHandledRefreshError(error)) and if true, rethrow the error so the outer catch
  can honor the resume-specific message set by
  runResumeWorkspaceAction/markHandledRefreshError; otherwise keep the existing
  behavior of computing detail and calling setActionState with the generic message
  and returning.

In `@apps/desktop/src/shared/job-finder-resume-catalog.ts`:

- Around line 192-198: The function getDefaultApplySafeResumeTemplateId
  currently falls back to the magic string 'classic_ats' which is
  unreachable/brittle; instead validate that resumeTemplates is non-empty (like
  getLocalResumeTemplateDefinition does) and throw a clear error if it's empty,
  then return the matched template id or resumeTemplates[0].id without the
  hardcoded fallback; update getDefaultApplySafeResumeTemplateId to throw when
  resumeTemplates.length === 0 and remove the ?? 'classic_ats' fallback.

In `@packages/job-finder/src/internal/resume-record-identity.ts`:

- Around line 178-182: The first branch of the return expression (the clause
  using strongSchool, strongDegree and (strongStart || strongEnd)) is missing a
  fields-compatible guard and therefore can merge records with conflicting
  non-empty fieldOfStudy; update the return expression so that the first branch
  also requires fieldsCompatible(leftField, rightField) (i.e., add
  fieldsCompatible(leftField, rightField) to the conjunction alongside
  strongSchool, strongDegree and (strongStart || strongEnd)) so both branches
  consistently check field compatibility using the existing fieldsCompatible
  function.

Verify each finding against the current code and only fix it if needed.

Inline comments:
In `@apps/desktop/scripts/capture-resume-workspace.mjs`:

- Around line 221-231: The current waitForPreviewReady(window, expectedText)
  only checks srcdoc non-empty which can be stale; change it to wait for a fresh
  render by comparing the current srcdoc to a prior value or by waiting for a
  post-selection render signal. Update waitForPreviewReady (and the two other call
  sites around lines 452-458) to accept a priorSrcdoc or a predicate: read prior =
  await getPreviewSrcdoc(window) before triggering the template selection, then
  call waitForPreviewReady(window, { changedFrom: prior }) or implement
  waitForPreviewReady to accept an expectedText OR a changedFrom sentinel and in
  its body use getPreviewSrcdoc(window) repeatedly until the srcdoc differs from
  prior (or includes expectedText) and then resolve; reference functions:
  waitForPreviewReady, getPreviewSrcdoc, visiblePreviewFrame and update callers to
  pass the prior srcdoc or expected predicate so the helper proves the
  template-render is new.

In `@apps/desktop/scripts/capture-ui.mjs`:

- Around line 70-72: The waitForPrimaryNavigation function currently only waits
  for a control with role "button", which can miss a "tab" implementation; update
  it to wait for either role by creating two locators (e.g., buttonLocator =
  window.getByRole('button', { name: /^Profile$/ }) and tabLocator =
window.getByRole('tab', { name: /^Profile$/ })) and await
  Promise.any([buttonLocator.waitFor({ timeout: 15000 }), tabLocator.waitFor({
  timeout: 15000 })]) so the function succeeds if the Profile control renders as a
  button or a tab.
- Around line 79-83: The current guard inside the window.evaluate call
  dereferences window.unemployed.jobFinder directly which can throw a TypeError if
  preload wiring is missing; update the check to robustly verify existence (e.g.
  test for window.unemployed and window.unemployed.jobFinder before accessing
  .test, or use optional chaining like window.unemployed?.jobFinder?.test) and
  throw your explicit Error('Desktop test API is unavailable in the renderer.')
  when missing so the failure is clear and not a generic renderer TypeError;
  locate this change around the window.evaluate block that references
  window.unemployed.jobFinder.test and screen.fileName.

In
`@apps/desktop/src/renderer/src/features/job-finder/components/page-header.tsx`:

- Around line 10-18: The compact branch in PageHeader (the conditional
  classNames on the eyebrow paragraph, the h1 with compact clamp(...) font-size,
  and the description paragraph using 0.88rem/leading-5) uses hardcoded type-scale
  values; move these values into existing renderer CSS custom properties in
  globals.css and reference those tokens instead of inline literals. Update the
  compact class variants in the component (the compact ? '...': '...') to use the
  renderer tokens (e.g., var(--type-scale-compact-headline),
  var(--type-scale-compact-body), var(--leading-compact)) that you add to
  globals.css, and keep the non-compact variants pointed to the existing tokens so
  both branches use consistent CSS custom properties. Ensure token names follow
  the project's token naming convention and that the h1, eyebrow p, and
  description p className strings are changed only to reference the tokens (no new
  hardcoded clamp/rem/line-height values).

In
`@apps/desktop/src/renderer/src/features/job-finder/components/resume-theme-picker.tsx`:

- Around line 74-76: The current hasAnySignal function uses substring matching
  (signal.includes(needle)) which produces false positives for short needles;
  change it to compare whole normalized tokens/phrases instead: normalize
  (toLowerCase) and tokenize each entry in haystack once (split on
  non-word/whitespace characters, trim) into a Set of tokens per signal, then for
  each needle normalize and split into its token(s) and check equality against
  those token Sets (or check phrase equality for multi-word needles) rather than
  using includes; update hasAnySignal to build tokens once from haystack and use
  Set.has/strict equality to decide matches.

In
`@apps/desktop/src/renderer/src/features/job-finder/lib/job-description-text.ts`:

- Around line 6-16: The current chain of regex replacements operating on the
  variable `value` strips any angle-bracket text and mangles cases like "5 < 7" or
  already-escaped entities; replace that regex chain with HTML-safe extraction
  using the DOM parser: create a DOMParser, parse `value` with
  parseFromString(value, 'text/html'), read doc.body.textContent (or '' if null)
  to get decoded, safe plain text, then collapse whitespace (e.g.,
  .replace(/\s+/g, ' ')) before returning; update the code where the current
  .replace(...).replace(... ) chain is applied to `value` in this file to use this
  DOMParser + textContent approach.

In
`@apps/desktop/src/renderer/src/features/job-finder/screens/discovery/discovery-detail-panel.tsx`:

- Around line 171-175: isJobPending(selectedJob.id) is job-scoped (locks the
  job) not action-scoped, so using it to set both Button pending props makes both
  "Shortlist job" (onQueueJob) and "Hide result" (onDismissJob) appear busy;
  change the Buttons to use a disabled prop when isJobPending(selectedJob.id) is
  true (or wire action-specific pending flags for onQueueJob/onDismissJob if
  available) and only set pending for the Button whose action has an explicit
  in-flight flag—update the Button usages around selectedJob, onQueueJob,
  onDismissJob, and isJobPending(...) to reflect this (disable both when
  job-locked; only show pending for action-specific state).

In
`@apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/resume-identity-editor.tsx`:

- Around line 78-89: The current scroll logic uses the card container's bounds
  (container.offsetTop/offsetHeight) instead of the focused input's bounds,
  causing incorrect scrolling; change the measurements to use the focused element
  (the target variable) relative to scrollRegion: compute targetTop/targetBottom
  from the focused element (e.g., via target.offsetTop relative to scrollRegion or
  using getBoundingClientRect() differences) and then use regionTop/regionBottom
  and scrollRegion.scrollTop adjustments as before so the focused field is fully
  visible without overscrolling the card.

In
`@apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/resume-studio-preview-pane.tsx`:

- Around line 82-96: The selector used to build allTargets in
  resume-studio-preview-pane.tsx currently only queries '[data-resume-section-id],
  [data-resume-entry-id]' so elements that only have data-resume-target-id never
  get considered and therefore never receive data-resume-selected; update the
  querySelectorAll used to populate allTargets (and the analogous selector in the
  later block around lines 115-132) to include '[data-resume-target-id]' so
  target-only anchors are iterated, then the existing checks using
  target.dataset.resumeTargetId, resumeEntryId and resumeSectionId will correctly
  set data-resume-selected for field-level highlights.

In
`@apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/resume-workspace-screen.tsx`:

- Around line 450-461: The fallback label logic is incorrectly using
  props.availableResumeTemplates[0]?.label when the draft's templateId isn't
  found, causing unknown/archived templates to be relabeled; update the
  fallbackThemeLabel so that if selectedTheme exists use selectedTheme.label,
  otherwise use draft.templateId (or the explicit string "Archived template" when
  draft.templateId is falsy) and avoid pulling the first catalog template label.
  Modify the code around selectedTheme and fallbackThemeLabel (symbols:
  selectedTheme, fallbackThemeLabel, props.availableResumeTemplates,
  draft.templateId) to prefer selectedTheme.label, then draft.templateId ||
  "Archived template".

In
`@apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/resume-workspace-sidebar.tsx`:

- Around line 43-48: The code computes roleSnapshot (const roleSnapshot =
  [...].filter(Boolean) as string[]) but only renders roleSnapshot[0], so
  additional computed fields are never shown; update the render in the Resume
  Workspace Sidebar component to display all entries (e.g., replace usage of
  roleSnapshot[0] with either roleSnapshot.join(' • ') or map roleSnapshot to
  individual elements) so Compensation, Normalized, Team and Department entries
  are all surfaced; modify the component that currently references roleSnapshot[0]
  to iterate or join the array instead.
- Around line 74-75: Replace the ad-hoc spacing and grid literals in the
  ResumeWorkspaceSidebar component: remove the hardcoded padding token "p-3.5" on
  the aside with the desktop surface spacing custom property (use the existing
  surface spacing custom property from globals.css applied alongside the
  "surface-panel-shell" class) and replace the explicit grid-template-columns
  "0.95fr/1.2fr/0.85fr" with a named CSS custom property (e.g.,
  --resume-sidebar-columns) that is defined in globals.css; update the JSX to
  reference the tokenized class or utility that uses those custom properties so
  layout values come from globals.css instead of literals, keeping the
  "surface-panel-shell" and surrounding markup unchanged.
- Around line 74-78: The <aside> landmark in resume-workspace-sidebar.tsx lacks
an explicit accessible name—add an id to the section title element (the <p> with
text "Job context") and reference that id from the <aside> via aria-labelledby
so the landmark is unambiguous for screen readers; update the JSX in the
ResumeWorkspaceSidebar component to give the title a stable id (e.g.,
jobContextLabel or similar) and add aria-labelledby="jobContextLabel" to the
<aside>, preserving existing classNames and CSS custom-property usage.

In
`@apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/review-queue-mission-panel.tsx`:

- Around line 432-433: Replace the ad-hoc size token "text-[10px]" on the <p>
  node in review-queue-mission-panel.tsx with the shared custom-property-backed
  typography token used across apps/desktop (keep the rest of the classes like
  uppercase, tracking-(--tracking-badge), and text-muted-foreground unchanged);
  find the <p> that currently uses text-[10px] and swap that single class for the
  appropriate shared text token from globals.css (or the established token name
  used elsewhere in the codebase) so the component uses the global CSS custom
  property instead of a hard-coded pixel value.

In
`@apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/review-queue-preview-panel.tsx`:

- Around line 7-9: The preview panel can dispatch onGenerateResume repeatedly
  because it lacks the per-job pending flag; update ReviewQueuePreviewPanelProps
  to accept a boolean like isGenerating (or pending) for the current job, pass
  that prop into the component where the generate CTA button is rendered, and wire
  it to the button's pending/disabled state and click handler (prevent calling
  onGenerateResume when isGenerating is true); also ensure the parent that selects
  the job supplies the correct per-job pending value so the preview reflects the
  current job's generation status.

In `@apps/desktop/src/shared/job-finder-resume-renderer.ts`:

- Around line 287-350: The inline and skill-matrix renderers currently flatten
  group.values into untagged text/pills so preview clicks only target the section;
  update renderInlineSection and renderSkillMatrixSection to emit per-value
  elements decorated with preview attributes that include the individual value id.
  Concretely, when mapping group.values: wrap each value in an element (e.g., a
  <span> for inline text and keep <li> for skill-pill-list) and call
  renderPreviewAttributes({...withPreviewSelection({ mode: input.mode ?? 'export',
  sectionId: group.sectionId ?? null, itemId: value.id })}) on that element so
  clicks resolve to the specific bullet; keep escapeHtml(value.text) for content
  and preserve the existing join/commas layout for inline lists.
- Around line 1009-1040: The CSS for preview mode currently sets
  body.preview-body { overflow-y: hidden }, preventing scrolling of multi-page
  resumes; update the preview-mode CSS (the block emitted when mode === 'preview',
  specifically the body.preview-body rule) to allow vertical scrolling by changing
  overflow-y from hidden to auto (you can keep overflow-x: hidden), so the iframe
  can scroll through pages without altering other preview styles like
  --preview-scale or .preview-shell.

In `@packages/contracts/src/resume-preview-targets.ts`:

- Around line 30-32: The decodeSegment helper and the decoding logic in
  getResumePreviewTargetContext currently call decodeURIComponent directly and
  will throw on malformed IDs; change decodeSegment to wrap decodeURIComponent in
  a try/catch and return null on error, and update getResumePreviewTargetContext
  (and any other places in the 58-105 region where decodeSegment or
  decodeURIComponent is used) to treat a null decode as a parse failure and return
  the fallback { sectionId: null, entryId: null } instead of throwing; ensure any
  callers handle the nullable segment return appropriately so malformed inputs
  fall back safely.

---

Outside diff comments:
In
`@apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/review-queue-mission-panel.tsx`:

- Around line 414-429: The button is incorrectly blocked by a global
  isApplyPending even when the primary action is resume generation; update the
  Button props to treat apply-pending as relevant only for actual apply actions by
  computing an isGenerationAction flag (needsGeneration || hasGenerationFailure)
  and use it to set pending and disabled: pending should be isSelectedJobPending
  || (isApplyPending && !isGenerationAction); disabled should be
  isSelectedJobPending || (isApplyPending && !isGenerationAction) || isGenerating
  || (isGenerationAction ? false : !canApproveApply). Keep onClick behavior
  calling onGenerateResume(selectedItem.jobId) or
  onStartApplyCopilot(selectedItem.jobId) unchanged and preserve
  primaryActionLabel.

---

Duplicate comments:
In `@apps/desktop/scripts/capture-resume-workspace.mjs`:

- Around line 261-320: Remove or rewire the unused helper functions so the file
  is lint-clean: either delete getVisibleVariantCount,
  getRecommendedTemplateLabels, templateFamilySection, shortlistComparePanel, and
  clickButtonInFamilySection if they are not needed, or ensure they are invoked
  from the capture flow; also remove the unused parameter description from
  clickLocatorViaDom (or use it in a log) to satisfy
  `@typescript-eslint/no-unused-vars`. Locate the helpers by name
  (getVisibleVariantCount, getRecommendedTemplateLabels, templateFamilySection,
  shortlistComparePanel, clickButtonInFamilySection, clickLocatorViaDom) and
  either purge them or call them appropriately so no declared symbol remains
  unused.

In
`@apps/desktop/src/renderer/src/features/job-finder/components/resume-theme-picker.test.tsx`:

- Around line 129-149: The suite currently sets
  globalScope.IS_REACT_ACT_ENVIRONMENT = true at describe-evaluation time; change
  this to set and restore the flag inside the ResumeThemePicker suite using
  beforeAll and afterAll: capture the original value from globalScope, set
  IS_REACT_ACT_ENVIRONMENT = true in beforeAll, and restore the original value in
  afterAll, leaving the rest of the cleanup (root/container/vi.clearAllMocks) in
  afterEach unchanged; reference the globalScope variable and the
  IS_REACT_ACT_ENVIRONMENT symbol when applying the change.

In
`@apps/desktop/src/renderer/src/features/job-finder/components/resume-theme-picker.tsx`:

- Around line 406-417: The controls currently advertise radio semantics
  (role="radio" and aria-checked) but the component (resume-theme-picker) does not
  implement the full radio-group contract; remove the misleading ARIA attributes
  instead of faking a radio. Update the Button instances (the Button that calls
  onChange(theme.id) and similar variant buttons using selected/disabled) to drop
  role="radio" and aria-checked, leaving visual selection via variant (and keep
  onClick/onChange as-is); also remove any matching role="radio"/aria-checked
  usages elsewhere in this file (the other block around lines ~539-550) so the
  controls behave as plain buttons for keyboard/screen-reader users.

In
`@apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/resume-section-editor.tsx`:

- Around line 47-69: The effect currently always calls firstControl?.focus(...)
  and steals the caret when the user clicked inside the same editor; change the
  logic in the useEffect (where entryRefs, sectionRef, props.selectedEntryId,
  props.selectedTargetId and firstControl are used) to skip calling focus() if
  document.activeElement is already contained within the computed target (i.e., if
  target.contains(document.activeElement) is true), but still execute any
  scroll-related behavior you have (do not remove or change scroll logic);
  preserve typings and accessibility semantics when making this conditional.

In
`@apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/resume-studio-preview-pane.tsx`:

- Around line 260-266: The warning branch in resume-studio-preview-pane.tsx
  currently uses hard-coded Tailwind/amber classes ('border-amber-500/20
  bg-amber-500/10 text-amber-200'); replace these with the project design tokens /
  CSS custom properties defined in globals.css (use the same token pattern used by
  the error and neutral branches) so the warning state respects themes and
  high-contrast modes—update the className expression that checks warning.severity
  === 'warning' to reference the token-backed border, background and text token
  utilities (matching the naming convention used elsewhere in this file/component)
  instead of the amber utilities.

In
`@apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/resume-workspace-screen.test.tsx`:

- Around line 154-189: The test captures a wrapper in originalScrollIntoView and
  later restores a different wrapper, causing the prototype to drift; instead
  capture the real original method once (store
  HTMLElement.prototype.scrollIntoView in originalScrollIntoView during module
  scope or beforeAll) and in afterEach restore the prototype directly by assigning
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView; update the
  beforeEach where you replace scrollIntoView with vi.fn() and the afterEach
  restore logic to reference the single originalScrollIntoView symbol so the
  genuine native method is always restored.

In
`@apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/resume-workspace-screen.tsx`:

- Around line 114-120: The previewRequestRef is only incremented inside
  refreshPreview(), so if the draft or workspace clears during the debounce delay
  an older in-flight response can match and overwrite current preview; update the
  logic in the useEffect that handles workspace/draft changes to
  increment/invalidates previewRequestRef immediately before scheduling the
  debounce timeout and also increment it when clearing the workspace (the branch
  that calls
  setDraft(null)/setPreview(null)/setPreviewError(null)/setPreviewStatus('idle')),
  and mirror this change in the other similar effect around refreshPreview (lines
  ~274-311) so that any scheduled/ongoing preview responses with a prior request
  id are ignored.
