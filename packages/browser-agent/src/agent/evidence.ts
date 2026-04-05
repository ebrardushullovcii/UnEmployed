import { AgentDebugFindingsSchema, JobPostingSchema, SourceDebugPhaseEvidenceSchema, type JobPosting, type SourceDebugPhaseEvidence } from '@unemployed/contracts'
import type { AgentResult, AgentState } from '../types'
import { uniqueStrings } from '../utils/string'

interface ToolExecutionResult {
  success?: boolean
  error?: string
  data?: Record<string, unknown>
}

export type ExtractedJobInput = Pick<JobPosting,
  | 'sourceJobId'
  | 'canonicalUrl'
  | 'title'
  | 'company'
  | 'location'
  | 'description'
  | 'salaryText'
  | 'summary'
  | 'postedAt'
  | 'workMode'
  | 'applyPath'
  | 'easyApplyEligible'
  | 'keySkills'> & Partial<Pick<JobPosting,
  | 'postedAtText'
  | 'responsibilities'
  | 'minimumQualifications'
  | 'preferredQualifications'
  | 'seniority'
  | 'employmentType'
  | 'department'
  | 'team'
  | 'employerWebsiteUrl'
  | 'employerDomain'
  | 'benefits'>>

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function summarizeJobInput(job: ExtractedJobInput): string {
  const firstStructuredLine = [
    ...(job.responsibilities ?? []),
    ...(job.minimumQualifications ?? []),
    ...(job.preferredQualifications ?? [])
  ][0] ?? null

  if (firstStructuredLine) {
    return firstStructuredLine
  }

  const description = job.description.trim()
  if (!description) {
    return `${job.title} opportunity at ${job.company}`
  }

  const firstSentence = description
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .find(Boolean)

  return (firstSentence ?? description).slice(0, 280)
}

function isToolResult(value: unknown): value is ToolExecutionResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const candidate = value as Record<string, unknown>

  if ('success' in candidate && typeof candidate.success !== 'boolean') {
    return false
  }

  if ('error' in candidate && typeof candidate.error !== 'string' && typeof candidate.error !== 'undefined') {
    return false
  }

  if (
    'data' in candidate &&
    typeof candidate.data !== 'undefined' &&
    (candidate.data === null || typeof candidate.data !== 'object' || Array.isArray(candidate.data))
  ) {
    return false
  }

  return true
}

export function createEmptyPhaseEvidence(): SourceDebugPhaseEvidence {
  return SourceDebugPhaseEvidenceSchema.parse({})
}

export function appendPhaseEvidence(
  state: AgentState,
  key: keyof SourceDebugPhaseEvidence,
  values: readonly (string | null | undefined)[]
) {
  state.phaseEvidence[key] = uniqueStrings([...(state.phaseEvidence[key] ?? []), ...values])
}

export function sanitizeUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  try {
    const parsed = new URL(value)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value
  }
}

