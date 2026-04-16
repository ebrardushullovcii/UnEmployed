# 013 Benchmark Results

Status: completed

Recorded on `2026-04-16`.

## Scope

This report measures **pre-013 baseline** versus **current local 013 state** for live Job Finder source-debug and discovery runs.

- **Before**: detached-worktree baseline at commit `49a30ab`, created outside the repo so the local `013` changes could stay intact during measurement
- **After**: the local working tree that contains the shipped `013` implementation
- **Harness**: `scripts/benchmark-013-live.test.ts`
- **Runtime**: live browser-agent runtime with local Chrome in headless mode, live AI loaded from root `.env.local`
- **Seed profile**: `apps/desktop/test-fixtures/job-finder/profile-baseline-workspace.json`
- **Targets**:
  - Greenhouse: `https://job-boards.greenhouse.io/remote`
  - Lever: `https://jobs.lever.co/aircall`
  - Kosovajob: `https://kosovajob.com/`

Retained repo artifacts:

- benchmark harness: `scripts/benchmark-013-live.test.ts`
- durable summary: this report

Raw JSON outputs were treated as transient QA evidence under ignored benchmark-artifact paths and are not required as durable repo source files.

## High-level findings

1. **Discovery improved sharply for API-friendly targets**.
   - Greenhouse discovery improved from a browser-startup failure at about `20.177s` to a completed run in about `0.271s`.
   - Lever discovery improved from a browser-startup failure at about `20.163s` to a completed run in about `4.207s`.

2. **Source-debug quality improved materially, but runtime got much longer in this environment**.
   - Before `013`, source-debug failed almost immediately and produced only thin warning-only draft artifacts.
   - After `013`, source-debug produced typed source intelligence with grounded provider or route outcomes, but each live run hit the benchmark cap at about `240s` and was cancelled before full completion.

3. **Kosovajob remains a weak spot for discovery**.
   - Discovery still failed on the browser debugging endpoint before and after `013`.
   - Source-debug quality improved after `013`, but discovery itself did not become faster or healthier for this target in the current environment.

## Before vs after summary

| Target | Flow | Before | After | Delta | Interpretation |
| --- | --- | ---: | ---: | ---: | --- |
| Greenhouse | Discovery | `20.177s` failed startup | `0.271s` completed | `-19.906s` (`-98.7%`) | strong win from provider-aware API fast path |
| Greenhouse | Source-debug | `1.155s` failed | `242.146s` cancelled at cap | `+240.991s` | not a speed win; after run did real work and produced typed intelligence instead of failing immediately |
| Lever | Discovery | `20.163s` failed startup | `4.207s` completed | `-15.956s` (`-79.1%`) | strong win from provider-aware API fast path plus title triage |
| Lever | Source-debug | `0.386s` failed | `240.038s` cancelled at cap | `+239.652s` | not a speed win; after run produced typed intelligence instead of failing immediately |
| Kosovajob | Discovery | `20.086s` failed startup | `20.044s` failed startup | `-0.042s` (`-0.2%`) | effectively no change |
| Kosovajob | Source-debug | `0.350s` failed | `240.027s` cancelled at cap | `+239.677s` | not a speed win; after run produced typed route intelligence instead of failing immediately |

## What actually improved

### 1. Discovery speed on API-friendly targets

#### Greenhouse

- **Before**
  - discovery failed with `Chrome started but the remote debugging endpoint did not become ready in time.`
  - wall clock: `20.177s`
- **After**
  - discovery completed in `0.271s`
  - target execution recorded:
    - `collectionMethod: "api"`
    - `sourceIntelligenceProvider: "greenhouse"`
    - target timing `251ms`
- **Quality note**
  - the original benchmark run hit a Greenhouse `postedAt` normalization bug because the provider returned offset timestamps like `2024-07-24T16:08:01-04:00` and the pre-fix parser expected canonical UTC ISO output.
  - that normalization path is now fixed in repo state, so the remaining follow-up risk is no longer timestamp parsing and should instead focus on broader target quality checks when the benchmark is rerun.

#### Lever

- **Before**
  - discovery failed with the same browser debugging endpoint startup error
  - wall clock: `20.163s`
