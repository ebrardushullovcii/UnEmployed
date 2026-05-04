import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  createDeterministicJobFinderAiClient,
  type JobFinderAiClient,
  type TailoredResumeDraft,
  TailoredResumeDraftSchema,
} from '@unemployed/ai-providers'
import { createCatalogBrowserSessionRuntime } from '@unemployed/browser-runtime'
import {
  CandidateProfileSchema,
  type JobPosting,
  JobPostingSchema,
  ResumeQualityBenchmarkReportSchema,
  ResumeQualityBenchmarkRequestSchema,
  SavedJobSchema,
  isResumeTemplateBenchmarkEligible,
  type JobFinderRepositoryState,
  type ResumeQualityBenchmarkCase,
  type ResumeQualityBenchmarkCaseResult,
  type ResumeQualityBenchmarkMetrics,
  type ResumeQualityBenchmarkReport,
  type ResumeQualityBenchmarkRequest,
  type ResumeTemplateDefinition,
  type ResumeTemplateId,
  type SavedJob,
} from '@unemployed/contracts'
import { createInMemoryJobFinderRepository } from '@unemployed/db'
import {
  buildBenchmarkAiClient as buildResumeImportBenchmarkAiClient,
  createJobFinderWorkspaceService,
} from '@unemployed/job-finder'

import { createLocalJobFinderDocumentManager } from '../../adapters/job-finder-document-manager'
import { createEmptyJobFinderRepositoryState } from '../../adapters/job-finder-initial-state'
import { listLocalResumeTemplates } from '../../adapters/job-finder-resume-renderer'
import { extractResumeDocument } from '../../adapters/resume-document'
import { defaultBenchmarkCases as defaultResumeImportBenchmarkCases } from './resume-import-benchmark'

type ResumeQualityBenchmarkFixture = {
  definition: ResumeQualityBenchmarkCase
  buildState: (templateId: ResumeTemplateId) => JobFinderRepositoryState | Promise<JobFinderRepositoryState>
  overrideDraft?: (input: {
    baseDraft: TailoredResumeDraft
    job: JobPosting
  }) => TailoredResumeDraft
}

