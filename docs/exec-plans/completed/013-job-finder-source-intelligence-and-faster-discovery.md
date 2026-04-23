# 013 Job Finder Source Intelligence And Faster Discovery

Status: completed

## Goal

Turn source-debug output into typed source intelligence and use it to make discovery faster and more provider-aware.

## What Landed

- typed source intelligence persisted from source-debug
- provider-aware discovery, including API fast paths where grounded
- one-target and run-all on the same target pipeline
- title-first triage before expensive enrichment
- durable discovery ledger and richer saved-job provenance

## What It Means Now

- this is the current discovery foundation
- live benchmark evidence is in `013-benchmark-results.md`
- active browser-loop optimization is in `017`
