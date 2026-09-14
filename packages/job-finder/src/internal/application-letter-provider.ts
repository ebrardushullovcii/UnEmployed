import type { ApplyDocument, ApplyLetterProvider } from "@unemployed/browser-agent";
import type { CoverLetterPreference } from "@unemployed/contracts";

/**
 * The letter one application sends.
 *
 * Written once, kept for the rest of the run, and handed back unchanged
 * however the form asks for it. A form with a file field and a form with a
 * text box are the same request, and a person must never discover they sent
 * two different letters for the same job.
 *
 * The letter is rendered by whoever owns document rendering, and stored beside
 * the resume that went with it, as the exact bytes that were sent.
 */

export interface ApplicationLetterRenderRequest {
  text: string;
  /** The type the form insisted on, or null when it did not care. */
  fileType: "pdf" | "docx" | null;
  jobId: string;
  applicationId: string;
}

export type ApplicationLetterRenderResult =
  | {
      ok: true;
      fileName: string;
      mimeType: string;
      /** The exact bytes that go to the employer and into the library. */
      loadBytes: () => Promise<Uint8Array>;
    }
  | { ok: false; reason: string };

export interface ApplicationLetterDependencies {
  /** Writes the letter. Returns null when no model is available. */
  writeLetter: (input: {
    prompt: string;
    signal?: AbortSignal;
  }) => Promise<string | null>;
  /**
   * Renders the letter to a file and stores it beside the resume. Omitted when
   * this run has no way to render one, in which case a form that wants a file
   * pauses for the person.
   */
  renderLetter?: (
    input: ApplicationLetterRenderRequest,
  ) => Promise<ApplicationLetterRenderResult>;
  preference: CoverLetterPreference;
  application: { jobId: string; applicationId: string };
  signal?: AbortSignal;
}

export function createApplicationLetterProvider(
  dependencies: ApplicationLetterDependencies,
): ApplyLetterProvider {
  // One application, one letter: written on first ask, reused after.
  let writtenText: string | null = null;
  const renderedByType = new Map<string, ApplyDocument>();

  return {
    preference: dependencies.preference,
    provide: async (request) => {
      if (writtenText === null) {
        const written = await dependencies.writeLetter({
          prompt: request.prompt,
          ...(dependencies.signal ? { signal: dependencies.signal } : {}),
        });
        if (!written?.trim()) {
          return {
            ok: false,
            reason:
              "Its assistant is unavailable right now, so nothing was attached. Try this application again shortly.",
          };
        }
        writtenText = written.trim();
      }

      if (request.delivery === "text") {
        return { ok: true, text: writtenText, document: null };
      }

      const typeKey = request.fileType ?? "any";
      const alreadyRendered = renderedByType.get(typeKey);
      if (alreadyRendered) {
        return { ok: true, text: writtenText, document: alreadyRendered };
      }

      if (!dependencies.renderLetter) {
        return { ok: true, text: writtenText, document: null };
      }

      const rendered = await dependencies.renderLetter({
        text: writtenText,
        fileType: request.fileType,
        jobId: dependencies.application.jobId,
        applicationId: dependencies.application.applicationId,
      });
      if (!rendered.ok) {
        return { ok: true, text: writtenText, document: null };
      }

      const document: ApplyDocument = {
        id: `document_letter_${dependencies.application.jobId}_${typeKey}`,
        fileName: rendered.fileName,
        mimeType: rendered.mimeType,
        label: "Cover letter",
        kind: "cover_letter",
        loadBytes: rendered.loadBytes,
      };
      renderedByType.set(typeKey, document);
      return { ok: true, text: writtenText, document };
    },
  };
}
