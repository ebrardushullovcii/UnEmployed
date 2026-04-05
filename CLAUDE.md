See @AGENTS.md

# Claude-Specific

- Start with @docs/README.md, then @docs/STATUS.md and @docs/TRACKS.md
- Read only the smallest relevant doc set and the linked active or queued exec plan for the task
- Prefer the nearest package-local @AGENTS.md before editing code in that area
- Reference @docs/AGENT_CONTEXT.md and @.agents/registry.yaml only when changing repo guidance, generated adapters, or the handoff model
- Reference @docs/ARCHITECTURE.md, @docs/CONTRACTS.md, and @docs/TESTING.md only when the task touches those concerns
- Project-local skills live in @.agents/skills
- @.claude/skills is a compatibility symlink created by `pnpm agents:sync`
- Update docs in the same task when behavior, contracts, architecture, or workflow change
- When fixing PR or review feedback, prefer a root-cause or reusable pattern fix over a one-off patch when the broader correction is clear and safe
- If preparing work for commit or PR handoff, update the relevant docs proactively in the same task
- Never create a git commit or PR action unless the user explicitly asks for it
- Run `pnpm agents:sync` after updating repo-wide guidance
- After shared guidance changes, run `pnpm agents:check` and `pnpm docs:check`
