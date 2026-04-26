import type {
  JobFinderSettings,
  ResumeTemplateDefinition,
} from '@unemployed/contracts'
import type { ResumeRenderDocument } from '@unemployed/job-finder'

const resumeTemplates: ResumeTemplateDefinition[] = [
  {
    id: 'classic_ats',
    label: 'Classic ATS',
    description: 'Single-column, conservative, and recruiter-friendly for high parsing reliability.'
  },
  {
    id: 'compact_exec',
    label: 'Compact ATS',
    description: 'Single-column, tighter spacing, and still ATS-safe for concise two-page submissions.'
  }
]

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

function renderStructuredSection(input: {
  title: string
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
    <section class="section-block">
      <h3>${escapeHtml(input.title)}</h3>
      ${input.text ? `<p>${escapeHtml(input.text)}</p>` : ''}
      ${entries
        .map(
          (entry) => `
            <article class="entry-block">
              ${entry.heading ? `<h4>${escapeHtml(entry.heading)}</h4>` : ''}
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

function buildTemplateLayout(input: {
  renderDocument: ResumeRenderDocument
  settings: JobFinderSettings
}) {
  const summarySection = input.renderDocument.sections.find((section) => section.kind === 'summary') ?? null
  const experienceSection = input.renderDocument.sections.find((section) => section.kind === 'experience') ?? null
  const coreSkillsSection = input.renderDocument.sections.find((section) => section.label === 'Core Skills') ?? null
  const additionalSections = input.renderDocument.sections.filter(
    (section) => !['summary', 'experience'].includes(section.kind) && section.label !== 'Core Skills' && section.kind !== 'keywords',
  )

  const bodyContent = [
    summarySection ? renderStructuredSection({ title: summarySection.label, text: summarySection.text, bullets: summarySection.bullets, entries: summarySection.entries }) : '',
    experienceSection ? renderStructuredSection({ title: experienceSection.label, text: experienceSection.text, bullets: experienceSection.bullets, entries: experienceSection.entries }) : '',
    coreSkillsSection ? renderStructuredSection({ title: coreSkillsSection.label, text: coreSkillsSection.text, bullets: coreSkillsSection.bullets, entries: coreSkillsSection.entries }) : '',
    ...additionalSections.map((section) => renderStructuredSection({ title: section.label, text: section.text, bullets: section.bullets, entries: section.entries })),
  ].join('')

  if (input.settings.resumeTemplateId === 'compact_exec') {
    return {
      pageClassName: 'page page-compact',
      bodyClassName: 'body-grid body-grid-compact',
      bodyContent,
    }
  }

  return {
    pageClassName: 'page page-classic',
    bodyClassName: 'body-grid body-grid-classic',
    bodyContent,
  }
}

export function renderResumeTemplateHtml(input: {
  renderDocument: ResumeRenderDocument
  settings: JobFinderSettings
}): string {
  const fontFamily = formatFontFamily(input.settings.fontPreset)
  const contactItems = input.renderDocument.contactItems
  const layout = buildTemplateLayout(input)
  const sharedStyles = `
    @page {
      size: Letter;
      margin: 0;
    }
    :root {
      color-scheme: light;
      --ink: #1d1d1b;
      --muted: #5f625e;
      --line: #d9ddd6;
      --accent: #123c69;
      --surface: #f7f8f6;
      font-family: ${fontFamily};
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: white; color: var(--ink); font-family: ${fontFamily}; }
    .page { width: 8.5in; min-height: 11in; margin: 0 auto; }
    .page-classic { padding: 0.55in; }
    .page-compact { padding: 0.45in 0.5in; }
    h1, h2, h3, h4, p, ul { margin: 0; }
    h1 { font-size: 1.9rem; line-height: 1.05; letter-spacing: -0.03em; }
    h2 { font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--muted); }
    h3 { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.15em; color: var(--accent); margin-bottom: 0.35rem; }
    h4 { font-size: 0.92rem; line-height: 1.35; font-weight: 600; }
    p, li { font-size: 0.92rem; line-height: 1.45; }
    ul { padding-left: 1.1rem; display: grid; gap: 0.2rem; }
    .header { display: grid; gap: 0.28rem; padding-bottom: 0.55rem; border-bottom: 1px solid var(--line); }
    .headline { font-size: 1rem; color: var(--muted); }
    .meta { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; color: var(--muted); }
    .section-block { display: grid; gap: 0.35rem; }
    .entry-block { display: grid; gap: 0.28rem; margin-top: 0.3rem; break-inside: avoid; page-break-inside: avoid; }
    .body-grid { display: grid; grid-template-columns: 1fr; }
    .body-grid-classic { gap: 0.95rem; margin-top: 1rem; }
    .body-grid-compact { gap: 0.75rem; margin-top: 0.85rem; }
    .page-compact h1 { font-size: 1.72rem; }
    .page-compact .headline { font-size: 0.95rem; }
    .page-compact p, .page-compact li { font-size: 0.88rem; line-height: 1.34; }
    .page-compact h3 { font-size: 0.73rem; }
    .page-compact .header { gap: 0.22rem; padding-bottom: 0.45rem; }
  `

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(input.renderDocument.fullName)} Resume</title>
    <style>
      ${sharedStyles}
    </style>
  </head>
  <body>
    <article class="${layout.pageClassName}">
      <header class="header">
        <h1>${escapeHtml(input.renderDocument.fullName)}</h1>
        <p class="headline">${escapeHtml(input.renderDocument.headline ?? '')}</p>
        <div class="meta">
          ${input.renderDocument.location ? `<span>${escapeHtml(input.renderDocument.location)}</span>` : ''}
          ${contactItems.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
        </div>
      </header>
      <div class="${layout.bodyClassName}">
        ${layout.bodyContent}
      </div>
    </article>
  </body>
</html>`
}
