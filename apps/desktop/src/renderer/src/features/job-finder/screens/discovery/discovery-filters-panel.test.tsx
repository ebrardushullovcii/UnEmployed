// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobSearchPreferences, SourceAccessPrompt } from '@unemployed/contracts'
import { DiscoveryFiltersPanel } from './discovery-filters-panel'

describe('DiscoveryFiltersPanel', () => {
  afterEach(() => {
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

    const { container } = render(
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
    expect(container.textContent).toContain('Then search again after sign-in.')

    const signInButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.includes('Sign in to LinkedIn'),
    )
    expect(signInButton).not.toBeNull()

    if (!signInButton) {
      throw new Error('Expected sign-in button to be rendered.')
    }

    fireEvent.click(signInButton)

    expect(onOpenBrowserSessionForTarget).toHaveBeenCalledWith('target_linkedin_default')
  })
})