- **After**
  - discovery completed in `4.207s`
  - target execution recorded:
    - `collectionMethod: "api"`
    - `sourceIntelligenceProvider: "lever"`
    - target timing `4188ms`
  - run summary recorded `jobsSkippedByTitleTriage: 137`
- **Quality note**
  - the run kept `0` jobs, but it now rejected `137` jobs early through title triage instead of paying full browser-agent enrichment cost on all of them.
  - this is a real efficiency gain even though the kept-job count stayed `0` in this benchmark seed.

### 2. Source-debug output quality

Before `013`, all three source-debug runs failed quickly and the saved draft artifact had:

- no typed intelligence
- no preferred method
- mostly warning-only output

After `013`, all three targets produced draft artifacts with typed intelligence:

- **Greenhouse**
  - `providerKey: "greenhouse"`
  - `preferredMethod: "api"`
  - guidance counts: navigation `19`, search `6`, detail `6`, apply `9`, warnings `4`
- **Lever**
  - `providerKey: "lever"`
  - `preferredMethod: "api"`
  - guidance counts: navigation `19`, search `6`, detail `1`, apply `0`, warnings `2`
- **Kosovajob**
  - `providerKey: null`
  - `preferredMethod: "careers_page"`
  - guidance counts: navigation `12`, search `0`, detail `0`, apply `0`, warnings `2`

That is the clearest measured quality improvement from `013`: the system now learns and persists actionable structured intelligence instead of just failing fast and leaving thin warning-only drafts.

### 3. New run-level quality signals visible only after `013`

The after-runs exposed useful signals the before-state did not produce:

- provider-aware target execution info (`sourceIntelligenceProvider`)
- explicit `collectionMethod` on executions (`api` on Greenhouse and Lever)
- title-triage skip counts (`137` on Lever)
- typed source-debug intelligence (`providerKey`, `preferredMethod`)

## What did not improve yet

### Source-debug runtime

The live source-debug runs are **not faster yet** in this benchmark.

They are slower because they now do substantial real work instead of failing almost immediately. In this run they all hit the benchmark cap near `240s` and were cancelled.

So the honest reading is:

- **quality improved strongly**
- **speed did not improve yet for source-debug in this environment**
- there is follow-up tuning work left for source-debug runtime

### Generic browser-driven discovery on Kosovajob

Kosovajob discovery still failed with:

- `Chrome started but the remote debugging endpoint did not become ready in time.`

That means `013` did not materially improve this target’s discovery path in the current environment.

## Concrete examples

### Example A: Greenhouse before vs after

- before: discovery never reached useful work; failed during browser startup after about `20s`
- after: discovery selected `collectionMethod: "api"`, completed in about `271ms`, and recorded `sourceIntelligenceProvider: "greenhouse"`
- follow-up update: the benchmark-exposed Greenhouse offset-timestamp normalization bug is now fixed in repo state

### Example B: Lever before vs after

- before: discovery never reached useful work; failed during browser startup after about `20s`
- after: discovery selected `collectionMethod: "api"`, completed in about `4.2s`, and filtered out `137` jobs via title triage before expensive enrichment

### Example C: Kosovajob before vs after

- before: source-debug failed fast and produced no typed route intelligence
- after: source-debug produced a draft artifact with `preferredMethod: "careers_page"` and `12` navigation guidance lines
- discovery itself still failed on browser startup, so the speed benefit did not land for this site yet

## Recommended next fixes based on benchmark evidence

1. **Rerun the Greenhouse benchmark path after the timestamp fix** so the retained report includes a post-fix persisted-job sample instead of only the original pre-fix failure note.
2. **Tune source-debug runtime** so the richer typed-intelligence path can finish inside a reasonable cap instead of running until cancellation.
3. **Investigate generic browser startup / attach reliability** for sites like Kosovajob where discovery still dies on the debugging endpoint before any useful work happens.
4. **Add a shorter benchmark mode for source-debug** if we want repeatable quality sampling without always waiting for the full long-run path.

## Bottom line

`013` delivered **real discovery speed wins** on provider-friendly sites and **real source-debug quality wins** across all benchmarked targets.

The measured story is:

- **Discovery**: clearly better on Greenhouse and Lever
- **Source-debug quality**: clearly better on all three targets
- **Source-debug speed**: not better yet; currently slower because it now does meaningful work instead of failing immediately
- **Generic non-provider discovery**: still needs more work for targets like Kosovajob
