import { describe, expect, test } from 'vitest'
import {
  CandidateProfileSchema,
  JobSearchPreferencesSchema,
  ResumeImportFieldCandidateSummarySchema,
} from '@unemployed/contracts'
import {
  buildProfilePayload,
  buildSearchPreferencesPayload,
  createProfileEditorValues,
  createSearchPreferencesEditorValues,
  hasProfileDraftChanges,
  hasSearchPreferencesDraftChanges,
} from './profile-editor'

function createProfile() {
  return CandidateProfileSchema.parse({
    id: 'candidate_1',
    firstName: 'Alex',
    lastName: 'Vanguard',
    fullName: 'Alex Vanguard',
    headline: 'Senior systems designer',
    summary: 'Builds resilient workflows.',
    currentLocation: 'London, UK',
    yearsExperience: 10,
    email: 'alex@example.com',
    phone: '+44 7700 900123',
    baseResume: {
      id: 'resume_1',
      fileName: 'alex-vanguard.txt',
      uploadedAt: '2026-03-20T10:00:00.000Z'
    },
    workEligibility: {},
    professionalSummary: {},
    targetRoles: ['Principal Designer'],
    locations: ['Remote'],
    skills: ['Figma'],
    experiences: [],
    education: [],
    certifications: [],
    links: [],
    projects: [],
    spokenLanguages: []
  })
}

