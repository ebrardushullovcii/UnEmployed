import type { ApplyAgentResult } from "@unemployed/browser-agent";
import {
  ApplyExecutionResultSchema,
  type ApplicationAuthorityEnvelope,
  type ApplicationAutomationMode,
  type ApplyExecutionResult,
} from "@unemployed/contracts";

import type {
  SubmissionPreflightCapacityFacts,
  SubmissionPreflightLineageFacts,
} from "./application-submission-preflight";
import type {
  ApplicationSubmissionBrowserRuntime,
  ApplicationSubmissionRuntimeInput,
  ApplicationSubmissionRuntimeResult,
} from "./application-submission-runtime";
import type { SyntheticSubmissionAuthorityRepository } from "./application-submission-orchestrator";

/**
 * Handing a filled-in application over to be sent.
 *
 * The loop that fills a form never presses send. When the form is complete and
 * the person's saved permission covers this exact application, the one
 * irreversible click goes through the submission path instead, which records
 * the attempt before it happens, refuses to repeat itself, and never claims an
 * outcome the employer's site did not give.
 *
 * This module decides whether that handover happens at all and builds the
 * facts it needs; it performs no browser action itself.
 */

export type ApplySubmissionHandoff =
  | {
      status: "not_ready";
      /** One plain sentence about why nothing was sent. */
      reason: string;
    }
  | {
      status: "awaiting_your_review";
      reason: string;
      finalAction: { actionRef: string; actionLabel: string };
    }
  | {
      status: "send_now";
      finalAction: { actionRef: string; actionLabel: string };
      envelope: ApplicationAuthorityEnvelope;
    };

/**
 * Whether this prepared application should be sent, left for the person, or
 * neither.
 *
 * `confirm_before_submit` deliberately stops here with the send button already
 * identified: the person opens the review, and pressing send runs the same
 * path this would have.
 */
export function decideApplySubmissionHandoff(input: {
  result: ApplyAgentResult;
  mode: ApplicationAutomationMode;
  envelope: ApplicationAuthorityEnvelope | null;
  siteLabel: string;
}): ApplySubmissionHandoff {
  const { result } = input;

  if (result.pauses.length > 0) {
    return {
      status: "not_ready",
      reason:
        result.pauses[0]?.summary ??
        "This application needs you before it can be sent.",
    };
  }

  if (!result.readyToSend) {
    return {
      status: "not_ready",
      reason: `Job Finder filled this application in on ${input.siteLabel} and stopped; nothing was sent.`,
    };
  }

  if (input.mode === "confirm_before_submit") {
    return {
      status: "awaiting_your_review",
      reason: `This application is filled in and ready. Look it over and send it when you are happy with it.`,
      finalAction: result.readyToSend,
    };
  }

  if (input.mode !== "autonomous_submit" || !input.envelope) {
    return {
      status: "not_ready",
      reason: `Job Finder filled this application in on ${input.siteLabel} and stopped; nothing was sent.`,
    };
  }

  return {
    status: "send_now",
    finalAction: result.readyToSend,
    envelope: input.envelope,
  };
}

export interface ApplySubmissionFacts {
  repository: SyntheticSubmissionAuthorityRepository;
  browserRuntime: ApplicationSubmissionBrowserRuntime;
  source: Parameters<
    ApplicationSubmissionBrowserRuntime["observeApplicationForm"]
  >[0];
  envelope: ApplicationAuthorityEnvelope;
  lineage: SubmissionPreflightLineageFacts;
  capacity: SubmissionPreflightCapacityFacts;
  resumeBytes: Uint8Array;
  idempotencyKey: string;
  preflightId: string;
  now: string;
  signal?: AbortSignal;
}

/**
 * Runs the submission path for one prepared application.
 *
 * Everything that makes a submission safe already lives behind
 * `runApplicationSubmissionRuntime`: it rereads the saved permission at the
 * last instant, writes the preflight before acting, allows exactly one attempt
 * per key, and records an uncertain outcome as uncertain forever.
 */
