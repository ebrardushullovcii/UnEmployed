import {
  ApplicationRecordSchema,
  BrowserSessionStateSchema,
  CandidateProfileSchema,
  JobFinderSettingsSchema,
  JobPostingSchema,
  JobSearchPreferencesSchema,
  SavedJobSchema,
  TailoredAssetSchema,
  type ApplicationRecord,
  type BrowserSessionState,
  type CandidateProfile,
  type JobFinderSettings,
  type JobPosting,
  type JobSearchPreferences,
  type SavedJob,
  type TailoredAsset
} from '@unemployed/contracts'
import type { JobFinderRepositorySeed } from '@unemployed/db'

function createCandidateProfile(): CandidateProfile {
  return CandidateProfileSchema.parse({
    id: 'candidate_alex_vanguard',
    firstName: 'Alex',
    lastName: 'Vanguard',
    middleName: null,
    fullName: 'Alex Vanguard',
    headline: 'Senior systems product designer',
    summary:
      'Designs dense workflow tools for high-trust operators and turns ambiguous platform requirements into practical, polished systems.',
    currentLocation: 'London, UK',
    yearsExperience: 12,
    email: 'alex.vanguard@example.com',
    phone: '+44 7700 900123',
    portfolioUrl: 'https://alexvanguard.design',
    linkedinUrl: 'https://www.linkedin.com/in/alex-vanguard',
    baseResume: {
      id: 'resume_alex_vanguard',
      fileName: 'alex-vanguard-resume.pdf',
      uploadedAt: '2026-03-20T09:30:00.000Z',
      storagePath: null,
      textContent:
        'Alex Vanguard\nSenior systems product designer\nLondon, UK\nalex.vanguard@example.com\n+44 7700 900123\nhttps://alexvanguard.design\nhttps://www.linkedin.com/in/alex-vanguard\n\nDesigns dense workflow tools for high-trust operators and turns ambiguous platform requirements into practical, polished systems.\n\n12 years of experience across product design, design systems, accessibility, prototyping, and React collaboration.\n\nSkills\nDesign Systems\nFigma\nReact\nPrototyping\nUX Strategy\nAccessibility',
      textUpdatedAt: '2026-03-20T09:30:00.000Z',
      extractionStatus: 'ready',
      lastAnalyzedAt: '2026-03-20T09:31:00.000Z',
      analysisWarnings: ['Seeded profile details were extracted from stored resume text.']
    },
    targetRoles: ['Product Design Director', 'Staff Product Designer', 'Design Systems Lead'],
    locations: ['Remote Global', 'London, UK'],
    skills: ['Design Systems', 'Figma', 'React', 'Prototyping', 'UX Strategy', 'Accessibility']
  })
}

function createSearchPreferences(): JobSearchPreferences {
  return JobSearchPreferencesSchema.parse({
    targetRoles: ['Product Design Director', 'Staff Product Designer', 'Design Systems Lead'],
    locations: ['Remote Global', 'London, UK'],
    workModes: ['remote', 'hybrid'],
    seniorityLevels: ['Senior', 'Staff', 'Lead'],
    minimumSalaryUsd: 160000,
    approvalMode: 'review_before_submit',
    tailoringMode: 'balanced',
    companyBlacklist: [],
    companyWhitelist: ['Signal Systems', 'Northwind Labs']
  })
}

