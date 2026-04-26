import type {
  JobFinderSettings,
  ResumeTemplateDefinition,
  ResumeTemplateId,
} from '@unemployed/contracts'
import type { ResumeRenderDocument } from '@unemployed/job-finder'

type RenderSection = ResumeRenderDocument['sections'][number]

const resumeTemplates = [
  {
    id: 'classic_ats',
    label: 'Classic ATS',
    description: 'Single-column, conservative, and recruiter-friendly for high parsing reliability.',
    bestFor: ['General applications', 'Recruiter-heavy funnels'],
    density: 'balanced',
  },
  {
    id: 'compact_exec',
    label: 'Compact ATS',
    description: 'Single-column, tighter spacing, and still ATS-safe for concise two-page submissions.',
    bestFor: ['Experienced candidates', 'Content-dense resumes'],
    density: 'compact',
  },
  {
    id: 'modern_split',
    label: 'Modern Split ATS',
    description: 'Single-column with a sharper modern header and restrained accents for polished but ATS-safe exports.',
    bestFor: ['Product roles', 'Design-adjacent teams', 'Startup hiring loops'],
    density: 'balanced',
  },
  {
    id: 'technical_matrix',
    label: 'Technical Matrix',
    description: 'Skills-forward single-column layout that highlights technical depth before chronology.',
    bestFor: ['Engineering roles', 'Data roles', 'Security roles'],
    density: 'compact',
  },
  {
    id: 'project_showcase',
    label: 'Project Showcase',
    description: 'Project-forward single-column layout for candidates whose proof lands best through shipped work.',
    bestFor: ['Portfolio-heavy candidates', 'Career changers', 'Product builders'],
    density: 'comfortable',
  },
  {
    id: 'credentials_focus',
    label: 'Credentials Focus',
    description: 'Credentials-first single-column layout that surfaces certifications and education earlier without leaving ATS-safe structure.',
    bestFor: ['Regulated industries', 'Certification-heavy roles', 'Academic backgrounds'],
    density: 'balanced',
  },
] satisfies readonly ResumeTemplateDefinition[]

function getLocalResumeTemplateDefinition(
  templateId: ResumeTemplateId,
): ResumeTemplateDefinition {
  return (
    resumeTemplates.find((template) => template.id === templateId) ??
    resumeTemplates[0] ??
    resumeTemplates[1]!
  )
}

