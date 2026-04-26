# 023 Job Finder World-Class Resume Generation Quality

Status: ready

## Goal

Take full ownership of resume generation quality and push it to a release-grade, production-safe baseline for real users.

The user-reported problem is concrete and severe: the generated resume is currently unusable, can place random job or company language in the wrong sections, and is not trustworthy as a high-quality ATS-friendly resume output. This plan treats that report as the new truth and assumes broad refactor or re-architecture is acceptable if that is what the product quality bar requires.

Primary user-facing bar:

1. Resume generation must be grounded, coherent, and safe for real applications.
2. Visible skills sections must never contain company names, employer research notes, job-only phrases, ATS vendor names, or other non-skill bleed.
3. Resume outputs must be world-class for at least `1` to `2` basic ATS-friendly templates.
4. The quality loop must be test-driven end to end: test input, generation, sanitization, validation, render output, and regression evidence.
5. This work should favor the best correct architecture, not preservation of weak existing code.

## User Direction

- fully own this feature like a senior engineer shipping to production
- do not be afraid to rewrite, refactor, or re-architect where needed
- do not stop at prompt tweaks or partial fixes; solve the system end to end
- create strong tests, inspect outputs, and keep improving the process iteratively
- aim for one of the best possible ATS-friendly resume baselines, not a barely acceptable output

## Scope

- resume draft generation quality in `packages/ai-providers`
- resume evidence collection, sanitation, validation, persistence, and workspace shaping in `packages/job-finder`
- ATS-friendly HTML and PDF template rendering in `apps/desktop`
- deterministic corpora, regression tests, renderer tests, and benchmark-style quality harnesses
- template activation and settings normalization for the shipped ATS-safe template set

## Non-Goals

- live-submit apply changes; keep existing authorization rules unchanged
- discovery/source-debug changes unless resume quality work directly requires a boundary-safe cleanup
- broad resume-import work except where imported profile quality is directly required to support grounded generation behavior

## Hard Constraints

1. `packages/job-finder` owns resume workflow orchestration.
2. `packages/ai-providers` owns provider and deterministic generation behavior; product logic should not leak into adapters unnecessarily.
3. `packages/contracts` remains the typed schema boundary for shared data.
4. Resume outputs must stay grounded in stored profile, resume, proof, and bounded job context.
5. Do not invent employers, dates, metrics, tools, credentials, or unsupported claims.
6. ATS-friendly templates must stay simple and highly parseable: no table-heavy or split-column output in the shipped ATS-safe baseline.
7. Keep validation deterministic and replayable.
8. Keep live submit disabled unless explicitly re-authorized.

## Current Defects To Eliminate

- job/company/research terms can appear in visible skills sections
- short job-description phrases evade current bleed detection
- deterministic summary logic can drift toward employer/company prose instead of candidate prose
- AI output normalization is structurally safe but not semantically grounded enough for visible skill sections and other high-risk fields
- current quality coverage is too thin to prevent regression in resume generation and rendered ATS output
- only one template is currently shipped and it is under-tested at the HTML/renderer level

## Research-Informed Product Bar

Use practical ATS guidance from reputable public sources such as Harvard career services templates/guides, Indeed ATS resume guidance, and Jobscan ATS optimization guidance as directional references for the shipped baseline.

That means:

- simple single-column structure
- standard headings such as `Summary`, `Experience`, `Skills`, `Education`, `Certifications`
- reverse-chronological experience presentation
- no tables, graphics, decorative columns, or parser-hostile layout tricks in the ATS-safe baseline
- visible keywords integrated naturally into summary and experience only when candidate-backed
- concise, achievement-oriented bullets over vague filler or copied job-description prose

## Architecture Direction

Prefer a stronger local quality pipeline over relying on prompts alone.

Target shape:

1. bounded evidence collection
2. generation candidate draft
3. local grounding filters for high-risk fields
4. deterministic sanitation and validation
5. render-document shaping
6. HTML/PDF renderer checks
7. corpus-backed quality verification

If the current data flow prevents trustworthy results, refactor it. If small fixes are sufficient in one area, keep them small. The standard is the best correct architecture for a production feature, not minimal churn for its own sake.

## Planned Work

### 1. Build a resume-generation quality corpus

