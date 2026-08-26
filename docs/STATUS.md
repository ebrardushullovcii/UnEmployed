# Status

Read this only for active feature work, handoff updates, broad repo changes, or unclear current state.

Updated: 2026-08-26

## Current Truth

- Temporary local AI routing 2026-08-26: ignored `.env.local` currently points
  shared text and vision-capable providers at OpenCode Zen's
  `muse-spark-1.2-contributor-free` through the Responses API with requested
  `xhigh` reasoning. Synthetic direct probes passed for text and image input;
  Chat Completions returned HTTP 500 and is not used. Job Finder, Interview
  Helper text, resume vision, browser vision, and Interview screenshot analysis
  inherit these shared values unless a narrower override is present; audio stays
  local or separately configured. This is a temporary dogfood override, not a
  production routing decision or end-to-end acceptance result. The free
  contributor route may use prompts and completions for Meta model training, so
  private resume, credential, answer, and interview data require explicit
  informed consent; initial testing stays synthetic. The temporary key shared in
  conversation must be rotated and remains untracked. ADR 0010's mixed OpenCode
  Go production recommendation remains accepted pending capability and privacy
  review. Exact setup and follow-up: `docs/AI_PROVIDER_SETUP.md`.

- Current-source dogfood and publication gate 2026-08-26: the user authorized a
  commit and push only if there is no blocker to testing the app and seeing the
  current progress. That condition is met for the existing prepare-only journey:
  `pnpm validate:package job-finder` passes lint, typecheck, and 137 files / 1,795
  tests; `pnpm validate:package desktop` passes lint, typecheck, 275 files / 2,613
  tests, and the prepare-only report-binding check; AI Providers passes 28 files /
  398 tests; the production Desktop build passes; and the rebuilt app opens the
  real workspace with read-only smoke coverage across Profile, Find jobs,
  Shortlisted, and Applications. The first launch exposed a legacy company-alias normalization
  mismatch; SQLite migration 14 now repairs only each derived alias key while
  preserving authority and company data, its focused migration test and DB
  typecheck pass, and the same workspace reopens successfully. Autonomous final
  submission remains unavailable and is not part of this dogfood claim.

- Architecture selection and focused integration 2026-08-26: the two disposable
  comparisons in the active autonomous-application plan are complete and their
  throwaway code is deleted. ADR 0013 selects API-first discovery, deterministic
  compact Playwright observation second, bounded model escalation third, and an
  explicit observe -> propose -> authorize -> execute -> verify application
  protocol. Stagehand is deferred; a submit-authorized boolean inside the current
  driver is rejected. Additive compact-observation contracts are focused-green
  (9/9), and the isolated source-generic compact Playwright observer is
  focused-green (25/25). Its compact-first ordinary-discovery integration is
  focused-green (7/7) and browser-agent typechecks cleanly: retained candidates
  checkpoint before progress, target-satisfying pages avoid model/tool extraction,
  and partial/unsupported pages receive one bounded legacy fallback summary.
  Source-debug remains unchanged and no observation control reference executes.
  Additive authority/preflight/tri-state-outcome contracts are also
  focused-green (119/119), preserve legacy receipts and packets, require explicit
  clock-based expiry checks, post-attempt external evidence, and a separate exact
  one-time user grant for confirm-before-submit, and deliberately keep the current
  10/run and 20/day values as workflow migration defaults rather than contract
  ceilings. A pure Job Finder submission-policy gate is focused-green (86/86):
  it binds current job lineage, scope, origin, artifact/answer/form/control
  identity, envelope-bounded capacity, idempotency, and confirm-mode grant state,
  but performs no external action and is not wired into production. The resume
  grounding path now uses one deterministic classifier from generation through
  export, with hash-bound explicit ownership for weak claims;
  its focused contracts/provider/Job Finder/Desktop batches are green after
  correcting fixture and punctuation-normalization defects. Repeated discovery
  growth, richer checkpoint upgrades, priority budgets, distinct retained counts,
  apply cancellation/relaunch truth, resume-generation concurrency, and exact
  claim-confirmation IPC/UI have focused passing evidence. Production submission
  remains disabled; no broad repository validation, live submit, or release claim
  exists for this source. The current-source production build and read-only
  Electron journey smoke are recorded above.

- Discovery persistence Stage 1 2026-08-26: running discovery now lives only in
  `activeRun`; terminal history receives each run once. Duplicate-only checkpoint
  sequences no longer write every revision: the first target checkpoint, real
  kept batches, abort/disable flushes, and an eight-revision durability heartbeat
  remain. Focused incremental/restart suites are green (19/19), including zero
  checkpoint-phase singleton writes for empty no-op sequences and two bounded
  heartbeats across 19 duplicate-only revisions. Durable active-checkpoint storage
  remains a separate deferred Stage 2.

- Desktop save-concurrency fencing 2026-08-26: the Job Finder save coordinator
  now retires exact-request Retry when a protected surface reports a revision
  after (or while) its save failed, swapping the shell toast's Retry action for
  explicit guidance to resave from the form, so a stale captured payload can
  never be silently resubmitted and a later refresh cannot overwrite newer
  editor content (`markSurfaceRevised`, wired from every Profile/setup/Resume
  draft edit plus staged settings edits). React Hook Form hydration, canonical
  reseeds, save echoes, and discard remain silent; field-array append/remove
  actions signal exactly once. Focused edit-signal suites are green (65/65).
  Route-level save status is now
  fenced by save operation token: superseded saves — older completions of any
  outcome — can no longer overwrite a newer operation's route message, and
  `clearReceipt` no longer clears the in-flight map so same-key saves stay
  deduplicated while an operation remains executing. Focused suites
  (coordinator 13, action runners incl. new older-fail/newer-success fencing,
  save-status presentation, settings scoped/navigation sections, navigation
  guard, window-close guard, shell navigation) were green under serial local
  runs; targeted lint on touched files was clean. The later consolidated Desktop
  gate passes lint, typecheck, 275 files / 2,613 tests, and the prepare-only
  report-binding check. Repository-wide validation remains separate from this
  package-level gate.

- Product authority decision 2026-08-26: the product owner explicitly authorized
  full application automation, including final submission, when the user selects
  and scopes that authority through preferences or settings. ADR 0012 supersedes
  the prepare-only product ceiling in ADR 0006. The current source remains
  prepare-only and must not submit: no existing flag or legacy mode has been
  reinterpreted. The next implementation track is an architecture reset comparing
  the current discovery/apply loops with deterministic, typed tool-first agent,
  and hybrid browser designs, including whether Profile Copilot and Resume Studio
  should use different tool or editor foundations. The current sealed acceptance,
  ATS binding, and P01-P14 wave are paused because they certify the superseded
  prepare-only target. Native 200% zoom remains outside current acceptance; 100%
  and 125% are the practical UI bar. To protect host responsiveness, no additional
  broad tests, builds, or Electron lanes run until current writers settle; later
  verification is sparse, serialized, and consolidated.

- Job Finder simplification/fix wave 2026-08-25: pre-fix live hands-on
  journeys of the real built app (serialized single-build lanes; local
  evidence trees under `apps/desktop/test-artifacts/ui/hands-on-*-20260824*/`)
  reached Applications safely with final submission untouched, and exposed
  the defects the next wave fixed: the first successful search could stay
  hidden behind the Search setup tab, leaving unsaved work raised native
  browser-style leave prompts instead of app-owned dialogs, resume
  stale-save/restore states were not displayed truthfully, and OS Save As
  dialogs sit outside browser/CDP automation reach. The current-source fix
  wave is code complete and focused-green: truthful first-run Home/setup
  seeding, durable dirty-Profile background merge with explicit conflict,
  Find jobs results-first hierarchy, truthful visible-versus-total streaming
  counts with found/retained separation, flexible-only work modes staying
  unknown instead of compatible or conflicting, per-plan filter/view
  persistence and classified run feedback, Shortlisted batch-curation and
  selection persistence across navigation, explicit per-job resume-approach
  use with per-plan fallback defaults, review-first section regeneration
  with assistant provenance and preserved grounding/compaction, restored
  drafts shown as needing review/export rather than failed generation, exact
  application lineage and improved accessibility on Applications, app-owned
  navigation/window-close/quit confirmations, and a semantic light/dark
  palette. Broad validation for this wave is still pending: no fresh
  `pnpm verify`, no one production build, and no rebuilt fresh live replay
  of the complete journey (résumé export through the explicit test-API
  chooser bypass plus a separately observed human native Save As pass) have
  run yet. No release, sealed acceptance, exact-build, or broad-gate claim
  exists for the current source.
