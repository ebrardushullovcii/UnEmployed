import { describe, expect, test, vi } from 'vitest'
import type { Page } from 'playwright'
import { runAgentDiscovery, type JobExtractor, type LLMClient } from './agent'
import { createConfig, createPage, createToolCall } from './agent.test-fixtures'

describe('runAgentDiscovery stagnation behavior', () => {
  test('discovery stops early after repeated zero-yield extraction passes on a cold source', async () => {
    const page = createPage() as Page
    let llmCallCount = 0
    const llmClient: LLMClient = {
      chatWithTools: vi.fn(async () => {
        llmCallCount += 1

        if (llmCallCount === 1) {
          return {
            content: 'extract one strong sample job first',
            toolCalls: [
              createToolCall(
                'extract_jobs',
                { pageType: 'job_detail', maxJobs: 1 },
                'tool_extract_stagnation_seed',
              ),
            ],
          }
        }

        if (llmCallCount <= 4) {
          return {
            content: 'check another likely detail page',
            toolCalls: [
              createToolCall(
                'extract_jobs',
                { pageType: 'job_detail', maxJobs: 1 },
                `tool_extract_stagnation_${llmCallCount}`,
              ),
            ],
          }
        }

        return {
          content: 'No action taken',
          toolCalls: [],
        }
      }),
    }
    let extractionCallCount = 0
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => {
        extractionCallCount += 1

        if (extractionCallCount === 1) {
          return [
            {
              sourceJobId: 'job_stagnation_seed',
              canonicalUrl: 'https://www.linkedin.com/jobs/view/job_stagnation_seed',
              title: 'Workflow Engineer',
              company: 'Signal Systems',
              location: 'Remote',
              workMode: ['remote' as const],
              applyPath: 'unknown' as const,
              postedAt: '2026-03-20T09:00:00.000Z',
              salaryText: null,
              summary: 'Initial seeded job before the source goes cold.',
              description: 'Initial seeded job before the source goes cold.',
              easyApplyEligible: false,
              keySkills: ['React'],
              responsibilities: [],
            },
          ]
        }

        return []
      }),
    }

    const config = createConfig()
    config.maxSteps = 20
    config.targetJobCount = 4
    config.promptContext = {
      siteLabel: 'Primary target',
    }

    const result = await runAgentDiscovery(page, config, llmClient, jobExtractor)

    expect(result.jobs).toHaveLength(1)
    expect(result.steps).toBe(9)
    expect(result.incomplete).toBe(true)
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(4)
    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(9)
  })

  test('discovery stops after holding a useful candidate set without new gains', async () => {
    const page = createPage() as Page
    let llmCallCount = 0
    const llmClient: LLMClient = {
      chatWithTools: vi.fn(async () => {
        llmCallCount += 1

        if (llmCallCount === 1) {
          return {
            content: 'extract a strong candidate set first',
            toolCalls: [
              createToolCall(
                'extract_jobs',
                { pageType: 'job_detail', maxJobs: 4 },
                'tool_extract_candidate_hold_seed',
              ),
            ],
          }
        }

        return {
          content: 'keep probing even though nothing new is appearing',
          toolCalls: [
            createToolCall(
              'get_interactive_elements',
              {},
              `tool_probe_candidate_hold_${llmCallCount}`,
            ),
          ],
        }
      }),
    }
    let extractionCallCount = 0
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => {
        extractionCallCount += 1

        if (extractionCallCount === 1) {
          return Array.from({ length: 4 }, (_, index) => ({
            sourceJobId: `job_candidate_hold_${index}`,
            canonicalUrl: `https://www.linkedin.com/jobs/view/job_candidate_hold_${index}`,
            title: `Workflow Engineer ${index}`,
            company: 'Signal Systems',
            location: 'Remote',
            workMode: ['remote' as const],
            applyPath: 'unknown' as const,
            postedAt: '2026-03-20T09:00:00.000Z',
            salaryText: null,
            summary: 'Useful candidate set before the source goes stale.',
            description: 'Useful candidate set before the source goes stale.',
            easyApplyEligible: false,
            keySkills: ['React'],
            responsibilities: [],
          }))
        }

        return []
      }),
    }

    const config = createConfig()
    config.maxSteps = 20
    config.targetJobCount = 8
    config.promptContext = {
      siteLabel: 'Primary target',
    }

    const result = await runAgentDiscovery(page, config, llmClient, jobExtractor)

    expect(result.jobs).toHaveLength(4)
    expect(result.incomplete).toBe(true)
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1)
    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(4)
  })

  test('discovery does not stop after holding only one candidate without new gains', async () => {
    const page = createPage() as Page
    let llmCallCount = 0
    const llmClient: LLMClient = {
      chatWithTools: vi.fn(async () => {
        llmCallCount += 1

        if (llmCallCount === 1) {
          return {
            content: 'extract one candidate first',
            toolCalls: [
              createToolCall(
                'extract_jobs',
                { pageType: 'job_detail', maxJobs: 1 },
                'tool_extract_single_candidate_seed',
              ),
            ],
          }
        }

        return {
          content: 'keep probing even though nothing new is appearing',
          toolCalls: [
            createToolCall(
              'get_interactive_elements',
              {},
              `tool_probe_single_candidate_${llmCallCount}`,
            ),
          ],
        }
      }),
    }
    let extractionCallCount = 0
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => {
        extractionCallCount += 1

        if (extractionCallCount === 1) {
          return [
            {
              sourceJobId: 'job_single_candidate_hold',
              canonicalUrl: 'https://www.linkedin.com/jobs/view/job_single_candidate_hold',
              title: 'Workflow Engineer',
              company: 'Signal Systems',
              location: 'Remote',
              workMode: ['remote' as const],
              applyPath: 'unknown' as const,
              postedAt: '2026-03-20T09:00:00.000Z',
              salaryText: null,
              summary: 'Only one candidate survived extraction so discovery should keep probing.',
              description: 'Only one candidate survived extraction so discovery should keep probing.',
              easyApplyEligible: false,
              keySkills: ['React'],
              responsibilities: [],
            },
          ]
        }

        return []
      }),
    }

    const config = createConfig()
    config.maxSteps = 6
    config.targetJobCount = 4
    config.promptContext = {
      siteLabel: 'Primary target',
    }

    const result = await runAgentDiscovery(page, config, llmClient, jobExtractor)

    expect(result.jobs).toHaveLength(1)
    expect(result.incomplete).toBe(true)
    expect(result.steps).toBe(6)
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1)
    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(6)
  })

  test('discovery does not stop early when the held candidate set is misaligned with saved preferences', async () => {
    const page = createPage() as Page
    let llmCallCount = 0
    const llmClient: LLMClient = {
      chatWithTools: vi.fn(async () => {
        llmCallCount += 1

        if (llmCallCount === 1) {
          return {
            content: 'extract an initial but weak candidate set',
            toolCalls: [
              createToolCall(
                'extract_jobs',
                { pageType: 'job_detail', maxJobs: 4 },
                'tool_extract_misaligned_hold_seed',
              ),
            ],
          }
        }

        return {
          content: 'keep probing because the current candidates are weak fits',
          toolCalls: [
            createToolCall(
              'get_interactive_elements',
              {},
              `tool_probe_misaligned_hold_${llmCallCount}`,
            ),
          ],
        }
      }),
    }
    let extractionCallCount = 0
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => {
        extractionCallCount += 1

        if (extractionCallCount === 1) {
          return Array.from({ length: 4 }, (_, index) => ({
            sourceJobId: `job_misaligned_hold_${index}`,
            canonicalUrl: `https://www.linkedin.com/jobs/view/job_misaligned_hold_${index}`,
            title: `Retail Category Manager ${index}`,
            company: 'Signal Systems',
            location: 'Remote',
            workMode: ['remote' as const],
            applyPath: 'unknown' as const,
            postedAt: '2026-03-20T09:00:00.000Z',
            salaryText: null,
            summary: 'Misaligned retail candidate set should not trigger early hold.',
            description: 'Retail planning, merchandising, and category ownership.',
            easyApplyEligible: false,
            keySkills: ['Merchandising'],
            responsibilities: [],
          }))
        }

        return []
      }),
    }

    const config = createConfig()
    config.maxSteps = 6
    config.targetJobCount = 8
    config.promptContext = {
      siteLabel: 'Primary target',
    }
    config.searchPreferences = {
      targetRoles: ['Workflow engineer'],
      locations: ['Remote'],
    }

    const result = await runAgentDiscovery(page, config, llmClient, jobExtractor)

    expect(result.jobs).toHaveLength(4)
    expect(result.incomplete).toBe(true)
    expect(result.steps).toBe(6)
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1)
    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(6)
  })
})
