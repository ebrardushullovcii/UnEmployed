import fs from 'node:fs/promises'
import path from 'node:path'
import YAML from 'yaml'

const rootDir = path.resolve(import.meta.dirname, '..')

function fail(message) {
  console.error(message)
  process.exit(1)
}

async function readRegistry() {
  const registryPath = path.join(rootDir, '.agents', 'registry.yaml')
  const raw = await fs.readFile(registryPath, 'utf8')
  return YAML.parse(raw)
}

function buildClaudeMd() {
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

function buildCursorRule() {
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

async function writeGeneratedAdapters() {
  await fs.writeFile(path.join(rootDir, 'CLAUDE.md'), buildClaudeMd(), 'utf8')
  const cursorRulePath = path.join(rootDir, '.cursor', 'rules', '00-project.mdc')
  await fs.mkdir(path.dirname(cursorRulePath), { recursive: true })
  await fs.writeFile(cursorRulePath, buildCursorRule(), 'utf8')
}

async function syncCompatibilityLinks() {
  const registry = await readRegistry()
  const sourceRoot = path.join(rootDir, registry.projectSkills.canonicalDir)
  const claudeRoot = path.join(rootDir, '.claude')
  const claudeSkillsPath = path.join(claudeRoot, 'skills')

  await fs.mkdir(claudeRoot, { recursive: true })
  await fs.rm(claudeSkillsPath, { recursive: true, force: true })
  await fs.symlink(path.relative(claudeRoot, sourceRoot), claudeSkillsPath, 'dir')
}

async function checkAgents() {
  const failures = []
  const registry = await readRegistry()

  for (const guide of registry.requiredPackageGuides) {
    try {
      await fs.access(path.join(rootDir, guide))
    } catch {
      failures.push(`Missing package guide: ${guide}`)
    }
  }

  const canonicalSkillRoot = path.join(rootDir, registry.projectSkills.canonicalDir)
  try {
    await fs.access(canonicalSkillRoot)
  } catch {
    failures.push(`Missing canonical skill directory: ${registry.projectSkills.canonicalDir}`)
  }

  try {
    const skillEntries = await fs.readdir(canonicalSkillRoot, { withFileTypes: true })
    for (const entry of skillEntries) {
      if (!entry.isDirectory()) {
        failures.push(`Unexpected file in canonical skill directory: ${entry.name}`)
        continue
      }
      try {
        await fs.access(path.join(canonicalSkillRoot, entry.name, 'SKILL.md'))
      } catch {
        failures.push(`Missing SKILL.md for project skill: ${entry.name}`)
      }
    }
  } catch {
    // handled above
  }

  const claudeSkillsPath = path.join(rootDir, '.claude', 'skills')
  try {
    const stat = await fs.lstat(claudeSkillsPath)
    if (!stat.isSymbolicLink()) {
      failures.push('.claude/skills must be a symlink to .agents/skills')
    } else {
      const target = await fs.readlink(claudeSkillsPath)
      const resolvedTarget = path.resolve(path.dirname(claudeSkillsPath), target)
      if (resolvedTarget !== canonicalSkillRoot) {
        failures.push('.claude/skills symlink does not point to .agents/skills')
      }
    }
  } catch {
    failures.push('Missing .claude/skills compatibility symlink')
  }

  const generated = [
    ['CLAUDE.md', buildClaudeMd()],
    ['.cursor/rules/00-project.mdc', buildCursorRule()]
  ]

  for (const [relativePath, expected] of generated) {
    const absolutePath = path.join(rootDir, relativePath)
    let actual
    try {
      actual = await fs.readFile(absolutePath, 'utf8')
    } catch {
      failures.push(`Missing generated adapter: ${relativePath}`)
      continue
    }
    if (actual !== expected) {
      failures.push(`Generated adapter is stale: ${relativePath}`)
    }
  }

  if (failures.length > 0) {
    fail(failures.join('\n'))
  }

  console.log('Agent checks passed.')
}

async function checkDocs() {
  const failures = []
  const markdownLinkPattern = /\[[^\]]+\]\(([^)]+)\)/g

  function isExternalLink(link) {
    return (
      link.startsWith('http://') ||
      link.startsWith('https://') ||
      link.startsWith('mailto:') ||
      link.startsWith('#')
    )
  }

  async function checkMarkdownFile(relativePath) {
    const absolutePath = path.join(rootDir, relativePath)
    const content = await fs.readFile(absolutePath, 'utf8')

    for (const match of content.matchAll(markdownLinkPattern)) {
      const rawLink = match[1]
      if (!rawLink || isExternalLink(rawLink)) {
        continue
      }
      const target = rawLink.split('#')[0]
      if (target.length === 0) {
        continue
      }
      const resolvedPath = path.resolve(path.dirname(absolutePath), target)
      try {
        await fs.access(resolvedPath)
      } catch {
        failures.push(`Broken link in ${relativePath}: ${rawLink}`)
      }
    }
  }

  const registry = await readRegistry()
  for (const doc of registry.canonicalDocs) {
    const absolutePath = path.join(rootDir, doc.path)
    try {
      await fs.access(absolutePath)
    } catch {
      failures.push(`Missing canonical doc: ${doc.path}`)
      continue
    }
    await checkMarkdownFile(doc.path)
  }

  await checkMarkdownFile('AGENTS.md')

  if (failures.length > 0) {
    fail(failures.join('\n'))
  }

  console.log('Documentation checks passed.')
}

async function main() {
  const command = process.argv[2]

  switch (command) {
    case 'sync':
      await writeGeneratedAdapters()
      await syncCompatibilityLinks()
      console.log('Synced agent adapters.')
      break
    case 'check-agents':
      await checkAgents()
      break
    case 'check-docs':
      await checkDocs()
      break
    default:
      fail('Usage: node scripts/repo-context.mjs <sync|check-agents|check-docs>')
  }
}

await main()