- Job Finder priority state 2026-08-24: Job Finder is the priority track. The
  app-wide Job Finder field pass and the Profile deep-link plus navigation
  scroll-jump repairs are code-complete and focused-test green, and none of
  that work is verified in live Electron yet. Production renderer sources
  carry zero legacy `border-input` field chrome, enforced by a source-scan
  guard test. Live current-source Electron sessions are the primary UX
  evidence; the automated suites stay mandatory guardrails and integrity
  checks but never substitute for live use. A simplification pass followed by
  live dogfooding therefore precedes the hard freeze — the acceptance chain is
  not entering freeze yet. The durable capacity goal across many runs and days
  stays thousands of relevant jobs discovered and hundreds of applications
  completed under user-scoped authority. The current 10-per-run and
  20-per-local-day values are conservative migration defaults, not the durable
  product ceiling; current browser behavior remains prepare-only until the new
  authority path is implemented.
- Blind-persona low-vision scope decision 2026-08-24: the user removed native
  200% zoom from CURRENT acceptance because at 200% the shell collapses into a
  mobile-like layout with low diagnostic value, replacing it with a practical
  native Electron 125% desktop session. Canonical persona `P12` remains a fresh
  low-vision payroll/office-admin workspace and now runs native `webContents`
  zoom factor 1.25 (`native_125_percent`) at a normal 1280x720 desktop window;
  its brief, cohort, goal, outcome wording were renamed truthfully, the
  seed-data manifest contract accepts exactly
  `native_100_percent`/`native_125_percent`, and the final canonical manifest
  digest — verified against the repo's canonical digest method — is
  `a8cb5836e830272eea96894a80d2ed4e795d31e0a1d97dea7f05ecd092fd7b7d`; an
  independent tri-model clean-room review returned GO on that final corpus
  (P01–P12 start from fresh empty workspaces, P13–P14 return to persisted
  workspaces), and no persona workspace is prepared and no session has run.
  Minimum support stays 1024x720 with normal desktop checks. The sealed
  production acceptance tooling now binds this bar end to end: every executed
  component runs at native zoom factor 1 or 1.25 only, sealed viewport
  evidence binds observed CSS geometry to requested physical size and expected
  native zoom, compact/minimum coverage stays at normal 100% zoom at the
  minimum supported size, and 200% coverage survives only as historical
  records of past runs. Static validation passes; the runtime sealed run has
  not executed for the current source.
- Release-custody tooling hardening 2026-08-24 (freeze v13 prep): the
  release-evidence collector now fingerprints a dirty worktree directly with
  an explicit kind-bound recipe. Dual NUL-safe enumeration
  (`git ls-files -z -co --exclude-standard` plus `git ls-files -z -d`) classifies
  every path as an ordinary file (path/mode/bytes/sha256), a contained symlink
  that resolves back to an enumerated ordinary file
  (target/resolved-path/mode), or a Git-declared unstaged deletion (explicit
  deleted kind) without staging, restoring, or mutating any user-owned path or
  index; undeclared vanish races, directories, special entries, and
  broken/escaping/non-enumerated symlinks fail closed with named errors, the
  digest folds stable-JSON records under a named `recipe` id with no digest
  sentinel, results carry file/symlink/deletion counts, and before/after
  equality compares every scalar field. Recipe `v3`
  (`nul-enumerated-stable-json-lines-v3`) additionally binds permission bits
  (`mode`, 0o777) into ordinary-file and symlink records so chmod-only
  mutations change the digest while every count stays identical and restoring
  the exact bits restores the exact prior digest (fixture-proven in the
  collector self-check and the production-acceptance static validator). The
  run directory is reserved only after the before-fingerprint succeeds, and an
  after-fingerprint failure is wrapped into a failed manifest with
  `after.digest: null` plus `unavailableReason` instead of dropping completed
  stage evidence or emitting an identical-digest "changed" reason;
  mirror writes/rebuilds validate the exact runId pattern and mirror-directory
  containment, rebuild validates and preserves the read manifest schema,
  recomputes the raw subject digest and requires exact equality with any
  stored `manifestSha256` (tampered raw output is rejected before rebuild;
  legacy hash-less raw manifests stay explicitly supported and documented),
  and new manifests are `schemaVersion: 4` while historical mirrors stay
  untouched point-in-time history. Collector self-check now also proves
  fingerprint-side digest/`unavailableReason` exclusivity, schema-v3 legacy
  explicit-null projection, exact-runId rejection, and mirror-destination
  containment without repository writes. Direct invocation detection
  canonicalizes `argv[1]`/`import.meta.url` through realpath so `/var`- versus
  `/private/var`-spelled entry points can no longer silently exit 0. The
  exact-build wrapper's canonical
  `JOB_FINDER_ACCEPTANCE_ARTIFACT_ROOT` preflight and the evidence-inventory
  run-directory containment checks remain in force unchanged. Collector
  self-check and production-acceptance static
  validation pass; direct fingerprinting of the current tree is byte-stable
  twice at 1,527 files / 0 symlinks / 204 deletions under the v3 recipe;
  `test:evidence` has not been rerun and there is
  still no sealed production acceptance run for the current source.
- Accepted-app dependency export 2026-08-24: the export is a manifest-driven
  recursive dependency closure seeded from the electron.vite rollup externals
  plus electron and pdfjs-dist. It resolves required and non-optional-peer
  dependencies from exact original instances inside the immutable snapshot,
  nests conflicting versions under their dependents, fails closed naming
  requirer and specifier, records absent optionals, records how each seed was
  found (source desktop or resolved-seed sibling), and stays symlink-free,
  mode-preserving, and read-only. Hardening now enforced and fixture-tested:
  strict npm package-name shape for every seed and manifest key with
  destination containment before mkdir/copy (poisoned traversal names write
  nothing outside the intended destination); PyInstaller build intermediates
  under the sidecar no longer ship, with the artifact-fingerprint exclusion
  table keyed by normalized forward-slash root paths so the narrow
  `dist/resume-parser-sidecar/build/**` exclusion holds on Windows too, pinned
  by direct boundary fixtures (build mutations/removals/additions are
  invisible while sibling `build-old` and runtime bin/python/manifest changes
  bind, and exported sidecar python/site-packages files must survive); the
  post-export scan byte-reads every
  ordinary exported file — maps, extensionless files, and binaries included —
  against both resolved and realpath aliases of each forbidden root; the pnpm
  workspace-state exclusion covers concrete versioned names without broad
  dotfile skipping; pre-launch containment probes pin the exact
  `pdfjs-dist/legacy/build/pdf.worker.mjs` subpath the bundled main resolves;
  and Electron/playwright identity resolution is contained to the accepted
  root at both capture and accepted-app binding. Focused static validation
  (`node ./scripts/validate-job-finder-production-acceptance.mjs`) and the
  prepare-only report-binding validator pass, and a temporary real-tree
  experiment exported deterministically twice (7,644 files / 117 packages /
  13 recorded optional skips) with all seven probes resolving and loading
  only inside the export. There is still no sealed production acceptance run
  for the current source.
