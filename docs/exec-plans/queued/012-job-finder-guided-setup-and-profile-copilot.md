# 012 Job Finder Guided Setup And Profile Copilot

Status: ready

This plan is the implementation-grade follow-on for turning `Job Finder` onboarding into a guided setup instead of dropping new users into the full `Profile` editor immediately. It also defines the first bounded `Profile Copilot` slice: a side assistant that can explain profile gaps, recommend improvements, and apply typed profile edits with visible history.

## Goal

Turn the current broad `Profile` experience into two connected product surfaces that write to the same underlying data:

1. a guided first-run setup flow that collects and reviews the most important profile data in stages
2. a side `Profile Copilot` that can explain, recommend, and apply typed profile changes inside setup and later profile editing

The target is not a chat-only workflow. The target is a UI-first setup flow with a narrow, trustworthy assistant layered on top.

## Delivery Standard For Implementing Agents

This plan is not complete when the route exists, a chat box renders, or contracts compile.

Required implementation bar:

- finish the feature to a product-demo standard, not a placeholder wizard standard
- keep setup data writing directly into the real `CandidateProfile`, `JobSearchPreferences`, and any new `011` shared domains instead of a temporary wizard-only model
- leave assistant edits inspectable, reversible, and schema-validated instead of routing them through freeform hidden rewrites
- reuse proven patterns from the resume workspace where they fit, especially persisted messages, typed patch application, revision safety, and dirty-state handling
- leave behind seeded UI capture or harness coverage that proves import, low-confidence review, guided completion, assistant edits, and readiness review end-to-end
- update docs and workflow notes in the same task so later agents can continue from repo state instead of chat history

In plain terms: another agent should be able to read this plan, run the documented harness, and watch a full guided-setup plus copilot demo without reconstructing missing decisions from scratch.

## Current Starting Point And Why The Original Note Was Too Thin

The earlier version of this plan captured the right direction, but it was still missing the implementation shape needed for a later agent to execute it cleanly.

Current repo reality:

- `apps/desktop/src/renderer/src/features/job-finder/screens/profile-screen.tsx` already ships a capable but broad `Profile` editor with four tabs: `Basics`, `Experience`, `Background`, and `Preferences`.
- `apps/desktop/src/renderer/src/features/job-finder/components/profile/profile-resume-panel.tsx` already treats resume import plus resume analysis as the top accelerator for profile setup, but the follow-on review path still assumes the user will navigate the entire editor manually.
- `packages/job-finder/src/internal/workspace-snapshot-profile-methods.ts` currently runs `analyzeProfileFromResume()` by writing merged extraction output straight into `profile` and `searchPreferences`, with only coarse `analysisWarnings` left behind.
- `packages/contracts/src/profile.ts` and `packages/contracts/src/workspace.ts` do not yet model first-run setup state, extraction-review items, profile copilot messages, or typed profile patch groups.
- the repo already has a good pattern for assistant-driven typed edits in the resume workspace through `ResumeDraftPatch`, `ResumeAssistantMessage`, revision history, and explicit apply paths.

The missing details that needed to be added here were:

- exact route and shell behavior for first-run setup
- migration rules for existing non-empty workspaces
- the low-confidence review artifact model
- a bounded typed patch contract for profile copilot edits
- package ownership and sequencing across `contracts`, `db`, `job-finder`, `desktop`, and `ai-providers`
- QA evidence requirements similar to the completed `007` resume workspace plan

## User Direction This Plan Must Preserve

The user explicitly wants:

- a guided first setup
- then a chat on the side
- the chat should be able to recommend improvements
- the user should be able to talk with the chat and have the chat edit things for them

Implementation rule:

- the side chat should issue typed profile edits or grouped change proposals, not hidden freeform rewrites with no traceability

## Why This Work Exists

The current profile model is already stronger than a plain resume blob, but the product experience still has four important gaps:

