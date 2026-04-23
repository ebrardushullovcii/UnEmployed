import type { Page } from 'playwright'
import type { AgentConfig, AgentState, DeferredSearchExtraction, OnProgressCallback, ToolCall } from '../types'
import { isAllowedUrl } from '../allowlist'
import { getToolExecutor } from '../tools'
import type { JobExtractor } from '../agent'
import { addExtractedJobsToState } from './evidence'
import {
  isClosedPageError,
  isClosedPageErrorMessage,
  waitForRetryDelay,
} from './discovery-helpers'
import { buildSearchResultCardMergeKey, buildStructuredCandidateJobs } from './job-extraction'
import {
  DEFAULT_SEARCH_RESULTS_EXTRACTION_REVIEW_BUDGET,
  getSearchResultsExtractionReviewBudget,
} from './search-results-budget'

const SEEDED_QUERY_GUARD_TOOLS = new Set(['navigate', 'click', 'fill', 'select_option', 'go_back'])
const SEEDED_QUERY_GUARD_LOCATION_NOISE = new Set(['remote', 'hybrid', 'on', 'site'])
const SEEDED_QUERY_IGNORED_PARAMS = new Set(['page', 'currentJobId', 'selectedJobId', 'trk', 'trackingId'])
const SEEDED_QUERY_PATH_HINTS = ['search', 'results', 'find', 'query']
const LOCATION_LIKE_QUERY_PARAMS = new Set(['location', 'loc', 'city', 'region', 'geoId'])

type SeededSearchQuery = {
  seedUrl: string
  seedPathname: string
  seedHostname: string
  paramTokens: Map<string, string[]>
}

function isSeededSearchSurfaceUrl(value: string, seedUrl?: string): boolean {
  try {
    const url = new URL(value)
    const pathname = url.pathname.toLowerCase()
    const looksLikeSearchPath = pathname === '/' || SEEDED_QUERY_PATH_HINTS.some((hint) => pathname.includes(hint))

    if (looksLikeSearchPath) {
      return true
    }

    if (!seedUrl) {
      return false
    }

    const seededUrl = new URL(seedUrl)
    return url.hostname.toLowerCase() === seededUrl.hostname.toLowerCase() &&
      pathname === seededUrl.pathname.toLowerCase()
  } catch {
    return false
  }
}

function normalizeSeededQueryValue(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokenizeSeededQueryValue(
  value: string,
  paramName: string,
): string[] {
  const tokens = normalizeSeededQueryValue(value)
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => token.length > 1)

  if (!LOCATION_LIKE_QUERY_PARAMS.has(paramName)) {
    return [...new Set(tokens)]
  }

  return [...new Set(tokens.filter((token) => !SEEDED_QUERY_GUARD_LOCATION_NOISE.has(token)))]
}

function parseSearchQueryUrl(value: string, seedUrl?: string): {
  hostname: string
  pathname: string
  paramTokens: Map<string, string[]>
} | null {
  try {
    const url = new URL(value)
    const pathname = url.pathname.toLowerCase()

    if (!isSeededSearchSurfaceUrl(value, seedUrl)) {
      return null
    }

    const paramTokens = new Map<string, string[]>()
    for (const [key, rawValue] of url.searchParams.entries()) {
      if (SEEDED_QUERY_IGNORED_PARAMS.has(key)) {
        continue
      }

      const trimmedValue = rawValue.trim()
      if (!trimmedValue) {
        continue
      }

      const upperValue = trimmedValue.toUpperCase()
      if (
        upperValue === 'JOB_TITLE' ||
        upperValue === 'LOCATION' ||
        upperValue === 'GEO_ID' ||
        upperValue === 'KEYWORDS' ||
        upperValue === 'QUERY'
      ) {
        continue
      }

      const tokens = tokenizeSeededQueryValue(trimmedValue, key)
      if (tokens.length > 0) {
        paramTokens.set(key, tokens)
      }
    }

    return {
      hostname: url.hostname.toLowerCase(),
      pathname,
      paramTokens,
    }
  } catch {
    return null
  }
}

