# Testing

## Default Checks

- broad repo check: `pnpm verify`
- correctness suite: `pnpm test:correctness`
- timing-sensitive release checks, always serial and without coverage: `pnpm test:performance`
- source-bound release evidence manifests for both canonical suites: `pnpm test:evidence`
- coverage report, separate from correctness and timing: `pnpm test:coverage`
- fast preflight: `pnpm verify:quick`
- affected-only check: `pnpm verify:affected`
- docs/guidance only: `pnpm validate:docs-only`
- package-local validation: `pnpm validate:package <package-name|alias|path>`
- source-generic guard: `pnpm source-generic:check`
- formatting: `pnpm format`, `pnpm format:check`
- dead-code cleanup: `pnpm knip`

`pnpm test` is the release test entry point. It runs correctness first, then the
serial performance files. Coverage is intentionally separate: instrumentation
must not affect the product timing gate, and a coverage report cannot substitute
for correctness or performance evidence. The repeated-source discovery check
must satisfy both CPU and wall-clock budgets below 2,000 ms; the 10,000-entry
ledger check retains its hard wall-clock budget below 2,000 ms.

## Current settled visual/safety evidence (2026-08-31)

- Focused import CAS/identity gates pass, but live reproduction of the late
  native file-picker case remains pending. This is a focused pre-freeze result,
  not sealed Electron evidence.
- Applications recovery actions are fixed. Current-build 1440/1280 captures
  show valid actions at natural width with start alignment. Focused uncertainty
  coverage proves that retrying a `null`-receipt result fails closed.
- The current-build 1280 Resume Studio capture keeps preview and tools visible
  with 20 notes and 4 blockers; Open editor reaches the exact focus target and
  announces it. The AI suggestion flow is connected to an explicit proposal
  Accept/Reject decision, but no live AI proposal has been exercised and the
  targeted allowlist remains a P2 follow-up.
- The collapsed wordmark is painted and visible in current-build 1440/1280
  captures. Profile Copilot's compact-footer capture is
  `/var/folders/nh/pj6dg1rj2kvdgrh75f7b5krr0000gn/T/copilot-footer-current-1280x720.png`:
  Send is top `589.95`, bottom `629.95`, and height `40`; the long textarea
  scrolls internally. Native 125% remains unestablished.
- The prior sealed acceptance and persona wave are invalid after these source
  changes. Keep the goal **ACTIVE** and the hard-freeze chain pending; once the
  tree is settled, rerun `pnpm verify`, `pnpm test:evidence`, and the immutable
  production-acceptance chain before any new seal, ATS binding, or persona wave.

Authority changes require the strict contract/repository suites plus the real
Desktop startup, main-route, service, and preload boundaries. Current focused
files are `application-authority-contracts.test.ts`,
`application-authority-management.test.ts`,
`application-authority-repository.test.ts`,
`application-authority-migration.test.ts`,
`application-submission-policy.test.ts`,
`application-submission-orchestrator.test.ts`,
`create-workspace-service.startup-recovery.test.ts`,
`application-authority-service.test.ts`, `job-finder-authority.test.ts`, and
`preload/index.test.ts`. The renderer boundary is covered by
`settings-application-authority-section.test.tsx` plus the Settings navigation
suite; repository coverage includes atomic replacement, one-active uniqueness,
child revocation, concurrency, SQLite reopen parity, and full reset with
persisted lifecycle children. The Settings suite also covers local-time expiry
round-trip and revocation of an existing elevated envelope without enabling its
editing. Automated checks must never expose or invoke a grant, arm, browser
final action, or real employer submission channel.

Uncertain-outcome recovery coverage must prove strict renderer DTO rejection,
main-owned evidence/timestamps/current-revision binding, preservation of the
original uncertainty, atomic exact-lineage result/receipt/ApplicationRecord
projection, stale and duplicate no-mutation behavior, and SQLite reopen parity.
Applications must require a second explicit confirmation, suppress retry and
final-submit controls while uncertain, route Task Center to manual verification,
and prefer the durable tri-state receipt over stale legacy run state. The
isolated production-Electron replay is
`apps/desktop/scripts/run-job-finder-authority-outcome-wave.mjs`; it uses only
synthetic state and must prove restart persistence, both operator resolutions,
and that Settings remains prepare-only. Its output is diagnostic pre-freeze
evidence, never real ATS, sealed, accessibility, or autonomous-submit acceptance.

Approved-answer snapshot coverage must prove canonical order-independent SHA-256,
duplicate-entry rejection, append-only revision CAS, stale/conflict no-mutation,
in-memory/file parity, SQLite reopen, migration, and reset behavior. Desktop
coverage must prove zero-answer blocked readiness, only work-authorization and
sponsorship as mandatory baseline kinds, custom-kind counting, unchanged digest
surviving unrelated Profile revisions, content edits becoming stale, strict IPC
output parsing, and a two-step Settings approval with no grant/arm/submit control.
The isolated built-Electron replay is
`apps/desktop/scripts/run-job-finder-authority-readiness-wave.mjs`; at 1440x920
and 1029x860 it must prove not-approved -> current -> restart -> answer edit ->
stale -> revision 2 -> restart, while final submission remains unavailable.
Its output is ignored diagnostic pre-freeze evidence, not autonomous, ATS,
accessibility, persona, sealed, or release acceptance.

Decision-policy coverage must prove canonical digest recomputation, distinct
policy versus answer-snapshot drift, exact campaign/canonical-origin binding,
scope/resume/capacity rejection before mutation, active-grant preservation on
every rejected compound transition, every finite mandatory stop, autonomous
grant rejection, post-arm drift recovery to permanent uncertainty, and absence
of any public low-level consume-or-arm repository primitive. These suites use
only synthetic records and never connect a browser final-action hand.

The wave9o authority Settings replay uses a fresh isolated Electron user-data
directory with the test API only for synthetic workspace setup. Captures at
1440×920 and 1029×860 must show prepare-only as the sole available mode,
elevated modes unavailable, explicit policy fields, no body-width overflow, and
the authority heading below both the compact shell navigation and sticky
Settings subnav after anchor navigation. Current ignored evidence is under
`apps/desktop/test-artifacts/ui/authority-wave9o-*`; the final 1029×860 replay
records `sectionTop=176`, visible-heading top `193`, compact-shell bottom `109`,
and exact body width `1029/1029`.

## Release Evidence Manifests

- `pnpm test:evidence` runs the canonical `test:correctness` then
  `test:performance` scripts exactly as declared in the root `package.json`,
  adding only default/json/junit Vitest reporters with explicit output files,
  and records one versioned evidence manifest for the run.
- Raw evidence (exact executed argv, command line, repo-relative cwd, start and
  completion timestamps, exit status, signal, spawn errors, stdout/stderr logs,
  structured JSON/JUnit results, Vitest counts, explicit skip/todo lists,
  JUnit summaries, JSON/JUnit consistency results, and per-file bytes plus
  SHA-256) is written to the ignored
  `test-artifacts/release/<runId>/evidence-manifest.json` next to those files.
  A compact tracked mirror is written to
  `docs/audits/evidence-manifests/<runId>.manifest.json` and independently
  retains that same per-stage command, timing, outcome, count, skip, and hash
  evidence so it can be verified without the raw run directory.
- Each manifest binds the run to a SHA-256 source fingerprint computed
  immediately before and after the stages using the same enumeration as the
  release acceptance harness; before/after equality compares every scalar
  field (recipe, digest, file/symlink/deletion counts), so a divergence in any
  of them fails the run's outcome even when both stages pass. Fingerprint
  digests are strict 64-character lowercase hex or `null`; when a digest is
  unavailable the reason is stored in a separate `unavailableReason` field
  instead of being mixed into the digest value.
- Source enumeration is NUL-safe and kind-bound:
  `git ls-files -z -co --exclude-standard` enumerates candidate paths and
  `git ls-files -z -d` separately declares tracked worktree deletions, both
  read-only — staging, restoring, or otherwise mutating user-owned work or the
  index is never required, so an intentionally dirty tree (including many
  unstaged deletions) fingerprints stably. Every enumerated path is
  classified explicitly: ordinary files record path/mode/bytes/sha256; a
  contained symlink that resolves back to an enumerated ordinary file records
  its target, resolved path, and mode; and an ENOENT becomes an explicit
  deleted record only when Git declares that deletion — otherwise it is a
  named race failure. Directories, special entries, broken symlinks, escaping
  symlinks, and symlinks whose target falls outside the enumerated
  ordinary-file set abort collection with a named-path error instead of being
  silently skipped, sentinel-hashed, or mis-splitting a quoted filename. The
  digest folds one stable-JSON line per path under a named `recipe` id (there
  is no magic digest sentinel), and each result reports `fileCount`,
  `symlinkCount`, and `deletedCount`; the declared deletion set must
  additionally stay a defensive subset of the enumerated paths. Since recipe
  `nul-enumerated-stable-json-lines-v3`, ordinary-file and symlink records
  bind permission bits (`mode`, 0o777): a chmod-only mutation changes the
  digest while leaving every count identical, and restoring the exact bits
  restores the exact prior digest. The versioned recipe id must be bumped
  whenever record shape or classification semantics change, so evidence from
  different recipes is never comparable by digest value alone.
- Retention is truthful by construction: the run directory is reserved only
  after the before-fingerprint succeeds, and an after-fingerprint failure is
  wrapped so completed stage evidence is finalized into a failed manifest
  whose `after` fingerprint carries `digest: null` plus `unavailableReason` —
  never a misleading identical-digest "changed" reason — while the run exits
  nonzero.
- Mirror writes are contained: a mirror is written or rebuilt only after its
  `runId` matches the exact release pattern and the destination resolves
  inside `docs/audits/evidence-manifests/`. The canonical artifact-root and
  evidence-path containment hardening in the acceptance wrapper is unchanged.
- Both fingerprint implementations deliberately exclude the generated mirror
  directory `docs/audits/evidence-manifests/` (exact anchor
  `^docs/audits/evidence-manifests(?:/|$)` after `/`-normalization) in addition
  to dependencies, build output, test artifacts, and `.git`. Mirrors are
  durable release evidence once an authorized Git commit lands them, but they
  are not product input: excluding them prevents the recursion where writing
  `<runId>.manifest.json` would change the very source fingerprint it
  evidences. Every other human-authored source or doc — including everything
  else under `docs/audits/` — remains fully bound. Mirror integrity is
  protected separately by its own self-hash (`mirrorManifestSha256`) and the
  stored raw-manifest binding, never by the source fingerprint. Exclusion
  parity between the collector and the acceptance inventory plus the
  ignore-mirror/detect-adjacent-edit behavior are enforced by the collector
  self-check (`node scripts/collect-release-evidence.mjs --self-check`) and by
  `pnpm --filter @unemployed/desktop
test:job-finder-production-acceptance:static`.
- Digests use one canonical recipe: recursively sort object keys (array order
  is preserved), serialize with `JSON.stringify` without extra whitespace,
  encode UTF-8, and take lowercase SHA-256 hex. New manifests carry
  `schemaVersion: 4`; older committed mirrors keep their original
  point-in-time schema version and are never rewritten in place. Two
  different subjects are hashed separately and never
  share a digest value:
  - `manifestSha256` on the raw manifest has subject
    `raw_full_manifest_without_manifestSha256` (the full raw manifest minus its
    own digest fields).
  - `mirrorManifestSha256` on the tracked mirror has subject
    `mirror_manifest_without_mirrorManifestSha256`: since schemaVersion 3 it
    covers the full mirror minus only that one field, so both subject strings,
    `rawManifestSha256`, outcome, failure reasons, stage commands, counts, and
    artifact hashes all sit inside the self-hash scope. Rewriting the stored
    raw-manifest pointer or its subject therefore invalidates the mirror
    digest instead of silently rebinding durable evidence to other raw
    output. The mirror also stores `rawManifestSha256` with the raw subject so
    either artifact can be re-derived and checked independently.
- The outcome fails closed: a stage whose parsed results report
  `success=false`, any failed test, zero total tests, a missing or unparsable
  required JSON/JUnit output, or totals/failures/errors/skips that diverge
  between the JSON and JUnit reports fails the run even when every exit code
  is zero. Schema or parser failures remain failures.
- Stages are spawned shell-free through the pnpm JavaScript entry point
  resolved from `npm_execpath`, a vendored `pnpm/bin/pnpm.cjs`, or a PATH
  `pnpm` Node script, executed via the current Node executable; `.cmd` shims
  are never spawned, and script strings containing shell metacharacters are
  rejected before execution.
- Stage exit codes are the only budget gate. Benchmark milliseconds appearing
  in logs or reports are diagnostic context and never authoritative acceptance
  values. Host basics are recorded without secrets.