1. new users still land in a broad editor instead of a focused first-run flow
2. resume analysis does not leave behind a structured review queue for low-confidence or missing high-priority fields
3. the app still under-collects narrative, proof-bank, answer-bank, and targeting detail that later `013`, `014`, and `015` work will depend on
4. the only current assistant-edit pattern lives in the resume workspace instead of the profile surface where the underlying facts should be improved first

## Dependency Contract With Plan 011

`012` is the consumer-facing collection and editing plan for the richer shared domains introduced by `011`.

Required dependency rules:

- do not invent temporary setup-only JSON blobs for narrative, proof-bank, answer-bank, blocker, or richer targeting data that `011` is supposed to make durable
- if `011` has not fully landed yet, `012` may start with route, setup-state, and low-confidence review infrastructure first, but the final capture steps for those richer domains should write into the real `011` contract roots before the feature is considered complete
- `013`, `014`, and `015` should be able to consume the data collected here without a second schema reshape

In plain terms: `011` creates the durable storage roots, and `012` is where users actually fill them in, review them, and improve them.

## Locked Product Decisions

- Setup gets its own hidden child route under `Profile`, not a new top-level nav destination in the first version.
- The recommended first route shape is `/job-finder/profile/setup`.
- `Profile` remains the long-term power-editor surface after setup. The app should not fork into separate setup-only and profile-only data models.
- Guided setup writes directly into the same persisted profile and search-preference roots the rest of the product already uses.
- Existing users with materially complete profiles should not be forced through the new setup route as if they were fresh installs.
- Resume import remains the first accelerator, not the entire setup.
- Low-confidence review should be item-based and targeted, not a giant replay of every extracted field.
- Candidate facts remain user-owned and grounded. The assistant may organize, summarize, normalize, and suggest missing details, but it must not invent candidate history.
- The assistant should use a narrow profile-edit contract, not a generic global agent with unrestricted tool calling in the first slice.
- Assistant changes must stay inspectable and reversible.
- Large or multi-section assistant changes should fall back to explicit review before apply.
- The setup should collect not only resume facts, but also targeting, narrative, proof, and reusable application-answer defaults that later workflows depend on.
- Do not store passwords or equivalent secrets inside this setup or copilot flow.

## Product Outcome

When this plan lands, a first-time user should be able to:

1. open `Job Finder` and land in guided setup instead of a giant profile form
2. import a resume and review the specific low-confidence or missing high-priority fields that need attention
3. fill in missing non-resume context through focused setup steps
4. capture the narrative, proof-bank, and answer-bank data that later resume and apply workflows need
5. keep a side `Profile Copilot` open that explains gaps, recommends improvements, and can apply typed profile changes
6. finish setup with a readiness summary that is honest about discovery, resume, and apply quality implications
7. move into the normal `Profile` editor afterward without losing any setup context or history

## Scope

### In Scope

- first-run guided setup route for `Job Finder`
- persisted setup state and resume-safe migration of existing workspaces
- low-confidence review of imported or extracted profile fields
- capture of narrative, proof-bank, targeting, and application-default data introduced by `011`
- side `Profile Copilot` chat inside guided setup and later profile editing
- typed assistant edit operations or grouped patch proposals for profile mutations
- lightweight undo or recent-history support for assistant-driven profile edits
- final readiness review with downstream impact framing for discovery, resume quality, and apply readiness

### Out Of Scope

- a fully general global assistant rewrite in the same slice
- cloud account onboarding or sync
- replacing the main profile editor entirely
- silent assistant mutations with no visible change tracking
- automatic job apply behavior from the setup chat
- storing site credentials or passwords for later submission

## Route And Shell Recommendation

The current shell already treats anything outside other named routes as inside the `Profile` context, so the lowest-churn first route is:

- `/job-finder/profile/setup`

Recommended behavior:

- brand-new workspaces should auto-open `/job-finder/profile/setup` instead of the full profile editor
- the shell should keep the `Profile` nav item highlighted while setup is open
- completing setup should return the user to `/job-finder/profile`
- leaving setup early is allowed, but unfinished setup state should remain visible and resumable from the regular `Profile` screen
- reset-workspace behavior should naturally land back in setup through the same incomplete-profile redirect logic

Implementation rules:

