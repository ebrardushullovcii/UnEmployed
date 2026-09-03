# Goals

Use this for durable product direction. Use `docs/STATUS.md` and `docs/TRACKS.md` only for active state.

## End State

Build one local-first Electron desktop app for job search, resume preparation,
user-controlled application automation, and interview prep/live support.

## Job Finder North Star

This section was reconstructed and independently re-verified on 2026-08-26 from
the complete 187-user-message record of the days-long OpenCode V2 session
`ses_fd67af1baffeXnaMeRW37iZm29`, with agent replies consulted only to resolve
references and implemented safety constraints. When historical preferences
conflict, the user's latest direction wins.

Job Finder is the current product priority. Its purpose is to let a person move
from an accurate profile to a large, useful job pipeline and completed
applications under their chosen authority without needing to understand the
product's internal concepts.

The primary journey is:

1. Set up and verify the profile and original resume.
2. Find hundreds or thousands of relevant, current jobs across repeated searches.
3. Judge results quickly and shortlist the jobs worth pursuing.
4. Generate strong, job-specific resumes, including aggressive rewrites when
   selected, then edit, export, and approve the exact artifact.
5. Execute applications according to the user's selected automation mode,
   including final submission when autonomous authority is explicitly enabled.
6. Ask for help only when work falls outside that authority, then track outcomes.

Profile -> Find jobs -> Shortlisted -> resume policy and review -> Apply ->
Applications must feel like one continuous journey. The next useful action should
be obvious without reading long explanations or learning terms such as campaign,
strategy, lineage, or runtime. Needs you, Task center, search plans, resume
approaches, Companies, Outcomes, Documents, diagnostics, and Settings support
this journey; they must not compete with it.

Acceptance binds to these user outcomes, not the current implementation. The
discovery engine, browser control, profile-editing tools, resume editor, agent
loops, and supporting libraries should be replaced when a measured alternative
is materially simpler, more reliable, more truthful, or more effective.

Implementation constraint: users pick and enable sources; discovery,
source-debug, and apply preparation must improve generically through shared
browser policy, typed evidence, and learned target instructions—not per-board
route builders, triage overrides, or rescue branches in shared orchestration.
See [ARCHITECTURE.md](ARCHITECTURE.md) and [ADR 0007](adr/0007-source-generic-browser-workflows.md).

### Product Outcomes

- A first-time user can import a resume, correct the resulting profile, configure
  at least one source, find jobs, shortlist one, create and approve a tailored
  resume, prepare the application, and reach Applications without hints.
- A returning user can maintain hundreds or thousands of retained jobs across
  search plans and repeated runs without losing decisions, selection, filters,
  approved artifacts, application records, or responsiveness. A representative
  5,000-job hydrated workspace must keep bounded result rendering and the
  canonical warm-route readiness budget at or below 500 ms; do not relax that
  budget or rerun the heavy scale gate during every small edit.
- Discovery prioritizes relevant, current, inspectable results rather than raw
  volume. It must support broad collection over repeated runs, preserve protected
  in-flight work, explain conservative mismatches, and recover truthfully from
  source or network failures. Inactive or stale is not the same as proven closed;
  visible Posted/Updated dates must agree with sorting; each job retains safe
  source provenance; and the UI distinguishes found, retained, target, and new
  results instead of disguising a conservative retention budget. Healthy repeated
  runs deduplicate prior results and add newly available relevant jobs; when the
  configured sources are exhausted, the product says so instead of relisting old
  jobs or implying that more were found.
- Fit is evidence-backed guidance, never an “ATS score” or interview probability.
  Required evidence, conflicts, and unknowns remain inspectable before the
  aggregate score or recommendation.
- High-volume work is efficient: bulk triage does not eject the user from Find
  jobs, bulk resume generation does not hijack selection, per-job failures do not
  discard successful work, and progress survives navigation. Completed and failed
  per-job outputs survive restart; an in-flight batch stops safely rather than
  pretending to resume work that no longer owns a running process. A user can
  prepare job-specific resumes for dozens of shortlisted jobs in a working session
  through bounded batches without repeating the same setup for every job.
