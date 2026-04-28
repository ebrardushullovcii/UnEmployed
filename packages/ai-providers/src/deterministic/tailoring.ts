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
import { filterGroundedVisibleSkills } from "./resume-skill-grounding";

function tokenizeForQuality(value: string | null | undefined): string[] {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function hasStrongRoleSignal(value: string | null | undefined, roleTarget: string): boolean {
  const tokens = new Set(tokenizeForQuality(value));
  if (tokens.size === 0) {
    return false;
  }

  return tokenizeForQuality(roleTarget).some((token) => token.length >= 4 && tokens.has(token));
}

function shouldPreferStoredSummary(input: {
  storedSummary: string | null | undefined;
  roleTarget: string;
}): boolean {
  const tokens = tokenizeForQuality(input.storedSummary);
  return tokens.length >= 12 || hasStrongRoleSignal(input.storedSummary, input.roleTarget);
}

function shouldKeepExperienceSummary(input: {
  summary: string | null | undefined;
  bullets: readonly string[];
}): boolean {
  const tokens = tokenizeForQuality(input.summary);
  if (tokens.length === 0) {
    return false;
  }

  if (tokens.length >= 5) {
    return true;
  }

  return input.bullets.length === 0;
}

function calculateQualityOverlap(left: string | null | undefined, right: string | null | undefined): number {
  const leftTokens = [...new Set(tokenizeForQuality(left))];
  const rightTokens = new Set(tokenizeForQuality(right));

  if (leftTokens.length === 0 || rightTokens.size === 0) {
    return 0;
  }

  const matched = leftTokens.filter((token) => rightTokens.has(token)).length;
  return matched / Math.max(Math.min(leftTokens.length, rightTokens.size), 1);
}

function buildProofBullet(input: {
  claim: string | null | undefined;
  heroMetric: string | null | undefined;
  fallback: string;
}): string {
  const claim = input.claim?.trim() || input.fallback.trim();
  const heroMetric = input.heroMetric?.trim() || "";

  if (!heroMetric) {
    return claim;
  }

  const normalizedClaim = tokenizeForQuality(claim).join(" ");
  const normalizedMetric = tokenizeForQuality(heroMetric).join(" ");

  if (!normalizedMetric || normalizedClaim.includes(normalizedMetric)) {
    return claim;
  }

  const normalizedHeroMetric = /[.!?]$/.test(heroMetric)
    ? heroMetric
    : `${heroMetric}.`;

  return `${claim}${/[.!?]$/.test(claim) ? "" : "."} ${normalizedHeroMetric}`;
}

function shouldKeepSupportingContext(value: string | null | undefined): boolean {
  return tokenizeForQuality(value).length >= 8;
}

function formatMonthYear(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  if (/^present$/i.test(trimmed)) {
    return "Present";
  }

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthByName: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };

  const yearMonthMatch = /^(\d{4})-(\d{2})$/.exec(trimmed);
  const monthYearSlashMatch = /^(\d{1,2})\/(\d{4})$/.exec(trimmed);
  const namedMonthMatch = /^([a-zA-Z]+)\.?\s+(\d{4})$/.exec(trimmed);

  if (yearMonthMatch) {
    const month = monthNames[Number(yearMonthMatch[2]) - 1];
    return month ? `${month} ${yearMonthMatch[1]}` : null;
  }

  if (monthYearSlashMatch) {
    const month = monthNames[Number(monthYearSlashMatch[1]) - 1];
    return month ? `${month} ${monthYearSlashMatch[2]}` : null;
  }

  if (namedMonthMatch) {
    const monthName = namedMonthMatch[1];
    const monthNumber = monthName ? monthByName[monthName.toLowerCase()] : null;
    const month = monthNumber ? monthNames[monthNumber - 1] : null;
    return month ? `${month} ${namedMonthMatch[2]}` : null;
  }

  return null;
}

function formatDateRange(start: string | null | undefined, end: string | null | undefined): string | null {
  return [formatMonthYear(start), formatMonthYear(end)].filter(Boolean).join(" – ") || null;
}

const QUALITY_OVERLAP_THRESHOLD = 0.72;

function isDistinctQualityLine(value: string, existing: readonly string[]): boolean {
  return existing.every((entry) => {
    const overlap = calculateQualityOverlap(value, entry);
    return overlap < QUALITY_OVERLAP_THRESHOLD;
  });
}

