import type {
  JobFinderSettings,
  ResumeTemplateId,
} from '@unemployed/contracts'
import type { ResumeRenderDocument } from '@unemployed/job-finder'

import {
  getLocalResumeTemplateDefinition,
} from './job-finder-resume-catalog'

type RenderSection = ResumeRenderDocument['sections'][number]

interface ResumeRenderHtmlOptions {
  mode?: 'catalog' | 'export' | 'preview'
}

type RenderMode = NonNullable<ResumeRenderHtmlOptions['mode']>

function withPreviewSelection(input: {
  mode: 'catalog' | 'export' | 'preview'
  sectionId?: string | null
  entryId?: string | null
}) {
  return {
    mode: input.mode,
    ...(input.sectionId !== undefined ? { sectionId: input.sectionId } : {}),
    ...(input.entryId !== undefined ? { entryId: input.entryId } : {}),
  }
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

function renderPreviewAttributes(input: {
  mode: ResumeRenderHtmlOptions['mode']
  sectionId?: string | null
  entryId?: string | null
}): string {
  if (input.mode !== 'preview') {
    return ''
  }

  const attributes: string[] = []

  if (input.sectionId) {
    attributes.push(`data-resume-section-id="${escapeHtml(input.sectionId)}"`)
  }

  if (input.entryId) {
    attributes.push(`data-resume-entry-id="${escapeHtml(input.entryId)}"`)
  }

  return attributes.length > 0 ? ` ${attributes.join(' ')}` : ''
}

function renderStructuredSection(input: {
  sectionId?: string
  title: string
  className?: string
  mode?: 'catalog' | 'export' | 'preview'
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
    <section class="section-block${input.className ? ` ${input.className}` : ''}"${renderPreviewAttributes({
      ...withPreviewSelection({
        mode: input.mode ?? 'export',
        sectionId: input.sectionId ?? null,
      }),
    })}>
      <h3>${escapeHtml(input.title)}</h3>
      ${input.text ? `<p>${escapeHtml(input.text)}</p>` : ''}
      ${entries
        .map(
          (entry) => `
            <article class="entry-block"${renderPreviewAttributes({
              ...withPreviewSelection({
                mode: input.mode ?? 'export',
                sectionId: input.sectionId ?? null,
                entryId: entry.id,
              }),
            })}>
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

function renderSection(
  section: RenderSection | null,
  className?: string,
  mode: ResumeRenderHtmlOptions['mode'] = 'export',
): string {
  if (!section) {
    return ''
  }

  const payload = {
    sectionId: section.id,
    title: section.label,
    mode,
    text: section.text,
    bullets: section.bullets,
    entries: section.entries,
  } satisfies {
    sectionId: string
    title: string
    mode: 'catalog' | 'export' | 'preview' | undefined
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
  mode?: 'catalog' | 'export' | 'preview'
  groups: ReadonlyArray<{ label?: string; values: readonly string[]; sectionId?: string | null }>
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
            (group) => `<p${renderPreviewAttributes({
              ...withPreviewSelection({
                mode: input.mode ?? 'export',
                sectionId: group.sectionId ?? null,
              }),
            })}>${group.label ? `<strong>${escapeHtml(group.label)}:</strong> ` : ''}${group.values.map(escapeHtml).join(', ')}</p>`,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderSkillMatrixSection(input: {
  title: string
  className?: string
  mode?: 'catalog' | 'export' | 'preview'
  groups: ReadonlyArray<{ label?: string; values: readonly string[]; sectionId?: string | null }>
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
              <div class="skill-group"${renderPreviewAttributes({
                ...withPreviewSelection({
                  mode: input.mode ?? 'export',
                  sectionId: group.sectionId ?? null,
                }),
              })}>
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

function renderSummaryCallout(
  section: RenderSection | null,
  className?: string,
  mode: ResumeRenderHtmlOptions['mode'] = 'export',
): string {
  if (!section) {
    return ''
  }

  return renderStructuredSection({
    sectionId: section.id,
    title: section.label,
    className: `section-summary-callout${className ? ` ${className}` : ''}`,
    mode,
    text: section.text,
    bullets: section.bullets,
    entries: section.entries,
  })
}

function renderSkillGroups(
  coreSkillsSection: RenderSection | null,
  additionalSkillsSection: RenderSection | null,
): Array<{ label?: string; values: readonly string[]; sectionId?: string | null }> {
  return [
    {
      label: 'Core',
      values: coreSkillsSection?.bullets ?? [],
      sectionId: coreSkillsSection?.id ?? null,
    },
    {
      label: 'Additional',
      values: additionalSkillsSection?.bullets ?? [],
      sectionId: additionalSkillsSection?.id ?? null,
    },
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
  bodyClassName: string
  headerMarkup: string
  bodyContent: string
}

type SkillGroup = {
  label?: string
  values: readonly string[]
  sectionId?: string | null
}

interface TemplateRenderContext {
  renderDocument: ResumeRenderDocument
  catalog: SectionCatalog
  mode: RenderMode
  skillGroups: SkillGroup[]
  remainingSectionContent: string[]
}

function joinRenderedSections(sections: readonly string[]): string {
  return sections.filter((section) => section.trim().length > 0).join('')
}

function renderSectionCluster(className: string, sections: readonly string[]): string {
  const content = joinRenderedSections(sections)

  if (!content) {
    return ''
  }

  return `<div class="${className}">${content}</div>`
}

function buildHeaderContactValues(renderDocument: ResumeRenderDocument): string[] {
  return [
    renderDocument.location,
    ...renderDocument.contactItems.map((item) => formatContactItem(item)),
  ].filter((value): value is string => Boolean(value))
}

function renderPipeMeta(values: readonly string[], className = 'meta'): string {
  if (values.length === 0) {
    return ''
  }

  return `<div class="${className}">${values.map((value) => `<span>${escapeHtml(value)}</span>`).join('')}</div>`
}

function renderStackedMeta(values: readonly string[], className = 'meta-stack'): string {
  if (values.length === 0) {
    return ''
  }

  return `<div class="${className}">${values.map((value) => `<span>${escapeHtml(value)}</span>`).join('')}</div>`
}

function renderPillMeta(values: readonly string[], className = 'meta-pill-list'): string {
  if (values.length === 0) {
    return ''
  }

  return `<ul class="${className}">${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`
}

function renderClassicHeader(renderDocument: ResumeRenderDocument): string {
  const contactValues = buildHeaderContactValues(renderDocument)

  return `<header class="header header-classic">
      <h1 class="name">${escapeHtml(renderDocument.fullName)}</h1>
      ${renderDocument.headline ? `<p class="headline">${escapeHtml(renderDocument.headline)}</p>` : ''}
      ${renderPipeMeta(contactValues)}
    </header>`
}

function renderSwissAccentHeader(renderDocument: ResumeRenderDocument): string {
  const contactValues = buildHeaderContactValues(renderDocument)

  return `<header class="header header-swiss-accent">
      <p class="eyebrow">Swiss Minimal</p>
      <div class="identity-block">
        <h1 class="name name-left">${escapeHtml(renderDocument.fullName)}</h1>
        ${renderDocument.headline ? `<p class="headline headline-left">${escapeHtml(renderDocument.headline)}</p>` : ''}
      </div>
      ${renderPipeMeta(contactValues, 'meta meta-left')}
    </header>`
}

function renderExecutiveHeader(
  renderDocument: ResumeRenderDocument,
  variant: 'credentials' | 'dense',
): string {
  const contactValues = buildHeaderContactValues(renderDocument)

  return `<header class="header header-executive${variant === 'credentials' ? ' header-executive-credentials' : ''}">
      <p class="eyebrow">Executive Brief</p>
      <div class="identity-block identity-block-tight">
        <h1 class="name">${escapeHtml(renderDocument.fullName)}</h1>
        ${renderDocument.headline ? `<p class="headline headline-executive">${escapeHtml(renderDocument.headline)}</p>` : ''}
      </div>
      ${renderPillMeta(contactValues)}
    </header>`
}

function renderEngineeringSpecHeader(renderDocument: ResumeRenderDocument): string {
  const contactValues = buildHeaderContactValues(renderDocument)

  return `<header class="header header-spec">
      <div class="header-spec-shell">
        <div class="identity-block">
          <p class="eyebrow">Engineering Spec</p>
          <h1 class="name name-left">${escapeHtml(renderDocument.fullName)}</h1>
          ${renderDocument.headline ? `<p class="headline headline-left headline-spec">${escapeHtml(renderDocument.headline)}</p>` : ''}
        </div>
        ${renderStackedMeta(contactValues)}
      </div>
    </header>`
}

function renderPortfolioHeader(renderDocument: ResumeRenderDocument): string {
  const contactValues = buildHeaderContactValues(renderDocument)

  return `<header class="header header-portfolio">
      <p class="eyebrow">Portfolio Narrative</p>
      <div class="identity-block">
        <h1 class="name name-left">${escapeHtml(renderDocument.fullName)}</h1>
        ${renderDocument.headline ? `<p class="headline headline-left headline-portfolio">${escapeHtml(renderDocument.headline)}</p>` : ''}
      </div>
      ${renderPillMeta(contactValues, 'meta-pill-list meta-pill-list-left meta-pill-list-warm')}
    </header>`
}

function renderTechnicalSkillsInlineSection(
  context: TemplateRenderContext,
  className?: string,
): string {
  return renderInlineSection({
    title: 'Technical Skills',
    mode: context.mode,
    groups: context.skillGroups,
    ...(className ? { className } : {}),
  })
}

function renderTechnicalSkillsMatrixSection(
  context: TemplateRenderContext,
  className?: string,
): string {
  return renderSkillMatrixSection({
    title: 'Technical Skills',
    mode: context.mode,
    groups: context.skillGroups,
    ...(className ? { className } : {}),
  })
}

function renderLanguagesSection(
  section: RenderSection | null,
  mode: RenderMode,
  className?: string,
): string {
  if (!section) {
    return ''
  }

  return renderInlineSection({
    title: 'Languages',
    mode,
    groups: [{ values: section.bullets, sectionId: section.id }],
    ...(className ? { className } : {}),
  })
}

function createTemplateRenderContext(input: {
  renderDocument: ResumeRenderDocument
  mode: RenderMode
}): TemplateRenderContext {
  const catalog = buildSectionCatalog(input.renderDocument)

  return {
    renderDocument: input.renderDocument,
    catalog,
    mode: input.mode,
    skillGroups: renderSkillGroups(catalog.coreSkillsSection, catalog.additionalSkillsSection),
    remainingSectionContent: catalog.remainingSections.map((section) =>
      renderSection(section, undefined, input.mode),
    ),
  }
}

function buildSwissMinimalStandardLayout(context: TemplateRenderContext): TemplateLayout {
  return {
    templateClassName: 'theme-classic_ats',
    pageClassName: 'page page-classic',
    bodyClassName: 'body-grid body-grid-classic',
    headerMarkup: renderClassicHeader(context.renderDocument),
    bodyContent: joinRenderedSections([
      renderSectionCluster('section-cluster section-cluster-classic-intro', [
        renderSection(context.catalog.summarySection, undefined, context.mode),
        renderTechnicalSkillsInlineSection(context),
      ]),
      renderSection(context.catalog.experienceSection, undefined, context.mode),
      renderSection(context.catalog.projectSection, undefined, context.mode),
      renderSectionCluster('section-cluster section-cluster-classic-support', [
        renderSection(context.catalog.educationSection, 'section-subtle-card', context.mode),
        renderSection(context.catalog.certificationSection, 'section-subtle-card', context.mode),
        ...context.remainingSectionContent,
        renderLanguagesSection(context.catalog.languageSection, context.mode),
      ]),
    ]),
  }
}

function buildSwissMinimalAccentLayout(context: TemplateRenderContext): TemplateLayout {
  return {
    templateClassName: 'theme-modern_split',
    pageClassName: 'page page-modern',
    bodyClassName: 'body-grid body-grid-modern',
    headerMarkup: renderSwissAccentHeader(context.renderDocument),
    bodyContent: joinRenderedSections([
      renderSectionCluster('section-cluster section-intro-band', [
        renderSummaryCallout(context.catalog.summarySection, 'section-summary-accent', context.mode),
        renderTechnicalSkillsMatrixSection(context, 'section-surface-block'),
      ]),
      renderSection(context.catalog.experienceSection, 'section-timeline', context.mode),
      renderSection(
        context.catalog.projectSection,
        'section-project-accent section-proof-led section-project-spotlight',
        context.mode,
      ),
      renderSectionCluster('section-cluster section-cluster-supporting', [
        renderSection(context.catalog.educationSection, 'section-subtle-card', context.mode),
        renderSection(context.catalog.certificationSection, 'section-subtle-card', context.mode),
        ...context.remainingSectionContent,
        renderLanguagesSection(context.catalog.languageSection, context.mode),
      ]),
    ]),
  }
}

function buildExecutiveBriefDenseLayout(context: TemplateRenderContext): TemplateLayout {
  return {
    templateClassName: 'theme-compact_exec',
    pageClassName: 'page page-compact',
    bodyClassName: 'body-grid body-grid-compact',
    headerMarkup: renderExecutiveHeader(context.renderDocument, 'dense'),
    bodyContent: joinRenderedSections([
      renderSectionCluster('section-cluster section-executive-intro', [
        renderSummaryCallout(
          context.catalog.summarySection,
          'section-summary-tight section-summary-elevated',
          context.mode,
        ),
        renderTechnicalSkillsInlineSection(context, 'section-executive-rundown'),
      ]),
      renderSection(
        context.catalog.experienceSection,
        'section-timeline section-dense-chronology',
        context.mode,
      ),
      renderSection(context.catalog.projectSection, 'section-proof-led section-proof-compact', context.mode),
      renderSectionCluster('section-cluster section-cluster-compact-support', [
        renderSection(
          context.catalog.educationSection,
          'section-subtle-card section-subtle-card-tight',
          context.mode,
        ),
        renderSection(
          context.catalog.certificationSection,
          'section-subtle-card section-subtle-card-tight',
          context.mode,
        ),
        ...context.remainingSectionContent,
        renderLanguagesSection(context.catalog.languageSection, context.mode),
      ]),
    ]),
  }
}

function buildExecutiveBriefCredentialsLayout(context: TemplateRenderContext): TemplateLayout {
  return {
    templateClassName: 'theme-credentials_focus',
    pageClassName: 'page page-credentials',
    bodyClassName: 'body-grid body-grid-credentials',
    headerMarkup: renderExecutiveHeader(context.renderDocument, 'credentials'),
    bodyContent: joinRenderedSections([
      renderSectionCluster('section-cluster section-credential-spotlight', [
        renderSection(
          context.catalog.certificationSection,
          'section-credential-grid section-credential-spotlight-surface',
          context.mode,
        ),
        renderSection(
          context.catalog.educationSection,
          'section-credential-grid section-credential-spotlight-surface',
          context.mode,
        ),
      ]),
      renderSectionCluster('section-cluster section-executive-intro', [
        renderSummaryCallout(
          context.catalog.summarySection,
          'section-summary-tight section-summary-elevated',
          context.mode,
        ),
        renderTechnicalSkillsInlineSection(context, 'section-executive-rundown'),
      ]),
      renderSection(context.catalog.experienceSection, 'section-timeline', context.mode),
      renderSection(context.catalog.projectSection, 'section-proof-led', context.mode),
      renderSectionCluster('section-cluster section-cluster-supporting', [
        ...context.remainingSectionContent,
        renderLanguagesSection(context.catalog.languageSection, context.mode),
      ]),
    ]),
  }
}

function buildEngineeringSpecLayout(context: TemplateRenderContext): TemplateLayout {
  return {
    templateClassName: 'theme-technical_matrix',
    pageClassName: 'page page-technical',
    bodyClassName: 'body-grid body-grid-technical',
    headerMarkup: renderEngineeringSpecHeader(context.renderDocument),
    bodyContent: joinRenderedSections([
      renderSectionCluster('section-cluster section-spec-lead', [
        renderTechnicalSkillsMatrixSection(
          context,
          'section-technical-matrix section-spec-shell',
        ),
        renderSummaryCallout(
          context.catalog.summarySection,
          'section-summary-tight section-spec-shell',
          context.mode,
        ),
      ]),
      renderSection(context.catalog.experienceSection, 'section-timeline section-spec-chronology', context.mode),
      renderSection(context.catalog.projectSection, 'section-proof-led section-spec-projects', context.mode),
      renderSectionCluster('section-cluster section-spec-supporting', [
        renderSection(
          context.catalog.certificationSection,
          'section-credential-grid section-spec-shell',
          context.mode,
        ),
        renderSection(context.catalog.educationSection, 'section-subtle-card section-spec-shell', context.mode),
        ...context.remainingSectionContent,
        renderLanguagesSection(context.catalog.languageSection, context.mode),
      ]),
    ]),
  }
}

function buildPortfolioNarrativeLayout(context: TemplateRenderContext): TemplateLayout {
  return {
    templateClassName: 'theme-project_showcase',
    pageClassName: 'page page-projects',
    bodyClassName: 'body-grid body-grid-projects',
    headerMarkup: renderPortfolioHeader(context.renderDocument),
    bodyContent: joinRenderedSections([
      renderSectionCluster('section-cluster section-portfolio-hero', [
        renderSection(
          context.catalog.projectSection,
          'section-project-accent section-proof-led section-project-spotlight section-portfolio-highlight',
          context.mode,
        ),
        renderSummaryCallout(context.catalog.summarySection, 'section-portfolio-narrative', context.mode),
      ]),
      renderSection(context.catalog.experienceSection, 'section-timeline section-portfolio-chronology', context.mode),
      renderTechnicalSkillsMatrixSection(context, 'section-surface-block section-portfolio-skills'),
      renderSectionCluster('section-cluster section-portfolio-supporting', [
        renderSection(context.catalog.educationSection, 'section-subtle-card', context.mode),
        renderSection(context.catalog.certificationSection, 'section-subtle-card', context.mode),
        ...context.remainingSectionContent,
        renderLanguagesSection(context.catalog.languageSection, context.mode),
      ]),
    ]),
  }
}

function buildTemplateLayout(input: {
  renderDocument: ResumeRenderDocument
  templateId: ResumeTemplateId
  mode?: 'catalog' | 'export' | 'preview'
}): TemplateLayout {
  const context = createTemplateRenderContext({
    renderDocument: input.renderDocument,
    mode: input.mode ?? 'export',
  })

  switch (input.templateId) {
    case 'compact_exec':
      return buildExecutiveBriefDenseLayout(context)
    case 'modern_split':
      return buildSwissMinimalAccentLayout(context)
    case 'technical_matrix':
      return buildEngineeringSpecLayout(context)
    case 'project_showcase':
      return buildPortfolioNarrativeLayout(context)
    case 'credentials_focus':
      return buildExecutiveBriefCredentialsLayout(context)
    case 'classic_ats':
    default:
      return buildSwissMinimalStandardLayout(context)
  }
}

export function renderResumeTemplateHtml(input: {
  renderDocument: ResumeRenderDocument
  settings: JobFinderSettings
  templateId: ResumeTemplateId
}, options?: ResumeRenderHtmlOptions): string {
  const mode = options?.mode ?? 'export'
  const fontFamily = formatFontFamily(input.settings.fontPreset)
  const layout = buildTemplateLayout({
    ...input,
    mode,
  })
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
    .eyebrow { font-size: 0.7rem; line-height: 1.1; color: var(--accent); font-weight: 700; text-transform: uppercase; letter-spacing: 0.16em; }
    .identity-block { display: grid; gap: 0.12rem; }
    .identity-block-tight { gap: 0.08rem; }
    h3 { font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.02em; color: var(--ink); border-bottom: 1px solid var(--line); padding-bottom: 0.08rem; margin-bottom: 0.28rem; }
    h4 { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.12rem 0.8rem; font-size: 0.92rem; line-height: 1.32; font-weight: 700; }
    p, li { font-size: 0.89rem; line-height: 1.35; }
    ul { padding-left: 1rem; display: grid; gap: 0.12rem; }
    .header { display: grid; gap: 0.16rem; padding-bottom: 0.42rem; border-bottom: 1px solid var(--line); }
    .header-classic { justify-items: center; text-align: center; }
    .header-swiss-accent { justify-items: start; text-align: left; border-bottom: 2px solid var(--accent); gap: 0.22rem; }
    .header-executive { justify-items: center; text-align: center; border-bottom: 2px solid var(--accent); gap: 0.18rem; }
    .header-executive-credentials { background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 88%, white), white); padding: 0.16in 0.2in 0.18in; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 0.18in; }
    .header-spec { border-bottom: 2px solid var(--accent); padding-bottom: 0.34rem; }
    .header-spec-shell { display: grid; gap: 0.18rem; border: 1px solid var(--line); background: var(--surface); border-radius: 0.16in; padding: 0.14in 0.16in; }
    .header-portfolio { justify-items: start; text-align: left; border-bottom: 2px solid var(--accent); gap: 0.22rem; }
    .meta { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.18rem 0.55rem; color: var(--muted); font-size: 0.82rem; }
    .meta-left { justify-content: flex-start; }
    .meta span + span::before { content: '|'; color: var(--line); margin-right: 0.55rem; }
    .meta-stack { display: grid; gap: 0.08rem; color: var(--muted); font-size: 0.8rem; }
    .meta-pill-list { list-style: none; padding-left: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 0.14rem; color: var(--muted); }
    .meta-pill-list li { border: 1px solid var(--line); border-radius: 999px; padding: 0.08rem 0.34rem; font-size: 0.76rem; line-height: 1.15; background: white; }
    .meta-pill-list-left { justify-content: flex-start; }
    .meta-pill-list-warm li { background: color-mix(in srgb, var(--surface) 80%, white); }
    .section-block { display: grid; gap: 0.24rem; }
    .section-cluster { display: grid; gap: 0.42rem; }
    .section-cluster-classic-intro,
    .section-intro-band,
    .section-executive-intro,
    .section-spec-lead,
    .section-portfolio-hero,
    .section-credential-spotlight { padding-bottom: 0.08rem; border-bottom: 1px solid color-mix(in srgb, var(--line) 72%, white); }
    .section-cluster-classic-support,
    .section-cluster-supporting,
    .section-cluster-compact-support,
    .section-spec-supporting,
    .section-portfolio-supporting { gap: 0.34rem; }
    .section-summary-callout { border: 1px solid var(--line); background: var(--surface); padding: 0.18in 0.18in 0.16in; border-radius: 0.14in; }
    .section-summary-tight { padding: 0.14in 0.16in; }
    .section-summary-accent { border-left: 0.12in solid color-mix(in srgb, var(--accent) 24%, white); }
    .section-summary-elevated { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--line) 78%, white); }
    .section-subtle-card { border: 1px solid color-mix(in srgb, var(--line) 76%, white); border-radius: 0.14in; background: color-mix(in srgb, var(--surface) 70%, white); padding: 0.14in 0.16in; }
    .section-subtle-card-tight { padding: 0.12in 0.14in; }
    .section-surface-block { border: 1px solid var(--line); border-radius: 0.14in; background: white; padding: 0.14in 0.16in; }
    .section-executive-rundown .inline-lines { gap: 0.12rem; }
    .section-executive-rundown .inline-lines p { border-bottom: 1px solid color-mix(in srgb, var(--line) 72%, white); padding-bottom: 0.08rem; }
    .section-project-accent .entry-block { border-left: 2px solid var(--accent); padding-left: 0.16rem; }
    .section-credential-grid .entry-block { border: 1px solid var(--line); border-radius: 0.12in; padding: 0.12in 0.14in; }
    .section-credential-spotlight-surface { border: 1px solid var(--line); border-radius: 0.16in; background: color-mix(in srgb, var(--surface) 86%, white); padding: 0.16in 0.18in; }
    .section-timeline .entry-block { border-left: 1px solid color-mix(in srgb, var(--accent) 32%, white); padding-left: 0.18rem; }
    .section-dense-chronology .entry-block { margin-top: 0.18rem; }
    .section-proof-led .entry-block { border-top: 1px solid color-mix(in srgb, var(--line) 74%, white); padding-top: 0.18rem; }
    .section-proof-compact .entry-block { gap: 0.12rem; }
    .section-project-spotlight { border: 1px solid color-mix(in srgb, var(--line) 78%, white); border-radius: 0.16in; background: color-mix(in srgb, var(--surface) 78%, white); padding: 0.16in 0.18in; }
    .section-portfolio-highlight { background: color-mix(in srgb, var(--surface) 84%, white); }
    .section-portfolio-narrative { border-style: dashed; }
    .section-spec-shell { background: color-mix(in srgb, var(--surface) 82%, white); }
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
    .theme-modern_split .eyebrow,
    .theme-project_showcase .eyebrow { letter-spacing: 0.18em; }
    .theme-technical_matrix .eyebrow { letter-spacing: 0.14em; }
    .theme-technical_matrix .skill-pill-list li { font-size: 0.79rem; }
    .theme-technical_matrix .skill-group { border-top: 1px solid color-mix(in srgb, var(--line) 72%, white); padding-top: 0.12rem; }
    .theme-project_showcase .section-project-spotlight .entry-block:first-of-type { margin-top: 0; }
    .page-compact .name { font-size: 1.42rem; }
    .page-compact .headline { font-size: 0.9rem; }
    .page-compact p, .page-compact li { font-size: 0.84rem; line-height: 1.3; }
    .page-compact h3 { font-size: 0.76rem; }
    .page-compact .header { gap: 0.14rem; padding-bottom: 0.34rem; }
    .page-technical p, .page-technical li { font-size: 0.86rem; }
    .page-projects .section-project-accent .entry-block { padding-left: 0.2rem; }
    ${mode === 'preview'
      ? `
    body.preview-body { background: #e7edf6; padding: 1rem; }
    .preview-body .page { box-shadow: 0 20px 60px rgba(24, 38, 62, 0.16); }
    [data-resume-section-id], [data-resume-entry-id] { cursor: pointer; transition: box-shadow 120ms ease, background-color 120ms ease; border-radius: 0.12in; }
    [data-resume-entry-id] { padding: 0.06in 0.08in; margin-inline: -0.08in; }
    [data-resume-section-id][data-resume-selected="true"], [data-resume-entry-id][data-resume-selected="true"] { box-shadow: 0 0 0 2px rgba(31, 58, 95, 0.26); background: rgba(31, 58, 95, 0.06); }
    [data-resume-section-id]:hover, [data-resume-entry-id]:hover { box-shadow: 0 0 0 1px rgba(31, 58, 95, 0.18); background: rgba(31, 58, 95, 0.04); }
      `
      : ''}
    ${mode === 'catalog'
      ? `
    body.catalog-body { margin: 0; background: transparent; overflow: hidden; }
    .catalog-shell { width: 188px; height: 243px; overflow: hidden; border-radius: 18px; background: linear-gradient(180deg, rgba(241, 245, 249, 0.92), rgba(255, 255, 255, 0.98)); }
    .catalog-shell .page { margin: 0; box-shadow: none; transform: scale(0.23); transform-origin: top left; }
      `
      : ''}
  `

  const articleMarkup = `<article class="${layout.pageClassName} ${layout.templateClassName}" data-ats-safe="true">
      ${layout.headerMarkup}
      <div class="${layout.bodyClassName}">
        ${layout.bodyContent}
      </div>
    </article>`

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
  <body${mode === 'preview' ? ' class="preview-body"' : mode === 'catalog' ? ' class="catalog-body"' : ''}>
    ${mode === 'catalog' ? `<div class="catalog-shell">${articleMarkup}</div>` : articleMarkup}
  </body>
</html>`
}

const catalogPreviewDocument: ResumeRenderDocument = {
  fullName: 'Avery Stone',
  headline: 'Staff product systems designer',
  location: 'Remote',
  contactItems: ['avery@example.com', 'avery.design'],
  sections: [
    {
      id: 'section_summary',
      kind: 'summary',
      label: 'Summary',
      text: 'Builds calm operating systems for product and design teams.',
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
          id: 'entry_preview_experience',
          heading: 'Staff designer | Northstar | 2021 - Present',
          summary: 'Leads systems design and workflow quality programs.',
          bullets: ['Shipped reusable workflows across product lines.'],
        },
      ],
    },
    {
      id: 'section_core_skills',
      kind: 'skills',
      label: 'Core Skills',
      text: null,
      bullets: ['Design Systems', 'Figma', 'Accessibility'],
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
          id: 'entry_preview_project',
          heading: 'Workflow OS | Design lead',
          summary: 'Created a shared operating model for release reviews.',
          bullets: ['Reduced review churn with clearer ownership.'],
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
  ],
}

export function renderResumeTemplateCatalogPreviewHtml(
  templateId: ResumeTemplateId,
): string {
  return renderResumeTemplateHtml(
    {
      renderDocument: catalogPreviewDocument,
      templateId,
      settings: {
        resumeFormat: 'pdf',
        resumeTemplateId: templateId,
        fontPreset: 'inter_requisite',
        appearanceTheme: 'system',
        humanReviewRequired: true,
        allowAutoSubmitOverride: false,
        keepSessionAlive: false,
        discoveryOnly: false,
      },
    },
    { mode: 'catalog' },
  )
}

export { listLocalResumeTemplates } from './job-finder-resume-catalog'
