import type { CandidateProfile } from "@unemployed/contracts";
import { uniqueStrings } from "./utils";

function normalizeSkillPhrase(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenizeSkillPhrase(value: string): string[] {
  return normalizeSkillPhrase(value).split(/\s+/).filter(Boolean);
}

function matchesCandidateSkill(candidateSkill: string, proposedSkill: string): boolean {
  const normalizedCandidate = normalizeSkillPhrase(candidateSkill);
  const normalizedProposed = normalizeSkillPhrase(proposedSkill);

  if (!normalizedCandidate || !normalizedProposed) {
    return false;
  }

  if (normalizedCandidate === normalizedProposed) {
    return true;
  }

  const candidateTokens = tokenizeSkillPhrase(candidateSkill);
  const proposedTokens = tokenizeSkillPhrase(proposedSkill);
  const smallerCount = Math.min(candidateTokens.length, proposedTokens.length);
  const largerCount = Math.max(candidateTokens.length, proposedTokens.length);
  const allowedDelta = smallerCount <= 3 ? 1 : 2;

  if (smallerCount === 0 || largerCount > 5) {
    return false;
  }

  const candidateTokenSet = new Set(candidateTokens);
  const proposedTokenSet = new Set(proposedTokens);
  const sharedCount = [...candidateTokenSet].filter((token) =>
    proposedTokenSet.has(token),
  ).length;

  return sharedCount === smallerCount && largerCount - smallerCount <= allowedDelta;
}

export function buildCandidateSkillBank(
  profile: CandidateProfile | null | undefined,
): string[] {
  if (!profile) {
    return [];
  }

  return uniqueStrings([
    ...profile.skills,
    ...profile.skillGroups.coreSkills,
    ...profile.skillGroups.tools,
    ...profile.skillGroups.languagesAndFrameworks,
    ...profile.skillGroups.softSkills,
    ...profile.skillGroups.highlightedSkills,
    ...profile.experiences.flatMap((experience) => experience.skills),
    ...profile.projects.flatMap((project) => project.skills),
  ]);
}

export function filterGroundedVisibleSkills(
  profile: CandidateProfile | null | undefined,
  skills: readonly string[],
  limit = 8,
): string[] {
  const skillBank = buildCandidateSkillBank(profile);

  if (skillBank.length === 0) {
    return [];
  }

  return uniqueStrings([...skills])
    .filter((skill) =>
      skillBank.some((candidateSkill) =>
        matchesCandidateSkill(candidateSkill, skill),
      ),
    )
    .slice(0, limit);
}