function createLinkedInDiscoveryCatalog(): JobPosting[] {
  return [
    {
      source: 'linkedin',
      sourceJobId: 'linkedin_signal_staff_designer',
      canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_signal_staff_designer',
      title: 'Staff Product Designer',
      company: 'Signal Systems',
      location: 'Remote, UK/EU',
      workMode: 'remote',
      applyPath: 'easy_apply',
      easyApplyEligible: true,
      postedAt: '2026-03-20T08:10:00.000Z',
      discoveredAt: '2026-03-20T10:00:00.000Z',
      salaryText: '$180k - $215k',
      summary:
        'Lead dense operational workflows, systematize UI quality, and own the product-design layer for a browser-heavy enterprise platform.',
      description:
        'Lead dense operational workflows, improve enterprise UI quality, and shape cross-functional platform roadmaps for browser-heavy internal products.',
      keySkills: ['Design Systems', 'Enterprise UX', 'Figma']
    },
    {
      source: 'linkedin',
      sourceJobId: 'linkedin_northwind_principal_ux',
      canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_northwind_principal_ux',
      title: 'Principal UX Engineer',
      company: 'Northwind Labs',
      location: 'Hybrid, London',
      workMode: 'hybrid',
      applyPath: 'easy_apply',
      easyApplyEligible: true,
      postedAt: '2026-03-20T06:45:00.000Z',
      discoveredAt: '2026-03-20T10:00:00.000Z',
      salaryText: '$165k - $205k',
      summary:
        'Bridge product design and front-end implementation for a shared platform team shipping internal workflow tooling.',
      description:
        'Bridge product design and front-end implementation for platform tooling. Portfolio review required before final submission.',
      keySkills: ['React', 'Design Systems', 'Accessibility']
    },
    {
      source: 'linkedin',
      sourceJobId: 'linkedin_cloudline_design_lead',
      canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_cloudline_design_lead',
      title: 'Design Systems Lead',
      company: 'Cloudline',
      location: 'Remote, Europe',
      workMode: 'remote',
      applyPath: 'easy_apply',
      easyApplyEligible: true,
      postedAt: '2026-03-19T14:30:00.000Z',
      discoveredAt: '2026-03-20T10:00:00.000Z',
      salaryText: '$170k - $200k',
      summary:
        'Own a federated component ecosystem and steer interaction quality across a complex operations platform.',
      description:
        'Own a federated component ecosystem, steer governance, and define interaction quality standards across a remote operations platform.',
      keySkills: ['Component Libraries', 'Platform Design', 'Governance']
    },
    {
      source: 'linkedin',
      sourceJobId: 'linkedin_atlas_product_designer',
      canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_atlas_product_designer',
      title: 'Lead Product Designer',
      company: 'Atlas Systems',
      location: 'Remote, United States',
      workMode: 'remote',
      applyPath: 'easy_apply',
      easyApplyEligible: true,
      postedAt: '2026-03-18T17:05:00.000Z',
      discoveredAt: '2026-03-20T10:00:00.000Z',
      salaryText: '$155k - $185k',
      summary:
        'Drive product design for a logistics dashboard suite with deep data workflows and approvals-heavy operations.',
      description:
        'Drive logistics and approvals-heavy dashboard experiences for a distributed operations platform with strong systems constraints.',
      keySkills: ['Workflow Design', 'Data Products']
    },
    {
      source: 'linkedin',
      sourceJobId: 'linkedin_void_ui_engineer',
      canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_void_ui_engineer',
      title: 'UI Engineer',
      company: 'Void Industries',
      location: 'Remote, UK',
      workMode: 'remote',
      applyPath: 'easy_apply',
      easyApplyEligible: true,
      postedAt: '2026-03-20T09:00:00.000Z',
      discoveredAt: '2026-03-20T10:00:00.000Z',
      salaryText: '$170k - $210k',
      summary:
        'Ship high-trust operational UI systems while partnering tightly with product design and platform engineering.',
      description:
        'Ship operational UI systems for a regulated environment. Additional work authorization details are required during apply.',
      keySkills: ['React', 'UI Engineering', 'Design Systems']
    },
    {
      source: 'linkedin',
      sourceJobId: 'linkedin_neural_systems_operator',
      canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_neural_systems_operator',
      title: 'Senior Systems Operator',
      company: 'Neural Net Solutions',
      location: 'London, UK',
      workMode: 'hybrid',
      applyPath: 'easy_apply',
      easyApplyEligible: true,
      postedAt: '2026-03-19T11:30:00.000Z',
      discoveredAt: '2026-03-20T10:00:00.000Z',
      salaryText: '$162k - $190k',
      summary:
        'Own systems design quality across regulated operational surfaces and collaborate with infrastructure teams.',
      description:
        'Own systems design quality across regulated operational surfaces, collaborate with infrastructure teams, and improve governance signals.',
      keySkills: ['Governance', 'Workflow Design', 'Accessibility']
    }
  ].map((job) => JobPostingSchema.parse(job))
}

