# Job Finder Autonomous Application Architecture

Status: active

## Goal

Choose and implement the simplest architecture that reliably discovers relevant
jobs, maintains an accurate profile, produces grounded application material, and
completes applications under the user-scoped authority model in ADR 0012.

The product goal is fixed. The current browser loop, discovery planner, Profile
Copilot patch flow, Resume Studio model, package placement, and UI are not.

## Current Decision

- Support `prepare_only`, `confirm_before_submit`, and `autonomous_submit`.
- Existing workspaces and code remain prepare-only until migrated explicitly.
- Do not bypass CAPTCHA or anti-bot controls, guess secrets or MFA, invent
  eligibility/legal facts, or treat an internal flag as proof of site outcome.
- Native 100% and 125% are the practical UI acceptance points. Do not optimize
  the release around 200% zoom.
- Keep host work sparse: no broad tests, builds, or Electron lanes during the
  architecture comparison. Run later checks serially after a coherent slice.

## Implementation Progress

- Compact discovery observation contracts and the isolated source-generic
  Playwright observer are focused-green. Ordinary discovery now performs one
  compact observation before legacy extraction/model work, checkpoints retained
  candidates before progress, exits model-free when the target is met, and sends
  one bounded summary to fallback otherwise. Source-debug is unchanged and no
  observation control reference executes an action yet.
- Authority envelopes, exact preflight, bounded one-time confirm grants, and
  tri-state submission outcomes are additive and focused-green. Elevated
  authority requires explicit expiry; current 10/run and 20/day values remain
  workflow migration defaults rather than contract ceilings.
- Elevated authority and preflight are now bound to one exact decision-policy
  schema version/revision/canonical digest, approved-answer snapshot, and fixed
  fail-closed stop rules. Renderer management cannot mint that identity.
- A pure Job Finder submission-policy gate is focused-green. It returns only an
  exact immutable authorization binding or an explicit blocker; it performs no
  browser action, persistence, or IPC and is not wired into production.
- Durable authority state is focused-green in contracts plus both repository
  implementations. Migration v15 stores envelopes, immutable preflights,
  one-time grants, idempotency records, armed markers, and strict outcomes;
  mutations are schema-validated, envelope revisions are CAS-guarded, grant
  consumption is one-shot, revocation propagates, and restart recovery converts
  armed-without-outcome attempts into permanent uncertainty. Legacy workspaces
  receive empty collections and no fabricated authority. Atomic replacement
  revokes the active predecessor and its available execution children while
  inserting one distinct replacement; SQLite and in-memory guards enforce one
  active envelope. This foundation is not yet called by production application
  orchestration.
- The source-generic exact-one browser-hands foundation is focused-green against
  local Chromium fixtures. It enumerates visible final controls, derives the
  effective submitter destination (including `formaction`), rejects zero,
  ambiguity, stale identity, rerender and origin drift, requires a final
  immediate veto, performs at most one action, and reports only safe
  `not_submitted` or `outcome_uncertain` browser facts. `BrowserSessionRuntime`
  now exposes these optional capabilities while retaining private `Page`
  ownership; the catalog runtime omits them. They are not connected to the
  coupled prepare-only driver or Desktop routes.
- An internal synthetic Job Finder orchestrator and its main-only composition
  seam are focused-green and deliberately absent from the general production
  package barrel. The composition is available only from the explicit
  `application-submission-runtime-main` subpath. It rereads and reevaluates exact
  authority, uses the repository's compound transaction-current
  authorize/consume-grant/arm transition, serializes duplicate keys, and records
  only `not_submitted` or `outcome_uncertain`. Fabricated submitted-like executor
  results and recovery failures fail closed. A localhost-only Desktop test now
  composes real Chromium, the browser hands, and file-backed SQLite through one
  action and durable uncertainty/ApplicationRecord projection. No renderer,
  preload, IPC, legacy apply route, or other production caller exists.
- A separate internal preflight coordinator is focused-green and also absent
  from the package barrel. It derives the resume SHA-256 from copied bytes,
  canonicalizes HTTP(S) origin, schema-validates and deep-freezes the immutable
  record, and exposes only repository commit truth. It cannot grant, arm,
  execute, call browser/IPC, or widen production authority.
- The compound repository transition is now the only public arm boundary. It
  recomputes the policy digest and validates policy, answers, scope, canonical
  origin, resume, capacity, idempotency, and exact grant before mutation; the
  former low-level consume and arm methods are removed. The synthetic gate and
  orchestrator require explicit content-free current policy/answer/stop facts
  and recheck them before and after arm.
