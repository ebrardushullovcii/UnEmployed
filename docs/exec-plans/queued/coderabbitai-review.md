Verify each finding against current code. Fix only still-valid issues, skip the
rest with a brief reason, keep changes minimal, and validate.

Inline comments:
In
`@apps/desktop/src/renderer/src/features/job-finder/hooks/use-job-finder-workspace.ts`:
- Around line 117-123: Replace the inline options shape in startApplyCopilotRun
with the canonical contract type used by the IPC surface: import the
input/options type exported by the jobFinder contract (or use a Pick of it) and
use that instead of { visualCheckpointsEnabled?: boolean }; update the signature
of startApplyCopilotRun in use-job-finder-workspace.ts to accept that contract
type (while keeping the call to runWorkspaceAction(...) and
window.unemployed.jobFinder.startApplyCopilotRun unchanged), so the
renderer/preload/main boundary stays type-safe and won’t drift from the
contract.

In `@packages/ai-providers/src/browser-visual-analysis.ts`:
- Around line 380-388: The code currently unconditionally includes an image_url
when input.snapshot.dataUrl exists; change the conditional to also check
input.snapshot.redactionLevel and skip adding the image_url object when
redactionLevel === "sensitive", so sensitive snapshots are not sent off-box. In
the branch where you would have added the image_url (the spread using
input.snapshot.dataUrl and snapshot.mode), gate it with something like
input.snapshot.dataUrl && input.snapshot.redactionLevel !== "sensitive", and
when redactionLevel is "sensitive" force the deterministic/text-only fallback
path instead of uploading the raw screenshot.

In `@packages/browser-agent/src/agent/discovery.ts`:
- Around line 64-72: The phase is being inferred fragily from the display string
via parsePhaseFromSiteLabel in discovery.ts; instead, extend the taskPacket to
include an explicit phase field and propagate that value from
workspace-source-debug-workflow where taskPacket is created, then update
discovery.ts to read taskPacket.phase when persisting to
SourceDebugVisualFindingSchema (remove reliance on parsePhaseFromSiteLabel for
persisted phase). Locate where taskPacket is built in
workspace-source-debug-workflow.ts and add the phase enum/value there, update
all call sites that send taskPacket, and modify discovery.ts (places around the
existing parsePhaseFromSiteLabel usage) to use the new taskPacket.phase; you may
then delete or limit parsePhaseFromSiteLabel to non-persistent/display-only
uses.

In `@packages/browser-agent/src/agent/evidence.ts`:
- Around line 596-633: The code currently fabricates snapshotId/observationSetId
and a default phase which can create colliding IDs and misattribute findings;
update the block that builds state.phaseEvidence.visualFindings to validate
normalizedResult.data.snapshotId, normalizedResult.data.observationSetId, and
the local phase before creating a finding (use SourceDebugVisualFindingSchema
only when all three are present and valid), and if any are missing or invalid,
do not push a fabricated entry—log or emit a warning instead (use whatever
logger is available in this module) so callers know the tool result was
rejected; ensure the id uses the real snapshotId and do not fallback to
"visual_snapshot_unknown" or default phase "access_auth_probe".

In `@packages/browser-agent/src/tooling/visual-tools.ts`:
- Around line 154-195: captureSnapshot(...) and analyzeSnapshot(...) calls can
throw and currently those exceptions bubble out; wrap the calls to
context.config.visualAnalysis.captureSnapshot and
context.config.visualAnalysis.analyzeSnapshot in a try/catch inside the visual
tool flow (the block creating snapshot and observationSet) and on any thrown
error return the same optional-evidence response shape used elsewhere (e.g. {
success: false, error: <error message or serialized error> }) instead of
rethrowing; ensure you catch errors from both captureSnapshot and
analyzeSnapshot, include meaningful error details (message/stack) in the
returned error field, and keep the tool’s normal non-throwing contract so the
browser-agent run can continue.

In `@packages/browser-runtime/src/catalog-browser-session-runtime.ts`:
- Around line 892-893: The snapshot ID currently built as
`visual_snapshot_catalog_${now.replace(/[^0-9]/g, '')}` can collide for captures
in the same millisecond; modify the ID generation in the code that sets
id/capturedAt (using the local variable now) to append a monotonic suffix (e.g.,
a per-instance/per-module incrementing counter or sequence number) so each call
produces `visual_snapshot_catalog_<timestampDigits>_<counter>` (increment the
counter atomically on each snapshot and reset or scope it to the session
instance as appropriate) to guarantee uniqueness.

