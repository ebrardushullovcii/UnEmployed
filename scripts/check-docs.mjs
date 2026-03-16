import fs from 'node:fs/promises'
import path from 'node:path'
import { readRegistry } from './lib-agent-adapters.mjs'

const rootDir = path.resolve(import.meta.dirname, '..')
const failures = []

const markdownLinkPattern = /\[[^\]]+\]\(([^)]+)\)/g

function isExternalLink(link) {
  return link.startsWith('http://') || link.startsWith('https://') || link.startsWith('mailto:') || link.startsWith('#')
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
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('Documentation checks passed.')

