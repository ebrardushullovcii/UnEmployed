import type {
  EditableSourceInstructionArtifact,
  SourceInstructionArtifact,
  SourceIntelligenceArtifact
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

export interface LearnedInstructionIntelligenceSummaryItem {
  label: string
  value: string
}

export interface LearnedInstructionIntelligenceSummary {
  title: string
  items: LearnedInstructionIntelligenceSummaryItem[]
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

const interactionLogPatterns = [
  /^(clicked|filled|selected|link|button|searchbox|textbox|combobox)\b/,
  /^click failed /,
  /locator click/,
  /call log/,
  /waiting for getbyrole/,
  /element is not visible/,
  /retrying click action/
]

const phaseBoilerplatePatterns = [
  /^stay within /,
  /^verify whether the site is reachable/,
  /^find search controls or filters/,
  /^open multiple job details/,
  /^check whether discovered jobs expose/,
  /^inspected discovered jobs for apply entry points/,
  /^observed canonical job detail url /,
  /^no reliable apply path was confirmed for /,
  /^replay verification reached /
]

const authObservationPatterns = [
  /^reliable control: no login or consent wall detected/,
  /fully accessible without login or consent walls/,
  /fully accessible without login or consent barriers/,
  /no authentication required/,
  /without auth required/,
  /loads without auth/,
  /loads without login/,
  /without login or consent barriers/,
  /accessible without login barriers/,
  /no auth or consent blockers detected/,
  /no auth consent blockers detected/,
  /no auth consent popups/
]

const toolOutputPatterns = [
  /job extraction tool confirmed/,
  /extract jobs tool/,
  /extract_jobs tool/,
  /extract_jobs returned/,
  /get interactive elements/,
  /get_interactive_elements/,
  /interactive elements detection was unreliable/,
  /interactive elements were unreliable/
]

const siteObservationPatterns = [
  /site title is in albanian/,
  /site is a job board/,
  /page language is /,
  /job listings appear to be in /,
  /means find jobs/,
  /page is scrollable with substantial content/
]

const timingPatterns = [
  /interactive elements not detected/,
  /interaction timed out/,
  /multiple timeouts observed/,
  /requires longer timeout/,
  /different extraction timing/,
  /different extraction approach/,
  /different interaction method/,
  /manual dom inspection/,
  /pointer events/,
  /pointer event interception/,
  /javascript enabled interaction/,
  /current extraction/
]

const failurePatterns = [
  /no jobs matching target roles/,
  /apply process not yet verified/,
  /apply mechanism not yet verified/,
  /job details not extracted/,
  /job details and apply flow not fully verified/,
  /llm call failed/,
  /discovery encountered an error/,
  /unknown error/
]

function matchesAnyPattern(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value))
}

export function isRenderableLearnedInstructionLine(line: string): boolean {
  const normalized = line.toLowerCase().replace(/\s+/g, ' ').trim()
  const isUrlLiteral = normalized.includes('http://') || normalized.includes('https://')
  const isOnlyStartingUrlRestatement =
    (normalized.startsWith('start from ') || normalized.startsWith('started from ')) &&
    (isUrlLiteral || normalized.includes('the starting url'))

  if (isOnlyStartingUrlRestatement || isUrlLiteral) {
    return false
  }

  if (matchesAnyPattern(normalized, interactionLogPatterns)) {
    return false
  }

  if (matchesAnyPattern(normalized, phaseBoilerplatePatterns)) {
    return false
  }

  if (matchesAnyPattern(normalized, authObservationPatterns)) {
    return false
  }

  if (normalized.includes('no login auth or consent blockers detected')) {
    return false
  }

  if (matchesAnyPattern(normalized, toolOutputPatterns)) {
    return false
  }

  if (matchesAnyPattern(normalized, siteObservationPatterns)) {
    return false
  }

  if (matchesAnyPattern(normalized, timingPatterns)) {
    return false
  }

  if (matchesAnyPattern(normalized, failurePatterns)) {
    return false
  }

  if (normalized.startsWith('verification: ')) {
    return false
  }

  if (normalized.includes('produced no candidate jobs')) {
    return false
  }

  return !/produced \d+ candidate job result/.test(normalized)
}

