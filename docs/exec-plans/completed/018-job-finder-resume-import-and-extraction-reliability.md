# 018 Job Finder Resume Import And Extraction Reliability

Status: completed

## Goal

Replace one-pass direct-merge import with a staged, reviewable, evidence-backed resume import pipeline.

## What Landed

- durable import runs, document bundles, and field candidates
- safe canonical writes only from accepted candidates
- better local parser routing across text, PDF, and DOCX
- reviewable unresolved candidates for later setup and profile flows

## What It Means Now

- this is the import-substrate baseline
- `019` later rebuilt parser quality on top of this substrate
