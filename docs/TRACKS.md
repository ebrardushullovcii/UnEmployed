# Tracks

Use this file as the short execution queue. Detailed state belongs in `docs/STATUS.md`; completed chronology belongs in `docs/HISTORY.md`.

Updated: 2026-09-03

## Status Keys

- **Active**: implementation or an internal acceptance gate is still running.
- **Ready**: scoped work can start without another product decision.
- **Decision**: implementation waits for an explicit product choice.
- **External**: evidence requires user-controlled credentials, consent, hardware, or another host.
- **Authorization**: repository or external state must not change until the user explicitly approves it.
- **Completed**: current integrated implementation and acceptance are recorded elsewhere.

## Active

- **Completed — first dogfood fix batch (2026-09-02):** the live walkthrough
  findings (Search blocked by browser gate, false FAILED resume badge, bullets
  imported as a paragraph and shipped truncated in the PDF, silent
  deterministic tailoring, form-below-the-fold setup, tripled/lingering save
  toasts, stale search banner, loose mismatch threshold, remote-vs-city
  penalty, contract-first Shortlisted, misleading autosave pause copy, inert
  "Finish in the open application", grey-on-grey light theme) are fixed and
  re-verified in a rebuilt app; a third pass closed every remaining P2 and
  the identity-fixture test debt (job-finder 145 files green); a round-two
  review then produced 79 new findings that were all fixed and re-verified;
  see `docs/STATUS.md`. Next round: fresh testers on this build.

- **Completed — round-three review and fix batch (2026-09-03):** ten
  independent reviewers audited a 94-screenshot walkthrough of the built app;
  253 lane findings plus 9 user-reported findings merged into 90 deduped
  findings (4 P0 / 40 P1 / 46 P2), and eleven fix agents closed them across
  six disjoint file-ownership groups. The four P0s — no Profile save
  affordance in view at any window size, a confident fit percentage on
  title-only evidence, an unnamed browser hand-off with no visible state
  change, and an Assistant that grew the route to 38,000 px at short heights —
  are fixed and re-verified: the final pass clears 8 of 8 gates with no new
  P0/P1, `pnpm test:correctness` is 599 files / 6,919 tests (1 skipped) with
  performance 2/2, and fit calibration passes on scorer v8 after the
  version/fingerprint bump. Two regressions introduced during the round (the
  `@layer base` type-scale collapse and the sidebar module switcher running
  under the page H1) were fixed inside it. Open items — foreground
  resume-import persist with background CAS finalization, per-patch approval
  blockers, the PERF-03 sync envelope and F59 subpath, the vision-branch
  silent-fallback audit, the studio height model, and the "Open listing"
  external-URL decision left to the user — are listed in `docs/STATUS.md`.
  A post-round user follow-up then made the Resume Studio Assistant one
  floating panel at every width (no docked column or compact tab, so opening
  it changes no preview/tools rect), fixed a P0 preview zoom oscillation
  caused by the auto-fit observer watching its own scroll region, replaced the
  expanded >=1440 sidebar's More popover with inline "Everything else" groups
  in a self-scrolling nav, and re-centered the header module switcher on a
  three-region grid with a Windows caption-button reserve; that work also
  supersedes the docked-preview open item and is recorded in `docs/STATUS.md`.
  Prepare-only throughout; no commit. Next round: fresh testers on this build.

- **Completed — Resume Studio approval and split-pane repair (2026-09-01):**
  desktop Resume Studio now keeps its preview and long editor in bounded,
  independent panes. One `Approve resume` action saves edits and privately
  creates/verifies the application PDF; downloading a copy is optional. After
  approval, `Prepare application` is the primary next action and returning to
  Shortlisted is secondary. Optional suggestions no longer create a global
  review task, real blockers remain explicit, and supporting evidence is moved
  to the bottom of the tools pane under plain optional copy. Current-build
  proof is in
  `apps/desktop/test-artifacts/ui/resume-review-hierarchy-after-20260901`.

- **Completed — integrated Profile-to-Applications product-finish pass
  (2026-09-01):** the current build has inspectable local evidence for compact
  Profile Copilot, Shortlisted, live resume editing, grounded Guided Edits
  proposal review, one-page PDF export/approval, Prepare, and Applications.
  Final durable state is one ApplicationRecord, one paused attempt, null
  outcome, zero submitted jobs, and no final-submit occurrence. The final
  screenshot batch is
  `apps/desktop/test-artifacts/ui/product-loop-final-after-chat-apps-r3-20260901`;
  open Profile Copilot proof is
  `apps/desktop/test-artifacts/ui/product-loop-final-profile-copilot-20260901/01-open.png`.
  The final touched slice passes focused tests and desktop typecheck and was
  rebuilt once after the visual fixes. External ATS credentials, challenges,
  consent, accounts, writes, and submission remain intentionally user-owned
  and outside this completion claim.

- **Active — lightweight product-finish loop (2026-08-31):** use a small fresh
  group of independent current-build testers for Profile -> Find jobs ->
  Shortlisted -> resume review/approval -> Prepare -> Applications. Require
  candid feedback on flow, clarity, action reachability, hierarchy, spacing,
  clipping, overflow, contrast, loading, navigation, and every first stable
  viewport. Save only useful screenshots and concise findings, synthesize by
  root cause, fix a coherent batch, run focused checks for the touched slice,
  rebuild once, and repeat with new testers. Run testers sequentially against
  isolated data to avoid Electron/CDP and workspace contamination. Seals,
  fingerprints, custody, `pnpm verify`, `pnpm test:evidence`, and canonical
  P01-P14 waves are release-candidate-only and are not prerequisites for the
  next product fix batch.

  Immediate journey scope, preserved across task compaction:
  - verify and finish Profile import/setup through discovery, shortlist,
    tailored resume, approval/preparation, and Applications in the current app;
  - finish Profile Copilot as a simple readable chat that carries out requested
    profile edits through compact proposals and explicit user approval—no
    “Send request” ceremony, cramped long text, or oversized approval cards;
  - verify Resume Studio keeps its preview visible, makes every validation
    “Fix in editor” action visibly navigate/focus, and offers grounded AI edit
    suggestions for user approval where appropriate;
  - repair Applications action hierarchy and grouping, native import/picker
    recovery, and recurring Electron crash behavior when reproducible;
  - actively reject visual defects like clipped headings, missing collapsed
    branding, poorly centered loading states, tabs whose content change is below
    the fold, weak active/status labels, inconsistent widths, missing margins,
    cramped banners, overflow, overlays, and awkward button layouts.

