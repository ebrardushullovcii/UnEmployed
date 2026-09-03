# Job Finder Sealed Acceptance And Blind Personas

Status: ready

This plan is retained as the final release-candidate acceptance chain. It is
not the current product-iteration driver and must not be run until the user
explicitly declares a settled release candidate. Ordinary iteration follows
the lightweight tester -> batched fixes -> focused validation -> one rebuild
loop in `docs/TESTING.md`.

When activated, this plan owns the remaining acceptance chain for the
integrated Job Finder candidate;
`docs/exec-plans/active/job-finder-campaigns-dashboard-crm-scale.md` remains
the implementation baseline for campaign/dashboard/CRM behavior and is not
reopened here.

## North Star

One uninterrupted customer journey — Profile → Find jobs → Shortlisted →
resume review/approval → Prepare application → user-owned final checkpoint →
Tracker — completed end to end by independent blind persona testers against
one sealed accepted app built from the current source, plus the canonical
manifest's returning-user discovery, follow-up, interrupted-work recovery,
original-CV choice, and no-results/blocked-source recovery coverage. The wave
passes only when every threshold in this plan holds on fresh, source-bound,
immutable evidence produced by the exact chain below.

## Non-Negotiables

- Applications remain prepare-only. Credentials, CAPTCHA/MFA, legal consent,
  account creation, and final submit stay user-owned; no harness, driver, or
  tester instruction may touch them.
- Evidence is source-bound and immutable: acceptance builds run from an
  immutable snapshot, re-verify the accepted app after snapshot cleanup, and
  seal report/evidence identity. A stale or mismatched fingerprint accepts
  nothing.
- The expected seal SHA-256 is custodied outside the repository before any
  persona preparation; an unbound report is not custody.
- Preserve the dirty tree. No reset, revert, clean, stash, checkout of user
  files, commit, push, or PR without explicit user authorization. Never delete
  or clean user-owned untracked files; inventory and preserve them.
- Blind testers receive life context and outcome goals only. They never read
  repository source, tests, product docs, route maps, audit findings, or
  implementation vocabulary, and no tester is reused within or across waves.
- Typed contracts, schema-validated boundaries, and source-generic discovery
  stay intact. No fix may weaken evidence grounding, recovery truth, or user
  authority.
- Electron builds and runs serialize: at most one build/Electron session at a
  time across the entire chain.

## Work Method

The user directs this chain through heavy specialized-agent delegation:

- Each worker owns exactly one scoped assignment with an explicit ownership
  boundary and does not edit outside it.
- Delegated work passes independent review before it gates the next step.
- Assignments replenish rolling: when one closes, the next queued assignment
  starts without waiting for the whole chain.
- Electron/build work stays serialized end to end; parallel Electron sessions
  are forbidden.
- The dirty tree is preserved between steps; explicitly generated test
  artifacts are the only expected additions.
- Persona testers are never reused to demonstrate fixes or reruns.

## Completed Implementation And Tooling Inventory

Implemented and focused-green. None of it accepts the current source until the
sequence below completes:

- Immutable accepted-app seal/custody: the production wrapper builds once from
  an immutable source snapshot, records Git/dirty-tree metadata and sorted
  source fingerprints, hashes main/preload/renderer output, copies the
  accepted app into the run directory, removes the snapshot, re-verifies the
  accepted app, and writes read-only `acceptance-report.json` plus
  `acceptance-seal.json` binding source/artifact inventories, accepted app and
  Electron identity, runtime probe, final report, and evidence inventory.
- Persona seeder/launcher with CDP, strict/consumed modes, and measured
  startup geometry: `prepare-blind-persona-workspaces-cli.mjs` independently
  verifies the sealed bootstrap, performs exactly one test-only reset per
  persona, proves normal production restart durability, seals each workspace,
  and writes an external custody index. Verification runs in `strict` mode
  before any launch and `consumed` mode once an authenticated archived launch
  intent exists; `launch-blind-persona-tester-cli.mjs` supports the opt-in
  parent-only CDP driver (`--driver-cdp`) over zero-network arguments,
  relaunch/retest through `--attempt`, and records measured applied startup
  window geometry probed from the live window.
- Evidence init/record/aggregate harness:
  `blind-persona-evidence-harness-cli.mjs` scaffolds per-persona records,
  validates and atomically rewrites them, binds records to the verified wave
  custody index, enforces the canonical P01–P14 set, contains synthesis output
  inside the evidence root, and exits nonzero on missing/invalid records or any
  P0 finding.
