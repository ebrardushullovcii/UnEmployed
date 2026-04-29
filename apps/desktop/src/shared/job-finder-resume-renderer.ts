import type {
  JobFinderSettings,
  ResumePreviewIdentityField,
  ResumeTemplateId,
} from '@unemployed/contracts'
import {
  getResumeEntryBulletTargetId,
  getResumeEntryFieldTargetId,
  getResumeIdentityTargetId,
  getResumeSectionBulletTargetId,
  getResumeSectionTextTargetId,
} from '@unemployed/contracts'
import type { ResumeRenderDocument } from '@unemployed/job-finder'

import {
  getLocalResumeTemplateDefinition,
} from './job-finder-resume-catalog'

type RenderSection = ResumeRenderDocument['sections'][number]

interface ResumeRenderHtmlOptions {
  catalogLayout?: 'thumbnail' | 'panel'
  mode?: 'catalog' | 'export' | 'preview'
}

type RenderMode = NonNullable<ResumeRenderHtmlOptions['mode']>

function withPreviewSelection(input: {
  mode: 'catalog' | 'export' | 'preview'
  sectionId?: string | null
  entryId?: string | null
  targetId?: string | null
}) {
  return {
    mode: input.mode,
    ...(input.sectionId !== undefined ? { sectionId: input.sectionId } : {}),
    ...(input.entryId !== undefined ? { entryId: input.entryId } : {}),
    ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
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

function renderIdentityFieldTag(input: {
  mode: ResumeRenderHtmlOptions['mode']
  field: ResumePreviewIdentityField
  tagName: 'h1' | 'p' | 'span' | 'li'
  className?: string
  text: string
}): string {
  return `<${input.tagName}${input.className ? ` class="${input.className}"` : ''}${renderPreviewAttributes({
    ...withPreviewSelection({
      mode: input.mode ?? 'export',
      targetId: getResumeIdentityTargetId(input.field),
    }),
  })}>${escapeHtml(input.text)}</${input.tagName}>`
}

function renderEntryHeading(input: {
  title: string | null
  subtitle: string | null
  location: string | null
  dateRange: string | null
  heading: string | null
  mode: ResumeRenderHtmlOptions['mode']
  sectionId: string
  entryId: string
}): string {
  const primaryParts = [
    input.title
      ? `<span${renderPreviewAttributes({
          ...withPreviewSelection({
            mode: input.mode ?? 'export',
            sectionId: input.sectionId,
            entryId: input.entryId,
            targetId: getResumeEntryFieldTargetId(input.sectionId, input.entryId, 'title'),
          }),
        })}>${escapeHtml(input.title)}</span>`
      : null,
    input.subtitle
      ? `<span${renderPreviewAttributes({
          ...withPreviewSelection({
            mode: input.mode ?? 'export',
            sectionId: input.sectionId,
            entryId: input.entryId,
            targetId: getResumeEntryFieldTargetId(input.sectionId, input.entryId, 'subtitle'),
          }),
        })}>${escapeHtml(input.subtitle)}</span>`
      : null,
  ].filter((value): value is string => Boolean(value))
  const metaParts = [
    input.location
      ? `<span${renderPreviewAttributes({
          ...withPreviewSelection({
            mode: input.mode ?? 'export',
            sectionId: input.sectionId,
            entryId: input.entryId,
            targetId: getResumeEntryFieldTargetId(input.sectionId, input.entryId, 'location'),
          }),
        })}>${escapeHtml(input.location)}</span>`
      : null,
    input.dateRange
      ? `<span${renderPreviewAttributes({
          ...withPreviewSelection({
            mode: input.mode ?? 'export',
            sectionId: input.sectionId,
            entryId: input.entryId,
            targetId: getResumeEntryFieldTargetId(input.sectionId, input.entryId, 'dateRange'),
          }),
        })}>${escapeHtml(input.dateRange)}</span>`
      : null,
  ].filter((value): value is string => Boolean(value))

  if (primaryParts.length === 0) {
    if (!input.heading) {
      return ''
    }

    return `<h4><span class="entry-primary"><span${renderPreviewAttributes({
      ...withPreviewSelection({
        mode: input.mode ?? 'export',
        sectionId: input.sectionId,
        entryId: input.entryId,
        targetId: getResumeEntryFieldTargetId(input.sectionId, input.entryId, 'title'),
      }),
    })}>${escapeHtml(input.heading)}</span></span></h4>`
  }

  return `<h4><span class="entry-primary">${primaryParts.join(' <span aria-hidden="true">—</span> ')}</span>${metaParts.length > 0 ? `<span class="entry-meta">${metaParts.join(' <span aria-hidden="true">|</span> ')}</span>` : ''}</h4>`
}

function renderPreviewAttributes(input: {
  mode: ResumeRenderHtmlOptions['mode']
  sectionId?: string | null
  entryId?: string | null
  targetId?: string | null
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

  if (input.targetId) {
    attributes.push(`data-resume-target-id="${escapeHtml(input.targetId)}"`)
  }

  if (attributes.length > 0) {
    attributes.push('role="button"')
    attributes.push('tabindex="0"')
  }

  return attributes.length > 0 ? ` ${attributes.join(' ')}` : ''
}

function renderStructuredSection(input: {
  sectionId?: string
  title: string
  className?: string
  mode?: 'catalog' | 'export' | 'preview'
  text?: string | null
  bullets?: ReadonlyArray<{ id: string; text: string }>
  entries?: ReadonlyArray<{
    id: string
    title: string | null
    subtitle: string | null
    location: string | null
    dateRange: string | null
    heading: string | null
    summary: string | null
    bullets: Array<{ id: string; text: string }>
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
      ${input.text ? `<p${renderPreviewAttributes({
        ...withPreviewSelection({
          mode: input.mode ?? 'export',
          sectionId: input.sectionId ?? null,
          targetId: input.sectionId ? getResumeSectionTextTargetId(input.sectionId) : null,
        }),
      })}>${escapeHtml(input.text)}</p>` : ''}
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
              ${input.sectionId ? renderEntryHeading({
                title: entry.title,
                subtitle: entry.subtitle,
                location: entry.location,
                dateRange: entry.dateRange,
                heading: entry.heading,
                mode: input.mode ?? 'export',
                sectionId: input.sectionId,
                entryId: entry.id,
              }) : ''}
              ${entry.summary && input.sectionId ? `<p${renderPreviewAttributes({
                ...withPreviewSelection({
                  mode: input.mode ?? 'export',
                  sectionId: input.sectionId,
                  entryId: entry.id,
                  targetId: getResumeEntryFieldTargetId(input.sectionId, entry.id, 'summary'),
                }),
              })}>${escapeHtml(entry.summary)}</p>` : ''}
              ${entry.bullets.length > 0 ? `<ul>${entry.bullets.map((bullet) => `<li${renderPreviewAttributes({
                ...withPreviewSelection({
                  mode: input.mode ?? 'export',
                  sectionId: input.sectionId ?? null,
                  entryId: entry.id,
                  targetId:
                    input.sectionId
                      ? getResumeEntryBulletTargetId(input.sectionId, entry.id, bullet.id)
                      : null,
                }),
              })}>${escapeHtml(bullet.text)}</li>`).join('')}</ul>` : ''}
            </article>
          `,
        )
        .join('')}
      ${bullets.length > 0 ? `<ul>${bullets.map((bullet) => `<li${renderPreviewAttributes({
        ...withPreviewSelection({
          mode: input.mode ?? 'export',
          sectionId: input.sectionId ?? null,
          targetId: input.sectionId ? getResumeSectionBulletTargetId(input.sectionId, bullet.id) : null,
        }),
      })}>${escapeHtml(bullet.text)}</li>`).join('')}</ul>` : ''}
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
    bullets: Array<{ id: string; text: string }>
    entries: ReadonlyArray<{
      id: string
      title: string | null
      subtitle: string | null
      location: string | null
      dateRange: string | null
      heading: string | null
      summary: string | null
      bullets: Array<{ id: string; text: string }>
    }>
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
  groups: ReadonlyArray<{ label?: string; values: ReadonlyArray<{ id: string; text: string }>; sectionId?: string | null }>
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
            })}>${group.label ? `<strong>${escapeHtml(group.label)}:</strong> ` : ''}${group.values.map((value, index) => `<span${renderPreviewAttributes({
              ...withPreviewSelection({
                mode: input.mode ?? 'export',
                sectionId: group.sectionId ?? null,
                targetId: group.sectionId ? getResumeSectionBulletTargetId(group.sectionId, value.id) : null,
              }),
            })}>${escapeHtml(value.text)}</span>${index < group.values.length - 1 ? ', ' : ''}`).join('')}</p>`,
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
  groups: ReadonlyArray<{ label?: string; values: ReadonlyArray<{ id: string; text: string }>; sectionId?: string | null }>
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
                <ul class="skill-pill-list">${group.values.map((value) => `<li${renderPreviewAttributes({
                  ...withPreviewSelection({
                    mode: input.mode ?? 'export',
                    sectionId: group.sectionId ?? null,
                    targetId: group.sectionId ? getResumeSectionBulletTargetId(group.sectionId, value.id) : null,
                  }),
                })}>${escapeHtml(value.text)}</li>`).join('')}</ul>
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
): Array<{ label?: string; values: ReadonlyArray<{ id: string; text: string }>; sectionId?: string | null }> {
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
  values: ReadonlyArray<{ id: string; text: string }>
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

function renderIdentityMeta(
  values: ReadonlyArray<{ field: ResumePreviewIdentityField; text: string }>,
  className: string,
  mode: RenderMode,
  containerTag: 'div' | 'ul' = 'div',
): string {
  if (values.length === 0) {
    return ''
  }

  if (containerTag === 'ul') {
    return `<ul class="${className}">${values.map((value) => renderIdentityFieldTag({
      mode,
      field: value.field,
      tagName: 'li',
      text: value.text,
    })).join('')}</ul>`
  }

  return `<div class="${className}">${values.map((value) => renderIdentityFieldTag({
    mode,
    field: value.field,
    tagName: 'span',
    text: value.text,
  })).join('')}</div>`
}

function buildHeaderIdentityValues(renderDocument: ResumeRenderDocument): Array<{ field: ResumePreviewIdentityField; text: string }> {
  return [
    renderDocument.location
      ? {
          field: 'location' as const,
          text: renderDocument.location,
        }
      : null,
    ...renderDocument.contactItems.map((item) => ({
      field: item.field,
      text: formatContactItem(item.text),
    })),
  ].filter((value): value is { field: ResumePreviewIdentityField; text: string } => Boolean(value))
}

function renderClassicHeader(renderDocument: ResumeRenderDocument, mode: RenderMode): string {
  const contactValues = buildHeaderIdentityValues(renderDocument)

  return `<header class="header header-classic">
      ${renderIdentityFieldTag({ mode, field: 'fullName', tagName: 'h1', className: 'name', text: renderDocument.fullName })}
      ${renderDocument.headline ? renderIdentityFieldTag({ mode, field: 'headline', tagName: 'p', className: 'headline', text: renderDocument.headline }) : ''}
      ${renderIdentityMeta(contactValues, 'meta', mode)}
    </header>`
}

function renderSwissAccentHeader(renderDocument: ResumeRenderDocument, mode: RenderMode): string {
  const contactValues = buildHeaderIdentityValues(renderDocument)

  return `<header class="header header-swiss-accent">
      <p class="eyebrow">Swiss Minimal</p>
      <div class="identity-block">
        ${renderIdentityFieldTag({ mode, field: 'fullName', tagName: 'h1', className: 'name name-left', text: renderDocument.fullName })}
        ${renderDocument.headline ? renderIdentityFieldTag({ mode, field: 'headline', tagName: 'p', className: 'headline headline-left', text: renderDocument.headline }) : ''}
      </div>
      ${renderIdentityMeta(contactValues, 'meta meta-left', mode)}
    </header>`
}

function renderExecutiveHeader(
  renderDocument: ResumeRenderDocument,
  variant: 'credentials' | 'dense',
  mode: RenderMode,
): string {
  const contactValues = buildHeaderIdentityValues(renderDocument)

  return `<header class="header header-executive${variant === 'credentials' ? ' header-executive-credentials' : ''}">
      <p class="eyebrow">Executive Brief</p>
      <div class="identity-block identity-block-tight">
        ${renderIdentityFieldTag({ mode, field: 'fullName', tagName: 'h1', className: 'name', text: renderDocument.fullName })}
        ${renderDocument.headline ? renderIdentityFieldTag({ mode, field: 'headline', tagName: 'p', className: 'headline headline-executive', text: renderDocument.headline }) : ''}
      </div>
      ${renderIdentityMeta(contactValues, 'meta-pill-list', mode, 'ul')}
    </header>`
}

function renderEngineeringSpecHeader(renderDocument: ResumeRenderDocument, mode: RenderMode): string {
  const contactValues = buildHeaderIdentityValues(renderDocument)

  return `<header class="header header-spec">
      <div class="header-spec-shell">
        <div class="identity-block">
          <p class="eyebrow">Engineering Spec</p>
          ${renderIdentityFieldTag({ mode, field: 'fullName', tagName: 'h1', className: 'name name-left', text: renderDocument.fullName })}
          ${renderDocument.headline ? renderIdentityFieldTag({ mode, field: 'headline', tagName: 'p', className: 'headline headline-left headline-spec', text: renderDocument.headline }) : ''}
        </div>
        ${renderIdentityMeta(contactValues, 'meta-stack', mode)}
      </div>
    </header>`
}

function renderPortfolioHeader(renderDocument: ResumeRenderDocument, mode: RenderMode): string {
  const contactValues = buildHeaderIdentityValues(renderDocument)

  return `<header class="header header-portfolio">
      <p class="eyebrow">Portfolio Narrative</p>
      <div class="identity-block">
        ${renderIdentityFieldTag({ mode, field: 'fullName', tagName: 'h1', className: 'name name-left', text: renderDocument.fullName })}
        ${renderDocument.headline ? renderIdentityFieldTag({ mode, field: 'headline', tagName: 'p', className: 'headline headline-left headline-portfolio', text: renderDocument.headline }) : ''}
      </div>
      ${renderIdentityMeta(contactValues, 'meta-pill-list meta-pill-list-left meta-pill-list-warm', mode, 'ul')}
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
    headerMarkup: renderClassicHeader(context.renderDocument, context.mode),
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
    headerMarkup: renderSwissAccentHeader(context.renderDocument, context.mode),
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
    headerMarkup: renderExecutiveHeader(context.renderDocument, 'dense', context.mode),
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
    headerMarkup: renderExecutiveHeader(context.renderDocument, 'credentials', context.mode),
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
    headerMarkup: renderEngineeringSpecHeader(context.renderDocument, context.mode),
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
    headerMarkup: renderPortfolioHeader(context.renderDocument, context.mode),
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
  const catalogLayout = options?.catalogLayout ?? 'thumbnail'
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
      --resume-font-family: var(--font-body, ${fontFamily});
      --resume-paper: var(--card, #ffffff);
      --resume-preview-canvas: var(--surface-muted, #e7edf6);
      --resume-catalog-canvas-start: var(--surface-raised, rgba(241, 245, 249, 0.98));
      --resume-catalog-canvas-end: var(--surface-muted, rgba(226, 232, 240, 0.94));
      --resume-catalog-thumbnail-start: var(--surface-raised, rgba(241, 245, 249, 0.92));
      --resume-catalog-thumbnail-end: var(--card, rgba(255, 255, 255, 0.98));
      --resume-shadow-color: var(--border-strong, rgba(24, 38, 62, 0.16));
      --resume-selected-shadow: var(--ring, rgba(31, 58, 95, 0.26));
      --resume-selected-surface: var(--surface-fill-soft, rgba(31, 58, 95, 0.06));
      --resume-hover-shadow: var(--border-strong, rgba(31, 58, 95, 0.18));
      --resume-hover-surface: var(--surface-fill-subtle, rgba(31, 58, 95, 0.04));
      --resume-page-padding-classic: 0.5in 0.58in;
      --resume-page-padding-compact: 0.45in 0.5in;
      --resume-page-padding-modern: 0.52in 0.58in;
      --resume-page-padding-technical: 0.48in 0.54in;
      --resume-page-padding-projects: 0.56in 0.6in;
      --resume-page-padding-credentials: 0.52in 0.58in;
      --resume-catalog-page-padding-classic: 0.42in 0.48in;
      --resume-catalog-page-padding-compact: 0.38in 0.42in;
      --resume-catalog-page-padding-modern: 0.42in 0.48in;
      --resume-catalog-page-padding-technical: 0.4in 0.44in;
      --resume-catalog-page-padding-projects: 0.44in 0.5in;
      --resume-catalog-page-padding-credentials: 0.42in 0.48in;
      --resume-classic-accent: var(--primary, #1f3a5f);
      --resume-classic-line: var(--border, #cfd6df);
      --resume-classic-surface: var(--surface-muted, #f6f8fb);
      --resume-compact-accent: var(--primary, #18344f);
      --resume-compact-line: var(--border, #c9d2dc);
      --resume-compact-surface: var(--surface-muted, #f5f7fa);
      --resume-modern-accent: var(--primary, #27507d);
      --resume-modern-line: var(--border, #cad6e5);
      --resume-modern-surface: var(--surface-muted, #eef4fb);
      --resume-technical-accent: var(--primary, #13515a);
      --resume-technical-line: var(--border, #c5d7d8);
      --resume-technical-surface: var(--surface-muted, #eef7f8);
      --resume-projects-accent: var(--primary, #6c4028);
      --resume-projects-line: var(--border, #dccdc5);
      --resume-projects-surface: var(--surface-muted, #faf3ef);
      --resume-credentials-accent: var(--primary, #5d4373);
      --resume-credentials-line: var(--border, #d6cce0);
      --resume-credentials-surface: var(--surface-muted, #f5f0f9);
      --ink: var(--foreground, #202124);
      --muted: var(--muted-foreground, #4f5661);
      --line: var(--resume-classic-line);
      --accent: var(--resume-classic-accent);
      --surface: var(--resume-classic-surface);
      font-family: var(--resume-font-family);
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--resume-paper); color: var(--ink); font-family: var(--resume-font-family); }
    .page { width: 8.5in; min-height: 11in; margin: 0 auto; }
    .page-classic { padding: var(--resume-page-padding-classic); }
    .page-compact { padding: var(--resume-page-padding-compact); }
    .page-modern { padding: var(--resume-page-padding-modern); }
    .page-technical { padding: var(--resume-page-padding-technical); }
    .page-projects { padding: var(--resume-page-padding-projects); }
    .page-credentials { padding: var(--resume-page-padding-credentials); }
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
    .header-executive-credentials { background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 88%, var(--resume-paper)), var(--resume-paper)); padding: 0.16in 0.2in 0.18in; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 0.18in; }
    .header-spec { border-bottom: 2px solid var(--accent); padding-bottom: 0.34rem; }
    .header-spec-shell { display: grid; gap: 0.18rem; border: 1px solid var(--line); background: var(--surface); border-radius: 0.16in; padding: 0.14in 0.16in; }
    .header-portfolio { justify-items: start; text-align: left; border-bottom: 2px solid var(--accent); gap: 0.22rem; }
    .meta { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.18rem 0.55rem; color: var(--muted); font-size: 0.82rem; }
    .meta-left { justify-content: flex-start; }
    .meta span + span::before { content: '|'; color: var(--line); margin-right: 0.55rem; }
    .meta-stack { display: grid; gap: 0.08rem; color: var(--muted); font-size: 0.8rem; }
    .meta-pill-list { list-style: none; padding-left: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 0.14rem; color: var(--muted); }
    .meta-pill-list li { border: 1px solid var(--line); border-radius: 999px; padding: 0.08rem 0.34rem; font-size: 0.76rem; line-height: 1.15; background: var(--resume-paper); }
    .meta-pill-list-left { justify-content: flex-start; }
    .meta-pill-list-warm li { background: color-mix(in srgb, var(--surface) 80%, var(--resume-paper)); }
    .section-block { display: grid; gap: 0.24rem; }
    .section-cluster { display: grid; gap: 0.42rem; }
    .section-cluster-classic-intro,
    .section-intro-band,
    .section-executive-intro,
    .section-spec-lead,
    .section-portfolio-hero,
    .section-credential-spotlight { padding-bottom: 0.08rem; border-bottom: 1px solid color-mix(in srgb, var(--line) 72%, var(--resume-paper)); }
    .section-cluster-classic-support,
    .section-cluster-supporting,
    .section-cluster-compact-support,
    .section-spec-supporting,
    .section-portfolio-supporting { gap: 0.34rem; }
    .section-summary-callout { border: 1px solid var(--line); background: var(--surface); padding: 0.18in 0.18in 0.16in; border-radius: 0.14in; }
    .section-summary-tight { padding: 0.14in 0.16in; }
    .section-summary-accent { border-left: 0.12in solid color-mix(in srgb, var(--accent) 24%, var(--resume-paper)); }
    .section-summary-elevated { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--line) 78%, var(--resume-paper)); }
    .section-subtle-card { border: 1px solid color-mix(in srgb, var(--line) 76%, var(--resume-paper)); border-radius: 0.14in; background: color-mix(in srgb, var(--surface) 70%, var(--resume-paper)); padding: 0.14in 0.16in; }
    .section-subtle-card-tight { padding: 0.12in 0.14in; }
    .section-surface-block { border: 1px solid var(--line); border-radius: 0.14in; background: var(--resume-paper); padding: 0.14in 0.16in; }
    .section-executive-rundown .inline-lines { gap: 0.12rem; }
    .section-executive-rundown .inline-lines p { border-bottom: 1px solid color-mix(in srgb, var(--line) 72%, var(--resume-paper)); padding-bottom: 0.08rem; }
    .section-project-accent .entry-block { border-left: 2px solid var(--accent); padding-left: 0.16rem; }
    .section-credential-grid .entry-block { border: 1px solid var(--line); border-radius: 0.12in; padding: 0.12in 0.14in; }
    .section-credential-spotlight-surface { border: 1px solid var(--line); border-radius: 0.16in; background: color-mix(in srgb, var(--surface) 86%, var(--resume-paper)); padding: 0.16in 0.18in; }
    .section-timeline .entry-block { border-left: 1px solid color-mix(in srgb, var(--accent) 32%, var(--resume-paper)); padding-left: 0.18rem; }
    .section-dense-chronology .entry-block { margin-top: 0.18rem; }
    .section-proof-led .entry-block { border-top: 1px solid color-mix(in srgb, var(--line) 74%, var(--resume-paper)); padding-top: 0.18rem; }
    .section-proof-compact .entry-block { gap: 0.12rem; }
    .section-project-spotlight { border: 1px solid color-mix(in srgb, var(--line) 78%, var(--resume-paper)); border-radius: 0.16in; background: color-mix(in srgb, var(--surface) 78%, var(--resume-paper)); padding: 0.16in 0.18in; }
    .section-portfolio-highlight { background: color-mix(in srgb, var(--surface) 84%, var(--resume-paper)); }
    .section-portfolio-narrative { border-style: dashed; }
    .section-spec-shell { background: color-mix(in srgb, var(--surface) 82%, var(--resume-paper)); }
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
    .theme-classic_ats { --accent: var(--resume-classic-accent); --line: var(--resume-classic-line); --surface: var(--resume-classic-surface); }
    .theme-compact_exec { --accent: var(--resume-compact-accent); --line: var(--resume-compact-line); --surface: var(--resume-compact-surface); }
    .theme-modern_split { --accent: var(--resume-modern-accent); --line: var(--resume-modern-line); --surface: var(--resume-modern-surface); }
    .theme-technical_matrix { --accent: var(--resume-technical-accent); --line: var(--resume-technical-line); --surface: var(--resume-technical-surface); }
    .theme-project_showcase { --accent: var(--resume-projects-accent); --line: var(--resume-projects-line); --surface: var(--resume-projects-surface); }
    .theme-credentials_focus { --accent: var(--resume-credentials-accent); --line: var(--resume-credentials-line); --surface: var(--resume-credentials-surface); }
    .theme-modern_split .name,
    .theme-project_showcase .name { letter-spacing: -0.02em; }
    .theme-modern_split .eyebrow,
    .theme-project_showcase .eyebrow { letter-spacing: 0.18em; }
    .theme-technical_matrix .eyebrow { letter-spacing: 0.14em; }
    .theme-technical_matrix .skill-pill-list li { font-size: 0.79rem; }
    .theme-technical_matrix .skill-group { border-top: 1px solid color-mix(in srgb, var(--line) 72%, var(--resume-paper)); padding-top: 0.12rem; }
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
    html, body.preview-body {
      height: 100%;
    }
    body.preview-body {
      --preview-scale: min(1, calc((100vw - 1.25rem) / 8.5in), calc((100% - 0.9rem) / 11in));
      background: var(--resume-preview-canvas);
      min-height: 100%;
      padding: 0;
      overflow-x: hidden;
      overflow-y: auto;
    }
    .preview-shell {
      width: fit-content;
      min-height: calc(11in * var(--preview-scale) + 0.75rem);
      margin: 0 auto;
      padding: 0.375rem;
      display: grid;
      justify-items: start;
      align-content: start;
      zoom: var(--preview-scale);
    }
    .preview-body .page {
      box-shadow: 0 20px 60px var(--resume-shadow-color);
      margin: 0;
    }
    [data-resume-section-id], [data-resume-entry-id], [data-resume-target-id] { cursor: pointer; transition: box-shadow 120ms ease, background-color 120ms ease; border-radius: 0.12in; }
    [data-resume-entry-id] { padding: 0.06in 0.08in; margin-inline: -0.08in; }
    [data-resume-section-id][data-resume-selected="true"], [data-resume-entry-id][data-resume-selected="true"], [data-resume-target-id][data-resume-selected="true"] { box-shadow: 0 0 0 2px var(--resume-selected-shadow); background: var(--resume-selected-surface); }
    [data-resume-section-id]:hover, [data-resume-entry-id]:hover, [data-resume-target-id]:hover, [data-resume-section-id]:focus-visible, [data-resume-entry-id]:focus-visible, [data-resume-target-id]:focus-visible { box-shadow: 0 0 0 1px var(--resume-hover-shadow); background: var(--resume-hover-surface); outline: none; }
      `
      : ''}
    ${mode === 'catalog'
      ? `
    body.catalog-body { margin: 0; overflow: hidden; }
    body.catalog-body.catalog-body-thumbnail { background: transparent; }
    .catalog-shell { overflow: hidden; }
    .catalog-shell-thumbnail { width: 188px; height: 243px; border-radius: 18px; background: linear-gradient(180deg, var(--resume-catalog-thumbnail-start), var(--resume-catalog-thumbnail-end)); }
    .catalog-shell-thumbnail .page { margin: 0; box-shadow: none; transform: scale(0.23); transform-origin: top left; }
    html:has(body.catalog-body.catalog-body-panel), body.catalog-body.catalog-body-panel { height: 100%; }
    body.catalog-body.catalog-body-panel {
      display: grid;
      align-items: start;
      background: linear-gradient(180deg, var(--resume-catalog-canvas-start), var(--resume-catalog-canvas-end));
      padding: 0;
      overflow: hidden;
    }
    .catalog-shell-panel {
      --catalog-scale: min(1, calc((100vw - 0.45rem) / 8.5in));
      width: fit-content;
      min-height: 100%;
      margin: 0 auto;
      padding: 0.14rem 0;
      display: grid;
      justify-items: start;
      align-content: start;
      zoom: var(--catalog-scale);
    }
    .catalog-shell-panel .page {
      margin: 0;
      min-height: auto;
      box-shadow: 0 20px 60px var(--resume-shadow-color);
    }
    .catalog-body-panel .page-classic { padding: var(--resume-catalog-page-padding-classic); }
    .catalog-body-panel .page-compact { padding: var(--resume-catalog-page-padding-compact); }
    .catalog-body-panel .page-modern { padding: var(--resume-catalog-page-padding-modern); }
    .catalog-body-panel .page-technical { padding: var(--resume-catalog-page-padding-technical); }
    .catalog-body-panel .page-projects { padding: var(--resume-catalog-page-padding-projects); }
    .catalog-body-panel .page-credentials { padding: var(--resume-catalog-page-padding-credentials); }
    .catalog-body-panel .header { gap: 0.12rem; padding-bottom: 0.3rem; }
    .catalog-body-panel .body-grid-classic,
    .catalog-body-panel .body-grid-compact,
    .catalog-body-panel .body-grid-modern,
    .catalog-body-panel .body-grid-technical,
    .catalog-body-panel .body-grid-projects,
    .catalog-body-panel .body-grid-credentials { gap: 0.44rem; margin-top: 0.48rem; }
    .catalog-body-panel .section-cluster { gap: 0.28rem; }
    .catalog-body-panel .section-summary-callout,
    .catalog-body-panel .section-subtle-card,
    .catalog-body-panel .section-surface-block,
    .catalog-body-panel .section-project-spotlight,
    .catalog-body-panel .section-credential-spotlight-surface { padding: 0.11in 0.12in; }
    .catalog-body-panel .entry-block { gap: 0.12rem; margin-top: 0.16rem; }
    .catalog-body-panel .skill-groups { gap: 0.18rem; }
    .catalog-body-panel .skill-pill-list { gap: 0.12rem; }
    .catalog-body-panel .skill-pill-list li,
    .catalog-body-panel .meta-pill-list li { padding: 0.06rem 0.3rem; }
    .catalog-body-panel h3 { margin-bottom: 0.18rem; }
    .catalog-body-panel p,
    .catalog-body-panel li { line-height: 1.28; }
      `
      : ''}
  `

  const articleMarkup = `<article class="${layout.pageClassName} ${layout.templateClassName}" data-ats-safe="true">
      ${layout.headerMarkup}
      <div class="${layout.bodyClassName}">
        ${layout.bodyContent}
      </div>
    </article>`

  const bodyClassName = [
    mode === 'preview' ? 'preview-body' : null,
    mode === 'catalog' ? 'catalog-body' : null,
    mode === 'catalog' ? `catalog-body-${catalogLayout}` : null,
  ]
    .filter(Boolean)
    .join(' ')
  const catalogShellClassName = `catalog-shell catalog-shell-${catalogLayout}`

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
  <body${bodyClassName ? ` class="${bodyClassName}"` : ''}>
    ${mode === 'catalog' ? `<div class="${catalogShellClassName}">${articleMarkup}</div>` : mode === 'preview' ? `<div class="preview-shell">${articleMarkup}</div>` : articleMarkup}
  </body>
</html>`
}

const catalogPreviewDocument: ResumeRenderDocument = {
  fullName: 'John Doe',
  headline: 'Senior platform engineer',
  location: 'Austin, TX',
  contactItems: [{ field: 'email', text: 'john@example.com | john-doe.dev' }],
  sections: [
    {
      id: 'section_summary',
      kind: 'summary',
      label: 'Summary',
      text:
        'Builds reliable developer platforms and internal hiring tools that remove manual operational drag.',
      bullets: [],
      entries: [],
    },
    {
      id: 'section_core_skills',
      kind: 'skills',
      label: 'Core Skills',
      text: null,
      bullets: [
        { id: 'preview_skill_1', text: 'TypeScript' },
        { id: 'preview_skill_2', text: 'Distributed Systems' },
        { id: 'preview_skill_3', text: 'AWS' },
        { id: 'preview_skill_4', text: 'React' },
      ],
      entries: [],
    },
    {
      id: 'section_additional_skills',
      kind: 'skills',
      label: 'Additional Skills',
      text: null,
      bullets: [{ id: 'preview_add_skill_1', text: 'Playwright' }, { id: 'preview_add_skill_2', text: 'CI/CD' }],
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
          title: 'Senior platform engineer',
          subtitle: 'Northstar',
          location: null,
          dateRange: '2021 - Present',
          heading: 'Senior platform engineer | Northstar | 2021 - Present',
          summary: 'Leads platform reliability, workflow automation, and internal developer tooling.',
          bullets: [{ id: 'preview_exp_bullet_1', text: 'Cut deployment rollback time by 43% through safer release automation.' }],
        },
        {
          id: 'entry_preview_experience_previous',
          title: 'Software engineer',
          subtitle: 'Beacon Labs',
          location: null,
          dateRange: '2018 - 2021',
          heading: 'Software engineer | Beacon Labs | 2018 - 2021',
          summary: 'Shipped customer-facing product workflows and API integrations for growth teams.',
          bullets: [],
        },
      ],
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
          title: 'Interview copilot',
          subtitle: 'Technical lead',
          location: null,
          dateRange: null,
          heading: 'Interview copilot | Technical lead',
          summary: 'Built an interview prep workspace with typed prompts, scoring, and export flows.',
          bullets: [{ id: 'preview_project_bullet_1', text: 'Increased weekly returning users by 28%.' }],
        },
        {
          id: 'entry_preview_project_second',
          title: 'Hiring pipeline analytics',
          subtitle: 'Builder',
          location: null,
          dateRange: null,
          heading: 'Hiring pipeline analytics | Builder',
          summary: 'Created dashboards that surfaced interview bottlenecks and approval lag.',
          bullets: [],
        },
      ],
    },
    {
      id: 'section_certifications',
      kind: 'certifications',
      label: 'Certifications',
      text: null,
      bullets: [],
      entries: [
        {
          id: 'entry_preview_certification',
          title: 'AWS Certified Developer',
          subtitle: 'Amazon Web Services',
          location: null,
          dateRange: '2024',
          heading: 'AWS Certified Developer | Amazon Web Services | 2024',
          summary: null,
          bullets: [{ id: 'preview_cert_bullet_1', text: 'Validated cloud delivery and systems operations depth.' }],
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
          id: 'entry_preview_education',
          title: 'BSc Computer Science',
          subtitle: 'University of Texas',
          location: null,
          dateRange: '2018',
          heading: 'BSc Computer Science | University of Texas | 2018',
          summary: null,
          bullets: [{ id: 'preview_edu_bullet_1', text: 'Focused on distributed systems and human-centered tooling.' }],
        },
      ],
    },
    {
      id: 'section_languages',
      kind: 'skills',
      label: 'Languages',
      text: null,
      bullets: [
        { id: 'preview_lang_1', text: 'English - Native' },
        { id: 'preview_lang_2', text: 'Spanish - Professional' },
      ],
      entries: [],
    },
  ],
}

export function renderResumeTemplateCatalogPreviewHtml(
  templateId: ResumeTemplateId,
  options?: { layout?: 'thumbnail' | 'panel' },
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
    { mode: 'catalog', catalogLayout: options?.layout ?? 'thumbnail' },
  )
}

export { listLocalResumeTemplates } from './job-finder-resume-catalog'
