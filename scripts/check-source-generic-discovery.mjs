import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const rootDir = path.resolve(import.meta.dirname, '..')

const scannedPathPrefixes = [
  'packages/browser-agent/src/',
  'packages/job-finder/src/internal/',
]

const excludedPathPatterns = [
  /\.test\.ts$/,
  /\.test\.tsx$/,
  /(^|\/)resume-/,
  /(^|\/)profile-/,
]

const sourceNamePattern =
  /(?:LinkedIn|Linkedin|Greenhouse|Lever|Workday|Ashby|ICIMS|iCIMS|KosovaJob|Kosovajob)/u
const declarationPattern =
  /\b(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/gu

function toPosixPath(value) {
  return value.replace(/\\/g, '/')
}

function shouldScan(relativePath) {
  const normalizedPath = toPosixPath(relativePath)
  return (
    scannedPathPrefixes.some((prefix) => normalizedPath.startsWith(prefix)) &&
    normalizedPath.endsWith('.ts') &&
    !excludedPathPatterns.some((pattern) => pattern.test(normalizedPath))
  )
}

function listGitFiles(args) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function listCandidateFiles() {
  return [
    ...new Set([
      ...listGitFiles(['ls-files']),
      ...listGitFiles(['ls-files', '--others', '--exclude-standard']),
    ]),
  ]
}

function lineNumberForIndex(content, index) {
  return content.slice(0, index).split(/\r?\n/).length
}

async function main() {
  const failures = []
  const files = listCandidateFiles().filter(shouldScan)

  for (const relativePath of files) {
    const absolutePath = path.join(rootDir, relativePath)
    const content = await fs.readFile(absolutePath, 'utf8')

    for (const match of content.matchAll(declarationPattern)) {
      const declarationName = match[1] ?? ''
      if (!sourceNamePattern.test(declarationName)) {
        continue
      }

      failures.push(
        `${relativePath}:${lineNumberForIndex(content, match.index ?? 0)} source-branded declaration "${declarationName}"`,
      )
    }
  }

  if (failures.length > 0) {
    console.error(
      [
        'Source-generic discovery check failed.',
        'Do not add one-source function/type/constant names to shared discovery or browser-agent workflow code.',
        'Use generic helper names plus data-driven adapter tables instead.',
        '',
        ...failures,
      ].join('\n'),
    )
    process.exit(1)
  }

  console.log('Source-generic discovery checks passed.')
}

await main()
