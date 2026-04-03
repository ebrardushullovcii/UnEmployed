import { describe, expect, test, vi } from 'vitest'
import type { CandidateProfile, JobSearchPreferences } from '@unemployed/contracts'
import {
  completeResumeExtraction,
  createOpenAiCompatibleJobFinderAiClient,
  createDeterministicJobFinderAiClient,
  createJobFinderAiClientFromEnvironment
} from './index'

function createProfile(): CandidateProfile {
  return {
    id: 'candidate_1',
    firstName: 'Alex',
    lastName: 'Vanguard',
    middleName: null,
    fullName: 'Alex Vanguard',
    preferredDisplayName: null,
    headline: 'Workflow engineer',
    summary: 'Builds reliable automation.',
    currentLocation: 'London, UK',
    currentCity: null,
    currentRegion: null,
    currentCountry: null,
    timeZone: null,
    yearsExperience: 8,
    email: null,
    secondaryEmail: null,
    phone: null,
    portfolioUrl: null,
    linkedinUrl: null,
    githubUrl: null,
    personalWebsiteUrl: null,
    baseResume: {
      id: 'resume_1',
      fileName: 'resume.txt',
      uploadedAt: '2026-03-20T10:00:00.000Z',
      storagePath: null,
      textContent: 'Resume text',
      textUpdatedAt: '2026-03-20T10:00:00.000Z',
      extractionStatus: 'ready' as const,
      lastAnalyzedAt: '2026-03-20T10:01:00.000Z',
      analysisProviderKind: 'deterministic',
      analysisProviderLabel: 'Built-in deterministic agent fallback',
      analysisWarnings: []
    },
    workEligibility: {
      authorizedWorkCountries: [],
      requiresVisaSponsorship: null,
      willingToRelocate: null,
      preferredRelocationRegions: [],
      willingToTravel: null,
      remoteEligible: null,
      noticePeriodDays: null,
      availableStartDate: null,
      securityClearance: null
    },
    professionalSummary: {
      shortValueProposition: null,
      fullSummary: null,
      careerThemes: [],
      leadershipSummary: null,
      domainFocusSummary: null,
      strengths: []
    },
    skillGroups: {
      coreSkills: [],
      tools: [],
      languagesAndFrameworks: [],
      softSkills: [],
      highlightedSkills: []
    },
    targetRoles: ['Staff Frontend Engineer'],
    locations: ['London, UK'],
    skills: ['React', 'TypeScript'],
    experiences: [],
    education: [],
    certifications: [],
    links: [],
    projects: [],
    spokenLanguages: []
  }
}

function createPreferences(): JobSearchPreferences {
  return {
    targetRoles: ['Staff Frontend Engineer'],
    jobFamilies: [],
    locations: ['London, UK'],
    excludedLocations: [],
    workModes: ['remote'],
    seniorityLevels: ['Staff'],
    targetIndustries: [],
    targetCompanyStages: [],
    employmentTypes: [],
    minimumSalaryUsd: 150000,
    targetSalaryUsd: null,
    salaryCurrency: 'USD',
    approvalMode: 'review_before_submit' as const,
    tailoringMode: 'balanced' as const,
    companyBlacklist: [],
    companyWhitelist: [],
    discovery: {
      historyLimit: 5,
      targets: [
        {
          id: 'target_primary',
          label: 'Primary target',
          startingUrl: 'https://www.linkedin.com/jobs/search/',
          enabled: true,
          adapterKind: 'auto',
          customInstructions: null,
          instructionStatus: 'missing',
          validatedInstructionId: null,
          draftInstructionId: null,
          lastDebugRunId: null,
          lastVerifiedAt: null,
          staleReason: null
        }
      ]
    }
  }
}