function hasPlaceholderQueryValues(value: string): boolean {
  try {
    const url = new URL(value)
    return [...url.searchParams.entries()].some(([key, rawValue]) => {
      if (SEEDED_QUERY_IGNORED_PARAMS.has(key)) {
        return false
      }

      const paramValue = rawValue.trim().toUpperCase()
      return paramValue === 'JOB_TITLE' ||
        paramValue === 'LOCATION' ||
        paramValue === 'GEO_ID' ||
        paramValue === 'KEYWORDS' ||
        paramValue === 'QUERY'
    })
  } catch {
    return false
  }
}

function parseSeededSearchQuery(config: AgentConfig): SeededSearchQuery | null {
  for (const value of config.startingUrls) {
    if (hasPlaceholderQueryValues(value)) {
      continue
    }

    const parsed = parseSearchQueryUrl(value, value)

    if (!parsed) {
      continue
    }

    if (parsed.paramTokens.size === 0) {
      continue
    }

    return {
      seedUrl: value,
      seedPathname: parsed.pathname,
      seedHostname: parsed.hostname,
      paramTokens: parsed.paramTokens,
    }
  }

  return null
}

function queryDropsSeededTokens(candidateTokens: readonly string[], seededTokens: readonly string[]): boolean {
  if (seededTokens.length === 0) {
    return false
  }

  if (candidateTokens.length === 0) {
    return true
  }

  const candidateSet = new Set(candidateTokens)
  return seededTokens.some((token) => !candidateSet.has(token))
}

export function detectSeededSearchQueryDrift(input: {
  config: AgentConfig
  state: Pick<AgentState, 'collectedJobs' | 'deferredSearchExtractions'>
  url: string
  previousUrl?: string
}): string | null {
  const seededQuery = parseSeededSearchQuery(input.config)
  if (!seededQuery) {
    return null
  }

  const hasCandidateEvidence =
    input.state.collectedJobs.length > 0 || input.state.deferredSearchExtractions.size > 0
  const leftSeededSearchSurfaceEarly =
    !hasCandidateEvidence &&
    isSeededSearchSurfaceUrl(input.previousUrl ?? seededQuery.seedUrl, seededQuery.seedUrl) &&
    !isSeededSearchSurfaceUrl(input.url, seededQuery.seedUrl)

  if (leftSeededSearchSurfaceEarly) {
    return 'Blocked a route change away from the seeded search results before extraction proved that the seeded route was insufficient. Stay on the seeded search surface unless it is clearly broken.'
  }

  if (!hasCandidateEvidence) {
    if (hasPlaceholderQueryValues(input.url)) {
      return 'Blocked a search URL that uses placeholder query values instead of the seeded search terms. Stay on the seeded search surface unless a real in-scope query has been proven.'
    }

    return null
  }

  const candidateQuery = parseSearchQueryUrl(input.url, seededQuery.seedUrl)
  if (!candidateQuery) {
    return isSeededSearchSurfaceUrl(input.url, seededQuery.seedUrl)
      ? null
      : 'Blocked a route change away from the seeded search results after this run already captured evidence. Stay on the seeded search surface unless it is clearly broken.'
  }

  const dropsSeededQuery = [...seededQuery.paramTokens.entries()].some(([key, seededTokens]) =>
    queryDropsSeededTokens(candidateQuery.paramTokens.get(key) ?? [], seededTokens),
  )

  if (!dropsSeededQuery) {
    return null
  }

  return 'Blocked a broader seeded query because this run already captured evidence from the original search. Keep using the seeded search terms unless that exact query is clearly invalid.'
}

function getCurrentPageUrl(page: Page, fallbackUrl: string): string {
  try {
    return page.url() || fallbackUrl
  } catch {
    return fallbackUrl
  }
}

function is404LikeTrackableUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return /(^|\/)(404|not-found)(\/|$)/i.test(url.pathname)
  } catch {
    return /(^|\/)(404|not-found)(\/|$)/i.test(value)
  }
}

function syncCurrentUrlTracking(input: {
  state: AgentState
  config: AgentConfig
  url: string
}): void {
  const nextUrl = input.url.trim()
  if (!nextUrl || nextUrl === 'about:blank') {
    return
  }

  if (!isAllowedUrl(nextUrl, input.config.navigationPolicy).valid) {
    return
  }

  input.state.currentUrl = nextUrl
  input.state.visitedUrls.add(nextUrl)

  const guardViolation = detectSeededSearchQueryDrift({
    config: input.config,
    state: input.state,
    url: nextUrl,
    ...(input.state.lastStableUrl ? { previousUrl: input.state.lastStableUrl } : {}),
  })

  if (!guardViolation && !is404LikeTrackableUrl(nextUrl)) {
    input.state.lastStableUrl = nextUrl
  }
}

