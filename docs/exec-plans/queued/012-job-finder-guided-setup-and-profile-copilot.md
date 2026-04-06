# 012 Job Finder Guided Setup And Profile Copilot

Status: ready

This plan is a prepared follow-on starting plan. It captures a stronger onboarding direction for `Job Finder`: a guided first setup instead of a giant profile form first, followed by a side assistant that can recommend improvements and edit structured profile data for the user through typed changes.

## Goal

Turn the current profile import and editing experience into two connected product surfaces:

1. a guided first-time setup flow
2. a side `Profile Copilot` chat that can recommend improvements, answer questions, and edit profile data for the user

The target is not a chat-only product. The target is a UI-first setup flow with a chat assistant that accelerates completion and cleanup.

## User Direction This Plan Must Preserve

The user explicitly wants:

- a guided first setup
- then a chat on the side
- the chat should be able to recommend improvements
- the user should be able to talk with the chat and have the chat edit things for them

Implementation rule:

- the side chat should issue typed profile edits or grouped change proposals, not hidden freeform rewrites with no traceability

## Why This Work Exists

The current profile model is already stronger than a plain resume blob, but the current experience still has product gaps:

- resume import cannot capture many important non-resume facts
- the profile surface is broad and powerful but still feels like a large editor, not a guided setup
- later flows need reusable narrative, proof, preference, and screener-answer data that is not consistently collected today
- the user wants an assistant that can help improve the profile directly instead of only generating downstream outputs

## Locked Product Decisions

- The first-run experience should be guided and staged, not one long freeform settings page.
- Resume import remains the opening accelerator, not the whole setup.
- The assistant lives beside the setup or profile surface as a side chat, not as the only way to edit data.
- The assistant may recommend and apply structured edits, but those edits must remain inspectable and reversible.
- Candidate facts remain user-owned and grounded. The assistant may organize, summarize, normalize, or suggest missing fields; it must not invent facts.
- The setup should collect not only resume facts, but also discovery preferences, application answers, narrative, and proof points that later workflows depend on.

## Product Outcome

When this plan lands, a first-time user should be able to:

1. import a resume
2. review low-confidence extracted fields instead of re-reading the whole profile blindly
3. fill in missing non-resume context through a guided checklist
4. keep a side chat open that suggests improvements and can apply structured edits
5. finish setup with a profile that is genuinely useful for discovery, resume tailoring, and apply workflows

## Scope

### In Scope

- first-run guided setup flow for `Job Finder`
- low-confidence review of imported or extracted profile fields
- collection of narrative, proof-bank, preferences, and common application-answer data
- side `Profile Copilot` chat inside setup and later profile editing surfaces
- typed edit operations or structured patch groups for assistant-driven profile changes
- undo or revision-history support for assistant edits at least in a lightweight form

### Out Of Scope

- a fully general global assistant rewrite in the same slice
- cloud account onboarding or sync
- replacing the main profile editor entirely
- allowing the assistant to silently mutate the profile without visible change tracking

## Required Data Collection Expansions

### 1. Narrative Layer

Collect and persist:

- short value proposition
- longer career story or exit story
- top differentiators or superpowers
- role archetype framing cues

### 2. Proof Bank

Collect and persist:

- best proof points
- hero metrics
- case-study or demo links
- preferred project examples for different role families

### 3. Common Screener Answer Bank

Collect and persist canonical answers for:

- work authorization
- visa sponsorship
- relocation
- travel
- notice period
- available start date
- salary expectations
- preferred interview language
- short bio or self-introduction

### 4. Discovery And Targeting Preferences

Collect and persist:

- target role archetypes
- priority roles
- priority industries and company shapes
- blocked company types
- preferred geographies and timezone overlap
- on-site or travel tolerance

### 5. Account And Form-Reuse Metadata

Collect and persist safe non-secret metadata such as:

- preferred application email
- known site-account existence where the user confirms it
- preferred public links for job applications

Do not store passwords or equivalent secrets inside this profile surface.

## Product Flow Recommendation

### Guided First Setup Steps

1. `Import`
   - import resume and supporting documents
2. `Review extracted basics`
   - confirm name, location, contact, headline, experience length, links
3. `Fill missing background`
   - experience, education, projects, languages, certifications
4. `Define targeting`
   - roles, locations, work modes, company preferences, compensation
5. `Add narrative and proof`
   - short value proposition, exit story, proof bank, best links
6. `Add application defaults`
   - common screener answers and availability details
7. `Ready check`
   - identify missing fields that will hurt discovery or apply quality later

### Side Chat Behavior

The side assistant should be able to:

- explain why a field matters
- suggest stronger wording for profile summary and proof-point text
- spot missing or weak data
- turn a pasted paragraph into structured profile edits
- fill a target section from user-provided chat content
- propose multiple edits across the profile when requested

The side assistant should not:

- invent candidate history
- silently overwrite large parts of the profile with no visible review path

## Interaction Model For Assistant Edits

Preferred first implementation:

- the chat returns typed patch groups or field-level edits
- the app shows those edits as applied with clear visual feedback
- the user can undo or inspect recent assistant changes

Acceptable future extension:

- the user can choose between `apply automatically` for low-risk changes and `review before apply` for broad changes

## Workstreams

### 1. Setup Information Architecture

- design the step order for first-run setup
- define which fields are required, recommended, and optional
- identify which imported fields deserve low-confidence review treatment

### 2. Shared Data Expansion

- add any missing schemas for narrative, proof-bank, and answer-bank domains
- keep the setup output directly usable by discovery, resume, and apply workflows

### 3. Profile Copilot Contracts And UI

- define typed assistant edit payloads for profile mutations
- add the side chat surface in setup and profile editing contexts
- keep assistant edits inspectable and reversible

### 4. Readiness Review

- add a final setup review that calls out gaps likely to hurt downstream quality
- show what is missing for discovery, tailored resume quality, and future apply automation

## Milestones

### Milestone 1: Guided setup skeleton

- a new user can get from resume import to a structured, reviewed baseline profile

### Milestone 2: Narrative, proof, and answer-bank capture

- the app stores the non-resume facts later workflows need

### Milestone 3: Profile copilot edits

- the side chat can recommend and apply structured profile edits with visible history

## Verification Expectations

Implementation work for this plan should be validated with at least:

- `pnpm --filter @unemployed/contracts test`
- `pnpm --filter @unemployed/job-finder test`
- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop ui:resume-import`
- `pnpm --filter @unemployed/desktop ui:profile-baseline`
- `pnpm docs:check`

Additional completion rule:

- leave behind a repeatable seeded setup demo that proves import, guided completion, side-chat edits, and post-setup readiness review

## Notes For A Deeper Follow-On Plan

- Decide whether setup should live fully inside `Profile` first or get a distinct first-run route before profile editing takes over.
- Decide which assistant edits should apply immediately versus require explicit review first.
- Decide whether the eventual shared global assistant should reuse the same patch model or call into higher-level workflow actions built here.