- A failing stage or changed source still retains truthful failed evidence and
  exits nonzero; a passing manifest is never written for a failing run.
- Artifact lifecycle: raw run directories are local-only QA output and may be
  deleted at any time. The mirror records `gitTrackingStatus`
  (`tracked`/`untracked`) as point-in-time state observed at generation; the
  collector never commits anything, so the flag can go stale after the fact
  and actual durability comes from Git history, not the recorded value.
  Evidence becomes durable only once the mirror file is committed to Git; an
  untracked mirror is still local-only state. Release closeouts must
  therefore cite the manifest `runId` plus its digests from a committed
  mirror, and new release claims require a fresh run whose fingerprint
  matches the released source rather than reuse of an older manifest.
- If a raw manifest exists but its mirror predates the current schema, regenerate
  the mirror without rerunning tests:
  `node scripts/collect-release-evidence.mjs --rebuild-mirror test-artifacts/release/<runId>/evidence-manifest.json`.
  The rebuild validates the source-manifest schema it reads (kind, run id,
  outcome, host/git facts, and fingerprint side shapes) and preserves the
  recorded schema version, outcome, and failure reasons verbatim; legacy
  manifests without the kind-bound fingerprint fields project with explicit
  nulls instead of invented values. Before anything is rebuilt, the raw
  subject digest is recomputed and, when the raw manifest stores a
  `manifestSha256`, it must match exactly — a mismatch proves the raw bytes
  were altered after collection and aborts the rebuild as tampered output.
  Legacy raw manifests written before that digest field existed remain
  explicitly supported: they rebuild with the freshly recomputed digest bound
  in the mirror. Both digests are recomputed under the current recipe, and a
  failed outcome is never upgraded to passed.

## Acceptance Freeze And Durability Rules (2026-08-24)

- Before the hard freeze begins, a simplification pass and live dogfooding of
  the current-source Electron app complete outside the freeze; accepted
  changes land before freezing starts.
- Evidence hierarchy for the chain: live current-source Electron sessions are
  the primary UX evidence. The `pnpm verify` and `pnpm test:evidence` reruns
  under the freeze remain mandatory guardrails and integrity checks; passing
  them never substitutes for live use. As of 2026-08-24 the sealed acceptance
  tooling is static-green — its static contract validation passes — while its
  runtime sealed run remains unexecuted for the current source; do not cite a
  runtime or seal result that has not run.
- Hard freeze: before the final `pnpm verify` and `pnpm test:evidence` runs,
  stop every source, documentation, and dependency writer. Keep that freeze
  through the accepted sealed run and persona preparation. Only explicitly
  generated output may appear where a command writes it by design: desktop
  test artifacts under `apps/desktop/test-artifacts/`, build output, and the
  excluded evidence mirror
  `docs/audits/evidence-manifests/`. Any other changed byte invalidates
  everything downstream and forces regeneration from the earliest invalidated
  step.
- Never clean user-owned untracked files. Inventory and preserve them;
  generated QA output is the only removable class, and only when an explicit
  instruction calls for its removal.
- Local evidence can execute without any commit: uncommitted local runs are
  valid execution evidence for the chain. Durable Git release closeout
  requires explicit user authorization of that exact repository action; agents
  must neither ask for nor perform commits during the acceptance chain.

## Native OS dialogs in automated replays (2026-08-25)

- Browser/CDP automation cannot operate native OS Save As/Open dialogs: they
  live outside the renderer, and CDP-synthesized input does not drive
  Electron's native input pipeline (the same limitation that makes CDP key
  events useless for native zoom). No timeout-based claim substitutes for
  observing the dialog outcome.
- Automated product replay may use the existing explicit desktop test API
  (`UNEMPLOYED_ENABLE_TEST_API`) to bypass only the save chooser — tailored
  PDF export then writes to its default destination without showing a dialog.
  That proves export/approval wiring, never the human dialog decision.
- The human Save/Cancel side must be observed separately in production mode
  (test API absent) through genuine OS interaction with the frontmost
  dialog. Never relabel an automated bypass run as covering the dialog leg.
- Résumé import/replacement replays that cross a native open dialog are gated
  on genuine OS keyboard/mouse selection of the exact file — navigate to or
  type the exact path in the frontmost dialog and confirm; renderer events,
  CDP keys, or fixture mutation never substitute for that selection.

## Strict ATS wrapper policy (2026-08-23)

- The Greenhouse, Ashby, and Workday acceptance wrappers
  (`pnpm --filter @unemployed/desktop test:job-finder-complete-flow`,
  `pnpm --filter @unemployed/desktop test:job-finder-ashby-flow`, and
  `pnpm --filter @unemployed/desktop test:job-finder-workday-flow`) force
  `JOB_FINDER_PREPARE_ONLY_AUTHORIZE_INTERMEDIATE_WRITES=0` by default, even
  when an ambient authorized-write value is exported. Intermediate ATS writes
  such as resume-upload autosave therefore stay blocked in every default run.
- Strict runs may end in a truthful manual handoff when upload/autosave writes
  are blocked: Greenhouse and Ashby still target the named final control
  without submit, anonymous Workday targets its expected `site_login_required`
  human handoff, and any unreachable step is reported as a truthful blocker
  rather than papered over. `resumeUploadVerified` is not required evidence in
  strict mode; a missing upload verification is the honest strict-mode outcome,
  never grounds to relabel a run or to demand an authorized-write rerun.
- `JOB_FINDER_COMPLETE_FLOW_AUTHORIZED_WRITE_DIAGNOSTIC=1` is diagnostic-only.
  It authorizes intermediate writes, suffixes the run label with
  `-diagnostic-only` (never double-suffixing an already diagnostic label), and
  deletes all four acceptance-binding variables (`RUN_DIR`, `MANIFEST`,
  `MANIFEST_SHA256`, and `EXPECTED_SEAL_SHA256`), so the report stays unbound
  (`acceptanceMode: unbound_diagnostic`, `releaseEvidence: false`).
  Authorized-write diagnostics are categorically not release evidence and must
  never be cited in release claims or closeouts.
- Bound release evidence requires all of: the exact source/build manifest with
  fingerprints verified unchanged before and after the run
  (`acceptanceMode: bound_to_exact_build_manifest`), strict intermediate-write
  mode, `submittedNeverOccurred: true`, final-submit and account-creation
  authority false, isolation cleanup of the temporary user-data directory, and
  an accepted per-ATS outcome (Greenhouse/Ashby final checkpoint without submit
  or a classified strict intermediate-write blocker; anonymous Workday
  `site_login_required` or the same fully classified strict intermediate-write
  guard when that guard stops the flow first). Cite the command plus the manifest `runId` and
  `manifestSha256`; never pin a volatile artifact path as the evidence anchor.
- Automated evidence must never include credentials, CAPTCHA solving, MFA,
  legal consent, account creation, or final submission; these remain per-job,
  user-owned actions.
- Wrapper strictness itself is enforced by
  `apps/desktop/scripts/ats-flow-wrappers-policy.test.ts`.

### Post-seal bound runs (2026-08-24)

- After the sealed production acceptance run exists, run the strict ATS
  wrappers only in bound mode and only through the `:built` variants. The
  non-suffixed wrappers start with a rebuild, which would violate the freeze
  and invalidate the sealed build identity. Export the four acceptance
  variables, then invoke the wrappers:
  ```sh
  export JOB_FINDER_ACCEPTANCE_RUN_DIR="<sealed production-acceptance run directory>"
  export JOB_FINDER_ACCEPTANCE_MANIFEST="$JOB_FINDER_ACCEPTANCE_RUN_DIR/build-manifest.json"
  export JOB_FINDER_ACCEPTANCE_MANIFEST_SHA256="<manifest SHA-256 recorded by the sealed run>"
  export JOB_FINDER_ACCEPTANCE_EXPECTED_SEAL_SHA256="<externally custodied acceptance seal SHA-256>"
  pnpm --filter @unemployed/desktop test:job-finder-complete-flow:built
  pnpm --filter @unemployed/desktop test:job-finder-ashby-flow:built
  pnpm --filter @unemployed/desktop test:job-finder-workday-flow:built
  ```
- Bound mode verifies the whole sealed bootstrap before anything launches —
  manifest digest and live-worktree source inventory equality, final report
  custody, accepted-app inventory and Electron identity, and the expected seal
  digest against the externally custodied value — and then launches the sealed
  accepted app instead of worktree output. Missing or mismatched binding fails
  closed as `failed_acceptance_binding`.
- Expected strict outcomes stay distinct: Greenhouse and Ashby may end at
  `passed_final_checkpoint_without_submit` or at the truthful classified
  intermediate-write guard `passed_safe_blocker_without_submit`; the latter is
  never relabeled as reaching the final checkpoint. Anonymous Workday may end
  at the `site_login_required` human handoff
  (`passed_expected_human_handoff_without_submit`) or at that same classified
  intermediate-write guard when the guard is reached first. Any other outcome
  fails the run.
- These wrappers select current public vacancies over the network, so they are
  supporting external-network evidence about the sealed app. They complement,
  and never deterministically replace, the internal immutable-snapshot
  acceptance run.

## Job Finder exact-build production acceptance (2026-08-20)

- Run `pnpm --filter @unemployed/desktop ui:job-finder-production-acceptance`
  only after the final source and documentation are stable. The wrapper builds
  once, records Git and dirty-tree metadata plus a sorted source fingerprint,
  hashes the main/preload/renderer output, unsets `ELECTRON_RENDERER_URL`, and
  launches only the recorded `file:` renderer bundle.
- The wrapper runs fresh, scale, and error/recovery components in unique isolated
  user-data directories. It fails on a changed source or bundle fingerprint,
  missing scenario ID, renderer or main-process error, failed capture, clipping,
  unreachable navigation, unsafe application/account action, cleanup failure,
  or a report from a different build.
- Required visual/runtime coverage includes the minimum supported width, 1440 px
  desktop, practical native Electron 125% zoom at a normal desktop window, long
  labels, truthful zero and populated states, errors and recovery, real wheel
  and keyboard scroll chaining, and at least 1,001 persisted jobs after
  hydration. Cold usable-shell and warm route-switch measurements are
  hard-gated and tied to renderer timing marks. On Windows,
  the canonical cold measurement runs from the actual Electron main-process
  start to the committed interactive opening shell; the report also retains
  Playwright's outer shell/inspector launch duration as a diagnostic so the
  test runner's `cmd.exe` transport is not mistaken for product startup work.
- Native Electron 200% zoom was removed from current acceptance by user
  decision on 2026-08-24: at 200% the shell collapses into a mobile-like layout
  with low diagnostic value for a desktop product. Practical native Electron
  125% zoom is the current low-vision acceptance point; the minimum supported
  window stays 1024x720 with normal desktop checks. Historical runs that
  covered 200% remain truthful historical evidence only. The sealed wrapper's
  runtime matrix now enforces this bar across every executed component: fresh,
  scale, and error/recovery all run their zoomed scenarios at native
  `webContents` zoom factor 1.25 (CSS ~1152x736 at the 1440x920 window,
  keeping the desktop-like layout), compact desktop coverage stays at normal
  100% zoom at the minimum supported size, and the accepted-app
  production-tester probe requests 1280x720 at native zoom factor 1.25. No
  current acceptance component requests zoom factor 2 or carries a `zoom200`
  scenario ID; only deliberate validator rejection fixtures reference the
  removed 2.0 bindings to prove they fail closed.
- Launch zoom is deterministic regardless of user-data-root history. Chromium
  persists per-origin zoom levels inside the Electron user-data root and
  restores them at navigation-commit time — after app binding runs — so a
  reused root (repeated tester launches, persona workspaces, a previous
  zoomed wave) would otherwise let a previous session's factor decide the
  next launch. The desktop shell therefore owns exactly one zoom factor per
  main window (`apps/desktop/src/main/setup/window-zoom.ts`): an explicit
  tester request (`UNEMPLOYED_STARTUP_ZOOM_FACTOR` under
  `UNEMPLOYED_TESTER_SESSION_GEOMETRY=1`) is adopted as that owned factor,
  asserted natively on first paint, and re-asserted after every completed
  main-frame load, so requested native 1.0/1.25 beats restored host zoom on
  fresh loads, reloads, and bounded recovery reloads alike. Without an
  explicit request every fresh main window deterministically starts at native
  100% (the documented product default); user zoom remains session-owned with
  Ctrl/Cmd+0 reset and survives in-session reloads, but no stale host zoom
  from disk can ever decide launch zoom. This was proven with a minimal
  isolated Electron probe (2026-08-26, Electron 35.7.5): pre-load
  normalization alone lost to persisted host zoom (1.25 observed), while
  post-load reassertion won (1.0 observed) and left no divergent residue.