- Acceptance state 2026-08-24: the sealed-acceptance and blind-persona tooling
  is implemented and focused-green but unaccepted. There is still no sealed
  production acceptance run, externally custodied seal digest, post-seal ATS
  binding result, prepared persona workspace, or completed persona session for
  the current source, and the broad non-Electron gate is stale against it. The
  strict ATS bound mode and the accepted-app production-like probe have passed
  focused tests, static validation, and independent safety review. The chain
  does not enter its hard freeze yet: a simplification pass and live
  dogfooding of the current-source Electron app come first, then the frozen
  steps — broad gate and source-bound evidence
  reruns, one sealed run, external seal custody, strict post-seal ATS checks in
  bound mode, one sequential
  `--persona all` preparation, read-only `--verify-all`, custody-bound
  launches, harness evidence collection, independent synthesis — are owned by
  `docs/exec-plans/active/job-finder-sealed-acceptance-and-blind-personas.md`.
  The wave is the quality-over-speed product bar (boundary understanding,
  save/approval durability, paid-product finish) and never replaces the
  external user-controlled gates; unchecked items in the product audit
  checklist stay unchecked until their own evidence lands.
  The first 2026-08-24 frozen broad test run reached 4,527 passing tests and
  exposed one deterministic source-debug timing defect: an observed
  same-millisecond `waiting_on_ai` state was omitted from persisted duration
  evidence because zero-duration entries were filtered. Source-debug timing now
  opts into preserving observed zero-duration states while discovery timing
  retains its prior default; the 11-test runtime suite, package lint, and
  package typecheck pass. That source change invalidated the first freeze, so
  all final gates restart from a new fingerprint.
  The second frozen chain passed every direct broad-gate stage and source-bound
  release evidence, then immutable acceptance failed closed on a harness false
  positive: Chromium reported a stale rectangle for the hidden `Close Task
center` descendant of a closed native `details`. Clickable-point evidence now
  excludes non-summary descendants of closed `details` while retaining the
  visible summary control. The second freeze and its release-evidence run are
  historical only; final gates restart again from a third fingerprint.
  The third frozen chain also passed every direct broad-gate stage and
  source-bound release evidence, then immutable acceptance failed closed at
  native 200% zoom because the clickable-point sampler treated Profile tabs
  scrolled entirely above their overflow-clipping `main` ancestor as visible
  controls hidden by an overlay. Clickable-point evidence now intersects each
  control with the viewport and every overflow-clipping ancestor before testing
  unobscured points; sibling/fixed overlay occlusion still fails. The third
  freeze is historical only, and final gates restart from a fourth fingerprint.
  The fourth frozen chain passed every direct broad-gate stage, source-bound
  release evidence, and all fresh-flow captures, then scale acceptance failed
  closed because the 5,000-job Find jobs warm route took `1451.70 ms` against
  the unchanged `500 ms` budget. The dominant redundant work rebuilt the same
  1,001-target source-label map once per job and repeated the full visibility
  ranking during the pre-paint selection update. Source-label indexes are now
  cached per immutable target-array identity, and discovery visibility is
  memoized across that internal rerender. The fourth freeze is historical only;
  final gates restart from a fifth fingerprint without relaxing the budget.
  The fifth frozen chain passed every direct broad-gate stage, source-bound
  release evidence, and fresh-flow capture, and reduced the same Find jobs
  route to `510.50 ms`; scale acceptance still failed closed against the
  unchanged `500 ms` budget. The remaining default-route path filtered all
  5,000 jobs and built search/activity values even with an empty query and no
  active filters. It now returns the already-ranked job array directly only in
  that exact no-filter state; all searched and filtered paths are unchanged.
  The fifth freeze is historical only, and final gates restart from a sixth
  fingerprint.
  The sixth frozen chain passed every direct broad-gate stage and source-bound
  release evidence. Find jobs then passed scale at `194.50 ms`; one attempt
  stopped on a transient external Shortlisted heading observation despite its
  renderer feedback committing at `100.30 ms`. A clean rerun passed the runtime
  components but final inventory failed closed because the viewport matrix
  compared requested physical `1440x920` dimensions with the expected CSS
  `720x460` dimensions at native 200% zoom. The passing Applications capture
  recorded both geometries correctly. Matrix coverage now binds requested
  dimensions to physical geometry while independently requiring native zoom.
  The sixth freeze is historical only, and final gates restart from a seventh
  fingerprint.
  The seventh frozen chain passed every direct broad-gate stage, source-bound
  release evidence, runtime component, capture, and corrected viewport-matrix
  gate, then accepted-app export failed closed because the generated resume
  parser sidecar manifest embedded original-workspace absolute paths. Sidecar
  manifests now store bundle-relative binary and Python roots, normalize cached
  legacy manifests without rebuilding, and resolve relative Python fallback
  roots from the manifest directory. The absolute-reference export scan remains
  strict. The seventh freeze is historical only, and final gates restart from
  an eighth fingerprint.
  The eighth frozen chain passed every direct broad-gate stage and source-bound
  release evidence, then reproduced a scale-observation defect: Shortlisted's
  renderer and visible heading committed near `101 ms`, but the harness did not
  begin observing that heading until Playwright's click promise completed
  unrelated post-action settling near `687 ms`. External heading observation
  now starts before click dispatch and records when the DOM heading actually
  becomes visible; the same `500 ms` budget remains enforced. The eighth freeze
  is historical only, and final gates restart from a ninth fingerprint.
  The ninth frozen chain passed every direct broad-gate stage and source-bound
  release evidence, then accepted-app export failed closed because pnpm's
  `node_modules/.pnpm-workspace-state.json` install-state bookkeeping, copied
  out of the immutable dependency snapshot into the exported runtime, embeds
  workspace absolute paths. Accepted-app exports now omit package-manager-only
  install state (`.pnpm-workspace-state.json` and `.modules.yaml`) exactly like
  the internal `.pnpm` store and `.bin` shims; nothing resolvable as a runtime
  dependency changed, the frozen dependency-snapshot inventory is unchanged,
  and the absolute-reference export scan remains strict. The ninth freeze is
  historical only, and final gates restart from a tenth fingerprint.
  The tenth frozen chain passed every direct broad-gate stage, source-bound
  release evidence, capture components, and accepted-app export, then failed
  closed at the accepted-app runtime identity evaluate:
  `ElectronApplication.evaluate` callbacks destructuring a `process` property
  out of the Electron namespace are unsupported and fail deterministically.
  Runtime identity now uses the supported split — `{ app }` with
  `app.getPath("exe")` plus ambient `process.versions.*` — then realpaths the
  reported executable against the already-bound accepted path and fails closed
  unless both the reported runtime Electron version and the bound package
  version are non-empty strings before unconditionally asserting their
  equality; the production-like tester probe keeps `BrowserWindow`/`screen`
  from the namespace with ambient `process.env`, and the
  static production-acceptance validator rejects any wrapper evaluate callback
  destructuring `process` — arrow or function expression, sync or async —
  while ignoring ambient process property access and positively pinning the
  executable-path, version-shape, and unconditional-version-equality
  assertions with no compatibility fallback. The tenth freeze is
  historical only, and final gates restart from an eleventh fingerprint.
  The eleventh frozen chain passed every direct broad-gate stage,
  source-bound release evidence, capture components, accepted-app export, and
  the accepted-app runtime identity gate, then failed closed at the
  production-like tester probe on exactly two defects: its child main-process
  sample read the nonexistent `process.spawnargs` global instead of proving
  the zero-network and CDP launch switches through Electron's own command
  line, and its child environment authority evidence was recorded only after
  every downstream assertion succeeded, so a failed gate emitted no per-field
  evidence beyond one aggregate verdict. The tester probe now destructures
  `{ app, BrowserWindow, screen }`, proves host-resolver-rules
  `MAP * 0.0.0.0,EXCLUDE localhost`, proxy-server `127.0.0.1:9`,
  remote-debugging-address `127.0.0.1`, and remote-debugging-port `0` through
  exact `app.commandLine.hasSwitch`/`getSwitchValue` equality nested once in
  the child environment authority record, captures the raw child sample
  after the applied-window assert and before the authority verdict, evaluates
  it against pinned exact key sets for the flat record and its nested launch
  switches that fail closed on unknown or missing keys without coercion, and
  always emits the evaluation beside the raw sample (explicitly null before
  capture) with a per-field failing-fact breakdown even when the probe fails;
  the duplicate top-level spawnargs evidence shape
  is removed with no backward-compat schema. The eleventh freeze is
  historical only, and final gates restart from a twelfth fingerprint.
  The twelfth frozen chain passed every direct broad-gate stage,
  source-bound release evidence, capture components, accepted-app export,
  and the production-like tester probe, reached final evidence sealing, and
  then failed closed on acceptance self-mutation: evidence hardening
  flattened every sealed file to an explicit 0444, destroying the accepted
  app's sealed 0555 executable modes so its own post-hardening
  re-verification rejected the tree it had just hardened. Evidence hardening
  now masks write bits per file (current mode & ~0o222) through one
  containment-checked, lstat-classified helper instead of any blanket mode,
  leaving exactly the final report and seal on explicit 0444, and sealing
  re-verifies the accepted app after hardening before the final seal.
  Build-artifact fingerprints are now mode-aware and are captured after
  runtime hardening, so the exact-build manifest binds the read-only state
  that actually ships: a mode-only tamper changes the artifact digest and
  fails export equality while bytes stay identical, generated 0644 artifacts
  seal as 0444, and sealed 0555/0755 executables keep their execute bits.
  The twelfth freeze is historical only, and final gates restart from a
  thirteenth fingerprint.

