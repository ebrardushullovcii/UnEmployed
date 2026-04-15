import { describe, expect, test, vi } from 'vitest'
import type { Page } from 'playwright'
import { runAgentDiscovery, type JobExtractor, type LLMClient } from './agent'
import { createConfig, createPage, createToolCall } from './agent.test-fixtures'

describe('runAgentDiscovery deferred extraction behavior', () => {
  test('discovery defers repeated search-result extraction until the end of the run', async () => {
    const page = createPage() as Page
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: 'capture the first results page',
          toolCalls: [
            createToolCall(
              'extract_jobs',
              { pageType: 'search_results', maxJobs: 1 },
              'tool_extract_deferred_1',
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: 'capture the same results page again after more browsing',
          toolCalls: [
            createToolCall(
              'extract_jobs',
              { pageType: 'search_results', maxJobs: 1 },
              'tool_extract_deferred_2',
            ),
          ],
        }),
    }
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => [
        {
          sourceJobId: 'job_deferred_1',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/job_deferred_1',
          title: 'Workflow Engineer',
          company: 'Signal Systems',
          location: 'Remote',
          workMode: ['remote' as const],
          applyPath: 'unknown' as const,
          postedAt: '2026-03-20T09:00:00.000Z',
          salaryText: null,
          summary: 'Deferred extraction sample.',
          description: 'Deferred extraction sample.',
          easyApplyEligible: false,
          keySkills: ['React'],
          responsibilities: [],
        },
      ]),
    }

    const config = createConfig()
    config.maxSteps = 2
    config.promptContext = {
      siteLabel: 'Primary target',
    }

    const result = await runAgentDiscovery(page, config, llmClient, jobExtractor)

    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1)
    expect(result.jobs).toHaveLength(1)
  })

  test('discovery flushes deferred search-result extraction before max steps so it can stop early', async () => {
    const page = createPage() as Page
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: 'capture the first results page',
          toolCalls: [
            createToolCall(
              'extract_jobs',
              { pageType: 'search_results', maxJobs: 1 },
              'tool_extract_batch_1',
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: 'capture a second results page',
          toolCalls: [
            createToolCall(
              'navigate',
              { url: 'https://www.linkedin.com/jobs/collections/recommended/', timeout: 5000 },
              'tool_nav_batch_2',
            ),
            createToolCall(
              'extract_jobs',
              { pageType: 'search_results', maxJobs: 1 },
              'tool_extract_batch_2',
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: 'capture a third results page',
          toolCalls: [
            createToolCall(
              'navigate',
              {
                url: 'https://www.linkedin.com/jobs/collections/recommended/?collection=engineering',
                timeout: 5000,
              },
              'tool_nav_batch_3',
            ),
            createToolCall(
              'extract_jobs',
              { pageType: 'search_results', maxJobs: 1 },
              'tool_extract_batch_3',
            ),
          ],
        }),
    }
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => [
        {
          sourceJobId: 'job_batch_1',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/job_batch_1',
          title: 'Workflow Engineer',
          company: 'Signal Systems',
          location: 'Remote',
          workMode: ['remote' as const],
          applyPath: 'unknown' as const,
          postedAt: '2026-03-20T09:00:00.000Z',
          salaryText: null,
          summary: 'Deferred batch extraction sample.',
          description: 'Deferred batch extraction sample.',
          easyApplyEligible: false,
          keySkills: ['React'],
          responsibilities: [],
        },
      ]),
    }

    const config = createConfig()
    config.maxSteps = 5
    config.promptContext = {
      siteLabel: 'Primary target',
    }

    const result = await runAgentDiscovery(page, config, llmClient, jobExtractor)

    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(3)
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1)
    expect(result.jobs).toHaveLength(1)
    expect(result.steps).toBe(3)
  })

  test('discovery flushes queued search-result extraction after a no-op planning turn', async () => {
    const page = createPage() as Page
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: 'capture the visible results page first',
          toolCalls: [
            createToolCall(
              'extract_jobs',
              { pageType: 'search_results', maxJobs: 1 },
              'tool_extract_idle_flush_1',
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: 'No action taken',
          toolCalls: [],
        }),
    }
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => [
        {
          sourceJobId: 'job_idle_flush_1',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/job_idle_flush_1',
          title: 'Workflow Engineer',
          company: 'Signal Systems',
          location: 'Remote',
          workMode: ['remote' as const],
          applyPath: 'unknown' as const,
          postedAt: '2026-03-20T09:00:00.000Z',
          salaryText: null,
          summary: 'Deferred extraction after an idle planning turn.',
          description: 'Deferred extraction after an idle planning turn.',
          easyApplyEligible: false,
          keySkills: ['React'],
          responsibilities: [],
        },
      ]),
    }

    const config = createConfig()
    config.maxSteps = 6
    config.targetJobCount = 1
    config.promptContext = {
      siteLabel: 'Primary target',
    }

    const result = await runAgentDiscovery(page, config, llmClient, jobExtractor)

    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(2)
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1)
    expect(result.jobs).toHaveLength(1)
    expect(result.steps).toBe(2)
  })
})
