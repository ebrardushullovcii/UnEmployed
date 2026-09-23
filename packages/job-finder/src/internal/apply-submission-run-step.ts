import { readFile } from "node:fs/promises";

import type {
  ApplicationAuthorityEnvelope,
  ApplicationResumeArtifact,
  JobSource,
} from "@unemployed/contracts";

import type { SubmissionPreflightLineageFacts } from "./application-submission-preflight";
import { runApplicationSubmissionRuntime } from "./application-submission-runtime";
import {
  describeSubmissionOutcome,
  submitPreparedApplication,
  type ApplySubmissionHandoff,
} from "./apply-submission-handoff";
import type { WorkspaceServiceContext } from "./workspace-service-context";

/**
 * Sending a prepared application from inside an apply run.
 *
 * Only reached when the person's saved permission covers sending this exact
 * application on its own. Everything else — filling in and stopping, or
 * filling in and waiting for them — never gets here.
 *
 * The browser must still be holding the page it just filled in. When it is
 * not, nothing is sent and the application stays as it was prepared, which is
 * the safe outcome rather than an error worth surfacing.
 */
export interface ApplySendAttempt {
  /** True only when a send was actually attempted. */
  sent: boolean;
  /** True only when the employer site confirmed receipt. */
  confirmedSubmitted: boolean;
  /**
   * True when the browser was no longer holding the page. Nothing was sent and
   * the application has to be prepared again before it can be.
   */
  pageClosed: boolean;
  summary: string;
  detail: string;
  nextActionLabel: string;
}

/**
 * The browser let go of the page before this could be sent.
 *
 * Said plainly rather than swallowed: an application the person expected to go
 * out did not, and the reason is one they can act on.
 */
const PAGE_CLOSED_ATTEMPT: ApplySendAttempt = {
  sent: false,
  confirmedSubmitted: false,
  pageClosed: true,
  summary: "The application page was closed",
  detail:
    "The application page was closed before you reviewed it. Prepare it again to continue.",
  nextActionLabel: "Prepare again",
};

export async function sendPreparedApplicationIfAllowed(input: {
  ctx: Pick<WorkspaceServiceContext, "repository" | "browserRuntime">;
  handoff: ApplySubmissionHandoff | null;
  envelope: ApplicationAuthorityEnvelope | null;
  source: JobSource;
  lineage: SubmissionPreflightLineageFacts;
  resumeArtifact: ApplicationResumeArtifact;
  siteLabel: string;
  signal?: AbortSignal;
}): Promise<ApplySendAttempt | null> {
  if (input.handoff?.status !== "send_now" || !input.envelope) {
    return null;
  }

  // The runtime keeps its own page; these stay bound to it.
  const runtime = input.ctx.browserRuntime;
  if (
    !runtime.observeApplicationForm ||
    !runtime.executeExactlyOneFinalAction
  ) {
    return PAGE_CLOSED_ATTEMPT;
  }
  if (
    runtime.hasApplicationPageBinding &&
    !(await runtime.hasApplicationPageBinding(
      input.source,
      input.lineage.resultId,
    ))
  ) {
    return PAGE_CLOSED_ATTEMPT;
  }

  const result = await submitPreparedApplication({
    repository: input.ctx.repository,
    browserRuntime: {
      observeApplicationForm: (source, options) =>
        runtime.observeApplicationForm!(source, options),
      executeExactlyOneFinalAction: (source, actionInput) =>
        runtime.executeExactlyOneFinalAction!(source, actionInput),
    },
    source: input.source,
    envelope: input.envelope,
    lineage: input.lineage,
    ...(input.handoff.confirmedByPerson ? { confirmedByPerson: true } : {}),
    loadResumeBytes: async () =>
      new Uint8Array(await readFile(input.resumeArtifact.filePath)),
    now: new Date().toISOString(),
    ...(input.signal ? { signal: input.signal } : {}),
    runSubmission: runApplicationSubmissionRuntime,
  });

  const told = describeSubmissionOutcome({
    result,
    siteLabel: input.siteLabel,
  });
  return {
    sent:
      result.status === "submitted" || result.status === "outcome_uncertain",
    confirmedSubmitted: result.status === "submitted",
    pageClosed: false,
    ...told,
  };
}