This is the sole active queue item. The snapshots below preserve prior evidence
and old wave state only. Their embedded “next”, restart, freeze, custody, ATS,
and P01-P14 instructions are superseded and are not executable work.

## Reference snapshots — not active

- **Reference — current settled visual/safety evidence (2026-08-31):** rebuilt
  Electron proof now covers native resume-picker recovery: manual fallback
  retires the waiting request, a late old selection is discarded, a second
  picker opens, and a normal TXT import completes. Focused import lifecycle
  checks pass 133/133. Current-build Applications recovery screenshots
  at 1440/1280 show natural-width, start-aligned valid actions, and focused
  uncertainty tests keep a `null`-receipt retry fail-closed. Resume Studio at
  1280 keeps preview/tools visible with 20 notes and 4 blockers; Open editor
  reaches the exact focus target and announces it. Profile Copilot now uses a
  non-resizing modeless overlay: current rebuilt-app 1440/1280 evidence keeps
  Profile tabs full-width and clickable, places a compact 360x480/384x520
  Copilot below them, and proves long input, proposal review,
  Apply/Reject/Undo, pending-review launcher state, and bottom-position
  restoration after minimize/reopen. Current-build 1175/1280 geometry is
  unchanged before/after opening, with no horizontal overflow; the compact
  overlay can still cover lower-right Profile controls until minimized. Native 125%, provider
  failure, and retry remain unestablished. The old seal/persona wave is invalid after
  source changes. Goal remains **ACTIVE**. Next: continue the lightweight
  product-finish loop above; defer the hard-freeze chain until the user names a
  release candidate.

- **Reference — final pre-freeze visual and prepare-only journey closure:**
  Wave9bb (2026-08-31) closes the current-source product pass: Guided setup is
  full-width with one scroller, populated Discovery has a 16px status boundary
  and one offline warning owner, and successful save confirmations no longer
  cross routes and cover new actions. Focused checks pass 27/27 plus 13/13.
  Current-build 1440/native-125 screenshots pass without horizontal overflow;
  the synthetic resume journey exports and manually verifies a one-page PDF,
  requires exact-file approval, creates the Applications record, then pauses
  before final submit with `outcome=null` and zero submitted jobs. No external
  write or credential was used. The source and docs are now ready for the
  next product-testing round. The release-only verify/evidence/immutable
  acceptance, custody, ATS, and P01-P14 sequence is intentionally deferred.

- **Active — scale-02 nested-scroll-owner acceptance repair:** Wave9ba
  (2026-08-30) records the fully passing frozen chain: `pnpm verify` covered
  564 files (6,299 passed / 1 skipped; performance 2/2), and
  `pnpm test:evidence` passed for release `release-20260830T014219-abc8c6`,
  manifest file SHA
  `2bb90e86990673d7f1ff861519ffaad82b775e9061270b03bb0a720baeab4520` (the
  evidence run ID is authoritative). Machine-passing
  `production-acceptance-QoIqu1` produced 46/46 with expected seal
  `67bb03c67ad1b9c897dd441cc20d55c378dfdc6324ed1b229712b563c0273b68`, but
  root manual review rejected it and no custody followed: populated scale 02
  at 1440 still hid Find Jobs H1 beneath the fixed shell. Long-label and
  `ACTIVE`/menu/min/native screens passed. The outer-main reset missed the
  nested `LockedScreenLayout` scroll owner; anchoring and the dynamic header
  could shift it. The product fix resets that owner before paint, sets
  `overflow-anchor: none`, uses an explicit data selector, and targets it in
  discovery settlement; the already-Results first-job edge uses a
  layout-phase latch/settle. Focused evidence includes locked-layout 32,
  discovery-layout 4, and first-reveal 4 initially, then 2 files/9 after the
  lifecycle fix; independent review is clean. No new heavy run, seal,
  custody, ATS, or personas exist. Goal remains **ACTIVE**. Restart the frozen
  chain and manually inspect exact scale 02, including the user-reported
  header.

- **Active — native-125 distinct-state scale-evidence repair:** Wave9az
  (2026-08-30) records the frozen `pnpm verify` pass across 564 files (6,299
  passed / 1 skipped; performance 2/2) and `pnpm test:evidence` pass for release
  `release-20260830T012210-325fde`, manifest
  `6359a10194a9287990b6853acaa6af76e052ac28fd6c6f667bf299b3d17ac603`. The
  `production-acceptance-N5YSPB` run passed fresh 17/17, including long-label
  012/013/014, then stopped at scale because the 16 Find Jobs page-1 native125
  capture and 22 final native125 overview capture were byte-identical. Manual
  inspection confirms the same valid state; the second capture only returns to
  the same route/page-1/viewport. The harness now gives both the same explicit
  `screenshotStateId` while preserving distinct scenario/completion IDs and
  strict distinct-state collision failures. Static validation, Node check,
  Prettier, and diff pass. No seal/custody/ATS/personas exist. Goal remains
  **ACTIVE**. Restart the frozen chain and manually inspect the replacement
  header/`ACTIVE`, long-label, and More-menu visuals.