- add deterministic synthetic cases covering common ATS and grounding failures
- include jobs with company names, products, team names, benefits, ATS providers, and unsupported skills that must never appear as visible skills unless candidate-backed
- include strong and weak candidate profiles so the system is tested on both success and abstention paths
- keep the corpus deterministic and easy to rerun in CI

### 2. Add a quality evaluator and regression tests

- assert that visible skills only contain candidate-backed skills
- assert no visible company/job-description bleed in skills, summary, or bullets
- assert hidden keyword sections do not render into ATS output
- assert no unsupported claims or invented metrics/dates/employers are emitted
- assert section ordering, section presence, and empty-section pruning remain stable
- assert export/render output remains ATS-safe and simple

### 3. Rework skill grounding

- build a candidate-backed skill bank from profile skills, skill groups, experience skills, project skills, certifications, and resume evidence
- treat job terms as targeting vocabulary, not visible skill content, unless they are already candidate-backed
- apply the same high-risk filtering to AI-returned skills and deterministic skills
- eliminate company names, team names, benefits, locations, and ATS vendor names from visible skill sections

### 4. Rework summary and experience grounding

- prevent employer research notes from becoming candidate summary prose
- keep summary generation anchored to candidate narrative, profile evidence, proof, and experience
- remove copied job-description language unless clearly supported by candidate evidence
- improve repair behavior so sanitation failure does not simply yield a thin unusable draft where a better grounded fallback is possible

### 5. Strengthen validation and sanitation

- add shorter-phrase bleed detection for visible sections where risk is high
- preserve locked manual content but flag it clearly when it violates quality rules
- strengthen duplicate, keyword-stuffing, vague-filler, thin-output, and page-overflow checks where needed
- ensure validation results are meaningful enough to gate approval and guide iteration

### 6. Upgrade ATS-friendly templates

- keep `classic_ats` as a hardened ATS-safe default
- activate and ship one additional ATS-safe template only if it meets the same parsing and simplicity bar
- prefer `compact_exec` as the likely second baseline because it already exists in contracts and can remain single-column and conservative
- do not ship `modern_split` unless it can honestly satisfy the ATS-safe baseline, which is not currently expected

### 7. Add renderer tests and print constraints

- test the HTML renderer directly with pure assertions where possible
- verify semantic/simple HTML, escaping, section order, keyword exclusion, and single-column structure
- add explicit print CSS and page-break safety rules if needed
- validate page-count behavior through focused tests and desktop checks

### 8. Add a benchmark-style quality loop

- add a deterministic resume-output benchmark or harness analogous to the resume-import benchmark
- run the corpus through generation, sanitation, validation, and rendering
- report actionable quality metrics such as visible-skill contamination, unsupported content count, duplicate content count, keyword coverage, section completeness, and page-target compliance
- use failures as blockers until the baseline is trustworthy

## Expected Deliverables

- stronger generation pipeline and quality gates in `packages/ai-providers`
- stronger resume workspace shaping, sanitation, and validation in `packages/job-finder`
- hardened ATS-safe renderer and at least one additional template candidate if it clears the product bar
- focused deterministic tests for generation, sanitation, validation, and rendering
- a replayable quality corpus and benchmark-style harness
- updated docs reflecting the new baseline and validation path

## Validation

Focused package checks should be the default while this work is in flight:

- `pnpm --filter @unemployed/ai-providers test`
- `pnpm --filter @unemployed/job-finder test`
- `pnpm --filter @unemployed/desktop test`
- `pnpm validate:package ai-providers`
- `pnpm validate:package job-finder`
- `pnpm validate:package desktop`
- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop ui:resume-workspace`

Broader checks after focused checks are green and the surface area justifies them:

- `pnpm verify:affected`
- `pnpm verify`

## Open Truths At Start

- the previous `014` ATS-first baseline is no longer sufficient for the current product bar
- current code already contains some sanitation and validation, but not enough to guarantee trustworthy generation quality
- the current handoff layer referenced `020` as active even though that plan file now lives under `completed/`; this plan becomes the new active source of truth for resume-generation quality work

## What Success Means

1. A realistic test corpus can no longer reproduce the reported “random shit in the skills section” class of failures.
2. Generated resumes are grounded enough that a senior engineer would be willing to ship them to real users after review.
3. The default ATS-safe templates are simple, recruiter-friendly, and thoroughly tested.
4. Resume generation quality is protected by deterministic tests and a replayable quality loop rather than subjective spot-checking alone.
