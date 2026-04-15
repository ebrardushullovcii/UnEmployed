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
})