- The integrated Job Finder candidate now has explicit discovery-inventory
  completeness, derived snapshot-only listing activity, listing-origin newest
  sorting and source/activity filters, a service-level closed-listing gate, and
  a complete `companyJobs` projection for company pages. Exact-name employer
  exclusion is previewed, atomic, reversible, and available only from
  unambiguous company identity; domain evidence is corroboration only.
- Durable employer-application accounting and conservative company identity are
  implementation-complete. `ApplyJobResult` stores paired immutable preparation
  start timestamp/local-date facts before browser work; migration 13 leaves
  legacy starts unknown rather than inventing them; the singleton desktop
  process serializes in-flight reservations; and consent continuation reruns all
  preparation guards. The dashboard separates exact usage from legacy
  uncertainty against the fixed 20-per-local-day limit/reset, while each run is
  capped at 10 unique jobs.
- Company ownership now requires an exact canonical name or
  `user_approved_merge` alias. Legacy aliases and domains are non-authoritative;
  domains only corroborate, conflict, or prompt research, and no destructive
  SavedJob domain migration occurs. Salary/offer evidence validates
  transaction-current company/job/ApplicationRecord lineage atomically with
  monotonic timestamps; salary uses the exact job, offers use the exact record,
  and failed UI saves retain their drafts.
- Exact ApplicationRecord lineage is integrated across migration 12, services,
  typed IPC/preload, renderer selection, campaign projection, manual answers,
  grouped answers, and application descendants. CRM single and bulk stage
  changes merge against transaction-current records, preserve manual
  provenance, confirm external claims, and expose stale/error retry without
  partial bulk commits.
- Application documents now validate exact current question/result/record
  lineage, stale company detail routes fail closed without selecting a
  substitute, and CRM timeline wording remains preparation-only. The external
  stage confirmation modal isolates and traps focus and restores its opener.
- Guided setup and Find jobs share canonical readiness and require an explicitly
  enabled public HTTP(S) source; seeded and manually added sources remain off
  until opted in. Resume approval names one exact current export and remains
  separate from application authority. Search plans configure discovery only;
  fixed application safeguards allow at most 10 unique jobs per run and 20 begun
  employer applications per local day.
- The shell and focused UI coverage include the persistent 17rem sidebar at CSS
  widths of at least 1440px, compact navigation below that breakpoint, keyboard
  behavior, long labels, and native 200% zoom. This is implementation and
  focused evidence, not screen-reader acceptance or final release acceptance.
  Current acceptance instead requires practical native Electron 125% zoom: on
  2026-08-24 the user removed native 200% from current acceptance because it
  collapses into a mobile-like layout with low diagnostic value, so the 200%
  coverage above is historical evidence only.
- The production acceptance code now builds and runs from an immutable snapshot,
  preserves and re-verifies a sealed accepted app after snapshot cleanup, and
  emits a final custody seal over source/build/app/report/evidence identity. The
  accepted-app/persona seed pipeline independently verifies that seal, prepares
  isolated restart-proven workspaces, and writes external wave custody. Final
  end-to-end harness work and one full sealed run for the current source are
  still pending; do not claim an exact-build or broad release pass.
- The canonical blind-persona corpus contains 14 fixed personas and their
  deterministic resume/job assets. The corpus, seed preparation, custody, and
  tester launcher are prepared, but no persona has launched or completed.
  Execution day follows a fixed chain: externally custodied expected seal
  digest, one single sequential `--persona all` preparation into fresh empty
  destination and custody roots, read-only `--verify-all` of the sealed wave,
  then custody-bound launches (`--attempt` covers interrupted relaunches and
  retests); incomplete waves never launch. Live relevance, personal resume
  quality, configured provider/network behavior, authenticated ATS behavior,
  screen-reader acceptance, and user deployment review remain separate pending
  gates.

- The current Settings/Resume Studio/Applications integration pass is green.
  Settings now has six scoped sections (App & device, Application defaults,
  Workspace behavior, Tracker, Diagnostics, and Danger zone); each save uses a
  typed, schema-validated, field-scoped IPC operation against transaction-current
  repository state. Candidate Assets moved to the dedicated Documents destination
  under Planning & settings. Resume Studio has one primary next action, visible
  approval blockers, collapsed secondary chrome, and denser evidence-bound editing;
  Applications uses a deduplicated fact strip and compact records/history. The
  integrated desktop suite passes 219 files / 1,477 tests, desktop typecheck and
  scoped lint are clean, and the production build succeeds. Exact Electron visual
  acceptance for the current dirty source remains pending.

- The 2026-08-22/23 desktop UI/UX sweep is internally green for the normal
  Job Finder flow. The campaign adoption repair now persists retained seeded
  and legacy jobs, so Home, Shortlisted, Rapid Review, and preparation agree on
  the same active campaign; the verified demo workspace shows three Find jobs
  and three Shortlisted jobs instead of empty queues. Home source readiness now
  derives from canonical workspace preferences. Search-plan create/archive/
  delete flows are typed end to end, preserve the active plan unless explicitly
  switched, exclude archived plans from activation, confirm destructive rule
  changes, and give truthful save/error feedback. The shell uses a stable
  YouTube-style hamburger at the top of the sidebar in both 17rem and 4rem
  states, Radix rail tooltips, consistent Results naming, and one horizontal
  alignment ladder across main screens. Light/dark review also fixed the active
  plan badge, Profile progress colors, zero-result copy, per-view CRM empty
  states, stale-bundle recovery, and truncated search placeholders. The exact
  current tree passes desktop lint, typecheck, production build,
  `git diff --check`, and all 177 desktop test files / 1,018 tests. The final
  feedback pass also made secondary empty states compact and actionable,
  corrected Interview Helper tab state and overlay layouts, normalized Rapid
  Review dates, simplified Shortlisted and the resume workspace, fixed Profile
  Copilot overlap with the section tabs, reconciled three demo employers as
  three companies, and scales the live Letter resume preview to its pane without
  clipping contact details. Final
  screenshots and the durable checkpoint are under
  `apps/desktop/test-artifacts/ui/qa-final-pass-20260822/`; zero QA Electron
  instances remain. This is internal normal-flow acceptance, not the broader
  exact-source adversarial/release acceptance gate.

