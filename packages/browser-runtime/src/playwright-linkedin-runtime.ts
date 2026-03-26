import { spawn, type ChildProcess } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { Browser, BrowserContext, Page } from 'playwright'
import {
  ApplyExecutionResultSchema,
  BrowserSessionStateSchema,
  DiscoveryRunResultSchema,
  JobPostingSchema,
  type ApplyExecutionResult,
  type BrowserSessionState,
  type CandidateProfile,
  type DiscoveryRunResult,
  type JobFinderSettings,
  type JobPosting,
  type JobSearchPreferences,
  type JobSource
} from '@unemployed/contracts'
import type { JobFinderAiClient } from '@unemployed/ai-providers'
import { runAgentDiscovery, type AgentConfig, type AgentProgress } from '@unemployed/browser-agent'
import type { BrowserSessionRuntime, ExecuteEasyApplyInput } from './index'

const knownSkillPhrases = [
  'React',
  'TypeScript',
  'JavaScript',
  'Node.js',
  'Electron',
  'Playwright',
  'SQLite',
  'Figma',
  'Design Systems',
  'Accessibility',
  'Product Design',
  'UX Strategy',
  'AWS',
  'Docker',
  'GraphQL',
  'SQL'
] as const

const linkedInJobsUrl = 'https://www.linkedin.com/jobs/search/'

export interface JobPageExtractionInput {
  pageText: string
  pageUrl: string
  pageType: 'search_results' | 'job_detail'
  maxJobs: number
}

export type JobPageExtractor = (input: JobPageExtractionInput) => Promise<JobPosting[]>

export interface LinkedInBrowserAgentRuntimeOptions {
  userDataDir: string
  headless?: boolean
  maxJobsPerRun?: number
  chromeExecutablePath?: string
  debugPort?: number
  jobExtractor?: JobPageExtractor
  aiClient?: JobFinderAiClient
}

export interface AgentDiscoveryOptions {
  userProfile: CandidateProfile
  searchPreferences: {
    targetRoles: string[]
    locations: string[]
  }
  targetJobCount: number
  maxSteps: number
  startingUrls: string[]
  onProgress?: (progress: AgentProgress) => void
  signal?: AbortSignal
  aiClient?: JobFinderAiClient
}

interface SearchCandidate {
  sourceJobId: string
  canonicalUrl: string
  title: string
  company: string
  location: string
  salaryText: string | null
}

