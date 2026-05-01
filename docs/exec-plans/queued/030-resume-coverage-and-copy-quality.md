# 030 Resume Coverage And Copy Quality

Status: ready

## Goal

Make generated resumes show the right amount of work history and improve role-specific copy before full application-process testing.

This plan uses the domain language in `CONTEXT.md` and records the key product tradeoff in `docs/adr/0001-resume-coverage-and-apply-safe-template-catalog.md`.

## Constraints

- preserve typed boundaries across `@unemployed/contracts`, `@unemployed/job-finder`, `@unemployed/ai-providers`, and desktop main/preload/renderer
- keep exported resumes normal ATS-safe documents; app-only review guidance must never render into exported resume content
- keep reverse chronological work-history order for included roles; do not reorder exported experience by fit score
- persist only user include/hide decisions through existing draft state; do not add a permanent relevance flag to profile records
- keep live submit disabled unless explicitly re-authorized

## Implementation Plan

### Resume Coverage Policy

- Add a derived resume coverage classifier for profile work-history records using career-family fit, gap coverage, and `searchPreferences.tailoringMode`.
- Classify records as detailed, compact, suggested-hidden, or omitted:
  - detailed: current/recent strong dev or dev-adjacent roles
  - compact: older strong-fit roles, strong rewrite weak-fit roles, and gap-coverage roles
  - suggested-hidden: weak-fit records surfaced in Resume Studio with app-only review guidance
  - omitted: clearly unrelated records with no technical evidence and no meaningful gap-coverage value
- Treat a meaningful work-history gap as 6+ months between included roles.
- Apply tailoring style defaults:
  - `conservative`: hide weak-fit records unless needed for a meaningful gap
  - `balanced`: suggest weak-fit records in Resume Studio, hidden from export until accepted
  - `aggressive`: allow grounded weak-fit or gap-coverage records to be compactly included by default

### Copy Quality

- Replace the current deterministic first-3-experience cap with coverage-policy selection across the profile work history.
- Generate richer copy for detailed roles and compact truthful copy for older or weak-fit roles.
- Preserve `profileRecordId` through deterministic and AI-assisted draft paths so generated entries map back to profile records.
- Strengthen role-specific bullet generation:
  - avoid repeated phrasing across entries
  - enrich only with proof-bank metrics or supporting context that matches the specific role
  - do not turn unrelated roles into dev roles unless the stored profile record contains explicit technical evidence
- Update AI draft prompts and normalization so model output cannot silently drop fallback dev/dev-adjacent entries.

### Resume Studio Guidance

- Surface derived work-history review suggestions beside affected experience entries in Resume Studio.
- Use app-only guidance such as weak relation, gap coverage, or compact recommended; do not write these labels into resume sections or exports.
- Provide clear include/hide controls using existing draft patch/include behavior.
- When user-included weak-fit entries cause page overflow, keep the user decision and show page-length guidance recommending compacting or hiding weak-fit entries.

### Real Fixture Quality Coverage

- Extend resume-quality benchmarking beyond synthetic profiles by bridging the current real resume fixture corpus from `docs/resume-tests/` into quality-generation cases:
  - `Aaron Murphy Resume.pdf`
  - `Ebrar.pdf`
  - `Ebrar new.pdf`
  - `Paul Asselin CV.pdf`
  - `Ryan Holstien Resume.pdf`
- Keep both Ebrar fixtures because they have meaningfully different internal formats.
- Pair imported fixture profiles with representative target jobs so coverage policy and copy behavior are exercised across realistic scenarios.
- Produce benchmark outputs that the template-variety plan can reuse as realistic long-history and mixed-history draft evidence.

## Test Plan

- `packages/ai-providers`:
  - deterministic generation includes dev/dev-adjacent history beyond the old first-3 cap
  - weak-fit and gap-coverage behavior follows tailoring mode
  - role-specific bullets avoid duplicated phrasing and unsupported technical reframing
  - AI normalization preserves fallback `profileRecordId` coverage
- `packages/job-finder`:
  - resume draft sections preserve include/hide decisions through existing patch behavior
  - validation keeps app-only guidance out of exported preview sections/content text
  - page overflow warnings preserve user-included weak-fit records
- `apps/desktop`:
  - Resume Studio shows review guidance only in app UI
- Benchmarks and harnesses:
  - `pnpm validate:package ai-providers`
  - `pnpm validate:package job-finder`
  - `pnpm validate:package desktop`
  - `pnpm --filter @unemployed/desktop benchmark:resume-import`
  - `pnpm --filter @unemployed/desktop benchmark:resume-quality`
  - `pnpm --filter @unemployed/desktop ui:resume-workspace`
  - `pnpm validate:docs-only`

## Done When

- Dev and dev-adjacent history is no longer silently dropped by the old first-3 cap.
- Weak-fit and gap-coverage records are reviewable in Resume Studio with app-only guidance.
- Tailoring mode affects weak-fit defaults without allowing invented facts.
- Real resume fixtures and synthetic archetypes both participate in resume-quality evidence.
- The template-variety plan has realistic generated draft artifacts to design and benchmark against.
