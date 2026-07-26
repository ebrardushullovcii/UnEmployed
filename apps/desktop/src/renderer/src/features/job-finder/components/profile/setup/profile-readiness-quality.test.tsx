// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useForm } from 'react-hook-form'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CandidateProfileSchema, type ProfileSetupStep } from '@unemployed/contracts'
import { createProfileEditorValues, type ProfileEditorValues } from '../../../lib/profile-editor'
import { PreferredApplicationLinksField } from '../preferred-application-links-field'
import { ProfileSetupReadyCheckStep } from './profile-setup-step-sections-extra'

describe('profile readiness quality', () => {
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
    vi.clearAllMocks()
  })

  function mount(node: React.ReactNode) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root?.render(node))
  }

  it('names every blocking item and links it to the owning setup step', () => {
    const onGoToStep = vi.fn<(step: ProfileSetupStep) => void>()
    mount(
      <ProfileSetupReadyCheckStep
        applyStatus="needs_review"
        blockingPendingItems={[
          {
            id: 'review_email',
            step: 'essentials',
            target: { domain: 'identity', key: 'contactPath', recordId: null },
            label: 'Contact details',
            reason: 'Add an email address or phone number for recruiter follow-up.',
            severity: 'critical',
            status: 'pending',
            savedStatus: 'pending',
            statusSource: 'saved',
            proposedValue: null,
            sourceSnippet: null,
            sourceCandidateId: null,
            sourceRunId: null,
            createdAt: '2026-07-16T10:00:00.000Z',
            resolvedAt: null,
          },
        ]}
        canFinishSetup={false}
        discoveryStatus="needs_review"
        getReadinessTone={() => 'outline'}
        narrativeStatus="ready"
        onGoToStep={onGoToStep}
        onSaveAndFinish={vi.fn()}
        renderFooter={() => null}
      />,
    )

    expect(container?.textContent).toContain('Contact details')
    expect(container?.textContent).toContain('Add an email address or phone number')
    const reviewButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Review Essentials')
    act(() => {
      reviewButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onGoToStep).toHaveBeenCalledWith('essentials')
  })

  it('shows public-link labels and URLs instead of internal IDs', () => {
    const profile = CandidateProfileSchema.parse({
      id: 'candidate_links',
      firstName: 'Alex',
      lastName: 'Vanguard',
      fullName: 'Alex Vanguard',
      headline: 'Staff Engineer',
      summary: 'Builds reliable systems.',
      currentLocation: 'London, UK',
      yearsExperience: 8,
      email: 'alex@example.com',
      baseResume: { id: 'resume_1', fileName: 'resume.pdf', uploadedAt: '2026-07-16T10:00:00.000Z' },
      links: [{ id: 'link_linkedin_internal_opaque', label: 'LinkedIn', kind: 'linkedin', url: 'https://www.linkedin.com/in/alex' }],
      applicationIdentity: { preferredLinkIds: ['link_linkedin_internal_opaque'] },
    })

    function Harness() {
      const form = useForm<ProfileEditorValues>({ defaultValues: createProfileEditorValues(profile) })
      return <PreferredApplicationLinksField fieldId="preferred-links" profileForm={form} />
    }

    mount(<Harness />)

    expect(container?.textContent).toContain('LinkedIn')
    expect(container?.textContent).toContain('https://www.linkedin.com/in/alex')
    expect(container?.textContent).not.toContain('link_linkedin_internal_opaque')
    expect(container?.querySelector('button[role="checkbox"]')?.getAttribute('data-state')).toBe('checked')
  })
})
