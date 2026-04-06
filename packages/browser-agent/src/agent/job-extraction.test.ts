import { describe, expect, test } from 'vitest'
import { buildStructuredCandidateJobs } from './job-extraction'

describe('buildStructuredCandidateJobs', () => {
  test('builds jobs from generic search-result card candidates without site-specific rules', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://jobs.example.com/search',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://jobs.example.com/roles/frontend-engineer?utm_source=test',
          anchorText: 'Frontend Engineer',
          headingText: 'Frontend Engineer',
          lines: [
            'Frontend Engineer',
            'Acme',
            'Remote',
            'Build product interfaces for customer workflows.',
            'Posted 2 days ago',
            'Easy Apply',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        sourceJobId: 'jobs_example_com_roles_frontend_engineer',
        canonicalUrl: 'https://jobs.example.com/roles/frontend-engineer',
        title: 'Frontend Engineer',
        company: 'Acme',
        location: 'Remote',
        applyPath: 'easy_apply',
        easyApplyEligible: true,
        postedAt: null,
        postedAtText: 'Posted 2 days ago',
        summary: 'Build product interfaces for customer workflows.',
      }),
    ])
  })

  test('prefers richer structured data when it is available on the page', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://jobs.example.com/search',
      maxJobs: 5,
      structuredDataCandidates: [
        {
          canonicalUrl: 'https://jobs.example.com/roles/frontend-engineer',
          sourceJobId: 'job_schema_1',
          title: 'Frontend Engineer',
          company: 'Acme',
          location: 'Remote',
          description: 'Build product interfaces for the hiring platform.',
          summary: 'Build product interfaces.',
          postedAt: '2026-03-20T10:00:00.000Z',
          salaryText: '$120k',
          workMode: ['remote'],
          applyPath: 'easy_apply',
          easyApplyEligible: true,
          keySkills: ['React', 'TypeScript'],
          responsibilities: ['Build hiring workflows'],
          minimumQualifications: ['3+ years with React'],
          employmentType: 'Full-time',
        },
      ],
      cardCandidates: [
        {
          canonicalUrl: 'https://jobs.example.com/roles/frontend-engineer',
          anchorText: 'Frontend Engineer',
          headingText: 'Frontend Engineer',
          lines: ['Frontend Engineer', 'Acme', 'Remote'],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        sourceJobId: 'job_schema_1',
        canonicalUrl: 'https://jobs.example.com/roles/frontend-engineer',
        title: 'Frontend Engineer',
        company: 'Acme',
        location: 'Remote',
        description: 'Build product interfaces for the hiring platform.',
        salaryText: '$120k',
        applyPath: 'easy_apply',
        easyApplyEligible: true,
        keySkills: ['React', 'TypeScript'],
        responsibilities: ['Build hiring workflows'],
        minimumQualifications: ['3+ years with React'],
        employmentType: 'Full-time',
      }),
    ])
  })
})