- The current dirty candidate includes a full renderer design-system and
  density pass across Job Finder and Interview Helper. Dark mode is neutral
  graphite with a restrained steel-blue active state; light mode uses a
  low-glare stone canvas instead of white. Shared panels, cards, buttons, tabs,
  fields, page headers, navigation, status treatments, and nested surfaces use
  the same flatter tokens. Job Finder uses one compact title/supporting row,
  one persisted 17rem/4rem desktop sidebar/header rail, owned result counts,
  continuous result rows, tighter shared page gutters, full-surface Profile
  section tabs, and overflow-safe locked panes. The rail, header column, and
  content offset share one width, so collapsing cannot leave a second gutter.
  Find Jobs separates Results from Search setup and Shortlisted uses a two-pane
  queue plus tabbed job workspace. Interview Helper shares both themes and its
  setup surface uses the same compact header and divided content sections.
  The Electron capture harness now covers Profile, Find jobs, Shortlisted,
  Applications, Settings, and Interview Helper in both themes and exits without
  the former destroyed-window cleanup exception. Desktop build, typecheck,
  lint, `git diff --check`, and all 165 desktop test files / 914 tests passed
  before the workspace restructure. The follow-up production build, direct
  TypeScript check, changed-file lint, and focused 20 layout/navigation tests
  pass. Dark, light, and collapsed-rail captures at 1456x920 confirm the new
  geometry without horizontal overflow or a phantom sidebar gap. This is
  implementation evidence, not release acceptance for the dirty candidate.

- The 2026-08-20 production-recovery candidate supersedes the 2026-08-19
  source and screenshots for current release decisions. Repository reads no
  longer silently cap collections at 1,000; singleton writes no longer rebuild
  unrelated tables; settings, discovery, application, and resume-affecting job
  changes use transactional row-local commits instead of stale full snapshots.
  Regression coverage traverses and restarts 5,000 saved jobs, updates 1,001
  application records, and preserves concurrent same-row/different-row changes.
  The strict release test entry point again separates four-worker correctness,
  serial non-instrumented performance, and separate coverage reporting.
- The same candidate fixes misleading Home zero states, Discovery's accidental
  two-column breakpoint, More-menu focus order, pagination focus ownership,
  Rapid Review keyboard conflicts, dropped residual wheel/keyboard scrolling,
  excessive route chrome, and cold first-route loading. Heavy routes are split,
  common destinations preload after the shell is usable, and renderer timing
  marks feed hard cold/warm acceptance budgets. The normal flow now has a
  persistent 17rem sidebar at CSS widths of at least 1440px; below that
  breakpoint the compact top navigation exposes the flow destinations and a
  `Planning & settings` menu for secondary destinations.
- Current acceptance is source-bound and fail-closed. The production wrapper
  creates an immutable source snapshot, builds and runs only that snapshot,
  inventories source and generated artifacts, unsets dev-server routing, retains
  and re-verifies the accepted app after snapshot cleanup, and seals the final
  report and evidence. It covers fresh and scale state, error/recovery,
  minimum-width, 1440px, practical native Electron 125% zoom (native 200% is
  historical only), long labels, real scrolling,
  route-latency, prepare-only safety, and cleanup. The final complete run for the
  integrated source is pending.
- A prior normal-use checkpoint covered a production build, isolated
  prepare-only Greenhouse journey, focused Profile/Strong rewrite/Shortlisted/
  bulk-draft/review and Home/navigation suites, desktop typecheck/lint, and diff
  checks. It predates the integrated candidate and is historical rather than an
  exact-build acceptance claim.
- The earlier dirty candidate exercised the source-bound production wrapper and
  focused repository stages, but that evidence predates the final immutable
  snapshot, accepted-app seal, exact application-lineage, listing-activity,
  employer-exclusion, and persona-custody integration. It is historical only
  and cannot accept the current source. The final broad gate and one complete
  sealed production acceptance run remain pending.
- External production release remains unaccepted until user-controlled evidence
  covers live-source relevance, the user's private resume and generated drafts,
  configured model/network transport, and authenticated ATS behavior. Final
  submission, credentials, CAPTCHA/MFA, legal consent, account creation, and
  external sign-in remain user-controlled and outside synthetic acceptance.

- The 2026-08-19 Job Finder release-hardening pass is integrated locally. It closes application/result consistency races, reset and bulk-update atomicity, discovery refresh coalescing, large-collection pagination and indexing, contextual navigation, keyboard/focus/reduced-motion/long-label handling, extreme-zoom layout, renderer recovery, and packaged-sidecar ownership. The repository-wide `pnpm verify` gate passed after integration, including the separate discovery-ledger performance check. A production scale replay recorded 516 jobs, 226 shortlisted jobs, 226 applications, and 511 sources: cold usable shell 1,780.86 ms, 12 route switches with a 307.42 ms maximum, bounded pagination on all four large surfaces, zero renderer errors, an in-bounds More menu, and complete isolated cleanup. The former ignored report path under `apps/desktop/.tmp/production-scale-probe-2026-08-19T05-34-15-991Z/` no longer exists in this workspace, so those numbers are historical claims rather than inspectable current evidence. The release pipeline also produced a Windows x64 unpacked app with the tracked icon and complete parser sidecar. That bundle is unsigned and must be regenerated once more after the final CSP metadata cleanup before external release; signing, installer publication, auto-update, and deployment remain explicit release operations.

- The campaign/dashboard/search/CRM expansion is implemented end to end. Rapid Review, local scheduler foundations, grouped reusable Needs you answers, and all six phase-two feature slices — advanced campaign rules and truthful pre-search funnel, local schedules/digests/in-app notifications, outcome analytics with manual outcome recording, resume strategies with per-job selection, company intelligence with conservative merge review, and high-volume safeguards with recovery — are complete. The integrated focused closeout passed 59 test files / 770 tests with zero failures, including 4 safeguard files / 92 tests. Affected lint, typecheck, Prettier, and `git diff --check` checks are green, and the production desktop build is green. The hardened phase-two Electron harness completed 40 captures at 1440×920, 1280×720, and native 200% zoom with zero runtime errors, safety violations, horizontal-overflow findings, or unreachable controls; nested-scroll movement passed 40/40. Historical and uninspectable: that harness evidence was recorded under `apps/desktop/test-artifacts/ui/phase-two-absolute-final/`, which no longer exists locally, so the capture counts are historical claims rather than inspectable evidence; the run left zero Electron processes. Its original broad-gate attempt was blocked by package-manager verification, but the later 2026-08-19 repository-wide `pnpm verify` run passed after release-hardening integration. The exact closeout is recorded in `docs/exec-plans/active/job-finder-campaigns-dashboard-crm-scale.md`.
- Applications now includes a local CRM with table, Kanban, calendar, timeline, reminders, interviews, contacts, notes, Candidate Asset attachments, compensation/offers, tags, custom stages, duplicate hints, configurable no-response automation, and CSV/JSON export. Manual Applied or later stages remain local tracking facts and never grant browser final-submit authority or create a receipt.
- The historical phase-one gate passed guidance, docs, source-generic and structure checks, all 14 package lint/typecheck tasks, fit calibration, and 2,100 tests. Its timing-sensitive repeated-source test passed the unchanged 2,000 ms CPU budget at 1,501 ms, with one live benchmark intentionally skipped. Later phase-two and 2026-08-19 evidence supersedes that checkpoint for current Job Finder acceptance.