In `@packages/contracts/src/visual.ts`:
- Around line 270-278: The schema BrowserVisualQuestionContextSchema lacks a
stable identifier so questionContextIds in ApplyVisualCheckpointSchema cannot
uniquely reference questions; add an `id` field (e.g., NonEmptyStringSchema) to
BrowserVisualQuestionContextSchema so each BrowserVisualQuestionContext has a
stable unique identifier, update any creation/parsing code that builds
BrowserVisualQuestionContext instances to populate this `id`, and adjust usages
of questionContextIds to reference this new `id` instead of observationSetId
(check functions/types that mention BrowserVisualQuestionContextSchema and
ApplyVisualCheckpointSchema).

In `@packages/job-finder/src/internal/source-instruction-evidence.ts`:
- Around line 144-146: The code assumes attempt.visualEvidence is always present
when building visualEvidenceSummaries; guard against legacy attempts by checking
that attempt.visualEvidence is an array before mapping (e.g., use
Array.isArray(check) or a nullish coalescing default) so visualEvidenceSummaries
becomes an empty array when the field is missing or invalid; update the code
around the visualEvidenceSummaries assignment in
internal/source-instruction-evidence.ts (the attempt.visualEvidence mapping) to
perform this check and safely handle legacy records.

In `@packages/job-finder/src/workspace-service.test-runtimes.ts`:
- Around line 50-57: The helper createAgentDebugFindings currently returns a
widened object without schema validation; change it to apply the shared
AgentDebugFindings schema before returning so tests produce values that match
production contracts. Specifically, build the input with defaults for
visualFindings and visualObservationSets (as you already do) then pass that
object into the shared schema parser (e.g., AgentDebugFindingsSchema.parse(...)
or parseAgentDebugFindings(...)) and return the parsed/validated result; update
imports to bring in the shared schema/parser and keep types
AgentDebugFindingsInput and AgentDebugFindings for signatures.

---

Outside diff comments:
In `@packages/job-finder/src/internal/workspace-application-methods.ts`:
- Around line 395-483: The code uses results.find(...) and the full checkpoints
array, which can mix data from older runs; instead select the newest apply
result for this job (e.g. filter results by jobId then sort by
createdAt/completedAt and pick the first) into latestResult, then scope
checkpoints to that run (filter checkpoints by checkpoint.runId ===
latestResult.runId) before computing latestCheckpoint, retainedVisualEvidence,
and checkpointUrls; update places that reference checkpoints and
latestResult.visualCheckpoints (and keep previousRun lookup via runs.find by id)
so all aggregated URLs/visuals/checkpoints come only from the newest run.

In `@packages/job-finder/src/internal/workspace-source-debug-workflow.ts`:
- Around line 503-512: The siteLabel currently concatenates free-text
normalizedTarget.label with formatStatusLabel(phase), which forces downstream
code (parsePhaseFromSiteLabel in discovery.ts) to re-parse a display string and
can misidentify phase when the label contains phase-like words; instead, stop
relying on siteLabel for phase transport and include the explicit phase in the
task packet/prompt context passed to the agents. Update the call site that
builds the task packet (where siteLabel is set in
workspace-source-debug-workflow.ts) to add a separate field (e.g., phase or
sourcePhase) alongside siteLabel, and update any call paths that construct
composeSourceDebugInstructions/adapter payloads to carry that field through;
then remove phase parsing dependence in discovery.ts by reading the new explicit
phase field (parsePhaseFromSiteLabel calls should be replaced/guarded to use the
provided phase). Ensure identifiers referenced: siteLabel,
normalizedTarget.label, phase, composeSourceDebugInstructions,
taskPacket/promptContext, and parsePhaseFromSiteLabel are updated accordingly.

In `@packages/job-finder/src/workspace-service.test-runtimes.ts`:
- Around line 733-759: Replace the hand-maintained local input type for
renderResumePreview with the actual parameter type from the implementation so
schema changes fail fast: use
Parameters<JobFinderDocumentManager["renderResumePreview"]>[0] as the
fixture/input type (and update the renderResumePreview fixture declaration to
accept that type), remove the stale fields like dateRange from the test-defined
shape, and adjust any fixture construction to match the real shape returned by
JobFinderDocumentManager.renderResumePreview so the test tracks the real
contract instead of a widened local copy.