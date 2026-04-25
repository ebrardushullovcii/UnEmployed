# 018 Job Finder Resume Import And Extraction Reliability

Status: completed

## Goal

Replace one-pass direct-merge import with a staged, reviewable, evidence-backed resume import pipeline.

## What Landed

- durable import runs, document bundles, and field candidates
- safe canonical writes only from accepted candidates
- better local parser routing across text, PDF, and DOCX
- reviewable unresolved candidates for later setup and profile flows

## Historical Note

This completed summary condenses a much larger implementation plan. If resume-import architecture reopens, use the prior git history for this file as the fuller source for parser choices, staged extraction rationale, and the original handoff details.

## What It Means Now

- this is the import-substrate baseline
- `docs/exec-plans/completed/019-job-finder-world-class-resume-import.md` later rebuilt parser quality on top of this substrate