export async function sendPreparedApplication(
  facts: ApplySubmissionFacts,
  runSubmission: (
    input: ApplicationSubmissionRuntimeInput,
  ) => Promise<ApplicationSubmissionRuntimeResult>,
): Promise<ApplicationSubmissionRuntimeResult> {
  const policy = facts.envelope.decisionPolicy;
  return runSubmission({
    repository: facts.repository,
    browserRuntime: facts.browserRuntime,
    source: facts.source,
    savedMode: facts.envelope.mode,
    authorityEnvelopeId: facts.envelope.id,
    authorityRevision: facts.envelope.revision,
    preflightId: facts.preflightId,
    idempotencyKey: facts.idempotencyKey,
    lineage: facts.lineage,
    resumeBytes: facts.resumeBytes,
    answers: policy
      ? policy.answerPolicy.approvedAnswerSnapshot
      : { revision: 1, digest: "0".repeat(64) },
    capacity: facts.capacity,
    currentPolicyFacts: {
      policy: policy
        ? {
            version: policy.version,
            revision: policy.revision,
            digest: policy.digest,
          }
        : null,
      answers: policy
        ? policy.answerPolicy.approvedAnswerSnapshot
        : { revision: 1, digest: "0".repeat(64) },
      mandatoryStops: [],
    },
    now: facts.now,
    ...(facts.signal ? { signal: facts.signal } : {}),
  });
}

/**
 * What the person is told after a submission attempt.
 *
 * A browser click is never proof that an employer received anything, so a
 * sent application is only ever "we sent it, check the site" until the person
 * confirms it themselves. Nothing here ever offers to try again: an attempt
 * whose outcome is unknown must not be repeated.
 */
export function describeSubmissionOutcome(input: {
  result: ApplicationSubmissionRuntimeResult;
  siteLabel: string;
  /**
   * Whether the page showed the words a site uses after taking an
   * application. Descriptive only: it changes what the person is told, never
   * whether the outcome counts as confirmed.
   */
  confirmationSeen?: boolean;
}): { summary: string; detail: string; nextActionLabel: string } {
  switch (input.result.status) {
    case "outcome_uncertain":
      return input.confirmationSeen
        ? {
            summary: "Submitted — confirmation seen",
            detail: `Job Finder sent this application to ${input.siteLabel} and its page then showed a confirmation. That is what was on screen, not proof the employer received it, so it counts as unconfirmed until you check. Job Finder will not send it again.`,
            nextActionLabel: "Check the site and confirm",
          }
        : {
            summary: "Sent — check it arrived",
            detail: `Job Finder sent this application to ${input.siteLabel}. Its site did not confirm it arrived, and Job Finder will not send it again. Open ${input.siteLabel} to check, then tell Job Finder what you found.`,
            nextActionLabel: "Check the site and confirm",
          };
    case "recorded_not_submitted":
      return {
        summary: "Not sent",
        detail: `Nothing was sent to ${input.siteLabel}. The application is filled in and waiting for you.`,
        nextActionLabel: "Open the application and finish it",
      };
    default:
      return {
        summary: "Not sent",
        detail: `Job Finder did not send this application to ${input.siteLabel}, and nothing on the site was changed.`,
        nextActionLabel: "Open the application and finish it",
      };
  }
}

/**
 * The safety net around one prepared application's result.
 *
 * A run that was only allowed to fill the form in must never come back saying
 * it sent anything. A run that was allowed to send still comes back
 * unsubmitted from this path, because the sending itself happens afterwards,
 * through the submission runtime — so the same check holds either way.
 */
export function enforceResolvedApplyAuthorityResult(
  authority: { mode: ApplicationAutomationMode },
  result: ApplyExecutionResult,
): ApplyExecutionResult {
  const parsed = ApplyExecutionResultSchema.parse(result);
  if (
    parsed.state === "submitted" ||
    parsed.submittedAt !== null ||
    parsed.outcome === "submitted"
  ) {
    throw new Error(
      `An application preparation running as '${authority.mode}' reported a submitted outcome. Preparation never sends anything; only the submission path can.`,
    );
  }
  return parsed;
}

