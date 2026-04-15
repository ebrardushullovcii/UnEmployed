import type {
  CandidateProfile,
  JobPosting,
  ResumeDraftPatch,
} from "@unemployed/contracts";
import type {
  CreateResumeDraftInput,
  ResumeAssistantReply,
  ReviseResumeDraftInput,
  TailorResumeInput,
} from "../shared";
import { ResumeAssistantReplySchema, TailoredResumeDraftSchema } from "../shared";
import { clampScore, uniqueStrings } from "./utils";

function createPatchId(prefix: string): string {
  return `${prefix}_${typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`}`;
}

export function buildDeterministicResumeText(
  profile: CandidateProfile,
  job: JobPosting,
  summary: string,
  experienceHighlights: readonly string[],
  coreSkills: readonly string[],
  targetedKeywords: readonly string[],
): string {
  return [
    profile.fullName,
    profile.headline,
    [profile.currentLocation, profile.email, profile.phone].filter(Boolean).join(" | "),
    "",
    `Target Role: ${job.title} at ${job.company}`,
    "",
    "Summary",
    summary,
    "",
    "Experience Highlights",
    ...experienceHighlights.map((line) => `- ${line}`),
    "",
    "Core Skills",
    ...coreSkills.map((line) => `- ${line}`),
    "",
    "Targeted Keywords",
    ...targetedKeywords.map((line) => `- ${line}`),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildDeterministicTailoredResume(input: TailorResumeInput) {
  const coreSkills = uniqueStrings([
    ...input.profile.skills.slice(0, 6),
    ...input.job.keySkills.slice(0, 6),
  ]).slice(0, 8);
  const targetedKeywords = uniqueStrings(input.job.keySkills).slice(0, 6);
  const workModeSummary = input.job.workMode.join(", ") || "flexible";
  const headline = input.profile.headline ?? input.job.title ?? "the candidate";
  const summary = `${headline} aligned to ${input.job.title} at ${input.job.company}, emphasizing ${targetedKeywords.slice(0, 3).join(", ") || "role alignment"} and ${workModeSummary} delivery.`;
  const experienceHighlights = uniqueStrings([
    ...(input.profile.yearsExperience
      ? [`${input.profile.yearsExperience}+ years of experience aligned to ${(input.job.summary ?? input.job.title).toLowerCase()}`]
      : []),
    `Grounded in ${input.searchPreferences.tailoringMode} tailoring with saved preferences for ${input.searchPreferences.targetRoles.slice(0, 2).join(" and ") || input.job.title}.`,
    input.resumeText
      ? "Tailoring references the stored base resume text and saved profile details."
      : "Tailoring references the saved structured profile because base resume text is not stored yet.",
  ]).slice(0, 3);
  const fullText = buildDeterministicResumeText(
    input.profile,
    input.job,
    summary,
    experienceHighlights,
    coreSkills,
    targetedKeywords,
  );

  return TailoredResumeDraftSchema.parse({
    label: "Tailored Resume",
    summary,
    experienceHighlights,
    coreSkills,
    targetedKeywords,
    fullText,
    compatibilityScore: clampScore(78 + Math.min(input.job.keySkills.length * 3, 18)),
    notes: ["Used the built-in deterministic resume tailorer."],
  });
}

export function composeDeterministicFullText(input: {
  coreSkills: readonly string[];
  experienceHighlights: readonly string[];
  label?: string | null;
  notes?: readonly string[];
  summary: string;
  targetedKeywords: readonly string[];
}) {
  return [
    input.label ?? null,
    input.summary,
    ...input.experienceHighlights,
    input.coreSkills.length > 0 ? `Core skills: ${input.coreSkills.join(", ")}` : null,
    input.targetedKeywords.length > 0
      ? `Targeted keywords: ${input.targetedKeywords.join(", ")}`
      : null,
    ...(input.notes ?? []),
  ]
    .filter((entry): entry is string => Boolean(entry && entry.trim().length > 0))
    .join("\n\n");
}

export function buildDeterministicStructuredResumeDraft(
  input: CreateResumeDraftInput,
) {
  const baseDraft = buildDeterministicTailoredResume(input);
  const evidence = input.evidence;
  const researchTerms = uniqueStrings([
    ...(input.researchContext?.domainVocabulary ?? []),
    ...(input.researchContext?.priorityThemes ?? []),
  ]).slice(0, 6);
  const summary =
    evidence?.candidateSummary[0] ??
    evidence?.summary[0] ??
    input.researchContext?.companyNotes[0] ??
    baseDraft.summary;
  const experienceHighlights = uniqueStrings([
    ...(evidence?.experience ?? []),
    ...baseDraft.experienceHighlights,
  ]).slice(0, 4);
  const coreSkills = uniqueStrings([
    ...(evidence?.skills ?? []),
    ...baseDraft.coreSkills,
  ]).slice(0, 8);
  const targetedKeywords = uniqueStrings([
    ...(evidence?.keywords ?? []),
    ...researchTerms,
    ...baseDraft.targetedKeywords,
  ]).slice(0, 8);
  const notes = uniqueStrings([
    ...baseDraft.notes,
    ...(researchTerms.length > 0
      ? ["Incorporated bounded employer research vocabulary into deterministic draft creation."]
      : []),
  ]);
  const fullText = composeDeterministicFullText({
    label: baseDraft.label,
    summary,
    experienceHighlights,
    coreSkills,
    targetedKeywords,
    notes,
  });

  return TailoredResumeDraftSchema.parse({
    ...baseDraft,
    summary,
    experienceHighlights,
    coreSkills,
    targetedKeywords,
    fullText,
    notes,
  });
}

export function buildDeterministicResumeAssistantReply(
  input: ReviseResumeDraftInput,
): ResumeAssistantReply {
  const lowerRequest = input.request.toLowerCase();
  const patches: ResumeDraftPatch[] = [];
  const summarySection = input.draft.sections.find((section) => section.kind === "summary") ?? null;
  const experienceSection =
    input.draft.sections.find((section) => section.kind === "experience") ?? null;

  const isSummaryShorteningRequest = /\bshort(?:en|er)?\b.*\bsummary\b|\bsummary\b.*\bshort(?:en|er)?\b/.test(lowerRequest);

  if (summarySection && !summarySection.locked && (lowerRequest.includes("summary") || lowerRequest.includes("ats") || isSummaryShorteningRequest)) {
    const currentSummary = summarySection.text ?? `${input.job.title} alignment summary`;
    const tightenedSummary = tightenSentence(
      currentSummary,
    );
    if (tightenedSummary !== currentSummary) {
      patches.push({
        id: createPatchId("assistant_patch_summary"),
        draftId: input.draft.id,
        operation: "replace_section_text",
        targetSectionId: summarySection.id,
        targetBulletId: null,
        anchorBulletId: null,
        position: null,
        newText: tightenedSummary,
        newIncluded: null,
        newLocked: null,
        newBullets: null,
        appliedAt: new Date().toISOString(),
        origin: "assistant",
        conflictReason: null,
      });
    }
  }

  const isExperienceShorteningRequest = lowerRequest.includes("shorten") && (lowerRequest.includes("experience") || lowerRequest.includes("bullet"));

  if (experienceSection && !experienceSection.locked && (lowerRequest.includes("bullet") || lowerRequest.includes("experience") || isExperienceShorteningRequest)) {
    const ordinalPatterns = ["first", "1st", "second", "2nd", "third", "3rd", "fourth", "4th"];
    const requestedOrdinalIndex = ordinalPatterns.findIndex((pattern) => lowerRequest.includes(pattern));
    const unlockedBullets = experienceSection.bullets.filter((bullet) => !bullet.locked);
    const keywordMatchedBullet = unlockedBullets.find((bullet) =>
      bullet.text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 3)
        .some((token) => lowerRequest.includes(token)),
    ) ?? null;
    const targetBullet = requestedOrdinalIndex >= 0
      ? unlockedBullets[requestedOrdinalIndex] ?? null
      : keywordMatchedBullet ?? unlockedBullets[0] ?? null;

    if (targetBullet) {
      const tightenedBullet = tightenSentence(targetBullet.text);
      if (tightenedBullet === targetBullet.text) {
        return ResumeAssistantReplySchema.parse({
          content: "I could not safely turn that request into a grounded patch, so no changes were applied.",
          patches,
        });
      }

      patches.push({
        id: createPatchId("assistant_patch_bullet"),
        draftId: input.draft.id,
        operation: "update_bullet",
        targetSectionId: experienceSection.id,
        targetBulletId: targetBullet.id,
        anchorBulletId: null,
        position: null,
        newText: tightenedBullet,
        newIncluded: null,
        newLocked: null,
        newBullets: null,
        appliedAt: new Date().toISOString(),
        origin: "assistant",
        conflictReason: null,
      });
    }
  }

  const content = patches.length
    ? `Applied ${patches.length} grounded resume edit${patches.length === 1 ? "" : "s"} based on your request.`
    : "I could not safely turn that request into a grounded patch, so no changes were applied.";

  return ResumeAssistantReplySchema.parse({
    content,
    patches,
  });
}

function tightenSentence(value: string): string {
  const normalized = value
    .replace(/\s+/g, " ")
    .replace(/\b(aligned to|tailored for|focused on)\b/gi, "for")
    .trim()
    .replace(/[.]{2,}/g, ".");

  if (normalized.length <= 240) {
    return /[.!?;]$/.test(normalized) ? normalized : `${normalized}.`;
  }

  const candidate = normalized.slice(0, 240);
  const boundaryMatch = candidate.match(/^.*(?=[\s.!?;][^\s.!?;]*$)/);
  const trimmed = boundaryMatch?.[0]?.trim() ?? candidate.replace(/\s+\S*$/, "").trim();
  const safe = trimmed.length > 0 ? trimmed : candidate.trim();

  return /[.!?;]$/.test(safe) ? safe : `${safe}...`;
}
