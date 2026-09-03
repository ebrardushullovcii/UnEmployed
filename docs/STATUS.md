# Status

Read this only for active feature work, handoff updates, broad repo changes, or unclear current state.

Updated: 2026-09-03

## Current Truth

- **Active workflow decision (2026-08-31):** the product is still being shaped,
  so sealed acceptance, fingerprints, external seal custody, full `pnpm
verify`, `pnpm test:evidence`, and canonical P01-P14 waves are deferred until
  the user explicitly declares a release candidate. The active loop is now:
  run a small number of independent current-build product testers, retain
  inspectable screenshots and concrete feedback, synthesize findings by root
  cause, implement one coherent fix batch, run only focused checks for touched
  behavior, rebuild once, and repeat with fresh testers. Keep product safety
  boundaries intact, including prepare-only behavior and user-owned
  credentials, challenges, consent, account creation, and final submission.
  The interrupted broad run exposed sandbox-only listener failures and stale
  identity-gate test fixtures; those are deferred test debt unless they block a
  touched product slice. No current release or sealed-acceptance claim is made.

  **This is the only current next-action authority in this file.** Later wave
  entries are retained as historical evidence. Their old “next”, “restart”,
  freeze, custody, ATS, and P01-P14 instructions are superseded and must not be
  executed during the active product-finish loop.

### Current product observations

