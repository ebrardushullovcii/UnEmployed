# Browser Runtime

Owns browser session lifecycle, automation primitives, and page interaction contracts.

## Rules

- Keep site-specific logic separate from generic runtime primitives.
- Keep deterministic catalog runtimes limited to seeded session primitives; workflow routing, eligibility checks, filtering, checkpoint generation, and resume-validation policy belong in `@unemployed/browser-agent` or higher-level orchestration.
- Renderer code should not import this package directly.
- Session ownership and auth-state handling must remain explicit.