function buildExperienceBullets(input: {
  experience: CandidateProfile["experiences"][number];
  proofBank: CandidateProfile["proofBank"];
}): string[] {
  const baseBullets = uniqueStrings(input.experience.achievements);
  const matchedProofs: Array<CandidateProfile["proofBank"][number]> = [];
  const usedProofIds = new Set<string>();

  const enrichedBullets = uniqueStrings(
    baseBullets.map((bullet) => {
      const matchingProof = input.proofBank
        .filter((proof) => !usedProofIds.has(proof.id))
        .map((proof) => ({
          overlap: calculateQualityOverlap(
            [proof.claim, proof.heroMetric].filter(Boolean).join(" "),
            bullet,
          ),
          proof,
        }))
        .filter(({ overlap }) => overlap >= QUALITY_OVERLAP_THRESHOLD)
        .sort((left, right) => right.overlap - left.overlap)[0]?.proof;

      if (!matchingProof) {
        return bullet;
      }

      usedProofIds.add(matchingProof.id);
      matchedProofs.push(matchingProof);

      return buildProofBullet({
        claim: matchingProof.claim,
        heroMetric: matchingProof.heroMetric,
        fallback: bullet,
      });
    }),
  );

  const supportingContextBullets: string[] = [];

  for (const proof of matchedProofs) {
    const candidate = proof.supportingContext?.trim();
    if (!candidate || !shouldKeepSupportingContext(candidate)) {
      continue;
    }

    if (!isDistinctQualityLine(candidate, [...enrichedBullets, ...supportingContextBullets])) {
      continue;
    }

    supportingContextBullets.push(candidate);
  }

  return uniqueStrings([...enrichedBullets, ...supportingContextBullets]).slice(0, 3);
}

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
  experienceEntries: readonly {
    title: string | null;
    employer: string | null;
    location: string | null;
    dateRange: string | null;
    summary: string | null;
    bullets: readonly string[];
  }[] = [],
  projectEntries: readonly {
    name: string | null;
    role: string | null;
    summary: string | null;
    outcome: string | null;
    bullets: readonly string[];
  }[] = [],
  educationEntries: readonly {
    school: string | null;
    degree: string | null;
    fieldOfStudy: string | null;
    location: string | null;
    dateRange: string | null;
    summary: string | null;
  }[] = [],
  certificationEntries: readonly {
    name: string | null;
    issuer: string | null;
    dateRange: string | null;
  }[] = [],
  additionalSkills: readonly string[] = [],
  languages: readonly string[] = [],
): string {
  const formatHeading = (parts: readonly (string | null)[], right?: string | null) => {
    const left = parts.filter(Boolean).join(" — ");
    if (left && right) {
      return `${left} | ${right}`;
    }
    return left || right || null;
  };

  const experienceSection =
    experienceEntries.length > 0 || experienceHighlights.length > 0
      ? [
          "Experience",
          ...experienceEntries.flatMap((entry) => [
            formatHeading([entry.title, entry.employer], formatHeading([entry.location], entry.dateRange)),
            entry.summary,
            ...entry.bullets.map((line) => `- ${line}`),
            "",
          ]),
          ...experienceHighlights.map((line) => `- ${line}`),
          "",
        ]
      : [];

  return [
    profile.fullName,
    profile.headline,
    [profile.currentLocation, profile.email, profile.phone].filter(Boolean).join(" | "),
    "",
    "Summary",
    summary,
    "",
    ...experienceSection,
    coreSkills.length > 0 ? `Core Skills: ${coreSkills.join(", ")}` : null,
    additionalSkills.length > 0 ? `Additional Skills: ${additionalSkills.join(", ")}` : null,
    languages.length > 0 ? `Languages: ${languages.join(", ")}` : null,
    "",
    ...(projectEntries.length > 0
      ? [
          "Projects",
          ...projectEntries.flatMap((entry) => [
            formatHeading([entry.name, entry.role]),
            [entry.summary, entry.outcome].filter(Boolean).join(" "),
            ...entry.bullets.map((line) => `- ${line}`),
            "",
          ]),
        ]
      : []),
    ...(educationEntries.length > 0
      ? [
          "Education",
          ...educationEntries.flatMap((entry) => [
            formatHeading(
              [entry.school, [entry.degree, entry.fieldOfStudy].filter(Boolean).join(", ") || null],
              formatHeading([entry.location], entry.dateRange),
            ),
            entry.summary,
            "",
          ]),
        ]
      : []),
    ...(certificationEntries.length > 0
      ? [
          "Certifications",
          ...certificationEntries.map((entry) =>
            formatHeading([entry.name, entry.issuer], entry.dateRange),
          ),
          "",
        ]
      : []),
    targetedKeywords.length > 0 ? `Keywords: ${targetedKeywords.join(", ")}` : null,
  ]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .join("\n");
}