function createExtraction(
  overrides: Partial<Awaited<ReturnType<ReturnType<typeof createDeterministicJobFinderAiClient>['extractProfileFromResume']>>> = {}
) {
  return {
    firstName: null,
    lastName: null,
    middleName: null,
    fullName: null,
    headline: null,
    summary: null,
    currentLocation: null,
    timeZone: null,
    salaryCurrency: null,
    yearsExperience: null,
    email: null,
    phone: null,
    portfolioUrl: null,
    linkedinUrl: null,
    githubUrl: null,
    personalWebsiteUrl: null,
    professionalSummary: {
      shortValueProposition: null,
      fullSummary: null,
      careerThemes: [],
      leadershipSummary: null,
      domainFocusSummary: null,
      strengths: []
    },
    skillGroups: {
      coreSkills: [],
      tools: [],
      languagesAndFrameworks: [],
      softSkills: [],
      highlightedSkills: []
    },
    skills: [],
    targetRoles: [],
    preferredLocations: [],
    experiences: [],
    education: [],
    certifications: [],
    links: [],
    projects: [],
    spokenLanguages: [],
    analysisProviderKind: 'deterministic' as const,
    analysisProviderLabel: 'test',
    notes: [],
    ...overrides
  }
}

describe('ai providers', () => {
  test('extracts structured details with the deterministic client', async () => {
    const client = createDeterministicJobFinderAiClient()

    const result = await client.extractProfileFromResume({
      existingProfile: createProfile(),
      existingSearchPreferences: createPreferences(),
      resumeText:
        [
          'Ebrar Dushullovci',
          'Date of birth: 04/07/1998 Nationality: Kosovar Phone: (+383) 44283970 (Mobile) Email:',
          'ebrar.dushullovci@gmail.com Website: https://www.linkedin.com/in/ebrar-dushullovci-5b98b420b/',
          'Address: Prishtina, Kosovo (Home)',
          'ABOUT MYSELF',
          'A passionate software developer with 6+ years of full-stack experience building impactful solutions using React, Next.js,',
          'Node.js, .NET Core, SQL Server and Azure. After spending time in management, and leading projects and teams, I',
          'recently decided to return to hands-on development, where my career initially began and where my true passion lies. I',
          'am driven by solving complex challenges and continuously improving the quality and efficiency of the software I create.',
          'SKILLS',
          'Frameworks',
          'React, Node.js, Next.js, Express.js, React Native ASP.NET, .Net Core, .Net Framework, MVC, Entity Framework',
          'Programming Languages',
          'Javascript, TypeScript C# SQL Python',
          'WORK EXPERIENCE',
          'REACT/NEXT.JS DEVELOPER – 07/2023 – CURRENT'
        ].join('\n')
    })

    expect(result.firstName).toBe('Ebrar')
    expect(result.lastName).toBe('Dushullovci')
    expect(result.fullName).toBe('Ebrar Dushullovci')
    expect(result.headline).toBe('React/Next.js Developer')
    expect(result.currentLocation).toBe('Prishtina, Kosovo')
    expect(result.summary).toContain('A passionate software developer with 6+ years of full-stack experience')
    expect(result.email).toBe('ebrar.dushullovci@gmail.com')
    expect(result.phone).toBe('(+383) 44283970')
    expect(result.portfolioUrl).toBeNull()
    expect(result.linkedinUrl).toBe('https://www.linkedin.com/in/ebrar-dushullovci-5b98b420b/')
    expect(result.targetRoles).toEqual(['React/Next.js Developer'])
    expect(result.preferredLocations).toEqual(['Prishtina, Kosovo'])
    expect(result.analysisProviderKind).toBe('deterministic')
    expect(result.notes).toEqual([])
    expect(result.skills).toContain('React')
    expect(result.skillGroups.languagesAndFrameworks).toContain('React')
    expect(result.professionalSummary.fullSummary).toContain('A passionate software developer')
    expect(result.experiences[0]?.title).toBe('React/Next.js Developer')
    expect(result.links[0]?.kind).toBe('linkedin')
  })

  test('handles alternate summary and skills sections without seeded leakage', async () => {
    const client = createDeterministicJobFinderAiClient()

    const result = await client.extractProfileFromResume({
      existingProfile: createProfile(),
      existingSearchPreferences: createPreferences(),
      resumeText: [
        'Mira Stone',
        'Lead Product Engineer - 2024 - CURRENT',
        'Address: Toronto, Canada',
        'PROFILE',
        'Hands-on product engineer focused on polished frontend systems, experimentation, and shipping measurable improvements.',
        'CORE SKILLS',
        'React, TypeScript, Design Systems, Accessibility, Product Strategy'
      ].join('\n')
    })

    expect(result.fullName).toBe('Mira Stone')
    expect(result.headline).toBe('Lead Product Engineer')
    expect(result.currentLocation).toBe('Toronto, Canada')
    expect(result.summary).toContain('Hands-on product engineer focused on polished frontend systems')
    expect(result.skills).toEqual(['React', 'TypeScript', 'Design Systems', 'Accessibility', 'Product Strategy'])
    expect(result.skillGroups.coreSkills).toContain('React')
    expect(result.targetRoles).toEqual(['Lead Product Engineer'])
    expect(result.analysisProviderKind).toBe('deterministic')
  })

  test('does not treat degree or role lines as fallback locations', async () => {
    const client = createDeterministicJobFinderAiClient()

    const result = await client.extractProfileFromResume({
      existingProfile: createProfile(),
      existingSearchPreferences: createPreferences(),
      resumeText: [
        'Jamie Rivers',
        'Staff Engineer, Acme Corp',
        "Bachelor of Science, Riinvest College",
        'PROFILE',
        'Hands-on product engineer focused on resilient systems.'
      ].join('\n')
    })

    expect(result.currentLocation).toBe('London, UK')
    expect(result.preferredLocations).toEqual(['London, UK'])
  })

  test('parses real imported resume details into structured sections', async () => {
    const client = createDeterministicJobFinderAiClient()

    const result = await client.extractProfileFromResume({
      existingProfile: createProfile(),
      existingSearchPreferences: createPreferences(),
      resumeText: [
        'Ebrar Dushullovci',
        'Date of birth: 04/07/1998 Nationality: Kosovar Phone: (+383) 44283970 (Mobile) Email:',
        'ebrar.dushullovci@gmail.com Website: https://www.linkedin.com/in/ebrar-dushullovci-5b98b420b/',
        'Address: Prishtina, Kosovo (Home)',
        'ABOUT MYSELF',
        'A passionate software developer with 6+ years of full-stack experience building impactful solutions using React, Next.js, Node.js, .NET Core, SQL Server and Azure.',
        'SKILLS',
        'Frameworks',
        'React, Node.js, Next.js, Express.js, React Native ASP.NET, .Net Core, .Net Framework, MVC, Entity Framework',
        'Programming Languages',
        'Javascript, TypeScript C# SQL Python',
        'Databases',
        'SQL Server MySQL PostgreSQL MongoDB',
        'Tools',
        'Docker Git Azure/AWS WebSockets Postman Jira Figma Selenium Cypress',
        'Security & Authentication',
        'OAuth JWT',
        'Soft Skills',
        'Leadership Communication Problem-solving Adaptability',
        'WORK EXPERIENCE',
        ' AUTOMATEDPROS – PRISHTINA, KOSOVO',
        'REACT/NEXT.JS DEVELOPER – 07/2023 – CURRENT',
        'After deciding to return to my passion for development, I transitioned back into a hands-on developer role,',
        'contributing to two key projects.',
        '• Engineered a real-time restaurant order platform with React, Next.js, TailwindCSS & WebSockets.',
        "BACHELOR'S DEGREE, COMPUTER SCIENCE Kolegji Riinvest (Riinvest College)",
        'Mother tongue(s): ALBANIAN',
        'ENGLISH C2 C2 C2 C2 C2'
      ].join('\n')
    })

    expect(result.skillGroups.tools).toEqual(expect.arrayContaining(['SQL Server', 'MySQL', 'PostgreSQL', 'MongoDB', 'Docker']))
    expect(result.skillGroups.softSkills).toEqual(
      expect.arrayContaining(['Leadership', 'Communication', 'Problem-solving', 'Adaptability'])
    )
    expect(result.experiences[0]).toMatchObject({
      companyName: 'AUTOMATEDPROS',
      location: 'Prishtina, Kosovo',
      title: 'React/Next.js Developer',
      startDate: '07/2023',
      isCurrent: true
    })
    expect(result.experiences[0]?.achievements).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Engineered a real-time restaurant order platform')
      ])
    )
    expect(result.experiences[0]?.skills).toEqual(
      expect.arrayContaining(['React', 'Next.js', 'TailwindCSS', 'WebSockets'])
    )
    expect(result.education[0]?.schoolName).toContain('Kolegji Riinvest')
    expect(result.education[0]?.degree).toBe("BACHELOR'S DEGREE")
    expect(result.timeZone).toBe('Europe/Belgrade')
    expect(result.salaryCurrency).toBe('EUR')
    expect(result.spokenLanguages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ language: 'Albanian', proficiency: 'Native' }),
        expect.objectContaining({ language: 'English', proficiency: 'C2' })
      ])
    )
  })

  test('prefers top-level personal sites over arbitrary non-platform links', async () => {
    const client = createDeterministicJobFinderAiClient()

    const result = await client.extractProfileFromResume({
      existingProfile: createProfile(),
      existingSearchPreferences: createPreferences(),
      resumeText: [
        'Jamie Rivers',
        'https://acme.com/team/jamie-rivers',
        'https://github.com/jamie-rivers',
        'https://www.linkedin.com/in/jamie-rivers',
        'https://jamierivers.dev'
      ].join('\n')
    })

    expect(result.personalWebsiteUrl).toBe('https://jamierivers.dev')
  })

  test('chooses likely portfolio links over company or certification URLs when no personal site is present', async () => {
    const client = createDeterministicJobFinderAiClient()

    const result = await client.extractProfileFromResume({
      existingProfile: createProfile(),
      existingSearchPreferences: createPreferences(),
      resumeText: [
        'Jamie Rivers',
        'https://acme.com/team/jamie-rivers',
        'https://www.credly.com/badges/example-badge',
        'https://github.com/jamie-rivers',
        'https://www.linkedin.com/in/jamie-rivers'
      ].join('\n')
    })

    expect(result.portfolioUrl).toBe('https://github.com/jamie-rivers')
  })

  test('keeps merged experience and education unions when fallback data is richer', () => {
    const primary = createExtraction({
      experiences: [
        {
          companyName: null,
          companyUrl: null,
          title: 'Software Engineer',
          employmentType: null,
          location: null,
          workMode: null,
          startDate: '2024',
          endDate: null,
          isCurrent: false,
          summary: null,
          achievements: [],
          skills: [],
          domainTags: [],
          peopleManagementScope: null,
          ownershipScope: null
        },
        {
          companyName: 'DesignCo',
          companyUrl: null,
          title: 'Designer',
          employmentType: null,
          location: 'Remote',
          workMode: 'remote',
          startDate: '2022',
          endDate: '2023',
          isCurrent: false,
          summary: 'Owned design systems',
          achievements: ['Led a redesign'],
          skills: ['Figma'],
          domainTags: [],
          peopleManagementScope: null,
          ownershipScope: null
        }
      ],
      education: [
        {
          schoolName: 'Riinvest',
          degree: null,
          fieldOfStudy: null,
          location: 'Prishtina',
          startDate: null,
          endDate: null,
          summary: null
        },
        {
          schoolName: 'Local College',
          degree: 'BSc',
          fieldOfStudy: 'Computer Science',
          location: 'London',
          startDate: null,
          endDate: null,
          summary: null
        }
      ]
    })
    const fallback = createExtraction({
      experiences: [
        {
          companyName: 'Acme',
          companyUrl: 'https://acme.example',
          title: 'Engineer',
          employmentType: 'full_time',
          location: 'Remote',
          workMode: 'remote',
          startDate: '2024',
          endDate: null,
          isCurrent: true,
          summary: 'Built product features',
          achievements: ['Shipped new flows'],
          skills: ['React'],
          domainTags: [],
          peopleManagementScope: null,
          ownershipScope: null
        },
        {
          companyName: 'Ops Co',
          companyUrl: null,
          title: 'Operations Lead',
          employmentType: null,
          location: 'Berlin',
          workMode: 'hybrid',
          startDate: '2021',
          endDate: '2022',
          isCurrent: false,
          summary: 'Led operations',
          achievements: ['Scaled hiring'],
          skills: ['Leadership'],
          domainTags: [],
          peopleManagementScope: null,
          ownershipScope: null
        }
      ],
      education: [
        {
          schoolName: 'Riinvest College',
          degree: 'BSc',
          fieldOfStudy: 'Computer Science',
          location: 'Prishtina',
          startDate: null,
          endDate: null,
          summary: 'Graduated with honors'
        },
        {
          schoolName: 'Graduate School',
          degree: 'MSc',
          fieldOfStudy: 'Design Systems',
          location: 'Berlin',
          startDate: null,
          endDate: null,
          summary: null
        }
      ]
    })

    const result = completeResumeExtraction(primary, fallback)

    expect(result.experiences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Software Engineer', companyName: 'Acme', isCurrent: true }),
        expect.objectContaining({ title: 'Designer', companyName: 'DesignCo' }),
        expect.objectContaining({ title: 'Operations Lead', companyName: 'Ops Co' })
      ])
    )
    expect(result.education).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ schoolName: 'Riinvest College', degree: 'BSc' }),
        expect.objectContaining({ schoolName: 'Local College', degree: 'BSc' }),
        expect.objectContaining({ schoolName: 'Graduate School', degree: 'MSc' })
      ])
    )
  })

  test('preserves unmatched fallback links without urls while still merging null-url positions', () => {
    const primary = createExtraction({
      links: [
        {
          label: null,
          url: null,
          kind: null
        },
        {
          label: 'GitHub',
          url: 'https://github.com/alex-vanguard',
          kind: null
        }
      ]
    })
    const fallback = createExtraction({
      links: [
        {
          label: 'Portfolio',
          url: null,
          kind: 'portfolio'
        },
        {
          label: 'Personal website',
          url: null,
          kind: 'website'
        },
        {
          label: null,
          url: 'https://github.com/alex-vanguard',
          kind: 'github'
        }
      ]
    })

    const result = completeResumeExtraction(primary, fallback)

    expect(result.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Portfolio', url: null, kind: 'portfolio' }),
        expect.objectContaining({ label: 'Personal website', url: null, kind: 'website' }),
        expect.objectContaining({ label: 'GitHub', url: 'https://github.com/alex-vanguard', kind: 'github' })
      ])
    )
    expect(result.links.filter((entry) => entry.url === null)).toHaveLength(2)
  })

  test('backfills missing experience title and start date from the matched fallback entry', () => {
    const primary = createExtraction({
      experiences: [
        {
          companyName: 'Acme',
          companyUrl: null,
          title: null,
          employmentType: null,
          location: 'Remote',
          workMode: null,
          startDate: null,
          endDate: null,
          isCurrent: false,
          summary: null,
          achievements: [],
          skills: [],
          domainTags: [],
          peopleManagementScope: null,
          ownershipScope: null
        }
      ]
    })
    const fallback = createExtraction({
      experiences: [
        {
          companyName: 'Acme',
          companyUrl: null,
          title: 'Senior Engineer',
          employmentType: null,
          location: 'Remote',
          workMode: null,
          startDate: '2023',
          endDate: null,
          isCurrent: true,
          summary: 'Led platform work',
          achievements: [],
          skills: [],
          domainTags: [],
          peopleManagementScope: null,
          ownershipScope: null
        }
      ]
    })

    const result = completeResumeExtraction(primary, fallback)

    expect(result.experiences[0]).toMatchObject({
      title: 'Senior Engineer',
      startDate: '2023',
      isCurrent: true
    })
  })

  test('does not graft a concrete fallback url onto a null-url link by position', () => {
    const primary = createExtraction({
      links: [
        {
          label: 'Portfolio',
          url: null,
          kind: null
        }
      ]
    })
    const fallback = createExtraction({
      links: [
        {
          label: 'GitHub',
          url: 'https://github.com/alex-vanguard',
          kind: 'github'
        }
      ]
    })

    const result = completeResumeExtraction(primary, fallback)

    expect(result.links).toEqual([
      expect.objectContaining({ label: 'Portfolio', url: null, kind: null }),
      expect.objectContaining({ label: 'GitHub', url: 'https://github.com/alex-vanguard', kind: 'github' })
    ])
  })

  test('preserves parsed zero years experience instead of falling back to seeded values', async () => {
    const client = createDeterministicJobFinderAiClient()

    const result = await client.extractProfileFromResume({
      existingProfile: createProfile(),
      existingSearchPreferences: createPreferences(),
      resumeText: [
        'Alex Vanguard',
        'Junior Developer',
        '0 years experience with professional software teams.'
      ].join('\n')
    })

    expect(result.yearsExperience).toBe(0)
  })

  test('keeps bullet achievements when the first non-heading detail line is a bullet', async () => {
    const client = createDeterministicJobFinderAiClient()

    const result = await client.extractProfileFromResume({
      existingProfile: createProfile(),
      existingSearchPreferences: createPreferences(),
      resumeText: [
        'Alex Vanguard',
        'WORK EXPERIENCE',
        'ACME – LONDON, UK',
        'SOFTWARE ENGINEER – 2023 – CURRENT',
        '• Led a critical migration across multiple services with zero downtime.',
        '• Built automation tooling for release validation and monitoring.'
      ].join('\n')
    })

    expect(result.experiences[0]?.summary).toBeNull()
    expect(result.experiences[0]?.achievements).toEqual(
      expect.arrayContaining([
        'Led a critical migration across multiple services with zero downtime.',
        'Built automation tooling for release validation and monitoring.'
      ])
    )
  })

  test('surfaces non-json provider errors without raw response details', async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = (() =>
      Promise.resolve(new Response('<html>Bad Gateway</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' }
      }))) as typeof fetch

    try {
      const client = createOpenAiCompatibleJobFinderAiClient({
        apiKey: 'test-key',
        baseUrl: 'https://example.com/v1',
        model: 'test-model',
        label: 'AI resume agent'
      })

      await expect(client.tailorResume({
        profile: createProfile(),
        searchPreferences: createPreferences(),
        settings: {
          resumeFormat: 'html',
          resumeTemplateId: 'classic_ats',
          fontPreset: 'inter_requisite',
          humanReviewRequired: true,
          allowAutoSubmitOverride: false,
          keepSessionAlive: true,
          discoveryOnly: false
        },
        job: {
          source: 'target_site',
          sourceJobId: 'job_1',
          discoveryMethod: 'browser_agent',
          canonicalUrl: 'https://jobs.example.com/1',
          title: 'Frontend Engineer',
          company: 'Acme',
          location: 'Remote',
          workMode: ['remote'],
          applyPath: 'unknown',
          easyApplyEligible: false,
          postedAt: '2026-03-20T10:00:00.000Z',
          discoveredAt: '2026-03-20T10:00:00.000Z',
          salaryText: null,
          summary: 'Build product interfaces',
          description: 'Build product interfaces',
          keySkills: ['React']
        },
        resumeText: 'Resume text'
      })).rejects.toThrow('Model request failed with status 502')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('falls back to deterministic mode without an API key', () => {
    const client = createJobFinderAiClientFromEnvironment({
      UNEMPLOYED_AI_API_KEY: undefined
    })

    expect(client.getStatus().kind).toBe('deterministic')
  })

  test('configures the AI provider when the API key is present', () => {
    const client = createJobFinderAiClientFromEnvironment({
      UNEMPLOYED_AI_API_KEY: 'test-key'
    })

    expect(client.getStatus()).toMatchObject({
      kind: 'openai_compatible',
      model: 'FelidaeAI-Pro-2.5',
      label: 'AI resume agent'
    })
  })

  test('marks the OpenAI-compatible client as not ready when config is invalid', () => {
    const client = createOpenAiCompatibleJobFinderAiClient({
      apiKey: 'test-key',
      baseUrl: 'not-a-url',
      model: '',
      label: 'AI resume agent'
    })

    expect(client.getStatus()).toMatchObject({
      kind: 'openai_compatible',
      ready: false,
      model: null,
      baseUrl: null,
      label: 'AI resume agent'
    })
  })

  test('preserves extracted apply metadata when the model returns it', async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = (() =>
      Promise.resolve(new Response(
        JSON.stringify({
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
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      ))) as typeof fetch

    try {
      const client = createJobFinderAiClientFromEnvironment({
        UNEMPLOYED_AI_API_KEY: 'test-key',
        UNEMPLOYED_AI_BASE_URL: 'https://example.com/v1',
        UNEMPLOYED_AI_MODEL: 'test-model'
      })

      const jobs = await client.extractJobsFromPage({
        pageText: 'Frontend Engineer role at Acme',
        pageUrl: 'https://jobs.example.com/search',
        pageType: 'search_results',
        maxJobs: 5
      })

      expect(jobs).toHaveLength(1)
      expect(jobs[0]).toMatchObject({
        applyPath: 'easy_apply',
        easyApplyEligible: true
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('normalizes scalar work mode and key skills before validating extracted jobs', async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = (() =>
      Promise.resolve(new Response(
        JSON.stringify({
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
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      ))) as typeof fetch

    try {
      const client = createJobFinderAiClientFromEnvironment({
        UNEMPLOYED_AI_API_KEY: 'test-key',
        UNEMPLOYED_AI_BASE_URL: 'https://example.com/v1',
        UNEMPLOYED_AI_MODEL: 'test-model'
      })

      const jobs = await client.extractJobsFromPage({
        pageText: 'Frontend Engineer role at Acme',
        pageUrl: 'https://jobs.example.com/search',
        pageType: 'search_results',
        maxJobs: 5
      })

      expect(jobs).toHaveLength(1)
      expect(jobs[0]).toMatchObject({
        workMode: ['remote'],
        keySkills: ['React']
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('falls back from profile extraction with logged error details and merged notes', async () => {
    const originalFetch = globalThis.fetch
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    globalThis.fetch = (() => Promise.reject(new Error('upstream extraction failure'))) as typeof fetch

    try {
      const client = createJobFinderAiClientFromEnvironment({
        UNEMPLOYED_AI_API_KEY: 'test-key',
        UNEMPLOYED_AI_BASE_URL: 'https://example.com/v1',
        UNEMPLOYED_AI_MODEL: 'test-model'
      })

      const result = await client.extractProfileFromResume({
        existingProfile: createProfile(),
        existingSearchPreferences: createPreferences(),
        resumeText: 'Alex Vanguard\nLondon, UK\nReact engineer'
      })

      expect(result.analysisProviderKind).toBe('deterministic')
      expect(result.notes).toContain('Fell back to the deterministic resume parser after the model call failed.')
      expect(result.notes).toContain('Primary AI extraction failed: upstream extraction failure')
      expect(errorSpy).toHaveBeenCalledWith(
        '[AI Provider] extractProfileFromResume failed; falling back to deterministic client.',
        expect.any(Error)
      )
    } finally {
      globalThis.fetch = originalFetch
      errorSpy.mockRestore()
    }
  })

  test('falls back from tailoring with logged error details and merged notes', async () => {
    const originalFetch = globalThis.fetch
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    globalThis.fetch = (() => Promise.reject(new Error('upstream tailoring failure'))) as typeof fetch

    try {
      const client = createJobFinderAiClientFromEnvironment({
        UNEMPLOYED_AI_API_KEY: 'test-key',
        UNEMPLOYED_AI_BASE_URL: 'https://example.com/v1',
        UNEMPLOYED_AI_MODEL: 'test-model'
      })

      const result = await client.tailorResume({
        profile: createProfile(),
        searchPreferences: createPreferences(),
        settings: {
          resumeFormat: 'html',
          resumeTemplateId: 'classic_ats',
          fontPreset: 'inter_requisite',
          humanReviewRequired: true,
          allowAutoSubmitOverride: false,
          keepSessionAlive: true,
          discoveryOnly: false
        },
        job: {
          source: 'target_site',
          sourceJobId: 'job_1',
          discoveryMethod: 'browser_agent',
          canonicalUrl: 'https://jobs.example.com/1',
          title: 'Frontend Engineer',
          company: 'Acme',
          location: 'Remote',
          workMode: ['remote'],
          applyPath: 'unknown',
          easyApplyEligible: false,
          postedAt: '2026-03-20T10:00:00.000Z',
          discoveredAt: '2026-03-20T10:00:00.000Z',
          salaryText: null,
          summary: 'Build product interfaces',
          description: 'Build product interfaces',
          keySkills: ['React']
        },
        resumeText: 'Resume text'
      })

      expect(result.notes).toContain('Fell back to the deterministic resume tailorer after the model call failed.')
      expect(result.notes).toContain('Primary AI tailoring failed: upstream tailoring failure')
      expect(errorSpy).toHaveBeenCalledWith(
        '[AI Provider] tailorResume failed; falling back to deterministic client.',
        expect.any(Error)
      )
    } finally {
      globalThis.fetch = originalFetch
      errorSpy.mockRestore()
    }
  })
})

