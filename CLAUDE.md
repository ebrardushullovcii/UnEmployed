See @AGENTS.md

# Claude-Specific

- Start with @docs/README.md
- Read @docs/STATUS.md and @docs/TRACKS.md only for active feature work, broad repo changes, handoff updates, or unclear current state
- Read linked exec plans and package-local @AGENTS.md only when relevant to the task
- Use @docs/AGENT_CONTEXT.md and @.agents/registry.yaml only for repo-guidance or adapter changes
- Use @docs/ARCHITECTURE.md, @docs/CONTRACTS.md, and @docs/TESTING.md only for those concerns
- Project-local skills live in @.agents/skills
- @.claude/skills is a compatibility symlink created by `pnpm agents:sync`
- Update docs in the same task when behavior, contracts, architecture, or workflow change
- Never create a git commit or PR action unless the user explicitly asks for it
- For docs or guidance-only changes, run `pnpm validate:docs-only`
- For package-local code, run `pnpm validate:package <alias>`
