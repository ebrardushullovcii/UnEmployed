// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobFinderResumePreview } from '@unemployed/contracts'
import { ResumeStudioPreviewPane } from './resume-studio-preview-pane'

const preview: JobFinderResumePreview = {
  draftId: 'draft_1',
  revisionKey: 'resume_preview_draft_1_abc123',
  html: '<!doctype html><html><body><article data-resume-section-id="section_summary">Preview body</article></body></html>',
  warnings: [
    {
      id: 'preview_warning_1',
      source: 'validation',
      severity: 'warning',
      category: 'poor_keyword_coverage',
      sectionId: 'section_summary',
      entryId: null,
      bulletId: null,
      message: 'Add one more role-specific keyword to the summary.',
    },
  ],
  metadata: {
    templateId: 'classic_ats',
    renderedAt: '2026-04-27T00:00:00.000Z',
    pageCount: null,
    sectionCount: 2,
    entryCount: 1,
  },
}

describe('ResumeStudioPreviewPane', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('surfaces compact preview warnings and unsaved live-preview status', () => {
    render(
      <ResumeStudioPreviewPane
        isDirty
        isPending={false}
        onRetry={vi.fn()}
        onSelectTarget={vi.fn()}
        preview={preview}
        previewError={null}
        previewStatus="ready"
        selectedEntryId={null}
        selectedSectionId="section_summary"
        selectedTargetId={null}
        templateLabel="Chronology Classic"
      />,
    )

    expect(screen.getByText('Unsaved edits rendered')).toBeTruthy()
    expect(screen.getByText(/1 warning/i)).toBeTruthy()
    expect(screen.queryByText(/Add one more role-specific keyword to the summary/i)).toBeNull()
    expect(screen.getByText('Chronology Classic')).toBeTruthy()
    expect(screen.getByTitle('Live resume preview')).toBeTruthy()
  })

  it('shows the preview failure fallback with the renderer error message', () => {
    render(
      <ResumeStudioPreviewPane
        isDirty={false}
        isPending={false}
        onRetry={vi.fn()}
        onSelectTarget={vi.fn()}
        preview={null}
        previewError="Preview rendering failed in desktop test mode."
        previewStatus="error"
        selectedEntryId={null}
        selectedSectionId={null}
        selectedTargetId={null}
        templateLabel={null}
      />,
    )

    expect(screen.getByText('Preview unavailable')).toBeTruthy()
    expect(screen.getByText('Preview rendering failed in desktop test mode.')).toBeTruthy()
  })

  it('forwards preview iframe clicks to the editor targeting callback', async () => {
    const onSelectTarget = vi.fn()
    const rendered = render(
      <ResumeStudioPreviewPane
        isDirty={false}
        isPending={false}
        onRetry={vi.fn()}
        onSelectTarget={onSelectTarget}
        preview={preview}
        previewError={null}
        previewStatus="ready"
        selectedEntryId={null}
        selectedSectionId="section_experience"
        selectedTargetId={null}
        templateLabel="Chronology Classic"
      />,
    )

    const iframe = rendered.getByTitle('Live resume preview')
    if (!(iframe instanceof HTMLIFrameElement)) {
      throw new Error('Expected the live preview element to be an iframe.')
    }

    const frameDocument = iframe.contentDocument ?? document.implementation.createHTMLDocument('preview')
    const frameDocumentAddEventListener = vi.spyOn(frameDocument, 'addEventListener')

    if (!iframe.contentDocument) {
      Object.defineProperty(iframe, 'contentDocument', {
        configurable: true,
        value: frameDocument,
      })
    }

    await act(async () => {
      iframe.dispatchEvent(new Event('load'))
      await Promise.resolve()
    })

    frameDocument.body.innerHTML = '<article data-resume-section-id="section_experience" data-resume-entry-id="entry_signal_systems" data-resume-target-id="entry:section_experience:entry_signal_systems:summary">Signal Systems</article>'

    const previewTarget = frameDocument.querySelector('[data-resume-entry-id="entry_signal_systems"]')
    if (!previewTarget) {
      throw new Error('Expected preview target to exist in iframe test document.')
    }

    const clickListener = frameDocumentAddEventListener.mock.calls.find(
      (call) => call[0] === 'click',
    )?.[1]

    if (typeof clickListener !== 'function') {
      throw new Error('Expected preview pane to register a click listener on the iframe document.')
    }

    clickListener({
      target: previewTarget,
      preventDefault: vi.fn(),
    } as unknown as MouseEvent)

    expect(onSelectTarget).toHaveBeenCalledWith({
      sectionId: 'section_experience',
      entryId: 'entry_signal_systems',
      targetId: 'entry:section_experience:entry_signal_systems:summary',
    })
  })
})
