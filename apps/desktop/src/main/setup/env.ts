import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function parseDotEnvContent(content: string): Record<string, string> {
  const parsed: Record<string, string> = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line || line.startsWith('#')) {
      continue
    }

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line
    const separatorIndex = normalized.indexOf('=')

    if (separatorIndex <= 0) {
      continue
    }

    const key = normalized.slice(0, separatorIndex).trim()
    const rawValue = normalized.slice(separatorIndex + 1).trim()

    if (!key) {
      continue
    }

    let value = rawValue

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    parsed[key] = value.replace(/\\n/g, '\n')
  }

  return parsed
}

export function getDefaultDesktopEnvPaths(): string[] {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const desktopDir = path.resolve(currentDir, '../..')
  const repoRoot = path.resolve(currentDir, '../../../..')

  const paths = [
    path.join(repoRoot, '.env'),
    path.join(repoRoot, '.env.local'),
    path.join(desktopDir, '.env'),
    path.join(desktopDir, '.env.local')
  ]

  return paths
}

export function loadDesktopEnvironment(env: NodeJS.ProcessEnv = process.env, envPaths = getDefaultDesktopEnvPaths()): void {
  for (const envPath of envPaths) {
    if (!existsSync(envPath)) {
      continue
    }

    const parsed = parseDotEnvContent(readFileSync(envPath, 'utf8'))

    for (const [key, value] of Object.entries(parsed)) {
      if (typeof env[key] === 'undefined') {
        env[key] = value
      }
    }
  }
}
