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