- Release-evidence mirror fingerprint exclusion: both fingerprint
  implementations exclude `docs/audits/evidence-manifests/` so writing a
  durable mirror cannot change the very source fingerprint it evidences.
- Strict ATS binding/safe-blocker handling: the Greenhouse, Ashby, and Workday
  wrappers force intermediate writes off in strict mode; bound mode verifies
  the whole sealed bootstrap and launches the sealed accepted app instead of
  worktree output; truthful outcomes keep the Greenhouse/Ashby final
  checkpoint, the anonymous Workday human handoff, and an intermediate
  write-guard safe blocker distinct from each other and from unclassified
  failures.

The canonical version-1 persona manifest is final at digest
`8b8f95b8d06b178062d5c542ecd7f927172c715a7e9a66148d4987b3fd8f1e14` (computed
with the repo's canonical digest method over the manifest plus referenced
asset hashes): P01–P12 run fresh empty workspaces and P13–P14 return to
persisted workspaces. An independent tri-model clean-room review returned GO
on this framing. No workspace is prepared and no session has run.

Broad verification is pending: no sealed production acceptance run, external
seal custody, post-seal ATS binding result, prepared persona workspace, or
completed persona session exists for the current source.

## Current Blockers

- The settled visual/safety pass is focused-green: import CAS/identity gates
  pass, Applications recovery actions are natural-width and start-aligned in
  current-build 1440/1280 captures, and null-receipt retry fails closed in
  focused coverage. Resume Studio at 1280 keeps preview/tools visible with 20
  notes and 4 blockers, while Open editor reaches and announces the exact
  focus target. AI suggestions use an explicit proposal Accept/Reject flow,
  but live AI proposal coverage is absent and the targeted allowlist remains
  P2. The collapsed wordmark is painted in 1440/1280 current-build captures;
  the Profile Copilot compact-footer capture records Send at top `589.95`,
  bottom `629.95`, height `40`, with internal textarea scrolling. Native 125%
  is not established, and live late-file-picker reproduction remains pending.
  These checks do not form a seal: the old seal/persona wave is invalid after
  source changes. Goal remains **ACTIVE** and the hard-freeze chain is pending.
- The pre-freeze simplification and current-source dogfood pass are complete.
  Current-build evidence covers the user-reported header/brand/loading/Profile
  first-viewport states, Guided setup at 1440/native-125, populated Discovery
  spacing and warning ownership, Profile Copilot tab access, the tailored PDF
  editor/export/approval path, Prepare application, Applications, and the
  cross-route save-status overlap repair. The remaining internal blocker is the
  exact frozen acceptance sequence below, not another implementation wave.
- The accepted-app production-like probe has passed focused checks, static
  validation, and independent closure review. Its runtime result remains
  pending until the immutable run executes it against the sealed app.
- Strict ATS bound mode has passed focused tests and independent safety review.
  Live post-seal runs still remain supporting external-network evidence.
- The broad non-Electron gate and source-bound release-evidence run are stale
  against the current source and must rerun under the hard freeze.
- External gates stay separate and open: private résumé quality review,
  configured provider/network availability, authenticated ATS behavior,
  personal screen-reader/reduced-motion review, and packaging/signing are
  user-controlled and are not established by this plan's synthetic evidence.

## Exact Execution Sequence

Before this sequence begins, a simplification pass and live dogfooding of the
current-source Electron app complete outside the freeze; the app-wide Job
Finder field pass and the Profile deep-link/navigation scroll-jump repairs are
code-complete and focused-test green but still need that live verification.
Every accepted change lands before step 1 starts.

1. Hard freeze the settled source before any final gate. From this point
   through the accepted sealed run and persona preparation, change nothing in
   source, docs, or dependencies. Only explicitly generated output may appear:
   desktop test artifacts, build output, and the excluded evidence mirror
   where a command explicitly writes it.
2. Under that freeze, rerun the broad non-Electron gate (`pnpm verify`) and the
   source-bound correctness/performance evidence run (`pnpm test:evidence`).
   Require both to pass with an unchanged source fingerprint. Earlier passes
   and mirrors are historical and cannot accept this source.
3. Run one immutable-snapshot production acceptance
   (`pnpm --filter @unemployed/desktop ui:job-finder-production-acceptance`),
   inspect the newly generated PNGs manually after the JSON gate passes, and
   require the read-only report plus seal files.
