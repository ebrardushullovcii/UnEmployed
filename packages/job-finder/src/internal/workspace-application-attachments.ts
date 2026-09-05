import type {
  ApplicationAnswerRecord,
  ApplicationQuestionRecord,
} from "@unemployed/contracts";
import type { ApplicationAttachmentArtifact } from "@unemployed/browser-runtime";
import type { CandidateAssetResolver } from "./workspace-service-contracts";

function compareAnswerRecency(
  left: ApplicationAnswerRecord,
  right: ApplicationAnswerRecord,
) {
  return (
    right.revision - left.revision ||
    Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
    right.id.localeCompare(left.id)
  );
}

export async function resolveApplicationAttachmentsForExecution(input: {
  resolver: CandidateAssetResolver | undefined;
  questionRecords: readonly ApplicationQuestionRecord[];
  answerRecords: readonly ApplicationAnswerRecord[];
}): Promise<ApplicationAttachmentArtifact[]> {
  const answerById = new Map(
    input.answerRecords.map((answer) => [answer.id, answer] as const),
  );
  const answersByQuestion = new Map<string, ApplicationAnswerRecord[]>();
  for (const answer of input.answerRecords) {
    const current = answersByQuestion.get(answer.questionId) ?? [];
    current.push(answer);
    answersByQuestion.set(answer.questionId, current);
  }

  const selections = input.questionRecords.flatMap((question) => {
    const selected = question.selectedAnswerId
      ? answerById.get(question.selectedAnswerId)
      : undefined;
    const latest =
      selected ??
      [...(answersByQuestion.get(question.id) ?? [])].sort(
        compareAnswerRecency,
      )[0];
    return latest?.sourceKind === "user" &&
      (latest.status === "suggested" || latest.status === "filled") &&
      latest.value?.type === "asset_ref"
      ? [{ answer: latest, question }]
      : [];
  });
  if (selections.length === 0) {
    return [];
  }
  const resolver = input.resolver;
  if (!resolver) {
    throw new Error(
      "This application references an approved asset, but the local asset library is unavailable.",
    );
  }

  return Promise.all(
    selections.map(async ({ answer, question }) => {
      const value = answer.value;
      if (value?.type !== "asset_ref") {
        throw new Error("The selected application attachment is stale.");
      }
      const resolved = await resolver.resolveForApplication(value.assetId);
      return {
        assetId: resolved.asset.id,
        questionId: question.id,
        prompt: question.prompt,
        questionKind: question.kind,
        fileName: resolved.asset.originalName,
        mime: resolved.asset.mime,
        sha256: resolved.asset.sha256,
        loadVerifiedBytes: resolved.loadVerifiedBytes,
      };
    }),
  );
}