- Sealed viewport evidence is internally consistent at every zoom factor: the
  static contract binds observed CSS geometry to requested physical /
  expected native zoom within ±1 CSS px (Chromium measures CSS as whole
  pixels), while physical size and native zoom stay exact. Evidence that is
  physically exact but carries stale CSS measured at another zoom — for
  example CSS 1440x920 recorded at native 1.25 where the rendered content area
  is actually 1152x736 — fails closed instead of passing.
- The wrapper also fails closed when ANY capture entry from fresh, scale, or
  error/recovery records a `nativeZoomFactor` outside exactly {1, 1.25}: the
  shared post-load sweep rejects extra rows (a reintroduced 2.0 row cannot
  ride beside healthy required rows), non-finite values, and missing viewport
  metadata, naming the component, scenario, and observed value.
- The stale-200% source tripwire covers all four current producer surfaces
  (fresh, scale, error/recovery captures, and the acceptance wrapper): literal
  `zoom200`/`zoom-200`/`zoom200pct` ID tokens are matched verbatim, numeric
  bindings are matched whitespace-tolerantly (`zoomFactor:2`,
  `zoomFactor : 2.0`, `setZoomFactor( 2 )` all fail), while historical docs
  and non-sealed harnesses stay outside the tripwire.
- Inspect the newly generated PNGs manually after the JSON gate passes. Prior
  screenshots are historical evidence only and must never be used to accept a
  later source fingerprint.
- The wrapper builds and runs from an immutable source snapshot, reports any
  checkout divergence separately, copies the accepted Electron app into the run
  directory, removes the build snapshot, and then re-verifies the accepted app.
  A passing run writes read-only `acceptance-report.json` and
  `acceptance-seal.json`; externally custody the printed expected seal SHA-256.
  The seal binds the source and artifact inventories, accepted app and Electron
  identity, runtime probe, final report, and evidence inventory. A report without
  this separately held digest is not sufficient custody for a later persona wave.
- Before the snapshot is prepared or the exact build starts, the wrapper
  preflights its artifact root (`JOB_FINDER_ACCEPTANCE_ARTIFACT_ROOT` or the
  default `apps/desktop/test-artifacts/ui`) and fails closed when that root is
  not canonical (a symlinked parent, a `/var`-style alias, or another spelling
  of its own realpath), naming the variable to fix; an aliased override must
  fail immediately rather than after hours of build/capture, while downstream
  canonical assertions stay in force unchanged.
- The final evidence inventory containment-checks every capture screenshot
  full path and additional evidence file against the run directory before any
  stat or hash, so an escaped candidate can never enter the sealed inventory;
  downstream hardening re-checks remain in force.
- The static contract check is
  `pnpm --filter @unemployed/desktop test:job-finder-production-acceptance:static`.
  It does not build, launch Electron, or replace the runtime acceptance command.

## Historical Job Finder release gate (2026-08-19)

- The integrated repository-wide `pnpm verify` run passed, including guidance/docs/source-generic/structure checks, lint, typecheck, fit calibration, the broad test suite, and the separately scheduled discovery-ledger performance test.
- The historical production scale replay recorded 516 jobs, 226 shortlisted jobs, 226 applications, and 511 sources, with a 1,780.86 ms usable cold shell and a 307.42 ms worst route switch. Its former local path was `apps/desktop/.tmp/production-scale-probe-2026-08-19T05-34-15-991Z/report.json`, but that ignored artifact is no longer present in this workspace and cannot be independently inspected or used as current release evidence.
- Fresh Job Finder source-app screenshots are under `apps/desktop/test-artifacts/ui/release-hardening-2026-08-19/`; the final scale artifact adds the populated 511-source More-menu state. A requested final automated capture replay could not start because the Codex execution allowance was exhausted before Electron launch. Do not represent that unavailable replay as passing evidence.
- Windows unpacked packaging has been assembled and inspected with `UnEmployed.exe`, `resources/app.asar`, the tracked `.ico`, and `resources/resume-parser-sidecar/{manifest.json,bin/win32-x64/resume_parser_sidecar.exe}` present. The inspected bundle was 585,084,836 bytes and unsigned. Regenerate it after the final CSP cleanup before release, then repeat the isolated packaged-app smoke; signing and publication are separate authorized operations.

## Current durable-capacity and company-identity closeout (2026-08-23)

- Focused coverage must prove paired absent/null/non-null preparation-start
  semantics, migration 13 with no fabricated legacy JSON backfill, an immutable
  mark before browser/session execution, exact usage versus `legacyUncertain`,
  20-per-local-day reset projection, 10-per-run enforcement, process-local
  reservation races, and guard revalidation before consent continuation.
- Company coverage must prove canonical or `user_approved_merge` exact-name
  ownership, unknown legacy aliases, non-owning domain corroboration/conflict,
  no destructive SavedJob domain migration, stale company-route fail-closed
  behavior, and transaction-current all-or-nothing evidence validation across
  company/job/ApplicationRecord with monotonic timestamps. UI coverage must
  prove exact salary/job and offer/record selection plus retained drafts after
  failed saves.
- Application-document coverage must reject stale or crossed exact
  question/result/ApplicationRecord lineage. CRM UI coverage must keep timeline
  language preparation-only and prove modal background isolation, focus trap,
  Escape/backdrop cancellation, and opener focus restoration.
- A broad non-Electron gate passed before the final source changes. It must be
  rerun after those changes settle; that earlier pass is not acceptance for the
  final source. The immutable-snapshot Electron run, live/provider and
  authenticated-ATS checks, accessibility/user deployment review, and all 14
  persona sessions remain pending. Do not claim any of them complete.

## Pick Checks

| Change                       | Prefer                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------- |
| docs or agent guidance only  | `pnpm validate:docs-only`                                                        |
| package-local code           | `pnpm validate:package <alias>` first, then broader checks only if risk warrants |
| contracts or IPC             | `pnpm validate:contracts` plus affected package typecheck                        |
| discovery/source-debug       | `pnpm source-generic:check` plus focused package tests                           |
| desktop UI                   | `pnpm validate:desktop` plus the matching UI harness                             |
| broad cross-package behavior | `pnpm verify:affected` or `pnpm verify`                                          |

Common package aliases:

- `pnpm validate:desktop`
- `pnpm validate:job-finder`
- `pnpm validate:browser-agent`
- `pnpm validate:browser-runtime`
- `pnpm validate:contracts`

## Stop Rules

- Do not run `pnpm verify` for docs-only or guidance-only changes.
- Do not rerun a broad failing command unchanged; isolate the failing package or command first.
- If a failure is documented as pre-existing and unrelated, report it once and switch to focused validation.
- Use a build-owning harness before judging Electron evidence. Scripts that
  launch `out/main/index.cjs` directly are diagnostic-only unless they verify the
  source and bundle identity themselves.

## Guidance Checks

- `pnpm validate:docs-only` after shared guidance, skill, doc, or link changes

## Campaign, dashboard, search, and CRM implementation evidence (2026-08-17)

- Focused contracts cover campaign defaults and no-submit literals, CRM compatibility, and workspace delta campaign context.
- Focused database and service tests cover SQLite campaign backfill/persistence, campaign membership and limits, activity pause gates, dashboard truth, serialized CRM revisions, no-response automation, duplicate hints, safe CSV/JSON output, and campaign apply stop-rule decisions.
- Focused desktop tests cover typed main/preload routes, revisioned deltas, Home and Campaign screens, shell navigation, global/local search, keyboard behavior, persisted density/views, CRM table/Kanban/calendar/detail/settings, and active-campaign list scoping.
- After integration, run Contracts, DB, Job Finder, and Desktop typechecks; the consolidated focused Vitest list; format/lint/source-generic/docs checks; then `pnpm verify` once. The phase-two closeout also runs the hardened Electron replay after the production build, using only synthetic data and prepare-only safety settings.

### Phase-two feature slices — implementation and production-harness verification complete

- The six phase-two slices — advanced campaign rules and truthful pre-search funnel, local schedules/digests/in-app notifications, outcome analytics with manual outcome recording, resume strategies with per-job selection, company intelligence with merge review, and high-volume safeguards with recovery — are implemented end to end in the current checkout: typed contracts, pure operations, workspace-service methods, typed IPC/preload routes, renderer screens, and focused test files.
- The integrated focused closeout passed 59 test files / 770 tests with zero failures, including 4 safeguard files / 92 tests. Navigation checks passed 9/9 reachability and 16/16 shell assertions. The affected Contracts/DB/AI Providers/Job Finder/Desktop TypeScript and lint checks, feature Prettier check, and `git diff --check` all passed. The production desktop build passed.
- The hardened phase-two Electron replay passed 40 captures at 1440×920, 1280×720, and native Electron 200% zoom. It recorded zero runtime errors, safety violations, horizontal-overflow findings, or unreachable controls; nested-scroll movement passed 40/40. The run used synthetic data, executed no application actions or final-submit controls, and left zero Electron processes. Evidence is under `apps/desktop/test-artifacts/ui/phase-two-absolute-final/`.
- The phase-two closeout's initial repository-wide attempt stopped before scripts ran because Corepack could not verify/fetch pnpm 10.8.0. That historical environment failure was superseded by the passing 2026-08-19 integrated `pnpm verify` run recorded above.
- Application-terminal safeguards are complete for the implemented prepare-only technical failure, listing-signal, batch-review, simultaneous-application, and recovery paths. Explicit user-owned blockers remain excluded from technical-failure samples; credentials, CAPTCHA, MFA, legal consent, account creation, and final submission remain per-job/user-owned.

## Current Consolidated Release Evidence (2026-08-09)

### Computer Use usability remediation (2026-08-11)

- Audit and accepted screenshots: `docs/audits/DESKTOP_APP_COMPUTER_USE_USABILITY_AUDIT_2026-08-10.md` and `docs/audits/assets/desktop-app-computer-use-usability-2026-08-10/`.
- Focused regressions cover job-scoped résumé blocking, authoritative application attachment status, ended Interview Assist, opted-out text-only health, typed-question provenance, grounded Copilot advice, footer-aware/right-edge placement, managed-browser bound restoration, honest all-source discovery failure with retained partial success, failed source-check provenance, and profile-inferred search scope.
- Production-Electron replay uses an isolated synthetic `UNEMPLOYED_USER_DATA_DIR`, 1440×920 at 100% zoom, deterministic AI, browser-agent and final-submit authority off, and pointer-positioned wheel input over each nested scroll owner. The accepted replay must show the Profile footer action and Copilot launcher simultaneously without overlap and preserve independent pane scrolling.
- A deterministic run can verify failure-state semantics but cannot establish that the user's configured live provider/network transport is available. Re-run search and source checks through that configured path before claiming the original `fetch failed` environment is repaired. Do not weaken source-generic orchestration or add source-branded rescue logic.

### Normal-screen interaction closeout (2026-08-13)

- The final production build was exercised at 1440x920 against an isolated synthetic workspace. The pointer-owned scroll probe records the outer header at `0 -> 177`, center results at `0 -> 600`, right details at `0 -> 600`, a successful left-pane advance, and upward boundary handoff back to outer `0`. Evidence: `apps/desktop/test-artifacts/ui/normal-screen-final-20260813/nested-scroll-report.json` and `nested-scroll-owners.png`.
- Profile Copilot production geometry must preserve the Profile title, tabs,
  editor width, and scroll regions exactly when the chat opens. The default is
  a modeless floating chat, not a reserved side rail or split pane: at 1175 px
  it is at most 360 px wide, and at 1280/1440 px it is at most 384 px wide.
  It stays below the Profile tabs, introduces no horizontal overflow, and can
  be minimized to reveal any lower-right control it temporarily covers. A
  technically fixed overlay that visually hides most of Profile is a failure.
  Current focused evidence:
  `/tmp/unemployed-product-loop-20260901/copilot-compact-final/geometry.json`.
