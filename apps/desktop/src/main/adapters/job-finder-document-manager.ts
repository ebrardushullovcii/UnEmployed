import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import type { ResumeTemplateDefinition } from '@unemployed/contracts'
import type { JobFinderDocumentManager, ResumeRenderDocument } from '@unemployed/job-finder'

import { getPdfPageCount } from './resume-document'

interface CreateLocalJobFinderDocumentManagerOptions {
  outputDirectory: string
}

const resumeTemplates: ResumeTemplateDefinition[] = [
  {
    id: 'classic_ats',
    label: 'Classic ATS',
    description: 'Single-column, conservative, and recruiter-friendly for high parsing reliability.'
  }
]

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function sanitizeSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function formatFontFamily(fontPreset: string): string {
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

function renderTemplateHtml(input: {
  renderDocument: ResumeRenderDocument
  settings: Parameters<JobFinderDocumentManager['renderResumeArtifact']>[0]['settings']
}): string {
  const renderDocument = input.renderDocument
  const fontFamily = formatFontFamily(input.settings.fontPreset)
  const contactItems = renderDocument.contactItems
  const summarySection = renderDocument.sections.find((section) => section.kind === 'summary') ?? null
  const experienceSection = renderDocument.sections.find((section) => section.kind === 'experience') ?? null
  const coreSkillsSection = renderDocument.sections.find((section) => section.label === 'Core Skills') ?? null
  const additionalSections = renderDocument.sections.filter(
    (section) => !['summary', 'experience'].includes(section.kind) && section.label !== 'Core Skills' && section.kind !== 'keywords',
  )

  const sharedStyles = `
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
    .page { width: 8.5in; min-height: 11in; margin: 0 auto; padding: 0.55in; }
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
    .section-stack { display: grid; gap: 0.85rem; margin-top: 0.9rem; }
    .section-block { display: grid; gap: 0.35rem; }
    .entry-block { display: grid; gap: 0.28rem; margin-top: 0.3rem; }
    .sidebar-card { background: var(--surface); border: 1px solid var(--line); padding: 0.7rem; display: grid; gap: 0.8rem; }
    .tag-grid { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .tag { padding: 0.24rem 0.48rem; border: 1px solid var(--line); border-radius: 999px; font-size: 0.76rem; }
    .body-grid { display: grid; gap: 0.95rem; margin-top: 1rem; }
  `

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(renderDocument.fullName)} Resume</title>
    <style>
      ${sharedStyles}
      .body-grid { grid-template-columns: 1fr; }
    </style>
  </head>
  <body>
    <article class="page">
      <header class="header">
        <h1>${escapeHtml(renderDocument.fullName)}</h1>
        <p class="headline">${escapeHtml(renderDocument.headline ?? '')}</p>
        <div class="meta">
          ${renderDocument.location ? `<span>${escapeHtml(renderDocument.location)}</span>` : ''}
          ${contactItems.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
        </div>
      </header>
      <div class="body-grid">
        ${summarySection ? renderStructuredSection({ title: summarySection.label, text: summarySection.text, bullets: summarySection.bullets, entries: summarySection.entries }) : ''}
        ${experienceSection ? renderStructuredSection({ title: experienceSection.label, text: experienceSection.text, bullets: experienceSection.bullets, entries: experienceSection.entries }) : ''}
        ${coreSkillsSection ? renderStructuredSection({ title: coreSkillsSection.label, text: coreSkillsSection.text, bullets: coreSkillsSection.bullets, entries: coreSkillsSection.entries }) : ''}
        ${additionalSections.map((section) => renderStructuredSection({ title: section.label, text: section.text, bullets: section.bullets, entries: section.entries })).join('')}
      </div>
    </article>
  </body>
</html>`
}

async function renderPdfFromHtml(html: string, htmlPath: string, targetPath: string): Promise<void> {
  const exportWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  try {
    await writeFile(htmlPath, html, 'utf8')
    await exportWindow.loadFile(htmlPath)
    await exportWindow.webContents.executeJavaScript(
      "new Promise((resolve) => { if (document.fonts?.ready) { document.fonts.ready.finally(resolve); } else { resolve(); } })",
      true,
    )

    const pdfBuffer = await exportWindow.webContents.printToPDF({
      margins: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      },
      printBackground: true,
      pageSize: 'Letter',
      preferCSSPageSize: true,
    })

    await writeFile(targetPath, pdfBuffer)
  } finally {
    if (!exportWindow.isDestroyed()) {
      exportWindow.destroy()
    }
  }
}

export function createLocalJobFinderDocumentManager(
  options: CreateLocalJobFinderDocumentManagerOptions
): JobFinderDocumentManager {
  return {
    listResumeTemplates() {
      return resumeTemplates
    },
    async renderResumeArtifact(input) {
      await mkdir(options.outputDirectory, { recursive: true })

      const artifactBaseName = `${Date.now()}_${sanitizeSegment(input.profile.fullName)}_${sanitizeSegment(input.job.company)}_${sanitizeSegment(input.settings.resumeTemplateId)}`
      const htmlFileName = `${artifactBaseName}.html`
      const htmlPath = path.join(options.outputDirectory, htmlFileName)
      const html = renderTemplateHtml(input)

      const requestedFormat = input.settings.resumeFormat === 'html' ? 'html' : 'pdf'

      if (requestedFormat === 'html') {
        const targetPath = input.targetPath ?? htmlPath
        const fileName = path.basename(targetPath)
        await writeFile(targetPath, html, 'utf8')

        return {
          fileName,
          storagePath: targetPath,
          format: 'html',
          intermediateFileName: fileName,
          intermediateStoragePath: targetPath,
          pageCount: null,
          warnings: [],
        }
      }

      const pdfFileName = `${artifactBaseName}.pdf`
      const pdfPath = input.targetPath ?? path.join(options.outputDirectory, pdfFileName)
      const outputFileName = path.basename(pdfPath)
      await renderPdfFromHtml(html, htmlPath, pdfPath)
      const pageCount = await getPdfPageCount(pdfPath)

      return {
        fileName: outputFileName,
        storagePath: pdfPath,
        format: 'pdf',
        intermediateFileName: htmlFileName,
        intermediateStoragePath: htmlPath,
        pageCount,
        warnings: [],
      }
    }
  }
}