- Discovery persistence Stage 1 is focused-green: running history is no longer
  duplicated and duplicate-only checkpoint writes are heartbeat-bounded. Durable
  active-checkpoint storage remains deferred Stage 2.
- Desktop startup now durably recovers armed-without-outcome attempts before
  service exposure. Strict main/preload management APIs can inspect and revoke
  authority and can persist only prepare-only envelopes; elevated modes and
  final submission remains unavailable. Prepare-only bounded ATS autosave is
  now the first production authority consumer: Settings/main require exactly
  one job/origin/resume, current approved answers, and expiry; Job Finder
  rechecks the same envelope revision before every short field-save window.
  The Settings surface still keeps elevated modes unavailable and confirms
  revocation; no final-action execution channel is exposed.
- Normal non-submission outcome commit and armed-attempt startup recovery now
  atomically reconcile the exact lineage-matched `ApplyJobResult` privacy
  receipt and exact ApplicationRecord in both SQLite and in-memory repositories.
  ApplicationRecord projection preserves CRM/status/content fields, appends one
  deterministic outcome event, and maps uncertainty to paused manual review.
  Missing or cross-lineage parents fail without partial mutation. Uncertainty
  also projects a blocked result with `submission_outcome_uncertain`, forbids
  retry, and is visible as a manual-verification alert in Applications.
  Submitted outcomes remain rejected without an independent external verifier.
- The independent operator verifier is now focused-green and user-reachable from
  Applications. It accepts only an uncertain outcome id plus a two-step
  employer-site confirmation, while main derives current lineage, revision,
  time, and safe operator evidence. DB preserves the original uncertainty and
  atomically appends/projects a terminal submitted or not-submitted fact into
  idempotency, result receipt/state, and the exact ApplicationRecord. It has no
  browser action, grant, arm, or submission capability.
- Main-owned approved-answer snapshots and content-free readiness are now
  focused-green and user-reachable from Settings. Main rereads and canonicalizes
  current reusable Profile answers, owns digest/id/revision/time, and appends an
  immutable repository revision. Renderer input carries no answer text or policy
  identity. Current/stale/restart behavior is proven in an isolated built
  Electron replay; production remains prepare-only and no grant or execution
  channel exists.
- Production final submission remains disabled. Production orchestration that
  composes the generic hands with an independently verified external outcome,
  receipt/application-record integration, elevated typed mode UI, and live
  acceptance still remain.
- The intermediate-mutation firewall is now deny-default at focused runtime
  level. An authorized grounded field action opens one same-origin
  3-second/8-request window; only explicitly classified draft/autosave/save/update
  fetch/XHR mutations pass, while final-action, ambiguous, cross-origin, late,
  beacon, long-lived, popup/navigation, and DOM-submit traffic remains denied.
  Real Chromium proves one synthetic autosave pass and one same-origin final
  request denial. Production still supplies false until inspectable user policy
  activation is wired.

## Remaining Vertical Slice

Implement in this dependency order. Parallelize only the disjoint persistence and
browser-hands foundations; later layers consume both and therefore stay serial.

1. **Current-source dogfood unblock:** clear the known resume claim-field
   typecheck failures, make one production build, and launch one Electron session
   so the user can inspect the current Profile -> discovery -> shortlist -> resume
   -> prepare-only application progress. This review does not wait for autonomous
   submission and must not be represented as autonomous acceptance.
2. **Durable authority state — complete at focused level:** schema-validated
   repository storage now covers envelopes, immutable preflights, one-time
   grants, idempotency state, armed markers, and tri-state outcomes. Envelope
   mutation is expected-revision guarded; preflight keys are unique; grant
   consume/revoke is exclusive; restart recovery is idempotent; legacy
   workspaces receive no fabricated authority. Integration into the later
   orchestration/receipt layers remains deliberately separate.
3. **Generic browser hands — complete at focused foundation level:** add a source-generic form observation and
   execute-exactly-one-final-action boundary in `browser-runtime`. It enumerates
   all final controls, binds deterministic observation/control identity, rejects
   ambiguity and stale refs, runs a last-instant veto before one click, and
   returns raw external facts rather than claiming submission truth. The coupled
   prepare-only driver and its legacy flags remain non-submitting.
