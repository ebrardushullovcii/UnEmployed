import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import type { JobFinderDocumentManager } from '@unemployed/job-finder'

import { getPdfPageCount } from './resume-document'
import {
  listLocalResumeTemplates,
  renderResumeTemplateHtml,
  sanitizeSegment,
} from './job-finder-resume-renderer'

interface CreateLocalJobFinderDocumentManagerOptions {
  outputDirectory: string
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
      return listLocalResumeTemplates()
    },
    async renderResumeArtifact(input) {
      await mkdir(options.outputDirectory, { recursive: true })

      const artifactBaseName = `${Date.now()}_${sanitizeSegment(input.profile.fullName)}_${sanitizeSegment(input.job.company)}_${sanitizeSegment(input.templateId)}`
      const htmlFileName = `${artifactBaseName}.html`
      const htmlPath = path.join(options.outputDirectory, htmlFileName)
      const html = renderResumeTemplateHtml(input)

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
