import {
  isBlockingResumeClaimAssessment,
  isBlockingResumeValidationIssue,
  type ResumeAssistantMessage,
  type ResumeDraft,
  type ResumeDraftPatch,
  type ResumeProposalApprovalBlocker,
  type ResumeValidationResult,
} from "@unemployed/contracts";
import {
  PROPOSED_WORDING_CHECK_NOTE,
  type ProposalProvenance,
} from "./resume-assistant-proposal-provenance";

/**
 * One vocabulary for every proposal outcome. The panel used to print
 * "Why this edit is grounded" in one state and "Why this edit would block
 * approval" in the other — two verdict words for one check, each rendered as a
 * collapsed summary with no body. Both outcomes now share this heading and
 * always carry their reason with them.
 */
export const PROPOSAL_GROUNDING_HEADING = "Checked against your saved evidence";

export type ResumeProposalVerdictTone = "blocked" | "clear" | "removal";

export interface ResumeProposalPatchVerdict {
  /** Short sentence that states the outcome. Never empty. */
  outcome: string;
  /**
   * Everything the panel knows about why. Never empty: a verdict word without
   * a reason is the defect this replaces.
   */
  reasons: readonly string[];
  tone: ResumeProposalVerdictTone;
}

export interface ResumeProposalVerdict {
  /**
   * Approval blockers this exact proposal would introduce, as decided by the
   * shared export gate at proposal time.
   */
  introducedBlockerCount: number;
  /**
   * Approval blockers the saved resume already carries, counted with the exact
   * predicates the export/approval validator uses. Accepting a proposal that
   * introduces nothing new still cannot clear these, which is why a proposal
   * may never be described as "approvable".
   */
  unresolvedBlockerCount: number;
  /** One sentence covering both facts above. Never empty. */
  summary: string;
  tone: ResumeProposalVerdictTone;
}

const REMOVAL_OPERATIONS = new Set<ResumeDraftPatch["operation"]>([
  "remove_bullet",
]);

function describeRemoval(patch: ResumeDraftPatch): boolean {
  if (REMOVAL_OPERATIONS.has(patch.operation)) {
    return true;
  }

  // Replacing existing wording with nothing is a deletion however it is
  // spelled; calling that "grounded" reads as an endorsement of text the user
  // wrote and the assistant is proposing to drop.
  if (
    patch.operation === "replace_section_text" ||
    patch.operation === "replace_entry_summary" ||
    patch.operation === "update_bullet"
  ) {
    return (patch.newText ?? "").trim().length === 0;
  }

  return false;
}

/**
 * Counts the approval blockers the saved resume still carries, using exactly
 * the predicates `collectResumeExportBlockers` uses on the export/approval
 * path. The proposal panel and the export validator therefore cannot disagree
 * about whether the resume is approvable.
 */
export function countUnresolvedApprovalBlockers(input: {
  draft: ResumeDraft;
  validation: ResumeValidationResult | null | undefined;
}): number {
  const validation = input.validation;

  if (!validation) {
    return 0;
  }

  const blockingIssues = validation.issues.filter(
    isBlockingResumeValidationIssue,
  ).length;
  const blockingClaims = validation.claimAssessments.filter((assessment) =>
    isBlockingResumeClaimAssessment({ assessment, draft: input.draft }),
  ).length;

  return blockingIssues + blockingClaims;
}

/**
 * The single evaluation behind everything the proposal panel says about
 * grounding. Both the per-patch verdict and the proposal-level summary read
 * from it, so the panel can never call an edit grounded in one line and blocked
 * in the next.
 */
export function evaluateResumeProposalVerdict(input: {
  draft: ResumeDraft;
  message: ResumeAssistantMessage;
  validation: ResumeValidationResult | null | undefined;
}): ResumeProposalVerdict {
  const introducedBlockerCount = (input.message.approvalBlockers ?? []).length;
  const unresolvedBlockerCount = countUnresolvedApprovalBlockers({
    draft: input.draft,
    validation: input.validation,
  });
  const introducedSentence =
    introducedBlockerCount > 0
      ? introducedBlockerCount === 1
        ? "1 proposed change would block approval because its new wording is not supported by your saved evidence."
        : `${introducedBlockerCount} proposed changes would block approval because their new wording is not supported by your saved evidence.`
      : "No proposed change adds wording that would block approval.";
  const unresolvedSentence =
    unresolvedBlockerCount > 0
      ? unresolvedBlockerCount === 1
        ? " The resume already has 1 approval blocker, and accepting this proposal does not clear it."
        : ` The resume already has ${unresolvedBlockerCount} approval blockers, and accepting this proposal does not clear them.`
      : "";

  return {
    introducedBlockerCount,
    summary: `${introducedSentence}${unresolvedSentence}`,
    tone: introducedBlockerCount > 0 ? "blocked" : "clear",
    unresolvedBlockerCount,
  };
}

/**
 * The per-change half of the same evaluation: the outcome sentence plus every
 * reason the panel actually holds. Callers render `outcome` and `reasons`
 * together — the heading is never allowed to appear on its own.
 */
export function evaluateResumeProposalPatchVerdict(input: {
  blockers: readonly ResumeProposalApprovalBlocker[];
  patch: ResumeDraftPatch;
  provenance: ProposalProvenance;
}): ResumeProposalPatchVerdict {
  const reasons: string[] = [];
  const isRemoval = describeRemoval(input.patch);

  if (input.provenance.targetFound) {
    reasons.push(`Lands on ${input.provenance.targetLabel}.`);
  } else {
    reasons.push(
      "This edit points at a target that is no longer in the draft.",
    );
  }

  if (input.provenance.savedTextCheck) {
    reasons.push(input.provenance.savedTextCheck.label);
    reasons.push(PROPOSED_WORDING_CHECK_NOTE);
  }

  if (input.blockers.length > 0) {
    return {
      outcome:
        "Blocks approval: the new wording is not supported by your saved evidence.",
      reasons,
      tone: "blocked",
    };
  }

  if (isRemoval) {
    return {
      outcome:
        "Removes wording you already have. Your saved evidence is unchanged, so nothing new is claimed.",
      reasons,
      tone: "removal",
    };
  }

  return {
    outcome: "Adds no new wording that would block approval.",
    reasons,
    tone: "clear",
  };
}