- **Active — native-125 More-menu scale-selector repair:** Wave9ay
  (2026-08-30) records the fully passing frozen chain: `pnpm verify` covered
  564 files (6,299 passed / 1 skipped; performance 2/2), and
  `pnpm test:evidence` passed for release `release-20260830T005828-5f9aa6`,
  manifest `3408cda1bb0edccde81e35caa66031576b785d4ce10cfb43d55efc514f57c965`,
  with no drift. Machine-passing `production-acceptance-YOxiiA` produced 46
  captures and expected seal
  `5bae2b565c6c4b4b6a36dcac90c360e5cf98789ca99aa69d24b1650acdee8319`, but
  manual inspection rejected it and it was never custodied: fresh `012`
  clipped the Find Jobs heading after capture reset forced an already-visible
  tall first card to `block:center` and scrolled the outer route after settle.
  Header/`ACTIVE`/minimum-width/native125/More-menu and representative flows
  passed. The harness now uses an explicit fail-closed inner scroll/containment
  selector while preserving outer ownership/focus; the screenshot showed the
  intended scrollbar/“Scroll for more”, `orphanHeaderCount=0`, and a 4px
  header-row gap. Static acceptance validation, Node check, Prettier, and diff
  pass; no product renderer change. No seal/custody/ATS/personas exist. Goal
  remains **ACTIVE**. Restart the frozen chain and manually inspect the
  replacement, including the user-reported header and `ACTIVE` visuals.

- **Active — native-125 scale-acceptance selector repair:** Wave9ax
  (2026-08-30) records the frozen `pnpm verify` pass (564 files; 6,299 passed
  / 1 skipped; performance 2/2) and `pnpm test:evidence` pass for release
  `release-20260830T003924-c13bbb`, manifest
  `70923c38929b2815c157153c47f004e32ef529f3a740600e81206e2c9c53996c`, with no
  drift. `production-acceptance-N3yHL4` failed native125 scale because the
  harness measured the outer `overflow-hidden` More menu instead of the new
  inner scroll region. The product screenshot showed the intended
  scrollbar/“Scroll for more”, `orphanHeaderCount=0`, and a 4px header-row gap;
  the harness now has an explicit fail-closed inner scroll/containment selector
  while preserving outer ownership/focus. Static acceptance validation and
  Prettier pass. No seal/custody/ATS/personas exist. Goal remains **ACTIVE**.
  Restart from `pnpm verify`, then manually inspect the user-reported
  header/`ACTIVE`, long-label, and minimum-width More visuals.

- **Active — final acceptance/UI/persona hardening:** Wave9aw (2026-08-30)
  records that machine-passing `production-acceptance-1JtwkP` (46 captures;
  seal `99795679932117406210d233313512c598fb9111b88a26bcf326e62dc6012162`)
  was manually rejected and never externally custodied: the 1440 Find Jobs
  header collapsed/overlapped, and the long-label first result was partially
  clipped under the fixed shell. Batched UI fixes now put the readiness warning
  full-width below title/actions, settle first-result reveal to the whole-header
  boundary, improve minimum-width More-menu scrolling/affordance, pair
  `ACTIVE` with Listing activity, and remove the duplicate zero-result
  readiness warning/CTA with correct `aria-describedby` ownership. Persona
  custody hardening adds restart semantic parity intelligence, recognizes
  `P##-uuid` workspace ownership, enforces strict CDP identity/redirect checks,
  and uses deterministic code-unit sorting. Focused evidence: UI 106 tests plus
  a 30-test follow-up (18+12), persona custody 71/71, and desktop
  typecheck/lint/format/diff where reported; no new build/Electron/verify/evidence
  ran after these fixes. Goal remains **ACTIVE**. Next: one final frozen
  verify -> evidence -> build/immutable Electron acceptance, manually inspect
  the exact header/ACTIVE/long-label/min-width menu screens, then custody,
  ATS, and P01-P14.

