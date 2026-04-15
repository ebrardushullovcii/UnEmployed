import {
  ResumeImportTargetSectionSchema,
  type AgentProviderStatus,
  type ResumeImportFieldCandidateDraft,
  type ResumeImportJsonValue,
} from "@unemployed/contracts";
import {
  ResumeImportStageExtractionResultSchema,
  sanitizeStageCandidates,
  selectBlocksForResumeImportStage,
  type ExtractResumeImportStageInput,
  type ResumeImportStageExtractionResult,
} from "./resume-import";
import { buildCandidateConfidenceBreakdown } from "./resume-import-helpers";

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry !== "string") {
      return [];
    }

    const trimmed = entry.trim();
    return trimmed ? [trimmed] : [];
  });
}

function normalizeConfidence(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(1, parsed));
    }
  }

  return undefined;
}

function normalizeAlternatives(value: unknown): ResumeImportJsonValue[] {
  if (Array.isArray(value)) {
    return value as ResumeImportJsonValue[];
  }

  return value === null || value === undefined ? [] : [value as ResumeImportJsonValue];
}

function normalizeTarget(value: unknown): ResumeImportFieldCandidateDraft["target"] | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const sectionResult = ResumeImportTargetSectionSchema.safeParse(record.section);
    const key = typeof record.key === "string" ? record.key.trim() : "";
    const recordId = typeof record.recordId === "string" ? record.recordId.trim() : null;

    if (sectionResult.success && key) {
      return {
        section: sectionResult.data,
        key,
        recordId: recordId || null,
      };
    }
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().replace(/^target\s*[:=]\s*/i, "");
  if (!normalized) {
    return undefined;
  }

  const delimiter = normalized.includes("|") ? "|" : normalized.includes(":") ? ":" : ".";
  const parts = normalized
    .split(delimiter)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return undefined;
  }

  const sectionResult = ResumeImportTargetSectionSchema.safeParse(parts[0]);
  if (!sectionResult.success) {
    return undefined;
  }

  const key = parts[1] ?? "";
  const recordId = parts.length > 2 ? parts.slice(2).join(delimiter) : null;

  if (!key) {
    return undefined;
  }

  return {
    section: sectionResult.data,
    key,
    recordId: recordId || null,
  };
}

function normalizeCandidate(
  value: unknown,
): ResumeImportFieldCandidateDraft | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const target = normalizeTarget(record.target);

  if (!target) {
    return undefined;
  }

  const label = typeof record.label === "string" && record.label.trim()
    ? record.label.trim()
    : `${target.section}.${target.key}${target.recordId ? `.${target.recordId}` : ""}`;
  const confidence = normalizeConfidence(record.confidence) ?? 0.5;

  return {
    target,
    label,
    value: (record.value ?? null) as ResumeImportJsonValue,
    normalizedValue: (record.normalizedValue ?? null) as ResumeImportJsonValue,
    valuePreview: typeof record.valuePreview === "string" ? record.valuePreview : null,
    evidenceText: typeof record.evidenceText === "string" ? record.evidenceText : null,
    sourceBlockIds: toStringArray(record.sourceBlockIds),
    confidence,
    confidenceBreakdown: null,
    notes: toStringArray(record.notes),
    alternatives: normalizeAlternatives(record.alternatives),
  };
}

function buildStageInstructions(stage: ExtractResumeImportStageInput["stage"]): string {
  switch (stage) {
    case "identity_summary":
      return [
        "Return only identity, contact, location, and search-preference candidates.",
        "Valid target sections: identity, contact, location, search_preferences.",
        "Use keys such as fullName, firstName, lastName, middleName, headline, summary, currentLocation, timeZone, yearsExperience, email, phone, portfolioUrl, linkedinUrl, githubUrl, personalWebsiteUrl, targetRoles, locations, salaryCurrency.",
        "Prefer literal values from the document over inferred rewrites.",
        "Never use a section heading like ABOUT ME, SKILLS, or WORK EXPERIENCE as a person name.",
        "Only return currentLocation when the blocks show an address or a short literal location label, not a narrative sentence.",
        "Each candidate target must be an object like {\"section\":\"identity\",\"key\":\"fullName\",\"recordId\":null}, not a string.",
      ].join(" ");
    case "experience":
      return [
        "Return only experience record candidates.",
        "Valid target section: experience.",
        "Use target.key = 'record' and a stable recordId like experience_1, experience_2.",
        "Each value must be a structured object matching one resume experience record.",
        "Use the nearest explicit company marker or inline company segment when the resume shows one, and populate companyName separately from title.",
        "If a role header does not have an explicit employer on the same line or an immediately preceding company marker, leave companyName null instead of inheriting an older employer.",
        "If title, company, and location appear on one header line, split them into the correct fields instead of embedding company or location inside title.",
        "Merge wrapped continuation lines so summaries and achievements read as complete sentences instead of broken fragments.",
        "Do not create an experience record unless the blocks contain an explicit role header or date range.",
        "For record candidates, target must be an object like {\"section\":\"experience\",\"key\":\"record\",\"recordId\":\"experience_1\"}.",
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
        "Prefer concise reusable narratives grounded in multiple resume lines over clipped fragments from a single wrapped sentence.",
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
      'Example candidate: {"target":{"section":"identity","key":"fullName","recordId":null},"label":"Full name","value":"Jane Doe","normalizedValue":"Jane Doe","evidenceText":"Jane Doe","sourceBlockIds":["block_1"],"confidence":0.98,"notes":[],"alternatives":[]}',
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
      candidates: Array.isArray(normalizedPayload.candidates)
        ? normalizedPayload.candidates
            .map((candidate) => normalizeCandidate(candidate))
            .filter(
              (candidate): candidate is ResumeImportFieldCandidateDraft =>
                Boolean(candidate),
            )
            .map((candidate) => ({
              ...candidate,
              confidenceBreakdown: buildCandidateConfidenceBreakdown({
                candidate: {
                  target: candidate.target,
                  confidence: candidate.confidence,
                  sourceBlockIds: candidate.sourceBlockIds,
                },
                bundle: input.stageInput.documentBundle,
              }),
            }))
        : [],
      notes: toStringArray(normalizedPayload.notes),
    }),
  );
}