async function restoreAfterSeededQueryGuard(input: {
  pageRef: { current: Page }
  state: AgentState
  config: AgentConfig
  previousUrl: string
}): Promise<string | null> {
  const seededQuery = parseSeededSearchQuery(input.config)
  const restoreCandidates = [...new Set([input.previousUrl, seededQuery?.seedUrl ?? null])].filter(
    (value): value is string => Boolean(value),
  )

  for (const candidateUrl of restoreCandidates) {
    const urlValidation = isAllowedUrl(candidateUrl, input.config.navigationPolicy)
    if (!urlValidation.valid) {
      continue
    }

    const guardViolation = detectSeededSearchQueryDrift({
      config: input.config,
      state: input.state,
      url: candidateUrl,
      previousUrl: input.previousUrl,
    })
    if (guardViolation) {
      continue
    }

    try {
      await input.pageRef.current.goto(candidateUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      })
      const restoredUrl = input.pageRef.current.url() || candidateUrl
      const restoredGuardViolation = detectSeededSearchQueryDrift({
        config: input.config,
        state: input.state,
        url: restoredUrl,
        previousUrl: input.previousUrl,
      })
      if (restoredGuardViolation) {
        continue
      }

      input.state.currentUrl = restoredUrl
      input.state.lastStableUrl = restoredUrl
      input.state.visitedUrls.add(restoredUrl)
      input.state.failedInteractionAttempts?.clear()
      delete input.state.failedInteractionPageStateToken
      return restoredUrl
    } catch {
      continue
    }
  }

  return null
}

export async function restoreSeededQuerySurfaceIfNeeded(input: {
  pageRef: { current: Page }
  state: AgentState
  config: AgentConfig
}): Promise<{
  blockedUrl: string
  guardMessage: string
  restoredUrl: string | null
} | null> {
  const currentUrl = getCurrentPageUrl(input.pageRef.current, input.state.currentUrl)
  if (!currentUrl) {
    return null
  }

  const seededQuery = parseSeededSearchQuery(input.config)
  const previousUrl = input.state.lastStableUrl || seededQuery?.seedUrl || currentUrl
  const guardMessage = detectSeededSearchQueryDrift({
    config: input.config,
    state: input.state,
    url: currentUrl,
    previousUrl,
  })

  if (!guardMessage) {
    syncCurrentUrlTracking({
      state: input.state,
      config: input.config,
      url: currentUrl,
    })
    return null
  }

  const restoredUrl = await restoreAfterSeededQueryGuard({
    pageRef: input.pageRef,
    state: input.state,
    config: input.config,
    previousUrl,
  })

  return {
    blockedUrl: currentUrl,
    guardMessage,
    restoredUrl,
  }
}

function isExtractJobsPayload(value: unknown): value is {
  pageText: string
  pageUrl: string
  pageType: string
  readyForExtraction: boolean
  structuredDataCandidates?: unknown
  cardCandidates?: unknown
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.pageText === 'string' &&
    typeof candidate.pageUrl === 'string' &&
    typeof candidate.pageType === 'string' &&
    typeof candidate.readyForExtraction === 'boolean'
  )
}

function redactToolArgs(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(() => '[REDACTED]')
  }

  if (!value || typeof value !== 'object') {
    return '[REDACTED]'
  }

  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>).map((key) => [key, '[REDACTED]'])
  )
}

function describeToolAction(toolName: string): string {
  switch (toolName) {
    case 'navigate':
      return 'Opening the next page.'
    case 'click':
      return 'Opening a result, detail page, or in-page control.'
    case 'fill':
      return 'Filling a form or filter control.'
    case 'select_option':
      return 'Choosing a value from the current page.'
    case 'scroll_down':
      return 'Scrolling to reveal more results.'
    case 'go_back':
      return 'Returning to the previous page.'
    case 'extract_jobs':
      return 'Preparing the current page for job extraction.'
    case 'finish':
      return 'Wrapping up this browser pass.'
    default:
      return `Executing ${toolName.replace(/_/g, ' ')}.`
  }
}