- treat setup as a focused child experience of `Profile`, similar to how `Resume Workspace` is a focused child experience of `Shortlisted`
- do not create a second independent form model for setup; reuse the same editor helpers and schema roots where practical
- redirect invalid setup resumes back to `/job-finder/profile` with a clear non-blocking status message

## Migration And Existing-User Rules

The repo already has non-empty saved workspaces. The rollout must avoid turning setup into a regression for those users.

Required migration rules:

- fresh-start workspaces from `createEmptyJobFinderRepositoryState()` should initialize setup as `not_started`
- existing workspaces with a materially complete profile should initialize as `completed`
- existing workspaces with real data but obvious gaps should initialize as `in_progress` with a resumable setup banner instead of a forced blocking redirect
- the migration should use readiness heuristics, not only magic IDs or placeholder strings, although the seeded fresh-start defaults can still be treated as a strong signal
- do not clear or rewrite existing profile data during migration just to fit setup state

Recommended readiness heuristic for migration:

- core identity present: name, headline, location, years of experience
- contact path present: email or phone
- at least one meaningful experience or project entry
- at least one target role or job family
- basic work-eligibility or location preference data present

## Setup State And Review Artifact Model

The first missing layer is explicit setup state. The current snapshot only exposes raw `profile` and `searchPreferences`, which is not enough to drive first-run route behavior, resumability, or targeted review.

### Recommended Contract Shapes

Add these before widening the feature behavior:

#### `ProfileSetupStepSchema`

```ts
z.enum([
  "import",
  "essentials",
  "background",
  "targeting",
  "narrative",
  "answers",
  "ready_check",
])
```

#### `ProfileSetupStatusSchema`

```ts
z.enum(["not_started", "in_progress", "completed"])
```

#### `ProfileReviewItemStatusSchema`

```ts
z.enum(["pending", "confirmed", "edited", "dismissed"])
```

#### `ProfileReviewItemSeveritySchema`

```ts
z.enum(["critical", "recommended", "optional"])
```

#### `ProfileReviewTargetSchema`

```ts
z.object({
  domain: z.enum([
    "identity",
    "work_eligibility",
    "professional_summary",
    "search_preferences",
    "experience",
    "education",
    "certification",
    "project",
    "link",
    "language",
    "narrative",
    "proof_point",
    "answer_bank",
  ]),
  key: NonEmptyStringSchema,
  recordId: NonEmptyStringSchema.nullable().default(null),
})
```

#### `ProfileReviewItemSchema`

```ts
z.object({
  id: NonEmptyStringSchema,
  step: ProfileSetupStepSchema,
  target: ProfileReviewTargetSchema,
  label: NonEmptyStringSchema,
  reason: NonEmptyStringSchema,
  severity: ProfileReviewItemSeveritySchema,
  status: ProfileReviewItemStatusSchema,
  proposedValue: NonEmptyStringSchema.nullable().default(null),
  sourceSnippet: NonEmptyStringSchema.nullable().default(null),
  createdAt: IsoDateTimeSchema,
  resolvedAt: IsoDateTimeSchema.nullable().default(null),
})
```

#### `ProfileSetupStateSchema`

```ts
z.object({
  status: ProfileSetupStatusSchema,
  currentStep: ProfileSetupStepSchema,
  completedAt: IsoDateTimeSchema.nullable().default(null),
  reviewItems: z.array(ProfileReviewItemSchema).default([]),
  lastResumedAt: IsoDateTimeSchema.nullable().default(null),
})
```

Storage recommendation:

- persist `profileSetupState` as workflow state alongside other repo-level workflow roots in `packages/contracts/src/workspace.ts`
- keep extracted low-confidence review items inside setup state instead of bloating `CandidateProfile` with transient workflow metadata
- continue using `profile.baseResume.analysisWarnings` for coarse import-level warnings, but stop treating it as the only review mechanism

## Guided Setup Flow Recommendation

The setup should be opinionated, staged, and focused on what unlocks downstream value fastest.

### Step 1: `Import`