- Tailored resumes are materially better for the exact vacancy while remaining
  truthful. Strong/aggressive generation may substantially rewrite, combine,
  reorder, and elaborate supported evidence, but it never invents employers,
  dates, credentials, seniority, historical titles, named technology, absent
  skills/keywords, leadership, ownership, education equivalence, transferred
  accomplishments, or numbers. Every draft remains editable, reviewable,
  versioned, and exportable. Use requires either approval of that exact artifact
  or an explicit autonomous authority envelope with a saved resume policy that
  authorizes it; the receipt must identify the exact artifact used. Deterministic
  evidence checks are authoritative; a model never certifies its own output.
  Show the exact AI change before approval/export, obtain granular consent before
  remote resume processing, and exclude salary expectations plus privacy-risk
  defaults such as photo, date of birth, marital status, government IDs, and
  salary history unless the user explicitly opts into a locale-specific need.
  Quality is judged against the original resume for the exact target job,
  including a blinded human preference and a practical "would I send this?"
  decision; synthetic validators alone cannot establish superiority.
- Guided chat must cover the complete supported editing surface, not a handful of
  demo phrases. Profile Copilot owns typed profile and preference proposals;
  resume Guided Edits owns draft revisions. Natural requests such as changing
  salary expectations, rewriting a summary, emphasizing a skill, reorganizing
  experience, or revising a draft must produce clear reviewable changes or ask a
  narrow clarification instead of silently guessing. Neither surface receives
  application submission or other external authority.
- Application authority is user-configured rather than permanently
  `prepare_only`. The product supports prepare-only, confirm-before-submit, and
  autonomous-submit modes. Broader modes require an explicit, inspectable,
  revocable authority envelope covering scope, volume, answers, resume policy,
  employer-site writes, final submission, stop conditions, and expiry. Existing
  workspaces remain prepare-only until the user chooses otherwise. CAPTCHA and
  anti-bot challenges are never bypassed; unavailable credentials or MFA,
  unknown eligibility facts, unseen material attestations, ambiguous controls,
  and actions outside the saved policy pause for the user instead of being
  guessed. Every external write and submit attempt keeps exact lineage and a
  truthful receipt; internal flags never prove a site outcome. See ADR 0012.
- Local persistence, backup, reset, and corruption recovery stay equally honest:
  a database-only backup never claims to restore documents or browser state,
  reset names its irreversible commit point, and corruption recovery validates a
  restore or quarantines/fails closed instead of silently starting fresh.
- Applications remains useful at high volume: completed, withdrawn, stale, and
  otherwise inactive records can be closed or archived without erasing their
  receipts, history, artifacts, or outcome truth, while active work stays easy to
  find.
- The durable throughput goal is thousands of relevant jobs discovered and
  hundreds of applications completed across many runs and days. The current
  10-per-run and 20-per-local-day limits remain migration defaults, not an
  immutable product ceiling. Any configurable replacement must be explicit,
  warning-backed, bounded by the user's authority envelope, and safe against
  duplicate or uncertain submission.

### Experience Bar

- Prefer simple, natural defaults and progressive disclosure over extra setup,
  dashboards, cards, filters, status badges, and explanatory copy.
- Remove obsolete, duplicate, or unused destinations and controls instead of
  keeping them visible for compatibility. Follow familiar desktop and mainstream
  product conventions unless this product's safety boundary requires a difference.
- Use one user-facing name per concept, one clear primary action per state, and
  consistent page headers, subnavigation, dividers, spacing, density, controls,
  dates, statuses, and empty states across the app.
- Inputs, cards, selected rows, disabled reasons, and status surfaces must remain
  visually distinct and equally scannable in both light and dark themes without
  relying on color alone.
- Keep useful information above the fold. Avoid oversized cards, duplicated
  summaries, empty panes that repeat each other, excessive padding, nested
  scroll confusion, and metadata that pushes the decision or editor below view.
  Densify the information needed for the current decision; progressively disclose
  secondary controls, diagnostics, and explanation rather than hiding key facts.
- Every empty, blocked, failed, stale, or interrupted state must explain the
  truth in plain language and offer the nearest safe recovery action.
- Navigation never silently discards profile, resume, settings, answer, or
  application edits. Unsaved-change protection names the affected work and offers
  clear Save, Discard, and Stay choices in product language; avoid a generic
  browser or operating-system prompt when an in-app decision can remain truthful.
- Navigation and layouts must remain stable at supported desktop sizes, compact
  widths, keyboard-only use, and native Electron 125% zoom. Controls must not
  jump, overlap, clip, become unreachable, or rely only on color. Native 200%
  zoom is deliberately excluded from current acceptance because it produces a
  mobile-like layout with little diagnostic value; historical evidence remains
  historical rather than silently restoring that requirement.
- WCAG 2.2 AA is the current ship baseline. AAA focus appearance and 400% reflow
  are follow-up aspirations, not gates that silently expand current acceptance.
