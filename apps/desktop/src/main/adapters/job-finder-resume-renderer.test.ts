import { describe, expect, test } from 'vitest'
import type { JobFinderSettings, ResumeTemplateId } from '@unemployed/contracts'
import type { ResumeRenderDocument } from '@unemployed/job-finder'

import {
  listLocalResumeTemplates,
  renderResumeTemplateCatalogPreviewHtml,
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
          title: 'Senior systems designer',
          subtitle: 'Signal Systems',
          location: 'London, UK',
          dateRange: 'Jan 2020 – Present',
          heading: 'Senior systems designer — Signal Systems | London, UK | Jan 2020 – Present',
          summary: 'Owns workflow platform delivery.',
          bullets: [{ id: 'entry_1_bullet_1', text: 'Improved designer-engineer handoff <quality> by 30%.' }],
        },
      ],
    },
    {
      id: 'section_skills',
      kind: 'skills',
      label: 'Core Skills',
      text: null,
      bullets: [{ id: 'skill_1', text: 'Figma' }, { id: 'skill_2', text: 'Design Systems' }],
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
          title: 'Workflow OS',
          subtitle: 'Design lead',
          location: null,
          dateRange: null,
          heading: 'Workflow OS — Design lead',
          summary: 'Scaled an internal design system.',
          bullets: [{ id: 'project_1_bullet_1', text: 'Created accessible interaction patterns.' }],
        },
      ],
    },
    {
      id: 'section_additional_skills',
      kind: 'skills',
      label: 'Additional Skills',
      text: null,
      bullets: [{ id: 'add_skill_1', text: 'React' }, { id: 'add_skill_2', text: 'Playwright' }],
      entries: [],
    },
    {
      id: 'section_languages',
      kind: 'skills',
      label: 'Languages',
      text: null,
      bullets: [{ id: 'lang_1', text: 'English — Native' }],
      entries: [],
    },
    {
      id: 'section_keywords',
      kind: 'keywords',
      label: 'Targeted Keywords',
      text: null,
      bullets: [{ id: 'keyword_1', text: 'Should not render' }],
      entries: [],
    },
  ],
}

const credentialHeavyRenderDocument: ResumeRenderDocument = {
  ...baseRenderDocument,
  sections: [
    baseRenderDocument.sections[0]!,
    {
      id: 'section_certifications',
        kind: 'certifications',
        label: 'Certifications',
        text: null,
        bullets: [],
        entries: [
          {
            id: 'cert_1',
            title: 'AWS Certified Solutions Architect',
            subtitle: 'Amazon Web Services',
            location: null,
            dateRange: '2024',
            heading: 'AWS Certified Solutions Architect | Amazon Web Services | 2024',
            summary: 'Validated distributed systems depth for platform-heavy roles.',
            bullets: [{ id: 'cert_1_bullet_1', text: 'Maintains current cloud architecture certification.' }],
          },
        ],
      },
    {
      id: 'section_education',
        kind: 'education',
        label: 'Education',
        text: null,
        bullets: [],
        entries: [
          {
            id: 'edu_1',
            title: 'MSc Human Computer Interaction',
            subtitle: 'City University',
            location: null,
            dateRange: '2015',
            heading: 'MSc Human Computer Interaction | City University | 2015',
            summary: null,
            bullets: [{ id: 'edu_1_bullet_1', text: 'Research focus on applied systems design.' }],
          },
        ],
      },
    ...baseRenderDocument.sections.slice(1),
  ],
}

function renderTemplate(
  templateId: ResumeTemplateId,
  renderDocument: ResumeRenderDocument = baseRenderDocument,
  fontPreset: JobFinderSettings['fontPreset'] = 'inter_requisite',
  options?: Parameters<typeof renderResumeTemplateHtml>[1],
): string {
  return renderResumeTemplateHtml({
    renderDocument,
    templateId,
    settings: {
      resumeFormat: 'pdf',
      resumeTemplateId: templateId,
      fontPreset,
      appearanceTheme: 'system',
      humanReviewRequired: true,
      allowAutoSubmitOverride: false,
      keepSessionAlive: false,
      discoveryOnly: false,
    },
  }, options)
}

