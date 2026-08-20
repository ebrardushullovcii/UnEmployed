import {
  ApplicationAnswerRecordSchema,
  ClearApplicationAnswerCommandSchema,
  SaveApplicationAnswerCommandSchema,
  type ApplicationAnswerRecord,
  type ApplicationAnswerValue,
  type ApplicationQuestionKind,
  type ApplyRunDetails,
  type CandidateAssetKind,
  type ClearApplicationAnswerCommand,
  type SaveApplicationAnswerCommand,
} from "@unemployed/contracts";
import {
  createReusableAnswerForQuestion,
  normalizeAnswerQuestion,
} from "./workspace-answer-memory";
import type { WorkspaceServiceContext } from "./workspace-service-context";

function compareAnswerRecency(
  left: ApplicationAnswerRecord,
  right: ApplicationAnswerRecord,
): number {
  return (
    right.revision - left.revision ||
    Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
    right.id.localeCompare(left.id)
  );
}

function getLatestQuestionAnswer(
  details: ApplyRunDetails,
  questionId: string,
): ApplicationAnswerRecord | null {
  return (
    details.answerRecords
      .filter((answer) => answer.questionId === questionId)
      .sort(compareAnswerRecency)[0] ?? null
  );
}

function normalizeOption(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function resolveCanonicalOption(
  requested: string,
  options: readonly string[],
): string {
  if (options.length === 0) {
    return requested.trim();
  }

  const requestedKey = normalizeOption(requested);
  const match = options.find(
    (option) => normalizeOption(option) === requestedKey,
  );
  if (!match) {
    throw new Error(
      "That answer is not one of the choices currently shown by the employer.",
    );
  }
  return match;
}

function normalizeAnswerValue(
  value: ApplicationAnswerValue,
  answerOptions: readonly string[],
): ApplicationAnswerValue {
  if (value.type === "single_choice") {
    return {
      type: value.type,
      value: resolveCanonicalOption(value.value, answerOptions),
    };
  }

  if (value.type === "multi_choice") {
    const values = Array.from(
      new Set(
        value.values.map((entry) =>
          resolveCanonicalOption(entry, answerOptions),
        ),
      ),
    );
    return { type: value.type, values };
  }

  return value;
}

function assetKindMatchesQuestion(
  questionKind: ApplicationQuestionKind,
  assetKind: CandidateAssetKind,
) {
  switch (questionKind) {
    case "cover_letter":
      return (
        assetKind === "cover_letter" ||
        assetKind === "application_response" ||
        assetKind === "other"
      );
    case "portfolio":
      return ["portfolio", "work_sample", "image", "other"].includes(assetKind);
    case "resume":
      return false;
    default:
      return assetKind !== "resume";
  }
}

export function formatApplicationAnswerValue(
  value: ApplicationAnswerValue,
): string {
  switch (value.type) {
    case "text":
    case "single_choice":
    case "date":
      return value.value;
    case "multi_choice":
      return value.values.join(", ");
    case "boolean":
      return value.value ? "Yes" : "No";
    case "asset_ref":
      return `Approved asset ${value.assetId}`;
  }
}

async function saveReusableAnswer(input: {
  command: SaveApplicationAnswerCommand;
  ctx: WorkspaceServiceContext;
  prompt: string;
  questionKind: Parameters<typeof createReusableAnswerForQuestion>[0]["kind"];
  text: string;
}) {
  if (input.command.saveScope !== "reusable_profile") {
    return;
  }
  if (input.command.value.type === "asset_ref") {
    throw new Error(
      "Files stay scoped to an application and cannot be saved as a reusable text answer.",
    );
  }

  const profile = await input.ctx.repository.getProfile();
  const normalizedPrompt = normalizeAnswerQuestion(input.prompt);
  const exactMatches = profile.answerBank.customAnswers.filter((candidate) =>
    [candidate.question, candidate.label].some(
      (value) => normalizeAnswerQuestion(value) === normalizedPrompt,
    ),
  );
  if (
    exactMatches.some((candidate) => candidate.answer.trim() !== input.text)
  ) {
    throw new Error(
      "A different reusable answer already exists for this exact question. This application answer was not saved so nothing was overwritten.",
    );
  }
  if (exactMatches.length > 0) {
    return;
  }

  await input.ctx.repository.saveProfile({
    ...profile,
    answerBank: {
      ...profile.answerBank,
      customAnswers: [
        ...profile.answerBank.customAnswers,
        createReusableAnswerForQuestion({
          answer: input.text,
          prompt: input.prompt,
          kind: input.questionKind,
        }),
      ],
    },
  });
}

export function createWorkspaceApplicationAnswerMethods(
  ctx: WorkspaceServiceContext,
  getApplyRunDetails: (
    runId: string,
    jobId: string,
  ) => Promise<ApplyRunDetails>,
) {
  const mutationFlights = new Map<string, Promise<ApplyRunDetails>>();

  async function getExactMutationContext(input: {
    expectedAnswerRevision: number;
    jobId: string;
    questionId: string;
    resultId: string;
    runId: string;
  }) {
    const details = await getApplyRunDetails(input.runId, input.jobId);
    if (details.result?.id !== input.resultId) {
      throw new Error(
        "This answer editor is stale because the application moved to a newer result. Reload the application and try again.",
      );
    }
    const question = details.questionRecords.find(
      (candidate) =>
        candidate.id === input.questionId &&
        candidate.resultId === input.resultId,
    );
    if (!question) {
      throw new Error(
        "This question is no longer available in the selected application result.",
      );
    }
    if (question.status === "submitted") {
      throw new Error("Submitted employer answers cannot be changed here.");
    }

    const latestAnswer = getLatestQuestionAnswer(details, question.id);
    const currentRevision = latestAnswer?.revision ?? 0;
    if (currentRevision !== input.expectedAnswerRevision) {
      throw new Error(
        "This answer changed in another view. Reload the application before replacing it.",
      );
    }

    return { details, latestAnswer, question };
  }

  async function saveApplicationAnswerOnce(
    command: SaveApplicationAnswerCommand,
  ): Promise<ApplyRunDetails> {
    const existingDetails = await getApplyRunDetails(
      command.runId,
      command.jobId,
    );
    if (
      existingDetails.answerRecords.some(
        (answer) => answer.id === `application_answer_${command.commandId}`,
      )
    ) {
      return existingDetails;
    }

    const { latestAnswer, question } = await getExactMutationContext(command);
    const value = normalizeAnswerValue(command.value, question.answerOptions);
    if (value.type === "asset_ref" && question.answerControlType !== "file") {
      throw new Error(
        "This employer question is not a file-upload control, so an asset cannot be attached to it.",
      );
    }
    const resolvedAsset =
      value.type === "asset_ref"
        ? await ctx.candidateAssetResolver?.resolveForApplication(value.assetId)
        : null;
    if (value.type === "asset_ref" && !resolvedAsset) {
      throw new Error(
        "Candidate assets are not available in this workspace. Import the file again before preparing this application.",
      );
    }
    if (
      resolvedAsset &&
      !assetKindMatchesQuestion(question.kind, resolvedAsset.asset.kind)
    ) {
      throw new Error(
        question.kind === "resume"
          ? "Resume uploads use the approved CV selected for this job. Change the job's CV mode instead of attaching a library asset here."
          : "That asset type does not match the employer's requested document.",
      );
    }
    const text = resolvedAsset
      ? resolvedAsset.asset.originalName
      : formatApplicationAnswerValue(value);
    await saveReusableAnswer({
      command: { ...command, value },
      ctx,
      prompt: question.prompt,
      questionKind: question.kind,
      text,
    });

    const createdAt = new Date().toISOString();
    const answer = ApplicationAnswerRecordSchema.parse({
      id: `application_answer_${command.commandId}`,
      runId: command.runId,
      jobId: command.jobId,
      resultId: command.resultId,
      questionId: command.questionId,
      status: "suggested",
      text,
      value,
      revision: (latestAnswer?.revision ?? 0) + 1,
      saveScope: command.saveScope,
      supersedesAnswerId: latestAnswer?.id ?? null,
      sourceKind: "user",
      sourceId: command.commandId,
      confidenceLabel: "Provided by the user for this exact application",
      provenance: [
        {
          id: `application_answer_provenance_${command.commandId}`,
          sourceKind: "user",
          sourceId: command.commandId,
          label:
            command.saveScope === "reusable_profile"
              ? "Reviewed for this application and saved to Profile"
              : "Reviewed for this application only",
          snippet: question.prompt,
        },
      ],
      createdAt,
      submittedAt: null,
    });

    const mutationResult = await ctx.repository.commitApplicationAnswerMutation(
      {
        expectedAnswer: latestAnswer,
        expectedQuestion: question,
        answer,
        question: {
          ...question,
          selectedAnswerId: answer.id,
          submittedAnswer: answer.text,
          status: "answered",
        },
      },
    );
    if (mutationResult === "stale") {
      throw new Error(
        "This answer changed in another view. Reload the application before replacing it.",
      );
    }
    return getApplyRunDetails(command.runId, command.jobId);
  }

  async function clearApplicationAnswerOnce(
    command: ClearApplicationAnswerCommand,
  ): Promise<ApplyRunDetails> {
    const existingDetails = await getApplyRunDetails(
      command.runId,
      command.jobId,
    );
    if (
      existingDetails.answerRecords.some(
        (answer) => answer.id === `application_answer_${command.commandId}`,
      )
    ) {
      return existingDetails;
    }

    const { latestAnswer, question } = await getExactMutationContext(command);
    if (!latestAnswer) {
      throw new Error(
        "This question does not have an application answer to clear.",
      );
    }

    const clearedAt = new Date().toISOString();
    const answer = ApplicationAnswerRecordSchema.parse({
      ...latestAnswer,
      id: `application_answer_${command.commandId}`,
      status: "rejected",
      text: "Answer cleared by the user",
      value: null,
      revision: latestAnswer.revision + 1,
      saveScope: "application_once",
      supersedesAnswerId: latestAnswer.id,
      sourceKind: "user",
      sourceId: command.commandId,
      confidenceLabel: "Cleared before application preparation continued",
      provenance: [
        {
          id: `application_answer_provenance_${command.commandId}`,
          sourceKind: "user",
          sourceId: command.commandId,
          label: "Cleared from this application",
          snippet: question.prompt,
        },
      ],
      createdAt: clearedAt,
      submittedAt: null,
    });
    const mutationResult = await ctx.repository.commitApplicationAnswerMutation(
      {
        expectedAnswer: latestAnswer,
        expectedQuestion: question,
        answer,
        question: {
          ...question,
          selectedAnswerId: null,
          submittedAnswer: null,
          status: "detected",
        },
      },
    );
    if (mutationResult === "stale") {
      throw new Error(
        "This answer changed in another view. Reload the application before replacing it.",
      );
    }
    return getApplyRunDetails(command.runId, command.jobId);
  }

  function runSingleFlight(
    commandId: string,
    operation: () => Promise<ApplyRunDetails>,
  ) {
    const existing = mutationFlights.get(commandId);
    if (existing) {
      return existing;
    }
    const flight = operation().finally(() => {
      if (mutationFlights.get(commandId) === flight) {
        mutationFlights.delete(commandId);
      }
    });
    mutationFlights.set(commandId, flight);
    return flight;
  }

  return {
    saveApplicationAnswer(input: unknown) {
      const command = SaveApplicationAnswerCommandSchema.parse(input);
      return runSingleFlight(command.commandId, () =>
        saveApplicationAnswerOnce(command),
      );
    },
    clearApplicationAnswer(input: unknown) {
      const command = ClearApplicationAnswerCommandSchema.parse(input);
      return runSingleFlight(command.commandId, () =>
        clearApplicationAnswerOnce(command),
      );
    },
  };
}
