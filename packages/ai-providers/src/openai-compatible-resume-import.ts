import type { AgentProviderStatus } from "@unemployed/contracts";
import {
  ResumeImportStageExtractionResultSchema,
  sanitizeStageCandidates,
  selectBlocksForResumeImportStage,
  type ExtractResumeImportStageInput,
  type ResumeImportStageExtractionResult,
} from "./resume-import";

function buildStageInstructions(stage: ExtractResumeImportStageInput["stage"]): string {
  switch (stage) {
    case "identity_summary":
      return [
        "Return only identity, contact, location, and search-preference candidates.",
        "Valid target sections: identity, contact, location, search_preferences.",
        "Use keys such as fullName, firstName, lastName, middleName, headline, summary, currentLocation, timeZone, yearsExperience, email, phone, portfolioUrl, linkedinUrl, githubUrl, personalWebsiteUrl, targetRoles, locations, salaryCurrency.",
        "Prefer literal values from the document over inferred rewrites.",
      ].join(" ");
    case "experience":
      return [
        "Return only experience record candidates.",
        "Valid target section: experience.",
        "Use target.key = 'record' and a stable recordId like experience_1, experience_2.",
        "Each value must be a structured object matching one resume experience record.",
      ].join(" ");
    case "background":
      return [
        "Return only background candidates for skills, education, certifications, links, projects, and languages.",
        "Valid target sections: skill, education, certification, link, project, language.",
        "Use key 'record' for object records and explicit keys like skills or skillGroups.coreSkills for list fields.",
      ].join(" ");
    case "shared_memory":
      return [
        "Return only conservative shared-memory suggestions.",
        "Valid target sections: narrative, proof_point, answer_bank, application_identity.",
        "Never invent sensitive facts such as work authorization, sponsorship, relocation, notice period, availability, or salary expectations.",
        "For application_identity, prefer keys preferredEmail, preferredPhone, or preferredLinkUrls.",
        "For proof_point records, use value objects with title, claim, heroMetric, supportingContext, roleFamilies, projectIds, and linkIds.",
      ].join(" ");
    default:
      return "Return conservative grounded candidates only.";
  }
}

export async function extractOpenAiCompatibleResumeImportStage(input: {
  stageInput: ExtractResumeImportStageInput;
  status: AgentProviderStatus;
  fetchModelJson: (
    systemPrompt: string,
    userPayload: unknown,
    options?: { timeoutMs?: number },
  ) => Promise<unknown>;
  timeoutMs: number;
}): Promise<ResumeImportStageExtractionResult> {
  const blocks = selectBlocksForResumeImportStage(
    input.stageInput.documentBundle,
    input.stageInput.stage,
  );
  const payload = await input.fetchModelJson(
    [
      "You extract structured resume import candidates from parsed document blocks.",
      "Return JSON only.",
      "Use only the provided blocks as evidence.",
      "Each candidate must include target, label, value, normalizedValue when helpful, evidenceText, sourceBlockIds, confidence, notes, and alternatives.",
      "Only use sourceBlockIds that exist in the input block list.",
      "Confidence must be a number between 0 and 1.",
      buildStageInstructions(input.stageInput.stage),
      "Abstain instead of guessing.",
    ].join(" "),
    {
      stage: input.stageInput.stage,
      existingProfile: input.stageInput.existingProfile,
      existingSearchPreferences: input.stageInput.existingSearchPreferences,
      documentBundle: {
        id: input.stageInput.documentBundle.id,
        sourceResumeId: input.stageInput.documentBundle.sourceResumeId,
        parserKinds: input.stageInput.documentBundle.parserKinds,
        warnings: input.stageInput.documentBundle.warnings,
        blocks: blocks.map((block) => ({
          id: block.id,
          pageNumber: block.pageNumber,
          sectionHint: block.sectionHint,
          kind: block.kind,
          text: block.text,
        })),
      },
    },
    { timeoutMs: input.timeoutMs },
  );

  const normalizedPayload =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  return sanitizeStageCandidates(
    input.stageInput,
    ResumeImportStageExtractionResultSchema.parse({
      stage: input.stageInput.stage,
      analysisProviderKind: "openai_compatible",
      analysisProviderLabel: input.status.label,
      candidates: normalizedPayload.candidates,
      notes: normalizedPayload.notes,
    }),
  );
}
