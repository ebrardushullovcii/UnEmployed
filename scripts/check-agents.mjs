import fs from 'node:fs/promises'
import path from 'node:path'
import { buildClaudeMd, buildCursorRule, readRegistry } from './lib-agent-adapters.mjs'

const rootDir = path.resolve(import.meta.dirname, '..')

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
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('Agent checks passed.')