function buildDeferredSearchExtractionKey(pageUrl: string): string {
  try {
    const parsedUrl = new URL(pageUrl)
    const removableParams = ['currentJobId', 'selectedJobId', 'jobId', 'trk', 'trackingId']

    for (const key of removableParams) {
      parsedUrl.searchParams.delete(key)
    }

    parsedUrl.hash = ''
    const normalizedSearch = parsedUrl.searchParams.toString()

    return `${parsedUrl.origin}${parsedUrl.pathname}${normalizedSearch ? `?${normalizedSearch}` : ''}`
  } catch {
    return pageUrl
  }
}

function createDeferredSearchExtraction(input: {
  pageUrl: string
  pageText: string
  structuredDataCandidates?: Parameters<typeof buildStructuredCandidateJobs>[0]['structuredDataCandidates']
  cardCandidates?: Parameters<typeof buildStructuredCandidateJobs>[0]['cardCandidates']
}): DeferredSearchExtraction {
  return {
    key: buildDeferredSearchExtractionKey(input.pageUrl),
    pageUrl: input.pageUrl,
    pageText: input.pageText,
    capturedAt: new Date().toISOString(),
    structuredDataCandidates: input.structuredDataCandidates ? [...input.structuredDataCandidates] : [],
    cardCandidates: input.cardCandidates ? [...input.cardCandidates] : []
  }
}

function getStructuredCandidateKey(candidate: Parameters<typeof buildStructuredCandidateJobs>[0]['structuredDataCandidates'] extends readonly (infer T)[] | undefined ? T : never): string {
  const canonicalUrl = typeof candidate?.canonicalUrl === 'string' ? candidate.canonicalUrl.trim() : ''
  if (canonicalUrl) {
    return `url:${canonicalUrl}`
  }

  const sourceJobId = typeof candidate?.sourceJobId === 'string' ? candidate.sourceJobId.trim() : ''
  if (sourceJobId) {
    return `job:${sourceJobId}`
  }

  return `raw:${JSON.stringify(candidate)}`
}

function getCardCandidateKey(
  pageUrl: string,
  candidate: Parameters<typeof buildStructuredCandidateJobs>[0]['cardCandidates'] extends readonly (infer T)[] | undefined ? T : never,
): string {
  return buildSearchResultCardMergeKey({
    pageUrl,
    candidate,
  })
}

function mergeCandidateList<T>(
  existing: readonly T[] | undefined,
  incoming: readonly T[] | undefined,
  getKey: (candidate: T) => string
): T[] {
  const merged = new Map<string, T>()

  const getRichnessScore = (candidate: T): number => {
    if (!candidate || typeof candidate !== 'object') {
      return 0
    }

    return Object.values(candidate as Record<string, unknown>).reduce<number>((score, value) => {
      if (typeof value === 'string') {
        return score + (value.trim() ? 1 : 0)
      }

      if (Array.isArray(value)) {
        return score + (value.length > 0 ? 1 : 0)
      }

      return score + (value == null ? 0 : 1)
    }, 0)
  }

  for (const candidate of existing ?? []) {
    merged.set(getKey(candidate), candidate)
  }

  for (const candidate of incoming ?? []) {
    const key = getKey(candidate)
    const current = merged.get(key)

    if (!current || getRichnessScore(candidate) > getRichnessScore(current)) {
      merged.set(key, candidate)
    }
  }

  return [...merged.values()]
}

function mergeDeferredSearchExtraction(
  existing: DeferredSearchExtraction | undefined,
  incoming: DeferredSearchExtraction
): DeferredSearchExtraction {
  if (!existing) {
    return incoming
  }

  const mergedStructuredCandidates = mergeCandidateList(
    existing.structuredDataCandidates,
    incoming.structuredDataCandidates,
    getStructuredCandidateKey
  )
  const mergedCardCandidates = mergeCandidateList(
    existing.cardCandidates,
    incoming.cardCandidates,
    (candidate) => getCardCandidateKey(existing.pageUrl || incoming.pageUrl, candidate)
  )
  const shouldPreferIncomingPageText =
    incoming.pageText.length >= existing.pageText.length ||
    mergedStructuredCandidates.length > (existing.structuredDataCandidates?.length ?? 0) ||
    mergedCardCandidates.length > (existing.cardCandidates?.length ?? 0)

  return {
    ...existing,
    ...(shouldPreferIncomingPageText ? {
      pageText: incoming.pageText,
      capturedAt: incoming.capturedAt
    } : {}),
    structuredDataCandidates: mergedStructuredCandidates,
    cardCandidates: mergedCardCandidates
  }
}

