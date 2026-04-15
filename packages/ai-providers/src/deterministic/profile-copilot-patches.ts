import {
  type ProfileCopilotPatchGroup,
  type ProfileCopilotReply,
} from "@unemployed/contracts";

import type { ReviseCandidateProfileInput } from "../shared";
import { buildGenericExplicitFieldPatchGroup } from "./profile-copilot-field-updates";
import { buildJobSourcePatchReply } from "./profile-copilot-job-sources";
import { buildSpecializedPatchGroups } from "./profile-copilot-specialized-patches";
import { buildUrlPatchReply } from "./profile-copilot-url-patches";

function normalizePatchReply(
  reply: ProfileCopilotPatchGroup[] | ProfileCopilotReply | null,
): ProfileCopilotPatchGroup[] {
  if (!reply) {
    return [];
  }

  return "content" in reply ? [] : reply;
}

export function buildDeterministicPatchReply(
  input: ReviseCandidateProfileInput,
): ProfileCopilotPatchGroup[] | ProfileCopilotReply | null {
  const jobSourceReply = buildJobSourcePatchReply(input);
  const specializedPatchGroups = buildSpecializedPatchGroups(input);
  const urlPatchReply = buildUrlPatchReply(input);
  const genericFieldPatchGroup = buildGenericExplicitFieldPatchGroup(input);
  const patchGroups = [
    ...normalizePatchReply(specializedPatchGroups),
    ...normalizePatchReply(urlPatchReply),
    ...(genericFieldPatchGroup ? [genericFieldPatchGroup] : []),
    ...normalizePatchReply(jobSourceReply),
  ];

  if (patchGroups.length > 0) {
    return patchGroups;
  }

  return jobSourceReply && "content" in jobSourceReply ? jobSourceReply : null;
}