export function selectBenchmarkTemplateIds(
  templates: readonly ResumeTemplateDefinition[] = listLocalResumeTemplates(),
): ResumeTemplateId[] {
  return templates
    .filter((template) => isResumeTemplateBenchmarkEligible(template))
    .map((template) => template.id)
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchesWholePhrase(candidate: string, phrase: string): boolean {
  const normalizedCandidate = normalizeText(candidate)
  const normalizedPhrase = normalizeText(phrase)

  if (!normalizedCandidate || !normalizedPhrase) {
    return false
  }

  const desiredTokens = normalizedPhrase.split(' ').filter(Boolean)
  if (desiredTokens.length === 1) {
    return new Set(normalizedCandidate.split(' ').filter(Boolean)).has(desiredTokens[0] ?? '')
  }

  return new RegExp(`(^|\\s)${escapeRegex(normalizedPhrase)}($|\\s)`).test(normalizedCandidate)
}

function firstNonEmptyValue(values: readonly (string | null | undefined)[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return null
}

function resolveResponsibilityFallback(job: Pick<SavedJob, 'title' | 'responsibilities' | 'minimumQualifications' | 'preferredQualifications' | 'summary' | 'description'>): string {
  return (
    firstNonEmptyValue([
      ...job.responsibilities,
      ...job.minimumQualifications,
      ...job.preferredQualifications,
      job.summary,
      job.description,
    ]) ??
    `${job.title} responsibilities.`
  )
}

function collectVisibleSkills(
  draft: JobFinderRepositoryState['resumeDrafts'][number],
): string[] {
  return draft.sections
    .filter(
      (section) =>
        section.included && section.kind === 'skills' && normalizeText(section.label) !== 'languages',
    )
    .flatMap((section) => section.bullets.filter((bullet) => bullet.included).map((bullet) => bullet.text))
}

function collectGroundingSkillEvidence(input: {
  job: SavedJob
  profile: JobFinderRepositoryState['profile']
}): Set<string> {
  return new Set(
    [
      ...input.profile.skills,
      ...input.profile.skillGroups.coreSkills,
      ...input.profile.skillGroups.tools,
      ...input.profile.skillGroups.languagesAndFrameworks,
      ...input.profile.skillGroups.highlightedSkills,
      ...input.profile.experiences.flatMap((experience) => experience.skills),
      ...input.profile.projects.flatMap((project) => project.skills),
      ...input.job.keySkills,
      ...input.job.keywordSignals
        .filter((signal) => signal.kind === 'skill')
        .map((signal) => signal.label),
    ]
      .map((value) => normalizeText(value))
      .filter(Boolean),
  )
}

function hasGroundedVisibleSkills(input: {
  visibleSkills: readonly string[]
  job: SavedJob
  profile: JobFinderRepositoryState['profile']
}): boolean {
  if (input.visibleSkills.length === 0) {
    return true
  }

  const evidence = collectGroundingSkillEvidence({
    job: input.job,
    profile: input.profile,
  })

  return input.visibleSkills.every((skill) => evidence.has(normalizeText(skill)))
}

function buildGroundedBaselineProfile() {
  const state = createEmptyJobFinderRepositoryState()

  return CandidateProfileSchema.parse({
    ...state.profile,
    id: 'candidate_resume_quality_baseline',
    firstName: 'Alex',
    lastName: 'Vanguard',
    fullName: 'Alex Vanguard',
    headline: 'Senior systems designer',
    summary: 'Builds resilient workflow systems and design tooling.',
    currentLocation: 'London, UK',
    email: 'alex@example.com',
    phone: '+44 7700 900123',
    portfolioUrl: 'https://alex.example.com',
    linkedinUrl: 'https://www.linkedin.com/in/alex-vanguard',
    yearsExperience: 10,
    targetRoles: ['Senior Product Designer'],
    locations: ['Remote', 'London'],
    narrative: {
      professionalStory:
        'Design systems and workflow tooling leader who helps product teams ship clearer operating systems.',
      nextChapterSummary:
        'Targeting remote senior design systems and workflow platform roles.',
      careerTransitionSummary:
        'Leaning further into workflow platform roles because that is where recent impact has been strongest.',
      differentiators: [
        'Connects product strategy with design-system execution',
        'Turns workflow pain into reusable system patterns',
      ],
      motivationThemes: ['workflow automation', 'design systems'],
    },
    professionalSummary: {
      ...state.profile.professionalSummary,
      shortValueProposition: 'Systems-focused product designer for workflow platforms.',
      fullSummary:
        'Systems-focused product designer with 10 years of experience building workflow tools, design systems, and platform operating models.',
    },
    baseResume: {
      ...state.profile.baseResume,
      id: 'resume_quality_baseline',
      fileName: 'alex-vanguard.txt',
      uploadedAt: '2026-04-26T12:00:00.000Z',
      textContent:
        'Alex Vanguard\nSenior systems designer\nLondon, UK\nalex@example.com\n+44 7700 900123\nhttps://alex.example.com\nhttps://www.linkedin.com/in/alex-vanguard\n\n10 years of experience building resilient workflow tools with Figma, React, Playwright, and design systems.',
      textUpdatedAt: '2026-04-26T12:00:00.000Z',
      extractionStatus: 'ready' as const,
      lastAnalyzedAt: '2026-04-26T12:00:00.000Z',
      analysisProviderKind: 'deterministic' as const,
      analysisProviderLabel: 'Resume quality benchmark',
      analysisWarnings: [],
    },
    skills: ['Figma', 'React', 'Playwright', 'Design Systems', 'Accessibility'],
    skillGroups: {
      coreSkills: ['Figma', 'Design Systems'],
      tools: ['Playwright'],
      languagesAndFrameworks: ['React'],
      softSkills: [],
      highlightedSkills: ['Accessibility'],
    },
    proofBank: [
      {
        id: 'proof_1',
        title: 'Design-system rollout',
        claim:
          'Led design-system rollout across core product surfaces used by design and operations teams.',
        heroMetric: 'Adoption reached 80% of core product surfaces within two quarters.',
        supportingContext:
          'Worked across product, engineering, and operations to standardize component and content patterns.',
        roleFamilies: ['product design', 'design systems', 'platform'],
        projectIds: [],
        linkIds: [],
      },
    ],
    experiences: [
      {
        id: 'experience_1',
        companyName: 'Orbit Commerce',
        companyUrl: null,
        title: 'Senior systems designer',
        employmentType: 'Full-time',
        location: 'London, UK',
        workMode: ['hybrid'],
        startDate: '2020-01',
        endDate: null,
        isCurrent: true,
        isDraft: false,
        summary: 'Builds resilient workflow tools.',
        achievements: [
          'Led design-system rollout across core surfaces.',
          'Improved workflow QA handoff across release reviews.',
        ],
        skills: ['Figma', 'Design Systems', 'Playwright'],
        domainTags: ['workflow automation'],
        peopleManagementScope: null,
        ownershipScope: null,
      },
    ],
    education: [
      {
        id: 'education_1',
        schoolName: 'Royal College of Art',
        degree: 'MA',
        fieldOfStudy: 'Design Products',
        location: 'London, UK',
        startDate: '2012-09',
        endDate: '2014-06',
        isDraft: false,
        summary: null,
      },
    ],
    certifications: [
      {
        id: 'cert_1',
        name: 'Accessibility for Teams',
        issuer: 'IAAP',
        issueDate: '2023-06',
        expiryDate: null,
        credentialUrl: null,
        isDraft: false,
      },
    ],
    links: [
      {
        id: 'link_1',
        label: 'Portfolio',
        url: 'https://alex.example.com',
        kind: 'portfolio',
        isDraft: false,
      },
    ],
    projects: [
      {
        id: 'project_1',
        name: 'Workflow OS',
        projectType: 'product',
        summary: 'Scaled an internal design system.',
        role: 'Design lead',
        skills: ['Figma', 'Design Systems', 'Accessibility'],
        outcome: 'Reduced release churn for operations teams.',
        projectUrl: null,
        repositoryUrl: null,
        caseStudyUrl: null,
        isDraft: false,
      },
    ],
    spokenLanguages: [
      {
        id: 'language_1',
        language: 'English',
        proficiency: 'Native',
        interviewPreference: false,
        notes: null,
      },
    ],
  })
}

function buildGroundedBaselineJob(): SavedJob {
  return SavedJobSchema.parse({
    id: 'job_quality_baseline',
    source: 'target_site',
    sourceJobId: 'quality_baseline',
    discoveryMethod: 'catalog_seed',
    collectionMethod: 'fallback_search',
    canonicalUrl: 'https://www.linkedin.com/jobs/view/quality_baseline',
    applicationUrl: 'https://www.linkedin.com/jobs/view/quality_baseline/apply',
    title: 'Senior Product Designer',
    company: 'Signal Systems',
    location: 'Remote',
    workMode: ['remote'],
    applyPath: 'easy_apply',
    easyApplyEligible: true,
    postedAt: '2026-04-26T11:30:00.000Z',
    postedAtText: null,
    discoveredAt: '2026-04-26T11:35:00.000Z',
    firstSeenAt: '2026-04-26T11:35:00.000Z',
    lastSeenAt: '2026-04-26T11:35:00.000Z',
    lastVerifiedActiveAt: '2026-04-26T11:35:00.000Z',
    salaryText: '$180k - $220k',
    normalizedCompensation: {
      currency: 'USD',
      interval: 'year',
      minAmount: 180000,
      maxAmount: 220000,
      minAnnualUsd: 180000,
      maxAnnualUsd: 220000,
    },
    summary: 'Own the design system and workflow platform.',
    description:
      'Own the design system and workflow platform. Build accessible product foundations for remote operations teams.',
    keySkills: ['Figma', 'Design Systems', 'Accessibility'],
    responsibilities: [
      'Own the design system roadmap.',
      'Lead accessible workflow platform experiences.',
    ],
    minimumQualifications: [
      'Strong product design systems experience.',
      'Experience partnering with engineering on platform work.',
    ],
    preferredQualifications: ['Workflow-platform product background.'],
    seniority: 'Senior',
    employmentType: 'Full-time',
    department: 'Design',
    team: 'Design Systems',
    employerWebsiteUrl: 'https://signalsystems.example.com',
    employerDomain: 'signalsystems.example.com',
    atsProvider: 'Greenhouse',
    providerKey: null,
    providerBoardToken: null,
    providerIdentifier: null,
    titleTriageOutcome: 'pass',
    sourceIntelligence: null,
    screeningHints: {
      sponsorshipText: null,
      requiresSecurityClearance: null,
      relocationText: null,
      travelText: null,
      remoteGeographies: ['Europe'],
      requiresConsentInterrupt: null,
      requiresConsentInterruptKind: null,
    },
    keywordSignals: [
      {
        id: 'job_quality_design_systems',
        label: 'Design Systems',
        kind: 'skill',
        weight: 5,
      },
      {
        id: 'job_quality_workflow_platform',
        label: 'Workflow platform',
        kind: 'domain',
        weight: 4,
      },
      {
        id: 'job_quality_accessibility',
        label: 'Accessibility',
        kind: 'skill',
        weight: 4,
      },
    ],
    benefits: ['Remote-first collaboration'],
    status: 'ready_for_review',
    matchAssessment: {
      score: 95,
      reasons: ['Strong design systems overlap'],
      gaps: [],
    },
    provenance: [],
  })
}

function buildThinProfile() {
  const state = createEmptyJobFinderRepositoryState()

  return CandidateProfileSchema.parse({
    ...state.profile,
    id: 'candidate_resume_quality_thin',
    firstName: 'Taylor',
    lastName: 'Reed',
    fullName: 'Taylor Reed',
    headline: 'Designer',
    summary: 'Designer exploring the next role.',
    currentLocation: 'Remote',
    email: 'taylor@example.com',
    baseResume: {
      ...state.profile.baseResume,
      id: 'resume_quality_thin',
      fileName: 'taylor-reed.txt',
      uploadedAt: '2026-04-26T12:00:00.000Z',
      textContent: 'Taylor Reed\nDesigner\nRemote\ntaylor@example.com\nBasic resume text.',
      textUpdatedAt: '2026-04-26T12:00:00.000Z',
      extractionStatus: 'ready' as const,
      lastAnalyzedAt: '2026-04-26T12:00:00.000Z',
      analysisProviderKind: 'deterministic' as const,
      analysisProviderLabel: 'Resume quality benchmark',
      analysisWarnings: [],
    },
    targetRoles: ['Product Designer'],
    locations: ['Remote'],
    skills: ['Figma'],
    experiences: [],
    education: [],
    certifications: [],
    links: [],
    projects: [],
    spokenLanguages: [],
  })
}

function buildThinJob(): SavedJob {
  return SavedJobSchema.parse({
    ...buildGroundedBaselineJob(),
    id: 'job_quality_thin',
    sourceJobId: 'quality_thin',
    canonicalUrl: 'https://www.linkedin.com/jobs/view/quality_thin',
    applicationUrl: 'https://www.linkedin.com/jobs/view/quality_thin/apply',
    title: 'Product Designer',
    company: 'Northwind Labs',
    summary: 'Support product design work across a small team.',
    description:
      'Support product design work across a small team. Collaborate with engineering and product on remote-first delivery.',
    keySkills: ['Figma', 'Design Systems'],
    responsibilities: ['Support product design execution.'],
    minimumQualifications: ['1+ years of product design experience.'],
    preferredQualifications: [],
    department: 'Product',
    team: 'Design',
    atsProvider: null,
    benefits: ['Remote-first collaboration'],
    keywordSignals: [
      {
        id: 'job_quality_thin_figma',
        label: 'Figma',
        kind: 'skill',
        weight: 5,
      },
    ],
    matchAssessment: {
      score: 72,
      reasons: ['Some design overlap'],
      gaps: ['Thin profile evidence'],
    },
  })
}

function buildFrontendPlatformProfile() {
  const state = createEmptyJobFinderRepositoryState()

  return CandidateProfileSchema.parse({
    ...state.profile,
    id: 'candidate_resume_quality_frontend_platform',
    firstName: 'Maya',
    lastName: 'Chen',
    fullName: 'Maya Chen',
    headline: 'Staff frontend engineer',
    summary: 'Builds high-trust frontend platforms for product teams.',
    currentLocation: 'Toronto, Canada',
    email: 'maya@example.com',
    phone: '+1 416 555 0134',
    portfolioUrl: 'https://maya.example.com',
    linkedinUrl: 'https://www.linkedin.com/in/maya-chen',
    yearsExperience: 11,
    targetRoles: ['Staff Frontend Engineer'],
    locations: ['Remote', 'Toronto'],
    narrative: {
      professionalStory:
        'Frontend platform engineer who helps product teams ship faster through resilient systems, performance work, and better DX.',
      nextChapterSummary:
        'Targeting staff frontend and platform roles with ownership across design systems, accessibility, and runtime performance.',
      careerTransitionSummary: null,
      differentiators: [
        'Pairs UI architecture with measurable product delivery gains',
        'Turns fragmented frontend stacks into stable platform systems',
      ],
      motivationThemes: ['frontend platforms', 'developer experience'],
    },
    professionalSummary: {
      ...state.profile.professionalSummary,
      shortValueProposition: 'Staff frontend engineer focused on platform-scale UI systems.',
      fullSummary:
        'Staff frontend engineer with 11 years of experience building platform-scale UI systems, accessibility standards, and performance programs for product organizations.',
    },
    baseResume: {
      ...state.profile.baseResume,
      id: 'resume_quality_frontend_platform',
      fileName: 'maya-chen.txt',
      uploadedAt: '2026-04-26T12:00:00.000Z',
      textContent:
        'Maya Chen\nStaff frontend engineer\nToronto, Canada\nmaya@example.com\n+1 416 555 0134\nhttps://maya.example.com\nhttps://www.linkedin.com/in/maya-chen\n\n11 years building frontend platforms with React, TypeScript, accessibility, and performance engineering.',
      textUpdatedAt: '2026-04-26T12:00:00.000Z',
      extractionStatus: 'ready' as const,
      lastAnalyzedAt: '2026-04-26T12:00:00.000Z',
      analysisProviderKind: 'deterministic' as const,
      analysisProviderLabel: 'Resume quality benchmark',
      analysisWarnings: [],
    },
    skills: ['React', 'TypeScript', 'Design Systems', 'Accessibility', 'Performance'],
    skillGroups: {
      coreSkills: ['React', 'TypeScript', 'Accessibility'],
      tools: ['Playwright', 'Storybook'],
      languagesAndFrameworks: ['Next.js'],
      softSkills: [],
      highlightedSkills: ['Design Systems', 'Performance'],
    },
    proofBank: [
      {
        id: 'proof_frontend_platform',
        title: 'Frontend platform consolidation',
        claim:
          'Unified fragmented frontend foundations across product teams into a shared platform adoption program.',
        heroMetric: 'Cut release regressions by 42% across three product lines in two quarters.',
        supportingContext:
          'Partnered with product, design, and platform engineering to standardize components, testing, and performance budgets.',
        roleFamilies: ['frontend engineering', 'platform'],
        projectIds: [],
        linkIds: [],
      },
    ],
    experiences: [
      {
        id: 'experience_frontend_platform',
        companyName: 'Northstar Cloud',
        companyUrl: null,
        title: 'Staff frontend engineer',
        employmentType: 'Full-time',
        location: 'Toronto, Canada',
        workMode: ['remote'],
        startDate: '2021-03',
        endDate: null,
        isCurrent: true,
        isDraft: false,
        summary: 'Leads frontend platform modernization across product teams.',
        achievements: [
          'Unified fragmented frontend foundations across product teams into a shared platform adoption program.',
          'Improved accessibility review coverage across customer-facing releases.',
        ],
        skills: ['React', 'TypeScript', 'Design Systems', 'Playwright'],
        domainTags: ['frontend platform'],
        peopleManagementScope: null,
        ownershipScope: null,
      },
    ],
    education: [
      {
        id: 'education_frontend_platform',
        schoolName: 'University of Waterloo',
        degree: 'BSc',
        fieldOfStudy: 'Computer Science',
        location: 'Waterloo, Canada',
        startDate: '2010-09',
        endDate: '2014-06',
        isDraft: false,
        summary: null,
      },
    ],
    certifications: [],
    links: [
      {
        id: 'link_frontend_platform',
        label: 'Portfolio',
        url: 'https://maya.example.com',
        kind: 'portfolio',
        isDraft: false,
      },
    ],
    projects: [
      {
        id: 'project_component_runtime',
        name: 'Component Runtime',
        projectType: 'platform',
        summary: 'Created a shared component runtime for product teams.',
        role: 'Technical lead',
        skills: ['React', 'TypeScript', 'Storybook'],
        outcome: 'Reduced duplicate UI implementation work across teams.',
        projectUrl: null,
        repositoryUrl: null,
        caseStudyUrl: null,
        isDraft: false,
      },
    ],
    spokenLanguages: [
      {
        id: 'language_frontend_platform',
        language: 'English',
        proficiency: 'Native',
        interviewPreference: false,
        notes: null,
      },
    ],
  })
}

function buildFrontendPlatformJob(): SavedJob {
  return SavedJobSchema.parse({
    ...buildGroundedBaselineJob(),
    id: 'job_quality_frontend_platform',
    sourceJobId: 'quality_frontend_platform',
    canonicalUrl: 'https://www.linkedin.com/jobs/view/quality_frontend_platform',
    applicationUrl: 'https://www.linkedin.com/jobs/view/quality_frontend_platform/apply',
    title: 'Staff Frontend Engineer',
    company: 'Atlas Product',
    location: 'Remote',
    workMode: ['remote'],
    summary: 'Lead frontend platform work across a growing product portfolio.',
    description:
      'Lead frontend platform work across a growing product portfolio. Improve accessibility, performance, and developer experience for product teams.',
    keySkills: ['React', 'TypeScript', 'Accessibility', 'Performance'],
    responsibilities: [
      'Lead frontend platform architecture.',
      'Improve runtime performance and accessibility standards.',
    ],
    minimumQualifications: [
      'Deep React and TypeScript experience.',
      'Experience driving accessibility and performance programs.',
    ],
    preferredQualifications: ['Platform-engineering partnership experience.'],
    seniority: 'Staff',
    department: 'Engineering',
    team: 'Frontend Platform',
    atsProvider: 'Greenhouse',
    keywordSignals: [
      {
        id: 'job_quality_frontend_react',
        label: 'React',
        kind: 'skill',
        weight: 5,
      },
      {
        id: 'job_quality_frontend_accessibility',
        label: 'Accessibility',
        kind: 'skill',
        weight: 4,
      },
      {
        id: 'job_quality_frontend_performance',
        label: 'Performance',
        kind: 'skill',
        weight: 4,
      },
    ],
    benefits: ['Remote-first collaboration'],
    matchAssessment: {
      score: 94,
      reasons: ['Strong frontend platform overlap'],
      gaps: [],
    },
  })
}

function buildAnalyticsProfile() {
  const state = createEmptyJobFinderRepositoryState()

  return CandidateProfileSchema.parse({
    ...state.profile,
    id: 'candidate_resume_quality_analytics',
    firstName: 'Jordan',
    lastName: 'Patel',
    fullName: 'Jordan Patel',
    headline: 'Principal product analyst',
    summary: 'Turns product and revenue data into roadmap decisions.',
    currentLocation: 'New York, NY',
    email: 'jordan@example.com',
    phone: '+1 646 555 0188',
    linkedinUrl: 'https://www.linkedin.com/in/jordan-patel',
    yearsExperience: 9,
    targetRoles: ['Principal Product Analyst'],
    locations: ['Remote', 'New York'],
    narrative: {
      professionalStory:
        'Product analytics leader who pairs experimentation, SQL depth, and decision-making support for product and GTM teams.',
      nextChapterSummary:
        'Targeting principal analytics roles with ownership across experimentation, stakeholder decision support, and self-serve insights.',
      careerTransitionSummary: null,
      differentiators: [
        'Connects experimentation strategy to product planning',
        'Builds trusted KPI systems for operators and executives',
      ],
      motivationThemes: ['product analytics', 'experimentation'],
    },
    professionalSummary: {
      ...state.profile.professionalSummary,
      shortValueProposition: 'Principal product analyst focused on experimentation and KPI systems.',
      fullSummary:
        'Principal product analyst with 9 years of experience building KPI systems, experimentation programs, and executive decision support across product-led teams.',
    },
    baseResume: {
      ...state.profile.baseResume,
      id: 'resume_quality_analytics',
      fileName: 'jordan-patel.txt',
      uploadedAt: '2026-04-26T12:00:00.000Z',
      textContent:
        'Jordan Patel\nPrincipal product analyst\nNew York, NY\njordan@example.com\n+1 646 555 0188\nhttps://www.linkedin.com/in/jordan-patel\n\n9 years leading product analytics with SQL, experimentation, dashboards, and KPI design.',
      textUpdatedAt: '2026-04-26T12:00:00.000Z',
      extractionStatus: 'ready' as const,
      lastAnalyzedAt: '2026-04-26T12:00:00.000Z',
      analysisProviderKind: 'deterministic' as const,
      analysisProviderLabel: 'Resume quality benchmark',
      analysisWarnings: [],
    },
    skills: ['SQL', 'Experimentation', 'Product Analytics', 'Stakeholder Communication'],
    skillGroups: {
      coreSkills: ['SQL', 'Experimentation', 'Product Analytics'],
      tools: ['Looker', 'dbt'],
      languagesAndFrameworks: ['Python'],
      softSkills: [],
      highlightedSkills: ['Dashboarding'],
    },
    proofBank: [
      {
        id: 'proof_experimentation',
        title: 'Experimentation program',
        claim:
          'Built a product experimentation program that gave product and growth leaders a trusted weekly decision loop.',
        heroMetric: 'Increased experiment win rate visibility from 20% to 85% of launches within one quarter.',
        supportingContext:
          'Standardized KPI definitions, stakeholder readouts, and self-serve dashboards across product squads.',
        roleFamilies: ['analytics', 'product'],
        projectIds: [],
        linkIds: [],
      },
    ],
    experiences: [
      {
        id: 'experience_analytics',
        companyName: 'Meridian Growth',
        companyUrl: null,
        title: 'Principal product analyst',
        employmentType: 'Full-time',
        location: 'New York, NY',
        workMode: ['hybrid'],
        startDate: '2020-05',
        endDate: null,
        isCurrent: true,
        isDraft: false,
        summary: 'Leads experimentation and KPI design for product teams.',
        achievements: [
          'Built a product experimentation program that gave product and growth leaders a trusted weekly decision loop.',
          'Created executive KPI reviews for monetization and retention decisions.',
        ],
        skills: ['SQL', 'Experimentation', 'Looker', 'dbt'],
        domainTags: ['product analytics'],
        peopleManagementScope: null,
        ownershipScope: null,
      },
    ],
    education: [
      {
        id: 'education_analytics',
        schoolName: 'New York University',
        degree: 'BA',
        fieldOfStudy: 'Economics',
        location: 'New York, NY',
        startDate: '2011-09',
        endDate: '2015-05',
        isDraft: false,
        summary: null,
      },
    ],
    certifications: [],
    links: [
      {
        id: 'link_analytics',
        label: 'LinkedIn',
        url: 'https://www.linkedin.com/in/jordan-patel',
        kind: 'linkedin',
        isDraft: false,
      },
    ],
    projects: [
      {
        id: 'project_metric_tree',
        name: 'Metric Tree Program',
        projectType: 'analytics',
        summary: 'Created a product metric tree for executive decision reviews.',
        role: 'Analytics lead',
        skills: ['SQL', 'Dashboarding', 'Experimentation'],
        outcome: 'Reduced KPI confusion across product and GTM planning.',
        projectUrl: null,
        repositoryUrl: null,
        caseStudyUrl: null,
        isDraft: false,
      },
    ],
    spokenLanguages: [
      {
        id: 'language_analytics_1',
        language: 'English',
        proficiency: 'Native',
        interviewPreference: false,
        notes: null,
      },
      {
        id: 'language_analytics_2',
        language: 'Hindi',
        proficiency: 'Professional',
        interviewPreference: false,
        notes: null,
      },
    ],
  })
}

function buildAnalyticsJob(): SavedJob {
  return SavedJobSchema.parse({
    ...buildGroundedBaselineJob(),
    id: 'job_quality_analytics',
    sourceJobId: 'quality_analytics',
    canonicalUrl: 'https://www.linkedin.com/jobs/view/quality_analytics',
    applicationUrl: 'https://www.linkedin.com/jobs/view/quality_analytics/apply',
    title: 'Principal Product Analyst',
    company: 'Beacon Metrics',
    location: 'Remote',
    workMode: ['remote'],
    summary: 'Lead experimentation and KPI strategy for a product-led business.',
    description:
      'Lead experimentation and KPI strategy for a product-led business. Partner with product and growth leaders on roadmap and monetization decisions.',
    keySkills: ['SQL', 'Experimentation', 'Product Analytics', 'Dashboarding'],
    responsibilities: [
      'Lead KPI and experimentation strategy.',
      'Support product and growth decision-making with trusted analysis.',
    ],
    minimumQualifications: [
      'Strong SQL and product analytics experience.',
      'Experience partnering with product and growth leadership.',
    ],
    preferredQualifications: ['Experience building decision-support dashboards.'],
    seniority: 'Principal',
    department: 'Analytics',
    team: 'Product Analytics',
    atsProvider: 'Greenhouse',
    keywordSignals: [
      {
        id: 'job_quality_analytics_sql',
        label: 'SQL',
        kind: 'skill',
        weight: 5,
      },
      {
        id: 'job_quality_analytics_experimentation',
        label: 'Experimentation',
        kind: 'skill',
        weight: 4,
      },
      {
        id: 'job_quality_analytics_dashboarding',
        label: 'Dashboarding',
        kind: 'skill',
        weight: 4,
      },
    ],
    benefits: ['Remote-first collaboration'],
    matchAssessment: {
      score: 93,
      reasons: ['Strong experimentation and KPI overlap'],
      gaps: [],
    },
  })
}

function findRepoRoot(startDir: string): string | null {
  let currentDir = path.resolve(startDir)

  while (true) {
    if (existsSync(path.join(currentDir, 'pnpm-workspace.yaml'))) {
      return currentDir
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      return null
    }

    currentDir = parentDir
  }
}

function resolveRepoRoot(): string {
  const repoRoot = findRepoRoot(process.cwd()) ?? findRepoRoot(import.meta.dirname)
  if (!repoRoot) {
    throw new Error(`Could not locate repo root from ${process.cwd()} or ${import.meta.dirname}.`)
  }

  return repoRoot
}

function buildRealFixtureJob(input: {
  id: string
  title: string
  company: string
  keySkills: readonly string[]
  summary: string
  seniority?: string | null
}): SavedJob {
  return SavedJobSchema.parse({
    ...buildGroundedBaselineJob(),
    id: `job_quality_${input.id}`,
    sourceJobId: `quality_${input.id}`,
    canonicalUrl: `https://www.linkedin.com/jobs/view/quality_${input.id}`,
    applicationUrl: `https://www.linkedin.com/jobs/view/quality_${input.id}/apply`,
    title: input.title,
    company: input.company,
    location: 'Remote',
    workMode: ['remote'],
    summary: input.summary,
    description: `${input.summary} ${input.keySkills.join(', ')} experience is important for this role.`,
    keySkills: [...input.keySkills],
    responsibilities: [
      `Deliver ${input.title.toLowerCase()} outcomes across product and platform teams.`,
      `Improve reliability, delivery quality, and maintainability using ${input.keySkills.slice(0, 3).join(', ')}.`,
    ],
    minimumQualifications: [
      `Professional experience with ${input.keySkills.slice(0, 3).join(', ')}.`,
      'Experience shipping production software with cross-functional teams.',
    ],
    preferredQualifications: ['Evidence of measurable product or platform impact.'],
    seniority: input.seniority ?? 'Senior',
    department: 'Engineering',
    team: 'Product Engineering',
    atsProvider: 'Greenhouse',
    keywordSignals: input.keySkills.slice(0, 5).map((skill, index) => ({
      id: `job_quality_${input.id}_skill_${index + 1}`,
      label: skill,
      kind: 'skill' as const,
      weight: 5 - Math.min(index, 3),
    })),
    matchAssessment: {
      score: 88,
      reasons: ['Representative real imported resume fixture for resume quality coverage.'],
      gaps: [],
    },
  })
}

const realFixtureQualityTargets: Record<string, {
  title: string
  company: string
  keySkills: readonly string[]
  summary: string
  seniority?: string | null
}> = {
  aaron_murphy_pdf: {
    title: 'Staff Software Engineer',
    company: 'Northstar Platform',
    keySkills: ['Software Engineering', 'Platform', 'React', 'Node.js', 'AWS'],
    summary: 'Lead product-platform engineering for a growing SaaS organization.',
    seniority: 'Staff',
  },
  ebrar_pdf: {
    title: 'Senior Full-Stack Engineer',
    company: 'Automated Systems Group',
    keySkills: ['.NET', 'React', 'TypeScript', 'SQL', 'Azure'],
    summary: 'Build and modernize full-stack web applications for business automation teams.',
  },
  ebrar_new_pdf: {
    title: 'Senior Full-Stack Engineer',
    company: 'Workflow Automation Labs',
    keySkills: ['.NET', 'React', 'TypeScript', 'SQL', 'Docker'],
    summary: 'Own full-stack automation products from API design through user-facing delivery.',
  },
  paul_asselin_pdf: {
    title: 'Senior Software Engineer',
    company: 'Mercury Product Cloud',
    keySkills: ['Ruby', 'React', 'API Design', 'PostgreSQL', 'AWS'],
    summary: 'Ship reliable financial-product software with strong backend and frontend ownership.',
  },
  ryan_holstien_pdf: {
    title: 'Senior Platform Engineer',
    company: 'DataHub Cloud',
    keySkills: ['Java', 'Distributed Systems', 'AWS', 'Microservices', 'Kubernetes'],
    summary: 'Design scalable platform services for high-volume data and marketplace products.',
  },
}

async function importRealFixtureProfile(input: {
  fixtureId: string
  resumePath: string
  label: string
}) {
  const repoRoot = resolveRepoRoot()
  const state = createEmptyJobFinderRepositoryState()
  const absoluteResumePath = path.resolve(repoRoot, input.resumePath)
  const extracted = await extractResumeDocument(absoluteResumePath, {
    bundleId: `quality_bundle_${input.fixtureId}`,
    runId: `quality_import_run_${input.fixtureId}`,
    sourceResumeId: `quality_resume_${input.fixtureId}`,
  })
  const profile = CandidateProfileSchema.parse({
    ...state.profile,
    baseResume: {
      ...state.profile.baseResume,
      id: `quality_resume_${input.fixtureId}`,
      fileName: path.basename(input.resumePath),
      uploadedAt: '2026-04-26T12:00:00.000Z',
      storagePath: absoluteResumePath,
      textContent: extracted.bundle.fullText,
      textUpdatedAt: extracted.bundle.fullText ? '2026-04-26T12:00:00.000Z' : null,
      extractionStatus: extracted.bundle.fullText ? 'ready' : 'needs_text',
      lastAnalyzedAt: '2026-04-26T12:00:00.000Z',
      analysisProviderKind: 'deterministic',
      analysisProviderLabel: `Resume quality fixture import: ${input.label}`,
      analysisWarnings: extracted.bundle.warnings,
    },
  })
  const repository = createInMemoryJobFinderRepository({
    ...state,
    profile,
  })
  const browserRuntime = createCatalogBrowserSessionRuntime({
    sessions: [],
    catalog: [],
  })
  const documentManager = createLocalJobFinderDocumentManager({
    outputDirectory: path.join(os.tmpdir(), `unemployed-quality-import-${input.fixtureId}`),
  })
  const workspaceService = createJobFinderWorkspaceService({
    aiClient: buildResumeImportBenchmarkAiClient(false),
    browserRuntime,
    documentManager,
    repository,
  })

  try {
    await workspaceService.runResumeImport({
      baseResume: profile.baseResume,
      documentBundle: extracted.bundle,
      importWarnings: extracted.bundle.warnings,
    })

    return repository.getProfile()
  } finally {
    await Promise.allSettled([
      workspaceService.shutdown(),
      repository.close(),
    ])
  }
}

function buildRealFixtureQualityCases(): ResumeQualityBenchmarkFixture[] {
  return defaultResumeImportBenchmarkCases
    .filter((benchmarkCase) => benchmarkCase.id !== 'resume_import_sample_txt')
    .map((benchmarkCase) => {
      const target = realFixtureQualityTargets[benchmarkCase.id]
      if (!target) {
        throw new Error(`Missing resume-quality target for real fixture '${benchmarkCase.id}'.`)
      }

      return {
        definition: {
          id: `real_${benchmarkCase.id.replace(/_pdf$/, '')}`,
          label: `Real fixture: ${benchmarkCase.label}`,
          canary: false,
          tags: ['real-fixture', ...benchmarkCase.tags],
        },
        async buildState(templateId) {
          const importedProfile = await importRealFixtureProfile({
            fixtureId: benchmarkCase.id,
            resumePath: benchmarkCase.resumePath,
            label: benchmarkCase.label,
          })
          const profile = CandidateProfileSchema.parse({
            ...importedProfile,
            targetRoles: [target.title],
            skills: [...new Set([...importedProfile.skills, ...target.keySkills])],
            skillGroups: {
              ...importedProfile.skillGroups,
              coreSkills: [...new Set([...importedProfile.skillGroups.coreSkills, ...target.keySkills.slice(0, 4)])],
            },
          })
          return buildStateForCase({
            templateId,
            profile,
            job: buildRealFixtureJob({
              id: benchmarkCase.id,
              ...target,
            }),
          })
        },
      } satisfies ResumeQualityBenchmarkFixture
    })
}

function parseMonthForSort(value: string | null | undefined): number | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) {
    return null
  }

  if (/^(present|current)$/i.test(trimmed)) {
    return Number.MAX_SAFE_INTEGER
  }

  const yearMonthMatch = /^(\d{4})-(\d{2})/.exec(trimmed)
  if (yearMonthMatch) {
    return Number(yearMonthMatch[1]) * 12 + Number(yearMonthMatch[2])
  }

  const yearMatch = /^(\d{4})$/.exec(trimmed)
  if (yearMatch) {
    return Number(yearMatch[1]) * 12 + 1
  }

  return null
}

