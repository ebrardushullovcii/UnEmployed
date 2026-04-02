import type { BrowserSessionState, JobSearchPreferences } from '@unemployed/contracts'

export function cloneValue<TValue>(value: TValue): TValue {
  return structuredClone(value)
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function tokenize(value: string): string[] {
  return normalizeText(value).split(/\s+/).filter(Boolean)
}

export function matchesAnyPhrase(
  candidate: string,
  desiredValues: readonly string[],
): boolean {
  if (desiredValues.length === 0) {
    return true
  }

  const normalizedCandidate = normalizeText(candidate)
  const candidateTokens = new Set(tokenize(candidate))

  return desiredValues.some((desiredValue) => {
    const normalizedDesired = normalizeText(desiredValue)

    if (normalizedCandidate.includes(normalizedDesired)) {
      return true
    }

    return tokenize(desiredValue).every((token) => candidateTokens.has(token))
  })
}

export function parseSalaryFloor(salaryText: string | null): number | null {
  if (!salaryText) {
    return null
  }

  const matches = [...salaryText.matchAll(/(\d[\d,]*(?:\.\d+)?)(?:\s*)([km])?/gi)]
  const knownCompensationPeriods = new Set(['yr', 'year', 'years', 'annual', 'annum', 'mo', 'month', 'months', 'wk', 'week', 'weeks', 'day', 'days', 'hr', 'hrs', 'hour', 'hours'])

  if (matches.length === 0) {
    return null
  }

  const parsedNumbers = matches
    .map((match) => {
      const baseValue = parseFloat((match[1] ?? '').replaceAll(',', ''))
      const suffix = (match[2] ?? '').toLowerCase()
      const followingText = salaryText.slice((match.index ?? 0) + match[0].length).trimStart().toLowerCase()

      if (!Number.isFinite(baseValue) || baseValue <= 0) {
        return null
      }

      if (followingText.startsWith('%')) {
        return null
      }

      if (followingText.startsWith('/')) {
        const periodUnit = followingText.match(/^\/\s*([a-z]+)/)?.[1] ?? ''
        if (!knownCompensationPeriods.has(periodUnit)) {
          return null
        }
      }

      if (!suffix && baseValue < 1000) {
        return null
      }

      if (suffix === 'k') {
        return baseValue * 1000
      }

      if (suffix === 'm') {
        return baseValue * 1_000_000
      }

      return baseValue
    })
    .filter((value): value is number => value !== null)

  if (parsedNumbers.length === 0) {
    return null
  }

  return Math.min(...parsedNumbers)
}

export function buildSessionBlockedResult(session: BrowserSessionState): Error {
  const detail = session.detail ? ` ${session.detail}` : ''
  return new Error(`Browser session is not ready for automation.${detail}`)
}

export function buildDiscoveryQuerySummary(
  searchPreferences: JobSearchPreferences,
): string {
  const roles = searchPreferences.targetRoles.join(', ') || 'all roles'
  const locations = searchPreferences.locations.join(', ') || 'all locations'
  const workModes = searchPreferences.workModes.join(', ') || 'all work modes'

  return `${roles} | ${locations} | ${workModes}`
}