export function describeLearnedInstructionUsage(artifact: SourceInstructionArtifact | null): string {
  if (!artifact) {
    return 'Saved from the latest source check.'
  }

  if (artifact.status === 'validated') {
    return 'This saved guidance is used automatically for searches and supported apply flows on this source.'
  }

  if (artifact.status === 'draft') {
    return 'This draft guidance came from the latest source check and is already used automatically until you replace or re-check it.'
  }

  return 'Saved from the latest source check.'
}

function formatProviderSummary(intelligence: SourceIntelligenceArtifact): LearnedInstructionIntelligenceSummary | null {
  const provider = intelligence.provider

  if (!provider) {
    return null
  }

  const items: LearnedInstructionIntelligenceSummaryItem[] = [
    { label: 'Provider', value: provider.label },
    { label: 'Confidence', value: `${Math.round(provider.confidence * 100)}%` },
    { label: 'API', value: provider.apiAvailability.replace(/_/g, ' ') }
  ]

  if (provider.boardToken) {
    items.push({ label: 'Board token', value: provider.boardToken })
  }

  if (provider.providerIdentifier && provider.providerIdentifier !== provider.boardToken) {
    items.push({ label: 'Identifier', value: provider.providerIdentifier })
  }

  return {
    title: 'Provider intelligence',
    items
  }
}

function formatCollectionSummary(intelligence: SourceIntelligenceArtifact): LearnedInstructionIntelligenceSummary | null {
  const collection = intelligence.collection
  const bestRoute = collection.startingRoutes[0]?.url ?? collection.searchRouteTemplates[0]?.url ?? null
  const items: LearnedInstructionIntelligenceSummaryItem[] = [
    { label: 'Preferred method', value: collection.preferredMethod.replace(/_/g, ' ') },
  ]

  if (collection.rankedMethods.length > 0) {
    items.push({ label: 'Method order', value: collection.rankedMethods.join(' → ').replace(/_/g, ' ') })
  }

  if (bestRoute) {
    items.push({ label: 'Best start route', value: bestRoute })
  }

  if (collection.detailRoutePatterns[0]?.pattern) {
    items.push({ label: 'Detail pattern', value: collection.detailRoutePatterns[0].pattern })
  }

  if (collection.listingMarkers.length > 0) {
    items.push({ label: 'Listing markers', value: collection.listingMarkers.slice(0, 3).join(', ') })
  }

  return items.length > 1 || bestRoute
    ? {
        title: 'Discovery strategy',
        items,
      }
    : null
}

function formatApplySummary(intelligence: SourceIntelligenceArtifact): LearnedInstructionIntelligenceSummary | null {
  const apply = intelligence.apply
  const items: LearnedInstructionIntelligenceSummaryItem[] = [
    { label: 'Apply path', value: apply.applyPath.replace(/_/g, ' ') }
  ]

  if (apply.authMarkers.length > 0) {
    items.push({ label: 'Auth markers', value: apply.authMarkers.slice(0, 2).join(', ') })
  }

  if (apply.questionSurfaceHints.length > 0) {
    items.push({ label: 'Question hints', value: apply.questionSurfaceHints.slice(0, 2).join(', ') })
  }

  if (apply.resumeUploadHints.length > 0) {
    items.push({ label: 'Resume hints', value: apply.resumeUploadHints.slice(0, 2).join(', ') })
  }

  return items.length > 1 || apply.applyPath !== 'unknown'
    ? {
        title: 'Apply hints',
        items,
      }
    : null
}

export function buildLearnedInstructionIntelligenceSummaries(
  artifact: SourceInstructionArtifact | null
): LearnedInstructionIntelligenceSummary[] {
  return buildIntelligenceSummaries(artifact?.intelligence ?? null)
}

export function buildIntelligenceSummaries(
  intelligence: SourceIntelligenceArtifact | null
): LearnedInstructionIntelligenceSummary[] {
  if (!intelligence) {
    return []
  }

  return [
    formatProviderSummary(intelligence),
    formatCollectionSummary(intelligence),
    formatApplySummary(intelligence)
  ].filter((summary): summary is LearnedInstructionIntelligenceSummary => summary !== null)
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