- **Active — persona-wave Job Finder flow hardening:** Wave9av (2026-08-30)
  records the `sPexxQ` all-persona preparation stopping safely after P01-P12:
  P13's returning original CV used an input-asset path and placeholder digest,
  so production restart correctly cleared it as unavailable. P13/P14 now seed
  verified bytes under the canonical app-owned resume directory with an exact
  absolute path and SHA. Persona preparation passes 62/62 and a real
  file-repository reset/close/startup/reopen test passes 8/8, including the
  invalid legacy-path negative case. No tester launched. Restart the frozen
  chain into fresh custody roots and require 14/14 plus `--verify-all` before
  blind sessions. Wave9au (2026-08-30)
  records that `production-acceptance-KX6VeE` passed the machine gate but was
  manually rejected because the minimum-width Find jobs header collapsed into
  an unreadable narrow column. Discovery now keeps its title on a full row
  through compact desktop widths and wraps readiness/search actions below it;
  focused layout/type/format checks pass. Restart the frozen chain, manually
  inspect the replacement PNG, then bind strict ATS and prepare/verify P01-P14.
  Wave9at (2026-08-28)
  makes returning-persona setup comparison derivation-aware while preserving
  full restart durability, restores P14's required sign-in prompt lineage, and
  distinguishes shared screenshot state from genuine collision in scale
  evidence. The latest diagnostic reached 5,000 jobs and all 1,001-record
  boundary collections before the duplicate-label guard stopped it. Focused
  persona/custody tests pass 77/77 and acceptance static validation passes.
  Restart the exact source-bound chain, prepare/verify P01-P14, then begin
  serialized blind sessions. Wave9as (2026-08-28)
  makes disabled starter sources and resume/CRM defaults explicit in persona
  seed intent so the post-reset semantic equality check matches production
  startup materialization without relaxing custody. Tests pass 60/60. Build a
  fresh seal, retry real P01, then prepare/verify all personas. Wave9ar
  (2026-08-28)
  serializes real persona seeding behind the app's startup workspace read before
  the one allowed reset. The prior P01 attempt was rejected safely by the
  production activity gate before data removal; custody tests pass 60/60.
  Restart the frozen chain, then prepare and verify P01-P14. Wave9aq (2026-08-28)
  aligns persona custody source-path exclusions with the acceptance producer
  for nested test artifacts, TypeScript build info, and generated evidence
  mirrors. The prior fully passing seal exposed this fail-closed verifier drift
  before any persona seed; custody tests pass 59/59. Restart the frozen chain
  once, then prepare and verify P01-P14. Wave9ap (2026-08-28)
  replaces the smoke's stale positional apply-copilot preload call with the
  typed action object, repairs the same Interview Helper capture seam and
  benchmark discovery-result unwrapping, and permits Workday's strict gate to
  accept either its expected login handoff or a truthful intermediate-write
  guard. Focused harness tests pass 74/74; Greenhouse and Workday diagnostics
  pass with zero submit. Ashby currently has no matching vacancy and exits
  before app launch. The preceding seal is stale; restart the frozen chain,
  bind Greenhouse/Workday to the new seal, classify Ashby as current public
  inventory drift, then prepare P01-P14. Wave9ao (2026-08-28)
  unwraps the typed agent-discovery `{ outcome, snapshot }` result before the
  strict smoke reads workspace jobs/warnings; focused wrapper tests pass 63/63
  and all submission authorities remained false in the failed bound runs. The
  previous seal is stale. Restart the source-bound chain, rerun Greenhouse and
  Workday, and classify Ashby's current no-vacancy public-board drift before
  persona preparation. Wave9an
  repairs the strict bound-ATS smoke's module-initialization TDZ by capturing
  ambient acceptance intent only after all resolver lexical dependencies
  initialize; focused wrapper tests pass 62/62 and independent review confirms
  the failed attempt launched no Electron/browser work and performed no ATS
  mutation or submit. The prior seal is stale by the required restart rule.
  Restart verify, evidence, immutable acceptance, external custody, and the
  three strict `:built` wrappers once before preparing P01-P14. Wave9am
  completes the non-claiming packaged-app diagnostic end to end with 46
  screenshots. The runtime probe now waits for the rendered Job Finder shell
  before lazy-route navigation and captures contextual route diagnostics on
  timeout. Freeze this exact source and run the source-bound verify, evidence,
  and immutable production-acceptance chain once; only then prepare and start
  P01-P14. Wave9al
  aligns the final accepted-app header probe with responsive ownership: it
  chooses the rendered Interview Helper anchor/button and excludes focusables
  inside closed Task center details. The 18-case geometry self-test, static
  validator, and focused shell/Task center suites pass. Continue one diagnostic
  run through the final probe, then restart the sealed chain once before any
  P01-P14 session. Wave9ak
  aligns the scale row-disable reason with current `unchanged original resume`
  wording while preserving the accessibility wiring check; static acceptance
  and the focused list suite pass. Continue diagnostic acceptance, then restart
  the sealed chain once before any P01-P14 session. Wave9aj
  completes the Shortlisted batch-action wording alignment by probing the
  current `Prepare up to 10 drafts` action instead of retired `Generate` copy;
  static acceptance validation and the focused list suite remain green.
  Continue diagnostic acceptance, then restart the sealed chain once before
  any P01-P14 session. Wave9ai
  aligns the 1,001-record Shortlisted batch-action evidence with current
  `ready to prepare` copy; static acceptance validation and the focused list
  suite pass. Continue non-claiming diagnostic acceptance until fully green,
  then restart the source-bound sealed chain once before any P01-P14 session.
  Wave9ah
  aligns the scale lifecycle capture with the current Applications `Stages`
  view instead of the retired `Tracker` label; static acceptance validation
  and the focused Applications screen suite pass. Continue non-claiming
  diagnostic acceptance until fully green, then restart the source-bound
  sealed chain once before any P01-P14 session. Wave9ag
  aligns the 1,001-record Applications scale probe with the current full-row
  action identity (`data-collection-item-id` plus `aria-current`); static
  acceptance validation and the focused records-panel suite pass, and the
  sealed chain restarts before any P01-P14 session. Wave9af
  scopes clickable-point evidence to the foreground More navigation only while
  that overlay is open, so intentionally covered background controls are not
  misclassified while all other captures retain the global probe. Static
  validation pins the scope and the sealed chain restarts before any P01-P14
  session. Wave9ae
  aligned the immutable long-label semantic probe with the visible, tested
  `discovery-detail-primary-action`; static acceptance validation and the
  focused renderer suite pass, and the sealed chain restarts before any
  P01-P14 session. Wave9ad hardened the blind-persona fixed-port proof so
  malformed or unreadable `DevToolsActivePort` files fail closed instead of
  qualifying for the file-absent HTTP fallback; the custody suite is 59/59.
  P0/P1 fixes from
  2026-08-26 persona evidence (Jordan, Priya, Maya) are integrated: encoded
  resume routes, safeguard discovery un-block, KosovaJob/Wellfound junk filter,
  fallback/resume/CTA/home/nav/discovery-banner UX, Wellfound employer slug
  inference, Applications service-worker recovery copy, prepare gate aligned with
  Shortlisted approved-export readiness (stale `approvedExportId` + user-data
  path resolution), and Wellfound "View all … jobs" nav filtering. Re-run Priya
  (encoded job id → resume) and Jordan (Prepare/service worker) on an isolated
  `UNEMPLOYED_USER_DATA_DIR` with live AI test flags before claiming the flow
  perfect. LinkedIn prepare may still require manual finish after Safeguards
  browser reset. Alex (data) + Sam (frontend) from-scratch funnel polish is in:
  sticky guided-setup CTA, completeness strip, Shortlisted Export→Approve
  clarity, Discovery last-card clip, Essentials review counts, sources-blocked
  Search primary CTA, checkpoints visual hierarchy, Applications employer
  omit/infer, and Find jobs posting-date ranking badges in comfortable density.
  Alex wave9g (2026-08-27): reused wave9f userdata — shortlist→approve→Prepare
  LIVE_AI=0 PASS (checkpoint consent Continue without; no finish-opening crash).
  Wave9i (2026-08-27): rebuilt desktop; Applications list Next step Safeguards
  copy live-proven on wave9g userdata; Shortlisted ready-state Current
  state/checklist collapsed when Prepare is ready. Wave9j (2026-08-27):
  Shortlisted ready Application readiness strip compacted (3 primary facts +
  disclosure); shared primary CTA border/edge weight for Prepare/Search/
  Safeguards. Wave9k (2026-08-27): current-build synthetic Sam import/source/
  search and a separate copied-workspace Shortlisted→Prepare→Applications path
  pass, including no-submit and 1029×860 checks. Live follow-up proved Search is
  now disabled when no target role/job family exists, routes to the focused
  target-role editor, and re-enables after saving `Frontend Engineer`. Wave9r
  (2026-08-28) closes the clean current-build Sam prepare-only funnel: empty
  userdata → import → guided setup/source opt-in → deterministic partial
  discovery → shortlist → tailored PDF export/exact approval → Prepare consent →
  one paused Applications record, with zero employer-submit controls. The
  ignored evidence includes dark/light captures plus preserved failed attempts.
  The scanner now traverses schema.org ItemList rows inside the real Playwright
  page context, and partial compact results survive unavailable model expansion.
  Still open: live ready-strip proof beyond this synthetic source, native
  Save/Open dialog observation, authenticated ATS/provider runs, accessibility
  review, and sealed acceptance after authority scope settles.
  Wave9q closes the confirmed unreadable-import dead end: full Profile accepts
  plain resume text, rebases clean after normalized persistence metadata, enables
  Refresh immediately, and retains the result across an isolated Electron
  restart. Earlier 2026-08-28 selector-drift attempts remain diagnostic history;
  use only wave9r/wave9v's final empty-userdata evidence as the current Sam
  funnel proof. Wave9v refocused acceptance on the original journey, reran the
  fresh current-build Sam funnel end to end, visually inspected the exported
  PDF, and fixed the live 125% compact Applications selection so the stacked
  detail/Next step region is revealed immediately. Wave9w adds a distinct fresh
  Priya/Backend Engineer current-build funnel with every prepare-only leg green,
  plus genuine production-mode macOS Open selection and Save export. Its
  keyboard/reduced-motion replay reaches Shortlisted and the exact resume
  workspace by Enter, shows visible focus rings after a corrected settle-aware
  probe, and records sound landmark/image semantics. A direct Computer Use pass
  also clicks the genuine macOS Save Cancel control and proves no export artifact
  was added; a second pass clicks genuine macOS Open Cancel and proves the exact
  imported resume state remains unchanged. Wave9x then runs one current public
  source rather than another synthetic board: Umbrel Ashby returns 11 current
  jobs, Results presents 7 and hides 4 clear mismatches, the exact public Senior
  Frontend listing is inspected, and one original-resume-ready row persists in
  Shortlisted. That replay fixed staged jobs being omitted from campaign
  retention and staged shortlist promotion writing a non-reviewable status.
  Wave9y extends that same public source through deterministic tailored PDF,
  export/approval, Prepare, and Applications with no submit state. It also
  corrects the persona harness so generic resume copy cannot pass
  readiness and the current Review-and-approve CTA is followed. Configured
  provider testing is now bounded and honest: Muse xhigh and DeepSeek max time
  out at 60 s on the real resume payload; low reasoning returns in 25.9/41.9 s
  respectively but contributes zero verifier-accepted rewrites. Keep the safe
  fallback, but do not call it configured live-AI quality. Wave9z completes the
  small Luna UX/visual specialist pass and corrects the remaining P1 evidence
  truth: the public Ashby route reaches the exact application, then safely stops
  when the site attempts an unauthorized intermediate field save. The harness
  now reports this as `SAFE_STOP` / overall PARTIAL, binds exact durable lineage
  and no-submit facts, and exits on durable terminal state. The Applications
  banner is outcome-neutral, the Discovery Shortlist CTA is visible without
  scrolling at 1440x920, and unrelated Chrome component workers no longer block
  the managed application context. Decide whether this manual handoff satisfies
  the prepare-only release contract or whether a scoped intermediate-write
  capability is required; only then freeze and start canonical P01-P14.
  Wave9aa removes the technical blanket-window hazard without activating it:
  Browser Runtime now allows only classified same-origin autosave/draft
  fetch/XHR mutations inside one 3-second/8-request grounded-field window and
  denies final-action, ambiguous, cross-origin, late, beacon, long-lived, popup,
  navigation, and DOM-submit traffic. Pure, fake-runtime, and real-Chromium
  coverage passes 77/77. Wave9ab closes the production activation seam without
  widening final authority: Settings/main require one job, one origin, one
  resume digest, current approved answers, and future expiry; all prepare paths
  perform a repository-backed initial check and same-envelope-revision recheck
  before every field window. Local fills no longer count as external writes;
  only a successful authorized response does. The legacy test override is
  loopback-only. Focused contracts/service/UI/resolver, core Job Finder, and
  Browser Runtime/Chromium gates are green. Next run one isolated exact-build
  Electron smoke, inspect it, then freeze and launch P01-P14 in bounded batches.
  Do not run a public ATS write merely to turn wave9z green; that still requires
  the user's explicit selection of the exact inspectable policy.
  Wave9ac completed that isolated authority/settings smoke and entered the
  freeze, where `pnpm verify` and `pnpm test:evidence` passed. The first
  immutable acceptance attempt then failed closed at the minimum-width fresh
  Home capture because its scripts still searched for the retired `Planning
and settings` label while the visible, renderer-tested compact control is
  **More**. The selector, safety-probe allowlist, serialized sampler/static
  tokens, focus checks, and diagnostics now match **More**; focused validation
  passes 164/164. Since the acceptance tooling changed, restart the exact
  freeze sequence before sealing or preparing personas. The retained failed
  run is diagnostic only, and no persona workspace/session exists yet.
  Still open: personal screen-reader/hardware review, configured live-AI quality,
  authenticated ATS proof, private-resume quality, and sealed acceptance. Do not
  spend the next product wave on another ad hoc synthetic persona or
  authority-only contract slice unless it closes one of those named gaps.