export function listLocalResumeTemplates(): readonly ResumeTemplateDefinition[] {
  return resumeTemplates
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function sanitizeSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function formatFontFamily(fontPreset: JobFinderSettings['fontPreset']): string {
  if (fontPreset === 'space_grotesk_display') {
    return "'Space Grotesk', 'Segoe UI', sans-serif"
  }

  return "'IBM Plex Sans', 'Segoe UI', sans-serif"
}

function formatContactItem(value: string): string {
  return value
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
}

function renderEntryHeading(heading: string | null): string {
  if (!heading) {
    return ''
  }

  const [primary, ...metaParts] = heading
    .split(' | ')
    .map((part) => part.trim())
    .filter(Boolean)

  if (!primary) {
    return ''
  }

  return `<h4><span class="entry-primary">${escapeHtml(primary)}</span>${metaParts.length > 0 ? `<span class="entry-meta">${metaParts.map(escapeHtml).join(' | ')}</span>` : ''}</h4>`
}

function renderStructuredSection(input: {
  title: string
  className?: string
  text?: string | null
  bullets?: readonly string[]
  entries?: ReadonlyArray<{
    id: string
    heading: string | null
    summary: string | null
    bullets: string[]
  }>
}): string {
  const bullets = input.bullets ?? []
  const entries = input.entries ?? []
  const hasContent = Boolean(input.text) || bullets.length > 0 || entries.length > 0

  if (!hasContent) {
    return ''
  }

  return `
    <section class="section-block${input.className ? ` ${input.className}` : ''}">
      <h3>${escapeHtml(input.title)}</h3>
      ${input.text ? `<p>${escapeHtml(input.text)}</p>` : ''}
      ${entries
        .map(
          (entry) => `
            <article class="entry-block">
              ${renderEntryHeading(entry.heading)}
              ${entry.summary ? `<p>${escapeHtml(entry.summary)}</p>` : ''}
              ${entry.bullets.length > 0 ? `<ul>${entry.bullets.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>` : ''}
            </article>
          `,
        )
        .join('')}
      ${bullets.length > 0 ? `<ul>${bullets.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>` : ''}
    </section>
  `
}

function renderSection(section: RenderSection | null, className?: string): string {
  if (!section) {
    return ''
  }

  const payload = {
    title: section.label,
    text: section.text,
    bullets: section.bullets,
    entries: section.entries,
  } satisfies {
    title: string
    text: string | null
    bullets: readonly string[]
    entries: RenderSection['entries']
  }

  return renderStructuredSection(
    className
      ? {
          ...payload,
          className,
        }
      : payload,
  )
}

function renderInlineSection(input: {
  title: string
  className?: string
  groups: ReadonlyArray<{ label?: string; values: readonly string[] }>
}): string {
  const groups = input.groups.filter((group) => group.values.length > 0)

  if (groups.length === 0) {
    return ''
  }

  return `
    <section class="section-block inline-section${input.className ? ` ${input.className}` : ''}">
      <h3>${escapeHtml(input.title)}</h3>
      <div class="inline-lines">
        ${groups
          .map(
            (group) => `<p>${group.label ? `<strong>${escapeHtml(group.label)}:</strong> ` : ''}${group.values.map(escapeHtml).join(', ')}</p>`,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderSkillMatrixSection(input: {
  title: string
  className?: string
  groups: ReadonlyArray<{ label?: string; values: readonly string[] }>
}): string {
  const groups = input.groups.filter((group) => group.values.length > 0)

  if (groups.length === 0) {
    return ''
  }

  return `
    <section class="section-block skill-matrix${input.className ? ` ${input.className}` : ''}">
      <h3>${escapeHtml(input.title)}</h3>
      <div class="skill-groups">
        ${groups
          .map(
            (group) => `
              <div class="skill-group">
                ${group.label ? `<p class="skill-group-label">${escapeHtml(group.label)}</p>` : ''}
                <ul class="skill-pill-list">${group.values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>
              </div>
            `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderSummaryCallout(section: RenderSection | null, className?: string): string {
  if (!section) {
    return ''
  }

  return renderStructuredSection({
    title: section.label,
    className: `section-summary-callout${className ? ` ${className}` : ''}`,
    text: section.text,
    bullets: section.bullets,
    entries: section.entries,
  })
}

function renderSkillGroups(
  coreSkillsSection: RenderSection | null,
  additionalSkillsSection: RenderSection | null,
): Array<{ label?: string; values: readonly string[] }> {
  return [
    { label: 'Core', values: coreSkillsSection?.bullets ?? [] },
    { label: 'Additional', values: additionalSkillsSection?.bullets ?? [] },
  ]
}

interface SectionCatalog {
  summarySection: RenderSection | null
  experienceSection: RenderSection | null
  projectSection: RenderSection | null
  educationSection: RenderSection | null
  certificationSection: RenderSection | null
  coreSkillsSection: RenderSection | null
  additionalSkillsSection: RenderSection | null
  languageSection: RenderSection | null
  remainingSections: RenderSection[]
}

function buildSectionCatalog(renderDocument: ResumeRenderDocument): SectionCatalog {
  const summarySection =
    renderDocument.sections.find((section) => section.kind === 'summary') ?? null
  const experienceSection =
    renderDocument.sections.find((section) => section.kind === 'experience') ?? null
  const projectSection =
    renderDocument.sections.find((section) => section.kind === 'projects') ?? null
  const educationSection =
    renderDocument.sections.find((section) => section.kind === 'education') ?? null
  const certificationSection =
    renderDocument.sections.find((section) => section.kind === 'certifications') ?? null
  const coreSkillsSection =
    renderDocument.sections.find((section) => section.label === 'Core Skills') ?? null
  const additionalSkillsSection =
    renderDocument.sections.find((section) => section.label === 'Additional Skills') ?? null
  const languageSection =
    renderDocument.sections.find((section) => section.label === 'Languages') ?? null
  const knownSectionIds = new Set(
    [
      summarySection,
      experienceSection,
      projectSection,
      educationSection,
      certificationSection,
      coreSkillsSection,
      additionalSkillsSection,
      languageSection,
    ]
      .filter((section): section is RenderSection => section !== null)
      .map((section) => section.id),
  )

  return {
    summarySection,
    experienceSection,
    projectSection,
    educationSection,
    certificationSection,
    coreSkillsSection,
    additionalSkillsSection,
    languageSection,
    remainingSections: renderDocument.sections.filter(
      (section) => section.kind !== 'keywords' && !knownSectionIds.has(section.id),
    ),
  }
}

interface TemplateLayout {
  templateClassName: string
  pageClassName: string
  headerClassName: string
  nameClassName: string
  headlineClassName: string
  metaClassName: string
  bodyClassName: string
  bodyContent: string
}

function buildTemplateLayout(input: {
  renderDocument: ResumeRenderDocument
  templateId: ResumeTemplateId
}): TemplateLayout {
  const catalog = buildSectionCatalog(input.renderDocument)
  const technicalSkillsInline = renderInlineSection({
    title: 'Technical Skills',
    groups: renderSkillGroups(
      catalog.coreSkillsSection,
      catalog.additionalSkillsSection,
    ),
  })
  const technicalSkillsMatrix = renderSkillMatrixSection({
    title: 'Technical Skills',
    groups: renderSkillGroups(
      catalog.coreSkillsSection,
      catalog.additionalSkillsSection,
    ),
  })
  const languagesInline = catalog.languageSection
    ? renderInlineSection({
        title: 'Languages',
        groups: [{ values: catalog.languageSection.bullets }],
      })
    : ''
  const remainingSectionContent = catalog.remainingSections.map((section) =>
    renderSection(section),
  )

  switch (input.templateId) {
    case 'compact_exec':
      return {
        templateClassName: 'theme-compact_exec',
        pageClassName: 'page page-compact',
        headerClassName: 'header header-center',
        nameClassName: 'name',
        headlineClassName: 'headline',
        metaClassName: 'meta',
        bodyClassName: 'body-grid body-grid-compact',
        bodyContent: [
          renderSection(catalog.summarySection),
          technicalSkillsInline,
          renderSection(catalog.experienceSection),
          renderSection(catalog.projectSection),
          renderSection(catalog.educationSection),
          renderSection(catalog.certificationSection),
          ...remainingSectionContent,
          languagesInline,
        ].join(''),
      }
    case 'modern_split':
      return {
        templateClassName: 'theme-modern_split',
        pageClassName: 'page page-modern',
        headerClassName: 'header header-left header-accent-band',
        nameClassName: 'name name-left',
        headlineClassName: 'headline headline-left',
        metaClassName: 'meta meta-left',
        bodyClassName: 'body-grid body-grid-modern',
        bodyContent: [
          renderSummaryCallout(catalog.summarySection),
          renderSection(catalog.experienceSection),
          renderSection(catalog.projectSection, 'section-project-accent'),
          technicalSkillsMatrix,
          renderSection(catalog.educationSection),
          renderSection(catalog.certificationSection),
          ...remainingSectionContent,
          languagesInline,
        ].join(''),
      }
    case 'technical_matrix':
      return {
        templateClassName: 'theme-technical_matrix',
        pageClassName: 'page page-technical',
        headerClassName: 'header header-left',
        nameClassName: 'name name-left',
        headlineClassName: 'headline headline-left',
        metaClassName: 'meta meta-left',
        bodyClassName: 'body-grid body-grid-technical',
        bodyContent: [
          renderSummaryCallout(catalog.summarySection, 'section-summary-tight'),
          renderSkillMatrixSection({
            title: 'Technical Skills',
            className: 'section-technical-matrix',
            groups: renderSkillGroups(
              catalog.coreSkillsSection,
              catalog.additionalSkillsSection,
            ),
          }),
          renderSection(catalog.experienceSection),
          renderSection(catalog.projectSection),
          renderSection(catalog.certificationSection, 'section-credential-grid'),
          renderSection(catalog.educationSection),
          ...remainingSectionContent,
          languagesInline,
        ].join(''),
      }
    case 'project_showcase':
      return {
        templateClassName: 'theme-project_showcase',
        pageClassName: 'page page-projects',
        headerClassName: 'header header-left header-accent-band',
        nameClassName: 'name name-left',
        headlineClassName: 'headline headline-left',
        metaClassName: 'meta meta-left',
        bodyClassName: 'body-grid body-grid-projects',
        bodyContent: [
          renderSummaryCallout(catalog.summarySection),
          renderSection(catalog.projectSection, 'section-project-accent'),
          renderSection(catalog.experienceSection),
          technicalSkillsMatrix,
          renderSection(catalog.educationSection),
          renderSection(catalog.certificationSection),
          ...remainingSectionContent,
          languagesInline,
        ].join(''),
      }
    case 'credentials_focus':
      return {
        templateClassName: 'theme-credentials_focus',
        pageClassName: 'page page-credentials',
        headerClassName: 'header header-center header-accent-band',
        nameClassName: 'name',
        headlineClassName: 'headline',
        metaClassName: 'meta',
        bodyClassName: 'body-grid body-grid-credentials',
        bodyContent: [
          renderSummaryCallout(catalog.summarySection, 'section-summary-tight'),
          renderSection(catalog.certificationSection, 'section-credential-grid'),
          renderSection(catalog.educationSection, 'section-credential-grid'),
          renderSection(catalog.experienceSection),
          technicalSkillsInline,
          renderSection(catalog.projectSection),
          ...remainingSectionContent,
          languagesInline,
        ].join(''),
      }
    case 'classic_ats':
    default:
      return {
        templateClassName: 'theme-classic_ats',
        pageClassName: 'page page-classic',
        headerClassName: 'header header-center',
        nameClassName: 'name',
        headlineClassName: 'headline',
        metaClassName: 'meta',
        bodyClassName: 'body-grid body-grid-classic',
        bodyContent: [
          renderSection(catalog.summarySection),
          technicalSkillsInline,
          renderSection(catalog.experienceSection),
          renderSection(catalog.projectSection),
          renderSection(catalog.educationSection),
          renderSection(catalog.certificationSection),
          ...remainingSectionContent,
          languagesInline,
        ].join(''),
      }
  }
}

export function renderResumeTemplateHtml(input: {
  renderDocument: ResumeRenderDocument
  settings: JobFinderSettings
  templateId: ResumeTemplateId
}): string {
  const fontFamily = formatFontFamily(input.settings.fontPreset)
  const contactItems = input.renderDocument.contactItems
  const layout = buildTemplateLayout(input)
  const templateDefinition = getLocalResumeTemplateDefinition(input.templateId)
  const sharedStyles = `
    @page {
      size: Letter;
      margin: 0;
    }
    :root {
      color-scheme: light;
      --ink: #202124;
      --muted: #4f5661;
      --line: #cfd6df;
      --accent: #1f3a5f;
      --surface: #f6f8fb;
      font-family: ${fontFamily};
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: white; color: var(--ink); font-family: ${fontFamily}; }
    .page { width: 8.5in; min-height: 11in; margin: 0 auto; }
    .page-classic { padding: 0.5in 0.58in; }
    .page-compact { padding: 0.45in 0.5in; }
    .page-modern { padding: 0.52in 0.58in; }
    .page-technical { padding: 0.48in 0.54in; }
    .page-projects { padding: 0.56in 0.6in; }
    .page-credentials { padding: 0.52in 0.58in; }
    h1, h2, h3, h4, p, ul { margin: 0; }
    .name { font-size: 1.55rem; line-height: 1.1; letter-spacing: -0.015em; text-align: center; }
    .name-left { text-align: left; }
    .headline { font-size: 0.98rem; color: var(--muted); text-align: center; }
    .headline-left { text-align: left; }
    h3 { font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.02em; color: var(--ink); border-bottom: 1px solid var(--line); padding-bottom: 0.08rem; margin-bottom: 0.28rem; }
    h4 { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.12rem 0.8rem; font-size: 0.92rem; line-height: 1.32; font-weight: 700; }
    p, li { font-size: 0.89rem; line-height: 1.35; }
    ul { padding-left: 1rem; display: grid; gap: 0.12rem; }
    .header { display: grid; gap: 0.16rem; padding-bottom: 0.42rem; border-bottom: 1px solid var(--line); }
    .header-center { text-align: center; }
    .header-left { justify-items: start; text-align: left; }
    .header-accent-band { border-bottom: 2px solid var(--accent); }
    .meta { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.18rem 0.55rem; color: var(--muted); font-size: 0.82rem; }
    .meta-left { justify-content: flex-start; }
    .meta span + span::before { content: '|'; color: var(--line); margin-right: 0.55rem; }
    .section-block { display: grid; gap: 0.24rem; }
    .section-summary-callout { border: 1px solid var(--line); background: var(--surface); padding: 0.18in 0.18in 0.16in; border-radius: 0.14in; }
    .section-summary-tight { padding: 0.14in 0.16in; }
    .section-project-accent .entry-block { border-left: 2px solid var(--accent); padding-left: 0.16rem; }
    .section-credential-grid .entry-block { border: 1px solid var(--line); border-radius: 0.12in; padding: 0.12in 0.14in; }
    .entry-block { display: grid; gap: 0.18rem; margin-top: 0.24rem; break-inside: avoid; page-break-inside: avoid; }
    .entry-primary { min-width: 0; }
    .entry-meta { color: var(--muted); font-size: 0.84rem; font-weight: 500; }
    .inline-lines { display: grid; gap: 0.1rem; }
    .inline-lines p { line-height: 1.32; }
    .inline-lines strong { color: var(--ink); font-weight: 700; }
    .skill-matrix { gap: 0.32rem; }
    .skill-groups { display: grid; gap: 0.26rem; }
    .skill-group { display: grid; gap: 0.12rem; }
    .skill-group-label { font-size: 0.72rem; line-height: 1.1; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
    .skill-pill-list { list-style: none; padding-left: 0; display: flex; flex-wrap: wrap; gap: 0.16rem; }
    .skill-pill-list li { border: 1px solid var(--line); border-radius: 999px; padding: 0.08rem 0.38rem; font-size: 0.81rem; line-height: 1.2; }
    .body-grid { display: grid; grid-template-columns: 1fr; }
    .body-grid-classic { gap: 0.62rem; margin-top: 0.68rem; }
    .body-grid-compact { gap: 0.5rem; margin-top: 0.58rem; }
    .body-grid-modern { gap: 0.58rem; margin-top: 0.64rem; }
    .body-grid-technical { gap: 0.54rem; margin-top: 0.62rem; }
    .body-grid-projects { gap: 0.64rem; margin-top: 0.68rem; }
    .body-grid-credentials { gap: 0.58rem; margin-top: 0.64rem; }
    .theme-classic_ats { --accent: #1f3a5f; --line: #cfd6df; --surface: #f6f8fb; }
    .theme-compact_exec { --accent: #18344f; --line: #c9d2dc; --surface: #f5f7fa; }
    .theme-modern_split { --accent: #27507d; --line: #cad6e5; --surface: #eef4fb; }
    .theme-technical_matrix { --accent: #13515a; --line: #c5d7d8; --surface: #eef7f8; }
    .theme-project_showcase { --accent: #6c4028; --line: #dccdc5; --surface: #faf3ef; }
    .theme-credentials_focus { --accent: #5d4373; --line: #d6cce0; --surface: #f5f0f9; }
    .theme-modern_split .name,
    .theme-project_showcase .name { letter-spacing: -0.02em; }
    .theme-technical_matrix .skill-pill-list li { font-size: 0.79rem; }
    .page-compact .name { font-size: 1.42rem; }
    .page-compact .headline { font-size: 0.9rem; }
    .page-compact p, .page-compact li { font-size: 0.84rem; line-height: 1.3; }
    .page-compact h3 { font-size: 0.76rem; }
    .page-compact .header { gap: 0.14rem; padding-bottom: 0.34rem; }
    .page-technical p, .page-technical li { font-size: 0.86rem; }
    .page-projects .section-project-accent .entry-block { padding-left: 0.2rem; }
  `

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(input.renderDocument.fullName)} Resume</title>
    <meta name="resume-template" content="${escapeHtml(templateDefinition.label)}" />
    <style>
      ${sharedStyles}
    </style>
  </head>
  <body>
    <article class="${layout.pageClassName} ${layout.templateClassName}">
      <header class="${layout.headerClassName}">
        <h1 class="${layout.nameClassName}">${escapeHtml(input.renderDocument.fullName)}</h1>
        ${input.renderDocument.headline ? `<p class="${layout.headlineClassName}">${escapeHtml(input.renderDocument.headline)}</p>` : ''}
        <div class="${layout.metaClassName}">
          ${input.renderDocument.location ? `<span>${escapeHtml(input.renderDocument.location)}</span>` : ''}
          ${contactItems.map((item) => `<span>${escapeHtml(formatContactItem(item))}</span>`).join('')}
        </div>
      </header>
      <div class="${layout.bodyClassName}">
        ${layout.bodyContent}
      </div>
    </article>
  </body>
</html>`
}