- Nested panes own wheel scrolling while the pointer is over them and hand control
  back at their boundary; unmarked inner scrollers inside a marked pane own the
  wheel before their pane, and text controls keep browser-owned scrolling; the
  outer page must not hijack every wheel event.
- Settings and advanced features must have explicit ownership and save scope;
  users should not have to discover which of several similar Save buttons owns
  a field.
- Power-user speed must not make the default journey harder for a novice.
  Search, filters, density, keyboard navigation, saved views, and bulk actions
  should accelerate repeated work while preserving safe, understandable defaults.
  Discoverable keyboard shortcuts may accelerate frequent navigation and shell
  actions, but they supplement visible controls rather than becoming required.

### Product-First Verification

- Real use of a freshly built Electron app is the primary UX evidence. Automated
  tests are regression and integrity guardrails; they do not prove that a screen
  is clear, attractive, simple, or useful.
- Dogfood the complete journey with visible UI actions and realistic data. Inspect
  screenshots and actual behavior, not only DOM snapshots, stale artifacts, or
  synthetic counts. Never claim a visual or workflow fix without replaying the
  affected state in the app. Keep the user informed when a live Electron session
  starts, stops, or produces evidence so app use never disappears behind test logs.
- Test both first-use and returning-use paths, populated and empty states, source
  failures, no-result recovery, interrupted work, original-CV and tailored-CV
  choices, repeated resume edits, bulk work, restart durability, and the safe
  employer handoff or autonomous completion according to the selected mode.
- During iteration, use fresh user-role workers to dogfood changed journeys and
  feed findings into repeated fix -> live-replay loops. Reserve the canonical
  sealed blind-persona acceptance wave until the current build works end to end.
  Blind testers receive a life context and outcome, not route instructions or
  implementation vocabulary. The user's original 12-persona idea evolved during
  implementation into the canonical P01-P14 cohort; those 14 personas cover
  varied occupations, ages, confidence, privacy needs, accessibility, time
  pressure, and high-volume returning use.
- In every persona replay, ask the tester to identify the next useful action
  before taking it. Inability to do so, or reliance on internal terminology or
  outside hints, is a journey defect even when the control is technically
  operable.
- Use independent product-owner, recruiter/resume, visual-design, interaction-UX,
  accessibility, novice, power-user, adversarial-QA, and market-research roles.
  Research current resume practice and comparable products when it can improve
  decisions, but verify recommendations against this product's evidence,
  privacy, safety, and simplicity constraints before implementing them.
- Readiness means no known P0 core-flow blocker, no unresolved P1 affecting
  safety, truth, privacy, durability, accessibility, or repeated confusion, no
  repeated P1 root cause across personas, and every remaining P2 explicitly
  triaged. Independent product, design, safety, and persona reviewers must
  converge on readiness; material dissent is investigated and resolved rather
  than averaged away. Private-resume wording, live-source relevance,
  authenticated employer behavior, and personal accessibility still require
  user-controlled review.
- Do not repeatedly run thousand-row suites, full lint, full typecheck, builds,
  or broad test matrices while iterating. Prefer inspection, live use, and one
  narrow regression for a confirmed defect. Batch heavy validation once after a
  coherent fix wave, run it serially on a quiet host, then build and launch only
  one Electron session at a time. Sparse validation must reduce host load, not
  stop implementation, read-only review, or product progress.

### Orchestration Contract

- The parent agent is the product owner and coordinator: retain the whole-product
  goal, define precise assignments, prevent conflicting ownership, evaluate
  reports critically, integrate findings, and personally verify alignment. Do
  not disappear into release machinery or narrow audits while the user journey
  remains unproven. Delegate substantive implementation by default; the parent
  handles direct edits only when they are small integration work, an urgent
  unblocker, or necessary to reconcile worker output safely.
- Delegate substantive research, implementation, design review, QA, and persona
  use to many independent subagents when scopes can safely run in parallel. All
  subagents run in the background unless the user explicitly changes that rule,
  so coordination and integration continue while reports return automatically.
  Every assignment carries the relevant north-star journey and shared cross-page
  context, not only a page-local symptom.
- Put the host-load budget in every worker's original assignment. Unless a brief
  explicitly requests one narrow check, the worker does not run lint, typecheck,
  validation, builds, broad tests, Electron, browser automation, or thousand-row
  suites. Prevent retries through the assignment itself rather than repeatedly
  stopping commands after they launch.