- import the resume and supporting text as the opening accelerator
- surface extraction status, provider label, and import warnings clearly
- if resume text exists, allow `Refresh from resume` directly inside setup
- seed review items for low-confidence or missing high-priority fields immediately after extraction

Exit rule:

- the user has imported a resume or explicitly chooses to continue with manual entry

### Step 2: `Essentials`

- review and confirm identity, contact, headline, location, and years of experience
- focus on fields that power search, resume exports, and application forms most directly
- prioritize pending review items here before exposing the rest of the profile surface

Exit rule:

- core identity plus at least one contact path are present, and critical review items in this step are resolved or deliberately dismissed

### Step 3: `Background`

- review structured experience first
- then cover education, certifications, projects, links, and languages only where they add downstream value
- keep the UI focused on the strongest records rather than exposing every optional detail up front

Exit rule:

- the profile has at least one meaningful experience or project path, and the main high-impact record gaps are resolved

### Step 4: `Targeting`

- collect target roles, job families, locations, work modes, industries, company preferences, salary direction, and work-eligibility inputs
- keep discovery sources separate from core targeting so the user understands the difference between `what I want` and `where to search`

Exit rule:

- discovery and resume tailoring have enough targeting context to avoid generic outputs

### Step 5: `Narrative`

- collect the candidate narrative and proof-bank data introduced by `011`
- focus on short value proposition, career direction, differentiators, and strongest measurable examples first
- support pasting freeform notes and having the copilot propose structured proof or narrative entries

Exit rule:

- the app has enough story and evidence to strengthen later resume summaries and proof selection

### Step 6: `Answers`

- collect reusable application defaults from the `011` answer-bank domain
- prioritize high-frequency screeners such as work authorization, sponsorship, relocation, travel, notice period, availability, salary, short bio, and concise why-you-are-looking or why-you-left explanations when the user wants to predefine them
- keep sensitive but non-secret fields explicit and reviewable

Exit rule:

- the app has a baseline answer bank for common screeners instead of recreating them later job by job

### Step 7: `Ready check`

- summarize what is ready, what still needs review, and what remains missing
- group the consequences by downstream workflow: discovery quality, resume quality, and apply readiness
- allow the user to finish setup with non-critical gaps, but be honest about the tradeoffs

Exit rule:

- setup status becomes `completed`, the final readiness summary is recorded for the session, and the user is sent to the normal `Profile` route

## Low-Confidence Review Behavior

The current flow only leaves generic `analysisWarnings`. That is not enough for a guided experience.

Required review behavior:

- review items should be created only for low-confidence extracted values and for high-priority missing fields, not every optional blank field in the schema
- each review item should explain what needs attention, why it matters, and when possible which resume snippet triggered the suggestion
- each review item should support `confirm`, `edit`, `dismiss for now`, and `clear value` style outcomes
- editing the target field should resolve the item as `edited`
- unresolved `critical` and `recommended` items should reappear in the final ready check
- once a field is confirmed or edited, the same extraction run should not keep nagging the user unless a later refresh changes the suggestion materially

Implementation note:

- the first version does not need full per-field trust metadata across the entire profile model; a persisted review-item queue is enough if it stays honest and resumable

## Readiness Review And Completion Rules

The final setup step should not be a generic progress bar. It should be a truthful downstream readiness check.

Recommended readiness categories:

- `Discovery`: roles, locations, work mode, company preferences, and enough structured background to assess fit
- `Resume quality`: narrative, proof-bank, measurable achievements, strong experience records, and key links
- `Apply readiness`: contact details, work authorization, availability, compensation defaults, and canonical screener answers

Recommended status values:

- `ready`
- `needs_review`
- `missing`

Implementation rule:

- this summary should be derived from real profile and search-preference state plus unresolved review items, not maintained as an editable parallel checklist

## Profile Copilot Product Model

The `Profile Copilot` should be the narrow assistant layer that helps users improve structured profile data faster without bypassing product trust rules.

### Entry Points

- a side rail inside `/job-finder/profile/setup`
- the same or closely related side rail inside the normal `/job-finder/profile` surface after setup is complete