4. **Job Finder orchestration — internal synthetic foundation complete:** build exact preflight from verified resume bytes,
   canonical answer identity, canonical origin/campaign and decision-policy
   identity, fresh form/control identity, authority revision,
   and current capacities. Inside one serialized transition, reread durable
   authority/grant/idempotency state, rerun the pure policy, consume a confirm
   grant atomically, persist an armed marker, execute once, and classify a strict
   outcome. A crash or unverifiable post-click state becomes
   `outcome_uncertain`; automatic retry remains permanently blocked for that key.
5. **Recovery and receipts — focused operator-resolution slice complete:** normal
   commit and startup recovery atomically reconcile `not_submitted` /
   `outcome_uncertain` into the exact ApplyJobResult privacy receipt; existing
   packet generation reads that persisted receipt. Armed-without-outcome becomes
   durable uncertainty, remaining grants are revoked, repeated recovery is
   idempotent, and cross-lineage/missing parents fail without partial mutation.
   Exact ApplicationRecord projection is also atomic and focused-green for these
   non-submission outcomes. Explicit employer-site operator verification can now
   resolve durable uncertainty to a fresh terminal submitted/not-submitted
   outcome without rewriting history or enabling automatic retry.
6. **Typed Desktop authority UX — prepare-only management and answer readiness
   complete:** Settings
   now exposes explicit scope/expiry/resume/origin/volume fields for the safe
   mode, inspectable revisions, stale reload, and confirmed revocation through
   typed main/preload APIs. Applications separately exposes two-step uncertain-
   outcome verification and Task Center routing. Settings also exposes a
   content-free current/stale approved-answer snapshot view and a main-owned
   two-step immutable approval command. Confirm-before-submit, autonomous
   activation, and exact confirmation grants remain open. Absence of an
   envelope keeps every legacy
   workspace prepare-only; legacy review/auto-submit settings never acquire
   authority semantics.
7. **Synthetic vertical slices — first cross-layer slice complete:** a local
   Chromium plus file-backed SQLite harness proves one autonomous synthetic
   action, durable uncertainty/Applications projection, and duplicate-key
   lockout without real employer submission. Continue to cover prepare-only
   regression, confirm-before-submit with exact one-time grant, autonomous
   envelope execution, stale/rerendered controls, ambiguity, cancellation,
   revocation-before-click, CAPTCHA/login/MFA/legal-attestation pauses,
   externally verified success, proven no-submit, blackholed uncertainty, and
   crash/restart durability. Use local fixtures only; no real submission occurs
   in automated acceptance.
8. **Serialized acceptance:** after focused checks are green and writers settle,
   run package validation once, one production build, one current-source dogfood
   journey at native 100% and 125%, then revise the sealed/persona contract before
   restarting P01-P14. Private resume quality, live provider relevance,
   authenticated ATS behavior, native dialogs, screen-reader review, and any real
   submission remain user-controlled gates.

Hard implementation boundaries:

- Never honor `submitAuthorized` or a submit-capable mode inside the coupled
  preparation driver.
- Never use first-match final-control selection; zero or multiple candidates
  pause with no click.
- Never weaken the prepare-only mutation guard into a blanket submit window.
  Any future armed window is one-shot, origin-bounded, journaled, and tested
  against autosave and duplicate mutation.
- Model output can propose but cannot grant authority, consume a grant, prove an
  outcome, or override CAPTCHA/MFA/credential/legal-fact stops.
- `submitted` requires externally observed evidence and a verification time;
  URL change, click intent, internal state, or transport success alone is not
  enough.

## Architecture Questions

1. Should discovery remain a long model-planned browser loop, become a generic
   browser-search agent with typed product tools, use deterministic extraction
   first, or use a hybrid with agent escalation only for uncertain pages?
2. Which browser actions belong in reusable runtime primitives, an agent harness,
   or Job Finder domain orchestration?
3. Should Profile Copilot remain proposal parsing from conversational output, or
   expose complete typed read/write/validate tools so the model performs bounded
   operations directly?
4. Should resume editing keep the current custom document model and UI, adopt an
   established editor/layout library, or split structured truth from a mature
   visual editor/export surface?
5. What exact authority schema, credential boundary, idempotency key, submission
   receipt, retry rule, and revocation behavior are required for each mode?
6. Which current safeguards are fixed defaults, configurable warnings, or hard
   technical stops?

## Comparison Set

