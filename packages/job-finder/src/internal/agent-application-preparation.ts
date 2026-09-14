import {
  createApplyPageHands,
  runApplyAgent,
  type ApplyAgentResult,
  type ApplyAuthority,
  type ApplyDocument,
  type LLMClient,
} from "@unemployed/browser-agent";
import {
  buildPreparationResult,
  loadVerifiedResumeBytes,
  type ExecuteApplicationFlowInput,
} from "@unemployed/browser-runtime";

/** The application facts, without the callback that is about to use them. */
export type ApplyPreparationInput = Omit<
  ExecuteApplicationFlowInput,
  "prepareApplicationForm"
>;
import { createApplicationLetterProvider } from "./application-letter-provider";
import {
  decideApplySubmissionHandoff,
  type ApplySubmissionHandoff,
} from "./apply-submission-handoff";
import type { RenderedLetterArtifact } from "./workspace-service-contracts";
import type { ApplicationLetterDependencies } from "./application-letter-provider";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  ApplicationReviewCardSchema,
  CoverLetterPreferenceSchema,
} from "@unemployed/contracts";
import type {
  ApplicationAuthorityEnvelope,
  ApplyPageSession,
  ApplicationAttemptBlocker,
  ApplicationAttemptCheckpoint,
  ApplicationAttemptQuestion,
  ApplyExecutionResult,
  ApplicationReviewCard,
  CandidateProfile,
  JobFinderSettings,
  SavedJob,
} from "@unemployed/contracts";
/**
 * Runs one application through the agent loop and reports it the way the rest
 * of the product already expects.
 *
 * Workflow decisions live in `browser-agent` and browser mechanics live in
 * `browser-runtime`; this is the seam Job Finder owns between them. It
 * verifies the resume bytes, installs the guard that stops a prepare-only run
 * from transmitting anything, hands the agent a page, and turns what comes
 * back into the application record that gets persisted.
 */

export interface AgentApplicationPreparationInput {
  /**
   * The open application page, with its safety mechanics. Playwright's `Page`
   * never crosses this boundary: the browser layer keeps it.
   */
  session: ApplyPageSession;
  /** The saved permission this run works inside, when there is one. */
  envelope?: ApplicationAuthorityEnvelope | null;
  executionInput: ApplyPreparationInput;
  llmClient: LLMClient;
  startedAt: string;
  /** What the person would call this site. */
  siteLabel: string;
  /**
   * Writes and renders the letter this application sends. Omitted when the
   * caller has no way to produce one, in which case a form that asks for a
   * letter pauses for the person.
   */
  letters?: Omit<ApplicationLetterDependencies, "application" | "signal">;
  /**
   * Told what the finished form amounts to, so the run loop can hand it to the
   * submission path without re-deriving it from the persisted record.
   */
  onPrepared?: (outcome: {
    result: ApplyAgentResult;
    handoff: ApplySubmissionHandoff;
    reviewCard: ApplicationReviewCard;
  }) => void;
  signal?: AbortSignal;
  now?: () => Date;
}

function toApplyAuthority(
  executionInput: ApplyPreparationInput,
): ApplyAuthority {
  const submitAuthorized = executionInput.submitAuthorized === true;
  const mode =
    executionInput.applyAutomationMode ??
    (executionInput.mode === "submit_when_ready" && submitAuthorized
      ? "autonomous_submit"
      : "prepare_only");
  return {
    mode,
    // Confirm-first works the form all the way to its send button but is never
    // itself allowed to press it.
    submitAuthorized: mode === "autonomous_submit" && submitAuthorized,
    preApprovedAttestationKinds:
      executionInput.preApprovedAttestationKinds ?? [],
    salaryDisclosure: executionInput.salaryDisclosure ?? "pause_for_user",
    allowedOrigins: executionInput.applyAllowedOrigins ?? [],
  };
}

function toApplyDocuments(
  executionInput: ApplyPreparationInput,
): ApplyDocument[] {
  const resume: ApplyDocument = {
    id: `document_resume_${executionInput.resumeArtifact.id}`,
    fileName: executionInput.resumeArtifact.fileName,
    mimeType: "application/pdf",
    label: "Your CV",
    kind: "resume",
    loadBytes: () => loadVerifiedResumeBytes(executionInput.resumeArtifact),
  };

  const attachments = (executionInput.applicationAttachments ?? []).map(
    (attachment): ApplyDocument => ({
      id: `document_asset_${attachment.assetId}`,
      fileName: attachment.fileName,
      mimeType: attachment.mime,
      label: attachment.prompt,
      kind: "other",
      loadBytes: () => attachment.loadVerifiedBytes(),
    }),
  );

  return [resume, ...attachments];
}