describe('job finder resume renderer', () => {
  test('lists six ATS-safe local templates with family metadata', () => {
    expect(listLocalResumeTemplates()).toEqual([
      expect.objectContaining({ id: 'classic_ats', label: 'Swiss Minimal - Standard', familyLabel: 'Swiss Minimal', density: 'balanced' }),
      expect.objectContaining({ id: 'compact_exec', label: 'Executive Brief - Dense', familyLabel: 'Executive Brief', density: 'compact' }),
      expect.objectContaining({ id: 'modern_split', label: 'Swiss Minimal - Accent', familyLabel: 'Swiss Minimal', density: 'balanced' }),
      expect.objectContaining({ id: 'technical_matrix', label: 'Engineering Spec - Systems', familyLabel: 'Engineering Spec', density: 'compact' }),
      expect.objectContaining({ id: 'project_showcase', label: 'Portfolio Narrative - Proof-led', familyLabel: 'Portfolio Narrative', density: 'comfortable' }),
      expect.objectContaining({ id: 'credentials_focus', label: 'Executive Brief - Credentials', familyLabel: 'Executive Brief', density: 'balanced' }),
    ])
  })

  test('renders ATS-safe classic html without keyword section bleed and with escaping', () => {
    const html = renderTemplate('classic_ats')

    expect(html).toContain('@page')
    expect(html).toContain('size: Letter;')
    expect(html).toContain('grid-template-columns: 1fr;')
    expect(html).toContain('data-ats-safe="true"')
    expect(html).toContain('header-classic')
    expect(html).toContain('section-cluster-classic-intro')
    expect(html).toContain('Alex &lt;Vanguard&gt;')
    expect(html).toContain('Improved designer-engineer handoff &lt;quality&gt; by 30%.')
    expect(html).toContain('<span class="entry-primary"><span>Senior systems designer</span> <span aria-hidden="true">—</span> <span>Signal Systems</span></span>')
    expect(html).toContain('<span class="entry-meta"><span>London, UK</span> <span aria-hidden="true">|</span> <span>Jan 2020 – Present</span></span>')
    expect(html).toContain('alex.example.com')
    expect(html).not.toContain('https://alex.example.com')
    expect(html).toContain('<h3>Summary</h3>')
    expect(html).toContain('<h3>Experience</h3>')
    expect(html).toContain('<h3>Technical Skills</h3>')
    expect(html).toContain('<strong>Core:</strong> <span>Figma</span>, <span>Design Systems</span>')
    expect(html).toContain('<strong>Additional:</strong> <span>React</span>, <span>Playwright</span>')
    expect(html.indexOf('<h3>Technical Skills</h3>')).toBeLessThan(html.indexOf('<h3>Experience</h3>'))
    expect(html).toContain('<h3>Languages</h3>')
    expect(html).not.toContain('<h3>Core Skills</h3>')
    expect(html).not.toContain('<h3>Additional Skills</h3>')
    expect(html).not.toContain('Targeted Keywords')
    expect(html).not.toContain('Should not render')
    expect(html).not.toContain('letter-spacing: 0.15em')
  })

  test('renders preview targeting attributes for identity, sections, entries, and bullets', () => {
    const html = renderTemplate('classic_ats', baseRenderDocument, 'inter_requisite', { mode: 'preview' })

    expect(html).toContain('data-resume-target-id="identity:fullName"')
    expect(html).toContain('data-resume-target-id="identity:email"')
    expect(html).toContain('data-resume-target-id="identity:additionalLinks"')
    expect(html).toContain('data-resume-section-id="section_summary"')
    expect(html).toContain('data-resume-target-id="section:section_summary:text"')
    expect(html).toContain('data-resume-entry-id="entry_1"')
    expect(html).toContain('data-resume-target-id="entry:section_experience:entry_1:title"')
    expect(html).toContain('data-resume-target-id="entry:section_experience:entry_1:bullet:entry_1_bullet_1"')
  })

  test('omits blank headline markup when the profile headline is missing', () => {
    const html = renderTemplate('classic_ats', {
      ...baseRenderDocument,
      headline: null,
    })

    expect(html).not.toContain('class="headline"')
  })

  test('renders executive brief dense with executive header treatment and denser chronology', () => {
    const html = renderTemplate('compact_exec', baseRenderDocument, 'space_grotesk_display')

    expect(html).toContain('page-compact')
    expect(html).toContain('body-grid-compact')
    expect(html).toContain('header-executive')
    expect(html).toContain('meta-pill-list')
    expect(html).toContain('section-dense-chronology')
    expect(html).toContain('Executive Brief')
    expect(html).toContain("'Space Grotesk', 'Segoe UI', sans-serif")
    expect(html).toContain('grid-template-columns: 1fr;')
    expect(html).toContain('break-inside: avoid;')
  })

  test('renders materially distinct family structures for accent, technical, and portfolio layouts', () => {
    const accentHtml = renderTemplate('modern_split')
    const technicalHtml = renderTemplate('technical_matrix')
    const portfolioHtml = renderTemplate('project_showcase')

    expect(accentHtml).toContain('header-swiss-accent')
    expect(accentHtml).toContain('section-summary-accent')
    expect(accentHtml).toContain('section-project-spotlight')

    expect(technicalHtml).toContain('header-spec-shell')
    expect(technicalHtml).toContain('meta-stack')
    expect(technicalHtml).toContain('section-spec-shell')
    expect(technicalHtml.indexOf('<h3>Technical Skills</h3>')).toBeLessThan(
      technicalHtml.indexOf('<h3>Summary</h3>'),
    )
    expect(technicalHtml.indexOf('<h3>Summary</h3>')).toBeLessThan(
      technicalHtml.indexOf('<h3>Experience</h3>'),
    )

    expect(portfolioHtml).toContain('header-portfolio')
    expect(portfolioHtml).toContain('section-portfolio-highlight')
    expect(portfolioHtml).toContain('section-portfolio-skills')
    expect(portfolioHtml.indexOf('<h3>Projects</h3>')).toBeLessThan(
      portfolioHtml.indexOf('<h3>Summary</h3>'),
    )
    expect(portfolioHtml.indexOf('<h3>Summary</h3>')).toBeLessThan(
      portfolioHtml.indexOf('<h3>Experience</h3>'),
    )
  })

  test('renders credentials variant with credential spotlight ahead of summary and experience', () => {
    const html = renderTemplate('credentials_focus', credentialHeavyRenderDocument)

    expect(html).toContain('header-executive-credentials')
    expect(html).toContain('section-credential-spotlight')
    expect(html).toContain('section-credential-spotlight-surface')

    const certificationsIndex = html.indexOf('<h3>Certifications</h3>')
    const educationIndex = html.indexOf('<h3>Education</h3>')
    const summaryIndex = html.indexOf('<h3>Summary</h3>')
    const experienceIndex = html.indexOf('<h3>Experience</h3>')

    expect(certificationsIndex).toBeGreaterThan(-1)
    expect(educationIndex).toBeGreaterThan(-1)
    expect(summaryIndex).toBeGreaterThan(-1)
    expect(experienceIndex).toBeGreaterThan(-1)
    expect(certificationsIndex).toBeLessThan(summaryIndex)
    expect(educationIndex).toBeLessThan(summaryIndex)
    expect(summaryIndex).toBeLessThan(experienceIndex)
  })

  test('renders catalog preview shell from the shared renderer for every shipped template', () => {
    for (const template of listLocalResumeTemplates()) {
      const html = renderResumeTemplateCatalogPreviewHtml(template.id)

      expect(html).toContain('class="catalog-body catalog-body-thumbnail"')
      expect(html).toContain('catalog-body-thumbnail')
      expect(html).toContain('catalog-shell')
      expect(html).toContain('transform: scale(0.23);')
      expect(html).toContain('data-ats-safe="true"')
      expect(html).toContain(`content="${template.label}"`)
    }
  })

  test('renders panel catalog preview shell when requested', () => {
    const html = renderResumeTemplateCatalogPreviewHtml('classic_ats', { layout: 'panel' })

    expect(html).toContain('catalog-body-panel')
    expect(html).toContain('catalog-shell-panel')
    expect(html).toContain('John Doe')
    expect(html).toContain('Senior platform engineer')
    expect(html).toContain('AWS Certified Developer')
    expect(html).toContain('--catalog-scale: min(1, calc((100vw - 0.45rem) / 8.5in));')
    expect(html).toContain('data-ats-safe="true"')
  })

  test('renders every shipped template with ATS-safe single-column structure', () => {
    for (const template of listLocalResumeTemplates()) {
      const html = renderTemplate(template.id)

      expect(html).toContain('@page')
      expect(html).toContain('grid-template-columns: 1fr;')
      expect(html).not.toContain('<table')
      expect(html).not.toContain('data-resume-section-id=')
      expect(html).not.toContain('data-resume-entry-id=')
      expect(html).not.toContain('data-resume-target-id=')
      expect(html).toContain(`content="${template.label}"`)
    }
  })
})