function createSavedJobs(): SavedJob[] {
  const [signal, northwind, cloudline, atlas] = createLinkedInDiscoveryCatalog()

  return [
    {
      ...signal,
      id: 'job_signal_staff_designer',
      status: 'ready_for_review',
      matchAssessment: {
        score: 98,
        reasons: [
          'Strong design systems leadership overlap.',
          'Excellent fit for information-dense workflow tools.',
          'Remote-first role matches the saved search preferences.'
        ],
        gaps: ['Hiring bar asks for deeper analytics instrumentation ownership.']
      }
    },
    {
      ...northwind,
      id: 'job_northwind_principal_ux',
      status: 'drafting',
      matchAssessment: {
        score: 89,
        reasons: [
          'Strong crossover between product design and front-end implementation.',
          'Hybrid London preference is acceptable for the current profile.'
        ],
        gaps: ['Role expects more accessibility program ownership.']
      }
    },
    {
      ...cloudline,
      id: 'job_cloudline_design_lead',
      status: 'approved',
      matchAssessment: {
        score: 84,
        reasons: [
          'Role is strongly aligned with design-systems leadership.',
          'Remote setup fits the preferred working model.'
        ],
        gaps: ['Less evidence of formal design-ops program leadership.']
      }
    },
    {
      ...atlas,
      id: 'job_atlas_product_designer',
      status: 'shortlisted',
      matchAssessment: {
        score: 76,
        reasons: ['Good workflow-design overlap and strong remote fit.'],
        gaps: ['Compensation is slightly below the saved salary target.']
      }
    }
  ].map((job) => SavedJobSchema.parse(job))
}

function createTailoredAssets(): TailoredAsset[] {
  return [
    {
      id: 'asset_signal_resume_v4',
      jobId: 'job_signal_staff_designer',
      kind: 'resume',
      status: 'ready',
      label: 'Tailored Resume',
      version: 'v4',
      templateName: 'Classic ATS',
      compatibilityScore: 98,
      progressPercent: 100,
      updatedAt: '2026-03-20T09:55:00.000Z',
      storagePath: null,
      contentText: 'Alex Vanguard\nSenior systems product designer\n\nSummary\nSenior systems product designer focused on dense workflow applications.',
      previewSections: [
        {
          heading: 'Summary',
          lines: [
            'Senior systems product designer focused on dense workflow applications, design systems, and cross-functional delivery.'
          ]
        },
        {
          heading: 'Experience Highlights',
          lines: [
            'Scaled a design system across multiple product teams and reduced UI inconsistency across operational surfaces.',
            'Partnered with engineering to turn prototype-heavy concepts into maintainable React patterns.'
          ]
        },
        {
          heading: 'Core Skills',
          lines: ['Design Systems', 'Figma', 'React', 'Information Architecture', 'UX Strategy']
        }
      ]
    },
    {
      id: 'asset_northwind_resume_v2',
      jobId: 'job_northwind_principal_ux',
      kind: 'resume',
      status: 'generating',
      label: 'Tailored Resume',
      version: 'v2',
      templateName: 'Classic ATS',
      compatibilityScore: null,
      progressPercent: 64,
      updatedAt: '2026-03-20T10:02:00.000Z',
      storagePath: null,
      contentText: null,
      previewSections: []
    },
    {
      id: 'asset_cloudline_resume_v1',
      jobId: 'job_cloudline_design_lead',
      kind: 'resume',
      status: 'ready',
      label: 'Tailored Resume',
      version: 'v1',
      templateName: 'Classic ATS',
      compatibilityScore: 94,
      progressPercent: 100,
      updatedAt: '2026-03-19T19:15:00.000Z',
      storagePath: null,
      contentText: 'Design systems leader with a track record of aligning platform governance and product delivery.',
      previewSections: [
        {
          heading: 'Summary',
          lines: ['Design systems leader with a track record of aligning platform governance and product delivery.']
        }
      ]
    }
  ].map((asset) => TailoredAssetSchema.parse(asset))
}