/**
 * The record only carries the blocker codes the product already acts on.
 * Anything a person has to handle themselves lands on manual review; the plain
 * sentence saying which one it was travels in `summary` and `detail`.
 */
const BLOCKER_CODES: Record<
  NonNullable<ApplyAgentResult["pauses"][number]["blocker"]>["code"],
  ApplicationAttemptBlocker["code"]
> = {
  site_login_required: "site_login_required",
  account_creation_required: "requires_manual_review",
  security_challenge: "requires_manual_review",
  multi_factor_required: "requires_manual_review",
  application_closed: "requires_manual_review",
  application_page_unreachable: "application_page_unreachable",
};

function toQuestions(result: ApplyAgentResult): ApplicationAttemptQuestion[] {
  return result.pauses
    .map((pause) => pause.question)
    .filter(
      (question): question is ApplicationAttemptQuestion => question !== null,
    );
}

function toBlocker(
  result: ApplyAgentResult,
  questions: readonly ApplicationAttemptQuestion[],
): ApplicationAttemptBlocker | null {
  const blocked = result.pauses.find((pause) => pause.blocker !== null);
  if (blocked?.blocker) {
    return {
      code: BLOCKER_CODES[blocked.blocker.code],
      userActionKind: null,
      summary: blocked.blocker.summary,
      detail: blocked.blocker.detail,
      questionIds: [],
      sourceDebugEvidenceRefIds: [],
      url: null,
    };
  }
  if (questions.length === 0) {
    return null;
  }
  const first = result.pauses.find((pause) => pause.question !== null);
  return {
    code: "missing_candidate_answer",
    userActionKind: null,
    summary: first?.summary ?? "This application needs an answer from you.",
    detail: result.reason,
    questionIds: questions.map((question) => question.id),
    sourceDebugEvidenceRefIds: [],
    url: null,
  };
}

function toCheckpoints(
  result: ApplyAgentResult,
  jobId: string,
  startedAt: string,
): ApplicationAttemptCheckpoint[] {
  return result.notes.slice(0, 40).map((note, index) => ({
    id: `checkpoint_${jobId}_agent_${index + 1}`,
    at: startedAt,
    label: "Working through the form",
    detail: note,
    state: "in_progress" as const,
    visualEvidence: [],
  }));
}

function nextActionFor(result: ApplyAgentResult): string {
  const blocked = result.pauses.find((pause) => pause.blocker !== null);
  if (blocked?.blocker) {
    return blocked.blocker.nextActionLabel;
  }
  if (result.pauses.length > 0) {
    return "Answer the question in Needs you";
  }
  return result.outcome === "awaiting_your_review"
    ? "Review it and send it"
    : "Open the application and finish it";
}

function summaryFor(result: ApplyAgentResult): string {
  switch (result.outcome) {
    case "paused":
      return "This application needs you";
    case "stuck":
      return "Job Finder could not finish this application";
    case "awaiting_your_review":
      return "Ready for you to review and send";
    default:
      return "Filled in and waiting";
  }
}