export function buildDeterministicTailoredResume(input: TailorResumeInput) {
  const coreSkills = filterGroundedVisibleSkills(
    input.profile,
    [
      ...input.profile.skills.slice(0, 6),
      ...input.profile.skillGroups.coreSkills.slice(0, 6),
      ...input.job.keySkills.slice(0, 6),
    ],
    8,
  );
  const targetedKeywords = uniqueStrings(input.job.keySkills).slice(0, 6);
  const additionalSkills = filterGroundedVisibleSkills(
    input.profile,
    [
      ...input.profile.skillGroups.tools,
      ...input.profile.skillGroups.languagesAndFrameworks,
      ...input.profile.skillGroups.highlightedSkills,
      ...input.profile.projects.flatMap((project) => project.skills),
      ...input.job.keySkills,
    ],
    12,
  )
    .filter(
      (skill) =>
        !coreSkills.some(
          (coreSkill) => coreSkill.toLowerCase() === skill.toLowerCase(),
        ),
    )
    .slice(0, 8);
  const languages = uniqueStrings(
    input.profile.spokenLanguages
      .map((entry) => [entry.language, entry.proficiency].filter(Boolean).join(" — "))
      .filter(Boolean),
  ).slice(0, 6);
  const workModeSummary = input.job.workMode.join(", ") || "flexible";
  const roleTarget = input.job.title || input.searchPreferences.targetRoles[0] || "the target role";
  const headline = input.profile.headline ?? roleTarget;
  const synthesizedSummary = `${headline} with ${input.profile.yearsExperience ? `${input.profile.yearsExperience}+ years of experience` : "relevant experience"} building delivery across ${targetedKeywords.slice(0, 3).join(", ") || "core role requirements"} in ${workModeSummary} environments.`;
  const preferredStoredSummary =
    input.profile.professionalSummary.fullSummary ??
    input.profile.professionalSummary.shortValueProposition ??
    input.profile.summary ??
    null;
  const summary = shouldPreferStoredSummary({
    storedSummary: preferredStoredSummary,
    roleTarget,
  })
    ? (preferredStoredSummary ?? synthesizedSummary)
    : synthesizedSummary;
  const experienceHighlights: string[] = [];
  const experienceEntries = input.profile.experiences.slice(0, 3).map((experience) => {
    const bullets = buildExperienceBullets({
      experience,
      proofBank: input.profile.proofBank,
    });

    return {
      title: experience.title,
      employer: experience.companyName,
      location: experience.location,
      dateRange: formatDateRange(experience.startDate, experience.isCurrent ? "Present" : experience.endDate),
      summary: shouldKeepExperienceSummary({
        summary: experience.summary,
        bullets,
      })
        ? experience.summary
        : null,
      bullets,
      profileRecordId: experience.id,
    };
  });
  const projectEntries = input.profile.projects.slice(0, 2).map((project) => ({
    name: project.name,
    role: project.role,
    summary: project.summary,
    outcome: project.outcome,
    bullets: [],
    profileRecordId: project.id,
  }));
  const educationEntries = input.profile.education.slice(0, 2).map((entry) => ({
    school: entry.schoolName,
    degree: entry.degree,
    fieldOfStudy: entry.fieldOfStudy,
    location: entry.location,
    dateRange: formatDateRange(entry.startDate, entry.endDate),
    summary: entry.summary,
    profileRecordId: entry.id,
  }));
  const certificationEntries = input.profile.certifications.slice(0, 3).map((entry) => ({
    name: entry.name,
    issuer: entry.issuer,
    dateRange: formatDateRange(entry.issueDate, entry.expiryDate),
    profileRecordId: null,
  }));
  const fullText = buildDeterministicResumeText(
    input.profile,
    input.job,
    summary,
    experienceHighlights,
    coreSkills,
    targetedKeywords,
    experienceEntries,
    projectEntries,
    educationEntries,
    certificationEntries,
    additionalSkills,
    languages,
  );

  return TailoredResumeDraftSchema.parse({
    label: "Tailored Resume",
    summary,
    experienceHighlights,
    coreSkills,
    targetedKeywords,
    experienceEntries,
    projectEntries,
    educationEntries,
    certificationEntries,
    additionalSkills,
    languages,
    fullText,
    compatibilityScore: clampScore(78 + Math.min(input.job.keySkills.length * 3, 18)),
    notes: ["Used the built-in deterministic resume tailorer."],
  });
}

