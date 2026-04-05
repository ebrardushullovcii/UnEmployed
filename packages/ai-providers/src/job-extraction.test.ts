import { describe, expect, test, vi } from 'vitest'
import { createJobFinderAiClientFromEnvironment } from './index'
import {
  createEnvironment,
  mockJsonFetch
} from './test-fixtures'

describe('job extraction with openai-compatible client', () => {
  test('preserves extracted apply metadata when the model returns it', async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              jobs: [
                {
                  title: 'Frontend Engineer',
                  company: 'Acme',
                  location: 'Remote',
                  canonicalUrl: 'https://jobs.example.com/frontend-engineer',
                  sourceJobId: 'job_123',
                  description: 'Build product experiences.',
                  applyPath: 'easy_apply',
                  easyApplyEligible: true,
                  workMode: ['remote'],
                  keySkills: ['React', 'TypeScript']
                }
              ]
            })
          }
        }
      ]
    })

    try {
      const client = createJobFinderAiClientFromEnvironment(createEnvironment())

      const jobs = await client.extractJobsFromPage({
        pageText: 'Frontend Engineer role at Acme',
        pageUrl: 'https://jobs.example.com/search',
        pageType: 'search_results',
        maxJobs: 5
      })

      expect(jobs).toHaveLength(1)
      expect(jobs[0]).toMatchObject({
        applyPath: 'easy_apply',
        easyApplyEligible: true,
        summary: 'Build product experiences.',
        postedAt: null,
        postedAtText: null,
        responsibilities: [],
        minimumQualifications: [],
        preferredQualifications: []
      })
    } finally {
      restoreFetch()
    }
  })

  test('normalizes scalar work mode and key skills before validating extracted jobs', async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              jobs: [
                {
                  title: 'Frontend Engineer',
                  company: 'Acme',
                  location: 'Remote',
                  canonicalUrl: 'https://jobs.example.com/frontend-engineer',
                  sourceJobId: 'job_456',
                  description: 'Build product experiences.',
                  applyPath: 'external_redirect',
                  easyApplyEligible: false,
                  workMode: 'remote',
                  keySkills: 'React'
                }
              ]
            })
          }
        }
      ]
    })

    try {
      const client = createJobFinderAiClientFromEnvironment(createEnvironment())

      const jobs = await client.extractJobsFromPage({
        pageText: 'Frontend Engineer role at Acme',
        pageUrl: 'https://jobs.example.com/search',
        pageType: 'search_results',
        maxJobs: 5
      })

      expect(jobs).toHaveLength(1)
      expect(jobs[0]).toMatchObject({
        workMode: ['remote'],
        keySkills: ['React'],
        summary: 'Build product experiences.'
      })
    } finally {
      restoreFetch()
    }
  })

  test('preserves richer extracted job fields and avoids synthetic posted dates', async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              jobs: [
                {
                  title: 'Senior Frontend Engineer',
                  company: 'Acme',
                  location: 'Remote',
                  canonicalUrl: 'https://jobs.example.com/frontend-engineer',
                  sourceJobId: 'job_rich',
                  description: 'Build product experiences for the core platform.',
                  summary: 'Lead platform UI work.',
                  postedAtText: 'Posted 3 days ago',
                  responsibilities: ['Own the design-system frontend architecture'],
                  minimumQualifications: ['5+ years of React experience'],
                  preferredQualifications: ['Electron experience'],
                  seniority: 'Senior',
                  employmentType: 'Full-time',
                  department: 'Engineering',
                  team: 'Platform UI',
                  employerWebsiteUrl: 'https://acme.example.com/careers',
                  benefits: ['Remote-first culture'],
                  applyPath: 'easy_apply',
                  easyApplyEligible: true,
                  workMode: ['remote'],
                  keySkills: ['React', 'Electron']
                }
              ]
            })
          }
        }
      ]
    })

    try {
      const client = createJobFinderAiClientFromEnvironment(createEnvironment())

      const jobs = await client.extractJobsFromPage({
        pageText: 'Senior Frontend Engineer role at Acme',
        pageUrl: 'https://jobs.example.com/search',
        pageType: 'search_results',
        maxJobs: 5
      })

      expect(jobs[0]).toMatchObject({
        postedAt: null,
        postedAtText: 'Posted 3 days ago',
        responsibilities: ['Own the design-system frontend architecture'],
        minimumQualifications: ['5+ years of React experience'],
        preferredQualifications: ['Electron experience'],
        seniority: 'Senior',
        employmentType: 'Full-time',
        department: 'Engineering',
        team: 'Platform UI',
        employerWebsiteUrl: 'https://acme.example.com/careers',
        employerDomain: 'acme.example.com',
        benefits: ['Remote-first culture']
      })
    } finally {
      restoreFetch()
    }
  })

  test('limits job-detail extraction results to one job', async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              jobs: [
                {
                  title: 'Frontend Engineer',
                  company: 'Acme',
                  location: 'Remote',
                  canonicalUrl: 'https://jobs.example.com/frontend-engineer',
                  sourceJobId: 'job_111',
                  description: 'Build product experiences.',
                  applyPath: 'easy_apply',
                  easyApplyEligible: true,
                  workMode: ['remote'],
                  keySkills: ['React']
                },
                {
                  title: 'Second Listing',
                  company: 'Acme',
                  location: 'Remote',
                  canonicalUrl: 'https://jobs.example.com/frontend-engineer-2',
                  sourceJobId: 'job_222',
                  description: 'Should be ignored on detail pages.',
                  applyPath: 'external_redirect',
                  easyApplyEligible: false,
                  workMode: ['remote'],
                  keySkills: ['TypeScript']
                }
              ]
            })
          }
        }
      ]
    })

    try {
      const client = createJobFinderAiClientFromEnvironment(createEnvironment())

      const jobs = await client.extractJobsFromPage({
        pageText: 'Frontend Engineer role at Acme',
        pageUrl: 'https://jobs.example.com/frontend-engineer',
        pageType: 'job_detail',
        maxJobs: 5
      })

      expect(jobs).toHaveLength(1)
      expect(jobs[0]?.sourceJobId).toBe('job_111')
    } finally {
      restoreFetch()
    }
  })

  test('falls back when extracted jobs payload omits the top-level jobs array', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({ invalid: true })
          }
        }
      ]
    })

    try {
      const client = createJobFinderAiClientFromEnvironment(createEnvironment())

      const jobs = await client.extractJobsFromPage({
        pageText: 'Frontend Engineer role at Acme',
        pageUrl: 'https://jobs.example.com/search',
        pageType: 'search_results',
        maxJobs: 5
      })

      expect(jobs).toEqual([])
      expect(errorSpy).toHaveBeenCalledWith(
        '[AI Provider] extractJobsFromPage failed; falling back to deterministic client. [AI Provider] Expected a top-level jobs array when extracting jobs from jobs.example.com, received: {"invalid":true}'
      )
    } finally {
      restoreFetch()
      errorSpy.mockRestore()
    }
  })

  test('uses the grounded summary as description on search-results pages when the model omits description', async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              jobs: [
                {
                  title: 'Frontend Engineer',
                  company: 'Acme',
                  location: 'Remote',
                  canonicalUrl: 'https://jobs.example.com/frontend-engineer',
                  sourceJobId: 'job_summary_fallback',
                  description: '',
                  summary: 'Build product experiences from the search results snippet.',
                  applyPath: 'external_redirect',
                  easyApplyEligible: false,
                  workMode: ['remote'],
                  keySkills: ['React']
                }
              ]
            })
          }
        }
      ]
    })

    try {
      const client = createJobFinderAiClientFromEnvironment(createEnvironment())

      const jobs = await client.extractJobsFromPage({
        pageText: 'Frontend Engineer role at Acme with a visible summary snippet',
        pageUrl: 'https://jobs.example.com/search',
        pageType: 'search_results',
        maxJobs: 5
      })

      expect(jobs).toHaveLength(1)
      expect(jobs[0]).toMatchObject({
        summary: 'Build product experiences from the search results snippet.',
        description: 'Build product experiences from the search results snippet.'
      })
    } finally {
      restoreFetch()
    }
  })
})
