// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobSearchPreferences, SourceAccessPrompt } from '@unemployed/contracts'
import { DiscoveryFiltersPanel } from './discovery-filters-panel'

describe('DiscoveryFiltersPanel', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount()
      })
    }

    root = null
    container?.remove()
    container = null
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
      state: 'login_required',
      summary: 'Sign in to LinkedIn before the next search can continue.',
      detail: 'Please sign in first.',
      actionLabel: 'Sign in to LinkedIn',
      rerunLabel: 'Search again after sign-in',
      updatedAt: '2026-03-20T10:01:00.000Z',
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
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
    })

    expect(container?.textContent).toContain('Sign in to LinkedIn before the next search can continue.')
    expect(container?.textContent).toContain('Please sign in first.')
    expect(container?.textContent).toContain('Then search again after sign-in.')

    const signInButton = [...(container?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.includes('Sign in to LinkedIn'),
    )
    expect(signInButton).not.toBeNull()

    act(() => {
      signInButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onOpenBrowserSessionForTarget).toHaveBeenCalledWith('target_linkedin_default')
  })
})