export function composeDeterministicFullText(input: {
  coreSkills: readonly string[];
  experienceHighlights: readonly string[];
  experienceEntries?: readonly {
    title: string | null;
    employer: string | null;
    location: string | null;
    dateRange: string | null;
    summary: string | null;
    bullets: readonly string[];
  }[];
  projectEntries?: readonly {
    name: string | null;
    role: string | null;
    summary: string | null;
    outcome: string | null;
    bullets: readonly string[];
  }[];
  educationEntries?: readonly {
    school: string | null;
    degree: string | null;
    fieldOfStudy: string | null;
    location: string | null;
    dateRange: string | null;
    summary: string | null;
  }[];
  certificationEntries?: readonly {
    name: string | null;
    issuer: string | null;
    dateRange: string | null;
  }[];
  additionalSkills?: readonly string[];
  languages?: readonly string[];
  label?: string | null;
  notes?: readonly string[];
  summary: string;
  targetedKeywords: readonly string[];
}) {
  const stringifyEntry = (parts: readonly (string | null | undefined)[]) =>
    parts.filter(Boolean).join(" | ");

  return [
    input.label ?? null,
    input.summary,
    ...(input.experienceEntries ?? []).flatMap((entry) => [
      stringifyEntry([entry.title, entry.employer, entry.location, entry.dateRange]),
      entry.summary,
      ...entry.bullets,
    ]),
    ...input.experienceHighlights,
    input.coreSkills.length > 0 ? `Core skills: ${input.coreSkills.join(", ")}` : null,
    input.additionalSkills && input.additionalSkills.length > 0
      ? `Additional skills: ${input.additionalSkills.join(", ")}`
      : null,
    input.languages && input.languages.length > 0
      ? `Languages: ${input.languages.join(", ")}`
      : null,
    ...(input.projectEntries ?? []).flatMap((entry) => [
      stringifyEntry([entry.name, entry.role]),
      [entry.summary, entry.outcome].filter(Boolean).join(" "),
      ...entry.bullets,
    ]),
    ...(input.educationEntries ?? []).flatMap((entry) => [
      stringifyEntry([
        entry.school,
        [entry.degree, entry.fieldOfStudy].filter(Boolean).join(", "),
        entry.location,
        entry.dateRange,
      ]),
      entry.summary,
    ]),
    ...(input.certificationEntries ?? []).map((entry) =>
      stringifyEntry([entry.name, entry.issuer, entry.dateRange]),
    ),
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
    baseDraft.summary;
  const experienceBullets = baseDraft.experienceEntries.flatMap((entry) => entry.bullets);
  const experienceHighlights = uniqueStrings(
    (input.researchContext?.priorityThemes ?? []).filter(
      (entry) => isDistinctQualityLine(entry, experienceBullets),
    ),
  ).slice(0, 4);
  const coreSkills = filterGroundedVisibleSkills(
    input.profile,
    [
      ...(evidence?.skills ?? []),
      ...baseDraft.coreSkills,
    ],
    8,
  );
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
    experienceEntries: baseDraft.experienceEntries,
    projectEntries: baseDraft.projectEntries,
    educationEntries: baseDraft.educationEntries,
    certificationEntries: baseDraft.certificationEntries,
    additionalSkills: baseDraft.additionalSkills,
    languages: baseDraft.languages,
    targetedKeywords,
    notes,
  });

  return TailoredResumeDraftSchema.parse({
    ...baseDraft,
    summary,
    experienceHighlights,
    coreSkills,
    targetedKeywords,
    experienceEntries: baseDraft.experienceEntries,
    projectEntries: baseDraft.projectEntries,
    educationEntries: baseDraft.educationEntries,
    certificationEntries: baseDraft.certificationEntries,
    additionalSkills: baseDraft.additionalSkills,
    languages: baseDraft.languages,
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
        targetEntryId: null,
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
    const unlockedEntryBullets = experienceSection.entries.flatMap((entry) =>
      entry.locked
        ? []
        : entry.bullets
            .filter((bullet) => !bullet.locked)
            .map((bullet) => ({ bullet, entryId: entry.id })),
    );
    const unlockedBullets = experienceSection.bullets
      .filter((bullet) => !bullet.locked)
      .map((bullet) => ({ bullet, entryId: null as string | null }));
    const candidateBullets = unlockedEntryBullets.length > 0 ? unlockedEntryBullets : unlockedBullets;
    const keywordMatchedBullet = candidateBullets.find((item) =>
      item.bullet.text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 3)
        .some((token) => lowerRequest.includes(token)),
    ) ?? null;
    const targetBullet = requestedOrdinalIndex >= 0
      ? candidateBullets[requestedOrdinalIndex] ?? null
      : keywordMatchedBullet ?? candidateBullets[0] ?? null;

    if (targetBullet) {
      const tightenedBullet = tightenSentence(targetBullet.bullet.text);
      if (tightenedBullet === targetBullet.bullet.text) {
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
        targetEntryId: targetBullet.entryId,
        targetBulletId: targetBullet.bullet.id,
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
