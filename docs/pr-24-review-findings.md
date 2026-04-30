# PR 24 Review Findings

Scope reviewed: `origin/main...HEAD` on `feat/job-finder-ux-and-resume-quality` / PR #24.

## Findings

### High: equivalent re-imports can overwrite richer stored experience and education records

- File: `packages/job-finder/src/internal/profile-merge.ts:232-272`, `packages/job-finder/src/internal/profile-merge.ts:300-332`
- Scenario: a user already has a reviewed or hand-edited experience/education entry with richer fields, then re-imports the resume and the new extraction matches the same record through the new equivalence logic (`Aug 2024` vs `2024-08`, current vs empty end date, etc.) but carries fewer details.
- Issue: once `mergeExperienceRecords` or `mergeEducationRecords` finds a match, it always builds `nextEntry` only from the new extraction and replaces the existing record with `merged.splice(...)`. The broader matching added in this PR means more non-exact matches now take this destructive replacement path.
- Impact: later imports can silently erase previously stored summaries, achievements, work mode, field of study, and other richer data even when the new extraction is strictly worse. This is profile data loss in a core resume-import flow.
- Suggested fix: when a fuzzy/equivalent match is found, merge field-by-field or keep the more complete value for each field instead of unconditionally replacing the stored record.

### High: first identity edit can remove inherited contact details from preview and export

- File: `apps/desktop/src/renderer/src/features/job-finder/screens/review-queue/resume-identity-editor.tsx:29-46`
- Scenario: a draft still inherits its header from the profile (`draft.identity === null`), and the user edits only one field such as `Full name` or `Headline` in Resume Studio.
- Issue: the editor seeds a new identity object with every field set to `null`, then applies only the changed field. Once that object is stored on the draft, downstream rendering stops inheriting untouched contact values from the profile and treats them as explicitly cleared.
- Impact: editing a single identity field can silently remove email, phone, and links from the live preview and exported PDF even though the user never cleared them.
- Suggested fix: initialize the editor from the effective current identity values, not an all-null object, so untouched fields preserve profile-backed defaults.

### High: experience dedupe can collapse distinct jobs when one side is missing company or location

- File: `packages/job-finder/src/internal/resume-record-identity.ts:141-150`
- Scenario: one parsed experience record contains a common title and start date but omits company or location, while another real job shares that same title and start date.
- Issue: `fieldsCompatible` treats empty company/location values as compatible, and `locationCompatible` is then used as positive evidence in `areEquivalentExperienceRecords`. That makes records match even when the only true shared signals are title and start date.
- Impact: unrelated jobs can be merged together during review-candidate dedupe or profile merge, causing one employer's work history to disappear or inherit the other record's details.
- Suggested fix: do not let blank company/location values count as confirming evidence; require an additional non-empty matching identity signal before treating two experience records as equivalent.

### Medium: year-only dates are dropped from deterministic resume drafts

- File: `packages/ai-providers/src/deterministic/tailoring.ts:103`
- Scenario: a stored profile uses valid year-only dates such as certification `issueDate: "2024"`, education `endDate: "2018"`, or experience dates imported from resumes without months.
- Issue: the new `formatMonthYear` helper only returns a value for `YYYY-MM`, `M/YYYY`, named month + year, or `Present`. For a plain four-digit year it returns `null`, so `formatDateRange` removes those dates from generated deterministic resume entries.
- Impact: deterministic resume generation silently omits credential, education, and experience years that were previously preserved by directly joining stored date strings. This makes resume output less truthful and can remove important recency/context from ATS-facing drafts.
- Suggested fix: treat `^\d{4}$` as a valid date and return the year unchanged, or fall back to the original trimmed value for unrecognized non-empty date strings instead of returning `null`.

### Medium: approved resume previews are always shown as stale

