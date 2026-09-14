import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BrowserWindow } from "electron";
import type { JobFinderDocumentManager } from "@unemployed/job-finder";

import { getPdfPageCount } from "./resume-document";
import {
  listLocalResumeTemplates,
  renderResumeTemplateHtml,
  sanitizeSegment,
} from "../../shared/job-finder-resume-renderer";

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

/**
 * A letter on a page: the text, in paragraphs, with ordinary margins.
 *
 * Deliberately plain. A letter that looks like a letter is what an employer
 * expects; anything more decorative reads as generated.
 */
function renderLetterHtml(text: string, authorName: string): string {
  const paragraphs = text
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p>${escapeHtml(paragraph).replace(/\n/gu, "<br />")}</p>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(authorName)} — cover letter</title>
    <style>
      @page { size: Letter; margin: 22mm 20mm; }
      body {
        font-family: Georgia, "Times New Roman", serif;
        font-size: 11.5pt;
        line-height: 1.55;
        color: #111;
        margin: 0;
      }
      p { margin: 0 0 12pt; }
    </style>
  </head>
  <body>
${paragraphs}
  </body>
</html>`;
}

interface CreateLocalJobFinderDocumentManagerOptions {
  outputDirectory: string;
  previewTestMode?: "ok" | "fail_once";
}

function throwIfPreviewAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  throw new DOMException("Resume preview was superseded.", "AbortError");
}

async function renderPdfFromHtml(
  html: string,
  htmlPath: string,
  targetPath: string,
): Promise<void> {
  const exportWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await writeFile(htmlPath, html, "utf8");
    await exportWindow.loadFile(htmlPath);
    await exportWindow.webContents.executeJavaScript(
      "new Promise((resolve) => { if (document.fonts?.ready) { document.fonts.ready.finally(resolve); } else { resolve(); } })",
      true,
    );

    const pdfBuffer = await exportWindow.webContents.printToPDF({
      margins: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      },
      printBackground: true,
      pageSize: "Letter",
      preferCSSPageSize: true,
    });

    await writeFile(targetPath, pdfBuffer);
  } finally {
    if (!exportWindow.isDestroyed()) {
      exportWindow.destroy();
    }
  }
}

export function createLocalJobFinderDocumentManager(
  options: CreateLocalJobFinderDocumentManagerOptions,
): JobFinderDocumentManager {
  let shouldFailNextPreview = options.previewTestMode === "fail_once";

  return {
    listResumeTemplates() {
      return listLocalResumeTemplates();
    },
    renderResumePreview(input, signal) {
      throwIfPreviewAborted(signal);
      if (shouldFailNextPreview) {
        shouldFailNextPreview = false;
        throw new Error("Preview rendering failed in desktop test mode.");
      }

      const html = renderResumeTemplateHtml(input, { mode: "preview" });
      throwIfPreviewAborted(signal);

      return Promise.resolve({
        html,
        warnings: [],
      });
    },
    /**
     * Renders the letter through the same window-and-print path the resume
     * export uses, so a letter and the resume beside it are produced the same
     * way and land in the same place.
     *
     * A form that insists on .docx gets nothing: there is no Word writer here,
     * and sending a PDF under a .docx name would be a lie the person would
     * only discover after applying.
     */
    async renderLetterArtifact(input) {
      if (input.fileType === "docx") {
        return {
          ok: false,
          reason:
            "This form asks for a Word file, and Job Finder can only produce a PDF.",
        };
      }

      await mkdir(options.outputDirectory, { recursive: true });
      const baseName = `${Date.now()}_${sanitizeSegment(input.profile.fullName ?? "")}_${sanitizeSegment(input.job.company)}_letter`;
      const htmlPath = path.join(options.outputDirectory, `${baseName}.html`);
      const pdfPath = path.join(options.outputDirectory, `${baseName}.pdf`);

      await renderPdfFromHtml(
        renderLetterHtml(input.text, input.profile.fullName ?? ""),
        htmlPath,
        pdfPath,
      );
      const sha256 = createHash("sha256")
        .update(await readFile(pdfPath))
        .digest("hex");

      return {
        ok: true,
        fileName: path.basename(pdfPath),
        mimeType: "application/pdf",
        storagePath: pdfPath,
        sha256,
      };
    },
    async renderResumeArtifact(input) {
      await mkdir(options.outputDirectory, { recursive: true });

      const artifactBaseName = `${Date.now()}_${sanitizeSegment(input.profile.fullName ?? "")}_${sanitizeSegment(input.job.company)}_${sanitizeSegment(input.templateId)}`;
      const htmlFileName = `${artifactBaseName}.html`;
      const htmlPath = path.join(options.outputDirectory, htmlFileName);
      const html = renderResumeTemplateHtml(input);

      const requestedFormat =
        input.settings.resumeFormat === "html" ? "html" : "pdf";

      if (requestedFormat === "html") {
        const targetPath = input.targetPath ?? htmlPath;
        const fileName = path.basename(targetPath);
        await writeFile(targetPath, html, "utf8");
        const sha256 = createHash("sha256")
          .update(await readFile(targetPath))
          .digest("hex");

        return {
          fileName,
          storagePath: targetPath,
          sha256,
          format: "html",
          intermediateFileName: fileName,
          intermediateStoragePath: targetPath,
          pageCount: null,
          warnings: [],
        };
      }

      const pdfFileName = `${artifactBaseName}.pdf`;
      const pdfPath =
        input.targetPath ?? path.join(options.outputDirectory, pdfFileName);
      const outputFileName = path.basename(pdfPath);
      await renderPdfFromHtml(html, htmlPath, pdfPath);
      const pageCount = await getPdfPageCount(pdfPath);
      const sha256 = createHash("sha256")
        .update(await readFile(pdfPath))
        .digest("hex");

      return {
        fileName: outputFileName,
        storagePath: pdfPath,
        sha256,
        format: "pdf",
        intermediateFileName: htmlFileName,
        intermediateStoragePath: htmlPath,
        pageCount,
        warnings: [],
      };
    },
  };
}
