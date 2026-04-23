import { describe, expect, test } from 'vitest'
import {
  buildStructuredCandidateJobs,
  isJobPreferenceAligned,
  shouldCanonicalizeSearchSurfaceDetailRoute,
} from './job-extraction'

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

  test('keeps cleaner structured fields when a merged card adds LinkedIn-style UI noise', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl:
        'https://www.linkedin.com/jobs/search/?keywords=Senior%20Full-Stack%20Software%20Engineer&location=Prishtina%2C%20Kosovo',
      maxJobs: 5,
      structuredDataCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/4399165260/?trackingId=abc123',
          sourceJobId: '4399165260',
          title: 'Senior Full Stack Engineer (Typescript)',
          company: 'Fresha',
          location: 'Pristina (On-site)',
          description: 'Build product systems for salons and marketplaces.',
          summary: 'Build product systems.',
          applyPath: 'unknown',
          easyApplyEligible: false,
          keySkills: ['TypeScript'],
        },
      ],
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/4399165260/?trackingId=noisy-card',
          anchorText:
            'Senior Full Stack Engineer (Typescript) (Verified job) Fresha • Pristina (On-site) Dismiss Senior Full Stack Engineer (Typescript) job 1 connection works here Viewed · Promoted',
          headingText: null,
          lines: [
            'Senior Full Stack Engineer (Typescript) (Verified job) Fresha • Pristina (On-site) Dismiss Senior Full Stack Engineer (Typescript) job 1 connection works here Viewed · Promoted',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        sourceJobId: '4399165260',
        canonicalUrl: 'https://www.linkedin.com/jobs/view/4399165260/',
        title: 'Senior Full Stack Engineer (Typescript)',
        company: 'Fresha',
        location: 'Pristina (On-site)',
      }),
    ])
  })

  test('normalizes LinkedIn detail tracking params so duplicate job variants merge into one candidate', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/search/?keywords=Software+Engineer&location=Pristina',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl:
            'https://www.linkedin.com/jobs/view/4404592001/?eBP=NOT_ELIGIBLE_FOR_CHARGING&refId=abc123',
          anchorText: 'Frontend Engineer',
          headingText: 'Frontend Engineer',
          lines: ['Frontend Engineer', 'Jobs Ai', 'Remote'],
        },
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/4404592001/',
          anchorText: 'Frontend Engineer',
          headingText: 'Frontend Engineer',
          lines: ['Frontend Engineer', 'Jobs Ai', 'Remote'],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/4404592001/',
        title: 'Frontend Engineer',
        company: 'Jobs Ai',
      }),
    ])
  })

  test('normalizes LinkedIn currentJobId routes into stable job view urls when the card proves the id', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/collections/recommended/',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl:
            'https://www.linkedin.com/jobs/search/?currentJobId=4404057151&geoId=104640522&keywords=Senior%20Full-Stack%20Software%20Engineer',
          sourceJobIdHint: '4404057151',
          anchorText: 'Full Stack Developer (AI-First)',
          headingText: 'Full Stack Developer (AI-First)',
          lines: [
            'Full Stack Developer (AI-First)',
            'Full Circle Agency',
            'Pristina (Remote)',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/4404057151/',
        sourceJobId: '4404057151',
        title: 'Full Stack Developer (AI-First)',
        company: 'Full Circle Agency',
        location: 'Pristina (Remote)',
      }),
    ])
  })

  test('prefers a card-level LinkedIn job id hint over the shared selected currentJobId route', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl:
        'https://www.linkedin.com/jobs/search/?currentJobId=4404057151&keywords=Senior%20Full-Stack%20Software%20Engineer&location=Prishtina%2C%20Kosovo',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl:
            'https://www.linkedin.com/jobs/search/?currentJobId=4404057151&keywords=Senior%20Full-Stack%20Software%20Engineer&location=Prishtina%2C%20Kosovo',
          sourceJobIdHint: '4404542575',
          anchorText: 'Full Stack Developer (AI-First)',
          headingText: 'Full Stack Developer (AI-First)',
          lines: [
            'Full Stack Developer (AI-First)',
            'Full Circle Agency',
            'Pristina (Remote)',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/4404542575/',
        sourceJobId: '4404542575',
        title: 'Full Stack Developer (AI-First)',
        company: 'Full Circle Agency',
      }),
    ])
  })

  test('does not canonicalize a seeded LinkedIn currentJobId search route when the card does not prove that id', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl:
        'https://www.linkedin.com/jobs/search/?currentJobId=4399165260&keywords=Senior%20Full-Stack%20Software%20Engineer&location=Prishtina%2C%20Kosovo',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl:
            'https://www.linkedin.com/jobs/search/?currentJobId=4399165260&keywords=Senior%20Full-Stack%20Software%20Engineer&location=Prishtina%2C%20Kosovo',
          anchorText: 'Full Stack Developer (AI-First)',
          headingText: 'Full Stack Developer (AI-First)',
          lines: [
            'Full Stack Developer (AI-First)',
            'Full Circle Agency',
            'Pristina (Remote)',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl:
          'https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
        title: 'Full Stack Developer (AI-First)',
        company: 'Full Circle Agency',
      }),
    ])
    expect(jobs[0]?.sourceJobId).toContain('full_stack_developer_ai_first')
  })

  test('does not collapse multiple visible LinkedIn cards onto the shared seeded search currentJobId route', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl:
        'https://www.linkedin.com/jobs/search/?currentJobId=4399165260&keywords=Senior%20Full-Stack%20Software%20Engineer&location=Prishtina%2C%20Kosovo',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl:
            'https://www.linkedin.com/jobs/search/?currentJobId=4399165260&keywords=Senior%20Full-Stack%20Software%20Engineer&location=Prishtina%2C%20Kosovo',
          anchorText: 'Frontend Engineer',
          headingText: 'Frontend Engineer',
          lines: ['Frontend Engineer', 'Odiin', 'Prishtina, Kosovo'],
        },
        {
          canonicalUrl:
            'https://www.linkedin.com/jobs/search/?currentJobId=4399165260&keywords=Senior%20Full-Stack%20Software%20Engineer&location=Prishtina%2C%20Kosovo',
          anchorText: 'Full Stack Developer (AI-First)',
          headingText: 'Full Stack Developer (AI-First)',
          lines: ['Full Stack Developer (AI-First)', 'Full Circle Agency', 'Pristina (Remote)'],
        },
      ],
    })

    expect(jobs).toHaveLength(2)
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Full Stack Developer (AI-First)' }),
        expect.objectContaining({ title: 'Frontend Engineer' }),
      ]),
    )
  })

  test('does not collapse multiple visible LinkedIn cards onto the shared seeded search route when fallback capture has no card-level id proof', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl:
        'https://www.linkedin.com/jobs/search/?keywords=Senior%20Full-Stack%20Software%20Engineer&location=Prishtina%2C%20Kosovo',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl:
            'https://www.linkedin.com/jobs/search/?keywords=Senior%20Full-Stack%20Software%20Engineer&location=Prishtina%2C%20Kosovo',
          anchorText: 'Senior Frontend Engineer',
          headingText: 'Senior Frontend Engineer',
          lines: ['Senior Frontend Engineer', 'Odiin', 'Prishtina, Kosovo'],
        },
        {
          canonicalUrl:
            'https://www.linkedin.com/jobs/search/?keywords=Senior%20Full-Stack%20Software%20Engineer&location=Prishtina%2C%20Kosovo',
          anchorText: 'Full Stack Developer (AI-First)',
          headingText: 'Full Stack Developer (AI-First)',
          lines: [
            'Full Stack Developer (AI-First)',
            'Full Circle Agency',
            'Prishtina (Remote)',
            'Dismiss Full Stack Developer (AI-First) job',
          ],
        },
      ],
    })

    expect(jobs).toHaveLength(2)
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Full Stack Developer (AI-First)' }),
        expect.objectContaining({ title: 'Senior Frontend Engineer' }),
      ]),
    )
    expect(new Set(jobs.map((job) => job.sourceJobId)).size).toBe(2)
  })

  test('sanitizes LinkedIn-style noisy metadata lines into clean company and location fields', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/collections/recommended/',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/4399165260/?trackingId=noisy-card',
          anchorText:
            'Senior Full Stack Engineer (Typescript) (Verified job) Fresha • Pristina (On-site) Dismiss Senior Full Stack Engineer (Typescript) job 1 connection works here Viewed · Promoted',
          headingText: 'Senior Full Stack Engineer (Typescript)',
          lines: [
            'Senior Full Stack Engineer (Typescript)',
            'Fresha • Pristina (On-site) Dismiss Senior Full Stack Engineer (Typescript) job 1 connection works here Viewed · Promoted',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/4399165260/',
        title: 'Senior Full Stack Engineer (Typescript)',
        company: 'Fresha',
        location: 'Pristina (On-site)',
      }),
    ])
  })

  test('prefers the fuller LinkedIn dismiss-title when the visible heading is truncated', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/search/?keywords=Software+Engineer&location=Pristina',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/4400784689/?trackingId=noisy-card',
          anchorText:
            '.NET Software Developer Quipu GmbH • Pristina (Hybrid) Dismiss .NET Software Developer job 1 connection works here Viewed · Promoted',
          headingText: '.NET',
          lines: [
            '.NET',
            'Quipu GmbH • Pristina (Hybrid) Dismiss .NET Software Developer job 1 connection works here Viewed · Promoted',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/4400784689/',
        title: '.NET Software Developer',
        company: 'Quipu GmbH',
        location: 'Pristina (Hybrid)',
      }),
    ])
  })

  test('recovers repeated LinkedIn technical titles before company and location pollution', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/search/?keywords=Software+Engineer&location=Pristina',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/4400784689/?trackingId=noisy-card',
          anchorText:
            '.NET Software Developer .NET Software Developer Quipu GmbH Pristina, District of Pristina, Kosovo (Hybrid)',
          headingText:
            '.NET Software Developer .NET Software Developer Quipu GmbH Pristina,',
          lines: [
            '.NET Software Developer .NET Software Developer Quipu GmbH Pristina, District of Pristina, Kosovo (Hybrid)',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/4400784689/',
        title: '.NET Software Developer',
      }),
    ])
  })

  test('recovers the fuller LinkedIn dismiss-title from card lines when anchor text is still truncated', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/search/?keywords=Backend+Engineer&location=Pristina',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/4400784690/?trackingId=noisy-card',
          anchorText: 'Backend',
          headingText: 'Backend',
          lines: [
            'Backend',
            'Acme • Pristina (Remote) Dismiss Backend TypeScript Engineer job 1 connection works here Viewed · Promoted',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/4400784690/',
        title: 'Backend TypeScript Engineer',
        company: 'Acme',
        location: 'Pristina (Remote)',
      }),
    ])
  })

  test('recovers fuller LinkedIn titles from dismiss labels when the visible title stops at seniority phrasing', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/search/?keywords=Full+Stack+Developer&location=Pristina',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/4404592001/?trackingId=noisy-card',
          anchorText: 'Mid-Level to Senior',
          headingText: 'Mid-Level to Senior',
          lines: [
            'Mid-Level to Senior',
            'MKY Treuhandpartner GmbH',
            'Pristina (Hybrid)',
            'Dismiss Mid-Level to Senior Software Developer job',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/4404592001/',
        title: 'Mid-Level to Senior Software Developer',
        company: 'MKY Treuhandpartner GmbH',
        location: 'Pristina (Hybrid)',
      }),
    ])
  })

  test('recovers fuller LinkedIn titles from dismiss labels when the visible title is only a single seniority token', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/search/?keywords=Software+Engineer&location=Pristina',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/4386674431/?trackingId=noisy-card',
          anchorText: 'Senior',
          headingText: 'Senior',
          lines: [
            'Senior',
            'Lodgify',
            'Remote',
            'Dismiss Senior Software Engineer job',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/4386674431/',
        title: 'Senior Software Engineer',
        company: 'Lodgify',
        location: 'Remote',
      }),
    ])
  })

  test('recovers a stronger LinkedIn title from metadata when the heading is generic and the line repeats the title with verification noise', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/collections/recommended/',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/4385358746/',
          anchorText: 'Senior',
          headingText: 'Senior',
          lines: [
            'Senior',
            'Senior Go Developer Senior Go Developer with verification Proxify Kosovo (Remote) 3 school alumni work here Promoted',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/4385358746/',
        title: 'Senior Go Developer',
        company: 'Proxify',
        location: 'Kosovo (Remote)',
      }),
    ])
  })

  test('does not keep a title-echo verification line as the company on LinkedIn cards', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/search/?keywords=Software+Engineer&location=Pristina',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/role_experienced/',
          anchorText: 'Experienced Software Engineer',
          headingText: 'Experienced Software Engineer',
          lines: [
            'Experienced Software Engineer',
            'Experienced Software Engineer Experienced Software Engineer with verification',
            'Proxify',
            'Kosovo (Remote)',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/role_experienced/',
        title: 'Experienced Software Engineer',
        company: 'Proxify',
        location: 'Kosovo (Remote)',
        }),
      ])
  })

  test('strips malformed title-overlap fragments from confidential LinkedIn company metadata', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl:
        'https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/4404057151/',
          anchorText: 'Full',
          headingText: 'Full',
          lines: [
            'Full',
            'Full Stack Engineer Full Stack Engineer Confidential',
            'Remote',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/4404057151/',
        title: 'Full Stack Engineer',
        company: 'Confidential',
        location: 'Remote',
      }),
    ])
  })

  test('splits polluted LinkedIn titles that append company text with an at separator', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl:
        'https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/role_backend_crossing_hurdles/',
          anchorText: 'Back-End Engineer | at Crossing Hurdles',
          headingText: 'Back-End Engineer | at Crossing Hurdles',
          lines: [
            'Back-End Engineer | at Crossing Hurdles',
            'Prishtina, Kosovo',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/role_backend_crossing_hurdles/',
        title: 'Back-End Engineer',
        company: 'Crossing Hurdles',
        location: 'Prishtina, Kosovo',
      }),
    ])
  })

  test('recovers the technical title when a polluted LinkedIn heading reverses company and title around an at separator', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl:
        'https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/4386851676/',
          anchorText:
            'Crossing Hurdles EMEA (Remote) $230K/yr - $280K/yr at Software Engineer (Fullstack)',
          headingText:
            'Crossing Hurdles EMEA (Remote) $230K/yr - $280K/yr at Software Engineer (Fullstack)',
          lines: [
            'Crossing Hurdles EMEA (Remote) $230K/yr - $280K/yr at Software Engineer (Fullstack)',
            'Crossing Hurdles',
            'EMEA (Remote)',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/4386851676/',
        title: 'Software Engineer (Fullstack)',
        company: 'Crossing Hurdles',
        location: 'EMEA (Remote)',
      }),
    ])
  })

  test('sanitizes repeated LinkedIn title overlap even when the fallback title already has multiple words', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl:
        'https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/4404057151/',
          anchorText: 'Full Stack Engineer Full',
          headingText: 'Full Stack Engineer Full',
          lines: [
            'Full Stack Engineer Full Stack Engineer Confidential',
            'Remote',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/4404057151/',
        title: 'Full Stack Engineer',
        company: 'Confidential',
        location: 'Remote',
      }),
    ])
  })

  test('prefers the recovered LinkedIn repeated title over a duplicated concatenated heading', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/search/?keywords=Software+Engineer&location=Pristina',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/role_frontend_concat/',
          anchorText: 'Senior Frontend Engineer Senior Frontend Engineer Fresha',
          headingText: 'Senior Frontend Engineer Senior Frontend Engineer Fresha',
          lines: [
            'Senior Frontend Engineer Senior Frontend Engineer Fresha • Pristina (On-site) 1 connection works here Viewed · Promoted',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/role_frontend_concat/',
        title: 'Senior Frontend Engineer',
        company: 'Fresha',
        location: 'Pristina (On-site)',
      }),
    ])
  })

  test('prefers the dismiss title when a LinkedIn heading is polluted with trailing company text', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/search/?keywords=Software+Engineer&location=Pristina',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/role_mky_polluted_heading/',
          anchorText:
            'Mid-Level to Senior Software Developer MKY Treuhandpartner GmbH • Pristina (Hybrid) Dismiss Mid-Level to Senior Software Developer job Viewed · Promoted',
          headingText:
            'Mid-Level to Senior Software Developer MKY Treuhandpartner GmbH',
          lines: [
            'Mid-Level to Senior Software Developer MKY Treuhandpartner GmbH • Pristina (Hybrid) Dismiss Mid-Level to Senior Software Developer job Viewed · Promoted',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/role_mky_polluted_heading/',
        title: 'Mid-Level to Senior Software Developer',
        company: 'MKY Treuhandpartner GmbH',
        location: 'Pristina (Hybrid)',
      }),
    ])
  })

  test('prefers the dismiss title when a LinkedIn heading repeats the title before the company', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/search/?keywords=Software+Engineer&location=Pristina',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/role_mky_repeated_heading/',
          anchorText:
            'Mid-Level to Senior Software Developer Mid-Level to Senior Software Developer MKY Treuhandpartner GmbH • Pristina (Hybrid) Dismiss Mid-Level to Senior Software Developer job Viewed · Promoted',
          headingText:
            'Mid-Level to Senior Software Developer Mid-Level to Senior Software Developer MKY Treuhandpartner GmbH',
          lines: [
            'Mid-Level to Senior Software Developer Mid-Level to Senior Software Developer MKY Treuhandpartner GmbH • Pristina (Hybrid) Dismiss Mid-Level to Senior Software Developer job Viewed · Promoted',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/role_mky_repeated_heading/',
        title: 'Mid-Level to Senior Software Developer',
        company: 'MKY Treuhandpartner GmbH',
        location: 'Pristina (Hybrid)',
      }),
    ])
  })

  test('prefers the dismiss title when a LinkedIn heading is polluted with trailing company text for Quipu-style cards', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/search/?keywords=Software+Engineer&location=Pristina',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/role_quipu_polluted_heading/',
          anchorText:
            '.NET Software Developer Quipu GmbH • Pristina (Hybrid) Dismiss .NET Software Developer job 1 connection works here Viewed · Promoted',
          headingText: '.NET Software Developer Quipu GmbH',
          lines: [
            '.NET Software Developer Quipu GmbH • Pristina (Hybrid) Dismiss .NET Software Developer job 1 connection works here Viewed · Promoted',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/role_quipu_polluted_heading/',
        title: '.NET Software Developer',
        company: 'Quipu GmbH',
        location: 'Pristina (Hybrid)',
      }),
    ])
  })

  test('prefers the dismiss title when a LinkedIn heading repeats the title before Quipu company text', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/search/?keywords=Software+Engineer&location=Pristina',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/role_quipu_repeated_heading/',
          anchorText:
            '.NET Software Developer .NET Software Developer Quipu GmbH • Pristina (Hybrid) Dismiss .NET Software Developer job 1 connection works here Viewed · Promoted',
          headingText: '.NET Software Developer .NET Software Developer Quipu GmbH',
          lines: [
            '.NET Software Developer .NET Software Developer Quipu GmbH • Pristina (Hybrid) Dismiss .NET Software Developer job 1 connection works here Viewed · Promoted',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/role_quipu_repeated_heading/',
        title: '.NET Software Developer',
        company: 'Quipu GmbH',
        location: 'Pristina (Hybrid)',
      }),
    ])
  })

  test('keeps the richer LinkedIn candidate when the same job url first appears through a weak nested card', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/search/?keywords=Software+Engineer&location=Pristina',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/4404057151/?trackingId=weak-card',
          anchorText: 'Full',
          headingText: 'Full',
          lines: ['Full', 'Confidential Careers'],
        },
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/4404057151/?trackingId=rich-card',
          anchorText:
            'Fullstack Developer | Remote Confidential Careers Dismiss Fullstack Developer | Remote job',
          headingText: 'Fullstack Developer',
          lines: [
            'Fullstack Developer',
            'Confidential Careers',
            'Remote',
            'Dismiss Fullstack Developer | Remote job',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/4404057151/',
        title: 'Fullstack Developer',
        company: 'Confidential Careers',
        location: 'Remote',
      }),
    ])
  })

  test('prioritizes extracted jobs that better match the saved role and location when maxJobs is small', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina',
      maxJobs: 1,
      searchPreferences: {
        targetRoles: ['Senior Full-Stack Software Engineer'],
        locations: ['Prishtina, Kosovo'],
      },
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/role_frontend/',
          anchorText: 'Senior Frontend Engineer',
          headingText: 'Senior Frontend Engineer',
          lines: ['Senior Frontend Engineer', 'Fresha', 'Pristina (On-site)'],
        },
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/role_fullstack/',
          anchorText: 'Full Stack Developer (AI-First)',
          headingText: 'Full Stack Developer (AI-First)',
          lines: ['Full Stack Developer (AI-First)', 'Full Circle Agency', 'Pristina (Remote)'],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/role_fullstack/',
        title: 'Full Stack Developer (AI-First)',
      }),
    ])
  })

  test('does not let broad software engineer titles outrank the stronger full-stack card under the review cap', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina',
      maxJobs: 1,
      searchPreferences: {
        targetRoles: ['Senior Full-Stack Software Engineer'],
        locations: ['Prishtina, Kosovo'],
      },
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/role_broad/',
          anchorText: 'Experienced Software Engineer',
          headingText: 'Experienced Software Engineer',
          lines: ['Experienced Software Engineer', 'Broad Co', 'Prishtina, Kosovo'],
        },
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/role_fullstack/',
          anchorText: 'Full Stack Developer (AI-First)',
          headingText: 'Full Stack Developer (AI-First)',
          lines: ['Full Stack Developer (AI-First)', 'Full Circle Agency', 'Prishtina (Remote)'],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/role_fullstack/',
        title: 'Full Stack Developer (AI-First)',
      }),
    ])
  })

  test('prefers the local full-stack card over a broader Kosovo-only full-stack match under the review cap', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina',
      maxJobs: 1,
      searchPreferences: {
        targetRoles: ['Senior Full-Stack Software Engineer'],
        locations: ['Prishtina, Kosovo'],
      },
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/role_broad_kosovo/',
          anchorText: 'Senior Fullstack (MERN) Developer',
          headingText: 'Senior Fullstack (MERN) Developer',
          lines: ['Senior Fullstack (MERN) Developer', 'Proxify', 'Kosovo (Remote)'],
        },
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/role_fullstack_local/',
          anchorText: 'Full Stack Developer (AI-First)',
          headingText: 'Full Stack Developer (AI-First)',
          lines: ['Full Stack Developer (AI-First)', 'Full Circle Agency', 'Prishtina (Remote)'],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/role_fullstack_local/',
        title: 'Full Stack Developer (AI-First)',
      }),
    ])
  })

  test('does not let a polluted LinkedIn software-developer card outrank the local full-stack card under the review cap', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina',
      maxJobs: 1,
      searchPreferences: {
        targetRoles: ['Senior Full-Stack Software Engineer'],
        locations: ['Prishtina, Kosovo'],
      },
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/role_mky_polluted/',
          anchorText:
            'Mid-Level to Senior Software Developer Mid-Level to Senior Software Developer MKY Treuhandpartner GmbH • Pristina, District of Pristina, Kosovo (Hybrid) Dismiss Mid-Level to Senior Software Developer job Viewed · Promoted',
          headingText:
            'Mid-Level to Senior Software Developer Mid-Level to Senior Software Developer MKY Treuhandpartner GmbH',
          lines: [
            'Mid-Level to Senior Software Developer Mid-Level to Senior Software Developer MKY Treuhandpartner GmbH • Pristina, District of Pristina, Kosovo (Hybrid) Dismiss Mid-Level to Senior Software Developer job Viewed · Promoted',
          ],
        },
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/role_fullstack_local/',
          anchorText: 'Full Stack Developer (AI-First)',
          headingText: 'Full Stack Developer (AI-First)',
          lines: [
            'Full Stack Developer (AI-First)',
            'Full Circle Agency',
            'Pristina (Remote)',
            'Dismiss Full Stack Developer (AI-First) job',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/role_fullstack_local/',
        title: 'Full Stack Developer (AI-First)',
      }),
    ])
  })

  test('downranks malformed LinkedIn candidates so cleaner full-stack cards win the review cap', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina',
      maxJobs: 1,
      searchPreferences: {
        targetRoles: ['Senior Full-Stack Software Engineer'],
        locations: ['Prishtina, Kosovo'],
      },
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/role_malformed/',
          anchorText: 'Full',
          headingText: 'Full',
          lines: ['Full', 'Full Full with verification', 'Remote'],
        },
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/role_fullstack/',
          anchorText: 'Full Stack Developer (AI-First)',
          headingText: 'Full Stack Developer (AI-First)',
          lines: ['Full Stack Developer (AI-First)', 'Full Circle Agency', 'Prishtina (Remote)'],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/role_fullstack/',
        title: 'Full Stack Developer (AI-First)',
      }),
    ])
  })

  test('prefers real LinkedIn results-list cards over detail-pane contamination when selecting the capped batch', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl:
        'https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
      maxJobs: 1,
      searchPreferences: {
        targetRoles: ['Senior Full-Stack Software Engineer'],
        locations: ['Prishtina, Kosovo'],
      },
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/detail-pane-frontend/',
          anchorText: 'Senior Frontend Engineer',
          headingText: 'Senior Frontend Engineer',
          lines: ['Senior Frontend Engineer', 'Odiin', 'Prishtina, Kosovo'],
          captureMeta: {
            domOrder: 0,
            rootTagName: 'aside',
            rootRole: null,
            rootClassName: 'jobs-search__job-details detail-pane',
            hasJobDataset: false,
            sameRootJobAnchorCount: 5,
            inLikelyResultsList: false,
            inAside: true,
            inHeader: false,
            inNavigation: false,
            inDetailPane: true,
            hasDismissLabel: false,
          },
        },
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/fullstack-list-card/',
          anchorText: 'Full Stack Developer (AI-First)',
          headingText: 'Full Stack Developer (AI-First)',
          lines: [
            'Full Stack Developer (AI-First)',
            'Full Circle Agency',
            'Prishtina (Remote)',
            'Dismiss Full Stack Developer (AI-First) job',
          ],
          captureMeta: {
            domOrder: 1,
            rootTagName: 'li',
            rootRole: 'listitem',
            rootClassName: 'jobs-search-results__list-item job-card-container',
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
          },
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/fullstack-list-card/',
        title: 'Full Stack Developer (AI-First)',
      }),
    ])
  })

  test('prefers visible in-viewport LinkedIn results cards when selecting the capped batch', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl:
        'https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
      maxJobs: 1,
      searchPreferences: {
        targetRoles: ['Senior Full-Stack Software Engineer'],
        locations: ['Prishtina, Kosovo'],
      },
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/offscreen-fullstack-role/',
          anchorText: 'Senior Full Stack Engineer',
          headingText: 'Senior Full Stack Engineer',
          lines: ['Senior Full Stack Engineer', 'Broader Co', 'Prishtina, Kosovo'],
          captureMeta: {
            domOrder: 0,
            rootTagName: 'li',
            rootRole: 'listitem',
            rootClassName: 'jobs-search-results__list-item job-card-container',
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
            isVisible: true,
            intersectsViewport: false,
            viewportTop: 1760,
            viewportDistance: 1040,
          },
        },
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/fullstack-visible-card/',
          anchorText: 'Full Stack Developer (AI-First)',
          headingText: 'Full Stack Developer (AI-First)',
          lines: [
            'Full Stack Developer (AI-First)',
            'Full Circle Agency',
            'Prishtina (Remote)',
            'Dismiss Full Stack Developer (AI-First) job',
          ],
          captureMeta: {
            domOrder: 1,
            rootTagName: 'li',
            rootRole: 'listitem',
            rootClassName: 'jobs-search-results__list-item job-card-container',
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
            isVisible: true,
            intersectsViewport: true,
            viewportTop: 140,
            viewportDistance: 0,
          },
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/fullstack-visible-card/',
        title: 'Full Stack Developer (AI-First)',
      }),
    ])
  })

  test('does not let LinkedIn surface quality displace the better full-stack role under the final cap', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl:
        'https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
      maxJobs: 1,
      searchPreferences: {
        targetRoles: ['Senior Full-Stack Software Engineer'],
        locations: ['Prishtina, Kosovo'],
      },
      cardCandidates: [
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/visible-frontend-card/',
          anchorText: 'Senior Frontend Engineer',
          headingText: 'Senior Frontend Engineer',
          lines: ['Senior Frontend Engineer', 'Odiin', 'Prishtina, Kosovo'],
          captureMeta: {
            domOrder: 0,
            rootTagName: 'li',
            rootRole: 'listitem',
            rootClassName: 'jobs-search-results__list-item job-card-container',
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
            isVisible: true,
            intersectsViewport: true,
            viewportTop: 112,
            viewportDistance: 0,
          },
        },
        {
          canonicalUrl: 'https://www.linkedin.com/jobs/view/offscreen-fullstack-card/',
          anchorText: 'Full Stack Developer (AI-First)',
          headingText: 'Full Stack Developer (AI-First)',
          lines: [
            'Full Stack Developer (AI-First)',
            'Full Circle Agency',
            'Prishtina (Remote)',
            'Dismiss Full Stack Developer (AI-First) job',
          ],
          captureMeta: {
            domOrder: 1,
            rootTagName: 'li',
            rootRole: 'listitem',
            rootClassName: 'jobs-search-results__list-item job-card-container',
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
            isVisible: true,
            intersectsViewport: false,
            viewportTop: 1280,
            viewportDistance: 560,
          },
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/offscreen-fullstack-card/',
        title: 'Full Stack Developer (AI-First)',
      }),
    ])
  })

  test('recovers sparse weak-target cards by deriving company from same-host detail urls and splitting composite titles', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://kosovajob.com/',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://kosovajob.com/shopaz/category-manager-fashion-sports-outdoor-e-commerce',
          anchorText: 'Category Manager, Fashion, Sports & Outdoor (E-Commerce) Prishtinë 11 ditë',
          headingText: null,
          lines: [
            'Category Manager, Fashion, Sports & Outdoor (E-Commerce) Prishtinë 11 ditë',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        sourceJobId: 'kosovajob_com_shopaz_category_manager_fashion_sports_outdoor_e_commerce',
        canonicalUrl: 'https://kosovajob.com/shopaz/category-manager-fashion-sports-outdoor-e-commerce',
        title: 'Category Manager, Fashion, Sports & Outdoor (E-Commerce)',
        company: 'Shopaz',
        location: 'Prishtinë',
        postedAtText: '11 ditë',
      }),
    ])
  })

  test('prefers technical weak-board jobs over non-technical local matches for technical searches', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://kosovajob.com/',
      maxJobs: 2,
      searchPreferences: {
        targetRoles: ['Senior Full-Stack Software Engineer'],
        locations: ['Prishtina, Kosovo'],
      },
      cardCandidates: [
        {
          canonicalUrl: 'https://kosovajob.com/company-x/software-developer-prishtine',
          anchorText: 'Software Developer',
          headingText: null,
          lines: [
            'Software Developer',
            'Company X',
            'Prishtinë',
            '2 ditë',
            'React',
            'TypeScript',
            'Node.js',
          ],
        },
        {
          canonicalUrl: 'https://kosovajob.com/shopaz/category-manager-fashion-sports-outdoor-e-commerce',
          anchorText: 'Category Manager, Fashion, Sports & Outdoor (E-Commerce)',
          headingText: null,
          lines: [
            'Category Manager, Fashion, Sports & Outdoor (E-Commerce)',
            'SHOPAZ',
            'Prishtinë',
            '2 ditë',
            'Merchandising',
            'Retail Operations',
          ],
        },
      ],
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        title: 'Software Developer',
      }),
      expect.objectContaining({
        title: 'Category Manager, Fashion, Sports & Outdoor (E-Commerce)',
      }),
    ])
  })

  test('does not treat generic path prefixes as company names when recovering sparse cards', () => {
    const jobs = buildStructuredCandidateJobs({
      pageUrl: 'https://jobs.example.com/search',
      maxJobs: 5,
      cardCandidates: [
        {
          canonicalUrl: 'https://jobs.example.com/jobs/frontend-engineer-remote',
          anchorText: 'Frontend Engineer Remote 2 days ago',
          headingText: null,
          lines: ['Frontend Engineer Remote 2 days ago'],
        },
      ],
    })

    expect(jobs).toEqual([])
  })
})