- The AI capability reliability core is implemented and production-accepted. `packages/agent-runtime` owns typed temporary task state, narrow permissions, schema repair, paged result handles, safe read concurrency, classified retry, semantic progress, cancellation, time/provider-cost/no-progress controls, checkpoints, and receipts. Configured Profile Copilot and Guided Edits use dedicated value-setting tools while local code supplies IDs, timestamps, and review metadata. Model JSON and tool calls retry classified transient provider/network failures up to three attempts. Browser discovery treats successful navigation as progress, preserves page-two extraction time, and uses local structured extraction before model interpretation. Browser-vision aliases and source-review defaultable enums normalize locally instead of turning harmless schema differences into fallback. The current Luna High hard canary passes 11/11 representative capabilities with zero fallback, including résumé text/vision, résumé generation, Guided Edits, Profile Copilot, job extraction, paginated discovery, login-wall source debug, browser vision, Interview cues, and Interview screenshot vision. The earlier 110-case run remains historical pre-fix evidence: 64 direct successes, 36 fallbacks, and 10 hard failures. Production Electron acceptance passed Job Finder, live-Luna Profile Copilot, live-Luna Resume Studio, and Interview Helper flows. Report: `docs/audits/LUNA_HIGH_AND_PRODUCTION_ACCEPTANCE_2026-08-12.html`; decisions: `docs/adr/0009-luna-high-default-and-capability-contracts.md` and `docs/adr/0010-opencode-go-mixed-text-and-vision-routing.md`.

- The configured-model benchmark completed all 330 frozen synthetic outcomes across Luna high, Luna max, and Sol low, using 671 provider calls plus an independent qualitative review. The current owner-selected route is OpenCode Go: DeepSeek V4 Flash with requested `max` reasoning for normal text/tool agent work, and GPT-5.6 Luna with `high` reasoning for image-only résumé, browser, and Interview Helper analysis. Local Whisper/audio remains separate. The product-specific tool harness, temporary draft validation, canonical-write review, progress-aware browser controls, and no-submit authority boundaries remain unchanged. Decisions: `docs/adr/0010-opencode-go-mixed-text-and-vision-routing.md` and `docs/adr/0009-luna-high-default-and-capability-contracts.md`; report: `docs/audits/AI_MODEL_CAPABILITY_BENCHMARK_FULL_2026-08-12.html`.

- Deep production acceptance and agent-tool refinement are complete. The accepted production Electron evidence covers realistic scroll/zoom/window edges, background-operation interruption and stale-state races, conversational profile/search proposals, application documents, sensitive job-scoped assets, direct user handoffs, and proposal-first Guided Edits. The durable milestone is in `docs/HISTORY.md`; the screenshot-backed review is `docs/audits/JOB_FINDER_DEEP_ACCEPTANCE_REVIEW.html`.
- The roadmap implementation is integrated from résumé import through the final safe application checkpoint. Durable current behavior lives in `docs/PRODUCT.md`, `docs/CONTRACTS.md`, and `docs/TESTING.md`; the product handoff is `docs/audits/JOB_FINDER_COMPLETION_REVIEW.html`.
- Job Finder now has one customer-facing journey: Profile → Find jobs → Shortlisted → Applications. Task center and Needs you remain separate global destinations.
- The normal journey is explicitly numbered Profile, Find jobs, Shortlisted, and Applications. Search plans are optional reusable campaign settings and the default plan is enough to begin; Resume approaches are optional reusable role-family rules reached from Shortlisted context.
- First-use Profile setup offers Light edit, Balanced rewrite, and Strong rewrite. Strong rewrite remains evidence-bound and review-required: generated facts and numbers are not invented, and no application is auto-approved or submitted.
- Shortlisted can prepare the next up to 10 eligible tailored drafts sequentially. Every draft still needs individual review and approval; preparation never exports, approves, queues, submits, or sends drafts automatically.
- Original CV and Tailor for this job are per-job choices. Settings supplies only the default for newly shortlisted jobs. Original-CV preparation verifies the selected file and digest without tailoring; tailored preparation requires the exact approved artifact and digest.
- Configured résumé generation asks the provider only for sparse evidence-cited prose proposals or abstention. Deterministic code owns candidate identity, chronology, complete work-history representation, skills, rendering, and fallback. Canonical employer/title/location metadata always wins over generated metadata.
- The generation evidence catalog now includes profile, experience, and project skills plus experience domain tags and project types, so the model can anchor stack- and domain-aware wording. Aggressive mode may elaborate plain-language engineering details around evidenced stack, product domain, and metrics, and experience/project bullets may cite profile-level skills as supporting evidence; invented named technologies, employers, dates, credentials, seniority, leadership, and new numbers still require saved evidence, and model-flagged inferred lines are counted in draft notes for pre-approval review.
- Discovery publishes settled API sources progressively, budgets by distinct retained jobs, and uses one collision-aware identity resolver for result merging and durable history. Changed, reactivated, inactive, known, and skipped state survives restart and appears in Search History/source health.
- Profile now gives Job sources its own large-library surface instead of embedding every full editor in Preferences. Catalog-wide search/status filters, 25-row pagination, quick enablement, one-at-a-time detailed editing, truthful enabled progress, exact deep links, and a non-passive nested-wheel handoff are integrated; EU-hosted Lever boards resolve through Lever's EU public API. Imported sources remain disabled until explicitly enabled.
- Fit scoring/session revision uses one typed 22-field posting projection for scoring and cache identity. Unknowns and hard conflicts remain conservative; material visible-rank changes retain an explanation.
- Every classified source/application blocker persists as an exact Needs you action. Done verifies the exact blocker and schedules at most one run/job/result/checkpoint-scoped `prepare_only` retry. Mixed queues continue past blocked items.
- Final submission and account creation remain unavailable and unauthorized. Browser opening is not login proof. No current live flow clicked a final control, requested credentials, or recorded submitted state.
- Manual application outcomes now require explicit campaign and application identities when a job is shared by multiple campaigns or has multiple application records; ambiguous records are rejected instead of being guessed. Named resume strategies enforce their base document, headline, skills, coverage, tailoring, and evidence policies as generation input, while strategy reuse remains advisory and never approves or readies an artifact. Technical discovery/source-debug failures, application-terminal technical failures, listing signals, batch sample reviews, simultaneous-application conflicts, and grouped-answer contradictions create idempotent local safeguard evidence, with explicit user-owned blockers excluded from technical-failure samples. Safeguard recovery remains reversible and prepare-only.
- Applications now includes a revisioned cover-letter/short-response workspace. Proposals are deterministically assembled from current approved profile evidence, retain exact job/application and optional attachment-question lineage, expose their evidence before approval, and become a verified CandidateAsset only after exact-revision approval. The user must still select and save the asset for the exact file question; export remains a separate local action. Focused contract/library/UI checks and the production Electron safe-preparation replay passed; broader live employer-form variety remains external acceptance work.
- Candidate Assets now enforce the approved local lifecycle. Imports default to `until_deleted`, with opt-in 30- and 90-day clocks beginning at successful import. Removal or expiry makes the asset unavailable immediately and places it in a seven-day Trash view; restore requires an explicit policy and starts a fresh clock. Startup and every asset operation retry expiry/purge enforcement, including strict aged-orphan cleanup after a one-hour in-progress safety window. Supporting-file application uploads use an adapter-owned byte loader that rechecks lifecycle, consent, size, and SHA-256 immediately before upload, so removal or tampering after initial selection blocks the write. Purge removes ordinary filesystem bytes and metadata without claiming forensic secure erase. Windows DACL hardening and generic PDF/DOCX/OCR extraction remain deferred scope.
- OpenCode Go is the default generative transport. DeepSeek V4 Flash uses Chat Completions with requested `max` reasoning for normal text and tool work; GPT-5.6 Luna uses Responses with `high` reasoning for image-only work. Runtime reasoning remains configurable, provider output stays schema-validated, and audio transcription remains local Whisper or an explicit audio model.
- The normal-resolution Computer Use audit remediation is integrated locally. Resume validation is job-scoped and blocks export visibly; application attachment copy uses the retained result; ended Interview Assist is intentionally inactive; popup OS-close state reconciles; opted-out media yields a healthy text-only mode; typed questions retain their source; Profile Copilot answers grounded advisory questions and avoids footer actions; browser bounds persist; failed discovery/source checks are honest and preserve provenance; and explicit target titles are optional when the profile provides an inspectable inferred scope. Audit and evidence: `docs/audits/DESKTOP_APP_COMPUTER_USE_USABILITY_AUDIT_2026-08-10.md`.
- The 2026-08-13 normal-screen closeout fixes the user-reported nested-wheel failure and the related application lifecycle edges. At 1440x920, the final production build moves the 177 px page header once, then scrolls the center results and right details panes by the exact 600 px wheel input; the left filters pane also advances, and an upward wheel at a pane boundary restores the outer header. Profile Copilot now stays docked as a compact 48 px launcher, clears Profile actions, and maximizes to the full 16 px-safe viewport (1408 px at a 1440 px window) before restoring to 480 px. Apply cancellation aborts active browser work, closes stale app-owned tabs, and cannot be overwritten by late results; graceful shutdown and hard restart both turn orphaned `running` preparation into a truthful failed/restartable run with no-submit wording. Balanced résumé tailoring keeps every usable work-history role visible and compacts weaker roles; aggressive mode may suggest hiding a weak role for explicit review. Historical and uninspectable: the final production harnesses then passed Profile setup/import/Copilot, Resume Studio edit/export/approval, apply queue consent/cancel/recovery, and Interview Helper setup-through-review, but all six cited artifact directories no longer exist locally: `apps/desktop/test-artifacts/ui/normal-screen-final-20260813/`, `apps/desktop/test-artifacts/ui/profile-setup-20260813-final-closeout/`, `apps/desktop/test-artifacts/ui/resume-workspace-20260813-final-closeout/`, `apps/desktop/test-artifacts/ui/apply-queue-controls-20260813-final-closeout/`, `apps/desktop/test-artifacts/ui/applications-queue-recovery-20260813-final-closeout/`, and `apps/desktop/test-artifacts/ui/interview-helper-basic-20260813-final-closeout/`.