- Profile Copilot command coverage is union-exhaustive rather than example-specific. The AI-provider harness must cover every `ProfileCopilotPatchOperation` discriminant, runtime-owned review metadata, grouped operations, invalid-operation repair, every deterministic replacement-field descriptor, safe multi-field parsing, explicit clears, and specialist ownership. The Job Finder service harness must send each operation through proposal, explicit Apply, repository reload, and revision-backed Undo; adding a new operation or descriptor without a matching case must fail typecheck or the coverage test.
- Final production journey evidence covers Profile setup/import/Copilot, Resume Studio editing/export/approval, apply queue consent/cancel/recovery, and Interview Helper setup/chat/popups/review/export. Run folders: `profile-setup-20260813-final-closeout`, `resume-workspace-20260813-final-closeout`, `apply-queue-controls-20260813-final-closeout`, `applications-queue-recovery-20260813-final-closeout`, and `interview-helper-basic-20260813-final-closeout` under `apps/desktop/test-artifacts/ui/`. Every harness uses isolated synthetic state and leaves final submission untouched.
- Apply cancellation/restart coverage must prove active browser work observes abort, late results cannot overwrite cancelled state, application page preparation closes prior app-owned tabs, graceful shutdown waits for the active promise, and a hard-restart snapshot converts an orphaned `running` run to `failed` with `completedAt` and explicit no-submit wording, settles every planned result of that run to terminal failed with truthful preparation-stopped-before-review and no-final-submit copy, keeps genuinely begun results' start marks and day-capacity counting while never-begun or legacy rows normalize absent marks to explicit null without becoming legacy-uncertain capacity, leaves `awaiting_review` and already-terminal results untouched, and stays idempotent across repeated recovery.
- Final integrated production harnesses: `capture-apply-queue-controls.mjs`, `capture-applications-queue-recovery.mjs`, `capture-resume-workspace.mjs`, and `capture-interview-helper-basic.mjs`. Their accepted 2026-08-13 evidence directories use the `*-final-integrated` labels under `apps/desktop/test-artifacts/ui/`.

### Large Job source libraries (2026-08-11)

- Focused component coverage loads 507 typed discovery targets and requires catalog-wide search/filtering, exactly 25 compact rows per page, quick enablement, one mounted detailed editor, source-specific action names, and enabled/total tab progress. Provider coverage requires EU-hosted Lever boards to use `api.eu.lever.co` while ordinary boards continue to use the default Lever API.
- Production-Electron acceptance uses an isolated workspace, 1440×920 at 100% zoom, browser-agent/live-AI/final-submit authority off, and the reviewed 507-source catalog with every source disabled. It must preserve all five Profile tabs, show zero document/inner horizontal overflow, paginate and search without mounting the full catalog, open exactly one editor, and record zero renderer errors.
- Pointer-owned scrolling is a release assertion, and its rule is **native first**: with the pointer over a pane that still has scroll range in the wheel's direction, the layout must not call `preventDefault` and must not write a `scrollTop` — the browser scrolls that pane on the compositor with its own momentum, at full delta. Custom arbitration is permitted only at a true boundary, where the pointed-at chain is exhausted in that direction; a single wheel delta must still never move two nested scroll owners. Verify by dispatching a burst of identical wheel events over a pane and requiring a flat per-event `scrollTop` delta from the first event, with the outer route scroller unmoved. Current evidence: `apps/desktop/test-artifacts/ui/job-sources-library-507-20260811/capture-report.json`.

### Production Electron journeys

- Current public Ashby discovery and shortlist (wave9x):
  `apps/desktop/test-artifacts/persona-wave-20260828/live-public-current/run-20260828T041757595Z/`
  must bind one rebuilt Electron bundle to the timestamped public Umbrel
  inventory, visible source opt-in, completed source-generic Search, Results,
  exact current-listing inspection, and a durable Shortlisted row. The accepted
  report requires 11 public/app jobs, the selected public Senior Frontend
  listing with Umbrel / Remote labels, one original-resume-ready queue item,
  zero renderer errors, and all no-account/no-application/no-submit assertions.
  Discovery-only acceptance must additionally prove campaign retention includes
  staged candidates without prematurely saving them, then moves only the chosen
  candidate from staged storage into a reviewable saved status.
- Current-build Priya/native-accessibility wave (wave9w):
  `apps/desktop/test-artifacts/persona-wave-20260828/priya-single-build-current/`
  must pass every import-to-Applications leg plus `noEmployerSubmit`, persist one
  exact ApplicationRecord, retain both final-submit flags as false, and include a
  visually reviewed one-page PDF. The companion
  `native-dialog-accessibility-probe/` is production mode with the test API
  absent: screenshots and the chosen-path PDF prove genuine macOS Open and Save
  selection; `keyboard-accessibility-report.json` proves reduced-motion matching,
  settled visible focus styling, keyboard Enter navigation to the exact resume
  route, named landmarks, one H1/main, and no unlabeled images. Do not infer
  native Cancel behavior from selection evidence: the separate
  `native-save-cancel-report.json` records a genuine macOS Save Cancel click and
  unchanged export count, while `native-open-cancel-report.json` records a
  genuine Open Cancel click and unchanged imported filename, digest, and ready
  extraction state.
- Current-build Sam prepare-only funnel (wave9v):
  `apps/desktop/test-artifacts/persona-wave-20260828/sam-single-build-current/`
  starts from empty isolated userdata and drives the visible UI from test-only
  resume-path import through guided setup, local source opt-in, compact-first
  discovery, shortlist, tailored PDF export/approval, Prepare, and Applications.
  Its accepted report requires every leg plus `noEmployerSubmit` to pass. Review
  the exported PDF by rendering it, not only by trusting the export action. The
  companion native-125% replay under
  `test-artifacts/persona-wave-20260828/sam-current-compact-125/` must show that
  selecting a stacked Applications row reveals the detail panel and **Next
  step** rather than leaving the user at the list.
- Greenhouse original CV: post-seal release evidence uses the four-variable
  bound environment and
  `pnpm --filter @unemployed/desktop test:job-finder-complete-flow:built`.
  It launches the sealed accepted app in an isolated workspace. The report
  must prove current public listing selection, the real import boundary, the
  unchanged original asset and digest, and either the named final control or
  a distinctly classified strict intermediate-write blocker. Strict mode does
  not require upload verification when the site would autosave. In every case,
  `submitAuthorized` stays false, `submittedNeverOccurred` stays true, and
  workspace cleanup must pass.
- Ashby tailored CV: run the same harness with `JOB_FINDER_PREPARE_ONLY_RESUME_MODE=tailored_per_job` and the Ashby flow inputs. Accepted report: `apps/desktop/test-artifacts/job-finder/complete-flow-current-ashby-tailored-final-20260809/prepare-only-smoke-report.json`. It must prove generated draft quality/coverage, exact export and approval, verified upload, named final control, and no submit/account authority or occurrence.
- Workday anonymous: accepted report `apps/desktop/test-artifacts/job-finder/complete-flow-current-workday-final-20260809/prepare-only-smoke-report.json`. The expected result is `site_login_required` plus a resumable manual sign-in instruction—not a failure, inferred login, credential action, or final-control attempt.
- Fresh first-run journey: `apps/desktop/test-artifacts/ui/production-user-audit-20260809-final2/` covers import, setup Copilot, direct field review, readiness, completed Profile hierarchy, one-row 1440 px navigation, and the Profile → Find jobs continuation.
- Live public-provider audit: `apps/desktop/test-artifacts/job-finder/diverse-live-audit/summary.json` covers three synthetic profiles against current Greenhouse, Lever, and Ashby inventories. Accept the run only when visible/hidden ranking is target-aware, detail actions remain above the scroller, and generated résumés contain no unsupported numeric claims.
- Resume Studio/current primary journey: `apps/desktop/test-artifacts/ui/resume-workspace-luna-high/` covers preview failure/recovery, proof disclosure, template choice, live editing, a configured Luna-high Guided Edits response, export, approval, return to Shortlisted, visible Prepare application, and the safe Applications stop.
- Original-CV journey: `apps/desktop/test-artifacts/ui/original-cv-flow/` must show the exact imported asset, a per-job native radio choice, a sensitive-detail warning, and an enabled Prepare application action without tailoring.
- Action Inbox: `apps/desktop/test-artifacts/ui/action-inbox/capture-report.json` covers 1440 px, 900 px, and native 200% zoom. All contextual controls and shell destinations must be visible with zero horizontal overflow; credentials stay browser-only and both authorization flags stay false.
- Limited Interview Helper regression: `node apps/desktop/scripts/capture-interview-helper-basic.mjs` against the built app. `apps/desktop/test-artifacts/ui/interview-helper-basic/report.json` must prove two visible popup windows, typed send, temporary image attachment, copy, hide/reopen, resize, exact bounds restoration, renderer-reload persistence, configured local STT readiness, and no retained raw image bytes. This harness does not replace a live microphone/system-audio hardware pass.

### Active product-iteration loop

Use this loop while Job Finder is still changing:

1. Use one current desktop build and one serialized Electron owner with isolated
   user data. That owner walks the visible Profile import -> setup -> discovery
   -> shortlist -> tailored resume -> approval/preparation -> Applications
   journey and captures every meaningful before/after state. Do not launch
   competing Electron copies or spend the round rebuilding fixture machinery.
   Time-box the capture to 15 minutes. If fixture or launcher work prevents a
   useful app screenshot or a reproducible product finding in that time, stop
   the round and report the blocker instead of repairing the harness.
2. Capture both a normal desktop viewport and the supported compact viewport.
   Include first-load, populated, empty, loading, disabled, pending, success,
   validation, error/retry, long-copy, scrolled, minimized/reopened, and
   navigation-return states where the flow exposes them. A route, tab, button,
   dialog, toast, or editor action is not considered checked merely because it
   exists in source or a unit test.
3. Give the shared screenshots and path to independent product/UX, visual, and
   functional reviewers in parallel. Reviewers should be candid and may reject
   technically correct UI. They must check first-viewport usefulness; whether a
   click visibly changed the page; fixed-header/title collisions; brand and
   active-navigation persistence; margins, padding, alignment, density, action
   hierarchy, button grouping, contrast, clipping, overflow, scroll ownership,
   long text, empty space, overlays, toasts, chat readability, and whether the
   next action is obvious without scrolling or guessing. Time-box each review
   to 10 minutes; parallelize reviewers over the same evidence, not Electron
   instances or persona workspaces.
4. Record only concrete findings with a screenshot/state, user impact, expected
   behavior, and likely source owner. Consolidate duplicates by root cause and
   rank the user-blocking or trust-breaking issues first. An agent that produces
   no requested capture or finding within its bound should stop and report the
   blocker; do not turn fixture debugging into the product task.
5. Assign non-overlapping implementation ownership and fix the accepted findings
   as one batch. Prefer direct product changes over new harness, architecture,
   evidence, or documentation work unless the visible defect genuinely requires
   it. Do not run validation after each small edit.
6. Run focused tests and static checks once for the touched behavior, then make
   one desktop build for the whole batch. Reopen one Electron session and
   recapture only the changed states plus the adjacent end-to-end path. Repeat
   from step 1 until no high-impact internal flow defect remains. Deliver a
   small before/after screenshot set for every batch so the visible improvement
   can be judged directly instead of inferred from tests or a change list.

After a major batch, use at most two or three distinct personas to expose
different user needs. Do not run a 14-persona wave during product iteration.
Do not start architecture, authority, persistence, custody, or release work
unless a reproduced product defect requires it or the user explicitly changes
the active priority. Eventual autonomous submission remains a separate product
track; it must not displace finishing the visible prepare-only journey.

This loop does not require a fingerprint, evidence manifest, immutable
snapshot, external seal custody, broad `pnpm verify`, `pnpm test:evidence`, or
a canonical 14-persona workspace. Those controls remain available only for a
settled release candidate explicitly declared by the user. Product safety
boundaries remain mandatory throughout iteration: no tester or automation may
use credentials, solve challenges, create accounts, accept legal consent, or
perform a final employer submission.

### Iterative persona-wave verification (diagnostic polish only; non-acceptance)

Use this lighter rhythm after each **big fix batch** on the Job Finder funnel as diagnostic feedback only. It is non-acceptance evidence and does not replace, shorten, or override the sealed blind-persona rounds below. The canonical visual-criticism prompt and evidence contract apply only to the sealed wave.

1. Finish the polish/quality batch and rebuild desktop if renderer or main changed.
2. **Do not self-verify alone** — launch **three parallel persona testers** against `apps/desktop/test-artifacts/persona-wave-20260826/`:
   - **Jordan** — `jordan-from-scratch/userdata`; Partiful/LinkedIn prepare path; skip resume import when an approved export already exists.
   - **Priya** — `priya-from-scratch/userdata`; Wellfound encoded-resume path; shortlist title/quality checks.
   - **Maya** — `from-scratch-full/userdata`; discovery volume and shortlist quality.
3. Each tester drives the **built Electron app** through the visible UI (Playwright/CDP or existing persona scripts). Save screenshots as `polish-*` or `wave-*` under the persona directory. Default env: `UNEMPLOYED_ENABLE_TEST_API=1`, `UNEMPLOYED_TEST_API_USE_LIVE_AI=0` (conserve OpenCode Go unless explicitly testing AI quality). Never perform employer final submit.
4. Each report may include structured feedback: **UX clarity 1–5**, **quality 1–5**, **blockers**, **next fixes** (plain language, first person where helpful). Do not treat these polish reports as canonical visual-review evidence.
5. Synthesize all three reports, implement accepted root-cause fixes, rebuild, and repeat until the funnel is simple and obvious for non-technical users—or document acceptable external limits (for example LinkedIn service-worker pause requiring a Safeguards reset).