async function recoverClosedPage(input: {
  config: AgentConfig
  pageRef: { current: Page }
  state: AgentState
  toolName: string
  onProgress?: OnProgressCallback
}): Promise<boolean> {
  if (!input.config.resolveLivePage) {
    return false
  }

  const livePage = await input.config.resolveLivePage()
  input.pageRef.current = livePage
  const recoveredUrl = livePage.url()
  if (recoveredUrl) {
    input.state.currentUrl = recoveredUrl
    if (recoveredUrl !== 'about:blank') {
      input.state.lastStableUrl = recoveredUrl
      input.state.visitedUrls.add(recoveredUrl)
    }
  }

  input.onProgress?.({
    currentUrl: input.state.currentUrl,
    jobsFound: input.state.collectedJobs.length,
    stepCount: input.state.stepCount,
    currentAction: `recover_page:${input.toolName}`,
    message: 'Recovered to a live browser page after the previous tab or page closed.',
    waitReason: 'waiting_on_page',
    targetId: null,
    adapterKind: input.config.source,
  })

  return true
}

export async function executeToolCall(
  toolCall: ToolCall,
  pageRef: { current: Page },
  state: AgentState,
  config: AgentConfig,
  jobExtractor: JobExtractor,
  onProgress?: OnProgressCallback,
  signal?: AbortSignal
): Promise<unknown> {
  const toolName = toolCall.function.name
  let args: Record<string, unknown> = {}
  try {
    const parsedArgs = JSON.parse(toolCall.function.arguments || '{}')
    if (!parsedArgs || typeof parsedArgs !== 'object' || Array.isArray(parsedArgs)) {
      throw new Error('Tool arguments must be a JSON object')
    }
    args = parsedArgs
  } catch (parseError) {
    console.error(`[Agent] Failed to parse tool arguments for ${toolName}:`, parseError)
    return {
      success: false,
      error: `Invalid tool arguments for ${toolName}`
    }
  }

  const redactedArgs = redactToolArgs(args)
  const previousUrl = state.currentUrl || pageRef.current.url() || ''

  onProgress?.({
    currentUrl: state.currentUrl,
    jobsFound: state.collectedJobs.length,
    stepCount: state.stepCount,
    currentAction: `${toolName}: ${JSON.stringify(redactedArgs)}`,
    message: describeToolAction(toolName),
    waitReason: 'executing_tool',
    targetId: null,
    adapterKind: config.source
  })

  const tool = getToolExecutor(toolName)
  if (!tool) {
    return {
      success: false,
      error: `Unknown tool: ${toolName}`
    }
  }

  const maxRetries = 3
  const shouldRetry = tool.retryable === true
  let hasRecoveredClosedPage = false
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      const page = pageRef.current
      const result = await tool.execute(args, { page, state, config })
      const currentUrl = getCurrentPageUrl(pageRef.current, state.currentUrl)

      if (SEEDED_QUERY_GUARD_TOOLS.has(toolName) && result.success !== false) {
        const guardMessage = detectSeededSearchQueryDrift({
          config,
          state,
          url: currentUrl,
          previousUrl,
        })

        if (guardMessage) {
          const restoredUrl = await restoreAfterSeededQueryGuard({
            pageRef,
            state,
            config,
            previousUrl,
          })

          return {
            success: false,
            error: guardMessage,
            data: {
              errorType: 'seeded_query_broadening_blocked',
              blockedUrl: currentUrl,
              restoredUrl,
            },
          }
        }
      }

      syncCurrentUrlTracking({
        state,
        config,
        url: currentUrl,
      })

      if (
        result.success === false &&
        isClosedPageErrorMessage(result.error) &&
        !hasRecoveredClosedPage &&
        config.resolveLivePage
      ) {
        try {
          hasRecoveredClosedPage = await recoverClosedPage({
            config,
            pageRef,
            state,
            toolName,
            ...(onProgress ? { onProgress } : {}),
          })
          continue
        } catch (resolveError) {
          throw resolveError
        }
      }

      if (toolName !== 'extract_jobs' || !result.success || !result.data) {
        return result
      }

      if (!isExtractJobsPayload(result.data)) {
        return {
          success: false,
          error: 'extract_jobs returned malformed data'
        }
      }

      const extractData = result.data

      if (!extractData.readyForExtraction) {
        return result
      }

      const normalizedPageType = extractData.pageType === 'job_detail'
        ? 'job_detail'
        : 'search_results'
      const remainingJobs = Math.max(0, config.targetJobCount - state.collectedJobs.length)
      const expandedSearchResultsBudget = getSearchResultsExtractionReviewBudget(config)
      const maxJobs = normalizedPageType === 'search_results'
        ? expandedSearchResultsBudget == null
          ? Math.min(remainingJobs, DEFAULT_SEARCH_RESULTS_EXTRACTION_REVIEW_BUDGET)
          : Math.max(remainingJobs, expandedSearchResultsBudget)
        : remainingJobs
      const requestedMaxJobs = typeof args.maxJobs === 'number' && Number.isFinite(args.maxJobs)
        ? Math.max(0, Math.floor(args.maxJobs))
        : null
      const effectiveMaxJobs =
        normalizedPageType === 'search_results' && expandedSearchResultsBudget != null
          ? maxJobs
          : requestedMaxJobs == null
            ? maxJobs
            : Math.min(requestedMaxJobs, maxJobs)
      const structuredDataCandidates = Array.isArray(extractData.structuredDataCandidates)
        ? extractData.structuredDataCandidates as NonNullable<Parameters<typeof buildStructuredCandidateJobs>[0]['structuredDataCandidates']>
        : []
      const cardCandidates = Array.isArray(extractData.cardCandidates)
        ? extractData.cardCandidates as NonNullable<Parameters<typeof buildStructuredCandidateJobs>[0]['cardCandidates']>
        : []
      const fastPathJobs = normalizedPageType === 'search_results'
        ? buildStructuredCandidateJobs({
            pageUrl: extractData.pageUrl,
            maxJobs: effectiveMaxJobs,
            structuredDataCandidates,
            cardCandidates,
            searchPreferences: config.searchPreferences,
          })
        : []
      const fastPathAddedCount = addExtractedJobsToState(fastPathJobs, state, config.source)
      const remainingJobsAfterFastPath = Math.max(0, config.targetJobCount - state.collectedJobs.length)
      const remainingSearchResultsBudget = normalizedPageType === 'search_results'
        ? expandedSearchResultsBudget == null
          ? Math.min(remainingJobsAfterFastPath, Math.max(0, effectiveMaxJobs - fastPathAddedCount))
          : Math.max(0, effectiveMaxJobs - fastPathAddedCount)
        : remainingJobsAfterFastPath

      if (fastPathAddedCount > 0) {
        console.log(`[Agent] +${fastPathAddedCount} jobs (${state.collectedJobs.length} total) from structured extraction ${extractData.pageUrl.slice(0, 60)}...`)
      }

      const shouldDeferSearchExtraction =
        normalizedPageType === 'search_results' &&
        !config.promptContext.taskPacket &&
        remainingJobsAfterFastPath > 0 &&
        remainingSearchResultsBudget > 0

      if (shouldDeferSearchExtraction) {
        const deferredSnapshot = createDeferredSearchExtraction({
          pageUrl: extractData.pageUrl,
          pageText: extractData.pageText,
          structuredDataCandidates,
          cardCandidates,
        })
        const existingSnapshot = state.deferredSearchExtractions.get(deferredSnapshot.key)

        state.deferredSearchExtractions.set(
          deferredSnapshot.key,
          mergeDeferredSearchExtraction(existingSnapshot, deferredSnapshot)
        )

        onProgress?.({
          currentUrl: extractData.pageUrl,
          jobsFound: state.collectedJobs.length,
          stepCount: state.stepCount,
          currentAction: 'defer_extract_jobs',
          message: fastPathAddedCount > 0
            ? state.deferredSearchExtractions.size === 1
              ? `Kept ${fastPathAddedCount} new job${fastPathAddedCount === 1 ? '' : 's'} from fast extraction and captured this results page for deeper review.`
              : `Kept ${fastPathAddedCount} new job${fastPathAddedCount === 1 ? '' : 's'} from fast extraction and captured this results page for deeper review (${state.deferredSearchExtractions.size} queued).`
            : state.deferredSearchExtractions.size === 1
              ? 'Captured this results page for end-of-run extraction.'
              : `Captured this results page for end-of-run extraction (${state.deferredSearchExtractions.size} queued).`,
          waitReason: 'extracting_jobs',
          targetId: null,
          adapterKind: config.source
        })

        return {
          ...result,
          data: {
            ...result.data,
            jobsExtracted: fastPathAddedCount,
            fastPathJobsExtracted: fastPathAddedCount,
            jobsDeferred: state.deferredSearchExtractions.size,
            totalJobs: state.collectedJobs.length,
            deferredExtraction: true
          }
        }
      }

      const shouldSkipSlowSearchResultsExtraction =
        normalizedPageType === 'search_results' &&
        Boolean(config.promptContext.taskPacket) &&
        fastPathAddedCount > 0 &&
        remainingSearchResultsBudget === 0

      if (shouldSkipSlowSearchResultsExtraction) {
        console.log(
          `[Agent] Skipping slower model extraction for phase-driven search results after fast path added ${fastPathAddedCount} job${fastPathAddedCount === 1 ? '' : 's'} from ${extractData.pageUrl.slice(0, 60)}...`,
        )
      }

      onProgress?.({
        currentUrl: extractData.pageUrl,
        jobsFound: state.collectedJobs.length,
        stepCount: state.stepCount,
        currentAction: 'extract_jobs',
        message: 'Extracting jobs from the current page.',
        waitReason: 'extracting_jobs',
        targetId: null,
        adapterKind: config.source
      })
      const shouldRunSlowExtraction =
        remainingJobsAfterFastPath > 0 &&
        remainingSearchResultsBudget > 0 &&
        !shouldSkipSlowSearchResultsExtraction
      const extractedJobs = !shouldRunSlowExtraction
        ? []
        : await jobExtractor.extractJobsFromPage({
            pageText: extractData.pageText,
            pageUrl: extractData.pageUrl,
            pageType: normalizedPageType,
            maxJobs: remainingSearchResultsBudget
          })
      const addedCount = addExtractedJobsToState(extractedJobs, state, config.source)
      const totalAddedCount = fastPathAddedCount + addedCount

      if (addedCount > 0) {
        console.log(`[Agent] +${addedCount} jobs (${state.collectedJobs.length} total) from ${extractData.pageUrl.slice(0, 60)}...`)
      }

      onProgress?.({
        currentUrl: extractData.pageUrl,
        jobsFound: state.collectedJobs.length,
        stepCount: state.stepCount,
        currentAction: `extract_result:${totalAddedCount}:${state.collectedJobs.length}:${fastPathJobs.length + extractedJobs.length}`,
        message: totalAddedCount > 0
          ? `Kept ${totalAddedCount} new job${totalAddedCount === 1 ? '' : 's'} from this extraction pass.`
          : 'Reviewed the extraction pass and kept no new jobs.',
        waitReason: 'extracting_jobs',
        targetId: null,
        adapterKind: config.source
      })

      return {
        ...result,
        data: {
          ...result.data,
          jobsExtracted: totalAddedCount,
          fastPathJobsExtracted: fastPathAddedCount,
          totalJobs: state.collectedJobs.length
        }
      }
    } catch (error) {
      if ((error instanceof DOMException && error.name === 'AbortError') || signal?.aborted) {
        throw error
      }

      if (isClosedPageError(error) && !hasRecoveredClosedPage && config.resolveLivePage) {
        try {
          hasRecoveredClosedPage = await recoverClosedPage({
            config,
            pageRef,
            state,
            toolName,
            ...(onProgress ? { onProgress } : {}),
          })
          continue
        } catch (resolveError) {
          error = resolveError
        }
      }

      if (!shouldRetry || attempt === maxRetries) {
        return {
          success: false,
          error: shouldRetry
            ? `Failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown'}`
            : (error instanceof Error ? error.message : 'Unknown')
        }
      }

      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      onProgress?.({
        currentUrl: state.currentUrl,
        jobsFound: state.collectedJobs.length,
        stepCount: state.stepCount,
        currentAction: `retry:${toolName}`,
        message: `Retrying ${toolName.replace(/_/g, ' ')} after a temporary browser error (${attempt + 1}/${maxRetries}).`,
        waitReason: 'retrying_tool',
        targetId: null,
        adapterKind: config.source
      })
      await waitForRetryDelay(500 * attempt, signal)
    }
  }

  throw new Error(`Unreachable: executeToolCall exhausted retries without returning for ${toolName}`)
}