function sortProfileForResumeCoverage(profile: JobFinderRepositoryState['profile']) {
  return CandidateProfileSchema.parse({
    ...profile,
    experiences: [...profile.experiences].sort((left, right) => {
      const leftMonth = (left.isCurrent ? Number.MAX_SAFE_INTEGER : parseMonthForSort(left.endDate)) ?? parseMonthForSort(left.startDate) ?? Number.MIN_SAFE_INTEGER
      const rightMonth = (right.isCurrent ? Number.MAX_SAFE_INTEGER : parseMonthForSort(right.endDate)) ?? parseMonthForSort(right.startDate) ?? Number.MIN_SAFE_INTEGER
      return rightMonth - leftMonth
    }),
  })
}

function buildStateForCase(input: {
  templateId: ResumeTemplateId
  profile: JobFinderRepositoryState['profile']
  job: SavedJob
}): JobFinderRepositoryState {
  const state = createEmptyJobFinderRepositoryState()

  return {
    ...state,
    profile: sortProfileForResumeCoverage(input.profile),
    searchPreferences: {
      ...state.searchPreferences,
      targetRoles: [input.job.title],
      locations: [input.job.location],
      workModes: input.job.workMode,
      companyWhitelist: [input.job.company],
    },
    settings: {
      ...state.settings,
      resumeTemplateId: input.templateId,
      resumeFormat: 'html',
      fontPreset:
        input.templateId === 'compact_exec'
          ? 'space_grotesk_display'
          : 'inter_requisite',
      keepSessionAlive: false,
    },
    profileSetupState: {
      ...state.profileSetupState,
      status: 'completed',
      currentStep: 'ready_check',
      completedAt: '2026-04-26T12:00:00.000Z',
    },
    savedJobs: [input.job],
  }
}

