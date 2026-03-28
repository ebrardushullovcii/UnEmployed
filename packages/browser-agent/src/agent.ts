import type { Page } from 'playwright'
import { JobPostingSchema, type JobPosting } from '@unemployed/contracts'
import type {
  AgentConfig,
  AgentState,
  AgentResult,
  AgentMessage,
  ToolCall,
  OnProgressCallback
} from './types'
import { getToolDefinitions, getToolExecutor } from './tools'
import { createSystemPrompt } from './prompts'
import { isAllowedUrl } from './allowlist'

export interface LLMClient {
  chatWithTools(
    messages: AgentMessage[],
    tools: ReturnType<typeof getToolDefinitions>,
    signal?: AbortSignal
  ): Promise<{
    content?: string
    toolCalls?: ToolCall[]
    reasoning?: string
  }>
}

export interface JobExtractor {
  extractJobsFromPage(input: {
    pageText: string
    pageUrl: string
    pageType: string
    maxJobs: number
  }): Promise<Array<Pick<
    JobPosting,
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
    | 'keySkills'
  >>>
}

export async function runAgentDiscovery(
  page: Page,
  config: AgentConfig,
  llmClient: LLMClient,
  jobExtractor: JobExtractor,
  onProgress?: OnProgressCallback,
  signal?: AbortSignal
): Promise<AgentResult> {
  console.log(`[Agent] Starting discovery: ${config.targetJobCount} jobs target`)

  const state: AgentState = {
    conversation: [
      { role: 'system', content: createSystemPrompt(config) },
      { role: 'user', content: createUserPrompt(config) }
    ],
    collectedJobs: [],
    visitedUrls: new Set(),
    stepCount: 0,
    currentUrl: '',
    isRunning: true
  }

  const tools = getToolDefinitions()

  try {
    // Navigate to first starting URL
    const firstUrl = config.startingUrls[0]
    if (firstUrl) {
      if (!isAllowedUrl(firstUrl, config.navigationPolicy).valid) {
        console.error(`[Agent] Starting URL not allowed: ${firstUrl}`)
        return {
          jobs: [],
          steps: 0,
          error: `Starting URL not in allowlist: ${firstUrl}`
        }
      }
      await page.goto(firstUrl, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)
      const landedUrl = page.url()
      const landedUrlValidation = isAllowedUrl(landedUrl, config.navigationPolicy)
      if (!landedUrlValidation.valid) {
        console.error(`[Agent] Starting URL redirected off-allowlist: ${landedUrl}`)
        return {
          jobs: [],
          steps: 0,
          error: landedUrlValidation.error
        }
      }
      state.currentUrl = landedUrl
      state.visitedUrls.add(state.currentUrl)
      console.log(`[Agent] Started at: ${state.currentUrl}`)
    } else {
      return {
        jobs: [],
        steps: 0,
        error: 'No starting URLs provided'
      }
    }

    while (state.stepCount < config.maxSteps && state.isRunning) {
      if (signal?.aborted) {
        return {
          jobs: state.collectedJobs,
          steps: state.stepCount,
          incomplete: true
        }
      }

      state.stepCount++

      // Report progress every 10 steps
      if (state.stepCount % 10 === 0) {
        console.log(`[Agent] Step ${state.stepCount}/${config.maxSteps} | Jobs: ${state.collectedJobs.length}`)
      }

      onProgress?.({
        currentUrl: state.currentUrl,
        jobsFound: state.collectedJobs.length,
        stepCount: state.stepCount,
        currentAction: 'Thinking...',
        targetId: null,
        adapterKind: config.source
      })

      // Get LLM decision
      let response: { content?: string; toolCalls?: ToolCall[]; reasoning?: string }
      try {
        response = await llmClient.chatWithTools(state.conversation, tools, signal)
      } catch (llmError) {
        console.error('[Agent] LLM call failed:', llmError instanceof Error ? llmError.message : 'Unknown')
        return {
          jobs: state.collectedJobs,
          steps: state.stepCount,
          error: 'LLM call failed'
        }
      }

      if (response.toolCalls && response.toolCalls.length > 0) {
        // Add single assistant message with all tool calls
        state.conversation.push({
          role: 'assistant',
          content: response.content || '',
          toolCalls: response.toolCalls
        })

        // Execute tool calls and add results
        for (const toolCall of response.toolCalls) {
          const result = await executeToolCall(toolCall, page, state, config, jobExtractor, onProgress)

          const compactResult = toolCall.function.name === 'extract_jobs'
            ? {
                success: (result as { success?: boolean }).success,
                error: (result as { error?: string }).error,
                summary: (result as { data?: { jobsExtracted?: number } }).data
                  ? `jobs:${(result as { data?: { jobsExtracted?: number } }).data?.jobsExtracted ?? 0}`
                  : undefined
              }
            : result
          state.conversation.push({
            role: 'tool',
            toolCallId: toolCall.id,
            content: JSON.stringify(compactResult)
          })

          // Check if we should finish
          if (toolCall.function.name === 'finish' && (result as { success?: boolean }).success === true) {
            console.log(`[Agent] Finished: ${state.collectedJobs.length} jobs found`)
            return {
              jobs: state.collectedJobs,
              steps: state.stepCount
            }
          }

          // Check if we have enough jobs
          if (state.collectedJobs.length >= config.targetJobCount) {
            console.log(`[Agent] Target reached: ${state.collectedJobs.length} jobs`)
            return {
              jobs: state.collectedJobs,
              steps: state.stepCount
            }
          }
        }
      } else {
        // No tool calls, just text response
        state.conversation.push({
          role: 'assistant',
          content: response.content || 'No action taken'
        })

        // If no tool calls for multiple steps, we might be stuck
        if (state.stepCount >= config.maxSteps - 5) {
          return {
            jobs: state.collectedJobs,
            steps: state.stepCount,
            incomplete: true
          }
        }
      }
    }

    console.log(`[Agent] Max steps reached: ${state.collectedJobs.length} jobs`)
    return {
      jobs: state.collectedJobs,
      steps: state.stepCount,
      incomplete: state.stepCount >= config.maxSteps
    }
  } catch (error) {
    console.error('[Agent] Error:', error instanceof Error ? error.message : 'Unknown')
    return {
      jobs: state.collectedJobs,
      steps: state.stepCount,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  } finally {
    state.isRunning = false
  }
}

async function executeToolCall(
  toolCall: ToolCall,
  page: Page,
  state: AgentState,
  config: AgentConfig,
  jobExtractor: JobExtractor,
  onProgress?: OnProgressCallback
): Promise<unknown> {
  const toolName = toolCall.function.name
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(toolCall.function.arguments || '{}')
  } catch (parseError) {
    console.error(`[Agent] Failed to parse tool arguments for ${toolName}:`, toolCall.function.arguments, parseError)
    return {
      success: false,
      error: `Invalid tool arguments for ${toolName}`
    }
  }

  onProgress?.({
    currentUrl: state.currentUrl,
    jobsFound: state.collectedJobs.length,
    stepCount: state.stepCount,
    currentAction: `${toolName}: ${JSON.stringify(args)}`,
    targetId: null,
    adapterKind: config.source
  })

  // Handle browser tools
  const tool = getToolExecutor(toolName)
  if (tool) {
    const maxRetries = 3
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await tool.execute(args, { page, state, config })
        
        // Special handling for extract_jobs
        if (toolName === 'extract_jobs' && result.success && result.data) {
          const extractData = result.data as {
            pageText: string
            pageUrl: string
            pageType: string
            readyForExtraction: boolean
          }
          
          if (extractData.readyForExtraction) {
            const normalizedPageType = extractData.pageType === 'job_detail'
              ? 'job_detail'
              : 'search_results'
            const extractedJobs = await jobExtractor.extractJobsFromPage({
              pageText: extractData.pageText,
              pageUrl: extractData.pageUrl,
              pageType: normalizedPageType,
              maxJobs: config.targetJobCount - state.collectedJobs.length
            })

            // Add unique jobs, preferring extractor-provided values over defaults
            let addedCount = 0
            for (const job of extractedJobs) {
              const exists = state.collectedJobs.some(j => j.sourceJobId === job.sourceJobId)
              if (!exists) {
                // Build job object and validate before adding
                const jobToAdd = {
                  source: config.source,
                  sourceJobId: job.sourceJobId,
                  discoveryMethod: 'browser_agent' as const,
                  canonicalUrl: job.canonicalUrl,
                  title: job.title,
                  company: job.company,
                  location: job.location,
                  workMode: (() => {
                    const allowedWorkModes = ['remote', 'hybrid', 'onsite', 'flexible'] as const
                    const validWorkModes = Array.isArray(job.workMode)
                      ? job.workMode.filter((m): m is typeof allowedWorkModes[number] =>
                          allowedWorkModes.includes(m as typeof allowedWorkModes[number])
                        )
                      : []
                    return validWorkModes.length > 0 ? validWorkModes : ['flexible']
                  })(),
                  applyPath: ['easy_apply', 'external_redirect', 'unknown'].includes(job.applyPath as string)
                    ? (job.applyPath as 'easy_apply' | 'external_redirect' | 'unknown')
                    : 'unknown',
                  easyApplyEligible: job.easyApplyEligible ?? false,
                  postedAt: job.postedAt || new Date().toISOString(),
                  discoveredAt: new Date().toISOString(),
                  salaryText: job.salaryText || null,
                  summary: job.summary || job.description.slice(0, 240),
                  description: job.description,
                  keySkills: job.keySkills ?? []
                }
                
                // Validate with schema before adding
                const validation = JobPostingSchema.safeParse(jobToAdd)
                if (validation.success) {
                  state.collectedJobs.push(validation.data)
                  addedCount++
                } else {
                  console.warn(`[Agent] Skipping invalid job ${job.sourceJobId}:`, validation.error)
                }
              }
            }

            if (addedCount > 0) {
              console.log(`[Agent] +${addedCount} jobs (${state.collectedJobs.length} total) from ${extractData.pageUrl.slice(0, 60)}...`)
            }

            onProgress?.({
              currentUrl: extractData.pageUrl,
              jobsFound: state.collectedJobs.length,
              stepCount: state.stepCount,
              currentAction: `extract_result:${addedCount}:${state.collectedJobs.length}:${extractedJobs.length}`,
              targetId: null,
              adapterKind: config.source
            })

            return {
              ...result,
              data: {
                ...result.data,
                jobsExtracted: extractedJobs.length,
                totalJobs: state.collectedJobs.length
              }
            }
          }
        }

        return result
      } catch (error) {
        if (attempt === maxRetries) {
          return {
            success: false,
            error: `Failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown'}`
          }
        }
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 500 * attempt))
      }
    }
  }

  return {
    success: false,
    error: `Unknown tool: ${toolName}`
  }
}

function createUserPrompt(config: AgentConfig): string {
  const targetRoles = config.searchPreferences.targetRoles.length > 0
    ? config.searchPreferences.targetRoles.join(', ')
    : 'Not specified'
  const preferredLocations = config.searchPreferences.locations.length > 0
    ? config.searchPreferences.locations.join(', ')
    : 'Not specified'

  return `Please find job postings that match my profile and preferences.

Target Roles: ${targetRoles}
Preferred Locations: ${preferredLocations}
Experience Level: ${config.userProfile.yearsExperience != null ? `${config.userProfile.yearsExperience} years` : 'Not specified'}

Starting URLs to explore:
${config.startingUrls.map(url => `- ${url}`).join('\n')}

Goal: Find ${config.targetJobCount} relevant job postings.

The site may present listings in any language. Treat multilingual and non-English jobs as valid candidates when they match the target roles and locations.

Instructions:
1. Navigate to the starting URLs
2. Use search functionality if available, or scroll through listings
3. Click into job details to get full descriptions when needed
4. Extract structured job data using the extract_jobs tool
5. Navigate back to continue searching
6. Continue until you've found ${config.targetJobCount} relevant jobs or exhausted options

Focus on recent postings that match the target roles and locations.`
}