### What The Copilot Should Be Able To Do

- explain why a field matters to search, resumes, or applications
- recommend better wording for summaries, differentiators, proof text, or short screener answers
- spot missing or weak data based on the active setup step or the current profile section
- turn pasted freeform text into structured profile edits
- propose multiple linked edits when the user asks for a broader cleanup
- fill answer-bank, narrative, and proof-bank entries using user-provided text

### What The Copilot Should Not Do In This Slice

- invent candidate experience, credentials, dates, or metrics
- browse the web or perform unrelated general assistant behavior from the setup panel
- silently rewrite the profile without leaving typed changes and a recent-history trail
- become the only editing path for the profile surface

## Typed Copilot Patch Model

This plan should reuse the lesson from resume workspace: patch-based assistant edits are safer than opaque rewrites.

### Required Contract Direction

Add a profile-side equivalent of resume assistant messages and patch groups.

#### `ProfileCopilotMessageSchema`

```ts
z.object({
  id: NonEmptyStringSchema,
  role: z.enum(["user", "assistant"]),
  content: NonEmptyStringSchema,
  patchGroups: z.array(ProfileCopilotPatchGroupSchema).default([]),
  createdAt: IsoDateTimeSchema,
})
```

#### `ProfileCopilotPatchGroupSchema`

```ts
z.object({
  id: NonEmptyStringSchema,
  summary: NonEmptyStringSchema,
  applyMode: z.enum(["applied", "needs_review", "rejected"]),
  operations: z.array(ProfileCopilotPatchOperationSchema).min(1),
  createdAt: IsoDateTimeSchema,
})
```

Expected starting operation families:

- replace scalar or grouped fields in `identity`
- replace grouped fields in `work_eligibility`
- replace grouped fields in `professional_summary`
- replace grouped fields in `search_preferences`
- upsert or remove structured records such as `experience`, `education`, `certification`, `project`, `link`, and `language`
- upsert or remove `011` domains such as `narrative`, `proof_point`, and `answer_bank` entries
- resolve setup review items that the patch makes obsolete

Implementation rules for the first patch model:

- keep the operation set explicit and bounded instead of introducing generic untyped JSON patch strings
- validate every assistant patch group against shared contracts before apply
- if a patch group spans many sections or includes destructive removals, mark it `needs_review` instead of auto-applying it
- immediately persisted assistant-applied changes must still show in a visible recent-change list with one-click undo or revert-to-previous-state behavior

## Assistant Apply And Undo Behavior

The product promise here is that the assistant can edit things for the user without becoming untrustworthy.

Recommended first-version behavior:

- narrow, low-risk patch groups can apply immediately after the user asks, as long as they parse cleanly and stay within supported operations
- broad multi-section edits, record removals, or ambiguous field creation should present an explicit `Review changes` state first
- every applied patch group should create a lightweight profile revision or reversible snapshot similar to the resume workspace revision model
- the UI should always show what changed most recently and provide a straightforward undo path

## AI Provider Boundary

The provider layer should stay narrow and explicit, matching repo guidance.

Recommended addition in `packages/ai-providers`:

- add a focused method such as `reviseCandidateProfile(input)` or similarly named profile-copilot method that returns `ProfileCopilotMessage` plus typed patch groups

Do not make the first version depend on:

- an unrestricted generic chat tool runtime
- open-ended workflow orchestration in the provider layer
- hidden provider-side mutation logic that bypasses shared contracts

Required context passed to the provider should include:

- current profile and search preferences
- active setup step or active profile section
- unresolved review items relevant to that step
- the new `011` narrative, proof, and answer-bank data when present
- the exact user request

## Ownership Split

- `packages/contracts`: setup-state contracts, review-item contracts, copilot message and patch contracts, and workspace snapshot updates
- `packages/db`: persistence and migration for setup state, copilot messages, and profile revisions or equivalent undo data
- `packages/job-finder`: orchestration for first-run detection, readiness derivation, extraction review-item generation, patch validation and application, undo, and setup completion behavior
- `packages/ai-providers`: narrow profile-copilot provider method and deterministic fallback behavior
- `apps/desktop`: new setup route, focused step UI, side-rail copilot UI, readiness review surface, migration banners, and seeded UI harnesses