- Current planner/tool loop with targeted repairs
- Deterministic navigation and extraction with model ranking
- General browser agent with typed Job Finder read/write tools
- Hybrid deterministic fast path plus agent escalation and recovery
- Established browser-agent and document-editor libraries where they improve
  reliability without weakening local-first ownership or typed boundaries

## Initial Assessment

The current source already contains two useful foundations that should not be
discarded:

- `@unemployed/agent-runtime` provides a product-neutral typed task loop with
  validation, budgets, checkpoints, result handles, and receipts. Profile
  Copilot and guided resume editing already use it.
- Job Finder already has typed product-action definitions and durable
  application lineage, recovery, and privacy receipts.

The main architectural debt is concentrated elsewhere:

- Discovery uses a bespoke long-running conversation loop plus a large custom
  browser-tool and extraction stack. Public ATS adapters already provide a
  better deterministic fast path, but browser fallback still spends model turns
  planning navigation, extraction, stopping, and recovery together.
- Application execution is one large prepare-only heuristic driver. Page
  observation, answer resolution, mutation guards, field execution, navigation,
  final-control classification, copy, and result construction are coupled. It
  cannot safely become autonomous by making `submitAuthorized` true.
- Profile Copilot has typed operations, but the universal model-facing tool
  describes operation payloads as open objects. Runtime Zod validation catches
  mistakes after generation; it does not give the model the complete explicit
  operation union while planning.
- Resume Studio's structured truth, evidence binding, templates, exact export,
  approval hash, and application lineage solve product-specific problems that a
  general rich-text editor does not.

## Recommended Target

Use a hybrid architecture with five explicit layers:

1. Domain orchestration owns campaigns, budgets, application lineage, retries,
   authority envelopes, and terminal state.
2. Browser observation produces a compact typed snapshot of page identity,
   controls, candidate actions, blockers, and observed external effects.
3. Deterministic handlers cover public provider ingestion, known grounded field
   mapping, uploads, stable navigation, and previously verified actions.
4. A model receives bounded observations and typed tools only when deterministic
   handling is uncertain. It proposes an action or structured extraction; it
   does not own authority or canonical state.
5. A deterministic policy executor rechecks the fresh observation, action
   preconditions, exact lineage, and authority envelope before executing one
   external action and writing its receipt.

Discovery should therefore be API-first, deterministic-browser-second, and
agent-escalated-third. The agent should resolve an uncertain page or extraction,
not carry the entire search run in conversation. Query generation and result
ranking may use models without making page-by-page navigation model-owned.

Application execution should be decomposed into observe, resolve answers,
propose action, authorize, execute once, and verify outcome. Final submission is
a distinct two-phase operation:

- preflight binds the exact form snapshot, approved document hashes, answers,
  final control, authority revision, remaining capacity, and idempotency key
- execution clicks once, then records `submitted`, `not_submitted`, or
  `outcome_uncertain` from observed site evidence; uncertain outcomes never
  auto-retry

Profile Copilot should retain proposals and review, but expose the complete
typed operation union to the model instead of relying on vague open-object tool
descriptions and deterministic natural-language special cases. Product-level
tools should eventually support bounded profile reads, proposal creation,
proposal acceptance with confirmation, and validation receipts.

Resume Studio should retain its structured domain document and exact-PDF
approval pipeline. A general editor may be piloted only as an editing surface
for bounded section text; it must not become canonical truth or silently replace
the renderer. Current library findings:

- Stagehand is the strongest browser-adapter candidate because it combines
  deterministic page APIs with typed `observe`, `extract`, and `act` primitives
  and supports local Chromium. Evaluate it as browser hands, not the policy
  brain.
- Playwright MCP demonstrates compact accessibility snapshots and exact
  snapshot-scoped references, but running an MCP server inside the product adds
  unnecessary process and protocol overhead. Reuse the protocol ideas with the
  existing Playwright runtime instead.
- Browser Use has structured output and custom tools, but adopting it would add
  a Python/CDP subsystem beside the TypeScript/Electron runtime. Keep it as a
  benchmark, not the leading integration candidate.
- Tiptap Pages is paid and beta, lacks per-page templates, and documents an
  infinite layout loop for oversized non-splittable blocks. BlockNote's PDF
  exporter is copyleft/commercial and moves export to React PDF. Neither is a
  drop-in improvement over exact approved resume bytes.

## Prototype Gate

Do not start a production rewrite before two small disposable comparisons:

