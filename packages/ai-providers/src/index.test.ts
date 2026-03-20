import { describe, expect, test } from 'vitest'
import type { CandidateProfile, JobSearchPreferences } from '@unemployed/contracts'
import {
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
    headline: 'Workflow engineer',
    summary: 'Builds reliable automation.',
    currentLocation: 'London, UK',
    yearsExperience: 8,
    email: null,
    phone: null,
    portfolioUrl: null,
    linkedinUrl: null,
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
    targetRoles: ['Staff Frontend Engineer'],
    locations: ['London, UK'],
    skills: ['React', 'TypeScript']
  }
}

function createPreferences(): JobSearchPreferences {
  return {
    targetRoles: ['Staff Frontend Engineer'],
    locations: ['London, UK'],
    workModes: ['remote'],
    seniorityLevels: ['Staff'],
    minimumSalaryUsd: 150000,
    approvalMode: 'review_before_submit' as const,
    tailoringMode: 'balanced' as const,
    companyBlacklist: [],
    companyWhitelist: []
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
    expect(result.targetRoles).toEqual(['Lead Product Engineer'])
    expect(result.analysisProviderKind).toBe('deterministic')
  })

  test('falls back to deterministic mode without an API key', () => {
    const client = createJobFinderAiClientFromEnvironment({
      UNEMPLOYED_AI_API_KEY: undefined
    })

    expect(client.getStatus().kind).toBe('deterministic')
  })

  test('configures the FelidaeAI provider when the API key is present', () => {
    const client = createJobFinderAiClientFromEnvironment({
      UNEMPLOYED_AI_API_KEY: 'test-key'
    })

    expect(client.getStatus()).toMatchObject({
      kind: 'openai_compatible',
      model: 'FelidaeAI-Pro-2.5',
      label: 'FelidaeAI job agent'
    })
  })
})