- File: `packages/job-finder/src/internal/workspace-application-resume-support.ts:242`
- Scenario: a user reopens a resume workspace after approving a saved PDF and has not made any unsaved edits.
- Issue: `previewResumeDraft` sets `nextStatus` to `"stale"` whenever the persisted draft has an approved export, then clears `approvedAt` and `approvedExportId` before validation. It does not compare the draft being previewed with the persisted approved draft, so even an unchanged approved resume receives the stale warning `"Unsaved changes differ from the last approved export..."`.
- Impact: the live preview contradicts the saved approval state and tells users a fresh export is needed when the approved draft may still be current. This weakens trust in the new preview-led review flow and can cause unnecessary re-export/re-approval work.
- Suggested fix: only mark the preview draft stale when the submitted draft differs from the persisted approved draft; unchanged approved drafts should retain an approved/clean preview state or skip the stale validation warning.

### Medium: ISO month dates are parsed as January when inferring years of experience

- File: `packages/ai-providers/src/deterministic/resume-parser.ts:56`, `packages/ai-providers/src/deterministic/resume-parser.ts:95-113`
- Scenario: the deterministic experience parser emits ISO month dates like `2024-12` and `2025-01`, and the resume text does not explicitly say `X years of experience`.
- Issue: `parseExperienceDateToken` matches those strings with `experienceDateTokenPattern`, but that pattern only has explicit support for month names and `M/YYYY`. For `YYYY-MM`, it captures only the year and falls through to `month: 0`, so `2024-12` is treated as January 2024.
- Impact: short spans can be inflated into 12+ months of coverage, which makes `inferYearsExperienceFromEntries` return `1` instead of `null` and can surface or auto-apply an incorrect years-of-experience value during resume import.
- Suggested fix: parse `YYYY-MM` explicitly before the generic pattern, or tighten the token parser so partial year matches cannot consume ISO month values.

### Medium: discovery sign-in CTA can target a disabled source

- File: `apps/desktop/src/renderer/src/features/job-finder/screens/discovery/discovery-filters-panel.tsx:118-155`, `apps/desktop/src/renderer/src/features/job-finder/screens/discovery/discovery-filters-panel.tsx:365-388`
- Scenario: one discovery target is disabled, another target is enabled, and the disabled target still has a persisted `sourceAccessPrompt`.
- Issue: the panel correctly derives runnable targets from `enabledTargets`, but `primarySourceAccessPrompt` is taken from `sourceAccessPrompts[0]` without filtering against enabled targets. The main warning card and bottom CTA can therefore point at a source that is not enabled for searches.
- Impact: Discovery can tell the user to sign into the wrong source and wire the primary button to that disabled target, even though `Search jobs` and `Run one source` will only operate on other enabled targets.
- Suggested fix: derive the primary prompt from enabled targets only, or suppress access prompts for disabled targets on the Discovery screen.

### Medium: targeted sign-in becomes a misleading no-op when the browser agent is disabled

- File: `apps/desktop/src/main/services/job-finder/create-workspace-service.ts:122-139`, `apps/desktop/src/renderer/src/pages/use-job-finder-page-controller-actions.ts:511-526`
- Scenario: the app is run with `UNEMPLOYED_BROWSER_AGENT=0`, a source access prompt asks the user to sign in, and the user clicks `Sign in to ...`.
- Issue: this branch exposes target-specific sign-in actions regardless of runtime capability, but that environment builds a seeded catalog runtime instead of a real browser-backed runtime. `openBrowserSession` still returns a successful snapshot and the renderer reports `Opened the browser for ...` even though no dedicated browser session is actually launched.
- Impact: the new source-aware sign-in CTA can promise a recovery action that the current runtime cannot perform, leaving the user unable to resolve the prompt while the UI reports success.
- Suggested fix: hide or disable target-specific sign-in when the browser agent runtime is unavailable, or make the action fail clearly instead of returning a success message.

## Verification Performed

- `pnpm validate:package desktop` passed.
- `pnpm validate:package job-finder` passed.
- `pnpm validate:package ai-providers` passed.
- `pnpm validate:package contracts` passed.
- `pnpm validate:package browser-runtime` passed.
- `pnpm validate:package db` passed.
- `git diff --check origin/main...HEAD` passed.
