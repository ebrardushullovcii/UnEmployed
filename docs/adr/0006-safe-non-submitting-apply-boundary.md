# Safe Non-Submitting Apply Boundary

Status: accepted

Job Finder apply automation may assist with preparation, form context, recovery, resume approval checks, and reviewable application records, but it must stop before final submission unless the user explicitly re-authorizes live submit work in a new decision. This preserves user consent, avoids accidental applications, and keeps apply automation auditable while still letting the product provide useful non-submitting assistance.

## Considered Options

- Enable live submit by default: rejected because accidental or unreviewed applications are too high risk for the current product boundary.
- Treat visual evidence as apply authority: rejected because screenshots are evidence for review/recovery, not permission to act or submit.

## Consequences

- Apply code must preserve consent interrupts and resume approval gates.
- Visual checkpoints must not produce browser actions, final-submit guidance, generated answers, selectors, or site-specific workflow rules.
- Reopening live submit requires an explicit new authorization and updated contracts, product docs, tests, and review flows.
