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

- Start with @docs/README.md
- Read @docs/STATUS.md and @docs/TRACKS.md only for active feature work, broad repo changes, handoff updates, or unclear current state
- Read linked exec plans and package-local @AGENTS.md only when relevant to the task
- Use @docs/AGENT_CONTEXT.md and @.agents/registry.yaml only for repo-guidance or adapter changes
- Use @docs/ARCHITECTURE.md, @docs/CONTRACTS.md, and @docs/TESTING.md only for those concerns
- Project-local skills live in @.agents/skills
- @.claude/skills is a compatibility symlink created by \`pnpm agents:sync\`
- Update docs in the same task when behavior, contracts, architecture, or workflow change
- Never create a git commit or PR action unless the user explicitly asks for it
- For docs or guidance-only changes, run \`pnpm validate:docs-only\`
- For package-local code, run \`pnpm validate:package <alias>\`
`
}

function buildCursorRule() {
  return `---
description: UnEmployed repository rules and navigation
globs:
alwaysApply: true
---

# UnEmployed

- Start with \`AGENTS.md\` and \`docs/README.md\`.
- Read only the smallest relevant doc set.
- Read \`docs/STATUS.md\` and \`docs/TRACKS.md\` only for active feature work, broad repo changes, handoff updates, or unclear current state.
- Read linked exec plans only when relevant.
- Use package-local \`AGENTS.md\` when editing that workspace.
- Use \`docs/AGENT_CONTEXT.md\` and \`.agents/registry.yaml\` only when changing repo guidance or generated adapters.
- Shared contracts live in \`packages/contracts\`; do not introduce untyped cross-package boundaries.
- Update docs in the same task when behavior, contracts, architecture, or workflow change.
- Never create a git commit or PR action unless the user explicitly asks for it.
- Run \`pnpm verify\` as the broad default check when the task does not call for something narrower.
- For docs or guidance-only changes, run \`pnpm validate:docs-only\`.
- For package-local code, run \`pnpm validate:package <alias>\`.
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
  const isWindows = process.platform === 'win32'
  const linkTarget = isWindows ? sourceRoot : path.relative(claudeRoot, sourceRoot)
  const linkType = isWindows ? 'junction' : 'dir'

  await fs.mkdir(claudeRoot, { recursive: true })
  await fs.rm(claudeSkillsPath, { recursive: true, force: true })
  await fs.symlink(linkTarget, claudeSkillsPath, linkType)
}

async function checkAgents() {
  const failures = []
  const registry = await readRegistry()

  for (const guide of registry.requiredLocalGuides) {
    try {
      await fs.access(path.join(rootDir, guide))
    } catch {
      failures.push(`Missing local guide: ${guide}`)
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
      const resolvedTarget = await fs.realpath(claudeSkillsPath)
      const canonicalTarget = await fs.realpath(canonicalSkillRoot)
      if (resolvedTarget !== canonicalTarget) {
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
  const statusPattern = /^Status:\s+(.*)$/m

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

  async function checkPlanStatus(relativePath, allowedStatuses) {
    const absolutePath = path.join(rootDir, relativePath)
    const content = await fs.readFile(absolutePath, 'utf8')
    const match = content.match(statusPattern)
    if (!match) {
      failures.push(`Missing Status line in ${relativePath}`)
      return
    }
    const status = match[1].trim()
    if (!allowedStatuses.includes(status)) {
      failures.push(`Unexpected plan status in ${relativePath}: ${status}`)
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

  await checkMarkdownFile('README.md')
  await checkMarkdownFile(registry.rootInstructions)

  for (const guide of registry.requiredLocalGuides) {
    const absolutePath = path.join(rootDir, guide)
    try {
      await fs.access(absolutePath)
    } catch {
      failures.push(`Missing local guide: ${guide}`)
      continue
    }
    await checkMarkdownFile(guide)
  }

  const execPlansRoot = path.join(rootDir, 'docs', 'exec-plans')
  for (const [subdir, allowedStatuses] of [
    ['active', ['active', 'ready']],
    ['queued', ['ready']],
    ['completed', ['completed']]
  ]) {
    const directoryPath = path.join(execPlansRoot, subdir)
    let entries = []
    try {
      entries = await fs.readdir(directoryPath, { withFileTypes: true })
    } catch {
      failures.push(`Missing exec-plan directory: docs/exec-plans/${subdir}`)
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        continue
      }
      await checkPlanStatus(path.join('docs', 'exec-plans', subdir, entry.name), allowedStatuses)
    }
  }

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