## Workstreams

### 1. Contracts And Persistence

- add `profileSetupState` and related review or copilot contracts
- persist setup state, messages, and lightweight profile revision history
- expose the new state in workspace snapshots without bloating unrelated routes

### 2. Extraction Review Infrastructure

- expand the resume-analysis flow so it leaves behind review items instead of only broad warnings
- keep review-item generation deterministic enough that tests stay stable
- merge later resume refreshes without duplicating already-resolved review items unnecessarily

### 3. Guided Setup Route And UI

- add the setup route and redirect behavior
- build focused step surfaces that reuse existing editor helpers where practical
- keep the standard `Profile` editor as the post-setup power-edit surface

### 4. Readiness And Migration

- derive completion and readiness honestly from real data
- seed setup status correctly for fresh, partially filled, and materially complete existing workspaces
- keep existing users from being hard-blocked if the migration deems them `in_progress`

### 5. Profile Copilot Contracts And UX

- add the side chat surface in setup and standard profile contexts
- implement typed patch groups, apply or review behavior, and undo
- keep copilot actions bounded to profile improvement instead of broader workflow automation

### 6. QA And Demo Evidence

- extend current capture coverage beyond `ui:resume-import` and `ui:profile-baseline`
- leave behind a seeded guided-setup capture that proves import, review, copilot edit, and ready-check behavior end-to-end

## Recommended Implementation Sequence

The lowest-risk landing order is:

1. land contracts, persistence, migration defaults, and snapshot exposure for setup state and review items
2. add first-run route behavior and guided setup shell without the copilot first
3. wire low-confidence review items into the import and resume-refresh flow
4. connect setup steps to the `011` narrative, proof, and answer-bank domains
5. add profile copilot messages, typed patch groups, apply or review behavior, and undo
6. finish the ready-check surface, migration banners, and seeded QA harnesses

Implementation rule:

- do not build the copilot against temporary UI-only state and then retrofit it later onto durable contracts

## Milestones

### Milestone 1: Setup state, migration, and route skeleton

- the app can distinguish fresh, in-progress, and completed profile setup states
- fresh workspaces land in guided setup
- existing users are migrated safely without losing or rewriting profile data

### Milestone 2: Guided capture and low-confidence review

- resume import plus analysis produces targeted review items
- the setup flow can collect and save the high-value profile, targeting, and `011` shared-data inputs
- the user can finish setup with an honest readiness summary

### Milestone 3: Profile copilot with typed edits

- the side assistant can recommend and apply typed profile changes
- assistant changes are visible, reversible, and validated before crossing the schema boundary

### Milestone 4: QA evidence and handoff quality

- seeded UI capture proves the end-to-end flow
- docs and harnesses make the new onboarding path repeatable for later agents

## Verification Expectations

Implementation work for this plan should be validated with at least:

- `pnpm --filter @unemployed/contracts test`
- `pnpm --filter @unemployed/db test`
- `pnpm --filter @unemployed/job-finder test`
- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop ui:resume-import`
- `pnpm --filter @unemployed/desktop ui:profile-baseline`
- `pnpm --filter @unemployed/desktop ui:profile-setup`
- `pnpm docs:check`

Additional completion rules:

- leave behind a seeded setup demo that proves import, targeted review, guided completion, side-copilot edits, and post-setup readiness review
- capture at least one migration-style demo that starts from an older partially complete workspace and shows the resumable setup behavior without data loss

## Notes For Follow-On Planning

- Decide whether field-confirmation state should stay review-item-based or eventually graduate into broader per-field trust metadata.
- Decide whether the eventual shared global assistant should reuse the same profile patch-group model directly or call into higher-level actions built here.
- Decide whether deep-linking individual setup steps needs URL-level step params later, or whether persisted current-step state is enough.
- Decide whether the post-setup `Profile` screen should eventually embed the same readiness summary inline or keep it setup-only.
