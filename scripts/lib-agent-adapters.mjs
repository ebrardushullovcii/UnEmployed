import fs from 'node:fs/promises'
import path from 'node:path'
import YAML from 'yaml'

const rootDir = path.resolve(import.meta.dirname, '..')

export async function readRegistry() {
  const registryPath = path.join(rootDir, '.agents', 'registry.yaml')
  const raw = await fs.readFile(registryPath, 'utf8')
  return YAML.parse(raw)
}

export function buildClaudeMd() {
  return `See @AGENTS.md

# Claude-Specific

- Reference @docs/README.md for the canonical docs map
- Reference @docs/PLAN.md for the durable project plan
- Reference @docs/AGENT_CONTEXT.md for the agent-native layout and handoff model
- Reference @docs/STATUS.md before starting work
- Reference @docs/ARCHITECTURE.md and @docs/CONTRACTS.md before changing package boundaries or shared types
- Reference @docs/TESTING.md before adding or changing verification workflows
- Project-local skills live in @.agents/skills
- @.claude/skills is a compatibility symlink created by \`pnpm agents:sync\`
- Update docs in the same task when behavior, contracts, or architecture change
- If preparing work for commit or PR handoff, update the relevant docs proactively in the same task
- Never create a git commit or PR action unless the user explicitly asks for it
- Run \`pnpm agents:sync\` after updating repo-wide guidance
`
}

export function buildCursorRule() {
  return `---
description: UnEmployed repository rules and navigation
globs:
alwaysApply: true
---

# UnEmployed

- Start with \`AGENTS.md\`, \`docs/README.md\`, \`docs/PLAN.md\`, \`docs/AGENT_CONTEXT.md\`, and \`docs/STATUS.md\`.
- Prefer package-local \`AGENTS.md\` files when working inside one workspace.
- Shared contracts live in \`packages/contracts\`; do not introduce untyped cross-package boundaries.
- Update docs in the same task when behavior, contracts, or architecture change.
- If preparing work for commit or PR handoff, update the relevant docs proactively in the same task.
- Never create a git commit or PR action unless the user explicitly asks for it.
- Run \`pnpm agents:sync\`, \`pnpm docs:check\`, and the relevant lint/typecheck/test commands before closing work.
`
}

export async function writeGeneratedAdapters() {
  await fs.writeFile(path.join(rootDir, 'CLAUDE.md'), buildClaudeMd(), 'utf8')
  const cursorRulePath = path.join(rootDir, '.cursor', 'rules', '00-project.mdc')
  await fs.mkdir(path.dirname(cursorRulePath), { recursive: true })
  await fs.writeFile(cursorRulePath, buildCursorRule(), 'utf8')
}

export async function syncCompatibilityLinks() {
  const registry = await readRegistry()
  const sourceRoot = path.join(rootDir, registry.projectSkills.canonicalDir)
  const claudeRoot = path.join(rootDir, '.claude')
  const claudeSkillsPath = path.join(claudeRoot, 'skills')

  await fs.mkdir(claudeRoot, { recursive: true })
  await fs.rm(claudeSkillsPath, { recursive: true, force: true })
  await fs.symlink(path.relative(claudeRoot, sourceRoot), claudeSkillsPath, 'dir')
}
