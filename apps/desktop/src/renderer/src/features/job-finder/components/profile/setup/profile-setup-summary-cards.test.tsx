// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProfileSetupSummaryCards } from './profile-setup-screen-sections'

describe('ProfileSetupSummaryCards', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  afterEach(() => {
    if (root) {
      act(() => root?.unmount())
    }
    root = null
    container?.remove()
    container = null
  })

  function renderSummary(hasImportedResume: boolean, reviewItemCount: number) {
    const onResumeCurrentStep = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <ProfileSetupSummaryCards
          actionMessage={null}
          hasImportedResume={hasImportedResume}
          importDisabledReason={null}
          isImportResumePending={false}
          isProfileSetupPending={false}
          resumeImportProgress={null}
          onImportResume={vi.fn()}
          onOpenProfile={vi.fn()}
          onResumeCurrentStep={onResumeCurrentStep}
          profileSetupState={{
            status: hasImportedResume ? 'in_progress' : 'not_started',
            currentStep: hasImportedResume ? 'background' : 'import',
            completedAt: null,
            lastResumedAt: null,
            reviewItems: [],
          }}
          readinessCards={hasImportedResume ? [] : [
            { label: 'Discovery', value: 'Not provided yet' },
            { label: 'Resume quality', value: 'Not analyzed yet' },
            { label: 'Apply readiness', value: 'Not provided yet' },
          ]}
          reviewItemCount={reviewItemCount}
        />,
      )
    })

    return { onResumeCurrentStep }
  }

  it('uses truthful neutral language before any resume analysis', () => {
    const { onResumeCurrentStep } = renderSummary(false, 0)

    expect(container?.textContent).toContain('Build your job-search profile.')
    expect(container?.textContent).toContain('Not analyzed yet')
    expect(container?.textContent).not.toContain('in good shape')
    expect([...container!.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
      'Start setup',
      'Open full Profile',
    ])

    act(() => {
      ;[...container!.querySelectorAll('button')]
        .find((button) => button.textContent === 'Start setup')
        ?.click()
    })
    expect(onResumeCurrentStep).toHaveBeenCalledTimes(1)
  })

  it('promotes review and demotes re-import after a successful import', () => {
    renderSummary(true, 2)

    expect([...container!.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
      'Review current step',
      'Replace resume',
      'Open full Profile',
    ])
  })
})
