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

export function buildDeterministicStructuredResumeDraft(
  input: CreateResumeDraftInput,
) {
  const baseDraft = buildDeterministicTailoredResume(input);
  const evidence = input.evidence;
  const researchTerms = uniqueStrings([
    ...(input.researchContext?.domainVocabulary ?? []),
    ...(input.researchContext?.priorityThemes ?? []),
  ]).slice(0, 6);

  return TailoredResumeDraftSchema.parse({
    ...baseDraft,
    summary:
      evidence?.candidateSummary[0] ??
      evidence?.summary[0] ??
      input.researchContext?.companyNotes[0] ??
      baseDraft.summary,
    experienceHighlights:
      uniqueStrings([
        ...(evidence?.experience ?? []),
        ...baseDraft.experienceHighlights,
      ]).slice(0, 4),
    coreSkills: uniqueStrings([
      ...(evidence?.skills ?? []),
      ...baseDraft.coreSkills,
    ]).slice(0, 8),
    targetedKeywords: uniqueStrings([
      ...(evidence?.keywords ?? []),
      ...researchTerms,
      ...baseDraft.targetedKeywords,
    ]).slice(0, 8),
    notes: uniqueStrings([
      ...baseDraft.notes,
      ...(researchTerms.length > 0
        ? ["Incorporated bounded employer research vocabulary into deterministic draft creation."]
        : []),
    ]),
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

  if (summarySection && (lowerRequest.includes("summary") || lowerRequest.includes("ats") || lowerRequest.includes("short"))) {
    const tightenedSummary = tightenSentence(
      summarySection.text ?? `${input.job.title} alignment summary`,
    );
    patches.push({
      id: `assistant_patch_summary_${Date.now()}`,
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

  if (experienceSection && (lowerRequest.includes("bullet") || lowerRequest.includes("experience") || lowerRequest.includes("shorten"))) {
    const targetBullet = experienceSection.bullets.find((bullet) => !bullet.locked) ?? null;
    if (targetBullet) {
      patches.push({
        id: `assistant_patch_bullet_${Date.now()}`,
        draftId: input.draft.id,
        operation: "update_bullet",
        targetSectionId: experienceSection.id,
        targetBulletId: targetBullet.id,
        anchorBulletId: null,
        position: null,
        newText: tightenSentence(targetBullet.text),
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
  return value
    .replace(/\s+/g, " ")
    .replace(/\b(aligned to|tailored for|focused on)\b/gi, "for")
    .trim()
    .replace(/[.]{2,}/g, ".")
    .slice(0, 240);
}
