import type {
  ResumeAssistantMessage,
  ResumeDraft,
  ResumeDraftBullet,
  ResumeDraftOrigin,
  ResumeDraftRevision,
  TailoredAsset,
} from "@unemployed/contracts";

const generatedResumeOrigins = new Set<ResumeDraftOrigin>([
  "ai_generated",
  "assistant_edited",
  "deterministic_fallback",
]);

export function isGeneratedResumeOrigin(origin: ResumeDraftOrigin): boolean {
  return generatedResumeOrigins.has(origin);
}

export function listGeneratedResumeBullets(
  draft: ResumeDraft,
): ResumeDraftBullet[] {
  return draft.sections.flatMap((section) => [
    ...section.bullets,
    ...section.entries.flatMap((entry) => entry.bullets),
  ]);
}

const DETERMINISTIC_FALLBACK_NOTE_PATTERN =
  /deterministic|fell back to the deterministic|timed out after \d+s/i;

export type ResumeGenerationPathInput = Pick<
  TailoredAsset,
  "generationMethod" | "generationReason" | "generationDetail"
> & { notes: readonly string[] };

export interface ResumeGenerationPathDisclosure {
  message: string;
  /**
   * The draft-origin sentences on their own, without the trailing review
   * reminder. Kept separate so a merged provenance statement can put the
   * assistant-edit clause before the reminder instead of after it.
   */
  originSentence: string;
  /**
   * True when a configured model exists and a retry could change the
   * outcome. False when no provider is configured or the deterministic path
   * was forced, because retrying would only reproduce the same draft.
   */
  canRetryWithAi: boolean;
}

const REVIEW_SUFFIX =
  "Strong or aggressive rewrite settings may not have fully applied — review the draft carefully before approval.";

/**
 * Every sentence below is scoped to the *first* draft. Accepting an assistant
 * proposal changes the document after that point, and an unscoped "Job Finder
 * used the built-in fallback instead of the AI draft" then contradicted the
 * edit the user had just watched land in the preview. Accepted AI edits are
 * reported separately by `describeAcceptedAssistantEdits`.
 */
const FIRST_DRAFT_PREFIX = "The first draft came from the built-in generator";

/**
 * Explains why the built-in generator wrote the first draft. Prefers the
 * structured reason recorded by the AI boundary; the note-prose match remains
 * only for assets saved before the structured reason existed.
 */
export function describeResumeGenerationPath(
  asset: ResumeGenerationPathInput | null | undefined,
): ResumeGenerationPathDisclosure | null {
  if (!asset || asset.generationMethod !== "deterministic") {
    return null;
  }

  const detail = asset.generationDetail?.trim() || null;
  const disclose = (
    originSentence: string,
    canRetryWithAi: boolean,
  ): ResumeGenerationPathDisclosure => ({
    canRetryWithAi,
    message: `${originSentence} ${REVIEW_SUFFIX}`,
    originSentence,
  });

  switch (asset.generationReason) {
    case "no_provider_configured":
      return disclose(
        `${FIRST_DRAFT_PREFIX} because no AI provider is configured.`,
        false,
      );
    case "forced_deterministic":
      return disclose(
        `${FIRST_DRAFT_PREFIX} because AI drafting is turned off for this session.`,
        false,
      );
    case "provider_timeout":
      return disclose(
        `${FIRST_DRAFT_PREFIX} because the AI draft timed out${detail ? ` (${detail})` : ""}.`,
        true,
      );
    case "provider_failed":
      return disclose(
        `${FIRST_DRAFT_PREFIX} because the AI draft failed${detail ? ` (${detail})` : ""}.`,
        true,
      );
    case "provider_output_unverified":
      return disclose(
        `${detail ?? "The AI draft's proposals could not be verified against your saved evidence"}${detail?.endsWith(".") ? "" : "."} ${FIRST_DRAFT_PREFIX} instead.`,
        true,
      );
    case null:
    case undefined:
      break;
  }

  const legacyOriginSentence = getDeterministicResumeFallbackOriginSentence(
    asset.notes,
  );
  // Retrying is offered for every note-derived fallback. The narrower prose
  // match dropped the escape hatch on exactly the assets whose reason was not
  // recorded, so the same draft explained itself one way before approval and
  // offered no way forward after it.
  return legacyOriginSentence ? disclose(legacyOriginSentence, true) : null;
}