Canonical harness entry points: `jordan-from-scratch/run-jordan-retest-prepare.mjs`, `priya-from-scratch/run-priya-retest-bonus.mjs`, and persona launch helpers under the same wave directory.

### Blind persona usability rounds

- Run blind persona testing only after the current fix wave is integrated, the source is stable, and one passing immutable-snapshot production acceptance run owns the accepted app and evidence. Do not use a stale build or let persona sessions rebuild it independently. The final full acceptance run and its externally held seal are pending for the current candidate.
- Execution-day order is fixed: one passing sealed acceptance run owns the accepted app; the expected seal SHA-256 is custodied outside the repository; one single sequential prepare invocation (`--persona all`) seeds every workspace into a fresh empty destination root plus a fresh custody root; read-only `--verify-all` re-checks the sealed wave; only then may tester launches begin.
- The canonical version-1 corpus contains 14 fixed personas, `P01` through `P14`, in `apps/desktop/test-fixtures/job-finder/blind-personas/manifest.json`, with referenced resume and job-corpus assets. It covers first-job, junior and experienced technical, career-change/logistics, laid-off management, returning-parent/time-limited, older low-confidence, non-native-English, privacy-cautious, employment-gap, keyboard/low-vision, high-volume returning, marketing-management, and service-management contexts. The final canonical manifest digest is `8b8f95b8d06b178062d5c542ecd7f927172c715a7e9a66148d4987b3fd8f1e14`; P01–P12 start from fresh empty workspaces and P13–P14 return to persisted workspaces, and an independent tri-model clean-room review returned GO on this framing. The fixtures and seed pipeline are prepared; no workspace is prepared and no persona session has launched or completed.
- The manifest's `visualReviewTemplate` is the one canonical, versioned visual-criticism prompt. Preparation copies it into each sealed persona seed manifest, and every tester launch emits an inspectable `testerBrief` in both the immutable launch intent/record and launcher stdout, with the same bound checklist and an explicit `POST-JOURNEY OPTIONAL CHECKPOINT` for Profile Copilot. It asks for criticism of repeated chrome, useful above-fold content, intentional padding/margins/gutters and width use, action-group alignment and accidental full-width controls, consistent heights/gaps/wrapping, disabled-action explanations, focus/DOM order, loading alignment, top-left brand and native macOS traffic lights, active navigation, toast/action overlap, painted clipping, overflow, and every click/state change, without naming a prescribed route.
- Persona testers receive only: their situation, the visible product promise, a realistic job-search goal, and the authority boundary that credentials, CAPTCHA/MFA, consent, account creation, and final submit remain theirs. They must not read repository source, tests, product docs, route maps, audit findings, or implementation vocabulary before the session.
- Prepare all sealed workspaces from the accepted run with `node apps/desktop/scripts/prepare-blind-persona-workspaces-cli.mjs --acceptance-run-dir <production-acceptance-run> --expected-seal-sha256 <externally-held-sha256> --destination-root <empty-parent> --custody-root <separate-directory> --persona all`. The command independently verifies the sealed acceptance report, build manifest, source/artifact/evidence inventories, accepted app, runtime probe, and Electron identity; performs exactly one test-only reset per persona; proves normal production restart durability; seals every workspace; and writes a custody index outside all persona roots. Each preparation invocation needs a fresh empty destination root and a fresh custody root: the custody index is written exclusively, so rerunning into a used custody root fails with `EEXIST` instead of overwriting — use a new empty custody directory per preparation. Partial waves remain explicitly incomplete (`waveComplete: false`) and cannot launch testers.
- Custody is tamper-evident for the seeded state and tolerant of runtime churn: each seed manifest seals a payload inventory (path, byte count, and SHA-256 for every file in the persona root), the external custody index binds that manifest digest plus the sealed-only workspace digest, and verification runs in two modes. Before any tester launch, mode is `strict`: every sealed entry must remain byte-for-byte identical and any post-seal mutation fails as contamination; files Electron creates at runtime are listed as unhashed volatile entries rather than failures. Browser-managed top-level Chromium sidecars `DIPS-shm` and `DIPS-wal` present before sealing are classified as volatile and excluded from the sealed payload inventory; the durable `DIPS` file and all other files remain sealed. Once an archived launch record exists for a persona, later verification of that root runs in `consumed` mode: sealed entries must still exist as regular files (deletion or replacement stays fail-closed) while byte drift from legitimate use is expected user-owned state evolution, so interrupted sessions and retests relaunch through `--attempt` against the same wave without reseeding. The launcher re-verifies custody, workspace inventory in the correct mode, accepted-build binding, app identity, and test-API absence before every launch, and refuses an attempt claim with no archived evidence.
- Re-check an already-sealed wave read-only with `node apps/desktop/scripts/prepare-blind-persona-workspaces-cli.mjs --verify-all --custody-index <blind-persona-wave-custody-index.json>`: it verifies the index self-digest, then runs the exact per-persona verification path (seed-manifest digest, payload-inventory byte equality, external custody binding), prints one ok/FAIL line per persona plus a JSON summary, and exits nonzero when any entry fails. Nothing is launched and no state is mutated; sealed-build re-verification is intentionally outside this pass, an empty index refuses, and an incomplete wave reports `waveComplete: false` while launches stay refused.
- Launch one tester only through `node apps/desktop/scripts/launch-blind-persona-tester-cli.mjs --custody-index <blind-persona-wave-custody-index.json> --persona <P01..P14>`. The launcher rejects incomplete custody, changed app/workspace/manifest identity, test API exposure, and cross-persona data. `--attempt <n>` (integer >= 1, default 1) suffixes the launch record for relaunches and retests: attempt 1 keeps `P##-blind-persona-tester-launch-record.json`, higher attempts write `P##-...-launch-record-attempt-<n>.json`, so retries never hit `EEXIST` and every prior attempt stays archived evidence. `--driver-cdp` is the opt-in parent-only automation channel: the sealed app gets `--remote-debugging-address=127.0.0.1` plus ephemeral `--remote-debugging-port=0` resolved from the workspace `DevToolsActivePort` file (one verified fixed-high-random-port fallback exists, otherwise the launch fails closed), the resolved URL/port and flag provenance are recorded in the launch record, and the zero-network arguments (`--host-resolver-rules=MAP * 0.0.0.0,EXCLUDE localhost`, `--proxy-server=127.0.0.1:9`) stay intact. Tester shells use a minimal allowlisted environment; `UNEMPLOYED_ENABLE_TEST_API` must be absent there (the launcher fails closed if the test preload/API appears), browser agent, live AI, intermediate writes, and network are blocked, and the recorded environment lands in the launch record. The launcher process owns the app lifecycle: stop a session by sending SIGTERM to the launcher process and let it close its owned process tree; never kill the Electron app directly. Drive the accepted app through the visible UI with `agent-browser` or equivalent Electron UI automation; do not call internal IPC or mutate fixture state after launch to bypass a confusing step.
- Prompts state outcomes rather than procedures, for example: "Set up this app to find suitable local or remote work, save a promising job, prepare a truthful resume for it, and get the application ready for me to review. Do not submit it." Never tell a tester which route, tab, button, or internal feature to use.
- The viewport/zoom/input matrix comes from the canonical manifest and is applied by the external driver layer, never through tester instructions: `P11` runs keyboard-only, `P12` runs native `webContents` zoom factor 1.25 at a normal desktop window (not CSS zoom or a device-scale flag), and `P06` carries a 25-minute session with one interruption during active work — the supervisor SIGTERMs the launcher process and relaunches the same persona root as attempt 2. Tester isolation rules are unchanged: life context and outcome goal only. Because Chromium persists per-origin zoom inside each persona root, relaunches (including P06 attempt 2 and any zoomed session on a reused root) rely on the desktop shell's post-load zoom reassertion: requested native 1.0/1.25 wins after load, and launches without an explicit request deterministically start at native 100% instead of inheriting a previous session's host zoom.
- Each tester records: completion or blocker; path taken; time and interaction count by journey stage; first point of confusion; misunderstood terms; backtracking; inaccessible or hidden controls; trust concern; expected next action; screenshots at every blocker; and a concise first-person verdict. Testers are explicitly product critics, not script followers: they have full liberty to report non-blocking visual discomfort and must assess the first stable viewport, hierarchy/density and whether tabs or actions produce a visually obvious state change, loading-state alignment, brand/navigation persistence, and clipping/overlap. For each visual lens they record `clear|issue|not_observed` plus a concrete note; a visual `issue` must list at least one screenshot also present in top-level `screenshotPaths` and triage `P0|P1|P2`; `not_observed` is honest evidence, not a pass. One first-stable-viewport screenshot is enough when it supports several lenses; do not inflate the screenshot set with unchanged frames. Capture renderer errors and horizontal overflow separately from user feedback.
- The north-star scenario is one uninterrupted `Profile -> Find jobs -> Shortlisted -> resume review/approval -> Prepare application -> user-owned final checkpoint -> Tracker` journey. Also cover returning-user discovery, follow-up, interrupted-work recovery, original-CV choice, and a no-results or blocked-source recovery.
- Synthesis is independent from the persona testers. Deduplicate findings by root cause, rank P0 core-flow blockers before P1 repeated confusion and P2 polish, and reject suggestions that weaken evidence grounding, recovery truth, source-generic behavior, or user authority.
- Fix only accepted root causes. An accepted fix rebuilds once, restarts the
  broad evidence gate and the sealed acceptance run, and begins a completely
  fresh wave with new blind testers who have not seen the earlier findings. Do
  not train the same persona through the expected route and call the learned
  rerun usability evidence; the same tester is never reused.
- Continue rounds until all of the following hold on a single fresh wave: all
  14 canonical personas reach their safe expected outcome without hints or
  facilitator instructions; P0 findings equal zero; unresolved P1 findings
  involving safety, truthfulness, privacy, durability, or accessibility equal
  zero even when a single persona hits one; repeated P1 root causes seen by two
  or more personas equal zero; every P2 finding is documented and triaged; and
  keyboard/native-125% personas complete the same journey. Record rejected
  feedback and rationale so later rounds do not repeatedly reopen settled safety decisions.
- Blind synthetic personas cannot establish live-source relevance, the quality of the user's private resume, configured provider/network availability, authenticated ATS behavior, or personal accessibility. The user-controlled deployment review remains a separate final gate.
- This wave is the quality-over-speed product bar: it measures whether real people understand the local/model/site boundaries without coaching, whether saves and approvals survive normal use and interruption, and whether the app meets paid-product finish. It supplements, never replaces, the external deployment gates; unchecked items in `docs/audits/JOB_FINDER_PRODUCT_DECISIONS_AND_AUDIT_CHECKLIST.md` stay unchecked until their own evidence lands.

### Blind-persona evidence collection harness (2026-08-24)

- After all 14 tester sessions, collect evidence with `node apps/desktop/scripts/blind-persona-evidence-harness-cli.mjs`: `init --custody-index <index> --evidence-root <empty-dir>` scaffolds one directory per persona with an empty record prefilled `personaId`/`waveCustodyPath`; testers fill their record and the supervisor runs `record --file <record>` to validate and atomically rewrite it (exclusive temp file, rename, mode 0644; failed validation never touches original bytes); `aggregate --custody-index <index> --evidence-root <dir> [--out <file>]` emits the synthesis input.
- Complete canonical wave only: `init` and `aggregate` fail closed when custody `waveComplete` is not `true`, and both refuse any persona set that is not exactly `P01` through `P14` once each. Incompleteness is reported before canonical-set diagnostics so real partial waves read clearly. `init` requires a fresh non-existing evidence root and rolls back created directories if scaffolding fails midway.
- Wave binding: aggregation is authoritative. Each record's `waveCustodyPath` must resolve (canonical realpath) to the verified custody index, so wave-A evidence cannot be aggregated under wave B. The `record` command validates shape only.
- Output containment: the synthesis input is written as a direct child of the evidence root (default `blind-persona-evidence-synthesis-input.json` there); a provided `--out` must also be that direct child and may never target custody data, persona subpaths, an evidence record, or an existing symlink. Missing/invalid records write no synthesis and remove a stale default synthesis so old output cannot masquerade as current.
- Record schema highlights: version 2 verdicts are `complete|blocked|partial`; severity levels are `P0|P1|P2` with free-form supplementary `evidenceRefs` (not filesystem-validated). Structured `blockers[]` entries carry non-empty `summary`, `stage`, and at least one screenshot: a blocked verdict requires at least one blocker and one severity, a complete verdict requires no blockers, and every blocker screenshot must also appear in the top-level `screenshotPaths`. `visualReview` requires the five visual lenses above, each with `clear|issue|not_observed`, a non-empty note, `screenshotPaths`, and nullable severity; an `issue` requires at least one path in the top-level screenshot list plus a `P0|P1|P2` triage, and a `clear` claim requires at least one top-level screenshot or an inspectable contained `observationSource` (`kind` plus regular-file `path`). Horizontal overflow is recorded as structured `horizontalOverflowFindings[]` (`surface`, `summary`, `screenshotPath`) instead of a bare boolean; the synthesis derives `horizontalOverflow` per persona from finding count while preserving every occurrence. All screenshot and observation-source paths are relative to the persona record directory, may nest subdirectories, must exist as regular files, and must not traverse upward or escape through symlinks.
- Exit codes: aggregate exits nonzero when any record is missing/invalid, any visual lens is `issue` or `not_observed`, or any P0 finding exists, so a parent session cannot silently proceed past an incomplete wave. Visual issue severity is counted in the synthesis without upgrading every visual incompleteness to P0. Aggregation produces the INPUT to independent synthesis (deduplicate by root cause, rank P0 before P1/P2); it is not final acceptance.