- **Active — temporary Muse Contributor Go dogfood:** ignored local
  configuration routes shared text, tool-based agent work, and image-capable
  resume/browser/Interview analysis to OpenCode Go `muse-spark-1.2-contributor`
  through Responses with requested `xhigh` reasoning. Luna is not used in this
  local override. A synthetic models + tool-loop probe passed. Wave9y adds one
  real synthetic-resume app attempt and focused provider comparison: the xhigh
  app draft timed out at 60 s and fell back safely; Muse low returned in 25.9 s
  but all 6 proposed rewrites were rejected by the deterministic grounding
  verifier. This is negative capability evidence, not resume-quality
  acceptance; browser-agent and Interview Helper capability remain unaccepted.
  Persona
  testers that need the resume-import test API can keep
  `UNEMPLOYED_TEST_API_USE_LIVE_AI=0` for compact-first discovery (zero-new /
  already-saved feedback); enable live AI when model/tool escalation is required.
  Run initial checks with synthetic data only. Before any private resume,
  application answer, credential, or interview input, obtain explicit informed
  consent because this contributor tier may use prompts and completions for
  Meta model training. Rotate the temporary conversation-shared key. Decide
  after capability/privacy review whether to keep this override, revert to
  ADR 0010's DeepSeek+Luna Go route, or supersede that ADR. Setup:
  `docs/AI_PROVIDER_SETUP.md`.