const defaultResumeQualityBenchmarkCases: ResumeQualityBenchmarkFixture[] = [
  {
    definition: {
      id: 'grounded_baseline',
      label: 'Grounded baseline',
      canary: true,
      tags: ['baseline', 'grounded'],
    },
    buildState(templateId) {
      return buildStateForCase({
        templateId,
        profile: buildGroundedBaselineProfile(),
        job: buildGroundedBaselineJob(),
      })
    },
  },
  {
    definition: {
      id: 'contamination_guard',
      label: 'Contamination guard',
      canary: true,
      tags: ['sanitizer', 'bleed'],
    },
    buildState(templateId) {
      return buildStateForCase({
        templateId,
        profile: buildGroundedBaselineProfile(),
        job: buildGroundedBaselineJob(),
      })
    },
    overrideDraft({ baseDraft, job }) {
      return TailoredResumeDraftSchema.parse({
        ...baseDraft,
        coreSkills: ['Figma', job.company, job.atsProvider ?? 'Greenhouse'],
        additionalSkills: ['Playwright', 'Remote-first collaboration'],
        targetedKeywords: [...baseDraft.targetedKeywords, job.company],
        experienceHighlights: [
          resolveResponsibilityFallback(job),
          'React, TypeScript, Design Systems, Figma, Playwright, Accessibility, Testing',
          ...baseDraft.experienceHighlights,
        ],
        fullText: [
          baseDraft.summary,
          'Core skills: Figma, Signal Systems, Greenhouse',
          'Additional skills: Playwright, Remote-first collaboration',
        ].join('\n'),
      })
    },
  },
  {
    definition: {
      id: 'thin_profile',
      label: 'Thin profile fallback',
      canary: false,
      tags: ['thin', 'abstention'],
    },
    buildState(templateId) {
      return buildStateForCase({
        templateId,
        profile: buildThinProfile(),
        job: buildThinJob(),
      })
    },
    overrideDraft() {
      return TailoredResumeDraftSchema.parse({
        label: 'Tailored Resume',
        summary: 'Designer exploring the next role.',
        experienceHighlights: ['Basic collaboration support.'],
        coreSkills: ['Figma'],
        targetedKeywords: ['Figma'],
        experienceEntries: [],
        projectEntries: [],
        educationEntries: [],
        certificationEntries: [],
        additionalSkills: [],
        languages: [],
        fullText: 'Designer exploring the next role.\n\nBasic collaboration support.\n\nCore skills: Figma',
        compatibilityScore: 55,
        notes: ['Benchmark thin-profile case forces minimal grounded output.'],
      })
    },
  },
  {
    definition: {
      id: 'frontend_platform',
      label: 'Frontend platform staff',
      canary: false,
      tags: ['frontend', 'platform', 'engineering'],
    },
    buildState(templateId) {
      return buildStateForCase({
        templateId,
        profile: buildFrontendPlatformProfile(),
        job: buildFrontendPlatformJob(),
      })
    },
  },
  {
    definition: {
      id: 'analytics_lead',
      label: 'Analytics lead',
      canary: false,
      tags: ['analytics', 'product', 'data'],
    },
    buildState(templateId) {
      return buildStateForCase({
        templateId,
        profile: buildAnalyticsProfile(),
        job: buildAnalyticsJob(),
      })
    },
  },
  ...buildRealFixtureQualityCases(),
]

