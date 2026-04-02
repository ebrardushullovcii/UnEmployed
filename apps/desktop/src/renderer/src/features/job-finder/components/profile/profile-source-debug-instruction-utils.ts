import type {
  EditableSourceInstructionArtifact,
  SourceInstructionArtifact
} from '@unemployed/contracts'

export type LearnedInstructionField =
  | 'navigationGuidance'
  | 'searchGuidance'
  | 'detailGuidance'
  | 'applyGuidance'
  | 'warnings'

export interface LearnedInstructionSection {
  field: LearnedInstructionField
  label: string
  lines: Array<{
    displayText: string
    normalizedKey: string
    sourceText: string
  }>
}

export function normalizeLearnedInstructionLine(value: string): string {
  return value
    .replace(
      /^(Reliable control|Filter note|Navigation note|Apply note|Validated behavior|Validated navigation|Verification):\s*/i,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim()
}

export function isRenderableLearnedInstructionLine(line: string): boolean {
  const normalized = line.toLowerCase().replace(/\s+/g, ' ').trim()
  const isUrlLiteral = normalized.includes('http://') || normalized.includes('https://')
  const isOnlyStartingUrlRestatement =
    (normalized.startsWith('start from ') || normalized.startsWith('started from ')) &&
    (isUrlLiteral || normalized.includes('the starting url'))

  return !(
    /^(clicked|filled|selected|link|button|searchbox|textbox|combobox)\b/.test(normalized) ||
    normalized.startsWith('click failed ') ||
    normalized.includes('locator click') ||
    normalized.includes('call log') ||
    normalized.includes('waiting for getbyrole') ||
    normalized.includes('element is not visible') ||
    normalized.includes('retrying click action') ||
    isOnlyStartingUrlRestatement ||
    normalized.startsWith('stay within ') ||
    normalized.startsWith('verify whether the site is reachable') ||
    normalized.startsWith('find search controls or filters') ||
    normalized.startsWith('open multiple job details') ||
    normalized.startsWith('check whether discovered jobs expose') ||
    normalized.startsWith('inspected discovered jobs for apply entry points') ||
    normalized.startsWith('observed canonical job detail url ') ||
    normalized.startsWith('no reliable apply path was confirmed for ') ||
    normalized.startsWith('replay verification reached ') ||
    normalized.startsWith('reliable control: no login or consent wall detected') ||
    normalized.includes('fully accessible without login or consent walls') ||
    normalized.includes('fully accessible without login or consent barriers') ||
    normalized.includes('no authentication required') ||
    normalized.includes('without auth required') ||
    normalized.includes('loads without auth') ||
    normalized.includes('loads without login') ||
    normalized.includes('without login or consent barriers') ||
    normalized.includes('accessible without login barriers') ||
    normalized.includes('no auth or consent blockers detected') ||
    normalized.includes('no auth consent blockers detected') ||
    normalized.includes('no auth consent popups') ||
    normalized.includes('no login auth or consent blockers detected') ||
    normalized.includes('page is scrollable with substantial content') ||
    normalized.includes('job extraction tool confirmed') ||
    normalized.includes('extract jobs tool') ||
    normalized.includes('extract_jobs tool') ||
    normalized.includes('extract_jobs returned') ||
    normalized.includes('get interactive elements') ||
    normalized.includes('get_interactive_elements') ||
    normalized.includes('interactive elements detection was unreliable') ||
    normalized.includes('interactive elements were unreliable') ||
    normalized.includes('site title is in albanian') ||
    normalized.includes('site is a job board') ||
    normalized.includes('page language is ') ||
    normalized.includes('job listings appear to be in ') ||
    normalized.includes('means find jobs') ||
    normalized.includes('interactive elements not detected') ||
    normalized.includes('interaction timed out') ||
    normalized.includes('multiple timeouts observed') ||
    normalized.includes('requires longer timeout') ||
    normalized.includes('different extraction timing') ||
    normalized.includes('different extraction approach') ||
    normalized.includes('different interaction method') ||
    normalized.includes('manual dom inspection') ||
    normalized.includes('pointer events') ||
    normalized.includes('pointer event interception') ||
    normalized.includes('javascript enabled interaction') ||
    normalized.includes('current extraction') ||
    normalized.includes('no jobs matching target roles') ||
    normalized.includes('apply process not yet verified') ||
    normalized.includes('apply mechanism not yet verified') ||
    normalized.includes('job details not extracted') ||
    normalized.includes('job details and apply flow not fully verified') ||
    normalized.includes('llm call failed') ||
    normalized.includes('discovery encountered an error') ||
    normalized.includes('unknown error') ||
    isUrlLiteral ||
    normalized.startsWith('verification: ') ||
    normalized.includes('produced no candidate jobs') ||
    /produced \d+ candidate job result/.test(normalized)
  )
}

export function describeLearnedInstructionUsage(artifact: SourceInstructionArtifact | null): string {
  if (!artifact) {
    return 'Generated by the source-debug run.'
  }

  if (artifact.status === 'validated') {
    return 'Generated by the source-debug run and used automatically during discovery and supported apply flows for this target.'
  }

  if (artifact.status === 'draft') {
    return 'This draft is used automatically for this target during discovery and supported apply flows while it remains the latest learned guidance.'
  }

  return 'Generated by the source-debug run.'
}

export function buildLearnedInstructionSections(
  artifact: SourceInstructionArtifact | null
): LearnedInstructionSection[] {
  if (!artifact) {
    return []
  }

  const seen = new Set<string>()
  const buildSection = (
    field: LearnedInstructionField,
    label: string,
    values: readonly string[],
    formatValue: (value: string) => string = (value) => value
  ): LearnedInstructionSection | null => {
    const lines = values
      .map((sourceText) => ({
        sourceText,
        displayText: normalizeLearnedInstructionLine(formatValue(sourceText))
      }))
      .filter((line) => line.displayText.length > 0)
      .filter((line) => isRenderableLearnedInstructionLine(line.displayText))
      .filter((line) => {
        const key = line.displayText.toLowerCase()

        if (seen.has(key)) {
          return false
        }

        seen.add(key)
        return true
      })
      .map((line) => ({
        ...line,
        normalizedKey: line.displayText.toLowerCase()
      }))

    return lines.length > 0 ? { field, label, lines } : null
  }

  return [
    buildSection('navigationGuidance', 'Best entry paths', artifact.navigationGuidance),
    buildSection('searchGuidance', 'Search and filters', artifact.searchGuidance),
    buildSection('detailGuidance', 'Job detail behavior', artifact.detailGuidance),
    buildSection('applyGuidance', 'Apply behavior', artifact.applyGuidance),
    buildSection('warnings', 'Warnings', artifact.warnings, (warning) => `Warning: ${warning}`)
  ].filter((section): section is LearnedInstructionSection => section !== null)
}

export function normalizeEditableInstructionInput(field: LearnedInstructionField, value: string): string {
  const trimmed = value.trim()

  if (field === 'warnings') {
    return trimmed.replace(/^warning:\s*/i, '').trim()
  }

  return trimmed
}

export function hasValidAbsoluteStartingUrl(value: string): boolean {
  try {
    const parsedUrl = new URL(value.trim())
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
  } catch {
    return false
  }
}

export function updateArtifactInstructionSection(
  artifact: SourceInstructionArtifact,
  field: LearnedInstructionField,
  normalizedKey: string,
  nextValue: string | null
): EditableSourceInstructionArtifact {
  const currentValues = [...artifact[field]]
  const replacement = nextValue === null ? null : normalizeEditableInstructionInput(field, nextValue)
  const nextValues = currentValues.flatMap((value) => {
    const valueKey = normalizeLearnedInstructionLine(field === 'warnings' ? `Warning: ${value}` : value).toLowerCase()

    if (valueKey !== normalizedKey) {
      return [value]
    }

    return replacement ? [replacement] : []
  })

  return {
    ...artifact,
    [field]: nextValues
  }
}
