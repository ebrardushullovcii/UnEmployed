export type ProfileSection = 'basics' | 'experience' | 'background' | 'preferences'

export interface SectionProgress {
  filled: number
  percent: number
  total: number
}

function createSectionProgress(filled: number, total: number): SectionProgress {
  if (total <= 0) {
    return { filled: 0, percent: 0, total: 0 }
  }

  return {
    filled,
    percent: Math.round((filled / total) * 100),
    total
  }
}

function isFilledValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
  }

  if (typeof value === 'boolean') {
    return true
  }

  if (Array.isArray(value)) {
    return value.length > 0
  }

  return value !== null && value !== undefined
}

export function countFilledFields(values: readonly unknown[]): SectionProgress {
  return createSectionProgress(values.filter((value) => isFilledValue(value)).length, values.length)
}

export function countFilledRecordFields(
  records: ReadonlyArray<Record<string, unknown>>,
  ignoredKeys: readonly string[] = []
): SectionProgress {
  const ignored = new Set(ignoredKeys)
  let filled = 0
  let total = 0

  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (ignored.has(key)) {
        continue
      }

      total += 1

      if (isFilledValue(value)) {
        filled += 1
      }
    }
  }

  return createSectionProgress(filled, total)
}

export function combineSectionProgress(...stats: readonly SectionProgress[]): SectionProgress {
  return createSectionProgress(
    stats.reduce((sum, stat) => sum + stat.filled, 0),
    stats.reduce((sum, stat) => sum + stat.total, 0)
  )
}

export function formatSectionProgressLabel(section: ProfileSection, progress: SectionProgress): string {
  if (progress.total === 0) {
    return section === 'experience' || section === 'background' ? 'Empty' : 'Not started'
  }

  return `${progress.filled}/${progress.total}`
}
