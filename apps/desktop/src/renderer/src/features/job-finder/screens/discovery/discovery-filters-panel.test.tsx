// @vitest-environment jsdom

import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobSearchPreferences, SourceAccessPrompt } from '@unemployed/contracts'
import { DiscoveryFiltersPanel } from './discovery-filters-panel'
import { DiscoveryResultsPanel } from './discovery-results-panel'

describe('DiscoveryFiltersPanel', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows a source-aware sign-in prompt near the search controls', () => {
    const onOpenBrowserSessionForTarget = vi.fn()
    const searchPreferences: JobSearchPreferences = {
      targetRoles: ['Principal Designer'],
      jobFamilies: [],
      locations: ['Remote'],
      excludedLocations: [],
      workModes: ['remote'],
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
        targets: [
          {
            id: 'target_linkedin_default',
            label: 'LinkedIn',
            startingUrl: 'https://www.linkedin.com/jobs/search/',
            enabled: true,
            adapterKind: 'auto',
            customInstructions: null,
            instructionStatus: 'draft',
            validatedInstructionId: null,
            draftInstructionId: 'instruction_1',
            lastDebugRunId: null,
            lastVerifiedAt: null,
            staleReason: null,
          },
        ],
      },
    }
    const sourceAccessPrompt: SourceAccessPrompt = {
      targetId: 'target_linkedin_default',
      targetLabel: 'LinkedIn',
      targetUrl: 'https://www.linkedin.com/jobs/search/',
      state: 'prompt_login_required',
      summary: 'Sign in to LinkedIn before the next search can continue.',
      detail: 'Please sign in first.',
      actionLabel: 'Sign in to LinkedIn',
      rerunLabel: 'Search again after sign-in',
      updatedAt: '2026-03-20T10:01:00.000Z',
    }

    const { container, getByRole } = render(
      <MemoryRouter>
        <DiscoveryFiltersPanel
          activeRun={null}
          actionMessage={null}
          browserSession={{
            source: 'target_site',
            status: 'login_required',
            driver: 'catalog_seed',
            label: 'Browser session needs sign-in',
            detail: 'A saved source needs sign-in.',
            lastCheckedAt: '2026-03-20T10:00:00.000Z',
          }}
          discoverySessions={[
            {
              adapterKind: 'target_site',
              status: 'login_required',
              driver: 'chrome_profile_agent',
              label: 'Browser session needs sign-in',
              detail: 'A saved source needs sign-in.',
              lastCheckedAt: '2026-03-20T10:00:00.000Z',
            },
          ]}
          isBrowserSessionPending={false}
          isBrowserSessionPendingForTarget={() => false}
          isDiscoveryAllPending={false}
          isTargetPending={() => false}
          onOpenBrowserSession={vi.fn()}
          onOpenBrowserSessionForTarget={onOpenBrowserSessionForTarget}
          onRunAgentDiscovery={vi.fn()}
          onRunDiscoveryForTarget={vi.fn()}
          onViewProgress={vi.fn()}
          searchPreferences={searchPreferences}
          sourceAccessPrompts={[sourceAccessPrompt]}
        />
      </MemoryRouter>,
    )

    expect(container.textContent).toContain('Sign in to LinkedIn before the next search can continue.')
    expect(container.textContent).toContain('Please sign in first.')
    expect(container.textContent).toContain('Then Search again after sign-in.')
    expect(container.textContent?.match(/Sign in to LinkedIn before the next search can continue\./g)).toHaveLength(1)

    const signInButton = within(getByRole('status')).getByRole('button', {
      name: /sign in to linkedin/i,
    })

    fireEvent.click(signInButton)

    expect(onOpenBrowserSessionForTarget).toHaveBeenCalledWith('target_linkedin_default')
  })

  it('ignores disabled-target prompts for the primary sign-in CTA', () => {
    const onOpenBrowserSession = vi.fn()
    const onOpenBrowserSessionForTarget = vi.fn()
    const searchPreferences: JobSearchPreferences = {
      targetRoles: ['Principal Designer'],
      jobFamilies: [],
      locations: ['Remote'],
      excludedLocations: [],
      workModes: ['remote'],
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
        targets: [
          {
            id: 'target_disabled',
            label: 'Disabled source',
            startingUrl: 'https://disabled.example/jobs',
            enabled: false,
            adapterKind: 'auto',
            customInstructions: null,
            instructionStatus: 'draft',
            validatedInstructionId: null,
            draftInstructionId: null,
            lastDebugRunId: null,
            lastVerifiedAt: null,
            staleReason: null,
          },
          {
            id: 'target_enabled',
            label: 'Enabled source',
            startingUrl: 'https://enabled.example/jobs',
            enabled: true,
            adapterKind: 'auto',
            customInstructions: null,
            instructionStatus: 'draft',
            validatedInstructionId: null,
            draftInstructionId: null,
            lastDebugRunId: null,
            lastVerifiedAt: null,
            staleReason: null,
          },
        ],
      },
    }
    const sourceAccessPrompts: SourceAccessPrompt[] = [
      {
        targetId: 'target_disabled',
        targetLabel: 'Disabled source',
        targetUrl: 'https://disabled.example/jobs',
        state: 'prompt_login_required',
        summary: 'Sign in to Disabled source.',
        detail: null,
        actionLabel: 'Sign in to Disabled source',
        rerunLabel: 'search again',
        updatedAt: '2026-03-20T10:01:00.000Z',
      },
      {
        targetId: 'target_enabled',
        targetLabel: 'Enabled source',
        targetUrl: 'https://enabled.example/jobs',
        state: 'prompt_login_required',
        summary: 'Sign in to Enabled source.',
        detail: null,
        actionLabel: 'Sign in to Enabled source',
        rerunLabel: 'search again',
        updatedAt: '2026-03-20T10:02:00.000Z',
      },
    ]

    const { getAllByRole, container } = render(
      <MemoryRouter>
        <DiscoveryFiltersPanel
          activeRun={null}
          actionMessage={null}
          browserSession={{
            source: 'target_site',
            status: 'login_required',
            driver: 'chrome_profile_agent',
            label: 'Browser session needs sign-in',
            detail: 'A saved source needs sign-in.',
            lastCheckedAt: '2026-03-20T10:00:00.000Z',
          }}
          discoverySessions={[]}
          isBrowserSessionPending={false}
          isBrowserSessionPendingForTarget={() => false}
          isDiscoveryAllPending={false}
          isTargetPending={() => false}
          onOpenBrowserSession={onOpenBrowserSession}
          onOpenBrowserSessionForTarget={onOpenBrowserSessionForTarget}
          onRunAgentDiscovery={vi.fn()}
          onRunDiscoveryForTarget={vi.fn()}
          onViewProgress={vi.fn()}
          searchPreferences={searchPreferences}
          sourceAccessPrompts={sourceAccessPrompts}
        />
      </MemoryRouter>,
    )

    expect(container.textContent).toContain('Sign in to Enabled source.')
    expect(container.textContent).not.toContain('Sign in to Disabled source.')

    const primaryPrompt = getAllByRole('status').find((element) =>
      element.textContent?.includes('Sign in to Enabled source.'),
    )
    expect(primaryPrompt).toBeDefined()

    if (!primaryPrompt) {
      throw new Error('Expected enabled-source sign-in prompt to be rendered.')
    }

    const enabledSourceButton = within(primaryPrompt).getByRole('button', {
      name: /sign in to enabled source/i,
    })

    fireEvent.click(enabledSourceButton)

    expect(onOpenBrowserSessionForTarget).toHaveBeenCalledWith('target_enabled')
    expect(onOpenBrowserSession).not.toHaveBeenCalled()
  })

  it('shows a primary recovery action inside blocked results', () => {
    const onRecoveryAction = vi.fn()
    const { container, getByText } = render(
      <DiscoveryResultsPanel
        browserSession={{
          source: 'target_site',
          status: 'login_required',
          driver: 'chrome_profile_agent',
          label: 'Browser session needs sign-in',
          detail: 'A saved source needs sign-in.',
          lastCheckedAt: '2026-03-20T10:00:00.000Z',
        }}
        jobs={[]}
        onRecoveryAction={onRecoveryAction}
        onSelectJob={vi.fn()}
        recoveryActionLabel="Sign in to LinkedIn"
        recoveryActionNextStep="Then search again after sign-in."
        recoveryActionPending={false}
        selectedJob={null}
      />,
    )

    expect(getByText('Next step')).toBeTruthy()
    fireEvent.click(within(container).getByRole('button', { name: 'Sign in to LinkedIn' }))
    expect(onRecoveryAction).toHaveBeenCalledTimes(1)
  })

  it('keeps a primary recovery action visible when blocked state still shows stale results', () => {
    const onRecoveryAction = vi.fn()
    const { container, getByText } = render(
      <DiscoveryResultsPanel
        browserSession={{
          source: 'target_site',
          status: 'login_required',
          driver: 'chrome_profile_agent',
          label: 'Browser session needs sign-in',
          detail: 'A saved source needs sign-in.',
          lastCheckedAt: '2026-03-20T10:00:00.000Z',
        }}
        jobs={[
          {
            id: 'job_1',
            source: 'target_site',
            sourceJobId: 'job_1',
            discoveryMethod: 'catalog_seed',
            collectionMethod: 'fallback_search',
            canonicalUrl: 'https://example.com/job-1',
            applicationUrl: 'https://example.com/job-1/apply',
            title: 'Principal Designer',
            company: 'Acme',
            location: 'Remote',
            workMode: ['remote'],
            easyApplyEligible: true,
            discoveredAt: '2026-03-20T10:00:00.000Z',
            firstSeenAt: '2026-03-20T10:00:00.000Z',
            lastSeenAt: '2026-03-20T10:00:00.000Z',
            lastVerifiedActiveAt: '2026-03-20T10:00:00.000Z',
            employmentType: null,
            salaryText: null,
            normalizedCompensation: {
              currency: null,
              interval: null,
              minAmount: null,
              maxAmount: null,
              minAnnualUsd: null,
              maxAnnualUsd: null,
            },
            summary: 'Strong fit',
            seniority: null,
            postedAt: null,
            postedAtText: null,
            description: 'Lead design systems work.',
            responsibilities: [],
            minimumQualifications: [],
            preferredQualifications: [],
            department: null,
            team: null,
            employerWebsiteUrl: null,
            employerDomain: null,
            atsProvider: null,
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
              remoteGeographies: [],
              requiresConsentInterrupt: null,
              requiresConsentInterruptKind: null,
            },
            keywordSignals: [],
            keySkills: [],
            benefits: [],
            matchAssessment: {
              score: 92,
              reasons: ['Strong fit'],
              gaps: [],
            },
            status: 'discovered',
            applyPath: 'easy_apply',
            provenance: [],
          },
        ]}
        onRecoveryAction={onRecoveryAction}
        onSelectJob={vi.fn()}
        recoveryActionLabel="Sign in to LinkedIn"
        recoveryActionNextStep="Then search again after sign-in."
        recoveryActionPending={false}
        selectedJob={null}
      />,
    )

    expect(getByText(/last completed search/i)).toBeTruthy()
    fireEvent.click(within(container).getAllByRole('button', { name: 'Sign in to LinkedIn' })[0]!)
    expect(onRecoveryAction).toHaveBeenCalledTimes(1)
  })

  it('prioritizes missing search setup over browser startup copy', () => {
    const { getByText, getByRole, queryByText } = render(
      <DiscoveryResultsPanel
        browserSession={{
          source: 'target_site',
          status: 'unknown',
          driver: 'chrome_profile_agent',
          label: 'Browser starting',
          detail: 'Preparing browser runtime.',
          lastCheckedAt: '2026-03-20T10:00:00.000Z',
        }}
        jobs={[]}
        onSelectJob={vi.fn()}
        searchSetupBlocker={{
          title: 'Add a target role before searching',
          description: 'Add at least one target role in Profile so Find jobs can aim the next search.',
          actionLabel: 'Edit search in Profile',
          actionHref: '#/job-finder/profile',
          nextStep: 'Then search again.',
        }}
        selectedJob={null}
      />,
    )

    expect(getByText('Add a target role before searching')).toBeTruthy()
    expect(getByText('Add at least one target role in Profile so Find jobs can aim the next search.')).toBeTruthy()
    expect(queryByText('Browser is starting')).toBeNull()
    expect((getByRole('link', { name: 'Edit search in Profile' }) as HTMLAnchorElement).getAttribute('href')).toBe('#/job-finder/profile')
  })
})