function resolveBenchmarkFixtures(
  request: ResumeQualityBenchmarkRequest,
): ResumeQualityBenchmarkFixture[] {
  const cases = request.caseIds.length > 0
    ? defaultResumeQualityBenchmarkCases.filter((entry) =>
        request.caseIds.includes(entry.definition.id),
      )
    : defaultResumeQualityBenchmarkCases

  const fixtures = request.canaryOnly
    ? cases.filter((entry) => entry.definition.canary)
    : cases

  if (fixtures.length === 0) {
    const requestedCaseIds = request.caseIds.length > 0
      ? request.caseIds.join(', ')
      : 'all cases'
    throw new Error(
      `Resume quality benchmark resolved no cases for caseIds=${requestedCaseIds} and canaryOnly=${String(request.canaryOnly)}.`,
    )
  }

  return fixtures
}

function buildBenchmarkAiClient(
  fixture: ResumeQualityBenchmarkFixture,
): JobFinderAiClient {
  const baseClient = createDeterministicJobFinderAiClient(
    `Resume quality benchmark deterministic runtime for ${fixture.definition.label}.`,
  )

  if (!fixture.overrideDraft) {
    return baseClient
  }

  return {
    ...baseClient,
    async createResumeDraft(input) {
      const baseDraft = await baseClient.createResumeDraft(input)
      const validatedJob = JobPostingSchema.parse(input.job)

      return fixture.overrideDraft!({
        baseDraft,
        job: validatedJob,
      })
    },
  }
}