4. Externally custody the printed expected seal SHA-256 outside the
   repository.
5. Run the strict post-seal ATS binding checks in bound mode using only the
   `:built` wrapper variants and the four exported acceptance variables
   documented in `docs/TESTING.md`.
6. Prepare the persona wave in one single sequential invocation (`--persona
all`) into a fresh empty destination root and a fresh custody root, then
   re-check the sealed wave read-only with `--verify-all`.
7. Launch independent blind testers only through the custody-bound launcher;
   interrupted sessions relaunch through `--attempt`. Their outcome-only
   prompt must also say they are free and expected to critique the product as
   a user, including non-blocking first-viewport hierarchy/density, intentional
   padding/margins/gutters and width use, action-group alignment and accidental
   full-width controls, consistent heights/gaps/wrapping, disabled-action
   explanations, focus/DOM order, weak visual change after tabs/actions,
   loading alignment, persistent brand/active navigation, painted clipping,
   overflow, and overlap. It must not name routes, buttons, or expected defects.
8. Collect session evidence with the harness (`init` → tester records →
   `record` → `aggregate`) and synthesize independently: deduplicate findings
   by root cause and rank P0 before P1/P2.
9. Judge the wave against the thresholds below; accepted fixes restart the
   chain per the restart rules.

## Restart Rules

- Any source/docs/dependency change after freeze invalidates everything
  downstream: re-enter the freeze, rerun `pnpm verify` and
  `pnpm test:evidence`, produce a new sealed run with new external seal
  custody, and run a completely fresh persona wave with new blind testers.
- A failed or interrupted sealed run is diagnosed and fixed outside the
  freeze, then the sequence restarts at the earliest invalidated step.
- An incomplete wave never launches testers. Preparation failures require a
  new empty destination root and a new empty custody root; a used custody root
  fails closed instead of being overwritten.
- Interrupted or retried sessions relaunch the same persona root through
  `--attempt`; prior attempts stay archived evidence.
- The tree is never reset, reverted, cleaned, or committed without explicit
  user authorization. Local evidence can execute without commits; durable Git
  release closeout happens only when the user authorizes that exact action.

## External And Deferred Boundaries

External user-controlled gates remain required before deployment and stay
outside this plan's synthetic evidence: private résumé quality review,
configured provider/network transport availability, authenticated ATS
behavior, personal screen-reader/reduced-motion acceptance, and
packaging/signing/publication. Windows DACL hardening and generic PDF/DOCX/OCR
extraction remain deferred product scope. Unchecked items in
`docs/audits/JOB_FINDER_PRODUCT_DECISIONS_AND_AUDIT_CHECKLIST.md` stay
unchecked until their own evidence lands; this plan does not mark them
complete.

## Evidence And Acceptance Thresholds

The wave passes only when all of the following hold on the freshly sealed
source:

- All 14 personas (`P01`–`P14`) reach their safe expected outcome without
  hints or facilitator instructions.
- Zero P0 findings.
- Zero unresolved P1 findings involving safety, truthfulness, privacy,
  durability, or accessibility — even when a single persona hits one.
- Zero repeated P1 root causes (seen by two or more personas).
- Every P2 finding documented and triaged.
- Every persona supplies the five structured visual-review statuses and notes;
  `not_observed` remains a coverage gap rather than silently becoming PASS.
- Keyboard-only and native-125% personas complete the same journey.
- Any accepted root-cause fix rebuilds once, reruns the broad evidence gate
  and the sealed acceptance run, and starts a completely fresh wave with new
  blind testers who have not seen earlier findings.

Native 125% replaces the earlier native-200% wave expectation by user decision
on 2026-08-24: at 200% the shell collapses into a mobile-like layout with low
diagnostic value on a desktop window. Canonical persona `P12` now runs native
`webContents` zoom factor 1.25 (`native_125_percent`) at a normal 1280x720
desktop window, and minimum supported size stays 1024x720 with normal desktop
checks. Historical runs that covered 200% remain truthful historical coverage,
not current requirements.

## What This Wave Measures

The blind wave is the quality-over-speed product bar: it checks that real
people understand the local/model/site boundaries without coaching, that saved
state and approvals survive normal use and interruptions, and that the app
meets the finish expected of a paid product. It supplements — never replaces —
the external user-controlled gates above.