- **Active — autonomous application architecture reset:** ADR 0012 authorizes
  prepare-only, confirm-before-submit, and autonomous-submit modes under an
  explicit user-scoped authority envelope. Current code remains prepare-only.
  Both disposable comparisons are complete and recorded in ADR 0013: discovery
  becomes API-first, deterministic compact observation second, and bounded model
  escalation third; applications move to an explicit deterministic
  observe/propose/authorize/execute/verify protocol rather than a submit flag in
  the coupled driver. Additive contracts, the compact observer, compact-first
  ordinary-discovery integration, the pure submission-policy gate, and the
  durable authority persistence foundation are now implemented without widening
  production submission authority. Migration v15 plus in-memory/SQLite parity
  cover revision-guarded envelopes, immutable preflights, one-time grants,
  idempotency, armed markers, outcomes, revocation propagation, and idempotent
  armed-crash recovery to permanent uncertainty. Wave9m adds focused-green
  source-generic exact-one browser hands and an internal synthetic orchestrator;
  confirm grant consumption plus arming is now one transaction-current compound
  repository operation, and submitted-like synthetic results fail closed.
  Wave9n wires idempotent armed-attempt recovery into the real Desktop startup
  factory and adds strict main/preload management APIs that can inspect and
  revoke authority but reject elevated modes and intermediate writes. Wave9o
  adds a separate inspectable prepare-only Settings
  surface with disabled elevated modes and confirmed revocation; repository
  rotation is now atomic and SQLite plus in-memory guards enforce at most one
  active envelope. This is management UX only, not execution authority. Wave9p
  binds elevated envelopes and preflights to one exact versioned,
  revisioned, canonical-digest decision policy; the transaction-current arm
  boundary now recomputes that digest and verifies approved answers, scope,
  canonical origin, resume, capacity, and grant before mutation. The pure gate
  requires explicit current policy/answer/finite-stop facts, and the synthetic
  orchestrator rechecks them around arming. Legacy low-level grant-consume and
  arm methods were removed so only the compound policy boundary can arm an
  attempt. Production remains prepare-only and renderer management cannot mint
  policy identity. Still open: production composition, elevated activation and
  grant UX/IPC, independently verified submitted outcomes, and revised live
  acceptance. Wave9q completes focused atomic
  `not_submitted` / `outcome_uncertain` reconciliation into the exact
  ApplyJobResult privacy receipt and a visible manual-verification warning; it
  does not create a production execution path. Wave9r additionally projects the
  same durable non-submission truth into the exact ApplicationRecord in the
  authority transaction, preserving CRM fields and deduping outcome events.
  Wave9s adds a main-only Browser Runtime bridge and Job Finder composition seam
  behind an explicit package subpath. A local Chromium plus file-backed SQLite
  integration proves one synthetic action, durable uncertainty projection, and
  duplicate-key no-retry without exposing execution through renderer, preload,
  IPC, or the legacy prepare-only flow. Still open: elevated policy and grant
  issuance, user-facing activation, the remaining synthetic matrix, and
  post-wave9s serialized acceptance. Wave9t adds the independent operator path:
  an uncertain result is user-resolvable only after employer-site verification
  and a second confirmation; main derives evidence/current revision and DB
  atomically projects the fresh terminal truth while preserving the original
  uncertainty. Task Center and Applications keep retry unavailable until that
  resolution, and a fresh isolated production-Electron replay passes both
  outcomes plus restart persistence. This is recovery evidence, not execution
  authority. Wave9u now adds the main-owned approved-answer snapshot/readiness
  aggregate: immutable answer content persists append-only, Settings receives
  only counts/identity/status, current answer edits stale approval by digest,
  and an isolated built-Electron replay proves approval and restart behavior at
  normal and compact widths. It adds no grant, arm, browser action, or submit
  route. The next safe activation dependency is exact one-time confirm-grant
  issuance bound to current preflight, policy, answer-snapshot, and authority
  lineage.
  Evaluate Profile Copilot operation tools and Resume Studio/editor foundations with the same
  measured-replacement rule.
  Preserve truthful evidence, exact application lineage, idempotency, revocation,
  and pause-on-unknown behavior without preserving current implementation
  structure for its own sake. The post-wave9m broad `pnpm verify` gate is green
  (550 correctness files, 6,135 passed / 1 skipped, plus both performance
  files), followed by a green production Electron build; later acceptance
  remains serialized.
  Active plan:
  `docs/exec-plans/active/job-finder-autonomous-application-architecture.md`.

