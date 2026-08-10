// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProfileSaveFooter } from './profile-save-footer'

describe('ProfileSaveFooter', () => {
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

    expect(
      screen.getByRole('button', { name: 'Save changes' }).hasAttribute('disabled'),
    ).toBe(true)

    rerender(
      <ProfileSaveFooter
        actionMessage={null}
        hasUnsavedChanges
        isSavePending={false}
        onSave={onSave}
        validationMessage={null}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Save changes' }).hasAttribute('disabled'),
    ).toBe(false)
  })
})
