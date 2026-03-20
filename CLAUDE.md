See @AGENTS.md

# Claude-Specific

- Reference @docs/README.md for the canonical docs map
- Reference @docs/PLAN.md for the durable project plan
- Reference @docs/AGENT_CONTEXT.md for the agent-native layout and handoff model
- Reference @docs/STATUS.md before starting work
- Reference @docs/TRACKS.md for active workstreams and handoffs
- Reference @docs/ARCHITECTURE.md and @docs/CONTRACTS.md before changing package boundaries or shared types
- Reference @docs/TESTING.md before adding or changing verification workflows
- Project-local skills live in @.agents/skills
- @.claude/skills is a compatibility symlink created by `pnpm agents:sync`
- Update docs in the same task when behavior, contracts, or architecture change
- If preparing work for commit or PR handoff, update the relevant docs proactively in the same task
- Never create a git commit or PR action unless the user explicitly asks for it
- Run `pnpm agents:sync` after updating repo-wide guidance