export async function runAgentApplicationPreparation(
  input: AgentApplicationPreparationInput,
): Promise<ApplyExecutionResult> {
  const { executionInput, startedAt } = input;
  const now = input.now ?? (() => new Date());

  // Nothing may leave the page during a prepare-only run. The guard goes in
  // before the agent is allowed to touch anything.
  await input.session.installPrepareOnlyGuard({
    intermediateMutationsAuthorized:
      executionInput.intermediateMutationsAuthorized === true,
    allowedOrigins: executionInput.applyAllowedOrigins ?? [],
  });

  const targetUrl =
    executionInput.job.applicationUrl ?? executionInput.job.canonicalUrl;

  const result = await runApplyAgent(
    {
      hands: createApplyPageHands(input.session, now),
      safety: input.session,
      intermediateWritesAuthorized:
        executionInput.intermediateMutationsAuthorized === true,
      authority: toApplyAuthority(executionInput),
      sources: {
        profile: executionInput.profile,
        resumeText: executionInput.profile.baseResume.textContent,
        posting: {
          title: executionInput.job.title,
          company: executionInput.job.company,
          location: executionInput.job.location,
          description: executionInput.job.description,
        },
        reusableAnswers: executionInput.profile.answerBank.customAnswers,
        documents: toApplyDocuments(executionInput),
      },
      application: {
        jobId: executionInput.job.id,
        applicationId: executionInput.idempotencyKey ?? executionInput.job.id,
        startingUrl: targetUrl,
      },
      siteLabel: input.siteLabel,
      ...(input.letters
        ? {
            letters: createApplicationLetterProvider({
              ...input.letters,
              application: {
                jobId: executionInput.job.id,
                applicationId:
                  executionInput.idempotencyKey ?? executionInput.job.id,
              },
              ...(input.signal ? { signal: input.signal } : {}),
            }),
          }
        : {}),
      now,
      ...(input.signal ? { signal: input.signal } : {}),
    },
    input.llmClient,
  );

  input.onPrepared?.({
    result,
    handoff: decideApplySubmissionHandoff({
      result,
      mode: toApplyAuthority(executionInput).mode,
      envelope: input.envelope ?? null,
      siteLabel: input.siteLabel,
    }),
    reviewCard: buildApplyReviewCard({
      result,
      siteLabel: input.siteLabel,
      preparedAt: now().toISOString(),
    }),
  });

  const questions = toQuestions(result);

  return buildPreparationResult({
    executionInput,
    state: "paused",
    summary: summaryFor(result),
    detail: result.reason,
    questions,
    blocker: toBlocker(result, questions),
    checkpoints: toCheckpoints(result, executionInput.job.id, startedAt),
    checkpointLabel: summaryFor(result),
    checkpointDetail: result.reason,
    checkpointUrls: [targetUrl, ...(result.finalUrl ? [result.finalUrl] : [])],
    lastUrl: result.finalUrl,
    now: now().toISOString(),
    nextActionLabel: nextActionFor(result),
  });
}

/**
 * What the person would call the site this application is on.
 *
 * The name they chose for the source when they added it, when there is one;
 * otherwise the site's own address, without the "www." nobody says out loud.
 */
export function resolveApplySiteLabel(input: {
  targetLabel: string | null;
  applicationUrl: string;
}): string {
  const chosen = input.targetLabel?.trim();
  if (chosen) {
    return chosen;
  }
  try {
    return new URL(input.applicationUrl).hostname.replace(/^www\./iu, "");
  } catch {
    return "this site";
  }
}

/**
 * Adapts the product's AI client to the shape the apply loop expects.
 *
 * Returns null when this build has no model available. That is an outage, not
 * something the person can configure, and the caller says so in those words.
 */
export function toApplyLlmClient(aiClient: {
  chatWithTools?: (
    messages: Parameters<LLMClient["chatWithTools"]>[0],
    tools: Parameters<LLMClient["chatWithTools"]>[1],
    options?: { signal?: AbortSignal; maxOutputTokens?: number },
  ) => ReturnType<LLMClient["chatWithTools"]>;
}): LLMClient | null {
  const chatWithTools = aiClient.chatWithTools;
  if (!chatWithTools) {
    return null;
  }
  return {
    chatWithTools: (messages, tools, options) =>
      chatWithTools(messages, tools, options ?? {}),
  };
}

/**
 * Builds the callback the browser layer calls once it has the page open.
 *
 * When this build has no model available, the application stops with an
 * outage in plain words. It is never presented as something to set up: the
 * model is part of the product, so its absence is Job Finder's problem.
 */
export function createApplyFormPreparer(input: {
  executionInput: ApplyPreparationInput;
  aiClient: Parameters<typeof toApplyLlmClient>[0];
  siteLabel: string;
  letters?:
    | Omit<ApplicationLetterDependencies, "application" | "signal">
    | undefined;
  envelope?: ApplicationAuthorityEnvelope | null;
  onPrepared?: AgentApplicationPreparationInput["onPrepared"];
  now?: () => Date;
}): NonNullable<ExecuteApplicationFlowInput["prepareApplicationForm"]> {
  return async ({ session, startedAt, signal }) => {
    const llmClient = toApplyLlmClient(input.aiClient);
    if (!llmClient) {
      const detail =
        "Job Finder could not fill this application in because its assistant is unavailable right now. Nothing was changed on the site. Try again shortly.";
      return buildPreparationResult({
        executionInput: input.executionInput,
        state: "paused",
        summary: "Job Finder could not fill this application in",
        detail,
        questions: [],
        blocker: {
          code: "requires_manual_review",
          userActionKind: null,
          summary: "Job Finder could not fill this application in.",
          detail,
          questionIds: [],
          sourceDebugEvidenceRefIds: [],
          url: null,
        },
        checkpoints: [],
        checkpointLabel: "Stopped before filling anything in",
        checkpointDetail: detail,
        checkpointUrls: [],
        lastUrl: null,
        now: (input.now ?? (() => new Date()))().toISOString(),
        nextActionLabel: "Try this application again shortly",
      });
    }

    return runAgentApplicationPreparation({
      session,
      executionInput: input.executionInput,
      llmClient,
      startedAt,
      siteLabel: input.siteLabel,
      ...(input.letters ? { letters: input.letters } : {}),
      ...(input.envelope ? { envelope: input.envelope } : {}),
      ...(input.onPrepared ? { onPrepared: input.onPrepared } : {}),
      ...(signal ? { signal } : {}),
      ...(input.now ? { now: input.now } : {}),
    });
  };
}

