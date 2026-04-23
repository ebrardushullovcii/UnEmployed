import { describe, expect, test, vi } from 'vitest'
import type { Page } from 'playwright'
import { runAgentDiscovery, type JobExtractor, type LLMClient } from './agent'
import { createConfig, createToolCall } from './agent.test-fixtures'

describe('runAgentDiscovery fast-path extraction behavior', () => {
  test('search-results extraction keeps fast-path jobs before the slower extractor runs', async () => {
    const page = {
      async goto() {
        return null as never
      },
      async waitForTimeout() {
        return undefined
      },
      url() {
        return 'https://www.linkedin.com/jobs/search/'
      },
      async title() {
        return 'Primary target'
      },
      locator(selector: string) {
        if (selector === 'body') {
          return {
            async innerText() {
              return [
                'Search by title, skill, or company',
                'Frontend Engineer',
                'Acme',
                'Remote',
                'Apply',
                'Job description',
                'Build product interfaces for customer workflows.',
                'Use the jobs search filters and recommendations to find relevant roles quickly.',
              ]
                .join('\n')
                .repeat(20)
            },
          } as never
        }

        return {
          async innerText() {
            return ''
          },
        } as never
      },
      async evaluate(fn: unknown) {
        const serialized = String(fn)

        if (serialized.includes('querySelectorAll("a[href]")')) {
          return ['https://www.linkedin.com/jobs/view/job_fast_path_1']
        }

        if (serialized.includes('cardCandidates') || serialized.includes('application/ld+json')) {
          return {
            structuredDataCandidates: [],
            cardCandidates: [
              {
                canonicalUrl: 'https://www.linkedin.com/jobs/view/job_fast_path_1',
                anchorText: 'Frontend Engineer',
                headingText: 'Frontend Engineer',
                lines: [
                  'Frontend Engineer',
                  'Acme',
                  'Remote',
                  'Build product interfaces for customer workflows.',
                  'Easy Apply',
                ],
              },
            ],
          }
        }

        return []
      },
    } as unknown as Page
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: 'extract the visible results page',
          toolCalls: [
            createToolCall(
              'extract_jobs',
              { pageType: 'search_results', maxJobs: 2 },
              'tool_extract_fast_path',
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: 'No action taken',
          toolCalls: [],
        }),
    }
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => []),
    }
    const progressEvents: Array<{ message?: string | null }> = []

    const result = await runAgentDiscovery(
      page,
      {
        ...createConfig(),
        targetJobCount: 2,
        promptContext: {
          siteLabel: 'Primary target',
        },
      },
      llmClient,
      jobExtractor,
      (progress) => {
        progressEvents.push({ message: progress.message })
      },
    )

    expect(result.jobs).toHaveLength(1)
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1)
    expect(progressEvents.some((event) => event.message?.includes('Kept 1 new job'))).toBe(true)
  })

  test('phase-driven search-results extraction skips the slower model extractor once fast path already produced jobs', async () => {
    const page = {
      async goto() {
        return null as never
      },
      async waitForTimeout() {
        return undefined
      },
      url() {
        return 'https://www.linkedin.com/jobs/search/?currentJobId=438896875'
      },
      async title() {
        return 'Primary target'
      },
      locator(selector: string) {
        if (selector === 'body') {
          return {
            async innerText() {
              return [
                'Search by title, skill, or company',
                'Frontend Engineer',
                'Acme',
                'Remote',
                'Apply',
                'Job description',
                'Build product interfaces for customer workflows.',
              ]
                .join('\n')
                .repeat(20)
            },
          } as never
        }

        return {
          async innerText() {
            return ''
          },
        } as never
      },
      async evaluate(fn: unknown) {
        const serialized = String(fn)

        if (serialized.includes('querySelectorAll("a[href]")')) {
          return ['https://www.linkedin.com/jobs/view/job_fast_phase_1']
        }

        if (serialized.includes('cardCandidates') || serialized.includes('application/ld+json')) {
          return {
            structuredDataCandidates: [],
            cardCandidates: [
              {
                canonicalUrl: 'https://www.linkedin.com/jobs/view/job_fast_phase_1',
                anchorText: 'Frontend Engineer',
                headingText: 'Frontend Engineer',
                lines: [
                  'Frontend Engineer',
                  'Acme',
                  'Remote',
                  'Build product interfaces for customer workflows.',
                  'Easy Apply',
                ],
              },
            ],
          }
        }

        return []
      },
    } as unknown as Page
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: 'extract the visible results page',
          toolCalls: [
            createToolCall(
              'extract_jobs',
              { pageType: 'search_results', maxJobs: 2 },
              'tool_extract_phase_fast_path',
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: 'finish with structured findings',
          toolCalls: [
            createToolCall(
              'finish',
              {
                reason: 'Enough evidence collected.',
                summary: 'Fast path proved the route without waiting for slower extraction.',
                reliableControls: [],
                trickyFilters: [],
                navigationTips: [],
                applyTips: [],
                warnings: [],
              },
              'tool_finish_phase_fast_path',
            ),
          ],
        }),
    }
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => []),
    }

    const result = await runAgentDiscovery(page, createConfig(), llmClient, jobExtractor)

    expect(result.jobs).toHaveLength(1)
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(0)
  })

  test('phase-driven search-results extraction still uses the slower extractor when fast path does not fill the requested evidence budget', async () => {
    const page = {
      async goto() {
        return null as never
      },
      async waitForTimeout() {
        return undefined
      },
      url() {
        return 'https://www.linkedin.com/jobs/search/?currentJobId=438896875'
      },
      async title() {
        return 'Primary target'
      },
      locator(selector: string) {
        if (selector === 'body') {
          return {
            async innerText() {
              return [
                'Search by title, skill, or company',
                'Frontend Engineer',
                'Acme',
                'Remote',
                'Apply',
                'Job description',
                'Build product interfaces for customer workflows.',
              ]
                .join('\n')
                .repeat(20)
            },
          } as never
        }

        return {
          async innerText() {
            return ''
          },
        } as never
      },
      async evaluate(fn: unknown) {
        const serialized = String(fn)

        if (serialized.includes('querySelectorAll("a[href]")')) {
          return ['https://www.linkedin.com/jobs/view/job_fast_phase_partial_1']
        }

        if (serialized.includes('cardCandidates') || serialized.includes('application/ld+json')) {
          return {
            structuredDataCandidates: [],
            cardCandidates: [
              {
                canonicalUrl: 'https://www.linkedin.com/jobs/view/job_fast_phase_partial_1',
                anchorText: 'Frontend Engineer',
                headingText: 'Frontend Engineer',
                lines: [
                  'Frontend Engineer',
                  'Acme',
                  'Remote',
                  'Build product interfaces for customer workflows.',
                ],
              },
            ],
          }
        }

        return []
      },
    } as unknown as Page
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: 'extract the visible results page',
          toolCalls: [
            createToolCall(
              'extract_jobs',
              { pageType: 'search_results', maxJobs: 2 },
              'tool_extract_phase_partial_fast_path',
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: 'finish with structured findings',
          toolCalls: [
            createToolCall(
              'finish',
              {
                reason: 'Enough evidence collected.',
                summary: 'Needed both fast and slower extraction paths to satisfy the budget.',
                reliableControls: [],
                trickyFilters: [],
                navigationTips: [],
                applyTips: [],
                warnings: [],
              },
              'tool_finish_phase_partial_fast_path',
            ),
          ],
        }),
    }
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => [
        {
          sourceJobId: 'job_fast_phase_partial_2',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/job_fast_phase_partial_2',
          title: 'React Engineer',
          company: 'Beta',
          location: 'Remote',
          description: 'Second extracted job.',
          salaryText: null,
          summary: 'Second extracted job.',
          postedAt: '2026-03-20T09:00:00.000Z',
          workMode: ['remote' as const],
          applyPath: 'unknown' as const,
          easyApplyEligible: false,
          keySkills: ['React'],
        },
      ]),
    }

    const config = createConfig()
    config.targetJobCount = 2

    const result = await runAgentDiscovery(page, config, llmClient, jobExtractor)

    expect(result.jobs).toHaveLength(2)
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1)
  })

  test('discovery merges richer deferred fast-path candidates for the same results page key', async () => {
    let currentUrl = 'https://www.linkedin.com/jobs/search/?currentJobId=111'
    let extractionCaptureCount = 0
    const page = {
      async goto(url: string) {
        currentUrl = url
        return null as never
      },
      async waitForTimeout() {
        return undefined
      },
      url() {
        return currentUrl
      },
      async title() {
        return 'Primary target'
      },
      locator(selector: string) {
        if (selector === 'body') {
          return {
            async innerText() {
              return [
                'Search by title, skill, or company',
                'Frontend Engineer',
                'Acme',
                'Remote',
                'Apply',
                'Job description',
                'Build product interfaces for customer workflows.',
                'Use the jobs search filters and recommendations to find relevant roles quickly.',
              ]
                .join('\n')
                .repeat(20)
            },
          } as never
        }

        return {
          async innerText() {
            return ''
          },
        } as never
      },
      async evaluate(fn: unknown) {
        const serialized = String(fn)

        if (serialized.includes('querySelectorAll("a[href]")')) {
          return ['https://www.linkedin.com/jobs/view/job_merge_fast_path_1']
        }

        if (serialized.includes('cardCandidates') || serialized.includes('application/ld+json')) {
          extractionCaptureCount += 1
          return {
            structuredDataCandidates: [],
            cardCandidates:
              extractionCaptureCount === 1
                ? []
                : [
                    {
                      canonicalUrl: 'https://www.linkedin.com/jobs/view/job_merge_fast_path_1',
                      anchorText: 'Frontend Engineer',
                      headingText: 'Frontend Engineer',
                      lines: [
                        'Frontend Engineer',
                        'Acme',
                        'Remote',
                        'Build product interfaces for customer workflows.',
                        'Easy Apply',
                      ],
                    },
                  ],
          }
        }

        return []
      },
    } as unknown as Page
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: 'capture the first results page snapshot',
          toolCalls: [
            createToolCall(
              'extract_jobs',
              { pageType: 'search_results', maxJobs: 2 },
              'tool_extract_merge_1',
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: 'capture the same results page with richer candidates',
          toolCalls: [
            createToolCall(
              'navigate',
              {
                url: 'https://www.linkedin.com/jobs/search/?currentJobId=222',
                timeout: 5000,
              },
              'tool_nav_merge_2',
            ),
            createToolCall(
              'extract_jobs',
              { pageType: 'search_results', maxJobs: 2 },
              'tool_extract_merge_2',
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: 'No action taken',
          toolCalls: [],
        }),
    }
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => []),
    }

    const result = await runAgentDiscovery(
      page,
      {
        ...createConfig(),
        targetJobCount: 1,
        promptContext: {
          siteLabel: 'Primary target',
        },
        maxSteps: 5,
      },
      llmClient,
      jobExtractor,
    )

    expect(result.jobs).toHaveLength(1)
    expect(result.jobs[0]?.canonicalUrl).toBe('https://www.linkedin.com/jobs/view/job_merge_fast_path_1')
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(0)
  })

  test('deferred search-result flush does not call the slower extractor once fast path fills the capped budget', async () => {
    const page = {
      async goto() {
        return null as never
      },
      async waitForTimeout() {
        return undefined
      },
      url() {
        return 'https://www.linkedin.com/jobs/search/?currentJobId=333'
      },
      async title() {
        return 'Primary target'
      },
      locator(selector: string) {
        if (selector === 'body') {
          return {
            async innerText() {
              return [
                'Search by title, skill, or company',
                'Frontend Engineer',
                'Acme',
                'Remote',
                'Apply',
                'Job description',
                'Build product interfaces for customer workflows.',
                'Use the jobs search filters and recommendations to find relevant roles quickly.',
              ]
                .join('\n')
                .repeat(20)
            },
          } as never
        }

        return {
          async innerText() {
            return ''
          },
        } as never
      },
      async evaluate(fn: unknown) {
        const serialized = String(fn)

        if (serialized.includes('querySelectorAll("a[href]")')) {
          return [
            'https://www.linkedin.com/jobs/view/job_budget_1',
            'https://www.linkedin.com/jobs/view/job_budget_2',
            'https://www.linkedin.com/jobs/view/job_budget_3',
            'https://www.linkedin.com/jobs/view/job_budget_4',
          ]
        }

        if (serialized.includes('cardCandidates') || serialized.includes('application/ld+json')) {
          return {
            structuredDataCandidates: [],
            cardCandidates: Array.from({ length: 4 }, (_, index) => ({
              canonicalUrl: `https://www.linkedin.com/jobs/view/job_budget_${index + 1}`,
              anchorText: `Frontend Engineer ${index + 1}`,
              headingText: `Frontend Engineer ${index + 1}`,
              lines: [
                `Frontend Engineer ${index + 1}`,
                'Acme',
                'Remote',
                'Build product interfaces for customer workflows.',
                'Easy Apply',
              ],
            })),
          }
        }

        return []
      },
    } as unknown as Page
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: 'capture the results page',
          toolCalls: [
            createToolCall(
              'extract_jobs',
              { pageType: 'search_results', maxJobs: 4 },
              'tool_extract_budget_guard',
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: 'No action taken',
          toolCalls: [],
        }),
    }
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => []),
    }

    const result = await runAgentDiscovery(
      page,
      {
        ...createConfig(),
        targetJobCount: 4,
        promptContext: {
          siteLabel: 'Primary target',
        },
        maxSteps: 2,
      },
      llmClient,
      jobExtractor,
    )

    expect(result.jobs).toHaveLength(4)
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(0)
  })
})
