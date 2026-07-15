// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { MatchEvidenceMatrix } from './match-evidence-matrix'

describe('MatchEvidenceMatrix', () => {
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

  it('shows listing evidence, resume evidence, and the blocked recommendation', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <MatchEvidenceMatrix
          assessment={{
            score: 80,
            reasons: ['The role title matches.'],
            gaps: ['FastAPI is not present.'],
            recommendation: 'review_before_applying',
            recommendationRationale: 'FastAPI is not yet supported by explicit resume evidence.',
            requirements: [
              {
                id: 'requirement_skill_python',
                category: 'skill',
                label: 'Python',
                importance: 'required',
                status: 'supported',
                jobEvidence: 'Production Python experience is required.',
                resumeEvidence: [
                  {
                    sourceKind: 'experience',
                    sourceId: 'experience_1',
                    label: 'Senior Engineer at Example',
                    detail: 'Built Python automation services.',
                  },
                ],
                explanation: 'The resume contains explicit Python evidence.',
              },
              {
                id: 'requirement_skill_fastapi',
                category: 'skill',
                label: 'FastAPI',
                importance: 'required',
                status: 'missing',
                jobEvidence: 'Production FastAPI experience is required.',
                resumeEvidence: [],
                explanation: 'No FastAPI evidence was found.',
              },
            ],
          }}
        />,
      )
    })

    expect(container?.textContent).toContain('1 of 2 detected requirements supported')
    expect(container?.textContent).toContain('Review before applying')
    expect(container?.textContent).toContain('Production FastAPI experience is required.')
    expect(container?.textContent).toContain('Built Python automation services.')
    expect(container?.textContent).toContain('1 required item still needs evidence')
  })
})
