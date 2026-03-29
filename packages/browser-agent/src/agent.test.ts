import { describe, expect, test } from 'vitest'
import { vi } from 'vitest'
import type { Page } from 'playwright'
import type { CandidateProfile, ToolCall } from '@unemployed/contracts'
import { runAgentDiscovery, type JobExtractor, type LLMClient } from './agent'
import type { AgentConfig } from './types'

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
      extractionStatus: 'ready',
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
    targetRoles: ['Workflow engineer'],
    locations: ['Remote'],
    skills: ['React'],
    experiences: [],
    education: [],
    certifications: [],
    links: [],
    projects: [],
    spokenLanguages: []
  }
}

function createConfig(): AgentConfig {
  return {
    source: 'linkedin',
    maxSteps: 4,
    targetJobCount: 1,
    userProfile: createProfile(),
    searchPreferences: {
      targetRoles: ['Workflow engineer'],
      locations: ['Remote']
    },
    startingUrls: ['https://www.linkedin.com/jobs/search/'],
    navigationPolicy: {
      allowedHostnames: ['www.linkedin.com']
    },
    promptContext: {
      siteLabel: 'LinkedIn Jobs',
      taskPacket: {
        phaseGoal: 'Verify job discovery routes.',
        knownFacts: ['Start from the search route.'],
        priorPhaseSummary: null,
        avoidStrategyFingerprints: ['access_auth_probe:linkedin:access auth probe'],
        successCriteria: ['Reach the site', 'Collect evidence'],
        stopConditions: ['Stop when enough evidence is collected.'],
        manualPrerequisiteState: null,
        strategyLabel: 'Search Filter Probe'
      }
    },
    compaction: {
      maxTranscriptMessages: 5,
      preserveRecentMessages: 2,
      maxToolPayloadChars: 48
    }
  }
}

function createPage(): Pick<Page, 'goto' | 'waitForTimeout' | 'url' | 'title'> {
  let currentUrl = 'about:blank'

  return {
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
      return 'LinkedIn Jobs'
    }
  }
}

function createToolCall(name: string, args: Record<string, unknown>, id: string): ToolCall {
  return {
    id,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args)
    }
  }
}

describe('runAgentDiscovery', () => {
  test('compacts long worker transcripts into summarized state', async () => {
    const page = createPage() as Page
    const llmCalls: ToolCall[][] = [
      [createToolCall('navigate', { url: 'https://www.linkedin.com/jobs/search/' }, 'tool_1')],
      [createToolCall('navigate', { url: 'https://www.linkedin.com/jobs/search/' }, 'tool_2')],
      [createToolCall('finish', {
        reason: 'Enough evidence collected.',
        summary: 'Keyword search on the jobs route returned stable detail pages.',
        reliableControls: ['Keyword search box on the jobs route'],
        trickyFilters: ['Homepage category chips did not reliably change the result set'],
        navigationTips: ['Open the job card detail page to recover the canonical listing URL'],
        applyTips: ['Apply action was not validated in this phase'],
        warnings: ['Search filters need replay verification before trusting them']
      }, 'tool_3')]
    ]
    let callIndex = 0
    const llmClient: LLMClient = {
      async chatWithTools() {
        const toolCalls = llmCalls[Math.min(callIndex, llmCalls.length - 1)] ?? []
        callIndex += 1
        return {
          content: `step ${callIndex}`,
          toolCalls
        }
      }
    }
    const jobExtractor: JobExtractor = {
      async extractJobsFromPage() {
        return []
      }
    }

    const result = await runAgentDiscovery(page, createConfig(), llmClient, jobExtractor)

    expect(result.compactionState).not.toBeNull()
    expect(result.compactionState?.compactionCount).toBeGreaterThan(0)
    expect(result.compactionState?.confirmedFacts).toContain('Start from the search route.')
    expect(result.compactionState?.avoidStrategyFingerprints).toContain('access_auth_probe:linkedin:access auth probe')
    expect(result.transcriptMessageCount).toBeLessThanOrEqual(6)
    expect(result.debugFindings?.summary).toContain('Keyword search')
    expect(result.debugFindings?.trickyFilters[0]).toContain('category chips')
  })

  test('retries transient llm failures before giving up', async () => {
    const page = createPage() as Page
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockRejectedValueOnce(new Error('temporary upstream failure'))
        .mockRejectedValueOnce(new Error('temporary upstream failure'))
        .mockResolvedValue({
          content: 'final step',
          toolCalls: [
            createToolCall('finish', {
              reason: 'Enough evidence collected.',
              summary: 'Keyword search on the jobs route returned stable detail pages.',
              reliableControls: ['Keyword search box on the jobs route'],
              trickyFilters: [],
              navigationTips: [],
              applyTips: [],
              warnings: []
            }, 'tool_retry_finish')
          ]
        })
    }
    const jobExtractor: JobExtractor = {
      async extractJobsFromPage() {
        return []
      }
    }

    const result = await runAgentDiscovery(page, createConfig(), llmClient, jobExtractor)

    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(3)
    expect(result.error).toBeUndefined()
    expect(result.debugFindings?.reliableControls[0]).toContain('Keyword search box')
  })
})
