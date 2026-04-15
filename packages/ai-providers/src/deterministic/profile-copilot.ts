import { ProfileCopilotReplySchema, type ProfileCopilotReply } from "@unemployed/contracts";

import type { ReviseCandidateProfileInput } from "../shared";
import {
  buildNoChangeReply,
  formatPatchGroupSummaryList,
} from "./profile-copilot-helpers";
import { buildDeterministicAssessmentReply } from "./profile-copilot-assessment";
import { buildDeterministicPatchReply } from "./profile-copilot-patches";

export function buildDeterministicProfileCopilotReply(
  input: ReviseCandidateProfileInput,
): ProfileCopilotReply {
  const assessmentReply = buildDeterministicAssessmentReply(input);
  if (assessmentReply) {
    return assessmentReply;
  }

  const patchReply = buildDeterministicPatchReply(input);

  if (patchReply && "content" in patchReply) {
    return patchReply;
  }

  if (!patchReply) {
    return buildNoChangeReply(input);
  }

  const normalizedPatchGroups = Array.isArray(patchReply) ? patchReply : [patchReply];
  const appliedPatchGroups = normalizedPatchGroups.filter((patchGroup) => patchGroup.applyMode === "applied");
  const reviewPatchGroups = normalizedPatchGroups.filter((patchGroup) => patchGroup.applyMode !== "applied");
  const summaryList = formatPatchGroupSummaryList(normalizedPatchGroups);
  let content = "";

  if (appliedPatchGroups.length > 0 && reviewPatchGroups.length === 0) {
    content = `I applied ${appliedPatchGroups.length === 1 ? "one safe change" : `${appliedPatchGroups.length} safe changes`} for the ${input.context.surface === "setup" ? `setup ${input.context.step.replaceAll("_", " ")}` : input.context.surface === "profile" ? `${input.context.section} profile section` : "profile"} context: ${summaryList}.`;
  } else if (appliedPatchGroups.length === 0 && reviewPatchGroups.length > 0) {
    content = `I prepared ${reviewPatchGroups.length === 1 ? "this change" : `${reviewPatchGroups.length} changes`} for review in the ${input.context.surface === "setup" ? `setup ${input.context.step.replaceAll("_", " ")}` : input.context.surface === "profile" ? `${input.context.section} profile section` : "profile"} context: ${summaryList}.`;
  } else {
    content = `I applied ${appliedPatchGroups.length} safe change${appliedPatchGroups.length === 1 ? "" : "s"} and prepared ${reviewPatchGroups.length} more for review in the ${input.context.surface === "setup" ? `setup ${input.context.step.replaceAll("_", " ")}` : input.context.surface === "profile" ? `${input.context.section} profile section` : "profile"} context: ${summaryList}.`;
  }

  return ProfileCopilotReplySchema.parse({
    content,
    patchGroups: normalizedPatchGroups,
  });
}