async function resolveFixtureState(
  fixture: ResumeQualityBenchmarkFixture,
  templateId: ResumeTemplateId,
): Promise<JobFinderRepositoryState> {
  return fixture.buildState(templateId)
}

function includesKeywordCoverage(content: string, job: SavedJob): boolean {
  const normalizedContent = normalizeText(content)
  const normalizedTargets = [
    ...job.keySkills,
    ...job.keywordSignals.map((signal) => signal.label),
  ]
    .map((entry) => normalizeText(entry))
    .filter(Boolean)

  if (normalizedTargets.length === 0) {
    return true
  }

  return normalizedTargets.some((target) => matchesWholePhrase(normalizedContent, target))
}

function scoreCaseMetrics(input: {
  job: SavedJob
  html: string
  workspace: {
    job: SavedJob
    draft: JobFinderRepositoryState['resumeDrafts'][number]
    validation: NonNullable<JobFinderRepositoryState['resumeValidationResults'][number]> | null
    tailoredAsset: JobFinderRepositoryState['tailoredAssets'][number] | null
  }
  profile: JobFinderRepositoryState['profile']
}): ResumeQualityBenchmarkMetrics {
  const issues = input.workspace.validation?.issues ?? []
  const visibleText = input.workspace.tailoredAsset?.previewSections
    .flatMap((section) => section.lines)
    .join(' ') ?? ''
  const visibleSkills = collectVisibleSkills(input.workspace.draft)
  const bleedCategories = new Set([
    'job_description_bleed',
    'keyword_stuffing',
    'vague_filler',
    'unsupported_claim',
    'invented_metric',
  ])
  const duplicateCategories = new Set(['duplicate_bullet', 'duplicate_section_content'])

  const hasBleedIssue = issues.some((issue) => bleedCategories.has(issue.category))
  const hasDuplicateIssue = issues.some((issue) => duplicateCategories.has(issue.category))
  const hasThinOutputIssue = issues.some((issue) => issue.category === 'thin_output')
  const hasPageOverflowIssue = issues.some((issue) => issue.category === 'page_overflow')
  const htmlLooksAtsSafe = input.html.includes('data-ats-safe="true"') || (
    input.html.includes('grid-template-columns: 1fr;') &&
    input.html.includes('@page') &&
    !input.html.includes('Targeted Keywords') &&
    !input.html.includes('<table')
  )

  return {
    groundedVisibleSkillRate: hasGroundedVisibleSkills({
      visibleSkills,
      job: input.job,
      profile: input.profile,
    }) ? 1 : 0,
    bleedFreeCaseRate: hasBleedIssue ? 0 : 1,
    keywordCoverageRate: includesKeywordCoverage(visibleText, input.job) ? 1 : 0,
    duplicateIssueFreeRate: hasDuplicateIssue ? 0 : 1,
    thinOutputFreeRate: hasThinOutputIssue ? 0 : 1,
    pageTargetPassRate: hasPageOverflowIssue ? 0 : 1,
    atsRenderPassRate: htmlLooksAtsSafe ? 1 : 0,
    issueFreeCaseRate: issues.length === 0 ? 1 : 0,
  }
}