- Muse Spark 1.2 Contributor at xhigh reasoning is the default worker for
  general, exploration, implementation, review, and QA assignments. Do not
  configure, select, or retry removed worker models. Use DeepSeek sparingly when
  an important complex decision benefits from a genuinely independent second or
  third opinion, especially a vision review. When sensitivity justifies it and
  budget is available, run the same brief through Muse and DeepSeek and reconcile
  their independent evidence instead of letting one model's framing anchor the
  other.
- More workers are useful only when assignments are independent and precise.
  Parallelize read-only scouting, product roles, design critiques, research, and
  disjoint file ownership; large background waves are encouraged when those
  conditions hold. Prefer short rolling waves for implementation, backfilling a
  safe slot as soon as a worker finishes instead of waiting for an entire wave.
  Centrally reconcile research and cross-page conventions before assigning
  fixers so parallel work stays consistent. Serialize builds, Electron sessions,
  ATS runs, persona launches, and heavy host validation. Never let concurrency
  overwrite another worker's changes or starve timing-sensitive checks.
- Treat failed workers as recoverable until proven otherwise. A provider error
  does not invalidate completed repository work; inspect the shared tree and
  resume by session ID or relaunch the same scoped assignment. Large Ox waves may
  lose many workers to transient upstream errors; retry or relaunch the same
  precise brief before spending a scarce fallback model or pausing useful work.
- After connectivity loss, host sleep, an accidental stop, or a service restart,
  check background worker and live-app state before assuming that work continued
  or relaunching duplicate sessions.
- Express different reviewer roles, personalities, and goals in precise assignment
  briefs rather than proliferating permanent special-purpose agent definitions.
  Use identical briefs across models when an independent model comparison is the
  point of the exercise.
- Preserve the user's dirty worktree. Do not reset, clean, revert, stash, stage,
  delete, commit, or publish without explicit authorization. Never place secrets,
  personal resumes, credentials, or authenticated browser state in durable docs,
  fixtures, prompts, or evidence. The already tracked
  `docs/resume-tests/Ebrar.pdf` remains an explicit pending user privacy decision;
  do not copy it into new fixtures, prompts, or evidence while that decision is
  deferred.
- Keep moving from findings to fixes to fresh live replay. Acceptance sealing,
  exhaustive evidence, and release paperwork come after the product journey is
  simple and working, not instead of it.

### Anti-Drift Check

Before starting a new wave, ask:

1. Does this directly improve or verify Profile, discovery, shortlist/triage,
   resume quality/editing, application preparation or submission, tracking, or a
   necessary safety/recovery boundary?
2. Is live product use blocked by this work, or are we polishing acceptance
   machinery while an obvious user-flow issue remains?
3. Can independent background workers do it safely while the coordinator keeps
   the end-to-end journey moving?
4. Can a narrow check answer the question now, with heavy validation deferred to
   the integration boundary?

If work does not advance the journey or a necessary release boundary, defer it.

## Product Shape

- `Job Finder`: profile, resume import, discovery, source-debug, resume workspace,
  applications, and apply flows governed by the user's selected authority mode.
- `Interview Helper`: target-context setup, rehearsal, transcript-aware live cues, protected overlays, retention, and post-session review.
- Shared platform: local profile, document memory, application history, browser runtime, AI provider roles, desktop shell, tray, hotkeys, and settings.

## Durable Priorities

- Local-first persistence is the source of truth.
- Workflows are UI-first with agent acceleration, not chat-only.
- Browser-driven job workflows are a first-class product surface.
- Typed contracts and package boundaries matter more than convenient imports.
- Shared data should be reused instead of rebuilt per workflow.
- External writes and submissions occur only inside an explicit, inspectable,
  revocable user authority envelope.
- Interview capture and overlays must stay explicit, visible, adapter-owned, and auditable.

## Delivery Shape

- Foundations and Job Finder baseline are landed.
- Interview Helper first integrated desktop workflow is landed.
- Quality, truth, and recovery outrank maximum speed: an honest blocker or a
  truthful failure report beats a fast unverifiable claim, and fixes land only
  after root-cause review.
- Production readiness requires fresh source-bound immutable acceptance
  evidence plus independent blind usability evidence for the exact released
  build. User-controlled gates — private resume quality, configured
  provider/network transport, authenticated application sites,
  packaging/signing, and personal accessibility — remain separate deployment
  reviews and are never established by synthetic evidence.
- Future work should be concrete hardening, target-platform validation, source-generic discovery improvements, authorized capture-protection extensions, or specific regressions.
