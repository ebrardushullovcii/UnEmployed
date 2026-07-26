// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SourceDiagnostics } from './discovery-detail-panel'

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
