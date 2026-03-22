import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ResumeTemplateDefinition } from '@unemployed/contracts'
import type { JobFinderDocumentManager } from '@unemployed/job-finder'

interface CreateLocalJobFinderDocumentManagerOptions {
  outputDirectory: string
}

const resumeTemplates: ResumeTemplateDefinition[] = [
  {
    id: 'classic_ats',
    label: 'Classic ATS',
    description: 'Single-column, conservative, and recruiter-friendly for high parsing reliability.'
  },
  {
    id: 'modern_split',
    label: 'Modern Split',
    description: 'Balanced two-column layout with a lightweight sidebar for skills and contact details.'
  },
  {
    id: 'compact_exec',
    label: 'Compact Executive',
    description: 'Dense summary-first layout for senior roles that need a concise leadership snapshot.'
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

function renderSection(title: string, lines: readonly string[]): string {
  if (lines.length === 0) {
    return ''
  }

  return `
    <section class="section-block">
      <h3>${escapeHtml(title)}</h3>
      ${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
    </section>
  `
}

function renderList(title: string, values: readonly string[]): string {
  if (values.length === 0) {
    return ''
  }

  return `
    <section class="section-block">
      <h3>${escapeHtml(title)}</h3>
      <ul>
        ${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}
      </ul>
    </section>
  `
}

function renderTemplateHtml(input: Parameters<JobFinderDocumentManager['renderResumeArtifact']>[0]): string {
  const summary = input.previewSections.find((section) => section.heading === 'Summary')?.lines ?? []
  const experience = input.previewSections.find((section) => section.heading === 'Experience Highlights')?.lines ?? []
  const coreSkills = input.previewSections.find((section) => section.heading === 'Core Skills')?.lines ?? []
  const targetedKeywords = input.previewSections.find((section) => section.heading === 'Targeted Keywords')?.lines ?? []
  const templateId = input.settings.resumeTemplateId
  const fontFamily = formatFontFamily(input.settings.fontPreset)
  const contactItems = [input.profile.email, input.profile.phone, input.profile.portfolioUrl, input.profile.linkedinUrl].filter(
    (value): value is string => Boolean(value)
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
    h1, h2, h3, p, ul { margin: 0; }
    h1 { font-size: 1.9rem; line-height: 1.05; letter-spacing: -0.03em; }
    h2 { font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--muted); }
    h3 { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.15em; color: var(--accent); margin-bottom: 0.35rem; }
    p, li { font-size: 0.92rem; line-height: 1.45; }
    ul { padding-left: 1.1rem; display: grid; gap: 0.2rem; }
    .header { display: grid; gap: 0.28rem; padding-bottom: 0.55rem; border-bottom: 1px solid var(--line); }
    .headline { font-size: 1rem; color: var(--muted); }
    .meta { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; color: var(--muted); }
    .target-role { margin-top: 0.5rem; padding: 0.5rem 0.65rem; background: var(--surface); border-left: 3px solid var(--accent); }
    .section-stack { display: grid; gap: 0.85rem; margin-top: 0.9rem; }
    .section-block { display: grid; gap: 0.35rem; }
    .sidebar-card { background: var(--surface); border: 1px solid var(--line); padding: 0.7rem; display: grid; gap: 0.8rem; }
    .tag-grid { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .tag { padding: 0.24rem 0.48rem; border: 1px solid var(--line); border-radius: 999px; font-size: 0.76rem; }
    .body-grid { display: grid; gap: 0.95rem; margin-top: 1rem; }
  `

  if (templateId === 'modern_split') {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(input.profile.fullName)} Resume</title>
    <style>
      ${sharedStyles}
      .body-grid { grid-template-columns: 1.6fr 0.9fr; align-items: start; }
    </style>
  </head>
  <body>
    <article class="page">
      <header class="header">
        <h1>${escapeHtml(input.profile.fullName)}</h1>
        <p class="headline">${escapeHtml(input.profile.headline)}</p>
        <div class="meta">
          <span>${escapeHtml(input.profile.currentLocation)}</span>
          ${contactItems.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
        </div>
        <div class="target-role">
          <h2>Target Role</h2>
          <p>${escapeHtml(input.job.title)} at ${escapeHtml(input.job.company)}</p>
        </div>
      </header>
      <div class="body-grid">
        <main class="section-stack">
          ${renderSection('Summary', summary)}
          ${renderSection('Experience Highlights', experience)}
        </main>
        <aside class="sidebar-card">
          ${renderList('Core Skills', coreSkills)}
          ${renderList('Targeted Keywords', targetedKeywords)}
        </aside>
      </div>
    </article>
  </body>
</html>`
  }

  if (templateId === 'compact_exec') {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(input.profile.fullName)} Resume</title>
    <style>
      ${sharedStyles}
      .summary-band { margin-top: 0.9rem; padding: 0.75rem; background: var(--surface); border: 1px solid var(--line); }
      .body-grid { grid-template-columns: 1fr; }
    </style>
  </head>
  <body>
    <article class="page">
      <header class="header">
        <h1>${escapeHtml(input.profile.fullName)}</h1>
        <p class="headline">${escapeHtml(input.profile.headline)}</p>
        <div class="meta">
          <span>${escapeHtml(input.profile.currentLocation)}</span>
          ${contactItems.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
        </div>
      </header>
      <section class="summary-band">
        <h2>Target Role</h2>
        <p>${escapeHtml(input.job.title)} at ${escapeHtml(input.job.company)}</p>
        ${summary.map((line) => `<p style="margin-top:0.45rem;">${escapeHtml(line)}</p>`).join('')}
      </section>
      <div class="body-grid">
        ${renderSection('Experience Highlights', experience)}
        ${renderList('Core Skills', coreSkills)}
        ${renderList('Targeted Keywords', targetedKeywords)}
      </div>
    </article>
  </body>
</html>`
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(input.profile.fullName)} Resume</title>
    <style>
      ${sharedStyles}
      .body-grid { grid-template-columns: 1fr; }
    </style>
  </head>
  <body>
    <article class="page">
      <header class="header">
        <h1>${escapeHtml(input.profile.fullName)}</h1>
        <p class="headline">${escapeHtml(input.profile.headline)}</p>
        <div class="meta">
          <span>${escapeHtml(input.profile.currentLocation)}</span>
          ${contactItems.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
        </div>
        <div class="target-role">
          <h2>Target Role</h2>
          <p>${escapeHtml(input.job.title)} at ${escapeHtml(input.job.company)}</p>
        </div>
      </header>
      <div class="body-grid">
        ${renderSection('Summary', summary)}
        ${renderSection('Experience Highlights', experience)}
        ${renderList('Core Skills', coreSkills)}
        ${renderList('Targeted Keywords', targetedKeywords)}
      </div>
    </article>
  </body>
</html>`
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

      const fileName = `${Date.now()}_${sanitizeSegment(input.profile.fullName)}_${sanitizeSegment(input.job.company)}_${sanitizeSegment(input.settings.resumeTemplateId)}.html`
      const targetPath = path.join(options.outputDirectory, fileName)
      const html = renderTemplateHtml(input)

      await writeFile(targetPath, html, 'utf8')

      return {
        fileName,
        storagePath: targetPath
      }
    }
  }
}