- **Active, paused — sealed acceptance and blind persona chain:** this chain
  currently certifies the prepare-only target superseded by ADR 0012. Do not
  enter freeze, seal a build, bind ATS results, prepare persona workspaces, or
  launch P01-P14 until the authority architecture and revised acceptance contract
  are implemented. The existing tooling and evidence remain useful historical
  baselines. The integrated
  implementation slices (listing activity/filters, complete company views,
  exact ApplicationRecord lineage, transaction-current CRM bulk updates,
  onboarding source opt-in, exact resume approval, 10-per-run and
  20-per-local-day safeguards, atomic employer exclusion, durable pre-browser
  start accounting, canonical/user-approved company ownership, salary/offer
  evidence, document lineage, fail-closed company/CRM UI truth) are complete.
  The acceptance tooling — immutable accepted-app seal/custody, persona
  seeder/launcher with CDP, strict/consumed verification, and measured startup
  geometry, the evidence init/record/aggregate harness, release-mirror
  fingerprint exclusion, and strict ATS binding with distinct safe-blocker
  truth — is implemented and focused-green but unaccepted. No exact-build
  sealed run, external seal custody, post-seal ATS binding result, prepared
  persona workspace, or persona session exists for the current source. The broad
  non-Electron gate is current after wave9l, but no exact-build acceptance run or
  custody exists. Strict ATS bound mode and the
  accepted-app production-like probe have passed focused tests, static
  validation, and independent safety review. Job Finder stays the priority
  track: the simplification/fix wave that followed the pre-fix live dogfood
  journeys is code complete at focused level (focused tests green in the
  current dirty tree), and the post-wave9l broad gate is green, but it has no
  fresh-build sealed or rebuilt live acceptance evidence yet. The exact
  remaining chain precedes the hard freeze: make exactly one production build, then
  replay one fresh live complete journey against that build — including
  résumé export through the explicit test-API chooser bypass and a separately
  observed human native Save As/Cancel pass in production mode — and only
  then freeze. User-owned external gates below and the dirty-tree/no-commit
  freeze rules in `docs/TESTING.md` are unchanged. Exact sequence, restart
  rules, and thresholds:
  `docs/exec-plans/active/job-finder-sealed-acceptance-and-blind-personas.md`.

- **Active — release and deployment gates:** the shell is implemented for 1440px
  desktop, compact widths, keyboard use, long labels, and practical native
  Electron 125% zoom at a normal desktop window — the current low-vision
  acceptance point after the user removed native 200% zoom from current
  acceptance on 2026-08-24 because it collapses into a mobile-like layout with
  low diagnostic value (existing 200% harness runs and evidence stay historical
  records, not current requirements) — but screen-reader acceptance is still
  pending. Live current-source Electron sessions are the primary UX evidence;
  automated suites stay mandatory guardrails and integrity checks that never
  substitute for them.
  Live relevance, private-resume and
  generated-draft quality, configured provider/network transport, authenticated
  ATS behavior, credentials/consent, account creation, and final submit remain
  user-controlled external gates. No exact-build, broad-release, live-quality,
  accessibility, authenticated-ATS, or persona-completion claim is current.

## Ready Queue

- **Ready after the sealed acceptance run — canonical blind persona wave:** the
  fixed 14-persona manifest, deterministic resume/job corpora, accepted-app seed
  pipeline, external custody index, and tester launcher are prepared and
  focused-green but unaccepted. After the stable source passes the final sealed run and the expected seal digest is held
  outside the repository, run one single sequential `--persona all` preparation
  into a fresh empty destination root plus a fresh custody root, re-check the
  sealed wave with read-only `--verify-all`, then launch independent UI-only
  testers through the custody-bound launcher (`--attempt` for relaunch/retest).
  No persona has launched or completed. The protocol, thresholds, and stop
  conditions are in `docs/TESTING.md`; sequence and restart rules live in
  `docs/exec-plans/active/job-finder-sealed-acceptance-and-blind-personas.md`.
  The wave measures the quality-over-speed bar — boundary understanding,
  save/approval durability, and paid-product finish — and cannot replace
  private-resume, live-source, authenticated-ATS, or personal-accessibility
  deployment review.

## Decision Required

- None. Windows DACL hardening and generic PDF/DOCX/OCR extraction remain deferred product scope rather than release-blocking decisions.

## External

- User deployment review: with explicit consent, walk the current Job Finder using the user's private résumé, judge extraction and generated wording, and report concrete UX/quality defects with screenshots. Use `docs/audits/JOB_FINDER_DEEP_ACCEPTANCE_REVIEW.html` as the review guide.
- Resume an authenticated Workday application checkpoint only after voluntary browser sign-in and explicit user confirmation. Never infer authentication from navigation.
- Validate Interview Helper microphone/system audio, popup, screenshot, and capture-protection behavior on macOS/Linux target hosts.
- Run personal screen-reader/reduced-motion acceptance during deployment review.
- Re-run discovery search and source checks with the user's configured live provider/network path to confirm transport availability. Product failure classification, exact retry, retained partial work, and stale-guidance provenance are covered locally; provider/network availability is not.

## Explicit Authorization