/**
 * Everything needed to write and render this application's letter.
 *
 * Returns undefined when neither is possible, which leaves a form asking for a
 * letter to the person rather than sending something that is not one.
 */
export function buildApplyLetterDependencies(input: {
  aiClient: {
    chatWithTools?: (
      messages: Parameters<LLMClient["chatWithTools"]>[0],
      tools: Parameters<LLMClient["chatWithTools"]>[1],
      options?: { signal?: AbortSignal },
    ) => ReturnType<LLMClient["chatWithTools"]>;
  };
  documentManager: {
    renderLetterArtifact?: (renderInput: {
      text: string;
      job: SavedJob;
      profile: CandidateProfile;
      settings: JobFinderSettings;
      fileType: "pdf" | "docx" | null;
    }) => Promise<RenderedLetterArtifact>;
  };
  job: SavedJob;
  profile: CandidateProfile;
  settings: JobFinderSettings;
}):
  | Omit<ApplicationLetterDependencies, "application" | "signal">
  | undefined {
  const chatWithTools = input.aiClient.chatWithTools;
  if (!chatWithTools) {
    return undefined;
  }

  const renderLetterArtifact = input.documentManager.renderLetterArtifact;

  return {
    preference: CoverLetterPreferenceSchema.parse(
      input.settings.coverLetter ?? {},
    ),
    writeLetter: async ({ prompt, signal }) => {
      const reply = await chatWithTools(
        [
          {
            role: "system",
            content:
              "You write cover letters for one person. Every claim must be supported by what you are given. Return only the letter.",
          },
          { role: "user", content: prompt },
        ],
        [],
        signal ? { signal } : {},
      );
      return reply.content?.trim() ?? null;
    },
    ...(renderLetterArtifact
      ? {
          renderLetter: async ({ text, fileType }) => {
            const rendered = await renderLetterArtifact({
              text,
              job: input.job,
              profile: input.profile,
              settings: input.settings,
              fileType,
            });
            if (!rendered.ok) {
              return { ok: false, reason: rendered.reason };
            }
            return {
              ok: true,
              fileName: rendered.fileName,
              mimeType: rendered.mimeType,
              // The exact bytes that were written are the bytes that go out.
              loadBytes: async () => {
                const bytes = await readFile(rendered.storagePath);
                const actual = createHash("sha256")
                  .update(bytes)
                  .digest("hex");
                if (actual !== rendered.sha256) {
                  throw new Error(
                    "The letter changed after it was written, so it was not attached.",
                  );
                }
                return new Uint8Array(bytes);
              },
            };
          },
        }
      : {}),
  };
}

/**
 * What the person sees before they press send.
 *
 * Everything here comes from the run that just happened: the answers that went
 * into the form and where each one came from, the files that were attached,
 * and the page it ended on. Nothing is inferred and nothing is hidden — a
 * review that does not show the generated answers is not a review.
 */
export function buildApplyReviewCard(input: {
  result: ApplyAgentResult;
  siteLabel: string;
  preparedAt: string;
}): ApplicationReviewCard {
  const letterEntry = input.result.filled.find(
    (entry) => entry.questionKind === "cover_letter",
  );

  return ApplicationReviewCardSchema.parse({
    siteLabel: input.siteLabel,
    pageUrl: input.result.finalUrl,
    answers: input.result.filled.map((entry) => ({
      question: entry.label,
      answer: entry.answer.value,
      source: entry.answer.provenanceLabel,
      written: entry.answer.sourceKind === "generated",
      groundedIn: entry.answer.groundedIn,
    })),
    attachments: input.result.attachments.map((attachment) => ({
      label: attachment.label,
      fileName: attachment.fileName,
      field: attachment.controlLabel,
    })),
    letter: letterEntry
      ? {
          text: letterEntry.answer.value,
          groundedIn: letterEntry.answer.groundedIn,
        }
      : null,
    waitingOnYou: input.result.pauses.map((pause) => pause.summary),
    preparedAt: input.preparedAt,
  });
}