## Current Acceptance Evidence

Every artifact path cited in this section was checked against this workspace on
2026-08-23. Directories and reports under `apps/desktop/test-artifacts/` are
local-only and untracked; several historically cited runs no longer exist here.
Bullets marked historical record what those past runs demonstrated when they
ran; they are uninspectable today and must be regenerated before being treated
as current evidence. Bullets whose paths still exist remain locally
inspectable. Inspectable historical evidence includes source-bound reports under
`apps/desktop/test-artifacts/ui/production-acceptance-*/`, normal-flow QA
captures under `apps/desktop/test-artifacts/ui/qa-final-pass-20260822/`, and the
live public-provider ranking summary under
`apps/desktop/test-artifacts/job-finder/diverse-live-audit/summary.json`;
durable written reviews under `docs/audits/` also remain inspectable. None of
this evidence accepts the current integrated source. It covers synthetic data
only and does not establish live-source
relevance, personal-résumé wording quality, configured provider/network
transport availability, or authenticated ATS behavior; those stay user-owned
per the external-acceptance constraints above.

### Job Finder

- Historical deep production acceptance produced 104 screenshots across the deep matrix, résumé flow, and first-run flow, with zero renderer/console errors and zero document/main horizontal overflow. It covered minimum-window and native 125–200% zoom states, long/nested scrolling, background navigation/settings changes, proposal-before-approval, application preparation, queue recovery, and the final safe checkpoint. Review: `docs/audits/JOB_FINDER_DEEP_ACCEPTANCE_REVIEW.html`.
- Historical, uninspectable — Greenhouse original-CV flow: at the time, current Glean listing; synthetic résumé import; exact original asset unchanged; seven supported questions; upload verified; visible `Apply` control; final control untouched; final-submit authorization false; temporary workspace deleted. Report path `apps/desktop/test-artifacts/job-finder/complete-flow-current-greenhouse/prepare-only-smoke-report.json` no longer exists locally.
- Historical, uninspectable — Ashby tailored-CV flow: at the time, current Constructor listing; five-section one-page grounded draft; zero validation issues; exact approved artifact; five questions; upload verified; visible `Submit Application`; untouched. Report path `apps/desktop/test-artifacts/job-finder/complete-flow-current-ashby-tailored-final-20260809/prepare-only-smoke-report.json` no longer exists locally.
- Historical, uninspectable — Workday anonymous flow: at the time, current AMAT listing; `site_login_required`; visible instruction to sign in manually and retry; no credentials or inferred authentication; no submitted state. Report path `apps/desktop/test-artifacts/job-finder/complete-flow-current-workday-final-20260809/prepare-only-smoke-report.json` no longer exists locally.
- Historical, uninspectable — fresh first-run evidence covered import, setup Copilot, exact imported-field review links, readiness, one-row desktop navigation, nonblocking optional suggestions, and the Profile → Find jobs continuation. Artifact directory `apps/desktop/test-artifacts/ui/production-user-audit-20260809-final2/` no longer exists locally.
- Live public-provider ranking evidence covers three synthetic profiles and current Greenhouse, Lever, and Ashby inventories. Engineering retained 1 of 18 as reviewable, support retained 2 of 18, and career change retained 4 of 17; every generated résumé had zero unsupported numeric claims. Report still locally inspectable: `apps/desktop/test-artifacts/job-finder/diverse-live-audit/summary.json`.
- Historical, uninspectable — Resume Studio current-at-the-time-build evidence covered preview failure/recovery, claim-proof disclosure, template selection, live editing, a successful configured Luna-high Guided Edits response, export, approval, return to Shortlisted, the visible primary Prepare application action, and the safe Applications stop. Artifact directory `apps/desktop/test-artifacts/ui/resume-workspace-luna-high/` no longer exists locally.
- Historical, uninspectable — Original-CV evidence named the exact imported asset, exposed the per-job Original/Tailored radio choice and sensitive-detail warning, and kept Prepare application visible. Artifact directory `apps/desktop/test-artifacts/ui/original-cv-flow/` no longer exists locally.
- Historical, uninspectable — Action Inbox current-at-the-time-build evidence covered 1440 px, 900 px, and native 200% zoom. Every Open/Done/Skip/Cancel control and shell destination remained reachable with zero horizontal overflow; browser-only credentials and false account/final-submit authority were recorded. Report path `apps/desktop/test-artifacts/ui/action-inbox/capture-report.json` no longer exists locally.
- Historical, uninspectable — the 507-source Job sources acceptance at 1440×920 rendered 25 compact rows, searched the complete catalog, opened one detailed editor, kept all five Profile tabs visible, produced no horizontal overflow or renderer errors, and proved a wheel positioned over the inner source pane moves that pane without also advancing the outer Profile scroller. Report path `apps/desktop/test-artifacts/ui/job-sources-library-507-20260811/capture-report.json` no longer exists locally.

### Interview Helper shared-platform regression

- Historical, uninspectable limited Windows regression: the then-current production build opened two visible answer/transcript popup windows. Typed popup chat, temporary screenshot attachment, copy, hide/reopen, resize, persisted bounds, renderer reload, and configured local STT readiness passed. Raw image bytes were not retained. Live microphone/system-audio hardware capture was not repeated in this pass. Report path `apps/desktop/test-artifacts/ui/interview-helper-basic/report.json` no longer exists locally.
- This is a limited Windows regression, not a new Interview Helper product-expansion claim.

