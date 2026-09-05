# Job Finder Production Audit — Second Pass — 2026-07-16

## Scope and safety

- Independent fresh-profile customer replay using Computer Use on the production build.
- Job Finder only. Interview Helper is intentionally unchanged and out of scope.
- Journey: first launch, resume import, profile readiness, real-source discovery, match quality, shortlist/original CV, and real application preparation.
- Safety invariant: the final job-application Apply/Submit control is never activated.

## Evidence

Current-run screenshots are stored in `docs/audits/evidence/job-finder-2026-07-16-second-pass/`. Only screenshots captured and visually accepted during this pass count as audit evidence.

## Journey steps and findings

### Step 1 — Fresh launch

Evidence: `01-fresh-launch-database-error.png`, `02-fresh-launch-fixed.png`.

1. **P0 — A genuinely new user-data path cannot open Job Finder.** The production build attempted to open SQLite before creating the new profile directory and replaced the entire product with `Couldn't open Job Finder — unable to open database file`. There was no retry or recovery action. This did not appear in the previous pass because its audit directories already existed. Fix: create the configured user-data directory before repository initialization and cover the missing-parent case with a regression test.
2. **Verified fixed — the same absent path now opens Guided setup.** The second launch used the same production build and a user-data directory that did not exist before startup. Job Finder created its storage and rendered the empty-profile experience without an error surface.

### Step 2 — Resume import and extraction

Evidence: `04-import-latency-1m44s.png`, `03-import-complete-scroll-position.png`.

1. **Pass — the native picker is operable and accepts a real local PDF.** A first-time user can select `docs/resume-tests/Ebrar.pdf` through the Windows picker. The app disables replacement while import is active, keeps the source file unchanged, and eventually produces structured identity, contact, work-history, skills, and review items.
2. **P1 — the first interactive import took too long.** The 87 KB, text-readable PDF remained at `Building profile suggestions` past 1m44s and completed at roughly 2m20s. The UI now exposes real stage messages and elapsed time, and the same Ebrar fixture completes in the isolated production benchmark in about 15–16 seconds including Electron startup, with or without local page-image generation. The original 2m20s could not be reproduced after warm-up, so this remains a monitored cold-start risk rather than a claimed fixed defect.
3. **Verified fixed — setup transitions restore context.** Completion now resets the setup scroller and focuses the new step heading. Cross-route links to Job sources and Target roles also wait for Preferences, reset inherited page scroll, reveal the exact nested section, and focus its heading.

### Step 3 — Profile readiness and source setup

1. **Pass — extraction is grounded and reviewable.** The rendered three-page source PDF was compared with the saved identity, contact details, employment history, education, languages, and skills. The app preserved the source, surfaced eight review items instead of silently trusting uncertain inferences, and did not invent remote-work authorization.
2. **Verified fixed — first-time navigation has one clear start action.** The duplicate setup entry actions were reduced to one `Start setup` CTA; module/navigation controls remain reachable below desktop widths and expose keyboard focus and navigation landmarks.
3. **Pass — a real source can be added without sign-in.** `Circle Greenhouse` was configured from `https://job-boards.greenhouse.io/circleso`. The source-to-profile return path now lands directly on Job sources instead of dumping the customer mid-page.

### Step 4 — Real-source discovery and match quality

Evidence: `05-live-greenhouse-result.png` (before), `08-live-greenhouse-rescored.png` (after).

1. **Pass — coverage and speed.** The current Circle board had one Engineering opening and Job Finder returned that same opening in roughly 1.3 seconds. Discovery remained source-generic and did not add a Circle-specific adapter or network/model call to scoring.
2. **P0 found and fixed — the initial 90% fit was not credible.** The first assessment treated the resume as a strong match while missing required Ruby/Rails, production AI delivery, and high-traffic production scaling. The official listing was converted into a regression fixture, core gaps now cap the score, and the live result re-scored to **64%** with `review before applying` guidance.
3. **Verified improved — requirements are evidence-led.** Alternative language lists no longer create several false mandatory gaps; React Native no longer proves React; .NET/C# evidence is normalized; experimentation/A-B work and CEFR English requirements are parsed and compared conservatively. The live Circle explanation shows five required items needing evidence or conflicting with the profile.