describe('isJobPreferenceAligned', () => {
  test('does not treat local non-technical jobs as aligned for technical searches', () => {
    expect(
      isJobPreferenceAligned({
        searchPreferences: {
          targetRoles: ['Senior Full-Stack Software Engineer'],
          locations: ['Prishtina, Kosovo'],
        },
        job: {
          sourceJobId: 'job_local_retail',
          canonicalUrl: 'https://kosovajob.com/jobs/local-retail',
          title: 'Category Manager',
          company: 'Shopaz',
          location: 'Prishtinë',
          description: 'Retail merchandising and category planning.',
          salaryText: null,
          summary: 'Retail merchandising and category planning.',
          postedAt: null,
          workMode: [],
          applyPath: 'unknown',
          easyApplyEligible: false,
          keySkills: ['Merchandising'],
        },
      }),
    ).toBe(false)
  })

  test('treats adjacent technical jobs as aligned for technical searches', () => {
    expect(
      isJobPreferenceAligned({
        searchPreferences: {
          targetRoles: ['Senior Full-Stack Software Engineer'],
          locations: ['Prishtina, Kosovo'],
        },
        job: {
          sourceJobId: 'job_local_software',
          canonicalUrl: 'https://kosovajob.com/jobs/local-software',
          title: 'Software Developer',
          company: 'Acme Tech',
          location: 'Prishtinë',
          description: 'Build internal web apps with React and Node.js.',
          salaryText: null,
          summary: 'React and TypeScript role.',
          postedAt: null,
          workMode: [],
          applyPath: 'unknown',
          easyApplyEligible: false,
          keySkills: ['React', 'TypeScript'],
        },
      }),
    ).toBe(true)
  })

  test('treats clearly technical platform roles as aligned for technical searches even without explicit skill overlap', () => {
    expect(
      isJobPreferenceAligned({
        searchPreferences: {
          targetRoles: ['Senior Full-Stack Software Engineer'],
          locations: ['Prishtina, Kosovo'],
        },
        job: {
          sourceJobId: 'job_platform_engineer',
          canonicalUrl: 'https://kosovajob.com/jobs/platform-engineer',
          title: 'Platform Engineer',
          company: 'Acme Cloud',
          location: 'Prishtinë',
          description: 'Own cloud infrastructure, platform services, and backend delivery systems.',
          salaryText: null,
          summary: 'Platform and cloud engineering role.',
          postedAt: null,
          workMode: [],
          applyPath: 'unknown',
          easyApplyEligible: false,
          keySkills: [],
        },
      }),
    ).toBe(true)
  })
})

