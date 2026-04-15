// @vitest-environment jsdom

import { act, createRef, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ProfileCopilotCollapsedBubble, ProfileCopilotComposer, ProfileCopilotTranscript } from './profile-copilot-rail-sections'

describe('ProfileCopilotComposer', () => {
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

  function renderComposer(props: Partial<ComponentProps<typeof ProfileCopilotComposer>> = {}) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    const defaultProps: ComponentProps<typeof ProfileCopilotComposer> = {
      busy: false,
      composerId: 'profile-copilot-composer',
      input: 'Draft next request while Copilot works.',
      isPendingHere: true,
      onInputChange: vi.fn(),
      onKeyDown: vi.fn(),
      onSend: vi.fn(),
      placeholder: 'Ask for a structured edit',
      sendDisabledReason: null,
      starterQuestion: null,
    }

    act(() => {
      root?.render(<ProfileCopilotComposer {...defaultProps} {...props} />)
    })
  }

  test('keeps the composer editable while a reply is pending', () => {
    renderComposer()

    const textarea = container?.querySelector('textarea')
    const button = container?.querySelector('button')

    expect(textarea).not.toBeNull()
    expect(textarea?.disabled).toBe(false)
    expect(textarea?.value).toBe('Draft next request while Copilot works.')
    expect(container?.textContent).toContain('Copilot is thinking. You can keep typing or drag the bubble while it works.')
    expect(button?.textContent).toContain('Thinking...')
    expect(button?.hasAttribute('disabled')).toBe(true)
  })

  test('shows an explicit save-first guard reason when sending is blocked', () => {
    renderComposer({
      input: 'Please update my preferences.',
      isPendingHere: false,
      sendDisabledReason: 'Save this page before asking Profile Copilot to edit it so your current profile draft does not get overwritten.',
    })

    const textarea = container?.querySelector('textarea')
    const button = container?.querySelector('button')

    expect(textarea?.disabled).toBe(false)
    expect(container?.textContent).toContain('Save this page before asking Profile Copilot to edit it so your current profile draft does not get overwritten.')
    expect(button?.textContent).toContain('Send request')
    expect(button?.hasAttribute('disabled')).toBe(true)
  })
})

describe('ProfileCopilotTranscript', () => {
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

  function renderTranscript(props: Partial<ComponentProps<typeof ProfileCopilotTranscript>> = {}) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    const defaultProps: ComponentProps<typeof ProfileCopilotTranscript> = {
      busy: false,
      actionsDisabledReason: null,
      emptyStateDescription: 'No transcript yet.',
      emptyStateTitle: 'Ask Profile Copilot',
      isPendingHere: false,
      messages: [
        {
          id: 'assistant_message_1',
          role: 'assistant',
          content: ['## Suggested updates', '', '- Prefer **remote-first** targets', '- Add `LinkedIn Jobs`', '', '> Review the broader rewrite before applying it.', '', '```json', '{', '  "applyMode": "needs_review"', '}', '```'].join('\n'),
          context: { surface: 'profile', section: 'preferences' },
          patchGroups: [],
          createdAt: '2026-04-15T16:00:00.000Z',
        },
      ],
      onApplyPatchGroup: vi.fn(),
      onRejectPatchGroup: vi.fn(),
      onUseStarterQuestion: vi.fn(),
      starterQuestion: null,
      transcriptRef: createRef<HTMLDivElement>(),
    }

    act(() => {
      root?.render(<ProfileCopilotTranscript {...defaultProps} {...props} />)
    })
  }

  test('renders assistant markdown-like content as structured transcript UI', () => {
    renderTranscript()

    const markdownRoot = container?.querySelector('[data-profile-copilot-markdown="true"]')
    const heading = markdownRoot?.querySelector('h3')
    const listItems = [...(markdownRoot?.querySelectorAll('ul li') ?? [])].map((element) => element.textContent?.trim())
    const blockquote = markdownRoot?.querySelector('blockquote')
    const strong = markdownRoot?.querySelector('strong')
    const inlineCode = markdownRoot?.querySelector('code')
    const codeBlock = markdownRoot?.querySelector('pre code')

    expect(heading?.textContent).toBe('Suggested updates')
    expect(listItems).toEqual(['Prefer remote-first targets', 'Add LinkedIn Jobs'])
    expect(strong?.textContent).toBe('remote-first')
    expect(blockquote?.textContent).toContain('Review the broader rewrite before applying it.')
    expect(inlineCode?.textContent).toBe('LinkedIn Jobs')
    expect(codeBlock?.textContent).toContain('"applyMode": "needs_review"')
  })
})

describe('ProfileCopilotCollapsedBubble', () => {
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

  test('supports click and keyboard activation semantics on the floating bubble', () => {
    const onClick = vi.fn()
    const onKeyDown = vi.fn()

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <ProfileCopilotCollapsedBubble
          collapsedPreviewTitle="Continue this thread"
          isOpen={false}
          isPendingHere={false}
          messageCount={1}
          onClick={onClick}
          onKeyDown={onKeyDown}
          onPointerDown={vi.fn()}
          onPointerMove={vi.fn()}
          onPointerUp={vi.fn()}
        />,
      )
    })

    const button = container?.querySelector('button')
    expect(button).not.toBeNull()

    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    act(() => {
      button?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
    })

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onKeyDown).toHaveBeenCalledTimes(1)
    expect(button?.getAttribute('aria-expanded')).toBe('false')
    expect(button?.getAttribute('aria-haspopup')).toBe('dialog')
  })
})