1. Discovery slice: run the same public target and generic search surface through
   the current agent loop, an existing-Playwright compact-snapshot harness, and a
   local Stagehand adapter. Measure usable unique jobs, first-useful-job time,
   provider calls, wall time, duplicate rate, and unsupported-page recovery.
2. Application slice: use synthetic multi-step forms to compare the current
   driver with the proposed observe/propose/authorize/execute/verify protocol.
   Cover a normal submit, unknown required answer, rerendered field, ambiguous
   final control, successful submission, and outcome-uncertain submission.

The prototypes must reuse synthetic data, run serially, and avoid broad tests,
production builds, real applications, credentials, or overlapping Electron
ownership. Choose the replacement only from measured results.

## Prototype Results

### Application slice — completed 2026-08-26

The disposable in-memory comparison covered all six required paths and ran 16
protocol assertions. The explicit observe -> propose -> authorize -> execute ->
verify protocol passed every invariant. The coupled driver model could not
truthfully represent successful submission or post-click uncertainty, silently
misbound a field after rerender, selected a decoy when final controls were
ambiguous, and a naive submit-flag extension retried a blackholed submission eight
times while reporting failure. The protocol used one execution per durable
idempotency key, rejected stale observation identity, paused on ambiguous final
controls, required external evidence for `submitted`, and froze
`outcome_uncertain` against automatic retry.

Decision: replace the coupled application execution structure with the explicit
protocol. Keep the current production path prepare-only while additive contracts,
observation identity, deterministic policy execution, preflight, durable
idempotency, tri-state outcomes, verification evidence, and revocation checks are
implemented. Preserve existing truthful missing-answer pauses, lineage, recovery,
and prepare-only containment primitives. Do not implement autonomous submission
by honoring `submitAuthorized` inside the existing driver.

The prototype was deleted after this result was recorded. Its synthetic model did
not cover CAPTCHA/MFA, frames, uploads, consent attestations, timing jitter, or
transport-level replay; those remain production verification requirements rather
than reasons to retain the coupled structure.

### Discovery slice — completed 2026-08-26

The serial comparison used four small synthetic generic-search surfaces and one
read-only public Greenhouse target. On scored synthetic surfaces, the current
deterministic substrate retained 0/40 usable unique jobs while the bounded
compact-snapshot Playwright arm retained 36/40 (90%) and completed in about one
fifth of the wall time. On the public ATS pass, the current substrate retained 4
of 24 raw rows while the compact arm retained 50 unique jobs. The compact arm
also rejected an unsupported layout after one bounded probe instead of spending
the current loop's modeled planning turns.

The comparison root-caused the current substrate's losses: a 500-character
readiness gate disables short listing pages, inline-metadata cards collapse into
a shape rejected by `isCompleteJob`, and the per-pass review budget caps usable
yield. Current canonicalization, merge-key dedupe, learned detail templates,
allowlist handling, and JSON-LD normalization remained useful and should be
reused.

Stagehand 4.0.2 was feasible to install in temporary storage, but its useful
`act`/`observe`/`extract` path remained provider-gated, credential-free local use
did not complete within the bounded probe, and major-version API churn was
observed. It is deferred rather than added as a production dependency.

Decision: discovery becomes API-first, deterministic compact-snapshot
Playwright second, and model-escalated third. The deterministic path owns bounded
observation, typed extraction, name-based pagination, canonicalization, dedupe,
and explicit unsupported-layout outcomes. A model receives only failed or
uncertain bounded observations; it does not own the whole run. Do not carry the
500-character gate or line-shape completeness assumption into the replacement.
The prototype was deleted after this result was recorded.

## Sequence

1. Let current writers settle; inventory proven defects and current capabilities.
2. Use the completed prototype results to define the compact discovery adapter
   and explicit application protocol boundaries.
3. Write any follow-up ADRs/contracts before widening production behavior.
4. Implement one vertical slice for each authority mode with exact lineage,
   idempotency, receipts, revocation, and pause-on-unknown behavior.
5. Rework UI around mode selection, scope, warnings, progress, and recovery.
6. Run sparse focused checks, then one serialized broad gate, one build, live
   dogfood, and a revised sealed/persona acceptance chain.

## Stop Conditions

- Do not extend the current architecture merely because it exists.
- Do not adopt a library from screenshots or marketing; prototype the hard paths.
- Do not claim autonomous submission from intent, a clicked control, URL change,
  or internal state alone.
- Do not run overlapping heavy validation or Electron sessions.
