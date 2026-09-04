# ADR 0014: Product iteration loop over release ceremony

Status: accepted (2026-08-31)

## Context

Between 2026-08-19 and 2026-08-31 the repo's status and plan docs prescribed a sealed-acceptance chain for Job Finder: source fingerprints, external seal custody, `pnpm verify` and `pnpm test:evidence` on an unchanged fingerprint, exact-build Electron acceptance, and a 14-persona blind usability wave (P01-P14). Agents read those docs as the active task. One coordinator thread spent about 52 hours and 85 million tokens on the chain, ran `pnpm verify` dozens of times after the user asked for fewer builds, and still shipped visible UI bugs. The user repeatedly redirected work toward using the product and finally asked to remove the gates.

## Decision

While the product is still being shaped, the working loop is:

1. A small number of independent testers use the current built app with synthetic data and record screenshots and concrete findings.
2. Findings are synthesized by root cause into one fix batch.
3. Only the focused checks for touched behavior run.
4. One rebuild, then a fresh round.

Fingerprints, seals, custody, `pnpm verify`, `pnpm test:evidence`, canonical persona waves, and any other release-acceptance chain run only after the user explicitly declares a settled release candidate.

Status, handoff notes, plan files, and evidence logs are not kept in repo docs. Git history and per-session scratch files carry that state.

## Consequences

- The acceptance tooling under `apps/desktop/scripts` stays in the repo unused until a release candidate is declared.
- Historical acceptance reports live in `docs/audits/` as records, not guidance.
- Prepare-only and user-owned submission boundaries (ADR 0012) are unchanged by this decision.

## Rejected alternatives

- Keeping the chain in an exec plan marked "deferred": agents kept treating it as the next step, and the doc validator refused the deferred status.
- Running a reduced gate on every batch: builds and full suites heat the laptop and slow the loop without catching the visible defects that testers find.