describe('shouldCanonicalizeSearchSurfaceDetailRoute', () => {
  test('returns false for seeded LinkedIn search cards without a card-level id proof', () => {
    expect(
      shouldCanonicalizeSearchSurfaceDetailRoute({
        pageUrl:
          'https://www.linkedin.com/jobs/search/?currentJobId=4399165260&keywords=Senior%20Full-Stack%20Software%20Engineer&location=Prishtina%2C%20Kosovo',
        candidate: {
          canonicalUrl:
            'https://www.linkedin.com/jobs/search/?currentJobId=4399165260&keywords=Senior%20Full-Stack%20Software%20Engineer&location=Prishtina%2C%20Kosovo',
          anchorText: 'Full Stack Developer (AI-First)',
          headingText: 'Full Stack Developer (AI-First)',
          lines: ['Full Stack Developer (AI-First)', 'Full Circle Agency', 'Pristina (Remote)'],
        },
      }),
    ).toBe(false)
  })

  test('returns true when the card has its own LinkedIn job id hint', () => {
    expect(
      shouldCanonicalizeSearchSurfaceDetailRoute({
        pageUrl:
          'https://www.linkedin.com/jobs/search/?currentJobId=4399165260&keywords=Senior%20Full-Stack%20Software%20Engineer&location=Prishtina%2C%20Kosovo',
        candidate: {
          canonicalUrl:
            'https://www.linkedin.com/jobs/search/?currentJobId=4399165260&keywords=Senior%20Full-Stack%20Software%20Engineer&location=Prishtina%2C%20Kosovo',
          sourceJobIdHint: '4404542575',
          anchorText: 'Full Stack Developer (AI-First)',
          headingText: 'Full Stack Developer (AI-First)',
          lines: ['Full Stack Developer (AI-First)', 'Full Circle Agency', 'Pristina (Remote)'],
        },
      }),
    ).toBe(true)
  })
})
