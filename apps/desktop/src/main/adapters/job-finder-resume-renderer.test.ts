import { describe, expect, test } from 'vitest'
import type { ResumeRenderDocument } from '@unemployed/job-finder'

import {
  listLocalResumeTemplates,
  renderResumeTemplateHtml,
} from './job-finder-resume-renderer'

const baseRenderDocument: ResumeRenderDocument = {
  fullName: 'Alex <Vanguard>',
  headline: 'Senior systems designer',
  location: 'London, UK',
  contactItems: ['alex@example.com', 'https://alex.example.com'],
  sections: [
    {
      id: 'section_summary',
      kind: 'summary',
      label: 'Summary',
      text: 'Builds resilient workflow systems.',
      bullets: [],
      entries: [],
    },
    {
      id: 'section_experience',
      kind: 'experience',
      label: 'Experience',
      text: null,
      bullets: [],
      entries: [
        {
          id: 'entry_1',
          heading: 'Senior systems designer — Signal Systems | London, UK | 2020-01 – Present',
          summary: 'Owns workflow platform delivery.',
          bullets: ['Improved designer-engineer handoff <quality> by 30%.'],
        },
      ],
    },
    {
      id: 'section_skills',
      kind: 'skills',
      label: 'Core Skills',
      text: null,
      bullets: ['Figma', 'Design Systems'],
      entries: [],
    },
    {
      id: 'section_projects',
      kind: 'projects',
      label: 'Projects',
      text: null,
      bullets: [],
      entries: [
        {
          id: 'project_1',
          heading: 'Workflow OS — Design lead',
          summary: 'Scaled an internal design system.',
          bullets: ['Created accessible interaction patterns.'],
        },
      ],
    },
    {
      id: 'section_keywords',
      kind: 'keywords',
      label: 'Targeted Keywords',
      text: null,
      bullets: ['Should not render'],
      entries: [],
    },
  ],
}

describe('job finder resume renderer', () => {
  test('lists two ATS-safe local templates', () => {
    expect(listLocalResumeTemplates()).toEqual([
      expect.objectContaining({ id: 'classic_ats', label: 'Classic ATS' }),
      expect.objectContaining({ id: 'compact_exec', label: 'Compact ATS' }),
    ])
  })

  test('renders ATS-safe classic html without keyword section bleed and with escaping', () => {
    const html = renderResumeTemplateHtml({
      renderDocument: baseRenderDocument,
      settings: {
        resumeFormat: 'pdf',
        resumeTemplateId: 'classic_ats',
        fontPreset: 'inter_requisite',
        appearanceTheme: 'system',
        humanReviewRequired: true,
        allowAutoSubmitOverride: false,
        keepSessionAlive: false,
        discoveryOnly: false,
      },
    })

    expect(html).toContain('@page')
    expect(html).toContain('size: Letter;')
    expect(html).toContain('grid-template-columns: 1fr;')
    expect(html).toContain('Alex &lt;Vanguard&gt;')
    expect(html).toContain('Improved designer-engineer handoff &lt;quality&gt; by 30%.')
    expect(html).toContain('<h3>Summary</h3>')
    expect(html).toContain('<h3>Experience</h3>')
    expect(html).toContain('<h3>Core Skills</h3>')
    expect(html).not.toContain('Targeted Keywords')
    expect(html).not.toContain('Should not render')
  })

  test('renders compact ats template with denser but still single-column structure', () => {
    const html = renderResumeTemplateHtml({
      renderDocument: baseRenderDocument,
      settings: {
        resumeFormat: 'pdf',
        resumeTemplateId: 'compact_exec',
        fontPreset: 'space_grotesk_display',
        appearanceTheme: 'system',
        humanReviewRequired: true,
        allowAutoSubmitOverride: false,
        keepSessionAlive: false,
        discoveryOnly: false,
      },
    })

    expect(html).toContain('page-compact')
    expect(html).toContain('body-grid-compact')
    expect(html).toContain("'Space Grotesk', 'Segoe UI', sans-serif")
    expect(html).toContain('grid-template-columns: 1fr;')
    expect(html).toContain('break-inside: avoid;')
  })
})