### Configured model comparison

- Sparse Luna-high generation: `technical_matrix` 17.222 s with 0 accepted / 1 rejected rewrite; `classic_ats` 23.126 s with 1 accepted / 0 rejected. All deterministic quality gates remained 1.0.
- Felidae on the same synthetic cases: 9.098 s and 9.821 s, with 0 accepted / 5 and 0 accepted / 4. It remained faster, while fallback kept quality gates at 1.0.
- Luna improved accepted grounded contribution and avoided the earlier timeout; it did not beat Felidae's latency in this narrow sample. No private résumé was transmitted.
- The final configured recheck completed `frontend_platform` in 11.207 s and `grounded_baseline` in 19.819 s. All gates were 1.0 and sparse generation safely abstained; the separate live Guided Edits journey succeeded in 28.9 s.

## Verification State

- The sealed-acceptance/persona tooling is focused-green but unaccepted; the
  broad non-Electron gate is stale for the current source, and the active
  chain with its restart rules lives in
  `docs/exec-plans/active/job-finder-sealed-acceptance-and-blind-personas.md`.
- The broad non-Electron gate passed before the latest app-wide Job Finder
  field work, Profile deep-link and navigation scroll-jump repairs,
  durable-capacity, company-identity/evidence, exact-lineage, and UI truth
  source changes, so it is stale against the current source. The focused
  suites for that work are green as mandatory guardrails and integrity checks;
  they are not UX acceptance. Under the coming freeze both the broad gate
  (`pnpm verify`) and the source-bound evidence run (`pnpm test:evidence`)
  must rerun with an unchanged fingerprint, and neither substitutes for live
  current-source Electron sessions. Immutable-snapshot Electron acceptance and
  the 14 blind persona sessions remain pending. No current live-provider,
  accessibility, authenticated-ATS, persona, exact-build Electron, or final
  release acceptance claim is established.
- The six-slice phase-two batch is implementation-complete. The integrated focused closeout passed 59 test files / 770 tests with zero failures, including 4 safeguard files / 92 tests; navigation checks passed 9/9 reachability and 16/16 shell assertions. Affected lint, typecheck, Prettier, and `git diff --check` checks passed, and the production desktop build passed. The phase-two Electron harness completed 40 captures at 1440×920, 1280×720, and native 200% zoom with zero runtime errors, safety violations, horizontal-overflow findings, or unreachable controls; nested-scroll movement passed 40/40. The recorded artifact directory `apps/desktop/test-artifacts/ui/phase-two-absolute-final/` no longer exists locally, so these harness results are historical claims rather than inspectable evidence; no Electron processes remained. The initial broad attempt was blocked before scripts ran; the later 2026-08-19 repository-wide gate passed after release-hardening integration.
- The AI evaluation package completed 330/330 unique synthetic outcomes and generated an exact-completeness report. Its focused typecheck, lint, and 19-test suite cover frozen corpus construction, seeded lane scheduling, visual/browser fixture diversity, grading, checkpoint/resume behavior, stale-artifact rejection, and full-report completeness.
- Historical phase-one verification passed guidance, documentation, source-generic structure, all package lint and typecheck tasks, the 52-case/four-cohort fit calibration, and all 273 test files / 2,028 passing tests with one intentional skip. The full suite used four workers on Windows so Chromium screenshot and strict wall-clock tests were not starved by unrelated parallel workers; the repeated-source benchmark independently passed its unchanged 2,000 ms budget at 1,219 ms. This is not evidence that the current phase-two broad gate passed.
- A historical consolidated gate caught and fixed a Profile Save test lint violation, source-only fresh workspaces incorrectly appearing started, and default five-second timeouts on heavy multi-template résumé benchmark cases. It does not establish a current broad-gate pass.
- The first broad run exposed identity/ledger host timings of 2,119 ms and 2,435 ms against unchanged 2,000 ms budgets. Production normalization/indexing was optimized without raising budgets or weakening collision safety. Three focused runs measured the 10k path at 815–1,045 ms and repeated unchanged-source work at 348–356 ms; both also pass inside the final broad suite.
- Focused batches for résumé grounding/coverage/import, progressive discovery, application recovery, workspace deltas, performance evidence, responsive shell/action inbox, Resume Studio, and Interview Helper are green. Exact commands and evidence live in `docs/TESTING.md` and the linked audit reports.
- The 2026-08-11 audit-remediation batch passes focused component/service/runtime regressions plus direct Contracts, Interview Helper, Job Finder, Browser Runtime, AI Providers, and Desktop typechecks. Safe deterministic production-Electron acceptance covers the normal-window presentation and pointer-owned scrolling; configured live provider transport and macOS popup/title-bar behavior remain external checks.

## Durable Constraints

- `packages/job-finder` owns Job Finder orchestration.
- `packages/browser-agent` owns browser workflow policy, prompts, and structured outputs; `packages/browser-runtime` stays generic.
- Discovery and source-debug remain source-generic. Board-specific rescue logic in core product flow is debt, not a pattern.
- Compensation matching and catalog filtering compare annualized equivalents when saved and listed currencies explicitly match, including monthly-versus-yearly wording; unknown or cross-currency evidence stays neutral, and match context/posting fingerprints use logic revision 5 (scorer version 6) so persisted assessments are recalculated safely.
- Cross-package and Electron boundaries stay typed and schema-validated; no untyped IPC or `any`.
- Credentials, security answers, CAPTCHA solving, MFA, legal consent, external account creation, and final submission remain user-owned.
- Visual analysis is evidence-only. It cannot create selectors, browser actions, candidate facts, submission guidance, or saved-job policy.
- Interview Helper capture, audio, screenshots, overlays, cue generation, retention, and Job Finder write-back remain explicit, visible, auditable, and adapter-owned.

## Remaining External or User Review

- Complete the immutable-snapshot production harness work, run the final sealed
  acceptance against stable source, externally custody the expected seal digest,
  prepare the 14-workspace custody wave from that accepted app, and only then
  launch independent blind persona sessions. The exact sequence, restart rules,
  and thresholds are owned by
  `docs/exec-plans/active/job-finder-sealed-acceptance-and-blind-personas.md`.
- Review the integrated Job Finder with the user's private résumé before deployment; synthetic quality gates cannot establish personal wording preference.
- Continue an authenticated Workday checkpoint only after a voluntary browser sign-in and explicit Done confirmation.
- Validate Interview Helper capture/audio behavior on macOS and Linux target hosts.
- Run screen-reader and personal reduced-motion review during deployment acceptance; current automated/native evidence covers keyboard focus, non-color status, 900 px, and zoom coverage whose current acceptance point is native 125% (historical 200% runs remain historical only).
- Computer Use is available on this host and was used for the normal-resolution production-Electron audit and remediation replay. The isolated run did not exercise personal credentials, final submission, real media, or a live configured provider.

## Deferred Product Scope

- Candidate Asset timed retention, Trash, restore, and ordinary purge are implemented. Stronger per-user Windows DACL hardening, generic PDF/DOCX text extraction, and OCR remain intentionally deferred; current `0700`/`0600` modes are best-effort Node permission hints on Windows, not an explicit DACL or secure-erase guarantee.

## References

- Deep acceptance review: `docs/audits/JOB_FINDER_DEEP_ACCEPTANCE_REVIEW.html`
- Product completion review: `docs/audits/JOB_FINDER_COMPLETION_REVIEW.html`
- Living release audit: `docs/audits/PRODUCT_QUALITY_RELEASE_AUDIT.md`
- Tracks: `docs/TRACKS.md`
- Product: `docs/PRODUCT.md`
- Architecture: `docs/ARCHITECTURE.md`
- Contracts: `docs/CONTRACTS.md`
- Testing: `docs/TESTING.md`
- Completed milestones: `docs/HISTORY.md`