- Commit, push, create/update a remote branch, or open a PR only after the user accepts the intended scope and explicitly authorizes that exact repository action.

## Completed Context

- Current-source dogfood unblock: Job Finder package validation passes 137 files /
  1,795 tests; Desktop package validation passes 275 files / 2,613 tests plus its
  prepare-only report-binding check; AI Providers passes 28 files / 398 tests;
  the production Desktop build passes; legacy company aliases are repaired by
  migration 14 without deleting workspace data; and the rebuilt app opens the
  real Profile, Find jobs, Shortlisted, and Applications surfaces.
  Autonomous final submission remains tracked separately and disabled.
- Save-retry revision hardening: Profile, setup, Resume Studio, and Settings now
  retire exact-request retries on every supported user edit, including edits
  inside already-dirty forms and field-array append/remove actions. Hydration,
  canonical reseeds, save echoes, discard, and assistant-origin changes remain
  silent; focused edit-signal suites pass 65/65.
- Phase-two six-slice batch: advanced campaign rules and truthful pre-search funnel, local schedules/digests/in-app notifications, outcome analytics with explicit campaign/application identity, resume strategies with enforced generation policies, company intelligence with merge review, and high-volume safeguards with recovery are implemented. The integrated focused closeout passed 59 test files / 770 tests with zero failures, including 4 safeguard files / 92 tests; the production desktop build passed; and the hardened Electron harness passed 40/40 nested-scroll checks with zero runtime, safety, overflow, or unreachable-control findings across 40 captures at 1440×920, 1280×720, and native 200% zoom. The initial broad attempt was blocked before scripts ran; the later 2026-08-19 repository-wide gate passed. Exact state: `docs/exec-plans/active/job-finder-campaigns-dashboard-crm-scale.md`.
- AI capability reliability core: shared typed tool-task runtime; dedicated value-setting tools with runtime-owned metadata; temporary profile/résumé proposal drafts with validation repair; valid paged tool results; classified transport retries; progress/time/provider-cost/safety stop rules; persisted browser checkpoints; page-two extraction recovery; and truthful fallback attribution for chat, résumé vision, browser vision, and Interview cues. The current Luna High hard canary passes 11/11 with zero fallback. Acceptance report: `docs/audits/LUNA_HIGH_AND_PRODUCTION_ACCEPTANCE_2026-08-12.html`; decisions: `docs/adr/0009-luna-high-default-and-capability-contracts.md` and `docs/adr/0010-opencode-go-mixed-text-and-vision-routing.md`.

- AI model capability benchmark: 330/330 frozen synthetic outcomes across Luna high, Luna max, and Sol low, 671 provider calls, exact completeness checks, and independent qualitative review. The current owner-selected route is OpenCode Go with DeepSeek V4 Flash for normal text/tool work and Luna High for image-only work. Full report: `docs/audits/AI_MODEL_CAPABILITY_BENCHMARK_FULL_2026-08-12.html`; routing ADR: `docs/adr/0010-opencode-go-mixed-text-and-vision-routing.md`; contract-first agent ADR: `docs/adr/0009-luna-high-default-and-capability-contracts.md`.
- Roadmap implementation: fit/cache truth, durable job identity/freshness, progressive discovery, action handoff/resumption, résumé grounding/coverage/versioning/cache/quality gates, per-job CV choice, application readiness/recovery/packet/receipt, workspace deltas, scale/persistence, saved-state feedback, Task center, diagnostic/performance evidence, Windows Interview health, and the current customer-facing Job Finder journey.
- Historical Windows production evidence: fresh first-run setup, three-profile live public-provider ranking, original-CV and configured Luna-high tailored-CV journeys, Greenhouse original-CV safe checkpoint, Ashby tailored-CV safe checkpoint, anonymous Workday sign-in handoff, responsive Action Inbox, and limited Interview Helper popup regression. Most cited artifact directories for these runs no longer exist locally (only the live public-provider ranking summary remains inspectable); see the acceptance-evidence audit in `docs/STATUS.md`.
- Deep production acceptance: 104 current screenshots across the deep matrix, résumé flow, and first-run flow; zero renderer/console errors; zero document/main horizontal overflow; final submission/account creation remained disabled and untouched.
- Candidate Asset lifecycle: opt-in 30/90-day retention starts after successful import, removal/expiry enters seven-day Trash, restore selects a fresh policy/clock, and startup/lazy enforcement performs ordinary filesystem purge without a secure-erase claim.
- Résumé presentation: all eight apply-safe families use distinct flat, print-aware typography and restrained accents; card/pill document chrome is removed while preview editing hooks and ATS-safe export semantics remain intact.
- Computer Use usability remediation: thirteen recorded findings are addressed across job-scoped résumé validation, authoritative attachment status, Interview lifecycle/health/source labels/popup close reconciliation, conversational and collision-safe Profile Copilot behavior, browser-bound persistence, honest discovery/source-check failure semantics, and profile-inferred discovery without a mandatory title.
- Job-source library scale: sources have a dedicated Profile tab with catalog-wide search/status filters, 25-row pagination, one mounted detailed editor, explicit opt-in enablement, truthful progress, EU Lever provider routing, and production-Electron pointer-scroll evidence against 507 disabled records.
- Final integrated gate: guidance/docs/source-generic checks, package lint/typechecks, fit calibration, and 273/273 test files pass; 2,028 tests pass with one intentional skip. The 100-candidate repeated-source check retains margin under the unchanged 2,000 ms budget at 1,219 ms in its focused run.
- Full details and exact artifacts: `docs/STATUS.md`, `docs/TESTING.md`, `docs/audits/JOB_FINDER_DEEP_ACCEPTANCE_REVIEW.html`, and `docs/audits/JOB_FINDER_COMPLETION_REVIEW.html`.
- Older milestones: `docs/HISTORY.md`.