function aggregateMetrics(
  results: readonly ResumeQualityBenchmarkCaseResult[],
): ResumeQualityBenchmarkMetrics {
  return {
    groundedVisibleSkillRate: average(results.map((result) => result.metrics.groundedVisibleSkillRate)),
    bleedFreeCaseRate: average(results.map((result) => result.metrics.bleedFreeCaseRate)),
    keywordCoverageRate: average(results.map((result) => result.metrics.keywordCoverageRate)),
    duplicateIssueFreeRate: average(results.map((result) => result.metrics.duplicateIssueFreeRate)),
    thinOutputFreeRate: average(results.map((result) => result.metrics.thinOutputFreeRate)),
    pageTargetPassRate: average(results.map((result) => result.metrics.pageTargetPassRate)),
    atsRenderPassRate: average(results.map((result) => result.metrics.atsRenderPassRate)),
    issueFreeCaseRate: average(results.map((result) => result.metrics.issueFreeCaseRate)),
  }
}

async function persistHtmlArtifact(input: {
  sourcePath: string
  persistArtifactsDirectory: string | null
  caseId: string
  templateId: ResumeTemplateId
}): Promise<string | null> {
  if (!input.persistArtifactsDirectory || !input.sourcePath.endsWith('.html')) {
    return null
  }

  const fileName = path.basename(input.sourcePath)
  const relativePath = path.join(input.caseId, input.templateId, fileName)
  const targetPath = path.join(input.persistArtifactsDirectory, relativePath)

  await mkdir(path.dirname(targetPath), { recursive: true })
  await cp(input.sourcePath, targetPath, { force: true })

  return relativePath.replaceAll('\\', '/')
}