- **Dogfood fix batch (2026-09-02):** one live first-user walkthrough of the
  built app (fresh user data, `docs/resume-tests/Ryan Holstien Resume.pdf`,
  Wellfound, live AI) produced a ranked report (2 P0, 9 P1, ~20 P2) and one
  fix batch. Fixed and re-verified in a rebuilt app: Find jobs no longer
  disables Search behind "browser runtime not ready" with a wrong "Enable
  sources" CTA (the run opens the browser itself; search ran directly and
  returned results in ~14 s with no stale banner); the Profile resume strip no
  longer shows FAILED after a successful multi-stage import (the vision stage
  now CASes against the current profile revision and re-reconciles once);
  resume bullets using `●` are parsed as achievements (10/8/6 per role instead
  of one paragraph), the tailored draft came from the live provider ("created
  with AI assistance") and the approved PDF is one clean page with no truncated
  or duplicated bullets; guided setup is form-first with a compact stepper and
  human step names; save feedback is one 5 s toast; Shortlisted is ~960 px
  instead of ~3300 px with the safety contract in a disclosure; fit hides
  sub-35 jobs as mismatches and stops penalizing remote listings against a
  saved city; Applications states the autosave pause truthfully, "Finish in
  the open application" is a real action with a toast, and diagnostics sit
  under Technical details; Home reports a working source as healthy; the light
  theme is layered (white panels on a light canvas) and passes the token
  contrast test. A second pass fixed what the re-walk exposed: pending
  imported suggestions no longer block "Finish setup and find jobs" (the
  contracts-level blocking rule now matches the renderer: only critical or
  required missing-field items gate completion, and a later import with only
  suggestions keeps setup completed), the route-change blocker now proceeds
  instead of cancelling a parked navigation once its protecting save settles,
  and the setup route's completed redirect targets Find jobs for the
  just-finished hand-off. Focused suites pass (desktop Job Finder
  renderer/pages/shared/preload 220 files / 2,129 tests, contracts 41 files,
  ai-providers 31 files, job-finder matching 150 tests plus fit calibration
  gates); desktop/job-finder/ai-providers/contracts typecheck; the desktop
  build passes. A third pass (four parallel implementation agents, disjoint
  ownership) then closed every remaining P2 and the deferred test debt:
  Home first-run copy ("Set up your profile", neutral source line, no empty
  search box), plain-language Home/plan/notification labels, a two-sentence
  setup entry without legal disclaimers and no phantom scrollbar, step-name
  consistency after the rename, one-line work-details helpers, a 2×2/4-col
  tailoring-strength grid, compact auto-grow story/answer fields with plain
  labels, one-sentence Ready-check cards, one review hint per queue,
  requirement rationales that no longer claim resume evidence for work mode
  or location, inspector without "Updated: Unknown", "Employer not listed ·
  source" placeholders, meta line under the Find jobs title, real buttons
  for Search history / Search only this source, Shortlisted hedges reduced,
  a labelled compact "More" control, Settings theme buttons as ordinary
  `aria-pressed` buttons (they were `role="radio"`, which is why automation
  clicks timed out), preview highlight only on real selection, a one-month
  date-overlap tolerance, matching "Guided edits"/"Copilot" launcher pills,
  section headers with only non-default state chips, truthful Applications
  list next-step, zero-count filter chips hidden, single pause sentence,
  equal-weight consent buttons with shorter copy, action-only Needs-you
  steps, no "Search plans 1" badge for the lone default plan, and "Rapid
  review" → "Quick review". The six job-finder identity-fixture suites were
  repaired by seeding fresh-start profiles (the identity gate is unchanged),
  so job-finder is 145 files / 1,923 tests green; the preload lint error and
  a browser-agent hook timeout were fixed. A final end-to-end live
  walkthrough on the rebuilt app (fresh data, same PDF, Wellfound, live AI)
  passed every stage with zero renderer errors, and the compact and light
  passes were clean. The full `pnpm test:correctness` suite passes (579
  files, 6,614 tests, 1 skipped) and `pnpm test:performance` passes 2/2;
  desktop lint and typecheck are clean. Evidence: `shots-final` in the session scratchpad and
  the published fix-batch report. No commit, no employer write or
  submission.

- **Round-two review and fix batch (2026-09-02):** three independent
  reviewers re-audited the rebuilt app screen by screen against the round-one
  findings (64 fixed / 30 partly / 16 not fixed) and produced 20 new P1 and 59
  new P2 findings with 0 P0. Three implementation agents then fixed all of
  them: provisional fit framing when nothing beyond the title was checked,
  banded results (matches / weaker matches / clear mismatches) with a working
  "Show mismatches (n)" toggle, one shared source-health classification for
  Home and Profile (`deriveSourceHealthSignals` /
  `describeEnabledSourceHealth`), ZIP codes no longer parsed as a region, one
  canonical summary and skills list on Profile with the rest under
  disclosures, section-tab labels that agree with their bars, the Copilot
  launcher yielding while a form field is focused, form-first Job targets,
  setup sources using the same "Include in searches" control as Profile,
  dark-theme primary raised to `#8fa6c6` (AA on every dark surface), a white
  resume preview page in both themes, one causal story per Applications
  pause, a truthful Stages tab, a friendly "Resume no longer available" state
  instead of a raw IPC error, `ASP.NET` / `C#, .NET` token normalisation and
  terminal punctuation in rendered bullets, an opaque sticky Settings nav,
  human labels for reusable-answer kinds, and a long list of copy and
  density fixes. A final leftovers pass then docked the Copilot launcher into the
  sticky footers, kept floating chat panels under modal scrims, set aside
  pending guided-edit proposals on approval with a visible note, made
  "Continue without" the recommended consent default, and gave the light
  sidebar a visible active state. A last polish pass then reserved the Guided-edits
  panel footprint in the Studio grid, labelled the compact header pills
  ("Tasks", "Needs you") within the shell's single 1440px desktop bound,
  made the Applications list column sticky beside its own scroll owner,
  fixed the active sidebar badge contrast, and reflowed the Stages table
  inside its column. Full `pnpm test:correctness` passes (580
  files, 6,660 tests, 1 skipped), performance 2/2, desktop lint/typecheck
  clean, build green; a fresh end-to-end walkthrough on the rebuilt app
  (now also covering Shortlisted tabs, the Studio tools pane, Applications
  Stages and Technical details, Profile scrolled, Job sources, Search plans,
  and Settings authority) completed every stage with the live model producing
  the tailored draft. Open after the last run: on one walkthrough the
  accepted Guided Edits summary (reported as grounded by the proposal
  verifier) was then rejected by the export validator as an unsupported
  claim, so approval was correctly blocked with "Fix approval blocker"; the
  two grounding checks should share one rule. Seventeen round-two findings
  remain unjudged only because no capture reached their screens (Shortlisted
  Job details tab, scrolled Home/Shortlisted, Studio skills rows); the
  scrolled page-title clipping question (B13) was left for screenshot
  evidence. Evidence: `shots-r3` in the
  session scratchpad and the published round-two report. No commit.

- **Round-three review and fix batch (2026-09-03):** ten independent
  reviewers (two contrast, two UX, visual/layout, two action-visibility,
  performance, product owner, verification) audited a 94-screenshot
  walkthrough of the built app; a cross-checker merged 253 lane findings plus
  9 user-reported findings into 90 deduped findings (4 P0 / 40 P1 / 46 P2)
  across six disjoint file-ownership groups, and eleven fix agents ran in
  three waves plus a cleanup pass, a polish pass and a final four-item pass.
  The four P0s are fixed: Profile had no save affordance in view at any window
  size (Save sat ~5,300-5,700 px down the page even at 1440x920 because the
  `LockedScreenLayout` bounded path never engaged on Profile); the fit score
  asserted a confident percentage on listings whose only checkable evidence
  was the title; the browser hand-off used four names for the browser and
  three for its confirm action and produced no visible state change; and the
  Assistant was unusable at short heights (at 1200x640 the tab-owned Assistant
  grew the route to 38,000 px, putting Accept/Reject ~37,000 px below the
  fold). Root causes worth keeping: the fit defect was a stored "Location not
  stated" placeholder being tokenised as geography, fabricating an
  `incompatible` conflict and a -10 penalty, plus a bare requirement row
  counting as verification — `MATCH_ASSESSMENT_SCORER_VERSION` went 7 -> 8 and
  fingerprint logic revision 6 -> 7 so persisted assessments recalculate, and
  fit calibration passes on v8 (NDCG@10 0.919, P@5 0.900, R@10 1.000, kappa
  0.852, 0 expectation failures); Profile opened dirty on every load because
  `buildProfilePayload` recomposed `currentLocation` from city/region/country
  and preferred it over the stored line; nested pane scrolling was slow
  because `handleContentWheel` offered every downward delta to the header and
  `getLockedHeaderWheelTarget` received `maxScrollTop` undefined on every
  locked route, so a pane moved exactly (200 - topHeight) px per event — 61 px
  on Find jobs, 136 px on Shortlisted — with `preventDefault` on 8 of 8
  events, and arbitration is now native-first with custom handoff only at a
  true scroll boundary; and resume import stages fell back silently because
  `openai-compatible.ts` emitted no notes on timeout while a fallen-back stage
  still returned candidates, so nothing populated warning/errorMessage —
  stage results now carry a structured fallback `{kind, reason}` that surfaces
  as a plain-language note. Two regressions introduced during the round were
  fixed inside it: moving `globals.css` bare element rules into `@layer base`
  fixed oversized sidebar labels but collapsed the type scale app-wide (H2
  across 12 sizes, inputs at 17-19 px against 13-14 px body), resolved by
  defining h1 24 / h2 19 / h3 16 / h4-h6 14 at weight 600 with inputs at body
  size and removing the per-component overrides that fought it; and the
  compact-header alignment rule was applied to the sidebar layout, where the
  module switcher wrapped and ran under the page H1. Final verification (r12)
  passed 8 of 8 gates with no new P0/P1: Assistant route height 38,000 px ->
  864/524 px with Accept/Reject in view and hittable at 1440x920, 1440x840,
  1280x720 and 1200x640; scroll deltas flat 100/100 from the first event with
  outer deltas 0 and `preventDefault` 0; a single 53 px approval row at
  1200x640; Settings first card 12 px clear of the sticky subnav and last card
  62 px clear of the sticky bar; exactly one Assistant transcript node across
  a 1440 -> 1200 -> 1440 excursion; zero heading inversions across 8 routes;
  selection deltas 0 on Shortlisted, Find jobs and Applications; console 0
  errors; and light-theme compact captures with no overflow. On the final tree
  `pnpm test:correctness` passes 599 files / 6,919 tests with 1 skipped (591
  files / 6,766 tests at the round's start) and `pnpm test:performance` passes
  2/2; desktop lint and typecheck are clean; `pnpm validate:package` passes
  contracts 41 files / 571 tests, ai-providers 32 / 432, and job-finder 150 /
  1,971; `pnpm source-generic:check`, `git diff --check`, and
  `pnpm validate:docs-only` pass. AI provider: the key was invalid during the
  r8 capture and was replaced mid-round; with the working key Assistant
  proposals ran live (22 s), while the tailored draft still fell back to the
  deterministic generator because the model's single proposed rewrite was
  rejected by the grounding verifier — the safety system working, and
  disclosed in the app. On the final run the provider timed out on all three
  AI import text stages at 25 s; record that as an environment/provider-latency
  finding, not a product defect. Open after this round: foreground
  resume-import persist with background CAS finalization (not attempted — a
  ~1,800-line CAS-critical restructure); per-patch `approvalBlockers` still
  computed at proposal time and not recomputed if the draft moves on; the
  sync-envelope IPC change (PERF-03 remainder) and the F59 contracts subpath;
  persona-manifest "Profile Copilot" wording (custodied digest, deliberately
  untouched); a vision-branch silent-fallback audit; `analysisProviderKind`
  mis-reporting the first stage while degraded stages stay tagged `model_*`;
  the More menu still scrolling at 1440x640 (deliberate — bounded scroll was
  chosen over occluding its trigger); the studio height model
  `calc(100dvh - shellChrome - 12)` ignoring the scrolling title row, so the
  section overflows ~11-21 px at scroll 0; the studio content area still ending
  ~41 px below the fold at scroll 0 at 1440x920 (title-row height model), and
  the shell rendering two preview iframes (the `xl:hidden` compact copy plus
  the desktop one); and an "Open listing" external-URL action
  deliberately not added, since the app has no external-URL capability at all
  and adding one is a product/security decision for the user. The round stayed
  prepare-only throughout: no application was submitted, no credentials were
  used, no account was created, no employer legal terms were accepted, and
  resume claims remained evidence-grounded. Evidence: `shots-r8` (before)
  through `shots-r9`, `shots-r10`, `shots-r11`, and `shots-r12` (after) in the
  session scratchpad. No commit.
  - **Post-round user follow-ups (2026-09-03):** Resume Studio's Assistant is
    now one floating panel at every width: a `position: fixed` body portal,
    384 px at 1280 px and wider, 360 px below that with a 320 px floor, height
    clamped to the viewport, drag clamped inside the window, and minimize
    folding it into the launcher pill at the panel's bottom-right corner,
    which reopens it. The docked third grid column and the compact Assistant
    tab were removed, so opening the Assistant changes no preview or tools
    rect: those rects measure identical at 1440x920, 1280x720 and 1200x640,
    Accept/Reject stay in view and unobscured at all three, and one transcript
    node survives resizes. A P0 preview oscillation (rapid zoom in and out)
    was fixed: the auto-fit `ResizeObserver` observed its own scroll region,
    so a scrollbar toggle changed the measured width and flipped the scale
    every frame; it now observes a zero-height width probe, ignores deltas of
    1 px or less, uses 8 px hysteresis, and the scroller sets
    `scrollbar-gutter: stable`, giving 60 identical samples over 3 s (0.7307
    at 1440, 0.8080 at 1280). The expanded sidebar at 1440 px and wider no
    longer has a More popover: every secondary destination renders inline
    under "Everything else" as Your data (Documents, Companies, Outcomes) and
    Setup and safety (Search plans, Resume approaches, Safeguards, Settings)
    plus a Keyboard shortcuts entry; the sidebar nav is its own scroll owner
    with the toggle pinned, so it scrolls internally at 1440x640 (616 vs
    508); every sidebar count uses one transparent tabular treatment (the
    Companies count previously had a per-kind badge fill); the collapsed rail
    mirrors the same destinations icon-only; and the compact sub-1440 More
    menu is unchanged. The group labels are eyebrow spans, not headings. The
    header module switcher ("Job Finder | Interview Helper") is centered again
    through a three-region grid (wordmark / switcher / utilities with equal
    1fr side tracks) with the macOS traffic-light inset mirrored on the right
    and, on Windows (frameless, app-painted caption buttons, no
    `titleBarOverlay`), an 8.5rem trailing reserve so utilities never sit
    under the caption buttons; the compact second-row nav card is centered on
    the same axis, with a measured centre offset of 0.0 px at 1440, 1280, and
    1152 px. This supersedes the round's docked-preview open item: no dock exists
    any more. Evidence: `shots-r13`, `r13-assistant.json`, and
    `r13-sidebar.json` in the session scratchpad; review-queue tests pass 37
    files / 453 tests, shell/pages/components pass 861 tests, and desktop
    typecheck is clean. Prepare-only behavior is unchanged; no commit.

- **Resume Studio approval simplification (2026-09-01):** the current product
  flow no longer makes users understand an Export -> Save -> Confirm sequence.
  `Approve resume` saves current edits, creates and verifies the private
  application PDF in the background, and approves that exact artifact without
  opening a native Save dialog. `Download PDF` remains optional; approval then
  exposes `Prepare application` as the primary continuation. At desktop width,
  the preview and tools are bounded to the visible studio and scroll
  independently, so scrolling a long editor no longer leaves a page-height
  blank preview column. Focused contract/renderer coverage and current-build
  screenshots are under
  `apps/desktop/test-artifacts/ui/resume-review-hierarchy-after-20260901`.
  Review-only suggestions no longer produce a full-width `Validation issues`
  task; only actual blockers interrupt approval. Supporting job/evidence
  context is now a plain optional `About this tailored resume` disclosure at
  the bottom of the tools pane rather than a proof panel above the work. The
  tools pane now leads with actual editable resume fields; keyword/evidence
  comparisons come after the editor instead of before it, and preview warnings
  are labelled as optional suggestions;
  no employer write or final submission is part of this behavior.

- **Integrated product-finish pass (2026-09-01):** the current built desktop app
  completes the supported local synthetic journey from Shortlisted through
  live resume editing, grounded Guided Edits proposal review, one-page PDF
  export and exact-file approval, Prepare application, and Applications. Final
  evidence is under
  `apps/desktop/test-artifacts/ui/product-loop-final-after-chat-apps-r3-20260901`.
  The durable snapshot has one ApplicationRecord, a `paused` attempt, a `null`
  outcome, zero submitted jobs, and `finalSubmitOccurred: false`. Resume Guided
  Edits and Profile Copilot now share the compact-chat direction: fixed
  360x460 desktop panels, one-line composers that grow to 80px, icon send
  actions, scrollable transcripts, minimize-only controls, and no page reflow.
  Profile Copilot proof at
  `apps/desktop/test-artifacts/ui/product-loop-final-profile-copilot-20260901/01-open.png`
  keeps Profile tabs full-width, has zero document overflow, and places the
  proposal status in the card's top-right. Applications now presents Retry and
  optional preparation as natural-width start-aligned actions without a
  decorative double-border group. Focused checks pass 64/64 for Profile
  Copilot and 26/26 for the final Resume Guided Edits/Applications batch;
  desktop typecheck, formatting, diff checks, and the final desktop build pass.
  No broad release gate, network provider, credential, account, employer write,
  or final submission was used.

- **Current settled visual/safety evidence (2026-08-31):** native resume
  import recovery is now verified in the rebuilt app: Guided Setup can leave a
  still-open picker for manual entry, a later selection from that retired
  picker is discarded without changing the profile, a second picker opens,
  and a normal TXT import settles to Ready with populated Essentials. The
  focused import/preload/controller/main checks pass 133/133. Applications
  recovery actions are fixed, and current-build
  1440/1280 screenshots show natural-width, start-aligned valid actions;
  focused uncertainty coverage proves that a retry with a `null` receipt
  fails closed. Resume Studio at 1280 in the current build keeps preview and
  tools visible with 20 notes and 4 blockers, and Open editor lands on the
  exact focus target with an announcement. Profile Copilot now opens as a
  compact modeless chat instead of shrinking Profile: rebuilt-app 1175/1280
  captures preserve identical Profile geometry, keep every tab visible and
  clickable, place the panel about 16px below the tabs, and prove long input, compact proposals,
  `Apply & save`, Reject, Undo, `No changes made yet`, and a pending `Review
change` launcher. The default panel is now 360x460 on desktop instead of the
  prior 480x672 second-pane footprint, with no horizontal overflow.
  Minimize/reopen preserves the thread and restores the
  launcher. The compact overlay can still cover the lower-right portion of a
  form while open; minimize restores it. Native 125%, provider failure, and
  retry remain unestablished. These are
  focused/current-build checks, not a sealed acceptance claim: the old
  seal/persona wave is invalid after the source changes. Goal remains
  **ACTIVE** under the lightweight product-iteration loop above.

### Historical snapshots — not an execution queue

- **Current-build visual and prepare-only journey closure (wave9bb,
  2026-08-31):** the final pre-freeze product pass is complete. Guided setup
  now uses the shared page width while retaining one natural page scroller at
  native 125%; populated Discovery gives every non-empty status banner a 16px
  lower boundary and makes the Results offline notice the single warning
  owner; successful save confirmations dismiss on route changes instead of
  covering the next route's actions, while saving and failed states remain
  visible. Focused evidence is 27/27 for Guided/Discovery plus 13/13 for save
  status, with formatting/diff checks clean. A current-source desktop build
  passed, the targeted 1440/native-125 capture passed with zero horizontal
  overflow and exact 16px notice-to-row spacing, and the local synthetic
  `resume-workspace-current-20260831-toast-fixed` journey completed
  Shortlisted -> live resume editing -> one-page PDF export -> exact-file
  approval -> Prepare application -> Applications. Its durable snapshot has
  an approved draft and ApplicationRecord, the latest attempt is `paused`, the
  outcome is `null`, and submitted jobs are zero; the exported PDF was rendered
  and manually inspected with no clipping or overlap. The responsive journey
  harness was updated to current sidebar/compact navigation, template,
  accessible reorder, approval, and safety-gate semantics. No external ATS,
  credential, account, or submit action ran. The earlier sealed acceptance is
  historical after these source/docs changes. Goal remains **ACTIVE**: hard
  freeze this settled tree, run the exact broad/evidence/immutable acceptance
  chain once, custody the new seal, then complete strict ATS and a fresh
  sequential P01-P14 wave.

- **Scale-02 nested-scroll-owner acceptance repair (wave9ba, 2026-08-30):**
  the frozen chain fully passed: `pnpm verify` covered 564 files (6,299 passed
  / 1 skipped; performance 2/2), and `pnpm test:evidence` passed for release
  `release-20260830T014219-abc8c6`, with manifest file SHA
  `2bb90e86990673d7f1ff861519ffaad82b775e9061270b03bb0a720baeab4520` (the
  evidence run ID is authoritative). Machine-passing
  `production-acceptance-QoIqu1` produced 46/46 with expected seal
  `67bb03c67ad1b9c897dd441cc20d55c378dfdc6324ed1b229712b563c0273b68`, but
  root manual review rejected it and no custody followed: populated scale 02
  at 1440 still hid Find Jobs H1 beneath the fixed shell. Long-label and
  `ACTIVE`/menu/min/native screens passed. The shell reset the outer main while
  locked routes scroll in the nested `LockedScreenLayout` owner, where scroll
  anchoring and a dynamic header could shift the route. The product fix resets
  that nested owner before paint, sets `overflow-anchor: none`, uses an explicit
  data selector, and targets it during discovery settlement; the already-
  Results first-job edge now uses a layout-phase latch/settle. Focused evidence
  includes locked-layout 32, discovery-layout 4, and first-reveal 4 initially,
  then 2 files/9 after the lifecycle fix; independent review is clean. No new
  heavy run, seal, custody, ATS run, or persona preparation exists. Goal remains
  **ACTIVE**. Restart the frozen chain and manually inspect exact scale 02,
  including the user-reported header.

- **Native-125 distinct-state scale-evidence repair (wave9az, 2026-08-30):**
  under the freeze, `pnpm verify` passed across 564 files (6,299 passed / 1
  skipped; performance 2/2), and `pnpm test:evidence` passed for release
  `release-20260830T012210-325fde`, manifest
  `6359a10194a9287990b6853acaa6af76e052ac28fd6c6f667bf299b3d17ac603`. The
  `production-acceptance-N5YSPB` run passed fresh 17/17, including long-label
  012/013/014, then stopped at scale because the 16 Find Jobs page-1 native125
  capture and the 22 final native125 overview capture were byte-identical.
  Manual inspection confirms the same valid state: the second capture only
  returns to the same route/page-1/viewport. The harness now assigns the same
  explicit `screenshotStateId` to both while preserving distinct
  scenario/completion IDs and strict distinct-state collision failures. Static
  validation, Node check, Prettier, and diff checks pass. No seal, custody, ATS
  run, or persona preparation exists. Goal remains **ACTIVE**. Restart the
  frozen chain and manually inspect the replacement header/`ACTIVE`,
  long-label, and More-menu visuals.

- **Native-125 More-menu scale-selector repair (wave9ay, 2026-08-30):** the
  frozen chain fully passed: `pnpm verify` covered 564 files (6,299 passed / 1
  skipped; performance 2/2), and `pnpm test:evidence` passed for release
  `release-20260830T005828-5f9aa6`, manifest
  `3408cda1bb0edccde81e35caa66031576b785d4ce10cfb43d55efc514f57c965`, with no
  drift. Machine-passing `production-acceptance-YOxiiA` produced 46 captures
  and expected seal
  `5bae2b565c6c4b4b6a36dcac90c360e5cf98789ca99aa69d24b1650acdee8319`, but
  manual inspection rejected it and it was never custodied: fresh `012`
  clipped the Find Jobs heading because capture reset then forced an already-
  visible tall first-card block:center, scrolling the outer route after app
  settle. Header/`ACTIVE`/minimum-width/native125/More-menu and representative
  flows passed. The harness now targets the inner scroll region with an
  explicit fail-closed selector for scroll/containment while preserving outer
  ownership/focus; the product screenshot showed the intended scrollbar/“Scroll
  for more”, `orphanHeaderCount=0`, and a 4px header-row gap. Static acceptance
  validation, Node check, Prettier, and diff checks pass; no product renderer
  change. No seal, custody, ATS run, or persona preparation exists. Goal remains
  **ACTIVE**. Restart the frozen chain and manually inspect the replacement,
  including the user-reported header and `ACTIVE` visuals.

- **Native-125 scale-acceptance selector repair (wave9ax, 2026-08-30):** the
  frozen `pnpm verify` gate passed (564 files; 6,299 passed / 1 skipped;
  performance 2/2), and `pnpm test:evidence` passed with release
  `release-20260830T003924-c13bbb`, manifest
  `70923c38929b2815c157153c47f004e32ef529f3a740600e81206e2c9c53996c`, and no
  drift. Production acceptance `production-acceptance-N3yHL4` failed at scale
  native125 because the harness measured the outer `overflow-hidden` More menu
  instead of the new inner scroll region. The product screenshot showed the
  intended scrollbar/“Scroll for more”, `orphanHeaderCount=0`, and a 4px
  header-row gap. The harness now uses an explicit fail-closed inner selector
  for scroll/containment while preserving outer ownership/focus; static
  acceptance validation and Prettier pass. No seal, external custody, ATS run,
  or persona preparation exists. Goal remains **ACTIVE**. Restart the frozen
  chain from `pnpm verify`, then manually inspect the user-reported
  header/`ACTIVE`, long-label, and minimum-width More visuals before continuing.

- **Final acceptance/UI/persona hardening (wave9aw, 2026-08-30):** machine-passing
  `production-acceptance-1JtwkP` (46 captures; seal
  `99795679932117406210d233313512c598fb9111b88a26bcf326e62dc6012162`) was
  manually rejected and never externally custodied: at 1440 the Find Jobs
  header collapsed/overlapped, and the long-label first result was partially
  clipped under the fixed shell. Batched UI fixes now put the readiness warning
  full-width below title/actions, settle first-result reveal to the whole-header
  boundary, improve minimum-width More-menu internal scrolling/affordance,
  strengthen and pair `ACTIVE` with Listing activity, and eliminate the
  duplicate zero-result readiness warning/CTA with correct `aria-describedby`
  ownership. Persona/custody hardening adds intelligence to restart semantic
  parity, recognizes `P##-uuid` workspace ownership, enforces strict CDP
  identity/redirect checks, and uses deterministic code-unit sorting. Focused
  evidence is UI 106 tests plus a 30-test follow-up (18+12), persona custody
  71/71, and desktop typecheck/lint/format/diff where reported; no new
  build/Electron/verify/evidence ran after these fixes. Goal remains **ACTIVE**.
  Next: one final frozen `pnpm verify` -> `pnpm test:evidence` ->
  build/immutable Electron acceptance, manual inspection of the exact
  header/ACTIVE/long-label/min-width menu screens, then custody, ATS, and
  P01-P14.

- **Returning-persona original-CV custody repair (wave9av, 2026-08-30):**
  `production-acceptance-sPexxQ` passed verify, source-bound evidence, 46-screen
  Electron acceptance, manual minimum-width inspection, external custody, and
  strict bound Greenhouse/Workday no-submit checks; Ashby had no current
  matching vacancy and stopped before app launch. The fresh all-persona
  preparation then sealed P01-P12 and failed closed at P13 during production
  restart because the returning-persona seed pointed `baseResume.storagePath`
  at its input asset with a placeholder digest. Startup correctly treated that
  as unavailable, cleared path/SHA, and added the missing-original-CV warning.
  P13/P14 now materialize exact resume bytes in the canonical app-owned
  `documents/resumes` directory and seed the absolute path plus verified SHA;
  the persona preparation suite passes 62/62. A real file-repository
  reset/close/workspace-start/reopen integration test proves path, digest,
  bytes, and warning absence, with a negative legacy relative-path case that
  still fails closed; focused startup recovery passes 8/8, desktop lint and
  typecheck pass. The partial P01-P12 custody remains historical with
  `waveComplete=false`; no tester launched. `sPexxQ` is stale after this source
  and test repair. Restart the frozen chain into fresh roots, then require
  14/14 plus read-only `--verify-all` before any blind session. Goal remains
  **ACTIVE**.

- **Minimum-width discovery-header manual-acceptance repair (wave9au,
  2026-08-30):** exact build `production-acceptance-KX6VeE` passed the complete
  machine gate with 46 screenshots and a valid seal, but required manual PNG
  inspection rejected it: at minimum width the action-heavy Find jobs header
  compressed its title and description into an unreadable narrow column beside
  the source-readiness warning. Discovery now uses the shared PageHeader
  `stacked-until-xl` layout so the title keeps a full row through compact
  desktop widths and the warning plus source/search actions wrap below it;
  wide-screen hierarchy is unchanged. The focused discovery layout test,
  desktop typecheck, formatting, and diff checks pass. `KX6VeE` is historical
  and was not externally custodied; restart verify/evidence/build/Electron
  acceptance, manually inspect the replacement minimum-width PNG, then proceed
  to strict ATS binding and P01-P14 preparation. Personas remain 0/14 and the
  Goal stays **ACTIVE**.

- **Returning-persona custody and scale-evidence repair (wave9at, 2026-08-28):**
  exact build `production-acceptance-fv2Riy` passed the broad gates and Electron
  acceptance, then the first real all-persona preparation preserved P01-P12 but
  failed closed at P13. P13/P14 intentionally return with materialized profile
  data, so production derives `profileSetupState` plus pending contact/work
  history review items during reset; the custody harness now compares stable
  derived setup intent while retaining the complete generated state for
  reset-to-restart durability and the sealed semantic digest. P14 now also
  binds its paused source-debug run to the discovery target and nested discovery
  state, producing the intended required browser sign-in prompt. A subsequent
  acceptance diagnostic reached the full 5,000/1,001 scale state and failed
  only because the Profile baseline and wide-sidebar assertion shared identical
  pixels under different screenshot-state labels; shared visual-state identity
  is now explicit while genuine cross-state collisions remain rejected. Focused
  persona/custody tests pass 77/77, production-acceptance static validation,
  desktop typecheck, formatting, and diff checks pass. No current seal or
  complete persona wave exists; restart the source-bound chain once. Personas
  remain 0/14 and the Goal stays **ACTIVE**.

- **Persona seed runtime-default materialization (wave9as, 2026-08-28):**
  after wave9ar, real P01 completed its single reset but failed semantic equality
  because startup materialized disabled starter sources plus explicit resume and
  CRM defaults that the seed intent left implicit. The seeder now records those
  same defaults before reset for every persona, preserving exact equality for
  persisted base facts; derived setup intent is handled by wave9at. Persona custody tests pass 60/60 and
  desktop typecheck/diff checks pass. A fresh source-bound seal and real P01
  retry remain required before `--persona all`; personas remain 0/14. Goal
  stays **ACTIVE**.

- **Persona seed startup-read serialization (wave9ar, 2026-08-28):** the
  post-wave9aq sealed chain passed completely, then real P01 preparation
  advanced past custody verification and failed safely because its one test-only
  reset raced the app's startup workspace read. The production activity gate
  rejected the reset and removed no data. The seeder now awaits one workspace
  read and performs the single reset in the same renderer operation; it does
  not retry a destructive reset. Persona custody tests pass 60/60 and desktop
  typecheck/diff checks pass. The prior seal is historical after this seeder
  fix. Restart the frozen chain, then prepare and verify P01-P14. Personas
  remain 0/14. Goal stays **ACTIVE**.

- **Persona custody source-exclusion parity (wave9aq, 2026-08-28):** after
  `production-acceptance-IGFQeY` passed verify, evidence, 46-screen Electron
  acceptance, external custody, and strict bound Greenhouse/Workday, `--persona
all` failed closed before seeding because the persona verifier counted 30
  generated evidence-manifest mirrors that the acceptance producer deliberately
  excludes. The verifier exclusions now match the producer for nested
  `test-artifacts`, `*.tsbuildinfo`, and
  `docs/audits/evidence-manifests`; the producer/verifier parity fixture covers
  all three. Persona custody tests pass 59/59 and desktop typecheck/diff checks
  pass. The prior seal is historical after this verifier fix. Restart the
  frozen chain once, then prepare and verify P01-P14. Personas remain 0/14.
  Goal stays **ACTIVE**.

- **Strict ATS typed-action and live-handoff repair (wave9ap, 2026-08-28):**
  the first post-wave9ao bound Greenhouse run proved discovery, then stopped
  before browser preparation because the smoke passed a legacy positional
  `startApplyCopilotRun(jobId, options)` call through the object-only preload
  contract. The shared smoke now passes the typed action object; the same stale
  call in the Interview Helper capture harness and wrapped discovery-result
  reads in the Job Finder benchmark are repaired. Workday now accepts either
  its expected anonymous-login handoff or the same fully classified
  intermediate-write guard already accepted by the strict complete-flow gate;
  it does not relax submission, account, isolation, or custody assertions.
  Focused harness tests pass 74/74, desktop typecheck/format/diff checks pass,
  and unbound diagnostics pass safely for Greenhouse and Workday with zero
  submit. Ashby's configured public board currently has no matching Software
  Engineer vacancy and exits before app launch. The otherwise passing
  `production-acceptance-egteAz` run (46 screenshots; seal
  `96afc8159eecc171e63ebbad505e03095c3f00f18ec0c408127657841c954291`)
  is historical after these source/doc repairs. Restart the frozen chain once,
  bind Greenhouse/Workday to the new seal, record Ashby as current external
  inventory drift, then prepare P01-P14. Personas remain 0/14. Goal stays
  **ACTIVE**.

- **Strict bound-ATS discovery-result contract repair (wave9ao, 2026-08-28):**
  after wave9an cleared the module TDZ, the sealed Greenhouse and Workday runs
  launched safely but both reported an impossible empty workspace immediately
  after successful discovery. The smoke still treated the typed
  `JobFinderAgentDiscoveryResult` envelope as a workspace even though the IPC
  contract now returns `{ outcome, snapshot }`; it therefore read every
  workspace field from the wrong object. The smoke now unwraps the authoritative
  `snapshot` before selecting jobs or recording discovery evidence, and the
  wrapper-policy suite pins run -> unwrap -> summarize ordering. Focused wrapper
  tests pass 63/63, prepare-only report binding validation passes, and desktop
  lint/typecheck are green. Both failed runs kept intermediate writes, account
  creation, and final submit false, and recorded zero submitted state. Ashby's
  independent public-board preflight currently reports no matching vacancy,
  which remains live external drift rather than a submission attempt. The
  passing `production-acceptance-BtOINe` seal is historical after this source
  fix. Restart the source-bound chain once more, then rerun Greenhouse/Workday
  and classify Ashby against current public inventory before preparing
  P01-P14. Personas remain 0/14. Goal stays **ACTIVE**.

- **Strict bound-ATS module initialization repair (wave9an, 2026-08-28):**
  the first post-seal Greenhouse wrapper correctly passed its local custody
  preflight, then the prepare-only smoke failed before Electron launch with
  `Cannot access 'ACCEPTANCE_INTENT_ENV_VARS' before initialization`. Ambient
  acceptance intent was captured above the lexical constants and error class
  used by `resolveAcceptanceInput`; the caught temporal-dead-zone error was
  later surfaced as an unexpected blocker. The capture now runs only after all
  resolver dependencies initialize, and the wrapper-policy suite pins that
  declaration order. Focused wrapper tests pass 62/62, prepare-only report
  binding validation passes, and desktop lint/typecheck are green. Independent
  Luna safety review found no Electron/browser launch, ATS mutation, upload,
  account creation, or submit; only the wrapper's preceding public board GET
  may have occurred. The otherwise passing source-bound run
  `production-acceptance-GVdi89` and its external custody are now historical
  because this source fix changes the fingerprint. Restart verify, evidence,
  immutable acceptance, external custody, and strict built ATS once. P01-P14
  remain 0/14. Goal stays **ACTIVE**.

- **Complete diagnostic acceptance and final freeze entry (wave9am,
  2026-08-28):** the packaged-app acceptance harness now passes end to end on
  the current dirty source tree: fresh funnel, 5,000-job/1,001-record scale,
  error recovery, accepted-app runtime route readiness, responsive shell
  geometry, and process-output gates. The final runtime probe now waits for the
  rendered Job Finder shell before hash navigation and emits the current hash,
  headings, shell state, and body text on any lazy-route timeout. Diagnostic
  run `apps/desktop/test-artifacts/ui/production-acceptance-ceP9Xz/` produced 46
  screenshots and expected seal SHA-256
  `efb084640affe10f83a41e3686f6064cc7748b72f03e227e43a0203efa803e6b`.
  This run is deliberately **not** the source-bound release seal because the
  harness changed after the preceding verify/evidence run. Freeze this source
  now and run `pnpm verify` -> `pnpm test:evidence` -> immutable production
  acceptance once, with no intervening source/doc changes. P01-P14 remain 0/14
  and start only after that exact-build seal and custody check. Goal stays
  **ACTIVE**.

- **Accepted-app shell probe responsive ownership (wave9al, 2026-08-28):**
  fresh, scale, and error-recovery acceptance completed, then the final
  production-like runtime probe failed at 1024x576 because it selected the
  hidden compact Interview Helper anchor instead of the visible desktop module
  button at the 900px ownership breakpoint. Its focusable scan also counted the
  Close control inside a closed Task center `<details>`. The runtime sampler now
  chooses the first rendered semantic Interview Helper control across anchor
  and button variants, accepts the exact hash target for the anchor or the
  tested desktop button variant, and excludes only closed-details descendants
  outside their visible summary. The fail-closed 18-case geometry fixture suite,
  static validator, shell navigation, and Task center tests pass 69/69. The
  diagnostic run remains inspectable at
  `apps/desktop/test-artifacts/ui/production-acceptance-xnfhZF/` and is not a
  seal. Continue diagnostic acceptance through the final runtime probe, then
  restart the source-bound chain once; no P01-P14 tester session has started.
  Goal stays **ACTIVE**.

- **Shortlisted ready-resume reason acceptance (wave9ak, 2026-08-28):** the
  diagnostic batch-action probe next proved the correct disabled row controls
  and `aria-describedby` wiring, then failed only because its pinned reason
  ended in retired `original CV` wording. The product and renderer tests say
  `unchanged original resume`; the scale constant and static validator now
  match. Static acceptance validation and the focused review-queue list suite
  remain 31/31. The diagnostic run remains inspectable at
  `apps/desktop/test-artifacts/ui/production-acceptance-bprjp3/` and is not a
  seal. Continue diagnostic acceptance until the complete harness is green,
  then restart the source-bound chain once; no P01-P14 tester session has
  started. Goal stays **ACTIVE**.

- **Shortlisted batch-action acceptance verb (wave9aj, 2026-08-28):** the
  next diagnostic run confirmed the corrected eligibility strip, then exposed
  the matching retired action verb: the product button is `Prepare up to 10
drafts (review required)`, while the harness still searched for `Generate`.
  The scale selector, evidence field names, diagnostics, and static pins now
  use the current preparation contract. Static acceptance validation and the
  focused review-queue list suite remain 31/31. The diagnostic run remains
  inspectable at
  `apps/desktop/test-artifacts/ui/production-acceptance-39EFYB/` and is not a
  seal. Continue diagnostic acceptance until the complete harness is green,
  then restart the source-bound chain once; no P01-P14 tester session has
  started. Goal stays **ACTIVE**.

- **Shortlisted batch-readiness acceptance copy (wave9ai, 2026-08-28):** the
  diagnostic acceptance advanced through all scale pagination and lifecycle
  evidence into the 1,001-record Shortlisted batch-action disclosure, then
  failed because the probe expected retired `ready to queue` copy while the
  current product and renderer tests use `ready to prepare`. The scale
  expectation, boundary accounting, and static pins now follow the current
  preparation contract. Static acceptance validation and the focused
  review-queue list suite pass 31/31. The diagnostic run remains inspectable at
  `apps/desktop/test-artifacts/ui/production-acceptance-wJ8JYx/` and is not a
  seal. Continue diagnostic acceptance until the complete harness is green,
  then restart the source-bound chain once; no P01-P14 tester session has
  started. Goal stays **ACTIVE**.

- **Applications Stages acceptance label (wave9ah, 2026-08-28):** the
  non-claiming diagnostic acceptance passed fresh capture, scale hydration,
  route cycles, and Find jobs/Shortlisted/Applications pagination before the
  lifecycle-view capture timed out on the retired `Tracker` button name. The
  current product and renderer tests expose `Preparation` and `Stages`; the
  scale harness and its static validator now follow that contract. Static
  acceptance validation and the focused Applications screen suite pass 21/21.
  The diagnostic run remains inspectable at
  `apps/desktop/test-artifacts/ui/production-acceptance-sjFyjN/` and is not a
  seal. Continue diagnostic acceptance until the complete harness is green,
  then restart the source-bound `pnpm verify` chain once; no P01-P14 tester
  session has started. Goal stays **ACTIVE**.

- **Applications scale row-identity repair (wave9ag, 2026-08-28):** immutable
  acceptance now passes the complete fresh capture suite and entered the
  5,000-job / 1,001-record scale route cycle. It failed closed on Applications
  because the scale harness still collected mounted row identities from
  id-less `<li>` parents, while the current tested full-row buttons own both
  `data-collection-item-id` and `aria-current`. The Applications scale selector
  now follows that exact row-action contract, and static acceptance validation
  plus the focused records-panel suite pass 10/10. The failed run remains
  inspectable at
  `apps/desktop/test-artifacts/ui/production-acceptance-G7j6N5/` and is not a
  seal. Because acceptance tooling changed, the hard-freeze chain restarts from
  `pnpm verify`; no P01-P14 tester session has started. Goal stays **ACTIVE**.

- **Foreground-overlay clickable evidence (wave9af, 2026-08-28):** immutable
  acceptance advanced through all long-label desktop/minimum/native-125 and
  source-label captures, then failed closed while the More navigation was open
  because the global clickable-point probe required a background Home control
  physically covered by that foreground menu to remain directly hittable. The
  shared screenshot harness now supports an explicit fail-closed foreground
  scope, records that scope in evidence, and the More-menu scenario uses its
  exact navigation landmark; every other capture retains the global probe.
  Static validation pins both the harness behavior and scenario declaration and
  passes. The failed run remains inspectable at
  `apps/desktop/test-artifacts/ui/production-acceptance-8CrX56/` and is not a
  seal. Because acceptance tooling changed, the hard-freeze chain restarts from
  `pnpm verify`; no P01-P14 tester session has started. Goal stays **ACTIVE**.

- **Long-label primary-action acceptance repair (wave9ae, 2026-08-28):** the
  next immutable production-acceptance attempt passed fresh Home, guided setup,
  25-source, 50-result, filtered-empty, and native-125 captures, then failed
  closed on the desktop long-label semantic probe. The screenshot and renderer
  tests showed the visible `Shortlist job` action in its current
  `discovery-detail-primary-action` region; the capture script still queried
  the retired secondary `discovery-detail-actions` region. The semantic probe
  now follows the tested primary-action ownership. Static production-acceptance
  validation and the focused Discovery detail-panel suite pass 20/20; the
  failed run remains inspectable at
  `apps/desktop/test-artifacts/ui/production-acceptance-XJ9baC/` and is not a
  seal. Because acceptance tooling changed, the hard-freeze chain restarts from
  `pnpm verify`; no P01-P14 tester session has started. Goal stays **ACTIVE**.

- **Persona custody fixed-port proof hardening (wave9ad, 2026-08-28):** the
  restarted broad freeze gate exposed one boundary-value failure in the blind
  persona launcher suite: when the random fixed CDP port was 65535, the test's
  mismatched-file fixture wrote invalid port 65536, and the launcher could not
  distinguish that malformed `DevToolsActivePort` file from a genuinely absent
  file before using its HTTP liveness fallback. The launcher now distinguishes
  missing, malformed/unreadable, and valid port files; only a genuinely missing
  file may use the bounded HTTP fallback. The mismatch fixture stays within the
  valid port range and a dedicated malformed-file case fails closed. The full
  focused custody suite passes 59/59, desktop typecheck and `git diff --check`
  pass. The interrupted broad run and all earlier acceptance runs are
  historical only; the hard-freeze chain restarts from `pnpm verify`, and no
  P01-P14 tester session has started. Goal stays **ACTIVE**.

- **Compact More acceptance-contract repair (wave9ac, 2026-08-28):** the first
  post-wave9ab immutable production-acceptance attempt failed closed at the
  1024x768 fresh Home capture before any persona preparation. The current app
  visibly exposed the compact **More** control, but seven acceptance/diagnostic
  scripts still queried the retired `Planning and settings` accessible label;
  the shared prepare-only safety probe also still allowlisted the retired menu
  label. All executable selectors, serialized sampler fixtures, static
  validator tokens, focus-containment checks, and diagnostic copy now follow
  the renderer's tested **More** button/navigation contract. The production
  acceptance static validator passes, the shell/navigation plus persona
  custody/evidence suites pass 164/164, formatting and `git diff --check` pass,
  and the failed run remains inspectable at
  `apps/desktop/test-artifacts/ui/production-acceptance-nRsjQ9/`. That run is
  historical failed evidence, not a seal. Because acceptance tooling changed,
  the hard-freeze chain restarts from `pnpm verify`; no P01-P14 workspace or
  tester session has started. Goal stays **ACTIVE**.

- **Exact bounded ATS autosave authority (wave9ab, 2026-08-28):** production
  prepare orchestration no longer hardcodes every intermediate write false, but
  it remains default-off and fail-closed. Settings can now request bounded
  autosave only after the reusable-answer snapshot is current and the user
  supplies exactly one job, one canonical origin, one verified resume SHA-256,
  and a future expiry; campaign scope, multiple jobs/origins/resumes, missing or
  stale answers, expiry, revision change, revocation, and origin/resume drift
  reject the capability. Main owns the fixed pause/stop policy and canonical
  digest. All three prepare call sites use one repository-backed resolver, pass
  the exact origin list, and re-read the same envelope revision immediately
  before every field-save window. The public test override is now loopback-only.
  Browser Runtime records a verified external write only after an authorized
  request receives a 2xx/3xx response; local DOM fills and blocked autosaves no
  longer masquerade as site persistence. Final submit, account creation,
  credentials, CAPTCHA/MFA, beacon, popup, and ambiguous/final requests remain
  blocked. Focused contracts/service/UI/resolver tests pass 155/155; Job Finder
  core passes 136/136; Browser Runtime policy/flow/Chromium checks pass 78/78
  after the new successful-autosave receipt case. No public employer write was
  run in this wave. A fresh isolated Electron smoke and then exact-build persona
  freeze remain next; Goal stays **ACTIVE**.

- **Bounded intermediate ATS mutation firewall (wave9aa, 2026-08-28):** the
  latent `intermediateMutationsAuthorized=true` path no longer opens every
  browser transport. Browser Runtime now wraps each exact grounded field action
  in a same-origin 3-second/8-request window and permits only classified
  fetch/XHR `POST`/`PUT`/`PATCH` traffic with explicit
  draft/autosave/save/update/field/answer/upload/progress semantics. Final-action
  signals, ambiguous operations, cross-origin destinations, GET/DELETE, beacon,
  WebSocket/EventSource/WebTransport, popup/navigation, late, and exhausted
  traffic remain blocked and journaled; DOM submit and `requestSubmit` remain
  unconditionally disabled. Focused pure, fake-runtime, and real-Chromium checks
  pass 77/77, including one allowed synthetic `UpdateApplicationFormAnswer`
  autosave and one denied `SubmitApplication` request in the same authorized
  setup. Wave9ab supersedes the remaining production-wiring gap; wave9aa itself
  performed no Ashby/employer write and does not convert wave9z's public
  `SAFE_STOP` into PASS. Goal remains **ACTIVE**.

- **Public ATS preparation truth + specialist P1 fixes (wave9z, 2026-08-28):**
  the prior wave9y harness verdict was too broad: clicking Prepare and finding
  any ApplicationRecord was reported as PASS even when the durable attempt had
  safely paused. A fresh exact-build Umbrel/Ashby replay now proves the precise
  boundary. Managed Chrome opens the exact public application URL with the
  approved tailored export, but Ashby's application attempts an external field
  save; `prepare_only` has no authority for that write, so Job Finder stops with
  `required_human_input`, records `awaiting_review`, shows a manual handoff, and
  keeps both final-submit facts false. Evidence:
  `apps/desktop/test-artifacts/persona-wave-20260828/public-fallback-current-v8/`.
  The harness now binds the latest result to the exact ApplicationRecord/job and
  no-submit receipt and reports `READY_FOR_REVIEW`, `SAFE_STOP`, or
  `MISSING_OR_AMBIGUOUS`; this replay is honestly **PARTIAL / SAFE_STOP**, not
  PASS. It also polls durable terminal state, removing the four-minute static
  text wait and duplicate progress captures. Product copy no longer claims that
  Job Finder prepared the application before the result is known. The same
  specialist wave moved Discovery's primary Shortlist action above its private
  detail scroller, and a current 1440x920 public replay visibly proves it is
  available without scrolling. Browser Runtime now suppresses Chrome component
  background extensions while preserving the fail-closed active-service-worker
  guard; focused checks pass 30/30, Discovery detail checks pass 20/20, route
  action checks pass 50/50, and Desktop/Browser Runtime typechecks plus current
  production builds pass. **Do not freeze P01-P14 yet:** the next acceptance
  decision is whether a public autosave/manual-handoff outcome satisfies the
  prepare-only release contract or whether an explicitly scoped intermediate
  write capability is required. Goal remains **ACTIVE**.

- **Current public full funnel + configured-provider truth correction (wave9y,
  2026-08-28):** a fresh isolated production-Electron replay now proves the
  anonymous public Umbrel Ashby journey from synthetic resume import through
  explicit source opt-in, 11-job discovery, one durable shortlist, tailored PDF
  generation, exact export approval, Prepare, and Applications. The historical
  harness labeled every leg PASS, but wave9z supersedes that Prepare verdict:
  the approved export is durable and the ApplyJobResult remains
  `awaiting_review`, and `finalSubmitOccurred`, `submittedAt`, and submission
  outcome remain null. The one-page Letter PDF was rendered separately and has
  no clipping, overlap, broken glyphs, or unreadable hierarchy. Evidence:
  `apps/desktop/test-artifacts/persona-wave-20260828/public-fallback-current-v5/`.
  This wave also removed two evidence false positives: generic "tailored
  resume" text no longer counts as readiness, and the harness now follows the
  current **Review and approve resume** CTA before Export/Approve. A configured
  Muse-xhigh replay reached the same public shortlist but timed out after 60 s
  during draft creation and safely produced a deterministic fallback PDF; it is
  diagnostic, not live-AI acceptance. Focused provider comparison confirms the
  route and model catalog are reachable: Muse low responded in 25.9 s with 0/6
  verifier-accepted rewrites, DeepSeek low in 41.9 s with 0/3, while Muse xhigh
  and DeepSeek max hit the 60 s deadline. Deterministic grounding/render gates
  stayed 1.0, and Resume Studio already discloses the built-in fallback. **The
  configured live-AI quality gate remains open; deterministic fallback success
  must not be reported as accepted model contribution.** Goal remains
  **ACTIVE**.

- **Current public Ashby discovery + durable Shortlisted repair (wave9x,
  2026-08-28):** a Luna-max audit selected Umbrel's public Ashby board, and the
  primary agent completed one bounded current-build production-Electron replay
  from synthetic resume setup through visible source opt-in, Search, Results,
  exact current-listing inspection, and Shortlisted. The public inventory and
  app both observed 11 jobs; Results showed 7 relevant rows and honestly hid 4
  clear mismatches. The selected **Senior Frontend Engineer** matched the public
  inventory, retained the truthful Umbrel / Remote employer and location, and
  scored 71 with grounded role/location/work-mode reasons. The replay found and
  fixed two real discovery-only funnel defects: campaign retention previously
  ignored staged jobs, hiding all completed-run Results, and staged-job
  promotion wrote the non-reviewable `shortlisted` status, producing a success
  message without a durable Shortlisted row. Campaign commits now evaluate
  saved plus staged candidates while preserving their storage boundary, and
  staged promotion enters `drafting` or `ready_for_review` consistently with
  the existing review queue. Focused tests pass 35/35, the full Job Finder
  package gate passes 141 files / 1,869 tests, typecheck passes, and the rebuilt
  Electron proof passes with one durable original-resume-ready Shortlisted job,
  zero renderer errors, no credentials/account creation/application action,
  both final authorities false, and no submitted state. Evidence:
  `apps/desktop/test-artifacts/persona-wave-20260828/live-public-current/run-20260828T041757595Z/`.
  **Boundary:** this closes one current anonymous public-source discovery and
  shortlist gap, not configured live-AI quality, authenticated ATS preparation,
  private-resume quality, personal accessibility/hardware review, or sealed
  release acceptance. Goal remains **ACTIVE**.

- **Second persona + native dialogs + keyboard/reduced-motion evidence (wave9w,
  2026-08-28):** a distinct Priya Shah / Backend Engineer persona started from
  empty isolated userdata and completed import, guided setup, explicit local
  source opt-in, source-generic compact-first discovery, shortlist, tailored PDF
  export/approval, Prepare, and Applications on the current production build.
  All legs and `noEmployerSubmit` pass; one exact ApplicationRecord persists,
  zero submit controls appeared, both final-submit flags remain false, and the
  rendered one-page PDF has no clipping, overlap, or broken glyphs. Evidence is
  under
  `apps/desktop/test-artifacts/persona-wave-20260828/priya-single-build-current/`.
  A separate production-mode probe with the test API absent visibly exercised
  the real macOS Open panel and exact synthetic resume selection, plus the real
  Save panel and an exported PDF at the chosen path. A separate Computer Use
  pass clicked the actual macOS Save **Cancel** control and proved the durable
  export count stayed 1 -> 1 on the same resume route. A corrected keyboard-only
  replay proves visible focus rings, Enter navigation into Shortlisted and the
  exact resume workspace URL, one H1/main landmark, named navigation landmarks,
  no unlabeled images, reduced-motion media matching, and automatic scrolling;
  its report and screenshots are under
  `apps/desktop/test-artifacts/persona-wave-20260828/native-dialog-accessibility-probe/`.
  The initial same-event focus-style sample was a probe error and was corrected
  with a 30 ms settle before evidence capture; no unnecessary product change was
  retained. A follow-up genuine macOS Open **Cancel** click also preserved the
  exact imported filename, SHA-256, and ready extraction state; see
  `native-open-cancel-report.json`. **Boundary:** native Open/Save selection and
  both cancel outcomes are proven, but personal screen-reader/hardware review,
  configured live-AI quality, authenticated ATS, private-resume quality, and
  sealed release acceptance remain open. Goal remains **ACTIVE**.

- **Refocused current-build Sam funnel + compact Applications reveal (wave9v,
  2026-08-28):** after pausing the secondary grant-issuance audit, a fresh
  isolated production build was exercised through the original Job Finder
  journey: resume import, guided Profile setup, explicit local source opt-in,
  source-generic discovery, shortlist, tailored PDF export and approval,
  Prepare, and Applications. Every leg passed, one durable Applications record
  was present, and zero employer-submit controls appeared. The generated
  one-page PDF was separately rendered and visually inspected with no clipping,
  overlap, broken glyphs, or missing content. A native 125% / 1280x720 follow-up
  found one real compact-view defect: selecting an Applications row left the
  stacked detail panel below the visible list. Compact selection now scrolls
  the exact detail region into view while desktop two-pane behavior is
  unchanged; focused Applications tests pass 21/21, Desktop typecheck and the
  production build pass, and the corrected 125% Electron replay visibly lands
  on **Details** and **Next step**. Current evidence is under
  `apps/desktop/test-artifacts/persona-wave-20260828/sam-single-build-current/`
  and `test-artifacts/persona-wave-20260828/sam-current-compact-125/`.
  **Boundary:** this is one synthetic Sam prepare-only journey; the separate
  wave9w evidence adds a second persona and bounded native/keyboard proof, but
  neither is live ATS, private-resume, personal-accessibility, or sealed release
  acceptance.
  Goal remains **ACTIVE**.

- **Main-owned approved-answer snapshots + content-free readiness (wave9u,
  2026-08-28):** reusable Profile answers can now be captured as an immutable,
  append-only approved snapshot without letting the renderer supply answer text,
  digest, lifecycle identity, or authority policy identity. Electron main rereads
  the current profile, canonicalizes non-empty reusable answers, computes SHA-256,
  and commits through revision-guarded repository APIs; unchanged content returns
  the existing snapshot, changed content appends a new revision, and unrelated
  Profile writes do not stale an approval when the answer digest is unchanged.
  SQLite migration v16, in-memory/file parity, reopen, and reset coverage are
  green. Settings now exposes a content-free **Future authority prerequisites**
  view with counts, kinds, missing/current/stale status, explicit Profile review,
  and a two-step approval confirmation. A fresh isolated production-Electron
  replay passes not-approved -> approved -> restart -> answer edit -> stale ->
  reapprove -> second restart at 1440x920 and 1029x860; ignored evidence is under
  `apps/desktop/test-artifacts/persona-wave-20260828/authority-readiness-wave/`.
  Focused cross-layer tests pass 49/49, the full DB suite passes 209/209, and
  Contracts/DB/Desktop typecheck and lint plus the production build pass. The
  broad `pnpm verify` gate also passes 562 test files / 6,257 tests (one skipped)
  plus both discovery-ledger performance checks on the same source tree.
  **Boundary:** this snapshot is an inspectable prerequisite, not a grant or an
  execution capability. Production remains `prepare_only`; no grant, arm,
  browser final action, submission IPC, or employer submission was added. The
  next safe internal dependency is exact one-time confirm-grant issuance bound
  to current preflight/policy/snapshot lineage. Goal remains **ACTIVE**.

- **User-verified uncertain-outcome recovery (wave9t, 2026-08-28):** an exact
  lineage-matched `outcome_uncertain` can now be resolved from Applications only
  after the user checks the employer site and completes a two-step confirmation.
  The renderer sends only the uncertain outcome id plus the selected terminal
  fact; Electron main owns time, evidence identity, current idempotency revision,
  and safe destination evidence. The repository preserves the original uncertain
  record, appends a fresh externally verified `submitted` or `not_submitted`
  outcome, and atomically updates idempotency, ApplyJobResult receipt/state, and
  the exact ApplicationRecord. Stale, duplicate, non-uncertain, missing, and
  cross-lineage requests mutate nothing. While uncertainty remains, Applications
  and Task Center require manual verification and expose no retry or final-submit
  control. Contracts, DB, and Desktop package validation pass (560, 206, and
  2,689 tests respectively), as does the production Electron build. A fresh
  isolated exact-build Electron replay passed uncertainty/restart, Task Center,
  both two-step resolutions, verified-outcome restart, and prepare-only Settings;
  ignored evidence is under
  `apps/desktop/test-artifacts/persona-wave-20260828/authority-outcome-wave/`.
  **Boundary:** this records a user-observed employer-site fact; it does not let
  Job Finder perform or infer a submission. Production execution remains
  prepare-only. Elevated policy/approved-answer issuance, confirmation grants,
  user-facing activation, real ATS evidence, accessibility review, and sealed
  acceptance remain open. Goal remains **ACTIVE**.

- **Main-only authority/runtime composition + local Chromium/SQLite proof
  (wave9s, 2026-08-28):** Browser Runtime now retains private Playwright `Page`
  ownership while exposing optional typed observation and exact-one final-action
  hands to main-process callers. Job Finder composes those hands with trusted
  resume hashing, immutable preflight, the durable authority gate, last-instant
  revocation/cancellation checks, compound authorize-and-arm, and strict
  `not_submitted` / `outcome_uncertain` recording. The capability is available
  only through the explicit
  `@unemployed/job-finder/application-submission-runtime-main` subpath; it is
  absent from the general barrel, preload, renderer, IPC, and legacy apply
  routes. A localhost-only Desktop integration uses real headless Chromium and
  a temporary file-backed SQLite repository: exactly one synthetic form POST is
  observed, the result remains `outcome_uncertain`, the ApplyJobResult receipt
  and exact ApplicationRecord project paused/manual-review truth atomically,
  and a second call with the same idempotency key is blocked without another
  POST. Package validation passes Browser Runtime 8 files / 145 tests, Job
  Finder 141 / 1,867, and Desktop 282 / 2,684, including the real-browser
  integration; docs checks, formatting, and `git diff --check` also pass.
  Canonical `pnpm verify` passes on the current tree with 558 correctness files,
  6,233 passing / 1 skipped, plus both strict performance tests; the
  source-bound `pnpm test:evidence` collector also passes with an unchanged
  fingerprint. **Boundary:** this
  is a safe internal synthetic vertical slice, not a user-reachable submission
  feature. Elevated envelope/policy issuance, confirmation grants, execution
  UI/IPC, independently verified `submitted` outcomes, real ATS acceptance, and
  serialized production Electron acceptance remain open. Production stays
  prepare-only and no real employer submission occurred. Goal remains **ACTIVE**.

- **Current-build Sam funnel + compact partial retention + exact Applications
  projection (wave9r, 2026-08-28):** one production Electron build now has a
  fresh isolated Sam Okafor replay from empty userdata through resume import,
  guided setup, explicit local source opt-in, deterministic discovery,
  shortlist, tailored draft, PDF export, exact-file approval, Prepare consent,
  and a durable Applications record. The final evidence is **PASS** for launch,
  import, usable profile, sources, search, shortlist, tailored resume, prepare,
  and no-employer-submit; it records one ApplicationRecord, zero submit controls,
  no blocker or visual issue, and Applications truthfully pauses the synthetic
  404 destination for user review. Dark and light 1440x920 captures are under
  `apps/desktop/test-artifacts/persona-wave-20260828/sam-single-build-current/`;
  failed and false-positive attempts are preserved in named subdirectories.
  The product fixes behind that proof are source-generic: Browser Runtime no
  longer rejects a run before compact observation when no tool-capable model is
  configured; ordinary discovery retains already-checkpointed compact jobs as
  an explicit incomplete result when later model expansion is unavailable;
  zero-result and source-debug failures remain fatal. The in-page scanner also
  keeps its JSON-LD walk bound inside the Playwright-serialized function and
  traverses schema.org `ItemList -> ListItem -> JobPosting`, fixing the real
  page-context `ReferenceError` that previously made structured inventory fall
  through silently. Real-browser and compact tests are green. Package validation
  passes Browser Agent 23 files / 252 tests, Browser Runtime 8 / 145, DB 26 /
  203, and Job Finder 140 / 1,861; the production Electron build, docs checks,
  formatting, and `git diff --check` pass. Canonical `pnpm verify` also passes
  on the final current tree: all workspace lint/typecheck tasks, 556 correctness
  files with 6,226 passing / 1 skipped, and both strict discovery-ledger
  performance tests. Separately,
  durable `not_submitted` / `outcome_uncertain` authority commits and startup
  recovery now atomically project into the exact lineage-matched
  ApplicationRecord as well as the ApplyJobResult receipt; missing or
  cross-lineage records fail without partial mutation, and deterministic outcome
  events dedupe. A new internal, unexported Job Finder preflight coordinator also
  derives the trusted resume SHA-256 from copied bytes, canonicalizes HTTP(S)
  origin, deep-freezes the schema-validated immutable record, and exposes only
  repository commit truth; it has no grant, arm, browser, IPC, UI, or production
  caller. **Boundary:** this is a current prepare-only full-funnel proof,
  not autonomous-submit acceptance. The local source intentionally ends at a
  manual-review blocker; native Save/Open dialogs, authenticated ATS behavior,
  accessibility hardware review, independent submitted verification, elevated
  activation/grants, sealed custody, and real submission remain open. Goal
  remains **ACTIVE**.

- **Unreadable-resume recovery + atomic outcome receipts (wave9q,
  2026-08-28):** full Profile now exposes an accessible plain-text recovery
  field when an imported resume has no readable text. Saving persists that
  text into the existing resume identity, clears the dirty/import guard after
  persistence normalizes resume metadata, hides the recovery field, and enables
  **Refresh from resume** without requiring a reload. The imported
  `not_started` badge now truthfully says **Ready to refresh**. A fresh
  production Electron build passed an isolated 1029x860 UI/save/restart replay:
  recovery visible, Refresh initially disabled, Save enabled after typing,
  exact text persisted, Refresh enabled after save and restart, recovery hidden
  after save/restart, and no horizontal page overflow. Ignored evidence is under
  `apps/desktop/test-artifacts/profile-resume-text-recovery-20260828/`.
  Separately, authority outcome commit and armed-startup recovery now reconcile
  `not_submitted` / `outcome_uncertain` into the exact lineage-matched
  `ApplyJobResult.privacyReceipt` in the same repository transaction. Uncertain
  outcomes also block the parent result with
  `submission_outcome_uncertain`, retain no-submit truth, permanently block
  retry, and show an immediate manual-verification alert in Applications.
  Missing or cross-lineage result receipts fail closed without partial
  authority mutation; duplicate recovery is idempotent. Focused checks pass:
  DB authority 20/20 plus package typecheck/lint/format; Desktop profile,
  own-save, and receipt UI 37/37 plus typecheck/lint/build. Canonical
  `pnpm verify` also passes on the current tree: all 14 workspace lint/typecheck
  tasks, 555 test files with 6,205 passing / 1 skipped, and both strict
  discovery-ledger performance tests. The source-bound non-Electron
  `pnpm test:evidence` collector also passes after this handoff update; its
  generated manifest is excluded from the source fingerprint. **Boundary:** this
  completes focused outcome-to-result/receipt reconciliation only. There is
  still no independently verified submitted outcome, production executor,
  elevated-mode activation, confirmation-grant UI/IPC, or real submission.
  The exploratory Sam harness under
  `apps/desktop/test-artifacts/persona-wave-20260828/` is selector-drift
  diagnostic evidence only, not acceptance. Goal remains **ACTIVE**.

- **Decision-policy-bound authority foundation (wave9p, 2026-08-28):** elevated
  authority now has one immutable typed decision-policy document with schema
  version, monotonic revision, canonical SHA-256 digest, exact approved-answer
  snapshot identity, and fixed fail-closed answer/technical/outcome stops.
  Preflights additionally bind the canonical page origin, nullable campaign,
  and exact policy identity. The pure Job Finder gate requires explicit current
  policy/answer facts plus a finite content-free stop-fact list, rejects every
  credential/login/MFA/CAPTCHA/anti-bot/account-creation/unknown-answer/legal/
  stale/ambiguous/origin/uncertain stop, and rejects confirm grants in autonomous
  mode. The compound repository transition transaction-current verifies the
  policy hash, approved answers, scope, origin, resume, capacity, preflight,
  idempotency, and exact grant before any child mutation; failure preserves the
  grant and available idempotency state. The former public low-level consume and
  arm primitives were removed, leaving the compound transition as the sole arm
  boundary. Synthetic orchestration rereads these facts before and after arm;
  post-arm drift recovers to permanent uncertainty. Renderer management cannot
  mint policy identity, and production elevated modes remain rejected. Package
  validation is green: Contracts 39 files / 558 tests, DB 26 / 190, Job Finder
  139 / 1,851, and Desktop 281 / 2,679 plus prepare-only report binding.
  The same current tree also passes canonical `pnpm verify` (555 test files,
  6,196 passed / 1 skipped, plus both discovery-ledger performance gates) and
  a fresh production Electron build. An isolated 1029x860 replay of that build
  confirms prepare-only is the sole available mode, both elevated modes remain
  visibly unavailable, and the renderer exposes only the prepare-only envelope
  action. Ignored evidence is under
  `apps/desktop/test-artifacts/ui/authority-wave9p-current-1029x860/`.
  **Boundary:** there is still no
  production executor caller, elevated-mode activation, grant UI/IPC, external
  outcome verifier, ApplicationRecord projection, or real submit. Wave9q adds
  focused atomic outcome-to-result/privacy-receipt reconciliation only.
  Goal remains **ACTIVE**.

- **Inspectable prepare-only authority UX + atomic rotation (wave9o,
  2026-08-27):** Settings now has a separate Application authority section
  backed by the strict preload bridge. It shows prepare-only as the sole
  available mode, keeps confirm-before-submit and autonomous-submit visibly
  unavailable, requires every origin and volume value to be entered visibly,
  inspects saved revisions, reloads stale state, and requires a second explicit
  confirmation before revocation. It never calls a grant, arm, browser, or
  submission API and does not reuse legacy Job Finder settings as authority.
  The repository now also supports transaction-current CAS replacement: the
  predecessor, its active grants, and available idempotency records are revoked
  while the distinct replacement is inserted atomically. A SQLite partial
  unique index and in-memory/reset guards enforce at most one active envelope
  per workspace. DB validation passes 26 files / 182 tests; Desktop validation
  passes 281 files / 2,679 tests plus prepare-only report binding, and the
  production Electron build passes. Fresh isolated Electron captures at
  1440×920 and 1029×860 prove the section, unavailable elevated modes, explicit
  policy fields, and zero body-width overflow. The compact replay also found
  and fixed the shared Settings anchor offset: section links now clear both the
  116px compact shell header and the measured sticky Settings subnav. Ignored
  evidence is under `apps/desktop/test-artifacts/ui/authority-wave9o-*`.
  Final max-review follow-up also fixes child-before-parent reset ordering with
  real lifecycle/reopen coverage, preserves ISO expiry across the local
  `datetime-local` editor, uses truthful management-only copy/static mode-card
  semantics, and keeps every active envelope revocable even when its elevated
  mode is unavailable for editing.
  **Boundary:** production remains prepare-only. Elevated-mode activation,
  exact confirmation-grant UI, production browser
  composition, receipt/application-record reconciliation, independent external
  outcome verification, and revised live acceptance remain open. Goal remains
  **ACTIVE**.

- **Authority startup recovery + management boundary (wave9n, 2026-08-27):**
  the Desktop production factory now runs durable armed-attempt recovery before
  exposing the Job Finder service; an armed attempt becomes permanent
  `outcome_uncertain`, remaining active grants are revoked, and repeated
  launches are idempotent. A separate strict management contract, main
  service, IPC route set, and preload bridge support inspect/get plus
  revision-guarded prepare-only create/update/revoke. Main owns lifecycle IDs,
  revisions, and timestamps; legacy settings fields are rejected; elevated
  modes and intermediate external mutations fail closed because answer-policy
  and stop-condition contracts are not complete. There is no grant, arm,
  browser-action, or submit IPC channel. Migration 15 also verifies every
  required authority-table column instead of accepting a partially malformed
  schema. The complete Contracts package passes 39 files / 550 tests, Desktop
  passes 280 files / 2,673 tests plus prepare-only report binding, and DB
  passes 26 files / 178 tests; all three package lint/typechecks are green.
  The production Electron build passes from this wave9n tree.
  **Boundary at wave9n:** no renderer Settings surface, elevated authority
  activation, receipt/application-record reconciliation, independently
  verified submitted outcome, production executor caller, or real submission
  existed; wave9o adds only the fail-closed prepare-only Settings surface and
  atomic authority rotation. Goal remains **ACTIVE**.

- **Authority exact-one synthetic execution foundation (wave9m, 2026-08-27):**
  the next local-only architecture slice is implemented without widening the
  production prepare-only path. Browser runtime now has source-generic form
  observation and exact-one final-action hands: deterministic identities,
  effective submitter destination including `formaction`, zero/ambiguity/stale/
  origin vetoes, a required final immediate authorization callback, serialized
  non-reuse, and truthful action-attempt versus action-issued facts. It can
  return only `not_submitted` or `outcome_uncertain`; browser-local clicks,
  URLs, and requests never prove submission. The repository now provides one
  transaction-current compound authorize-and-arm operation that validates the
  active exact envelope/preflight/idempotency lineage and atomically consumes a
  confirm grant with the armed marker; concurrency, rollback, and SQLite reopen
  parity are covered. An internal, non-barrel-exported synthetic Job Finder
  orchestrator uses only that compound transition, rejects fabricated
  submitted-like results, distinguishes recorded not-submitted from uncertainty,
  and returns typed recovery-needed state. Focused checks pass: browser hands
  11/11, repository authority 4/4, orchestrator 11/11, with package lint and
  typechecks. **Boundary:** there is still no production caller, Desktop UI,
  independently verified submitted outcome or receipt wiring,
  real-site credential path, or real submission. The post-wave9m broad gate
  passes source-generic policy, all package lint/typechecks, fit calibration,
  550 correctness files (6,135 passed / 1 skipped), and both performance
  files; the production Electron rebuild also passes. This result note is
  documentation-only drift after those gates. Sealed acceptance remains
  paused. Goal remains **ACTIVE**.

- **Autonomous authority persistence foundation (wave9l, 2026-08-27):** the
  first safe internal authority slice is implemented without enabling a real
  submit path. Typed contracts now include durable idempotency and armed
  records; workspace defaults expose six empty authority collections; database
  migration v15 persists envelopes, immutable preflights, one-time grants,
  idempotency, armed markers, and outcomes. In-memory and SQLite repositories
  schema-validate writes, CAS-guard envelope revisions, enforce unique
  preflights and one-shot grants, propagate revocation, atomically persist each
  authority-state transition, and recover armed-without-outcome attempts to
  permanent `outcome_uncertain` without retry. Focused validation passes:
  contracts 38 files / 543 tests; database 25 files / 175 tests; Job Finder
  typecheck after fixture propagation. **Boundary:** no production caller,
  generic final-control executor, last-instant orchestration, Settings/IPC UI,
  or externally verified receipt path is wired. Existing workspaces remain
  prepare-only and no automated or real employer submission was performed.
  After the implementation settled, `pnpm verify` passed source-generic and
  repository policy, lint/typecheck for all 14 packages, fit calibration, 548
  correctness files (6,111 passed / 1 skipped), and both performance files.
  The production Electron build then passed from the documented tree. This
  result note is documentation-only drift after those gates. Sealed acceptance
  remains paused. Goal remains **ACTIVE**.

- **Import→apply current-build Sam audit + targeted-search hardening (wave9k,
  2026-08-27):** Luna/high rebuilt the dirty production Electron app and ran
  synthetic, credential-free UI journeys. Fresh Sam launch/import/profile,
  three-source enable/save, and Search setup passed; a separate copied
  prepared workspace proved Shortlisted → approved resume → checkpoint choice
  **Continue without** → Applications, with the Applications route and record
  visible, no employer-submit control, and no document horizontal overflow at
  1029×860. The first audit exposed an untargeted-search defect: with zero
  roles/job families, three enabled sources returned a 16%-fit warehouse
  maintenance result for a frontend persona. Search now requires at least one
  explicit target role or job family, displays a relevance warning, routes
  **Add target roles** to the focused Profile preference, and re-enables only
  after a role is saved. A live follow-up proved disabled → focused editor →
  save `Frontend Engineer` → `1 search target` → enabled. Evidence is under
  ignored `apps/desktop/test-artifacts/persona-wave-20260827/` in
  `sam-live-audit-run2`, `sam-applications-audit-run3`,
  `sam-applications-audit-narrow`, and `targeted-search-readiness`.
  Additional current-tree fixes: safeguard copy now matches blocker scope;
  compact JSON-LD/DOM duplicates merge missing metadata; stale
  missing-resume clearance serializes and re-reads the current Application
  record; generated `test-artifacts` and `*.tsbuildinfo` no longer enter
  release source custody; compact-observer architecture comments match its
  integrated first-pass use. Focused typechecks/tests and source-generic/static
  acceptance checks pass. **Still open:** this is split synthetic evidence,
  not one clean no-facilitator full funnel on frozen source; the final broad
  gate/sealed chain must run only after the active autonomous-authority slice
  settles. Goal remains **ACTIVE**.

- **Import→apply ready-strip density + primary CTA weight (wave9j, 2026-08-27):**
  Product-only polish after wave9i PASS (no full-funnel re-run; Sam skipped).
  **Shortlisted Application readiness** when `isReadyToPrepare`: compact
  strip keeps Resume / Destination / Final submit with quieter labels and
  more gap; secondary boundaries move behind “More preparation boundaries”;
  one Prepare cue stays in strip copy + checklist + primary CTA. **Primary
  button weight:** shared `variant="primary"` uses full `border-primary` plus
  inset/edge token shadow (no purple glow); Safeguards site-blocked CTA
  relies on that shared weight. Validated: `pnpm validate:package desktop`
  (278 files / 2664 tests). Goal remains **ACTIVE**. **Still weak:** Sam
  Applications path; no full-funnel rediscovery this wave; residual live
  visual proof of compact ready strip on Shortlisted.

- **Import→apply Safeguards live proof + Shortlisted ready density (wave9i, 2026-08-27):**
  Desktop rebuilt; LIVE_AI=0 harness
  `run-alex-applications-safeguards-proof.mjs` on wave9g
  `userdata-enable-smoke` (site-blocked Give Lively / NEEDS YOU). Evidence
  `alex-applications-safeguards-wave9i-evidence.json`, screenshot
  `wave9i-02-applications.png`. List **Next:** shows
  `Open Safeguards to reset the browser, then finish on the site` (not
  “Inspect the application page manually”); detail Next step + Safeguards
  CTA match. Verdict **PASS**. **Shortlisted ready-state density:** when
  resume + apply path are ready (`isReadyToPrepare`), omit Current state
  card and collapse the full checklist into one Ready / Prepare-application
  cue (primary CTA remains Prepare application). Validated:
  `pnpm validate:package desktop` (278 files / 2662 tests). Sam skipped
  (optional; Enable→Search not re-run). Goal remains **ACTIVE**. Superseded
  for ready-strip density + shared primary CTA weight by wave9j above.

- **Import→apply finish-first / Safeguards + visual polish (wave9h, 2026-08-27):**
  Product-only follow-up after wave9g PASS (no full-funnel re-run; Sam
  LIVE_AI=0 skipped). **Applications site-blocked path:** list rows rewrite
  persisted “Inspect the application page manually” onto
  `Open Safeguards to reset the browser, then finish on the site`; latest
  activity → `Automatic prep paused`; Needs you badge uses critical tone;
  Safeguards primary CTA gains ring/weight + `data-testid`; queue recovery /
  run-outcome chrome stays hidden on finish-yourself pauses. **Residual
  visual:** Applications selected-row contrast (`bg-primary/10`); Shortlisted
  collapses empty resume-approach callout when no enabled approaches;
  Discovery empty/loading defaults `min-h-56`; EmptyState description uses
  `text-foreground`. Validated: `pnpm validate:package desktop` (278 files /
  2660 tests). Goal remains **ACTIVE**. Superseded for live Safeguards
  re-screenshot + Shortlisted ready density by wave9i above.

- **Import→apply shortlist→approve→Prepare continuation (wave9g, 2026-08-27):**
  Reused wave9f `userdata-enable-smoke` (50 jobs, no wipe). LIVE_AI=0 harness
  `run-alex-shortlist-prepare.mjs` → logs
  `alex-shortlist-prepare-wave9g.log` /
  `alex-shortlist-prepare-wave9g-retry2-console.log`, evidence
  `alex-shortlist-prepare-wave9g-evidence.json`. Path: Find jobs → shortlist
  **Data Engineer for Social Good / Give Lively** → resume workspace (already
  approved PDF reused) → **Prepare application** → visual-checkpoint consent
  **Continue without** (portal outside `<main>`; Escape/X cancels) →
  Applications. Sqlite: `apply_runs=1`
  (`apply_run_a7813200-…`, `paused_for_user_review`,
  `visualCheckpointsEnabled:false`), `apply_job_results=1`
  (`awaiting_review`), `application_records=1`. UI: “Job Finder prepared the
  application” / NEEDS YOU (site blocked automatic prep → Safeguards), **no**
  “couldn't finish opening”, no employer submit. Verdicts: shortlist /
  tailoredResume / approve / prepare / noCrash / noEmployerSubmit **PASS**,
  overall **PASS**. First attempt false-PASS’d on consent modal (ready regex
  matched “checkpoint”); harness + `run-alex-funnel.mjs` prepare path fixed.
  **Employer labels (this 50-job board):** storage **0/50** hard URL/TLD
  garbage (`… Com`/`… IO` / Https…); **9/50** neutral `Employer not stated`;
  **41/50** real names (Give Lively, Scale AI, Tennr, Stockx, …). Display also
  sanitizes via `sanitizeEmployerLabel` + absence scrub + URL slug fallback —
  for this board storage already clean of known garbage. Goal remains
  **ACTIVE**. Superseded for Safeguards finish-first list/CTA gaps by
  wave9h above.

- **Import→apply enable→Save→Search rediscovery proof (wave9f, 2026-08-27):**
  No rebuild (prior wave9e prove build still current). One LIVE_AI=0 run
  (no wipe-retry loop): extended `alex-enable-crash-smoke.mjs` through
  Enable → Save/Continue → Find jobs → Search. Log:
  `alex-enable-search-smoke-wave9f.log` under
  `apps/desktop/test-artifacts/persona-wave-20260826/alex-from-scratch/`.
  Results: sqlite `sourcesEnabled=1` (Wellfound `enabled:true` after Save),
  `SEARCH_STARTED true`, discovery run
  `discovery_run_0c0ed531-bc2f-4a12-b5ad-7d23d6042a70` completed with
  `validJobsFound=50` / `jobsPersisted=50` / `saved_jobs=50`, no
  "couldn't finish opening", `ERROR_COUNT` 0, `crash:false`,
  `searchPass:true`, EXIT 0 (~38s). Did not continue shortlist/approve/
  prepare this wave. Goal remains **ACTIVE**. **Still weak:** full
  shortlist→resume→prepare rediscovery not re-run post-enable-fix; Sam
  Applications; remaining `… Com`/`… IO` label leftovers from wave 9 unit
  tighten not re-proven on this 50-job board.

- **Import→apply enable-source crash proof (wave9e prove, 2026-08-27):**
  Desktop rebuilt (`pnpm --filter @unemployed/desktop build`). One LIVE_AI=0
  short harness run (no wipe-retry loop): `node alex-enable-crash-smoke.mjs`
  → log `alex-enable-crash-smoke-wave9e-prove.log` under
  `apps/desktop/test-artifacts/persona-wave-20260826/alex-from-scratch/`.
  Path: Targeting fills → jump CTA → DOM click **Enable Wellfound** →
  survived (`H1_AFTER_ENABLE` Guided setup, `TECH` null, `ERROR_COUNT` 0,
  EXIT 0; jump CTA cleared = form `enabledSourceCount >= 1`). **Crash fixed
  on enable toggle.** Superseded for Save→Search + jobs>0 by wave9f above.
  Goal remains **ACTIVE**.

- **Import→apply enable-source crash harden (wave9e, 2026-08-27):**
  Sequence proven in `alex-funnel-wave9e-enable-prove.log`: Targeting fills →
  `reveal-sources: jump-cta` → `Enable Wellfound…` → Electron closed mid
  enable (error boundary for users; harness often loses the window before
  Technical details). Crash is on **enable toggle**, not only Targeting fill.
  **Product harden:** null-safe `parseListInput` + `workModes` field reads;
  single `setValue` for discoveryTargets (no dual onChange); sticky-top
  ResizeObserver rounds + skips unchanged heights; jump CTA
  `scrollIntoView({ behavior: "auto" })`. **Proof:** catalog enable under
  `LockedScreenLayout` sticky footer + ResizeObserver chatter + utils
  nullish parse tests. Superseded for live enable survival by wave9e prove
  above. Goal remains **ACTIVE**.

- **Import→apply enable-source root cause + fix (2026-08-27):**
  Wave 9 alex rediscovery failed before Search because **sources never
  enabled** (`sourcesEnabled: 0`). **wave9** (`…90a6e680.log`) hung mid
  `[enable-source] Enable Wellfound…`; **wave9c/9d** finished with overall
  **FAIL** — Targeting hit app error boundary (`Job Finder couldn't finish
opening`) after fills, sqlite still had starter targets all `enabled:false`.
  **Root cause (source-generic):** after wave-8 sticky
  `LockedScreenLayout.bottomContent` footer, Job sources sit far below the
  fold in Targeting; harness scrolled `window` (not `.screen-scroll-area`),
  then Playwright `force` clicks on Enable hung/detached. Discovery copy
  ("Enable a saved source" / "Enable sources") was secondary — primary path
  never flipped a saved source on. **Fix:** harness
  `revealJobSources` + DOM click with timeout +
  `[data-profile-setup-source-enable]` / Profile Include checkbox fallback;
  list-editor Enter commit; skip Strong-rewrite click; capture technical
  details. Product: top Targeting jump CTA `Show job sources to enable`
  (`data-profile-setup-jump-to-sources`) + stable Enable `data-*` + focusable
  sources heading. **Proof:** catalog + discovery-filters + step-footer
  vitest **24** passed. **wave9d outcome:** completed EXIT 0, overall FAIL,
  crash before enable (no full funnel re-run). **Still weak:** live
  enable→search rediscovery not re-proven; Targeting crash stack still
  unknown (technical details now harvested next run); Sam Applications.

- **Funnel polish wave 9 rediscovery attempt — harness FAIL, labels from wave 8 archive (2026-08-27):**
  Clean restart after prior hung resumes. Desktop rebuilt; wave 8 userdata
  archived to `userdata-pre-wave9-rediscovery-20260827-080515/`. Fresh
  `run-alex-funnel.mjs` LIVE_AI=0 attempts: **9** early Electron close;
  **9b** reached Find jobs but sources never enabled (sticky `data-save-state`
  toast intercepts bottom CTAs → `Search jobs` disabled → overall **FAIL**);
  harness patched (`dismissSaveToast` + default `force` clicks);
  **9c/9d** hit renderer error boundary (`Job Finder couldn't finish opening`)
  mid Targeting — overall **FAIL**, 0 jobs persisted. Logs:
  `alex-funnel-wave9b-retry.log`, `alex-funnel-wave9d-clean-rediscovery.log`.
  **Label measurement (wave 8 rediscovery sqlite archive, hard garbage only):**
  **42/50 good**, **6/50 neutral** (`Employer not stated`), **2/50 garbage**
  (`Dearhiringmanager IO`, `Scan Com`). Target URL/slug garbage still **gone**
  on that board snapshot (`Https…`/`Strongholdpay`/`Green Usd` = 0; `Scale AI`
  OK). **Do not** treat short brands (`Tennr`, `Stockx`, …) as garbage.
  **Canonical full funnel PASS** remains wave 8 / wave 7b (export→approve→
  prepare, no submit). **Still weak:** live rediscovery blocked by toast +
  Targeting crash; remaining `… Com`/`… IO` (wave 9 unit tighten below not
  re-proven live); Sam Applications. Goal remains **ACTIVE**.

- **Funnel polish wave 9 — short-slug TLD rejection + visual contrast (2026-08-27):**
  Product follow-up while rediscovery harness was unreliable. **Employer
  labels:** tighten `isUrlDerivedEmployerLabel` for case-insensitive strong TLD
  tails (`Dearhiringmanager IO`, `Scan Com` / `Scan COM`) while keeping real
  short brands (`Tennr`, `Stockx`) and ambiguous tails (`Scale AI`, `Acme Co`);
  reject hyphenated strong-TLD slug tails (`scan-com`, `dearhiringmanager-io`)
  in `shouldRejectEmployerSlugInference` without a length-only 6–9 char ban.
  Wired through existing `sanitizeEmployerLabel` /
  `sanitizeObservedEmployerLabel` / `formatEmployerLabelFromSlug` paths.
  **Visual:** EmptyState dashed border at full `--border-strong` + stronger
  fill gradient (Discovery empty/loading + Applications list empties);
  Applications fact-strip uses `--border-strong` + soft overlay; dark/light
  `--field-border` / focus border+shadow raised for dark-panel inputs.
  **Proof:** `pnpm validate:package contracts` (543), `desktop` (2655);
  `pnpm source-generic:check` PASS. **Live rediscovery of TLD drops:** still
  unverified (see rediscovery attempt above). Goal remains **ACTIVE**.

- **Funnel polish wave 8 follow-up — LIVE_AI=0 rediscovery proof (2026-08-27):**
  Desktop rebuilt (`pnpm --filter @unemployed/desktop build`). Wave 7b userdata
  archived to
  `.../alex-from-scratch/userdata-pre-wave8-rediscovery-20260827-071117/`;
  fresh empty `userdata/` + `run-alex-funnel.mjs` with
  `UNEMPLOYED_TEST_API_USE_LIVE_AI=0` (no submit). Log:
  `alex-funnel-wave8-rediscovery.log`; evidence `alex-funnel-evidence.json`.
  Run `discovery_run_3a78da3c-9b45-445a-8c12-0a9a42ef51ba` —
  `validJobsFound=50`, `jobsPersisted=50`. **Sqlite `saved_jobs` labels:**
  **42/50 good** real names (Tennr, Scale AI, Give Lively, Pomelo Care, …);
  **6/50 neutral** stored `Employer not stated` (UI `Listing · {source}`
  fallback); **2/50 garbage** TLD artifacts (`Dearhiringmanager IO`,
  `Scan Com`). Target wave-7 garbage **gone:** `Https … Com` 0, `Strongholdpay`
  0, `Green Usd` 0; `scale-ai` now **Scale AI**. **Full Alex funnel PASS**
  (launch/import/profile/sources/search/shortlist/resume/prepare/
  noEmployerSubmit). **Did not ship** generic 6–9 char short-slug rejection:
  `Stockx` still appears, but a length-only reject would also drop real names
  (`Tennr`, `Coder`, `Tulip`, `Sardine`). Sam Applications not re-run.
  **Still weak:** remaining `… Com` / `… IO` hostname title-case; 6/50 missing
  employer (rely on display fallback); short branded slugs without link text;
  Sam Applications consistency. _(Wave 9 unit/sanitize targets the
  `… Com` / `… IO` leftovers; live rediscovery still unverified.)_

- **Funnel polish wave 8 — employer label sanitization + profile setup chrome (2026-08-27):**
  Source-generic follow-up to wave 7 slug/URL garbage labels and profile
  guided-setup below-fold clipping. **Employer labels:** shared contracts
  helpers reject URL-derived hostname fragments (`Https … Com`), inline
  domains, currency-slug suffixes (`green-usd`), and long concatenated
  single-token slugs (`Strongholdpay`); `formatEmployerLabelFromSlug` title-cases
  with acronym handling (`scale-ai` → `Scale AI`); `sanitizeEmployerLabel` for
  storage/display fallbacks vs `sanitizeObservedEmployerLabel` for intentional
  board placeholders (`Confidential`, `Confidential Careers`). Wired through
  compact scan observer, `job-extraction` card merge, `matching-review-queue`
  URL inference, and desktop `job-employer-location-display` (neutral
  `Listing · {source}` when label drops). **Regex fix:** concatenated-slug
  guard raised from `{10,}` to `{12,}` lowercase so `Confidential` is not
  misclassified as slug garbage (restores LinkedIn extraction tests). **Profile
  setup:** sticky Save/Continue footer via `LockedScreenLayout.bottomContent`;
  capped top summary scroll on small viewports; duplicate step CTAs hidden when
  footer owns navigation; shell `h-full min-h-0` + footer safe-area padding.
  **Visual (residual):** stronger field/panel borders in `globals.css`; outline
  button contrast on dark panels. **Proof:** `pnpm validate:package contracts`
  (543), `browser-agent` (248), `job-finder` (1821), `desktop` (2655);
  `pnpm source-generic:check` PASS. Live rediscovery: see wave 8 follow-up
  above.

- **Employer binding wave 7 — utility inventory filter + LIVE_AI=0 rediscovery proof (2026-08-27):**
  Source-generic follow-up to wave 6 employer proof (44/50 with 6 utility
  chrome rows). Compact scan drops browse/utility inventory before persist:
  bare `/jobs` hub URLs (`isLikelyJobListingHubUrl`), plus `/browse/…` and
  `/hiring-data` (synced with shortlist utility filters in `job-extraction` +
  `matching-review-queue`). Company binding prefers visible company-link text
  (`innerText`, `aria-label`, `title`) over slug title-case when labeled
  anchors exist. **Harness proof (prior):** Playwright live-binding fixture +
  unit tests; `pnpm validate:package browser-agent` + `job-finder` +
  `pnpm source-generic:check` PASS. **Live rediscovery proof:** desktop
  rebuilt (`pnpm --filter @unemployed/desktop build`); wave 6 userdata
  archived to
  `.../alex-from-scratch/userdata-pre-wave7-utility-filter-20260827-064304/`
  (before: **50** sqlite rows, **44/50** real employers, **3** utility titles
  `Startup Jobs` / `Industries` / `Tech Hubs` plus hub/browse URLs); fresh
  empty `userdata/` + `run-alex-funnel.mjs` with
  `UNEMPLOYED_TEST_API_USE_LIVE_AI=0` (no submit). Log:
  `alex-funnel-wave7-utility-filter-rediscovery.log`; evidence:
  `alex-funnel-evidence.json`. Run
  `discovery_run_06ff8689-be48-4a96-a9a5-af3401a8bfcd` —
  `validJobsFound=50`, `jobsPersisted=50`. **After sqlite `saved_jobs`:**
  **50/50** rows carry real `company` (100% of inventory); **0** utility
  titles and **0** hub/browse URLs (prior utility ids absent); examples:
  `Executive Assistant` → Tennr; `Data Engineer (Staff, Principal, Lead)` →
  Green Usd; `Machine Learning Research Scientist, Post-Training` → Scale Ai.
  Inventory count stayed **50** (not ≤44) because discovery still fills the
  50-job quota with real postings once chrome is filtered — net win is chrome
  removal + **49/50** real employers vs wave 6 **44/50** (one URL-derived
  `Https Therichmondmarketing Com`; **0** utility hub/browse rows). **Full Alex
  funnel end-to-end PASS** after harness fix for false-positive
  `TEMPLATE APPROVAL ELIGIBLE` (must still **Export PDF** before
  **Approve this PDF**): log
  `alex-funnel-wave7b-harness-fix-full.log`; evidence
  `alex-funnel-evidence.json` — all step verdicts PASS including **prepare**;
  no employer submit. Prior wave 7 log (`alex-funnel-wave7-utility-filter-rediscovery.log`)
  still **FAIL** on old export gate. **Still weak:**
  slug-only / URL-derived labels when link text is missing (`Strongholdpay`,
  `Green Usd`, `Scale Ai`, `Https Therichmondmarketing Com`, `Stockx`);
  labeled-link preference did not upgrade Green on this board snapshot; Sam
  Applications label consistency not run; profile-setup clipped controls below fold.

- **Funnel polish wave 6 — post-fix rebuild + LIVE_AI=0 rediscovery (2026-08-27):**
  Confirms sqlite/UI persistence after generic ancestor-walk employer binding
  (follow-up to chat **Generic employer binding only**). Desktop rebuilt
  (`pnpm --filter @unemployed/desktop build`); prior Alex userdata archived to
  `apps/desktop/test-artifacts/persona-wave-20260826/alex-from-scratch/userdata-pre-wave6-rebuild-20260827-063736/`;
  fresh empty `userdata/` + `run-alex-funnel.mjs` with
  `UNEMPLOYED_TEST_API_USE_LIVE_AI=0`. Log:
  `.../alex-funnel-wave6-rebuild-rediscovery.log`; evidence:
  `alex-funnel-evidence.json`. Discovery run
  `discovery_run_e0eb2c4b-a39d-432e-a54a-b91a6791ceb1` completed —
  `validJobsFound=50`, `jobsPersisted=50`. **Proof (sqlite `saved_jobs`):**
  **44/50** real `company` (not empty, not `Employer not stated`); **6/50**
  utility index titles (`Startup Jobs`, `Industries`, `Tech Hubs`, …) with
  empty URLs still `Employer not stated` (UI should fall back to
  `Listing · {source}`). Examples with binding:
  `Executive Assistant` → Tennr; `Data Engineer (Staff, Principal, Lead)` →
  Green Usd; `Machine Learning Research Scientist, Post-Training` → Scale Ai.
  Prior pre-fix Alex rediscovery was **0/50** real employers; this wave is
  **not** a regression. **Prepare root cause (harness, not product):** full
  funnel clicked `Export PDF` inside the approve `clickAny` list, set
  `resumeApproved=true` without approving, then `Prepare application` stayed
  disabled (`prepareClicked=false`, alert: “Approve the exported PDF first”).
  **Fix:** `run-alex-funnel.mjs` now exports → waits for approval eligibility
  → clicks `Approve this PDF` only → returns to Shortlisted → clicks Prepare
  with `force:true`; verdict uses `prepareClicked || prepareReached`.
  **Prepare proof:** `run-alex-approve-prepare.mjs` on wave 6 userdata —
  approve **PASS**, prepare **PASS**, no employer submit (`alex-funnel-prepare-rerun.log`,
  `alex-funnel-prepare-evidence.json`). Full re-run with export-gate fix: **PASS** (wave 7b log above). **Still weak:**
  wave 6 userdata had 6/50 chrome rows (utility filters landed in wave 7); slug-only link
  text; Sam retest; full end-to-end funnel not re-run this follow-up.

- **Funnel polish wave 4 — rebuild + LIVE_AI=0 rediscovery (2026-08-27):** Same
  **44/50** employer proof on earlier clean userdata after element-level
  binding (Give Lively shortlist; Find jobs cards e.g. “Executive Assistant
  Tennr”). Approve→Prepare spot-check PASS (`run-alex-approve-prepare.mjs`).
  DOM evidence under `.../wellfound-dom-evidence/` — role pages use plain divs
  with company cards at ~depth 5; fixed by unique-company ancestor walk +
  containers.

- **Employer binding — source-generic compact scan (2026-08-27):** Root cause:
  live compact discovery dropped employer names because the in-page scan never
  attached observed employer-profile links (`/company/…`, `/employer/…`) to
  job-title anchors, and `readScanPayload` did not round-trip
  `companyHref`/`companyLabel` into posting candidates. Fix (all
  source-generic — no board branches): walk up to 8 DOM ancestors for a
  **unique** employer-profile anchor, prefer visible link text over slug
  inference, accept numeric-prefix job URLs as posting inventory, and map
  recovered fields through `buildDomCardPostingCandidate` →
  `JobPostingSchema` → agent checkpoint merge. **Targeted harness proof:**
  Playwright live-binding fixture (grouped-board dom-evidence shape) — 3/3
  posting candidates persist real employers (`Sigma Computing`, `Reflow`);
  compact-first agent path keeps 2/2 with zero LLM/extraction calls.
  **Live rediscovery proof:** wave 6 above (44/50 real employers on fresh post-rebuild userdata).
  `pnpm validate:package browser-agent` + `pnpm source-generic:check` PASS.
  **Still weak:** boards with ambiguous multi-employer cards still omit
  employer; slug-only fallback when link text is empty; utility chrome
  listings.

- **Source-generic audit (2026-08-27):** Hard constraint for import→apply work —
  no per-board adapters, `if (source === …)` workflow branches, or board-named
  product copy. `pnpm source-generic:check` PASS (4 ratcheted test-fixture
  entries only). **Must refactor (done this wave):** Discovery empty-source
  callout (removed board-named example); employer display/recovery uses
  generic `/company/{slug}` + `Listing · source` fallbacks
  (`job-employer-location-display.ts`, Applications/Find jobs panels); compact
  scan employer binding (ancestor walk + `companyHref`/`companyLabel`
  round-trip). **OK as generic heuristics (fixture-tested, not shipped
  policy):** site-chrome title/path deny lists and hub-url filters in
  `browser-agent`/`job-finder` matching (e.g. Albanian nav, `/company/{slug}`
  hubs, social hosts); profile-copilot scenarios that add user-named sources;
  test/fixture URLs. **Apply path:** prepare-only SW block copy is
  source-neutral (“job site blocked automatic prep”); no board branches in
  `browser-runtime`/`catalog-session-agent`.

- **Funnel polish wave 3 (2026-08-27):** Shortlisted footer keeps a single primary
  when the tailored PDF still needs approval — removed the disabled ghost
  Prepare button under Review and approve; checklist “Next:” is quiet text
  instead of a third StatusBadge (list + header badges stay). Guided-setup
  readiness cards use tighter padding so the completeness strip is less likely
  to clip below the fold under the locked top chrome. Compact scan employer
  binding closed in wave 4 rediscovery (prior wave was 50/50
  `Employer not stated` before element-level unique-company recovery).
  Shortlisted approve→Prepare spot-check PASS
  (`run-alex-approve-prepare.mjs`, no employer submit). Validated:
  `pnpm --filter @unemployed/desktop build`; desktop vitest 2654 passed;
  browser-agent focused extraction + observer tests; focused Shortlisted
  mission-panel + guided-setup summary coverage included.
  Persona-wave visual hierarchy 2026-08-27: Applications finish-first pauses
  no longer repeat the Next step paragraph or show competing Queue controls;
  primary Safeguards / finish CTAs are larger; status facts wrap instead of
  truncating, use quieter label contrast, and filters sit on their own row;
  Find jobs promotes employer meta (or Listing · source), limits comfort
  badges, and bumps contrast; Shortlisted readiness gaps + resume-ready
  captions are clearer; Resume Studio next-step banner and header have more
  weight. Fresh Alex (data) + Sam (frontend) from-scratch personas exercise
  the same import→apply funnel only.
  **Alex + Sam funnel polish (2026-08-27):** Guided setup keeps Save/Continue
  in a sticky footer; Profile completeness/resume strip no longer sits above
  the Basics tabs; Shortlisted promotes Review and approve resume over Prepare
  when the PDF is exported but unapproved; Discovery results add bottom scroll
  padding so the last card is reachable; Essentials path cards use draft-aware
  review counts. Sam: Search blocked without enabled sources now uses a warning
  callout plus primary Enable sources / Add sources buttons (not gold
  underlines); checkpoints dialog keeps Continue without first/focused while
  Enable checkpoints is visually primary; Applications list/CRM/detail omit
  `Employer not stated` and use slug inference or `Listing · source`; Resume
  Studio notes and Find jobs list/inspector contrast are stronger in dark
  theme. Comfortable-density Find jobs rows still show posting-date badges so
  Newest ranking truth (`not date-ranked`) stays visible; compact density
  omits them.
  **Funnel polish wave (2026-08-27, post Alex/Sam):** Wellfound `/jobs/{id}-…`
  cards now recover employer from an observed `/company/{slug}` href (DOM card
  - compact discovery + structured extraction) without inventing names from
    the job-id slug alone; Applications cover-letter lineage omits absence
    placeholders the same way; LinkedIn SW prepare recovery rewrites
    service-worker jargon in customer-facing copy, treats apply-result SW blocks
    as site-blocked facts even when the CRM blocker code is generic, and keeps
    a single `Listing · source` label (no duplicate “Listing on”); dark outline/
    secondary/ghost controls and field/panel borders use stronger contrast.
    **Funnel polish wave 2 (2026-08-27):** Locked extraction→display contract for
    Wellfound `/jobs/{id}-…` + observed `/company/{slug}`: unit/integration tests
    cover structured extraction, compact DOM cards, and Applications list when
    `company` was stored from recovery (shows employer, not `Listing ·`). Profile→
    Search empty Roles/Locations/Work modes use primary CTAs; Applications list
    drops the redundant Needs follow-up badge beside Needs you; Resume validation
    note rows use stronger borders/`items-start`/padding; ghost buttons and empty
    states gain contrast; list keyboard focus rings align with shell tabs.
    Validated: focused vitest (desktop employer/display + Applications + Search
    setup + globals; browser-agent extraction + compact observer) and
    `pnpm validate:package desktop`. Skipped Jordan LinkedIn SW live retest
    (no Go quota burn / no employer submit). Still weak after wave 2: legacy
    stored Wellfound rows without company-path evidence stay `Listing ·`
    Wellfound until rediscovery; SW recovery remains external-browser constrained
    after Safeguards reset. Wave 3 reduces Shortlisted action noise while keeping
    list+header readiness badges.
    Prior wave also validated `pnpm validate:package browser-agent`.
- Persona-wave flow hardening 2026-08-27: from-scratch persona evidence drove
  focused fixes across Profile → Find jobs → Shortlisted → tailored resume →
  Prepare. P0: resume workspace routes now encode/decode job ids so URL-encoded
  targets (e.g. Wellfound slugs with spaces and `&`) no longer crash Resume
  Studio; abnormal failure safeguard pause no longer blocks new discovery (only
  batch sample review still blocks); Applications recovery copy names LinkedIn
  service-worker blockers and links to Safeguards profile reset. P1: KosovaJob
  navigation pages and Wellfound-style "View all … jobs" nav links are filtered
  during extraction and at Shortlisted display; prepare gate now matches
  Shortlisted approved-export resolution and re-resolves stale absolute export
  paths under current user data; stale `missing_resume` application blockers
  reconcile on workspace snapshot when approved tailored PDF readiness matches
  Shortlisted; Jordan retest harness skips `importResumeFromPath` when Partiful
  approved export exists (never re-import on prepared userdata). Deterministic
  resume fallback shows explicit warning copy; Shortlisted resume-strategy CTAs
  are de-duplicated; Home hides the profile-setup blocker after the first
  completed search; Find jobs nav badge spacing is fixed; discovery terminal
  feedback no longer duplicates on the route action surface; repeated searches
  with zero new jobs explain that existing results are unchanged; Wellfound-style
  `/company/{slug}/` URLs infer employer names on cards. **Polish batch + persona wave 1
  (2026-08-27):** Applications plain-language status facts, collapsed technical sections, single
  Resume Studio export in banner; parallel Jordan/Priya/Maya retest (live AI off) — Jordan 4/4 PASS,
  Priya 3/4 (repeat-search copy gap), Maya 2–3/5 (legacy Wellfound nav junk in discovery list;
  expanded utility-title filter at display + extraction in wave 2). **Wave 2 quality fix
  (2026-08-27):** strengthened utility filters for KosovaJob Albanian/nav titles, Wellfound
  company hubs (`/company/{slug}`), and marketing chrome (Why Wellfound, fb.com); same filter
  removes junk from Find jobs + mismatch pools; card meta hides `Employer not stated` /
  `Location not stated` and recovers employer from company-path URLs when present; repeat-search
  zero-new feedback now reads the refreshed run summary (not a stale discovery snapshot).
  **Wave 3 Maya/Priya leftover fix (2026-08-27):** inspector/shortlist/fit-evidence/Companies
  deep-links no longer render absence placeholders (omit empty meta via
  `job-employer-location-display`); Albanian privacy-policy titles filtered at display +
  extraction; generic company corpus rejects `employer not stated`. Omitting placeholders is
  enough this round — real Wellfound employer names still need company-path slug or live
  extraction. **Priya WAVE 4 Companies cleanup (2026-08-27):** legacy
  `Employer not stated` / generic company shells are purged on reconcile, excluded from
  workspace company lists + Companies UI/search, and no longer deep-linked from jobs or
  applications (`isListableCompanyName`). **Wave 5 Priya privacy company shells
  (2026-08-27):** Companies also excludes utility chrome names via shared
  `isLikelyUtilitySiteChromeName` (same title patterns as shortlist utility
  filter) — Albanian `Politikë e Privatësisë…`, Privacy/Cookie Policy, and other
  nav/marketing labels are purged on reconcile and omitted from snapshot/UI;
  evidence no longer creates those shells. **Wave 4 Maya privacy filter (2026-08-27):** live KosovaJob privacy page
  (`Politikë e Privatësisë dhe Mbrojtjes së të Dhënave Personale` /
  `/politika-e-privatesise`) was still listing as a job — title `\b` after `ë` failed and
  the Albanian path slug was missing; utility filters now match the compound title prefix
  without diacritic word-boundary and include Albanian privacy path segments.
  **Priya WAVE 3 discovery feedback (2026-08-27):** with `LIVE_AI=0`, browser
  discovery no longer early-exits before the compact-first page scan when the deterministic
  client lacks `chatWithTools`; interrupted Search banners no longer duplicate “stopped before
  it could finish”; zero-new duplicate merges keep a completed run verdict for repeated-search
  copy. Rhythm in `docs/TESTING.md`.
  LinkedIn service-worker
  prepare blocking remains an external browser constraint — recovery UX only.
  Jordan retest3 (2026-08-27): with import skipped and approved Partiful PDF on
  disk, Applications clears the missing-resume blocker on load; Retry Prepare
  proceeds to service-worker pause (expected), not resume_missing. Focused
  validation: `pnpm validate:package desktop`, `pnpm validate:package job-finder`,
  and `pnpm validate:package browser-agent` (one pre-existing fast-path merge test
  still failing in browser-agent; unrelated persona blockers).
  **Jordan WAVE 2 UX (2026-08-27):** Shortlisted cards say "Approved resume ready"
  when a tailored PDF is approved (never future-tense "will be created");
  Applications promotes recovery (Open Safeguards / finish manually) over cover-letter
  drafting when paused/blocked; site-block pause uses plain-language next step and
  suppresses the "Preparing safely…" spinner while manual finish is required.
  **Jordan WAVE 3 field-conflict recovery (2026-08-27):** conflicting prefilled
  fields and prepare-only field-save pauses use the same finish-first hierarchy —
  Next step and recovery say finish in the open application; Retry preparation is
  demoted to secondary ("Retry preparation later"); no preparing spinner while the
  user must act.
- Temporary local AI routing 2026-08-26: ignored `.env.local` currently points
  shared text, tool-based agent work, and image-capable resume/browser/Interview
  analysis at OpenCode Go's `muse-spark-1.2-contributor` through the Responses
  API with requested `xhigh` reasoning. Luna is not used in this local override.
  A synthetic `/models` plus Responses tool-loop probe returned HTTP 200 and a
  `ping` function call; this is transport evidence only, not end-to-end
  discovery, resume-quality, or release acceptance. The earlier Zen free override
  (`muse-spark-1.2-contributor-free` on `https://opencode.ai/zen/v1`) is no
  longer the local dogfood route. From-scratch persona searches previously died in
  seconds because `UNEMPLOYED_ENABLE_TEST_API=1` forced the deterministic Job Finder
  client (no `chatWithTools`) and discovery early-exited before the compact page
  scan; the UI then duplicated a generic "search stopped" banner. Compact-first
  discovery now still runs under that client; model escalation still needs
  `UNEMPLOYED_TEST_API_USE_LIVE_AI=1`. Contributor prompts and completions may
  be used to train future Meta models, so private resume, credential, answer,
  and interview data still need explicit informed consent; initial testing stays
  synthetic. Rotate any key shared through a conversation. ADR 0010's mixed
  OpenCode Go production recommendation (DeepSeek text + Luna vision) remains
  accepted pending capability and privacy review. Exact setup:
  `docs/AI_PROVIDER_SETUP.md`.

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
  `8b8f95b8d06b178062d5c542ecd7f927172c715a7e9a66148d4987b3fd8f1e14`; an
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
  under More. Resume Studio has one primary next action, visible
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
  `More` menu for secondary destinations.
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
- Discovery, source-debug, and apply preparation remain source-generic: users configure sources and the product improves generically ([ADR 0007](adr/0007-source-generic-browser-workflows.md), [ARCHITECTURE.md](ARCHITECTURE.md)). Board-specific rescue logic in core product flow is debt, not a pattern.
- Compensation matching and catalog filtering compare annualized equivalents when saved and listed currencies explicitly match, including monthly-versus-yearly wording; unknown or cross-currency evidence stays neutral, and match context/posting fingerprints use logic revision 7 (scorer version 8) so persisted assessments are recalculated safely.
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