function formatControlLabel(role: string | undefined, name: string | undefined, index?: number): string | null {
  const trimmedRole = role?.trim()
  const trimmedName = name?.trim()

  if (!trimmedRole || !trimmedName) {
    return null
  }

  return `${trimmedRole} "${trimmedName}"${typeof index === 'number' && index > 0 ? ` (#${index + 1})` : ''}`
}

function normalizeInteractiveElement(value: unknown): { role?: string; name?: string; index?: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Record<string, unknown>
  const normalized: { role?: string; name?: string; index?: number } = {}

  if (typeof candidate.role === 'string') {
    normalized.role = candidate.role
  }

  if (typeof candidate.name === 'string') {
    normalized.name = candidate.name
  }

  if (typeof candidate.index === 'number' && Number.isFinite(candidate.index)) {
    normalized.index = candidate.index
  }

  return normalized
}

function buildUserFacingToolFailure(toolName: string, error: string): string {
  const normalizedError = error.toLowerCase()

  if (/timeout|timed out/i.test(normalizedError)) {
    return `${toolName} timed out.`
  }

  if (/not visible|visibility/i.test(normalizedError)) {
    return `${toolName} failed because the target was not visible.`
  }

  if (/invalid tool arguments|malformed data|unknown tool/i.test(normalizedError)) {
    return `${toolName} failed because the tool response was invalid.`
  }

  if (/404|not-found route/i.test(normalizedError)) {
    return `${toolName} reached a broken route.`
  }

  return `${toolName} failed.`
}

export function synthesizeFallbackDebugFindings(state: AgentState): NonNullable<AgentResult['debugFindings']> | null {
  const reliableControls = state.phaseEvidence.visibleControls.slice(0, 4)
  const currentUrl = sanitizeUrl(state.currentUrl)
  const navigationTips = uniqueStrings([
    ...state.phaseEvidence.routeSignals.slice(0, 4),
    currentUrl ? `Last observed jobs surface: ${currentUrl}` : null
  ])
  const applyTips = uniqueStrings([
    state.collectedJobs.some((job) => job.applyPath === 'easy_apply' || job.easyApplyEligible)
      ? 'Use the on-site apply entry when the detail page exposes it.'
      : null,
    state.collectedJobs.some((job) => job.applyPath === 'external_redirect')
      ? 'Expect some listings to hand off apply to an external destination.'
      : null,
    state.collectedJobs.length > 0 &&
    !state.collectedJobs.some((job) => job.applyPath === 'easy_apply' || job.easyApplyEligible || job.applyPath === 'external_redirect')
      ? 'Treat applications as manual until a reliable on-site apply entry is proven.'
      : null
  ])
  const warnings = state.phaseEvidence.warnings.slice(0, 4)

  if (
    reliableControls.length === 0 &&
    navigationTips.length === 0 &&
    applyTips.length === 0 &&
    warnings.length === 0
  ) {
    return null
  }

  return AgentDebugFindingsSchema.parse({
    summary: uniqueStrings([
      navigationTips[0] ?? null,
      reliableControls[0] ? 'Observed reusable controls on the jobs surface, but the phase timed out before a structured finish.' : null,
      currentUrl ? `Observed a partial jobs surface at ${currentUrl}, but the phase timed out before structured completion.` : null
    ])[0] ?? 'The phase timed out before structured completion.',
    reliableControls,
    trickyFilters: [],
    navigationTips,
    applyTips,
    warnings
  })
}

export function hasMeaningfulPhaseEvidence(state: AgentState): boolean {
  return (
    state.phaseEvidence.visibleControls.length > 0 ||
    state.phaseEvidence.successfulInteractions.length > 0 ||
    state.phaseEvidence.routeSignals.length > 0 ||
    state.phaseEvidence.attemptedControls.length > 0 ||
    state.phaseEvidence.warnings.length > 0 ||
    state.collectedJobs.length > 0
  )
}

export function recordToolEvidence(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
  state: AgentState
) {
  const normalizedResult = isToolResult(result) ? result : {}
  const controlLabel = formatControlLabel(
    typeof args.role === 'string' ? args.role : undefined,
    typeof args.name === 'string' ? args.name : undefined,
    typeof args.index === 'number' ? args.index : undefined
  )

  if (toolName === 'get_interactive_elements' && normalizedResult.success && normalizedResult.data) {
    const elements = Array.isArray(normalizedResult.data.elements)
      ? normalizedResult.data.elements
          .map((element) => normalizeInteractiveElement(element))
          .filter((element): element is { role?: string; name?: string; index?: number } => element !== null)
      : []
    appendPhaseEvidence(
      state,
      'visibleControls',
      elements.slice(0, 8).map((element) => formatControlLabel(element.role, element.name, element.index))
    )
    return
  }

  if (toolName === 'navigate') {
    const reachedUrl = typeof normalizedResult.data?.url === 'string' ? sanitizeUrl(normalizedResult.data.url) : null
    const requestedUrl = typeof normalizedResult.data?.requestedUrl === 'string' ? sanitizeUrl(normalizedResult.data.requestedUrl) : null
    appendPhaseEvidence(state, 'routeSignals', [
      normalizedResult.success && reachedUrl
        ? `Navigation reached ${reachedUrl}`
        : requestedUrl
          ? `Tried navigation to ${requestedUrl}`
          : null
    ])
  }

  if (toolName === 'click' || toolName === 'fill' || toolName === 'select_option') {
    const optionText = typeof args.optionText === 'string' ? args.optionText.trim() : ''
    appendPhaseEvidence(state, 'attemptedControls', [
      controlLabel
        ? toolName === 'click'
          ? `Attempted to click ${controlLabel}`
          : toolName === 'fill'
            ? `Attempted to fill ${controlLabel}`
            : `Attempted to select "${optionText}" from ${controlLabel}`
        : null
    ])
  }

  if (toolName === 'click' && normalizedResult.success) {
    appendPhaseEvidence(state, 'successfulInteractions', [controlLabel ? `Clicked ${controlLabel}` : null])
  }

  if (toolName === 'fill' && normalizedResult.success) {
    appendPhaseEvidence(state, 'successfulInteractions', [
      controlLabel ? `Filled ${controlLabel}` : null
    ])
  }

  if (toolName === 'select_option' && normalizedResult.success) {
    const optionText = typeof args.optionText === 'string' ? args.optionText.trim() : ''
    appendPhaseEvidence(state, 'successfulInteractions', [
      controlLabel ? `Selected "${optionText}" from ${controlLabel}` : null
    ])
  }

  if (toolName === 'scroll_down' && normalizedResult.success) {
    const currentUrl = sanitizeUrl(state.currentUrl)
    appendPhaseEvidence(state, 'successfulInteractions', ['Scrolled down on the current jobs surface'])
    appendPhaseEvidence(state, 'routeSignals', [
      normalizedResult.data?.newContentLoaded === true && currentUrl
        ? `Scrolling revealed additional content on ${currentUrl}`
        : null
    ])
  }

  if (toolName === 'scroll_to_top' && normalizedResult.success) {
    const currentUrl = sanitizeUrl(state.currentUrl)
    appendPhaseEvidence(state, 'successfulInteractions', ['Returned to the top of the current page to re-check header controls'])
    appendPhaseEvidence(state, 'routeSignals', [
      currentUrl ? `Returned to the top of ${currentUrl} to probe header controls again` : null
    ])
  }

  if ((toolName === 'click' || toolName === 'fill' || toolName === 'select_option') && normalizedResult.success && normalizedResult.data) {
    const newUrl = typeof normalizedResult.data.newUrl === 'string' ? sanitizeUrl(normalizedResult.data.newUrl) : null
    if (newUrl) {
      appendPhaseEvidence(state, 'routeSignals', [
        `${toolName === 'click' ? 'Control click' : toolName === 'fill' ? 'Search submit' : 'Dropdown selection'} opened ${newUrl}`
      ])
    }
  }

  if (toolName === 'extract_jobs' && normalizedResult.success && normalizedResult.data) {
    const jobsExtracted = typeof normalizedResult.data.jobsExtracted === 'number' ? normalizedResult.data.jobsExtracted : 0
    const pageUrl = typeof normalizedResult.data.pageUrl === 'string'
      ? sanitizeUrl(normalizedResult.data.pageUrl)
      : sanitizeUrl(state.currentUrl)
    appendPhaseEvidence(state, 'routeSignals', [
      jobsExtracted > 0 ? `Job extraction found ${jobsExtracted} candidate jobs on ${pageUrl}` : null
    ])
  }

  if (normalizedResult.error) {
    console.error('[Agent] Tool failed during evidence recording:', {
      toolName,
      error: normalizedResult.error
    })
    appendPhaseEvidence(state, 'warnings', [buildUserFacingToolFailure(toolName, normalizedResult.error)])
  }
}

function normalizeJobWorkMode(job: Pick<JobPosting, 'workMode'>): JobPosting['workMode'] {
  const allowedWorkModes = ['remote', 'hybrid', 'onsite', 'flexible'] as const
  const validWorkModes = Array.isArray(job.workMode)
    ? job.workMode.filter((mode): mode is typeof allowedWorkModes[number] => allowedWorkModes.includes(mode))
    : []

  return validWorkModes.length > 0 ? validWorkModes : ['flexible']
}

export function addExtractedJobsToState(
  extractedJobs: readonly ExtractedJobInput[],
  state: AgentState,
  source: JobPosting['source']
): number {
  let addedCount = 0

  for (const job of extractedJobs) {
    const exists = state.collectedJobs.some((existingJob) =>
      existingJob.sourceJobId === job.sourceJobId ||
      (Boolean(existingJob.canonicalUrl) && Boolean(job.canonicalUrl) && existingJob.canonicalUrl === job.canonicalUrl)
    )
    if (exists) {
      continue
    }

    const jobToAdd = {
      source,
      sourceJobId: job.sourceJobId,
      discoveryMethod: 'browser_agent' as const,
      canonicalUrl: job.canonicalUrl,
      title: job.title,
      company: job.company,
      location: job.location,
      workMode: normalizeJobWorkMode(job),
      applyPath: ['easy_apply', 'external_redirect', 'unknown'].includes(job.applyPath as string)
        ? job.applyPath
        : 'unknown',
      easyApplyEligible: job.easyApplyEligible ?? false,
      postedAt: job.postedAt ?? null,
      postedAtText: trimToNull(job.postedAtText),
      discoveredAt: new Date().toISOString(),
      salaryText: job.salaryText || null,
      summary: trimToNull(job.summary) ?? summarizeJobInput(job),
      description: job.description,
      keySkills: job.keySkills ?? [],
      responsibilities: job.responsibilities ?? [],
      minimumQualifications: job.minimumQualifications ?? [],
      preferredQualifications: job.preferredQualifications ?? [],
      seniority: trimToNull(job.seniority),
      employmentType: trimToNull(job.employmentType),
      department: trimToNull(job.department),
      team: trimToNull(job.team),
      employerWebsiteUrl: trimToNull(job.employerWebsiteUrl),
      employerDomain: trimToNull(job.employerDomain),
      benefits: job.benefits ?? []
    }

    const validation = JobPostingSchema.safeParse(jobToAdd)
    if (!validation.success) {
      console.warn(`[Agent] Skipping invalid job ${job.sourceJobId}:`, validation.error)
      continue
    }

    state.collectedJobs.push(validation.data)
    addedCount += 1
  }

  return addedCount
}
