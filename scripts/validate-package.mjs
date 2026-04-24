import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const rootDir = path.resolve(import.meta.dirname, '..')
const target = process.argv[2]
const validationOrder = ['lint', 'typecheck', 'test']

function fail(message) {
  console.error(message)
  process.exit(1)
}

async function readWorkspacePackages() {
  const roots = ['apps', 'packages']
  const packages = []

  for (const root of roots) {
    const directory = path.join(rootDir, root)
    let entries = []
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }
      const packageDir = path.join(directory, entry.name)
      const packageJsonPath = path.join(packageDir, 'package.json')
      try {
        const raw = await fs.readFile(packageJsonPath, 'utf8')
        const manifest = JSON.parse(raw)
        packages.push({
          directory: path.relative(rootDir, packageDir),
          name: manifest.name,
          scripts: manifest.scripts ?? {}
        })
      } catch {
        // Ignore folders that are not packages.
      }
    }
  }

  return packages
}

function aliasesForPackage(pkg) {
  const unscoped = pkg.name?.replace(/^@[^/]+\//, '')
  return new Set([pkg.name, unscoped, pkg.directory, path.basename(pkg.directory)])
}

const packages = await readWorkspacePackages()

if (!target) {
  const choices = packages.map((pkg) => `- ${pkg.name} (${pkg.directory})`).join('\n')
  fail(`Usage: pnpm validate:package <package-name|alias|path>\n\nPackages:\n${choices}`)
}

const matches = packages.filter((pkg) => aliasesForPackage(pkg).has(target))

if (matches.length === 0) {
  fail(`Unknown package target: ${target}`)
}

if (matches.length > 1) {
  fail(`Ambiguous package target: ${target}\n${matches.map((pkg) => `- ${pkg.name}`).join('\n')}`)
}

const [pkg] = matches
const scripts = validationOrder.filter((scriptName) => pkg.scripts[scriptName])

if (scripts.length === 0) {
  fail(`Package ${pkg.name} has no validation scripts: ${validationOrder.join(', ')}`)
}

for (const scriptName of scripts) {
  console.log(`\n> ${pkg.name} ${scriptName}`)
  const result = spawnSync('pnpm', ['--filter', pkg.name, 'run', scriptName], {
    cwd: rootDir,
    stdio: 'inherit'
  })

  if (result.error) {
    fail(result.error.message)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