function getDeterministicResumeFallbackOriginSentence(
  notes: readonly string[],
): string | null {
  const matchedNote = notes.find((note) =>
    DETERMINISTIC_FALLBACK_NOTE_PATTERN.test(note),
  );
  if (!matchedNote) {
    return null;
  }

  if (notes.some((note) => /timed out after \d+s/i.test(note))) {
    return `${FIRST_DRAFT_PREFIX} because the AI resume draft timed out.`;
  }

  return `${FIRST_DRAFT_PREFIX} instead of the AI draft.`;
}

export function getDeterministicResumeFallbackMessage(
  notes: readonly string[],
): string | null {
  const originSentence = getDeterministicResumeFallbackOriginSentence(notes);

  return originSentence ? `${originSentence} ${REVIEW_SUFFIX}` : null;
}

/**
 * One accepted assistant proposal is the clearest evidence that the AI did
 * help, and it must be visible on the page it changed. Counts the exact
 * patches the user accepted (never the proposed-but-rejected ones) and names
 * the revision an Undo restores, which is the pre-edit snapshot recorded by
 * the newest assistant patch.
 */
export interface AcceptedAssistantEditSummary {
  count: number;
  label: string;
  /** Section, entry, and bullet ids the accepted patches landed on. */
  changedTargetIds: readonly string[];
}

export function describeAcceptedAssistantEdits(
  messages: readonly ResumeAssistantMessage[],
): AcceptedAssistantEditSummary | null {
  const acceptedPatches = messages.flatMap((message) =>
    message.role === "assistant" && message.proposalStatus === "accepted"
      ? message.patches.filter((patch) =>
          message.resolvedPatchIds.includes(patch.id),
        )
      : [],
  );

  if (acceptedPatches.length === 0) {
    return null;
  }

  const changedTargetIds = Array.from(
    new Set(
      acceptedPatches.flatMap((patch) =>
        [
          patch.targetSectionId,
          patch.targetEntryId ?? null,
          patch.targetBulletId ?? null,
        ].filter((value): value is string => Boolean(value)),
      ),
    ),
  );

  return {
    count: acceptedPatches.length,
    label:
      acceptedPatches.length === 1
        ? "1 AI edit applied"
        : `${acceptedPatches.length} AI edits applied`,
    changedTargetIds,
  };
}

/**
 * One truthful provenance statement for the studio.
 *
 * The studio used to stack "1 AI edit applied" directly above "The configured
 * AI model returned no usable rewrite proposals. The first draft came from the
 * built-in generator instead", which reads as a contradiction. The two facts
 * are about different moments: who wrote the *first draft*, and what the user
 * has accepted from the Assistant *since*. They are now one sentence pair in
 * that order, with the review reminder last.
 */
export function describeResumeDraftProvenance(input: {
  acceptedAssistantEdits: AcceptedAssistantEditSummary | null;
  generationPath: ResumeGenerationPathDisclosure | null;
}): string | null {
  const edits = input.acceptedAssistantEdits;
  const generationPath = input.generationPath;

  if (!generationPath) {
    return edits
      ? `${edits.label}. The changed lines are marked in the preview.`
      : null;
  }

  if (!edits) {
    return generationPath.message;
  }

  const editsClause =
    edits.count === 1
      ? "1 assistant edit has been applied since"
      : `${edits.count} assistant edits have been applied since`;

  return `${generationPath.originSentence} ${editsClause}, and the changed lines are marked in the preview. ${REVIEW_SUFFIX}`;
}

/**
 * The revision an Undo restores: assistant revisions snapshot the draft as it
 * was *before* the patch, so restoring the newest assistant patch returns the
 * document to its pre-edit wording.
 */
export function findLatestAssistantEditRevisionId(
  revisions: readonly ResumeDraftRevision[],
): string | null {
  return (
    [...revisions]
      .filter((revision) => revision.mutationKind === "assistant_patch")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
      ?.id ?? null
  );
}

export function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Not set";
  }

  return new Date(value).toLocaleString();
}

export function formatOptionalDate(
  value: string | null,
  fallback?: string | null,
): string {
  if (value) {
    return new Date(value).toLocaleDateString();
  }

  return fallback ?? "Unknown";
}

export function cloneDraft(draft: ResumeDraft): ResumeDraft {
  return {
    ...draft,
    sections: draft.sections.map((section) => ({
      ...section,
      bullets: section.bullets.map((bullet) => ({
        ...bullet,
        sourceRefs: [...bullet.sourceRefs],
      })),
      entries: section.entries.map((entry) => ({
        ...entry,
        bullets: entry.bullets.map((bullet) => ({
          ...bullet,
          sourceRefs: [...bullet.sourceRefs],
        })),
        sourceRefs: [...entry.sourceRefs],
      })),
      sourceRefs: [...section.sourceRefs],
    })),
  };
}
