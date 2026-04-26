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
          heading: 'Senior systems designer — Signal Systems | London, UK | Jan 2020 – Present',
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
      id: 'section_additional_skills',
      kind: 'skills',
      label: 'Additional Skills',
      text: null,
      bullets: ['React', 'Playwright'],
      entries: [],
    },
    {
      id: 'section_languages',
      kind: 'skills',
      label: 'Languages',
      text: null,
      bullets: ['English — Native'],
      entries: [],
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
  test('lists six ATS-safe local themes', () => {
    expect(listLocalResumeTemplates()).toEqual([
      expect.objectContaining({ id: 'classic_ats', label: 'Classic ATS', density: 'balanced' }),
      expect.objectContaining({ id: 'compact_exec', label: 'Compact ATS', density: 'compact' }),
      expect.objectContaining({ id: 'modern_split', label: 'Modern Split ATS', density: 'balanced' }),
      expect.objectContaining({ id: 'technical_matrix', label: 'Technical Matrix', density: 'compact' }),
      expect.objectContaining({ id: 'project_showcase', label: 'Project Showcase', density: 'comfortable' }),
      expect.objectContaining({ id: 'credentials_focus', label: 'Credentials Focus', density: 'balanced' }),
    ])
  })

  test('renders ATS-safe classic html without keyword section bleed and with escaping', () => {
    const html = renderResumeTemplateHtml({
      renderDocument: baseRenderDocument,
      templateId: 'classic_ats',
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
    expect(html).toContain('data-ats-safe="true"')
    expect(html).toContain('Alex &lt;Vanguard&gt;')
    expect(html).toContain('Improved designer-engineer handoff &lt;quality&gt; by 30%.')
    expect(html).toContain('<span class="entry-primary">Senior systems designer — Signal Systems</span>')
    expect(html).toContain('<span class="entry-meta">London, UK | Jan 2020 – Present</span>')
    expect(html).toContain('alex.example.com')
    expect(html).not.toContain('https://alex.example.com')
    expect(html).toContain('<h3>Summary</h3>')
    expect(html).toContain('<h3>Experience</h3>')
    expect(html).toContain('<h3>Technical Skills</h3>')
    expect(html).toContain('<strong>Core:</strong> Figma, Design Systems')
    expect(html).toContain('<strong>Additional:</strong> React, Playwright')
    expect(html.indexOf('<h3>Technical Skills</h3>')).toBeLessThan(html.indexOf('<h3>Experience</h3>'))
    expect(html).toContain('<h3>Languages</h3>')
    expect(html).not.toContain('<h3>Core Skills</h3>')
    expect(html).not.toContain('<h3>Additional Skills</h3>')
    expect(html).not.toContain('Targeted Keywords')
    expect(html).not.toContain('Should not render')
    expect(html).not.toContain('letter-spacing: 0.15em')
  })

  test('omits blank headline markup when the profile headline is missing', () => {
    const html = renderResumeTemplateHtml({
      renderDocument: {
        ...baseRenderDocument,
        headline: null,
      },
      templateId: 'classic_ats',
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

    expect(html).not.toContain('class="headline"')
  })

  test('renders compact ats template with denser but still single-column structure', () => {
    const html = renderResumeTemplateHtml({
      renderDocument: baseRenderDocument,
      templateId: 'compact_exec',
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

  test('renders every shipped theme with ATS-safe single-column structure', () => {
    for (const theme of listLocalResumeTemplates()) {
      const html = renderResumeTemplateHtml({
        renderDocument: baseRenderDocument,
        templateId: theme.id,
        settings: {
          resumeFormat: 'pdf',
          resumeTemplateId: theme.id,
          fontPreset: 'inter_requisite',
          appearanceTheme: 'system',
          humanReviewRequired: true,
          allowAutoSubmitOverride: false,
          keepSessionAlive: false,
          discoveryOnly: false,
        },
      })

      expect(html).toContain('@page')
      expect(html).toContain('grid-template-columns: 1fr;')
      expect(html).not.toContain('<table')
      expect(html).toContain(`content="${theme.label}"`)
    }
  })
})