/** The stable name for one application's single submission attempt. */
export function applySubmissionIdempotencyKey(lineage: {
  runId: string;
  jobId: string;
  resultId: string;
}): string {
  return `submission_${lineage.runId}_${lineage.jobId}_${lineage.resultId}`;
}

export function applySubmissionPreflightId(lineage: {
  runId: string;
  jobId: string;
  resultId: string;
}): string {
  return `preflight_${lineage.runId}_${lineage.jobId}_${lineage.resultId}`;
}

/**
 * How much of the person's allowance is left.
 *
 * Counted from attempts that actually happened rather than from intentions, so
 * a run that was interrupted does not quietly spend a slot. Both numbers stop
 * at zero: a negative allowance is still no allowance.
 */
export function deriveApplySubmissionCapacity(input: {
  envelope: ApplicationAuthorityEnvelope;
  outcomes: readonly {
    runId: string;
    attemptedAt: string;
  }[];
  runId: string;
  now: string;
}): SubmissionPreflightCapacityFacts {
  const attemptedToday = (() => {
    const now = new Date(input.now);
    if (Number.isNaN(now.getTime())) {
      return input.outcomes.length;
    }
    const dayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const dayEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    ).getTime();
    return input.outcomes.filter((outcome) => {
      const at = Date.parse(outcome.attemptedAt);
      return Number.isFinite(at) && at >= dayStart && at < dayEnd;
    }).length;
  })();

  const attemptedInRun = input.outcomes.filter(
    (outcome) => outcome.runId === input.runId,
  ).length;

  return {
    remainingRunCapacity: Math.max(
      0,
      input.envelope.maxApplicationsPerRun - attemptedInRun,
    ),
    remainingDailyCapacity: Math.max(
      0,
      input.envelope.maxApplicationsPerLocalDay - attemptedToday,
    ),
  };
}

export type SubmitPreparedApplicationRepository =
  SyntheticSubmissionAuthorityRepository & {
    listSubmissionOutcomeRecords: (options?: {
      jobId?: string;
    }) => Promise<
      readonly { runId: string; attemptedAt: string }[]
    >;
  };

/**
 * Sends one prepared application, gathering the facts the submission path
 * needs at the moment it is asked.
 *
 * Both ways of sending come through here: the run loop calls it itself when
 * the person allowed that, and the "Submit application" action calls it when
 * they chose to look first. Same checks, same record, same single attempt.
 */
export async function submitPreparedApplication(input: {
  repository: SubmitPreparedApplicationRepository;
  browserRuntime: ApplicationSubmissionBrowserRuntime;
  source: ApplySubmissionFacts["source"];
  envelope: ApplicationAuthorityEnvelope;
  lineage: SubmissionPreflightLineageFacts;
  loadResumeBytes: () => Promise<Uint8Array>;
  now: string;
  signal?: AbortSignal;
  runSubmission: (
    runtimeInput: ApplicationSubmissionRuntimeInput,
  ) => Promise<ApplicationSubmissionRuntimeResult>;
}): Promise<ApplicationSubmissionRuntimeResult> {
  const outcomes = await input.repository.listSubmissionOutcomeRecords();
  const capacity = deriveApplySubmissionCapacity({
    envelope: input.envelope,
    outcomes,
    runId: input.lineage.runId,
    now: input.now,
  });

  return sendPreparedApplication(
    {
      repository: input.repository,
      browserRuntime: input.browserRuntime,
      source: input.source,
      envelope: input.envelope,
      lineage: input.lineage,
      capacity,
      resumeBytes: await input.loadResumeBytes(),
      idempotencyKey: applySubmissionIdempotencyKey(input.lineage),
      preflightId: applySubmissionPreflightId(input.lineage),
      now: input.now,
      ...(input.signal ? { signal: input.signal } : {}),
    },
    input.runSubmission,
  );
}