function createApplicationRecords(): ApplicationRecord[] {
  return [
    {
      id: 'application_neural_net',
      jobId: 'job_history_neural_net',
      title: 'Senior Systems Operator',
      company: 'Neural Net Solutions',
      status: 'interview',
      lastActionLabel: 'Technical screen invitation',
      nextActionLabel: 'Join meeting',
      lastUpdatedAt: '2026-03-20T08:42:00.000Z',
      lastAttemptState: 'submitted',
      events: [
        {
          id: 'event_neural_1',
          at: '2026-03-20T08:42:00.000Z',
          title: 'Technical screen invitation',
          detail: 'Candidate requested to join a live product-systems walkthrough on Tuesday.',
          emphasis: 'positive'
        },
        {
          id: 'event_neural_2',
          at: '2026-03-19T16:10:00.000Z',
          title: 'Resume parsed successfully',
          detail: 'Tailored asset accepted and application moved to recruiter review.',
          emphasis: 'neutral'
        }
      ]
    },
    {
      id: 'application_data_core',
      jobId: 'job_history_data_core',
      title: 'Infrastructure Lead',
      company: 'Data Core Intl',
      status: 'submitted',
      lastActionLabel: 'Needs response',
      nextActionLabel: 'Reply to recruiter',
      lastUpdatedAt: '2026-03-19T11:15:00.000Z',
      lastAttemptState: 'submitted',
      events: [
        {
          id: 'event_data_core_1',
          at: '2026-03-19T11:15:00.000Z',
          title: 'Recruiter follow-up',
          detail: 'Recruiter requested salary expectations and notice period.',
          emphasis: 'warning'
        }
      ]
    },
    {
      id: 'application_void_industries',
      jobId: 'job_history_void',
      title: 'UI Engineer',
      company: 'Void Industries',
      status: 'drafting',
      lastActionLabel: 'Resume tailoring in progress',
      nextActionLabel: 'Wait for review queue',
      lastUpdatedAt: '2026-03-20T09:58:00.000Z',
      lastAttemptState: 'not_started',
      events: [
        {
          id: 'event_void_1',
          at: '2026-03-20T09:58:00.000Z',
          title: 'Tailoring restarted',
          detail: 'Asset generation resumed after a profile update.',
          emphasis: 'neutral'
        }
      ]
    },
    {
      id: 'application_synergy_corp',
      jobId: 'job_history_synergy',
      title: 'Protocol Manager',
      company: 'Synergy Corp',
      status: 'rejected',
      lastActionLabel: 'System archived',
      nextActionLabel: null,
      lastUpdatedAt: '2026-03-18T15:20:00.000Z',
      lastAttemptState: 'failed',
      events: [
        {
          id: 'event_synergy_1',
          at: '2026-03-18T15:20:00.000Z',
          title: 'Application rejected',
          detail: 'The role was closed after an initial recruiter review.',
          emphasis: 'critical'
        }
      ]
    }
  ].map((record) => ApplicationRecordSchema.parse(record))
}

function createSettings(): JobFinderSettings {
  return JobFinderSettingsSchema.parse({
    resumeFormat: 'html',
    resumeTemplateId: 'classic_ats',
    fontPreset: 'inter_requisite',
    humanReviewRequired: true,
    allowAutoSubmitOverride: false,
    keepSessionAlive: true
  })
}

function createBrowserSession(): BrowserSessionState {
  return BrowserSessionStateSchema.parse({
    source: 'linkedin',
    status: 'ready',
    label: 'Browser session ready',
    detail: 'LinkedIn session validated for discovery and Easy Apply.',
    lastCheckedAt: '2026-03-20T10:05:00.000Z'
  })
}

export function createJobFinderRepositorySeed(): JobFinderRepositorySeed {
  return {
    profile: createCandidateProfile(),
    searchPreferences: createSearchPreferences(),
    savedJobs: createSavedJobs(),
    tailoredAssets: createTailoredAssets(),
    applicationRecords: createApplicationRecords(),
    applicationAttempts: [],
    settings: createSettings()
  }
}

export function createFreshJobFinderRepositorySeed(): JobFinderRepositorySeed {
  const seeded = createJobFinderRepositorySeed()

  return {
    ...seeded,
    profile: CandidateProfileSchema.parse({
      id: 'candidate_fresh_start',
      firstName: 'New',
      lastName: 'Candidate',
      middleName: null,
      fullName: 'New Candidate',
      headline: 'Import your resume to begin',
      summary: 'Import a resume or paste resume text to build your profile, targeting, and tailored documents.',
      currentLocation: 'Set your preferred location',
      yearsExperience: 0,
      email: null,
      phone: null,
      portfolioUrl: null,
      linkedinUrl: null,
      baseResume: {
        id: 'resume_fresh_start',
        fileName: 'No resume imported yet',
        uploadedAt: new Date(0).toISOString(),
        storagePath: null,
        textContent: null,
        textUpdatedAt: null,
        extractionStatus: 'needs_text',
        lastAnalyzedAt: null,
        analysisWarnings: []
      },
      targetRoles: [],
      locations: [],
      skills: []
    }),
    searchPreferences: JobSearchPreferencesSchema.parse({
      targetRoles: [],
      locations: [],
      workModes: [],
      seniorityLevels: [],
      minimumSalaryUsd: null,
      approvalMode: 'review_before_submit',
      tailoringMode: 'balanced',
      companyBlacklist: [],
      companyWhitelist: []
    }),
    savedJobs: [],
    tailoredAssets: [],
    applicationRecords: [],
    applicationAttempts: []
  }
}

export function createJobFinderBrowserSessionSeed(): BrowserSessionState[] {
  return [createBrowserSession()]
}

export function createLinkedInDiscoveryCatalogSeed(): JobPosting[] {
  return createLinkedInDiscoveryCatalog()
}