describe('profile editor application identity defaults', () => {
  test('does not mark a saved profile dirty when professionalSummary.fullSummary is missing', () => {
    const profile = createProfile()
    const values = createProfileEditorValues(profile)
    const result = buildProfilePayload(profile, values)

    expect(result.payload).toBeDefined()
    expect(hasProfileDraftChanges(profile, result.payload)).toBe(false)
    expect(result.payload?.professionalSummary.fullSummary).toBeNull()
    expect(result.payload?.summary).toBe(profile.summary)
  })

  test('keeps application contact overrides null when the user is only inheriting main contact info', () => {
    const profile = createProfile()
    const values = createProfileEditorValues(profile)
    const result = buildProfilePayload(profile, values)

    expect(result.payload?.applicationIdentity.preferredEmail).toBeNull()
    expect(result.payload?.applicationIdentity.preferredPhone).toBeNull()
  })

  test('persists explicit application contact overrides when the user enters them', () => {
    const profile = createProfile()
    const values = createProfileEditorValues(profile)

    values.applicationIdentity.preferredEmail = 'apply@example.com'
    values.applicationIdentity.preferredPhone = '+44 7000 000999'

    const result = buildProfilePayload(profile, values)

    expect(result.payload?.applicationIdentity.preferredEmail).toBe('apply@example.com')
    expect(result.payload?.applicationIdentity.preferredPhone).toBe('+44 7000 000999')
  })

  test('prefills unresolved review candidates into empty experience and education form sections', () => {
    const profile = createProfile()
    const values = createProfileEditorValues(profile, [
      ResumeImportFieldCandidateSummarySchema.parse({
        id: 'experience_candidate_1',
        target: { section: 'experience', key: 'record', recordId: 'experience_1' },
        label: 'Staff/Senior Software Engineer at EdSights',
        value: {
          companyName: 'EdSights',
          companyUrl: null,
          title: 'Staff/Senior Software Engineer',
          employmentType: null,
          location: 'Remote, NY',
          workMode: [],
          startDate: 'Sep 2021',
          endDate: 'Feb 2026',
          isCurrent: false,
          summary: 'Led scalable cloud-native application work.',
          achievements: ['Cut costs by 20%.'],
          skills: ['React', 'TypeScript'],
          domainTags: [],
          peopleManagementScope: null,
          ownershipScope: null
        },
        valuePreview: 'Staff/Senior Software Engineer | EdSights',
        evidenceText: 'EdSights, Remote, NY — Staff/Senior Software Engineer',
        confidence: 0.84,
        resolution: 'needs_review',
        resolutionReason: null,
        notes: []
      }),
      ResumeImportFieldCandidateSummarySchema.parse({
        id: 'education_candidate_1',
        target: { section: 'education', key: 'record', recordId: 'education_1' },
        label: 'Education',
        value: {
          schoolName: 'Florida State University',
          degree: 'Bachelor’s Degree in Computer Science and Physics',
          fieldOfStudy: null,
          location: '',
          startDate: 'May 2011',
          endDate: 'Sept 2015',
          summary: null
        },
        valuePreview: 'Florida State University',
        evidenceText: 'Florida State University — Bachelor’s Degree in Computer Science and Physics',
        confidence: 0.8,
        resolution: 'needs_review',
        resolutionReason: null,
        notes: []
      })
    ])

    expect(values.records.experiences).toHaveLength(1)
    expect(values.records.experiences[0]).toMatchObject({
      companyName: 'EdSights',
      title: 'Staff/Senior Software Engineer',
      location: 'Remote, NY'
    })
    expect(values.records.education).toHaveLength(1)
    expect(values.records.education[0]).toMatchObject({
      schoolName: 'Florida State University',
      degree: 'Bachelor’s Degree in Computer Science and Physics'
    })
  })

  test('dedupes review candidates that match saved records with different date formats', () => {
    const profile = CandidateProfileSchema.parse({
      ...createProfile(),
      experiences: [
        {
          id: 'experience_saved_1',
          companyName: 'Mercury',
          companyUrl: null,
          title: 'Senior Software Engineer',
          employmentType: null,
          location: 'New York City Metropolitan Area',
          workMode: [],
          startDate: '2024-08',
          endDate: null,
          isCurrent: true,
          isDraft: false,
          summary: null,
          achievements: [],
          skills: [],
          domainTags: [],
          peopleManagementScope: null,
          ownershipScope: null
        }
      ]
    })

    const values = createProfileEditorValues(profile, [
      ResumeImportFieldCandidateSummarySchema.parse({
        id: 'experience_candidate_mercury',
        target: { section: 'experience', key: 'record', recordId: 'experience_1' },
        label: 'Senior Software Engineer at Mercury',
        value: {
          companyName: 'Mercury',
          companyUrl: null,
          title: 'Senior Software Engineer',
          employmentType: null,
          location: 'New York City Metropolitan Area',
          workMode: [],
          startDate: 'Aug 2024',
          endDate: '',
          isCurrent: true,
          summary: 'Leads core product work.',
          achievements: [],
          skills: [],
          domainTags: [],
          peopleManagementScope: null,
          ownershipScope: null
        },
        valuePreview: 'Mercury | Senior Software Engineer | Aug 2024',
        evidenceText: 'Senior Software Engineer — Mercury',
        confidence: 0.84,
        resolution: 'needs_review',
        resolutionReason: null,
        notes: []
      })
    ])

    expect(values.records.experiences).toHaveLength(1)
    expect(values.records.experiences[0]).toMatchObject({
      companyName: 'Mercury',
      title: 'Senior Software Engineer',
      startDate: '2024-08',
      isCurrent: true
    })
  })

  test('dedupes duplicate imported experience review candidates when record ids differ', () => {
    const profile = createProfile()

    const values = createProfileEditorValues(profile, [
      ResumeImportFieldCandidateSummarySchema.parse({
        id: 'experience_candidate_duplicate_1',
        target: { section: 'experience', key: 'record', recordId: 'experience_1' },
        label: 'Senior Software Engineer at Mercury',
        value: {
          companyName: 'Mercury',
          companyUrl: null,
          title: 'Senior Software Engineer',
          employmentType: null,
          location: 'New York City Metropolitan Area',
          workMode: [],
          startDate: 'Aug 2024',
          endDate: '',
          isCurrent: true,
          summary: '',
          achievements: [],
          skills: [],
          domainTags: [],
          peopleManagementScope: null,
          ownershipScope: null
        },
        valuePreview: 'Mercury | Senior Software Engineer | Aug 2024',
        evidenceText: 'Senior Software Engineer - Mercury',
        confidence: 0.8,
        resolution: 'needs_review',
        resolutionReason: null,
        notes: []
      }),
      ResumeImportFieldCandidateSummarySchema.parse({
        id: 'experience_candidate_duplicate_2',
        target: { section: 'experience', key: 'record', recordId: 'experience_9' },
        label: 'Senior Software Engineer at Mercury',
        value: {
          companyName: 'Mercury',
          companyUrl: null,
          title: 'Senior Software Engineer',
          employmentType: null,
          location: 'New York City Metropolitan Area',
          workMode: ['remote'],
          startDate: '2024-08',
          endDate: null,
          isCurrent: true,
          summary: 'Leads core product work.',
          achievements: ['Improved frontend performance.'],
          skills: ['React'],
          domainTags: [],
          peopleManagementScope: null,
          ownershipScope: null
        },
        valuePreview: 'Mercury | Senior Software Engineer | 2024-08',
        evidenceText: 'Senior Software Engineer - Mercury',
        confidence: 0.86,
        resolution: 'needs_review',
        resolutionReason: null,
        notes: []
      })
    ])

    expect(values.records.experiences).toHaveLength(1)
    expect(values.records.experiences[0]).toMatchObject({
      companyName: 'Mercury',
      title: 'Senior Software Engineer',
      startDate: '2024-08',
      isCurrent: true,
      summary: 'Leads core product work.',
      workMode: ['remote']
    })
  })

  test('prefills unresolved years-of-experience candidates when the profile is still fresh start', () => {
    const profile = CandidateProfileSchema.parse({
      ...createProfile(),
      id: 'candidate_fresh_start',
      firstName: 'New',
      lastName: 'Candidate',
      fullName: 'New Candidate',
      headline: 'Import your resume to begin',
      currentLocation: 'Set your preferred location',
      yearsExperience: 0,
    })

    const values = createProfileEditorValues(profile, [
      ResumeImportFieldCandidateSummarySchema.parse({
        id: 'identity_years_experience_candidate',
        target: { section: 'identity', key: 'yearsExperience', recordId: null },
        label: 'Years of experience',
        value: 12,
        valuePreview: '12',
        evidenceText: '12 years of experience',
        confidence: 0.82,
        resolution: 'needs_review',
        resolutionReason: null,
        notes: [],
      }),
    ])

    expect(values.identity.yearsExperience).toBe('12')
  })

  test('normalizes imported work mode values before save', () => {
    const profile = createProfile()
    const values = createProfileEditorValues(profile, [
      ResumeImportFieldCandidateSummarySchema.parse({
        id: 'experience_candidate_work_mode',
        target: { section: 'experience', key: 'record', recordId: 'experience_1' },
        label: 'Senior Software Engineer at Leif',
        value: {
          companyName: 'Leif',
          companyUrl: null,
          title: 'Senior Software Engineer',
          employmentType: null,
          location: 'New York City Metropolitan Area',
          workMode: ['on-site'],
          startDate: 'Jul 2021',
          endDate: 'Aug 2024',
          isCurrent: false,
          summary: 'Built platform features.',
          achievements: [],
          skills: [],
          domainTags: [],
          peopleManagementScope: null,
          ownershipScope: null
        },
        valuePreview: 'Leif | Senior Software Engineer | Jul 2021 | Aug 2024',
        evidenceText: 'Jul 2021 – Aug 2024 · New York City Metropolitan Area · On-site',
        confidence: 0.84,
        resolution: 'needs_review',
        resolutionReason: null,
        notes: []
      })
    ])

    expect(values.records.experiences[0]?.workMode).toEqual(['onsite'])

    values.records.experiences[0]!.summary = 'Built platform features with onsite collaboration.'

    const result = buildProfilePayload(profile, values)

    expect(result.validationMessage).toBeUndefined()
    expect(result.payload?.experiences[0]?.workMode).toEqual(['onsite'])
  })

  test('drops unchanged imported provisional experience rows on save', () => {
    const profile = createProfile()
    const values = createProfileEditorValues(profile, [
      ResumeImportFieldCandidateSummarySchema.parse({
        id: 'experience_candidate_keep_review_first',
        target: { section: 'experience', key: 'record', recordId: 'experience_candidate_1' },
        label: 'React Developer at AUTOMATEDPROS',
        value: {
          companyName: 'AUTOMATEDPROS',
          companyUrl: null,
          title: 'React Developer',
          employmentType: null,
          location: 'Prishtina, Kosovo',
          workMode: ['remote'],
          startDate: '2023-07',
          endDate: '',
          isCurrent: true,
          summary: 'Worked on ordering flows.',
          achievements: [],
          skills: ['React'],
          domainTags: [],
          peopleManagementScope: null,
          ownershipScope: null,
        },
        valuePreview: 'AUTOMATEDPROS | React Developer',
        evidenceText: 'AUTOMATEDPROS – React Developer',
        confidence: 0.82,
        resolution: 'needs_review',
        resolutionReason: null,
        notes: [],
      }),
    ])

    const result = buildProfilePayload(profile, values)

    expect(result.validationMessage).toBeUndefined()
    expect(result.payload?.experiences).toEqual([])
  })

  test('keeps imported provisional experience rows after the user edits them', () => {
    const profile = createProfile()
    const values = createProfileEditorValues(profile, [
      ResumeImportFieldCandidateSummarySchema.parse({
        id: 'experience_candidate_keep_after_edit',
        target: { section: 'experience', key: 'record', recordId: 'experience_candidate_2' },
        label: 'React Developer at AUTOMATEDPROS',
        value: {
          companyName: 'AUTOMATEDPROS',
          companyUrl: null,
          title: 'React Developer',
          employmentType: null,
          location: 'Prishtina, Kosovo',
          workMode: ['remote'],
          startDate: '2023-07',
          endDate: '',
          isCurrent: true,
          summary: 'Worked on ordering flows.',
          achievements: [],
          skills: ['React'],
          domainTags: [],
          peopleManagementScope: null,
          ownershipScope: null,
        },
        valuePreview: 'AUTOMATEDPROS | React Developer',
        evidenceText: 'AUTOMATEDPROS – React Developer',
        confidence: 0.82,
        resolution: 'needs_review',
        resolutionReason: null,
        notes: [],
      }),
    ])

    values.records.experiences[0]!.workMode = ['hybrid']

    const result = buildProfilePayload(profile, values)

    expect(result.validationMessage).toBeUndefined()
    expect(result.payload?.experiences).toHaveLength(1)
    expect(result.payload?.experiences[0]).toMatchObject({
      companyName: 'AUTOMATEDPROS',
      title: 'React Developer',
      workMode: ['hybrid'],
    })
  })

  test('detects profile draft changes even when the form only reflects imported review preload values', () => {
    const profile = createProfile()
    const values = createProfileEditorValues(profile, [
      ResumeImportFieldCandidateSummarySchema.parse({
        id: 'contact_portfolio_candidate',
        target: { section: 'contact', key: 'portfolioUrl', recordId: null },
        label: 'Portfolio URL',
        value: 'https://alex-vanguard.dev',
        valuePreview: 'https://alex-vanguard.dev',
        evidenceText: 'https://alex-vanguard.dev',
        confidence: 0.84,
        resolution: 'needs_review',
        resolutionReason: null,
        notes: [],
      }),
    ])

    expect(values.identity.portfolioUrl).toBe('https://alex-vanguard.dev')

    const draftProfile = buildProfilePayload(profile, values).payload

    expect(draftProfile).toBeDefined()
    expect(hasProfileDraftChanges(profile, draftProfile)).toBe(true)
  })

  test('detects search-preference draft changes from imported targeting suggestions', () => {
    const searchPreferences = JobSearchPreferencesSchema.parse({
      targetRoles: [],
      jobFamilies: [],
      locations: [],
      excludedLocations: [],
      workModes: [],
      seniorityLevels: [],
      targetIndustries: [],
      targetCompanyStages: [],
      employmentTypes: [],
      minimumSalaryUsd: null,
      targetSalaryUsd: null,
      salaryCurrency: 'USD',
      approvalMode: 'review_before_submit',
      tailoringMode: 'balanced',
      companyBlacklist: [],
      companyWhitelist: [],
      discovery: {
        historyLimit: 5,
        targets: [],
      },
    })

    const values = createSearchPreferencesEditorValues(searchPreferences)
    values.targetRoles = 'Principal Product Designer'

    const draftSearchPreferences = buildSearchPreferencesPayload(searchPreferences, values).payload

    expect(draftSearchPreferences).toBeDefined()
    expect(hasSearchPreferencesDraftChanges(searchPreferences, draftSearchPreferences)).toBe(true)
  })
})