interface EasyApplyInspection {
  blankRequiredFields: string[]
  unsupportedFields: string[]
  hasFileUpload: boolean
  uploadFieldLabel: string | null
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function uniqueByKey<TValue>(values: readonly TValue[], getKey: (value: TValue) => string): TValue[] {
  const seen = new Set<string>()

  return values.flatMap((value) => {
    const key = getKey(value)

    if (!key || seen.has(key)) {
      return []
    }

    seen.add(key)
    return [value]
  })
}

function inferWorkMode(location: string, description: string): JobPosting['workMode'] {
  const combinedText = `${location} ${description}`.toLowerCase()
  const modes: Array<'remote' | 'hybrid' | 'onsite' | 'flexible'> = []

  if (combinedText.includes('hybrid')) {
    modes.push('hybrid')
  }

  if (combinedText.includes('onsite') || combinedText.includes('on-site') || combinedText.includes('office')) {
    modes.push('onsite')
  }

  if (combinedText.includes('remote')) {
    modes.push('remote')
  }

  if (modes.length === 0) {
    modes.push('flexible')
  }

  return modes
}

function inferKeySkills(title: string, description: string): string[] {
  const combinedText = `${title}\n${description}`.toLowerCase()

  return knownSkillPhrases.filter((skill) => combinedText.includes(skill.toLowerCase()))
}

function parseRelativePostedAt(relativeText: string, fallbackIso: string): string {
  const normalized = relativeText.toLowerCase()
  const match = normalized.match(/(\d+)\s+(minute|hour|day|week|month)s?/)

  if (!match) {
    return fallbackIso
  }

  const amount = Number.parseInt(match[1] ?? '0', 10)
  const unit = match[2] ?? 'day'
  const date = new Date(fallbackIso)

  if (unit === 'minute') {
    date.setMinutes(date.getMinutes() - amount)
  } else if (unit === 'hour') {
    date.setHours(date.getHours() - amount)
  } else if (unit === 'day') {
    date.setDate(date.getDate() - amount)
  } else if (unit === 'week') {
    date.setDate(date.getDate() - amount * 7)
  } else if (unit === 'month') {
    date.setMonth(date.getMonth() - amount)
  }

  return date.toISOString()
}

function buildDiscoveryUrls(searchPreferences: JobSearchPreferences): string[] {
  const roles = searchPreferences.targetRoles.length > 0 ? searchPreferences.targetRoles.slice(0, 2) : ['']
  const locations = searchPreferences.locations.length > 0 ? searchPreferences.locations.slice(0, 2) : ['']

  const urls = roles.flatMap((role) =>
    locations.map((location) => {
      const url = new URL(linkedInJobsUrl)

      if (role) {
        url.searchParams.set('keywords', role)
      }

      if (location) {
        url.searchParams.set('location', location)
      }

      url.searchParams.set('f_AL', 'true')
      return url.toString()
    })
  )

  return uniqueByKey(urls, (value) => value)
}

function buildQuerySummary(searchPreferences: Pick<JobSearchPreferences, 'targetRoles' | 'locations'>): string {
  const roles = searchPreferences.targetRoles.join(', ') || 'all roles'
  const locations = searchPreferences.locations.join(', ') || 'all locations'
  return `${roles} | ${locations} | chrome profile agent`
}

function canUploadResumeAsset(filePath: string | null): boolean {
  if (!filePath) {
    return false
  }

  return ['.pdf', '.doc', '.docx', '.txt'].includes(path.extname(filePath).toLowerCase())
}

function buildSessionBlockedResult(session: BrowserSessionState): Error {
  const detail = session.detail ? ` ${session.detail}` : ''
  return new Error(`LinkedIn session is not ready for automation.${detail}`.trim())
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function buildChromeExecutableCandidates(explicitPath?: string): string[] {
  const candidates = explicitPath ? [explicitPath] : []

  if (process.platform === 'win32') {
    const programFiles = process.env.PROGRAMFILES ?? 'C:\\Program Files'
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'

    candidates.push(
      `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`
    )
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
    )
  } else {
    candidates.push(
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium'
    )
  }

  return uniqueByKey(
    candidates.map((candidate) => candidate.trim()).filter(Boolean),
    (candidate) => candidate.toLowerCase()
  )
}

async function resolveChromeExecutable(explicitPath?: string): Promise<string> {
  for (const candidate of buildChromeExecutableCandidates(explicitPath)) {
    if (await pathExists(candidate)) {
      return candidate
    }
  }

  throw new Error(
    'A Chrome executable was not found for the dedicated browser agent. Set UNEMPLOYED_CHROME_PATH to a local Chrome installation.'
  )
}

async function isDebuggerEndpointReady(debugPort: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`, {
      signal: AbortSignal.timeout(1_000)
    })

    return response.ok
  } catch {
    return false
  }
}

async function waitForDebuggerEndpoint(debugPort: number, timeoutMs = 20_000): Promise<void> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (await isDebuggerEndpointReady(debugPort)) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error('Chrome started but the remote debugging endpoint did not become ready in time.')
}

async function getPrimaryPage(context: BrowserContext): Promise<Page> {
  return context.pages()[0] ?? context.newPage()
}

async function ensureLinkedInLandingPage(page: Page): Promise<void> {
  const currentUrl = page.url()

  if (!currentUrl || currentUrl === 'about:blank' || !currentUrl.includes('linkedin.com')) {
    await page.goto(linkedInJobsUrl, { waitUntil: 'domcontentloaded' })
  }

  await page.bringToFront()
}

async function pageLooksAuthenticated(page: Page): Promise<boolean> {
  const currentUrl = page.url()

  if (/\/login|\/checkpoint\//i.test(currentUrl)) {
    return false
  }

  return page.evaluate(() => {
    if (document.querySelector('input[name="session_key"], form.login__form')) {
      return false
    }

    return Boolean(
      document.querySelector('.global-nav, nav[aria-label="Primary Navigation"], a[href*="/jobs/search/"]')
    )
  })
}

async function collectSearchCandidates(page: Page, maxJobs: number): Promise<SearchCandidate[]> {
  return page.evaluate((limit: number) => {
    function textFrom(root: ParentNode | null, selectors: string[]): string {
      for (const selector of selectors) {
        const value = (root?.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim()

        if (value) {
          return value
        }
      }

      return ''
    }

    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/jobs/view/"]'))
    const seen = new Set<string>()
    const results: Array<{
      sourceJobId: string
      canonicalUrl: string
      title: string
      company: string
      location: string
      salaryText: string | null
    }> = []

    for (const anchor of anchors) {
      const href = anchor.href

      if (!href) {
        continue
      }

      const canonicalUrl = href.split('?')[0] ?? href
      const sourceJobId = canonicalUrl.match(/\/jobs\/view\/([^/?]+)/i)?.[1] ?? ''

      if (!sourceJobId || seen.has(sourceJobId)) {
        continue
      }

      const card = anchor.closest('li, .job-card-container, .jobs-search-results__list-item, [data-job-id]')
      const title =
        textFrom(card, ['.job-card-list__title', '.job-card-container__link', '.artdeco-entity-lockup__title a']) ||
        anchor.textContent?.replace(/\s+/g, ' ').trim() ||
        ''
      const company = textFrom(card, ['.job-card-container__company-name', '.artdeco-entity-lockup__subtitle'])
      const location = textFrom(card, ['.job-card-container__metadata-item', '.artdeco-entity-lockup__caption'])
      const salaryText = textFrom(card, ['.job-card-container__metadata-wrapper li', '.metadata-wrapper li']) || null

      if (!title || !company) {
        continue
      }

      seen.add(sourceJobId)
      results.push({ sourceJobId, canonicalUrl, title, company, location, salaryText })

      if (results.length >= limit) {
        break
      }
    }

    return results
  }, maxJobs)
}

async function extractJobDetail(page: Page, candidate: SearchCandidate): Promise<JobPosting | null> {
  const now = new Date().toISOString()
  await page.goto(candidate.canonicalUrl, { waitUntil: 'domcontentloaded' })

  const authenticated = await pageLooksAuthenticated(page)

  if (!authenticated) {
    return null
  }

  await page.waitForTimeout(1200)

  const detail = await page.evaluate(() => {
    function textFrom(selectors: string[]): string {
      for (const selector of selectors) {
        const value = (document.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim()

        if (value) {
          return value
        }
      }

      return ''
    }

    const title = textFrom(['h1', '.job-details-jobs-unified-top-card__job-title'])
    const company = textFrom([
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      'a[href*="/company/"]'
    ])
    const location = textFrom([
      '.job-details-jobs-unified-top-card__primary-description-container',
      '.job-details-jobs-unified-top-card__tertiary-description-container'
    ])
    const metaText = textFrom([
      '.job-details-jobs-unified-top-card__primary-description-container',
      '.job-details-jobs-unified-top-card__tertiary-description-container'
    ])
    const description = textFrom([
      '.jobs-description__content',
      '.jobs-box__html-content',
      '.jobs-description-content__text',
      '.jobs-description',
      '[class*="jobs-description"]',
      '.job-details-about-the-job-module',
      '#job-details'
    ])
    const easyApplyEligible = Array.from(document.querySelectorAll('button')).some((button) =>
      /easy apply/i.test(button.textContent ?? '')
    )
    const hasExternalApply = Array.from(document.querySelectorAll('a, button')).some((element) =>
      /apply on company website|apply/i.test(element.textContent ?? '')
    )

    return {
      title,
      company,
      location,
      metaText,
      description,
      easyApplyEligible,
      hasExternalApply
    }
  })

  const title = cleanText(detail.title) || candidate.title
  const company = cleanText(detail.company) || candidate.company
  const location = cleanText(detail.location) || candidate.location || 'Location unavailable'
  const description = cleanText(detail.description) || `${title} position at ${company}. See full listing on LinkedIn for details.`

  if (!title || !company) {
    return null
  }

  const applyPath: JobPosting['applyPath'] = detail.easyApplyEligible
    ? 'easy_apply'
    : detail.hasExternalApply
      ? 'external_redirect'
      : 'unknown'

  return JobPostingSchema.parse({
    source: 'linkedin',
    sourceJobId: candidate.sourceJobId,
    discoveryMethod: 'browser_agent',
    canonicalUrl: candidate.canonicalUrl,
    title,
    company,
    location,
    workMode: inferWorkMode(location, description),
    applyPath,
    easyApplyEligible: detail.easyApplyEligible,
    postedAt: parseRelativePostedAt(detail.metaText, now),
    discoveredAt: now,
    salaryText: candidate.salaryText,
    summary: description.slice(0, 240),
    description,
    keySkills: inferKeySkills(title, description)
  })
}

async function inspectEasyApplyDialog(page: Page): Promise<EasyApplyInspection> {
  return page.evaluate(() => {
    function getDialog(): HTMLElement | null {
      return document.querySelector('[role="dialog"]')
    }

    function labelFor(element: Element): string {
      const htmlElement = element as HTMLElement
      const id = htmlElement.getAttribute('id')
      const explicitLabel = id ? document.querySelector(`label[for="${id}"]`)?.textContent : null
      const implicitLabel = htmlElement.closest('label')?.textContent ?? null
      const ariaLabel = htmlElement.getAttribute('aria-label')
      return (explicitLabel ?? implicitLabel ?? ariaLabel ?? 'Unlabeled field').replace(/\s+/g, ' ').trim()
    }

    const dialog = getDialog()

    if (!dialog) {
      return {
        blankRequiredFields: ['Easy Apply dialog did not open.'],
        unsupportedFields: [],
        hasFileUpload: false,
        uploadFieldLabel: null
      }
    }

    const blankRequiredFields: string[] = []
    const unsupportedFields: string[] = []
    let hasFileUpload = false
    let uploadFieldLabel: string | null = null

    const inputs = Array.from(dialog.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'))

    for (const input of inputs) {
      const htmlInput = input as HTMLInputElement
      const label = labelFor(input)
      const isRequired = input.hasAttribute('required') || input.getAttribute('aria-required') === 'true'
      const isVisible = !(input as HTMLElement).closest('[hidden], [aria-hidden="true"]')

      if (!isVisible || htmlInput.type === 'hidden' || htmlInput.disabled) {
        continue
      }

      if (htmlInput.type === 'file') {
        hasFileUpload = true
        uploadFieldLabel = label
        continue
      }

      if (input.tagName === 'SELECT' || input.tagName === 'TEXTAREA') {
        unsupportedFields.push(label)
      }

      const value = 'value' in input ? String(input.value ?? '').trim() : ''

      if (isRequired && !value) {
        blankRequiredFields.push(label)
      }
    }

    for (const fieldset of Array.from(dialog.querySelectorAll('fieldset'))) {
      const checked = fieldset.querySelector('input:checked')
      const prompt = fieldset.querySelector('legend')?.textContent?.replace(/\s+/g, ' ').trim() ?? 'Unlabeled choice'

      if (!checked) {
        unsupportedFields.push(prompt)
      }
    }

    return {
      blankRequiredFields,
      unsupportedFields,
      hasFileUpload,
      uploadFieldLabel
    }
  })
}

async function fillCommonProfileFields(page: Page, profile: CandidateProfile): Promise<void> {
  const email = profile.email?.trim() ?? ''
  const phone = profile.phone?.trim() ?? ''

  if (email) {
    const emailField = page.getByLabel(/email/i).first()

    if ((await emailField.count()) > 0) {
      await emailField.fill(email)
    }
  }

  if (phone) {
    const phoneField = page.getByLabel(/phone|mobile|contact number/i).first()

    if ((await phoneField.count()) > 0) {
      await phoneField.fill(phone)
    }
  }
}

export function createLinkedInBrowserAgentRuntime(
  options: LinkedInBrowserAgentRuntimeOptions
): BrowserSessionRuntime {
  const maxJobsPerRun = Math.max(1, options.maxJobsPerRun ?? 8)
  const debugPort = options.debugPort ?? 9333
  const jobExtractor = options.jobExtractor ?? null
  let browserPromise: Promise<Browser> | null = null
  let launchedChromeProcess: ChildProcess | null = null
  let currentSessionState = BrowserSessionStateSchema.parse({
    source: 'linkedin',
    status: 'unknown',
    driver: 'chrome_profile_agent',
    label: 'Chrome profile not started',
    detail: 'Open the dedicated Chrome profile to log into LinkedIn and let the browser agent reuse that session.',
    lastCheckedAt: new Date().toISOString()
  })

  async function connectBrowser(): Promise<Browser> {
    const { chromium } = await import('playwright')
    return chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`)
  }

  async function ensureBrowser(): Promise<Browser> {
    browserPromise ??= (async () => {
      if (!(await isDebuggerEndpointReady(debugPort))) {
        const chromeExecutable = await resolveChromeExecutable(options.chromeExecutablePath)

        await mkdir(options.userDataDir, { recursive: true })

        const launchArgs = [
          `--remote-debugging-port=${debugPort}`,
          `--user-data-dir=${options.userDataDir}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--new-window',
          linkedInJobsUrl
        ]

        if (options.headless) {
          launchArgs.push('--headless=new')
        }

        launchedChromeProcess = spawn(chromeExecutable, launchArgs, {
          detached: true,
          stdio: 'ignore',
          windowsHide: false
        })
        launchedChromeProcess.unref()

        await waitForDebuggerEndpoint(debugPort)
      }

      return connectBrowser()
    })().catch((error: unknown) => {
      browserPromise = null
      throw error
    })

    return browserPromise
  }

  async function getContext(): Promise<BrowserContext> {
    const browser = await ensureBrowser()
    const context = browser.contexts()[0]

    if (!context) {
      throw new Error('Chrome opened but did not expose a default browsing context for automation.')
    }

    return context
  }

  async function updateSessionStateFromPage(page: Page): Promise<BrowserSessionState> {
    const authenticated = await pageLooksAuthenticated(page)

    currentSessionState = BrowserSessionStateSchema.parse({
      source: 'linkedin',
      status: authenticated ? 'ready' : 'login_required',
      driver: 'chrome_profile_agent',
      label: authenticated ? 'Chrome profile ready' : 'Chrome profile needs LinkedIn login',
      detail: authenticated
        ? 'The dedicated Chrome profile is authenticated and ready for discovery or Easy Apply assistance.'
        : 'Finish logging into LinkedIn in the dedicated Chrome profile, then rerun the action.',
      lastCheckedAt: new Date().toISOString()
    })

    return currentSessionState
  }

  async function openSession(source: JobSource): Promise<BrowserSessionState> {
    try {
      const context = await getContext()
      const page = await getPrimaryPage(context)

      await ensureLinkedInLandingPage(page)

      return BrowserSessionStateSchema.parse({
        ...(await updateSessionStateFromPage(page)),
        source
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'The dedicated Chrome profile could not be opened.'

      currentSessionState = BrowserSessionStateSchema.parse({
        source,
        status: 'blocked',
        driver: 'chrome_profile_agent',
        label: 'Chrome profile unavailable',
        detail,
        lastCheckedAt: new Date().toISOString()
      })

      return currentSessionState
    }
  }

  async function getReadyPage(): Promise<Page> {
    const session = await openSession('linkedin')

    if (session.status !== 'ready') {
      throw buildSessionBlockedResult(session)
    }

    const context = await getContext()
    const page = await getPrimaryPage(context)

    await ensureLinkedInLandingPage(page)
    return page
  }

  async function maybeDisposeBrowser(settings: JobFinderSettings): Promise<void> {
    if (settings.keepSessionAlive || !browserPromise) {
      return
    }

    const browser = await browserPromise
    await browser.close()
    browserPromise = null
    launchedChromeProcess = null
    currentSessionState = BrowserSessionStateSchema.parse({
      source: 'linkedin',
      status: 'unknown',
      driver: 'chrome_profile_agent',
      label: 'Chrome profile disconnected',
      detail: 'The agent browser was disconnected because session persistence is disabled.',
      lastCheckedAt: new Date().toISOString()
    })
  }

  async function runDiscoveryWithExtractor(
    page: Page,
    source: JobSource,
    searchPreferences: JobSearchPreferences,
    startedAt: string,
    extractor: JobPageExtractor
  ): Promise<DiscoveryRunResult> {
    let sessionExpired = false
    const allJobs: JobPosting[] = []
    const seenJobIds = new Set<string>()

    for (const url of buildDiscoveryUrls(searchPreferences)) {
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await updateSessionStateFromPage(page)

      if (currentSessionState.status !== 'ready') {
        sessionExpired = true
        break
      }

      await page.waitForTimeout(2000)
      const pageText = await page.evaluate(() => document.body.innerText)

      // Wrap extractor call to handle transient errors gracefully
      let extractedJobs: JobPosting[] = []
      try {
        extractedJobs = await extractor({
          pageText,
          pageUrl: page.url(),
          pageType: 'search_results',
          maxJobs: maxJobsPerRun
        })
      } catch (extractError) {
        console.error(`[Discovery] Extraction failed for ${page.url()}:`, extractError)
        // Continue to next URL, preserving any previously accumulated results
      }

      for (const job of extractedJobs) {
        if (!seenJobIds.has(job.sourceJobId)) {
          seenJobIds.add(job.sourceJobId)
          allJobs.push(job)
        }
      }

      if (allJobs.length >= maxJobsPerRun) {
        break
      }
    }

    const jobs = allJobs.slice(0, maxJobsPerRun)

    const warning = sessionExpired
      ? 'LinkedIn session expired during discovery. Log back in and run discovery again to continue.'
      : jobs.length === 0
        ? 'The dedicated Chrome profile reached LinkedIn but did not extract any supported job listings.'
        : null

    return DiscoveryRunResultSchema.parse({
      source,
      startedAt,
      completedAt: new Date().toISOString(),
      querySummary: buildQuerySummary(searchPreferences),
      warning,
      jobs
    })
  }

  async function runDiscoveryWithSelectors(
    page: Page,
    source: JobSource,
    searchPreferences: JobSearchPreferences,
    startedAt: string
  ): Promise<DiscoveryRunResult> {
    const candidates: SearchCandidate[] = []
    let sessionExpired = false

    for (const url of buildDiscoveryUrls(searchPreferences)) {
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await updateSessionStateFromPage(page)

      if (currentSessionState.status !== 'ready') {
        sessionExpired = true
        break
      }

      await page.waitForTimeout(1500)
      candidates.push(...(await collectSearchCandidates(page, maxJobsPerRun)))

      if (uniqueByKey(candidates, (candidate) => candidate.sourceJobId).length >= maxJobsPerRun) {
        break
      }
    }

    const uniqueCandidates = uniqueByKey(candidates, (candidate) => candidate.sourceJobId).slice(0, maxJobsPerRun)
    const jobs: JobPosting[] = []

    for (const candidate of uniqueCandidates) {
      if (sessionExpired) {
        break
      }

      try {
        const job = await extractJobDetail(page, candidate)

        if (job) {
          jobs.push(job)
        }
      } catch {
        // Skip individual job extraction failures
      }
    }

    const warning = sessionExpired
      ? 'LinkedIn session expired during discovery. Log back in and run discovery again to continue.'
      : jobs.length === 0
        ? 'The dedicated Chrome profile reached LinkedIn but did not extract any supported job listings.'
        : null

    return DiscoveryRunResultSchema.parse({
      source,
      startedAt,
      completedAt: new Date().toISOString(),
      querySummary: buildQuerySummary(searchPreferences),
      warning,
      jobs
    })
  }

  return {
    getSessionState(source: JobSource) {
      return Promise.resolve(
        BrowserSessionStateSchema.parse({
          ...currentSessionState,
          source
        })
      )
    },
    openSession,
    async runDiscovery(source, searchPreferences) {
      let page: Page

      try {
        page = await getReadyPage()
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'The LinkedIn session could not be opened.'

        return DiscoveryRunResultSchema.parse({
          source,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          querySummary: buildQuerySummary(searchPreferences),
          warning: `Discovery could not start: ${detail}`,
          jobs: []
        })
      }

      const startedAt = new Date().toISOString()

      if (jobExtractor) {
        return runDiscoveryWithExtractor(page, source, searchPreferences, startedAt, jobExtractor)
      }

      return runDiscoveryWithSelectors(page, source, searchPreferences, startedAt)
    },
    async executeEasyApply(source, input: ExecuteEasyApplyInput): Promise<ApplyExecutionResult> {
      const page = await getReadyPage()
      const startedAt = new Date().toISOString()
      const checkpoints: ApplyExecutionResult['checkpoints'] = []

      await page.goto(input.job.canonicalUrl, { waitUntil: 'domcontentloaded' })
      await updateSessionStateFromPage(page)

      if (currentSessionState.status !== 'ready') {
        throw buildSessionBlockedResult(currentSessionState)
      }

      const easyApplyButton = page.getByRole('button', { name: /easy apply/i }).first()

      if ((await easyApplyButton.count()) === 0) {
        return ApplyExecutionResultSchema.parse({
          state: 'unsupported',
          summary: 'Easy Apply path is unavailable',
          detail: 'The live LinkedIn listing did not expose an Easy Apply button for the dedicated Chrome profile.',
          submittedAt: null,
          outcome: null,
          nextActionLabel: 'Inspect the listing manually',
          checkpoints: [
            {
              id: `checkpoint_${input.job.id}_easy_apply_unavailable`,
              at: startedAt,
              label: 'Easy Apply unavailable',
              detail: 'The listing no longer exposes an Easy Apply button for the authenticated session.',
              state: 'unsupported'
            }
          ]
        })
      }

      checkpoints.push({
        id: `checkpoint_${input.job.id}_open_listing`,
        at: startedAt,
        label: 'Opened Easy Apply',
        detail: 'The dedicated Chrome profile opened the Easy Apply dialog for the selected job.',
        state: 'in_progress'
      })

      await easyApplyButton.click()
      await page.waitForTimeout(1200)
      await fillCommonProfileFields(page, input.profile)

      let inspection = await inspectEasyApplyDialog(page)

      if (inspection.hasFileUpload && canUploadResumeAsset(input.asset.storagePath)) {
        const uploadInput = page.locator('[role="dialog"] input[type="file"]').first()

        if ((await uploadInput.count()) > 0) {
          await uploadInput.setInputFiles(input.asset.storagePath!)
          checkpoints.push({
            id: `checkpoint_${input.job.id}_resume_attached`,
            at: new Date().toISOString(),
            label: 'Attached tailored resume',
            detail: `Uploaded ${input.asset.label.toLowerCase()} from local storage.`,
            state: 'in_progress'
          })
          await page.waitForTimeout(800)
          inspection = await inspectEasyApplyDialog(page)
        }
      }

      const remainingIssues = uniqueByKey(
        [...inspection.blankRequiredFields, ...inspection.unsupportedFields],
        (value) => normalizeText(value)
      )

      if (inspection.hasFileUpload && !canUploadResumeAsset(input.asset.storagePath)) {
        remainingIssues.push(inspection.uploadFieldLabel ?? 'Resume upload required')
      }

      if (remainingIssues.length > 0) {
        return ApplyExecutionResultSchema.parse({
          state: 'paused',
          summary: 'Easy Apply needs manual review',
          detail: `The Chrome profile agent stopped because it found fields that are not safe to answer automatically: ${remainingIssues.join(', ')}.`,
          submittedAt: null,
          outcome: null,
          nextActionLabel: 'Finish the unsupported fields manually in the dedicated Chrome profile',
          checkpoints: [
            ...checkpoints,
            {
              id: `checkpoint_${input.job.id}_manual_review`,
              at: new Date().toISOString(),
              label: 'Paused for manual review',
              detail: `Unsupported or incomplete fields were detected: ${remainingIssues.join(', ')}.`,
              state: 'paused'
            }
          ]
        })
      }

      const reviewButton = page.getByRole('button', { name: /review your application|review/i }).first()

      if ((await reviewButton.count()) > 0) {
        await reviewButton.click()
        await page.waitForTimeout(1200)
        inspection = await inspectEasyApplyDialog(page)

        if (inspection.blankRequiredFields.length > 0 || inspection.unsupportedFields.length > 0) {
          const issues = uniqueByKey(
            [...inspection.blankRequiredFields, ...inspection.unsupportedFields],
            (value) => normalizeText(value)
          )

          return ApplyExecutionResultSchema.parse({
            state: 'paused',
            summary: 'Easy Apply needs manual review',
            detail: `The review step exposed additional fields that require a human decision: ${issues.join(', ')}.`,
            submittedAt: null,
            outcome: null,
            nextActionLabel: 'Finish the review step manually in the dedicated Chrome profile',
            checkpoints: [
              ...checkpoints,
              {
                id: `checkpoint_${input.job.id}_review_pause`,
                at: new Date().toISOString(),
                label: 'Paused on review step',
                detail: `The Chrome profile agent stopped on the review step because it found: ${issues.join(', ')}.`,
                state: 'paused'
              }
            ]
          })
        }
      }

      const submitButton = page.getByRole('button', { name: /submit application|submit/i }).first()

      if ((await submitButton.count()) === 0) {
        return ApplyExecutionResultSchema.parse({
          state: 'unsupported',
          summary: 'Submit button unavailable',
          detail: 'The dedicated Chrome profile reached the Easy Apply flow but could not find a final submit action.',
          submittedAt: null,
          outcome: null,
          nextActionLabel: 'Finish the application manually',
          checkpoints: [
            ...checkpoints,
            {
              id: `checkpoint_${input.job.id}_submit_missing`,
              at: new Date().toISOString(),
              label: 'Submit button unavailable',
              detail: 'The final submit action was not visible after the supported review steps.',
              state: 'unsupported'
            }
          ]
        })
      }

      if (input.settings.humanReviewRequired || !input.settings.allowAutoSubmitOverride) {
        return ApplyExecutionResultSchema.parse({
          state: 'paused',
          summary: 'Ready for final human submit',
          detail:
            'The Chrome profile agent filled the supported fields and stopped at the final submit step because human review is still required for live submissions.',
          submittedAt: null,
          outcome: null,
          nextActionLabel: 'Review the final LinkedIn application in the dedicated Chrome profile and submit manually',
          checkpoints: [
            ...checkpoints,
            {
              id: `checkpoint_${input.job.id}_human_submit_gate`,
              at: new Date().toISOString(),
              label: 'Paused before final submit',
              detail: 'Automatic submission is disabled by the current human-review settings.',
              state: 'paused'
            }
          ]
        })
      }

      await submitButton.click()
      await page.waitForTimeout(1500)
      const submittedAt = new Date().toISOString()

      await maybeDisposeBrowser(input.settings)

      return ApplyExecutionResultSchema.parse({
        state: 'submitted',
        summary: 'Easy Apply submitted',
        detail: `The Chrome profile agent submitted ${input.job.title} at ${input.job.company} through the supported Easy Apply path.`,
        submittedAt,
        outcome: 'submitted',
        nextActionLabel: 'Monitor your LinkedIn inbox and email for recruiter follow-up',
        checkpoints: [
          ...checkpoints,
          {
            id: `checkpoint_${input.job.id}_submitted`,
            at: submittedAt,
            label: 'Submission confirmed',
            detail: 'The dedicated Chrome profile completed the supported Easy Apply submission path.',
            state: 'submitted'
          }
        ]
      })
    },
    async runAgentDiscovery(source: JobSource, options: AgentDiscoveryOptions): Promise<DiscoveryRunResult> {
      const startedAt = new Date().toISOString()

      if (!options.aiClient?.chatWithTools) {
        return DiscoveryRunResultSchema.parse({
          source,
          startedAt,
          completedAt: new Date().toISOString(),
          querySummary: buildQuerySummary({
            targetRoles: options.searchPreferences.targetRoles,
            locations: options.searchPreferences.locations
          }),
          warning: 'AI client does not support tool calling. Cannot run agent discovery.',
          jobs: []
        })
      }

      if (!jobExtractor) {
        return DiscoveryRunResultSchema.parse({
          source,
          startedAt,
          completedAt: new Date().toISOString(),
          querySummary: buildQuerySummary({
            targetRoles: options.searchPreferences.targetRoles,
            locations: options.searchPreferences.locations
          }),
          warning: 'No job extractor configured. Cannot run agent discovery.',
          jobs: []
        })
      }

      try {
        const page = await getReadyPage()

        const agentConfig: AgentConfig = {
          maxSteps: options.maxSteps,
          targetJobCount: options.targetJobCount,
          userProfile: options.userProfile,
          searchPreferences: {
            targetRoles: options.searchPreferences.targetRoles,
            locations: options.searchPreferences.locations
          },
          startingUrls: options.startingUrls
        }

        // Validate aiClient exists (already checked above, but capture for type safety)
        const aiClient = options.aiClient
        if (!aiClient?.chatWithTools) {
          throw new Error('AI client not available')
        }

        const result = await runAgentDiscovery(
          page,
          agentConfig,
          {
            chatWithTools: async (messages, tools, signal) => {
              const response = await aiClient.chatWithTools!(
                messages,
                tools,
                signal
              )
              return response
            }
          },
          {
            extractJobsFromPage: async (input: { pageText: string; pageUrl: string; pageType: string; maxJobs: number }) => {
              if (!jobExtractor) {
                return []
              }
              // Normalize pageType to valid values
              const validPageTypes = ['search_results', 'job_detail'] as const
              const normalizedPageType = validPageTypes.includes(input.pageType as typeof validPageTypes[number])
                ? (input.pageType as typeof validPageTypes[number])
                : 'search_results' // Default fallback
              
              const jobs = await jobExtractor({
                pageText: input.pageText,
                pageUrl: input.pageUrl,
                pageType: normalizedPageType,
                maxJobs: input.maxJobs
              })
              // Map JobPosting to the expected JobExtractor format, preserving all fields
              return jobs.map(job => {
                const mapped: {
                  sourceJobId: string
                  title: string
                  company: string
                  location: string
                  description: string
                  url: string
                  postedAt: string
                  salary?: string
                  workMode?: ('remote' | 'hybrid' | 'onsite' | 'flexible')[]
                  applyPath?: 'easy_apply' | 'external_redirect' | 'unknown'
                  easyApplyEligible?: boolean
                  keySkills?: string[]
                } = {
                  sourceJobId: job.sourceJobId,
                  title: job.title,
                  company: job.company,
                  location: job.location,
                  description: job.description,
                  url: job.canonicalUrl,
                  postedAt: job.postedAt
                }
                if (job.salaryText) mapped.salary = job.salaryText
                if (job.workMode?.length) mapped.workMode = job.workMode
                if (job.applyPath) mapped.applyPath = job.applyPath
                if (job.easyApplyEligible !== undefined) mapped.easyApplyEligible = job.easyApplyEligible
                if (job.keySkills?.length) mapped.keySkills = job.keySkills
                return mapped
              })
            }
          },
          options.onProgress,
          options.signal
        )

        return DiscoveryRunResultSchema.parse({
          source,
          startedAt,
          completedAt: new Date().toISOString(),
          querySummary: buildQuerySummary({
            targetRoles: options.searchPreferences.targetRoles,
            locations: options.searchPreferences.locations
          }),
          warning: result.incomplete
            ? `Agent discovery stopped after ${result.steps} steps. Found ${result.jobs.length} jobs.`
            : result.error
              ? `Discovery encountered an error: ${result.error}`
              : null,
          jobs: result.jobs
        })
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown error during agent discovery'

        return DiscoveryRunResultSchema.parse({
          source,
          startedAt,
          completedAt: new Date().toISOString(),
          querySummary: buildQuerySummary({
            targetRoles: options.searchPreferences.targetRoles,
            locations: options.searchPreferences.locations
          }),
          warning: `Agent discovery failed: ${detail}`,
          jobs: []
        })
      }
    }
  }
}