### Blind original-vs-generated resume comparison (2026-08-25)

- Deterministic, privacy-conscious pairwise protocol in `apps/desktop/scripts/blind-resume-comparison-harness-cli.mjs` (`init`/`record`/`aggregate`; same vite ssrLoadModule pattern as the persona CLIs, pure fs + validation). It compares an ORIGINAL resume against a GENERATED variant under hard gates plus blinded human scoring; the user's private CV and real target jobs remain an external later input. A fully synthetic gate-clean corpus lives at `apps/desktop/test-fixtures/job-finder/resume-comparison/synthetic-cases.json` and is exercised end to end (including through the real CLI process) by `apps/desktop/scripts/blind-resume-comparison-harness.test.ts`.
- Hard gates run before any rater sees anything: factuality (every generated claim lexically supported by the original; fabricated contacts refused), numeric integrity (no invented numbers), omissions (contact data plus declared `criticalAnchors` must survive), and ATS parsing/structure of the generated side (section headers, contact signal, timeline years, line lengths, decorative-glyph/control-char refusal). Any violation aborts `init` with nothing scaffolded.
- Blinding: which variant is the original is derived per case from `sha256(seed:caseId)` and recorded only in the sealed manifest inside the supervisor work root (`sources/<caseId>.original|.generated.txt` live there too). The rater root carries only `variant-A.txt`/`variant-B.txt`, a case brief, and a record template prefilled with the manifest digest — no identity information, nothing slot-mapping-related on stdout.
- Ratings: independent 1-5 scores per variant for relevance, credibility, readability, specificity plus a mandatory forced choice (A or B; ties are not an option) for every case. Records may speak only of variants A/B: identity assertions in any text field are refused, as are forbidden claim keys — the protocol encodes NO ATS-score, callback, response-rate, screening, or hiring-outcome claims anywhere.
- Aggregate verifies the manifest self-digest, re-hashes every source and blinded variant (tampering fails closed), re-verifies recorded gates against sealed sources, refuses stale-bound/incomplete/identity-leaking ratings, lifts the blinding, and writes per-side dimension means, forced-choice tallies, and winners as a direct child of the work root. At least one original-win control case (`isControl:true`) must exist in the seal AND be won by the original; a lost control writes the aggregate yet exits nonzero.

### Résumé provider comparison

- `apps/desktop/scripts/run-resume-quality-benchmark.mjs` accepts `--case-id`/`--case`, `--template-id`/`--template`, and `--use-configured-ai`. The IPC route must forward `useConfiguredAi` into `runDesktopResumeQualityBenchmark`; route coverage must not call an external provider.
- Compare providers on identical synthetic cases/templates and report latency, accepted/rejected AI contributions, grounding, role coverage, ATS rendering, and fallback separately. Do not treat deterministic fallback success as accepted model contribution.
- Current sparse-generation sample: Luna high `technical_matrix` 17.222 s (0 accepted / 1 rejected) and `classic_ats` 23.126 s (1 / 0); Felidae 9.098 s (0 / 5) and 9.821 s (0 / 4). All quality gates were 1.0 because deterministic fallback owns safety. The correct conclusion is that Felidae was faster in this sample while Luna produced one accepted grounded rewrite and avoided its earlier timeout.
- Final Luna-high recheck: `apps/desktop/test-artifacts/ui/luna-high-final/2026-08-09-luna-high-final/resume-quality-benchmark-report.json` completed `frontend_platform`/classic ATS in 11.207 s; `apps/desktop/test-artifacts/ui/luna-high-final/2026-08-09-luna-high-grounded/resume-quality-benchmark-report.json` completed `grounded_baseline`/classic ATS in 19.819 s. All gates were 1.0 and both sparse-generation calls abstained safely. The real configured Guided Edits journey completed successfully in 28.9 s.
- Current temporary-route recheck (2026-08-28): the public full-funnel proof under `apps/desktop/test-artifacts/persona-wave-20260828/public-fallback-current-v5/` is provider-free and passes through Applications. The configured Muse-xhigh diagnostic under `live-ai-public-current-v3/` timed out at 60 s and produced a disclosed deterministic fallback; it is not live-AI quality evidence. Identical `frontend_platform`/classic ATS configured benchmarks record DeepSeek max timeout at 60.1 s, DeepSeek low response at 41.9 s with 0/3 accepted rewrites, and Muse low response at 25.9 s with 0/6 accepted rewrites. Reports are under `apps/desktop/test-artifacts/ui/provider-drift-{deepseek,deepseek-low,muse-low}-20260828/focused-current/`. Grounding/ATS/keyword gates remained 1.0 because deterministic safety owns the final artifact; the configured quality gate remains failed until at least one current frozen synthetic case records a timely, verifier-accepted model contribution. Do not increase the provider timeout or lower verifier rules merely to turn this gate green.
- Prepare acceptance must use durable truth, not a clicked control or generic Applications row. Bind the latest ApplyJobResult to the exact ApplicationRecord and job, verify the approved artifact lineage and no-submit receipt, then report one of `READY_FOR_REVIEW`, `SAFE_STOP`, or `MISSING_OR_AMBIGUOUS`. A legitimate prepare-only pause on an ATS autosave is a safe-stop/manual-handoff result and makes the full funnel partial; it is not a preparation PASS. Poll terminal durable state instead of static route copy, and capture only meaningful state changes.
- Intermediate-write safety requires a real-browser matrix in addition to pure classification: prove a same-origin request with explicit autosave/draft/update semantics passes only during the exact grounded-field window, while a final-action operation on the same origin remains blocked. Also cover absent authority, closed/expired/exhausted windows, cross-origin, ambiguous GraphQL, GET/DELETE, beacon, WebSocket/EventSource/WebTransport, DOM submit/requestSubmit, and delayed traffic. Never test this automated boundary against a real employer; use local synthetic fixtures until the user has explicitly selected an inspectable production policy.
- Production-wiring coverage must additionally prove the exact one-job/one-origin/one-resume/current-answer/future-expiry envelope activates all prepare entry points only through the shared resolver, and that revocation or revision/answer/origin/resume drift makes the next per-field callback return false. Receipt coverage must keep local fills and blocked autosaves out of `externalWrites` and record a write only after a successful authorized synthetic response.

### Integrated gate state

- Final verification: agent/docs/source-generic/structure checks passed; package lint and typecheck tasks passed; 52-case fit calibration passed with NDCG@10 0.951, P@5 0.900, R@10 1.000, weighted kappa 0.846, and zero explicit expectation failures; all 273 test files passed with 2,028 passing tests and one intentional skip. Use `vitest run --maxWorkers=4` for the broad Windows run so Chromium screenshot and strict wall-clock tests receive stable resources; the repeated-source performance test separately passed its 2,000 ms limit at 1,219 ms.
- The final gate reproduced three integration-only issues before going green: an unnecessary Profile Save test cast, source-only fresh workspaces appearing `in_progress`, and default five-second timeouts on multi-template résumé benchmark cases under full-suite contention. The fixes use safe DOM assertions, keep a discovery source as a readiness requirement without treating it as user progress, and assign explicit 10–20 second non-performance timeouts to heavy benchmark tests.
- The first broad run caught 10k identity/ledger index+resolve at 2,119 ms and repeated unchanged-source discovery at 2,435 ms against unchanged 2,000 ms budgets. Single-pass URL normalization, lower-allocation alias matching, and a mutable collision-safe live index reduced three focused runs to 815–1,045 ms and 348–356 ms respectively. The full suite is now green; budgets, corpora, and correctness assertions were not weakened.
- Computer Use's signed helper could not start on this host (`spawn EPERM`) after bounded retries. Do not claim Computer Use evidence. Current visual evidence came from the real production Electron app controlled by the root-owned Playwright harness; subagents did not launch app copies or GUI worktrees.

## Historical Focused Release Evidence (2026-07-31, pre-2026-08-24)

