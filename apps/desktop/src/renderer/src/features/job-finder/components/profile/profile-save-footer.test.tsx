// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProfileSaveFooter } from './profile-save-footer'

function renderFooter(overrides?: {
  actionMessage?: string | null
  hasUnsavedChanges?: boolean
  isSavePending?: boolean
  onSave?: () => void
  validationMessage?: string | null
}) {
  return render(
    <ProfileSaveFooter
      actionMessage={overrides?.actionMessage ?? null}
      hasUnsavedChanges={overrides?.hasUnsavedChanges ?? false}
      isSavePending={overrides?.isSavePending ?? false}
      onSave={overrides?.onSave ?? vi.fn()}
      validationMessage={overrides?.validationMessage ?? null}
    />,
  )
}

describe('ProfileSaveFooter', () => {
  afterEach(() => {
    cleanup()
  })

  it('keeps Save changes disabled until the form is dirty', () => {
    const onSave = vi.fn()
    const { rerender } = render(
      <ProfileSaveFooter
        actionMessage={null}
        hasUnsavedChanges={false}
        isSavePending={false}
        onSave={onSave}
        validationMessage={null}
      />,
    )

    const button = screen.getByRole('button', { name: 'Save changes' })
    // A clean form keeps native disabled semantics.
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(button.getAttribute('aria-disabled')).toBeNull()

    rerender(
      <ProfileSaveFooter
        actionMessage={null}
        hasUnsavedChanges
        isSavePending={false}
        onSave={onSave}
        validationMessage={null}
      />,
    )

    expect(screen.getByRole('button', { name: 'Save changes' }).hasAttribute('disabled')).toBe(false)
  })

  it('retains focus on Save changes while the save is pending and blocks activation', () => {
    const onSave = vi.fn()
    const view = renderFooter({ hasUnsavedChanges: true, onSave })

    const button = screen.getByRole('button', { name: 'Save changes' })
    button.focus()
    expect(document.activeElement).toBe(button)

    view.rerender(
      <ProfileSaveFooter
        actionMessage={null}
        hasUnsavedChanges
        isSavePending
        onSave={onSave}
        validationMessage={null}
      />,
    )

    // Pending keeps the control exposed but inert without dropping focus.
    expect(document.activeElement).toBe(button)
    expect(button.hasAttribute('disabled')).toBe(false)
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.getAttribute('aria-disabled')).toBe('true')

    fireEvent.click(button)
    fireEvent.keyDown(button, { key: 'Enter' })
    fireEvent.keyDown(button, { key: ' ' })
    fireEvent.click(screen.getByText(/Save your changes before leaving/))
    expect(onSave).not.toHaveBeenCalled()

    view.rerender(
      <ProfileSaveFooter
        actionMessage={null}
        hasUnsavedChanges
        isSavePending={false}
        onSave={onSave}
        validationMessage={null}
      />,
    )

    // Pending -> ready restores activation under the retained focus.
    expect(document.activeElement).toBe(button)
    expect(button.getAttribute('aria-busy')).toBeNull()
    expect(button.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(button)
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('announces save state through live regions only, without describedby duplication', () => {
    renderFooter({
      actionMessage: 'Profile saved.',
      hasUnsavedChanges: false,
      validationMessage: 'Add an email address before saving.',
    })

    const button = screen.getByRole('button', { name: 'Save changes' })
    // Both messages already live in role="status" regions; pointing the button
    // at them via aria-describedby would announce each message twice.
    expect(button.getAttribute('aria-describedby')).toBeNull()

    const statuses = screen.getAllByRole('status')
    expect(statuses.map((status) => status.textContent)).toEqual([
      'Add an email address before saving.',
      'Profile saved.',
    ])
  })
})
