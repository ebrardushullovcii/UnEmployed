# Job Finder

## Purpose

Owns profile, resume import, discovery, source-debug, resume workspace, review queue, applications, and apply orchestration. The user flow is Profile -> Find jobs -> Shortlisted -> Applications; Needs you, Task center, and Settings support that flow without adding steps.

## Hard Rules

- Keep boundaries typed through `packages/contracts`.
- Do not hardcode one job board's routing, query maps, triage overrides, or recovery behavior into shared discovery (ADR 0007). Reusable provider adapters (Ashby, Workday, Lever) are fine; board-specific workflow policy is not.
- Preserve resume approval and stale-state checks before apply. Tailored mode requires current approval; original mode attaches the unchanged imported file without generating a draft.
- Refuse shortlist and preparation for a listing with derived `closed` activity; keep `inactive`, `stale`, and `unknown` truthful rather than treating them as closure.
- Keep live submit disabled unless explicitly re-authorized (ADR 0012). Sign-in recovery waits for an explicit "I'm signed in, retry" action; the app never receives or stores credentials.
- Treat browser visual evidence as schema-validated review/recovery context only.
- Never persist a paged or stale saved-job collection through a destructive replacement API; ordinary mutations use the row-local repository commit.
- Employer exclusion is exact-name, previewed, atomic, and reversible. Domain evidence may corroborate identity but never becomes a domain-wide exclusion.
- Company ownership requires an exact canonical name or a user-approved merge alias; legacy aliases and domains never own jobs.
- Application documents fail closed on stale question/application lineage.
- Fixed safeguards: at most 10 unique employer jobs per preparation run and 20 begun employer applications per local day. These are migration defaults, not a product ceiling, but any replacement must be explicit and bounded by the user's authority envelope.
- Every covering surface (dialogs, menus, palettes) registers through `useJobFinderOverlayOwnership` so one Escape closes only the topmost layer. Rapid-review j/k/x keys and the Resume Studio preview iframe stay outside that registry on purpose.
- Strong resume rewrites stay evidence-bound and review-required: no invented facts or numbers, nothing exported, approved, queued, or submitted automatically.

## See also

- product baseline: `docs/PRODUCT.md`
- boundaries: `AGENTS.md`, `docs/ARCHITECTURE.md`
- decisions: `docs/adr/README.md`
