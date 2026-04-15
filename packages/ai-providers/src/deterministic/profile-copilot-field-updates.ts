import type { ProfileCopilotPatchGroup } from "@unemployed/contracts";

import type { ReviseCandidateProfileInput } from "../shared";
import { contentFieldDescriptors } from "./profile-copilot-field-updates-content";
import { preferenceFieldDescriptors } from "./profile-copilot-field-updates-preferences";
import { profileFieldDescriptors } from "./profile-copilot-field-updates-profile";
import { buildGenericExplicitFieldPatchGroupFromDescriptors } from "./profile-copilot-field-updates-shared";

const fieldDescriptors = [
  ...profileFieldDescriptors,
  ...contentFieldDescriptors,
  ...preferenceFieldDescriptors,
];

export function buildGenericExplicitFieldPatchGroup(
  input: ReviseCandidateProfileInput,
): ProfileCopilotPatchGroup | null {
  return buildGenericExplicitFieldPatchGroupFromDescriptors(input, fieldDescriptors);
}
