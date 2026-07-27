// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SavedJob } from '@unemployed/contracts'
import { DiscoveryDetailPanel, SourceDiagnostics } from './discovery-detail-panel'

describe('SourceDiagnostics', () => {
  afterEach(cleanup)

  it('keeps provider internals behind a closed diagnostics disclosure', () => {
    const { getByText } = render(
      <SourceDiagnostics
        summaries={[
          {
            title: 'Provider intelligence',
            items: [{ label: 'Board token', value: 'internal-board-token' }],
          },
        ]}
      />,
    )

    const disclosure = getByText('Source diagnostics').closest('details')

    expect(disclosure).toBeTruthy()
    expect((disclosure as HTMLDetailsElement).open).toBe(false)
    expect(getByText('Technical collection details for troubleshooting this saved source.')).toBeTruthy()
  })
})

describe('DiscoveryDetailPanel', () => {
  afterEach(cleanup)

  it('stacks sticky actions inside the narrow detail pane without viewport-based columns', () => {
    const selectedJob = {
      id: 'job_narrow_actions',
      title: 'Senior Frontend Engineer',
      company: 'Example Co',
      location: 'Remote',
      status: 'discovered',
      canonicalUrl: 'https://example.test/jobs/frontend',
      matchAssessment: {
        score: 82,
        reasons: [],
        gaps: [],
      },
      workMode: ['remote'],
      sourceIntelligence: null,
      normalizedCompensation: null,
      description: 'Build accessible interfaces.',
      descriptionFormat: 'text',
      keySkills: [],
      keywordSignals: [],
      provenance: [],
      screeningHints: {
        relocationText: null,
        remoteGeographies: [],
        requiresSecurityClearance: null,
        sponsorshipText: null,
        travelText: null,
      },
      sourceTargetId: null,
    } as unknown as SavedJob

    const { getByTestId, getByRole } = render(
      <DiscoveryDetailPanel
        discoveryTargets={[]}
        isJobPending={() => false}
        onDismissJob={() => undefined}
        onQueueJob={() => undefined}
        selectedJob={selectedJob}
      />,
    )

    const actionRegion = getByTestId('discovery-detail-actions')

    expect(actionRegion.className).not.toContain('grid-cols-3')
    expect(actionRegion.className).toContain('absolute')
    expect(actionRegion.previousElementSibling?.className).toContain('pb-44')
    expect(getByRole('button', { name: 'Shortlist job' })).toBeTruthy()
    expect(getByRole('button', { name: 'Hide result' })).toBeTruthy()
    expect(getByRole('button', { name: 'Copy original listing link' })).toBeTruthy()
  })
})
