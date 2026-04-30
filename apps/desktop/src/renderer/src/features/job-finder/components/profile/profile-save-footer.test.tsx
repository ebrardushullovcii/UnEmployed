// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProfileSaveFooter } from './profile-save-footer'

describe('ProfileSaveFooter', () => {
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

  it('renders action feedback alongside validation text', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <ProfileSaveFooter
          actionMessage="Profile saved."
          hasUnsavedChanges={false}
          isSavePending={false}
          onSave={vi.fn()}
          validationMessage="Search preferences are invalid."
        />,
      )
    })

    expect(container?.textContent).toContain('Profile saved.')
    expect(container?.textContent).toContain('Search preferences are invalid.')
  })

  it('renders the dirty-import guard message when resume actions are blocked', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <ProfileSaveFooter
          actionMessage="Save your current profile or setup draft before importing or refreshing from resume so those unsaved edits do not get overwritten."
          hasUnsavedChanges={true}
          isSavePending={false}
          onSave={vi.fn()}
          validationMessage={null}
        />,
      )
    })

    expect(container?.textContent).toContain('Save your current profile or setup draft before importing or refreshing from resume so those unsaved edits do not get overwritten.')
  })
})