Everything in this section is historical evidence and historical harness
guidance from before 2026-08-24. It predates the removal of native Electron
200% zoom from current acceptance; its 200% statements describe historical
harness runs only and must never be cited as current sealed acceptance. The
current sealed production-acceptance zoom bar is native 125% only (see "Job
Finder exact-build production acceptance").

- Desktop UI integration: 30 passing tests across 8 files; Job Finder integration: 133 passing tests across 12 files.
- Focused safety/recovery: 51 human-action tests, 11 catalog no-submit tests, 39 affected Browser Runtime tests, 86 focused Browser Agent tests, and 5 restart-recovery tests pass.
- Resume extraction: the complete AI Providers suite passes 180 tests; local deterministic extraction is about 73–131 ms; live TXT imports have varied from roughly 21–44 seconds. Persisted `ResumeImportRun` timing records each of four concurrent remote stages (duration, provider identity, provider/fallback source, candidate count) plus text/literal/reconciliation/finalization/total durations. Numeric timing uses a run-row-only post-finalization upsert, and telemetry failure cannot fail the completed import. The focused telemetry regression passes 37 tests/4 files and the broader verification passes 59/4; direct TypeScript, targeted Prettier/ESLint, and diff checks pass. More than 99.8% of the measured 44.3-second run was remote-stage time, not parser latency. The focused resume-analysis cache suite proves compatible unchanged imports skip provider calls, source/parser/provider/prompt/schema/policy/context changes miss, missing digests disable caching, partial provider outcomes are not reused, and refresh recomputes.
- Source/ranking: 66 focused source tests and 71 matching tests pass; the real Mercury public-provider check returned HTTP 200 with 56 jobs in about 454 ms, and the rebuilt UI retained 24 jobs, showed 19, and hid 5 hard conflicts.
- Not-interested feedback coverage must prove legacy schema defaults, bounded reason validation, local persistence, scoring isolation, duplicate/alias preservation, explicit undo/reset, and keyboard-reachable reason chips. Hidden jobs are a separate projection and must not disappear without an undo path.
- Direct TypeScript checks pass for Contracts, AI Providers, Job Finder, Browser Agent, Browser Runtime, and Desktop. Broad lint passes outside Browser Agent; each modified Browser Agent production file passes focused lint.
- The fresh production Electron build passes with 743 main-process modules, 2 preload modules, and 2,098 renderer modules. Current visual acceptance is recorded in the consolidated 2026-08-09 artifact paths above.
- Historical (pre-2026-08-24) Computer evidence proved recommendation-card containment at the enforced 1024×720 minimum production window and native Electron 200% zoom in historical harness runs. A `webContents` zoom-factor-2 replay showed Profile, Find jobs, Shortlisted, Applications, Needs you, and Settings together and reachable in the reflowed shell. That 200% coverage is historical harness evidence only — current sealed acceptance runs no 200% leg. A smaller screenshot crop is not proof of a supported sub-minimum viewport.
- Navigation acceptance also verifies that `Needs you` is a separate notification/action group and that all workflow destinations plus the notification control remain visible at high zoom. Discovery layout acceptance compares empty and established states so Current Search cannot change columns after results load.
- Tailored-résumé progress acceptance requires a readable visible percentage, progressbar semantics, no regression to zero after route revisit while the operation is pending, cleanup after settlement, and reduced-motion-safe transitions.
- Resume Studio acceptance starts with the preview and export/approval controls visible while job context and claim trust are collapsed but keyboard-accessible. A live tailored path must export an exact PDF, verify its bytes, approve it, return to Shortlisted, and show that exact file ready without granting final-submit authority.
- Résumé visual acceptance must render the current production-Electron export to PDF and then PNG, inspect every shipped template for readable hierarchy, consistent margins, clean rules, sensible page breaks, no clipping/overlap/broken glyphs, and no card-like application chrome, and compare the integrated result against a current-run baseline. Preview editing hooks must remain editor-only and absent from export markup.
- Candidate Asset lifecycle coverage must prove `until_deleted` defaulting, opt-in 30/90-day clocks beginning at successful import, immediate application-resolution rejection after removal/expiry, seven-day Trash metadata, explicit-policy restore with a fresh clock, startup/lazy enforcement, ordinary byte-plus-metadata purge, transient purge retry behavior, legacy-record normalization, recent-orphan preservation plus aged-orphan cleanup, typed restore IPC with no raw path exposure, authoritative Settings refresh/retry/disabled controls, and keyboard reachability. Application-flow coverage must prove Candidate Asset artifacts contain no durable path, request verified bytes immediately before `setInputFiles`, reject removal/tampering after initial resolution, retain no external-write receipt for the blocked upload, and never grant final-submit authority.
- For Computer Use acceptance of the app's own browser runtime, launch the built Electron executable directly with an isolated `UNEMPLOYED_USER_DATA_DIR`; do not nest the app inside Playwright's Electron launcher. Measure `Open browser` through visible `Ready`, verify the dedicated profile and DevTools endpoint, and fail the run if it remains on `Starting browser`.
- Historical pre-2026-08-24 harness guidance (historical harnesses only, never current sealed acceptance): use native Electron `webContents` zoom factor 2 for true 200% acceptance in those historical runs. `--force-device-scale-factor=2` remains a useful high-DPI stress reproduction, but it is not interchangeable with product zoom acceptance and must be labeled separately. Current sealed acceptance has no 200% leg; native 125% is its only accepted zoomed leg.
- This is intentionally focused evidence. It does not claim a new `pnpm verify` run.

## Structure Checks

- `pnpm structure:check` for large-file and hotspot warnings
- `pnpm hotspots` for the biggest files and concentration areas

## Source-Generic Discovery Guard

- `pnpm source-generic:check` rejects source-branded helper declarations in shared discovery/browser-agent workflow code
- focused coverage includes `packages/browser-agent/src/agent/search-results-budget.test.ts`
- multi-source discovery coverage must reconcile validated, duplicate, staged, and persisted counters and prove duplicate-heavy early identities do not shrink later-source exploration budgets
- resume-integrity/versioning coverage must prove saved-private-copy SHA-256, exact rendered HTML/PDF digest and format, malformed/missing legacy digest handling, tailored approval-time tamper or missing-file rejection, original/tailored pre-apply tamper or missing-digest rejection before an application attempt, digest/format propagation into privacy receipts, legacy revision compatibility, exact pre-mutation snapshots, no-op suppression, stale-save and slow-generation CAS rejection, atomic failure, 100-per-draft retention without cross-draft deletion, SQLite close/reopen chain integrity, exact restore across restart, approval/export invalidation including synchronized SQLite JSON/index state, original-profile preservation, bounded history UI, and save-before-restore behavior; the current focused cross-layer batch proves these behaviors with 150 tests
- fit-truth coverage must prove legacy scorer compatibility, explicit compensation states, same-currency interval normalization across hourly/monthly/yearly wording, unknown and cross-currency neutrality without exchange-rate guesses, bounded above-minimum preference, below-minimum score/recommendation protection, ordering counterexamples, and Easy Apply isolation from suitability; catalog-agent and catalog-runtime helpers must retain unknown or cross-currency listings while excluding only explicit same-currency floors below the saved minimum
- match-dimension coverage must prove typed safe defaults plus cited role suitability, preference alignment, application effort, and evidence-confidence outcomes; preference fixtures must cover location, work mode, seniority, employment type, and preferred company only when comparable evidence exists; unknown evidence must remain neutral, Easy Apply must affect effort only, and evidence confidence must measure supportability rather than hiring odds
- dimension and calibration fixtures must prove scorer/session version 8 (logic revision 7) keeps unknown evidence neutral and effort outside fit, orders conservative recommendation before aggregate score, blocks hard geography/clearance/required-evidence conflicts, and produces a deterministic ranking-change audit against the labeled 52-case/four-cohort baseline
- single-assessment coverage must prove one full calculation per unique scorer/context/posting input across budget and merge, persisted reuse only for exact version 8 fingerprints, safe legacy/profile/preference/material-posting invalidation, cross-target dedupe, and a 500-posting replay with stable output/order and measured before/after CPU; the current five-run in-process smoke measured `507.36 ms` full versus `275.38 ms` session median (`45.7%` reduction), exactly 500 calculations per run, and no measured regression from the prior version 2 session median of `278.27 ms`
- Fit breakdown UI coverage must prove one compact five-row single-column list, the overall recommendation on result and detail surfaces, a visible required-gap callout, requirements behind a native disclosure, keyboard disclosure operation, recommendation-badge containment at wide/narrow/200% scale, and separate zero-overflow shell navigation acceptance at 200% device scale

## Resume Integrity And Versioning Performance

- replay the independent persistence proof with `pnpm exec vitest run packages/db/src/resume-draft-revision-retention.performance.test.ts`
- prefill exactly 100 retained revisions, measure only the atomic repository commit, use 20 save-style and 20 restore-style samples, and keep exact cap, final-draft, restore-lineage, and approval-invalidation assertions outside the timing gate
- latest independent evidence: atomic save p50 `1.35 ms` / p95 `2.60 ms`; restore-style mutation p50 `1.38 ms` / p95 `2.91 ms`; both remain below the generous `750 ms` p95 host gate

## Desktop Core

- `pnpm desktop:dev`
- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop typecheck`
- `pnpm --filter @unemployed/desktop lint`

## Desktop UI Harnesses

- `pnpm --filter @unemployed/desktop ui:capture`
- `pnpm --filter @unemployed/desktop ui:resume-import`
- `pnpm --filter @unemployed/desktop ui:profile-setup`
- `pnpm --filter @unemployed/desktop ui:profile-baseline`
- `pnpm --filter @unemployed/desktop ui:profile-copilot-preferences`
- `pnpm --filter @unemployed/desktop ui:source-sign-in-prompts`
- `pnpm --filter @unemployed/desktop ui:resume-workspace`
- `pnpm --filter @unemployed/desktop ui:resume-workspace-dirty`
- `pnpm --filter @unemployed/desktop ui:original-cv-flow`
- `pnpm --filter @unemployed/desktop ui:applications-copilot-review`
- `pnpm --filter @unemployed/desktop ui:applications-recovery`
- `pnpm --filter @unemployed/desktop ui:applications-queue-recovery`
- `pnpm --filter @unemployed/desktop ui:interview-helper`
- `pnpm --filter @unemployed/desktop ui:interview-helper-basic:built`
- `pnpm --filter @unemployed/desktop test:interview-helper-audio:built`
- `pnpm --filter @unemployed/desktop test:interview-helper-live-system-audio`
- `pnpm --filter @unemployed/desktop test:job-finder-prepare-only`
- `pnpm --filter @unemployed/desktop test:job-finder-prepare-only:built`
- `pnpm --filter @unemployed/desktop test:job-finder-complete-flow`
- `pnpm --filter @unemployed/desktop test:job-finder-complete-flow:built`
- `pnpm --filter @unemployed/desktop test:job-finder-ashby-flow`
- `pnpm --filter @unemployed/desktop test:job-finder-ashby-flow:built`
- `pnpm --filter @unemployed/desktop test:job-finder-workday-flow`
- `pnpm --filter @unemployed/desktop test:job-finder-workday-flow:built`
- `pnpm --filter @unemployed/desktop test:job-finder-ats-matrix`
- The non-`:built` commands above rebuild and are pre-seal diagnostics only.
  After acceptance is sealed, use only the bound `:built` commands documented
  in "Post-seal bound runs"; no post-seal command may rebuild the accepted app.
- `pnpm --filter @unemployed/desktop ui:interview-helper-protection`
- `pnpm --filter @unemployed/desktop ui:apply-queue-controls`
- `pnpm --filter @unemployed/desktop ui:action-inbox:built`
- `pnpm --filter @unemployed/desktop ui:job-finder-phase-two` — hardened phase-two Electron replay. It builds the desktop app, seeds synthetic campaign/CRM/intelligence state, captures Home, Campaigns, Rapid review, Applications, Outcomes, Resume strategies, Companies, Safeguards, and Needs you at 1440×920, 1280×720, and native Electron 200% zoom, and checks renderer errors, layout overflow, persisted read/recovery actions, nested scroll ownership, and no application/final-submit authority. The accepted 40-capture report is `apps/desktop/test-artifacts/ui/phase-two-absolute-final/capture-report.json`.

## Running Desktop Benchmarks

- Run from the repo root: `pnpm --filter @unemployed/desktop build`
- Do this before desktop benchmark scripts or benchmark-backed source/debug checks because `apps/desktop/scripts/benchmark-job-finder-app.mjs` launches `out/main/index.cjs`, and stale build output can invalidate results
- Historical benchmark detail is no longer kept as plan docs; use current benchmark reports under `apps/desktop/test-artifacts/ui/` and git history when old run detail is needed.
- `pnpm --filter @unemployed/desktop audit:job-finder-live` compares the built app's discovery results with the current full Remote/Greenhouse and Aircall/Lever provider inventories using `docs/resume-tests/Ebrar.pdf`. It runs in a temporary user-data directory with discovery-only, original-CV, review-before-submit safety settings and writes `apps/desktop/test-artifacts/job-finder/live-discovery-audit/live-discovery-audit-report.json` plus a rendered `evidence-ledger.png`; it requires network access and must never be changed to execute application actions.

## Configured AI Capability Benchmark

- `pnpm ai:benchmark plan` validates and prints the frozen synthetic corpus without making provider calls.
- `pnpm ai:benchmark full <lane>` runs one lane serially and resumes only validated artifacts. Supported lane IDs are `luna_high`, `luna_max`, and `sol_low`.
- `pnpm ai:benchmark full-report` requires exactly 330 unique outcomes and writes the machine-readable aggregate for the run.
- `pnpm ai:benchmark lane-report <lane> [run-label]` scores one complete 110-case lane without requiring the other configured models. The fresh Luna acceptance label is `post-runtime-20260812`.
- `pnpm ai:benchmark canary luna_high` runs the 11 hardest representative cases across every supported AI family. The 2026-08-12 post-remediation run passed 11/11 with zero fallback; durations ranged from 6.05 s to 73.90 s, and paginated discovery completed in 27.83 s during the consolidated run.
- Keep each lane serial. Different lanes may run concurrently because their seeded schedules and manifests are isolated.
- Never add personal résumé/profile fixtures, live workspaces, credentials, authenticated browser state, application actions, or final submission to this corpus.
- Treat model-contribution scores as triage evidence. A deterministic fallback must be reported separately and cannot be credited to the model.
- The completed 2026-08-12 report is `docs/audits/AI_MODEL_CAPABILITY_BENCHMARK_FULL_2026-08-12.html`; ignored raw artifacts are under `.tmp/ai-evals/full_v2_b09aba7db2da/`.
- The post-runtime Luna-only comparison and production-Electron acceptance report is `docs/audits/LUNA_HIGH_AND_PRODUCTION_ACCEPTANCE_2026-08-12.html`; its ignored raw lane is under `.tmp/ai-evals/full_v2_b09aba7db2da_post-runtime-20260812/`. That full lane predates the dedicated value tools, transport retry, visual normalization, and pagination extraction fixes; use the current hard canary as the acceptance checkpoint until a new full lane is intentionally requested.

## Safety Rules

- do not run live-site submit flows or final-submit QA unless the user explicitly re-authorizes it
- validate apply work with deterministic contracts, service tests, and desktop harnesses by default
- The live prepare-only harness must use a temporary user-data directory and fake profile, approve a current deterministic resume before apply, and fail if any attempt, job, or application record reaches `submitted`. Source URL, label, roles, and exact-job enforcement are configurable through `JOB_FINDER_PREPARE_ONLY_*` environment variables. The legacy intermediate-write test flag is restricted to loopback synthetic destinations; public ATS preparation requires the same explicit one-job Settings/main authority as production. Final submit remains false and DOM submission stays guarded.
- Privacy-receipt coverage must prove query/fragment and local-path redaction, exact resume identity, typed runtime write evidence, empty model-use truth when no model participates, false account-creation/final-submit authority, and `finalSubmitOccurred: false`; Applications UI coverage must render Stayed local, Sent to a model, Written to the site, and Safety boundary groups without showing an empty receipt for legacy results. Application-packet coverage must additionally prove local-path stripping, destination query/fragment removal, exact answer provenance/checkpoints, and rejection of false submitted status; the desktop export control must remain an explicit local save action.
- `test:job-finder-complete-flow` is the Greenhouse live acceptance gate for the original-CV journey. It queries the configured public board for a current matching vacancy, imports `test-fixtures/job-finder/resume-import-sample.txt` through the real extraction boundary, rediscovers the exact listing, shortlists it, verifies the imported CV remains unchanged, fills the application, and requires the final pre-submit checkpoint.
- `test:job-finder-ashby-flow` runs the same original-CV safety journey against a dynamically selected current Ashby vacancy. `test:job-finder-workday-flow` uses an exact Workday candidate-experience listing and, when run anonymously, requires the expected `site_login_required` human handoff instead of treating sign-in as a failure or attempting credentials.
- `test:job-finder-ats-matrix` builds once and runs the current Greenhouse, Ashby, and Workday cases. Every underlying harness keeps final-submit authorization false and fails if any submitted state appears.
- The pre-2026-08-23 accepted reports under `apps/desktop/test-artifacts/job-finder/complete-flow-current-{greenhouse,ashby,workday}/` were produced by the earlier authorized-write wrappers; they are historical only and must not be cited as current release evidence. Rerun the wrapper commands from the strict ATS wrapper policy instead: Greenhouse and Ashby reach a named final control without submit, anonymous Workday stops at the account gate with `submittedNeverOccurred: true`, and resume-upload verification is not required evidence in strict mode.
- `ui:source-sign-in-prompts` captures desktop and narrow evidence for source configuration plus the browser-owned `I'm signed in — retry` handoff. The harness must prove that the UI says credentials are never handled and retries only after explicit user confirmation.
- Action Inbox acceptance must cover a populated real blocker, Open returning control within its bounded navigation timeout, Done producing still_blocked on a visible login page without reading or entering credentials, the three-attempt circuit breaker, and restart persistence. Application coverage must prove exact run/job/result/checkpoint binding and that a login-blocked queue item does not stop an unrelated item from reaching review; every runtime call must keep `submitAuthorized: false`. Authenticated success may be accepted only after a user voluntarily signs in; automated positive-path tests must use synthetic strong account markers.
- Manual-action-kind coverage must exhaustively render all 11 labels and cover every classified application blocker code. Authentication kinds verify source access; non-authentication kinds verify exact blocker absence. Same blocker/failure/stale stays blocked, no blocker resolves, and a changed blocker resolves the prior request while creating a new pending request. Stable identity must bind kind/code/sorted question IDs/origin/path without being split by prose, query, detail, or evidence changes.
- `ui:action-inbox:built` seeds one application and one discovery-source request into an isolated production Electron workspace, then captures desktop, 900px, and 200% scale. Its report must show every contextual Open/Done/Skip/Cancel control visible, browser-only credentials, and both account creation and final submission false. Inspect the images as well as JSON, and repeat the current production shell separately: a scoped action-inbox harness cannot supersede a later 200% navigation regression.
- Application resumption tests must prove simultaneous Done confirmations share one exact `prepare_only` retry, every retry keeps `submitAuthorized: false` and `accountCreationAuthorized: false`, stale lineage performs no browser work or overwrite, restart after a durable result receipt does not replay, and a newly observed blocker is persisted rather than treated as success.
- Application-document coverage must prove exact job/application/question lineage; relevance-ranked, deduplicated, concise authoritative profile evidence; evidence visibility in preview; non-empty and bounded user edits saved as new review-required CAS revisions; stale-revision rejection; accurate `cover_letter` versus `application_response` CandidateAsset classification without renderer paths; live refresh of the exact file-question picker; and explicit local export receipts. Approval/selection tests must continue to show that neither account creation nor final submission is authorized.
- Change-digest coverage must prove backward-compatible zero defaults, per-source aggregation for new/unchanged/changed/reactivated/newly inactive/known/skipped counts, warnings and duration, partial-failure health, and an accessible failed-source retry that passes only the exact target ID and is disabled during conflicting work.
- The discovery-ledger scale regression must construct 10,000 entries, build the compact alias index, resolve every canonical/tracking/source-ID variant, and stay below the generous two-second host budget. Focused identity coverage must also prove colliding source IDs are narrowed by a unique URL/provider alias, ambiguous or conflicting aliases return no match, same source IDs across provider sources stay isolated by provider identity, legacy URL-only collisions remain ambiguous, and recording an ambiguous posting preserves every existing row; keep broader workspace serialization/render/restart scale separate. Freshness coverage must classify new, unchanged, materially changed, and reactivated listings and prove the persisted v1 digest is stable regardless of provider result order. Refresh scheduling must prove immediate work for new/changed/legacy/reactivated postings, a 24-hour card-only deadline, a seven-day enriched deadline, and no scheduled refresh for applied/intentionally skipped postings. The full-workspace scale regression must persist 1,000 jobs plus representative application/action history, serialize below its generous five-second gate, reopen SQLite, and recover the same normalized snapshot byte-for-byte. The renderer-scale regression must separately exercise the actual pure selection, application filtering/latest-attempt, unresolved-action, and job-label view-model helpers over 1,000 jobs and representative history for repeated passes under a generous host gate; production DOM/layout evidence remains a distinct visual check.
- Catalog/browser application coverage must prove every execute path normalizes to `prepare_only`; legacy submit-capable modes pause; no result can contain a submitted outcome or `submittedAt`; and final controls remain untouched.
- Restart-recovery coverage must prove a persisted running discovery becomes explicit failed/interrupted state on reopen, clears the active run, and retains already saved jobs plus discovery history without automatically replaying external work.
- Performance-budget evaluation must fail deterministic measurements only when they exceed the configured regression allowance (10% by default), treat low-sample live SLO misses as warnings, promote repeated misses to failures once the sample floor is met, and expose typed evaluations through the performance snapshot. Discovery SLO aggregation currently covers first distinct useful job p95, API-source duration p95, and browser-source longest-gap p95.
- Unified Job Finder performance evidence must keep one ordered entry for resume import, resume generation, discovery, application preparation, persistence, IPC, and a representative renderer commit. It reuses persisted import/discovery/application stage timings and measures the workspace snapshot read already performed for the report; missing generation, IPC, or renderer observations remain explicitly `unavailable`, stage-only records remain `partial`, and a measured `0 ms` remains `available`. Settings exposes the same typed snapshot on demand, while the strict diagnostic export includes only timing IDs, numeric measurements, sample/budget status, and no arbitrary detail payloads.
- Application-flow performance tests must keep complete body/action/frame scans constant through form-stability sampling, including the full bounded failure window; controls-only inspection may optimize revalidation but must preserve mutation guards, persisted-value checks, late-widget recovery, and the final no-submit inspection.
- The original-CV desktop harness persists the setting through the real UI, verifies Review Queue shows the imported filename and extracted text without a tailored-generation action, requires the visible primary `Start apply copilot` action, and writes screenshots plus `summary.json` under `apps/desktop/test-artifacts/ui/original-cv-flow/`.
- For an isolated production import without a native file-picker handoff, run `node apps/desktop/scripts/seed-product-quality-audit.mjs --user-data-dir <isolated-dir> --resume <synthetic-resume>`. The seeder requires the test API, disables the browser agent, never performs application work, and writes `product-quality-audit-seed.json`; independently compare its recorded SHA-256 with the exact copied file bytes before accepting integrity evidence.
- Guided Setup and Profile visual acceptance must prove the collapsed Copilot
  launcher does not cover review or save controls. Opening Copilot must not
  reserve a right rail, shrink the profile editor, narrow its tabs, or transfer
  scroll ownership. Check the closed and open states at desktop and compact
  widths, compare their Profile geometry, and reject excessive visual
  occlusion even when DOM geometry technically remains unchanged.
- capture artifacts under `apps/desktop/test-artifacts/ui/`; they are QA output, not source files
- The default Interview Helper harness must prove that starting an interview opens two visible popup windows (answer and transcript), while the main-window conversation, popup typed sends, temporary pasted/selected image attachments, explicit screen-context capture, copy controls, no retained raw image bytes, source-labeled transcript, and configured local STT readiness continue to work. Visible popup acceptance also requires real pointer drags, native edge resizing, hide/reopen from both popup and main controls, preservation of an in-progress draft during a workspace event, and an end/restart cycle restoring the exact saved bounds. `ui:interview-helper-popups` is the automated visual/interaction gate; Computer Use supplies native-window acceptance.
- `test:interview-helper-audio:built` must exercise renderer recording, typed IPC, FFmpeg, and local Whisper for both microphone and Windows meeting/system-audio sources. The standalone local-command smoke test should use synthesized speech when diagnosing machine configuration.
- `test:interview-helper-live-system-audio` is the Windows real-loopback acceptance gate. Start audible media first, optionally set `INTERVIEW_HELPER_LIVE_AUDIO_SOURCE_URL` for report attribution, and require a multi-word meeting-audio transcript, microphone-disabled consent, visible answer/transcript popups, grounded cue/chat with an image attachment, pause/resume, end/review/export, and no retained raw audio/image bytes. Evidence is written under `apps/desktop/test-artifacts/interview-helper/live-system-audio-podcast/`.
- Local STT quality should be evaluated with real speech as well as synthesized smoke audio. On the current host, `ggml-base.en` produced a coherent 18-word live sample in about 9.3 seconds end to end; `tiny.en` was faster but materially less accurate and is not the preferred quality baseline.
- The deeper overlay/protection harnesses remain separate evidence for capture exclusion, layout persistence, interaction mode, and panic-hide; ordinary popup visibility is now part of the default acceptance path.
- Interview Helper provider changes should include `pnpm validate:package ai-providers`; model-backed cue tests must prove schema validation, bounded transcript payloads rather than raw transcript blobs, one retry before deterministic fallback on provider failure, and service-level quiet fallback cards when generated cue output fails validation. Screenshot vision tests must prove transient screenshot image payloads cross the provider boundary and only normalized observations are retained. Audio transcription tests must prove transient audio chunks are sent through the provider boundary and raw audio is not retained in the Interview Helper workspace; local-command STT tests must also prove temporary audio files are cleaned up.
- Interview Helper test/acceptance runs must not reach live providers through defaults. `capture-interview-helper.mjs` defaults to deterministic providers with all interview/shared AI credentials blanked; configured/live mode requires the explicit `UI_INTERVIEW_HELPER_PROVIDER_MODE=configured` env request, is announced on stdout, and sets `UNEMPLOYED_INTERVIEW_TEST_USE_LIVE_AI=1` because the desktop test API otherwise forces deterministic Interview Helper providers (see `docs/AI_PROVIDER_SETUP.md`). `acceptanceEnvironment()` in `release-acceptance-harness.mjs` strips every `UNEMPLOYED_INTERVIEW_*_API_KEY` variable plus the shared keys and that opt-in so no ambient credential wins under the enabled test API. `apps/desktop/scripts/interview-helper-provider-guard.test.ts` pins this boundary statically and behaviorally; the Job Finder resume benchmarks keep their documented `--use-configured-ai` exceptions unchanged.
- validate browser visual evidence changes with contract guard tests, source-generic checks, focused browser-agent/browser-runtime/job-finder tests, and desktop Applications recovery UI evidence when apply surfaces change

Track-specific validation and product-bar requirements live in the handoff layer: `docs/STATUS.md` and `docs/TRACKS.md`. Completed evidence belongs in the linked audit reports, test artifacts, `docs/HISTORY.md`, and git history rather than a completed execution plan.

## Resume Import Notes

- when import or parser routing changes, validate at least one plain-text path and one extracted-document path
- release packaging for the parser sidecar still needs target-OS validation per platform

## Resume-Import Benchmark

- replay with `pnpm --filter @unemployed/desktop benchmark:resume-import`
- corpus is declared in `apps/desktop/src/main/services/job-finder/resume-import-benchmark.ts`

## Resume-Quality Benchmark

- replay with `pnpm --filter @unemployed/desktop benchmark:resume-quality`
- canary-only replay: `pnpm --filter @unemployed/desktop benchmark:resume-quality -- --canary-only`
- corpus is declared in `apps/desktop/src/main/services/job-finder/resume-quality-benchmark.ts`
- report path: `apps/desktop/test-artifacts/ui/<label>/<benchmark-version>/resume-quality-benchmark-report.json`
- persisted HTML artifacts are written under `apps/desktop/test-artifacts/ui/<label>/<benchmark-version>/<caseId>/<templateId>/`
- required case/template results fail the command when canonical work-history representation, fragment-free included bullets, professional experience-summary, grounded skill, keyword, page-target, or ATS render rates fall below `1.0`; every canonical role must remain available in the editor, conservative tailoring preserves usable continuity roles compactly, and balanced/aggressive modes may intentionally hide weak or unrelated roles so relevant evidence receives the recruiter-facing space
- focused résumé-quality regressions also require an exact target-role headline, job-supported skills first, target-aware project ranking, duplicate-metric suppression, two-page targeting for experienced candidates, and bounded aggressive-mode responsibility inference that still rejects invented hard facts
- `date_quality` and `work_history_review` remain diagnostic categories when the rendered output is correct but imported source evidence still requires human confirmation
