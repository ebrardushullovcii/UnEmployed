import type { CandidateProfile, JobPosting } from "@unemployed/contracts";
import type { TailorResumeInput } from "../shared";
import { TailoredResumeDraftSchema } from "../shared";
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
      ? [`${input.profile.yearsExperience}+ years of experience aligned to ${input.job.summary.toLowerCase()}`]
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