export async function runDesktopResumeQualityBenchmark(
  input: Partial<ResumeQualityBenchmarkRequest> = {},
): Promise<ResumeQualityBenchmarkReport> {
  const request = ResumeQualityBenchmarkRequestSchema.parse(input)
  const fixtures = resolveBenchmarkFixtures(request)
  const availableTemplates = listLocalResumeTemplates()
  const benchmarkTemplateIds = selectBenchmarkTemplateIds(availableTemplates)
  const requestedTemplateIds = request.templateIds.length > 0
    ? request.templateIds.filter((templateId) => benchmarkTemplateIds.includes(templateId))
    : benchmarkTemplateIds
  const templates = [...new Set(requestedTemplateIds)]
  const results: ResumeQualityBenchmarkCaseResult[] = []

  if (templates.length === 0) {
    throw new Error('Resume quality benchmark requires at least one benchmark-eligible template.')
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'unemployed-resume-quality-'))

  try {
    for (const fixture of fixtures) {
      const baseState = await resolveFixtureState(fixture, templates[0]!)
      const repository = createInMemoryJobFinderRepository(baseState)
      const browserRuntime = createCatalogBrowserSessionRuntime({
        sessions: [
          {
            source: 'target_site',
            status: 'ready',
            driver: 'catalog_seed',
            label: 'Benchmark browser session ready',
            detail: 'Resume quality benchmark uses a deterministic catalog runtime.',
            lastCheckedAt: '2026-04-26T12:00:00.000Z',
          },
        ],
        catalog: [],
      })

      try {
        for (const templateId of templates) {
          const state = await resolveFixtureState(fixture, templateId)
          await repository.reset(state)
          const aiClient = buildBenchmarkAiClient(fixture)
          const documentManager = createLocalJobFinderDocumentManager({
            outputDirectory: path.join(tempRoot, fixture.definition.id, templateId),
          })
          const workspaceService = createJobFinderWorkspaceService({
            aiClient,
            browserRuntime,
            documentManager,
            repository,
          })

          const jobId = state.savedJobs[0]?.id

          if (!jobId) {
            throw new Error(`Resume quality benchmark case '${fixture.definition.id}' is missing a saved job.`)
          }

          await workspaceService.generateResume(jobId)
          const workspace = await workspaceService.getResumeWorkspace(jobId)
          const asset = workspace.tailoredAsset

          if (!asset?.storagePath) {
            throw new Error(`Resume quality benchmark case '${fixture.definition.id}' did not produce a rendered artifact.`)
          }

          const html = asset.storagePath.endsWith('.html')
            ? await readFile(asset.storagePath, 'utf8')
            : ''
          const htmlArtifactRelativePath = await persistHtmlArtifact({
            sourcePath: asset.storagePath,
            persistArtifactsDirectory: request.persistArtifactsDirectory,
            caseId: fixture.definition.id,
            templateId,
          })
          const metrics = scoreCaseMetrics({
            job: workspace.job,
            html,
            workspace,
            profile: state.profile,
          })
          const issueCategories = Array.from(
            new Set((workspace.validation?.issues ?? []).map((issue) => issue.category)),
          )
          const passed =
            metrics.groundedVisibleSkillRate === 1 &&
            metrics.bleedFreeCaseRate === 1 &&
            metrics.keywordCoverageRate === 1 &&
            metrics.duplicateIssueFreeRate === 1 &&
            metrics.thinOutputFreeRate === 1 &&
            metrics.pageTargetPassRate === 1 &&
            metrics.atsRenderPassRate === 1

          const templateName = asset.templateName?.trim() ?? ''
          const notes = [
            ...(templateName ? [`Template: ${templateName}.`] : []),
            ...(asset.notes ?? []).map((note) => note.trim()).filter(Boolean),
          ]

          results.push({
            caseId: fixture.definition.id,
            label: fixture.definition.label,
            templateId,
            passed,
            visibleSkills: collectVisibleSkills(workspace.draft),
            issueCategories,
            issueCount: workspace.validation?.issues.length ?? 0,
            metrics,
            htmlArtifactRelativePath,
            notes,
          })
        }
      } finally {
        await Promise.allSettled([
          browserRuntime.closeSession('target_site'),
          repository.close(),
        ])
      }
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }

  return ResumeQualityBenchmarkReportSchema.parse({
    benchmarkVersion: request.benchmarkVersion,
    generatedAt: new Date().toISOString(),
    templates,
    persistedArtifactsDirectory: request.persistArtifactsDirectory,
    cases: results,
    aggregate: aggregateMetrics(results),
    notes: availableTemplates
      .filter((template) => !isResumeTemplateBenchmarkEligible(template))
      .map(
        (template) =>
          `Skipped non-benchmark-eligible template: ${template.label} (${template.id}).`,
      ),
  })
}

export { defaultResumeQualityBenchmarkCases }