### Step 5 — Original CV mode

1. **Pass — the new setting behaves as promised.** Settings offers `Use my original CV unchanged` with explicit no-rewrite/no-job-removal language. Shortlisted shows `ORIGINAL CV READY`, the exact imported filename, a sensitive-data warning, and a read-only extracted-text preview. Apply Copilot selected and attached the original `Ebrar.pdf`; no tailored copy was generated.

### Step 6 — Real Greenhouse preparation and final-submit safety

Evidence: `06-greenhouse-final-submit-boundary.png`, `09-final-boundary-phone-stable.png`.

1. **Pass — the real form reached the safe boundary.** Apply Copilot filled exact name, email, country code, phone, LinkedIn, and attached the original PDF on Circle's live Greenhouse application. Computer Use verified the values and the visible `Submit application` control. **That final control was never clicked.**
2. **P1 found and fixed — controlled phone widgets could cause a false manual stop.** The initial run filled the phone field correctly but accepted a transient rerender as failure. Acceptance now requires three consecutive grounded observations, permits bounded recovery after an async mismatch, and still stops permanently missing values for manual review.
3. **P0 safety hardening — ambiguous final `Apply` controls are protected.** A JavaScript final button labelled only `Apply` or `Apply now` is now treated as final when application-form/final-review context is present, and the context is checked again immediately before any click. The regression proves zero clicks.
4. **Honest replay limitation.** After the corrected 64% assessment, the product correctly blocked a fresh Apply Copilot run because five required items lack evidence. The already prepared live form remained stable with the phone and exact original resume attached, while the new persistence/final-button logic was verified through the real-form regression and full browser-runtime suite. We did not weaken the new quality gate merely to force another live run.

## Specialist reviews and implementations

- UI/UX: responsive navigation, semantic result buttons, non-nested empty states, sticky actions, duplicate-action prevention, labelled inputs, setup/deep-link focus management, and a stable per-job live-audit hook.
- Discovery/generation: source-generic requirement extraction, alternative-list handling, Ruby/Rails/C#/.NET/React distinctions, production-AI and scaling evidence, experimentation evidence, CEFR English comparison, and core-gap score caps.
- Application runtime: consecutive form stability sampling, bounded mismatch recovery, fail-safe manual review, exact original-file preservation, and broader final-submit detection.
- Reliability: create a missing user-data directory before SQLite initialization and keep the live audit/capture harness aligned with the accessible result semantics and simplified setup CTA.

## Verification

- Computer Use: fresh-profile launch, native resume picker, extraction review, profile/source setup, live Circle discovery, before/after scoring, shortlist/original-CV review, dedicated Chrome, real Greenhouse prepared fields, and final Submit boundary.
- Resume benchmark: Ebrar PDF literal precision 1.000, recall 1.000, experience F1 1.000, education F1 1.000, evidence coverage 1.000, auto-apply precision 1.000; isolated elapsed time about 15–16 seconds including startup.
- Job Finder package: 325/325 tests in the specialist run.
- Browser runtime: 53/53 tests, including delayed widget recovery, permanent mismatch, and ambiguous final `Apply` safety.
- Desktop focused UX: 17/17 tests plus harness syntax, typecheck, lint, build, and diff checks in the specialist run.
- Final broad verification: `pnpm verify` passed all agent/docs/source-generic checks, lint, typecheck, and **1,092 tests across 137 files** (1 skipped). The structure check remains warn-only and reports existing oversized-file candidates.

## Production-readiness verdict

The end-to-end Job Finder flow is materially stronger and safe for prepare-only use: a new profile opens, resume data is grounded and reviewable, a real Greenhouse source is discovered quickly, match scoring now rejects a superficially similar but core-skill-mismatched role, the original-CV mode preserves the exact file, and the application runtime reaches but never activates final submission. The remaining release watch item is cold-start resume-import latency: the 2m20 interactive outlier was not reproduced by the 15–16 second isolated benchmark and should be monitored with real packaged cold starts before calling import speed fully solved.
