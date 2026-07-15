import type {
  CandidateProfile,
  FitRecommendation,
  JobPosting,
  JobRequirementAssessment,
  JobRequirementImportance,
  ResumeRequirementEvidence,
} from "@unemployed/contracts";

import { normalizeText, uniqueStrings } from "./shared";

const technologySignals = [
  { label: "TypeScript", aliases: ["typescript"] },
  { label: "JavaScript", aliases: ["javascript"] },
  { label: "Node.js", aliases: ["node js", "nodejs"] },
  { label: "React", aliases: ["react"] },
  { label: "Next.js", aliases: ["next js", "nextjs"] },
  { label: "React Native", aliases: ["react native"] },
  { label: "Electron", aliases: ["electron"] },
  { label: ".NET", aliases: ["net", "dotnet"] },
  { label: "ASP.NET", aliases: ["asp net", "aspnet"] },
  { label: "C#", aliases: ["csharp"] },
  { label: "Python", aliases: ["python"] },
  { label: "FastAPI", aliases: ["fastapi", "fast api"] },
  { label: "Django", aliases: ["django"] },
  { label: "Java", aliases: ["java"] },
  { label: "Kotlin", aliases: ["kotlin"] },
  { label: "Go", aliases: ["golang"] },
  { label: "Rust", aliases: ["rust"] },
  { label: "PHP", aliases: ["php"] },
  { label: "Ruby", aliases: ["ruby"] },
  { label: "Rails", aliases: ["rails", "ruby on rails"] },
  { label: "Elixir", aliases: ["elixir"] },
  { label: "Phoenix", aliases: ["phoenix"] },
  { label: "AWS", aliases: ["aws", "amazon web services"] },
  { label: "Azure", aliases: ["azure"] },
  { label: "Google Cloud", aliases: ["gcp", "google cloud"] },
  { label: "Docker", aliases: ["docker"] },
  { label: "Kubernetes", aliases: ["kubernetes", "k8s"] },
  { label: "Terraform", aliases: ["terraform"] },
  { label: "PostgreSQL", aliases: ["postgresql", "postgres"] },
  { label: "MySQL", aliases: ["mysql"] },
  { label: "MongoDB", aliases: ["mongodb", "mongo db"] },
  { label: "Redis", aliases: ["redis"] },
  { label: "Kafka", aliases: ["kafka"] },
  { label: "GraphQL", aliases: ["graphql", "graph ql"] },
  { label: "Cypress", aliases: ["cypress"] },
  { label: "Playwright", aliases: ["playwright"] },
] as const;

const preferredMarkers = /\b(?:nice to have|preferred|ideally|bonus|plus)\b/iu;
const requiredMarkers =
  /\b(?:must|required|requirements|minimum|at least|you have|you bring|we expect|need to have|strong|solid hands-on|deep hands-on|proven|demonstrated|experience with|experience building)\b/iu;

function containsPhrase(value: string, phrases: readonly string[]): boolean {
  const normalizedValue = ` ${normalizeText(value)} `;
  return phrases.some((phrase) =>
    normalizedValue.includes(` ${normalizeText(phrase)} `),
  );
}

function decodeJobMarkup(value: string): string {
  return value
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#(?:39|x27);/giu, "'")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/<\s*br\s*\/?\s*>/giu, "\n")
    .replace(/<\/?(?:p|li|ul|ol|h[1-6]|section|div)[^>]*>/giu, "\n")
    .replace(/<[^>]+>/gu, " ");
}

function splitJobEvidence(value: string): string[] {
  return uniqueStrings(
    decodeJobMarkup(value)
      .split(/\r?\n|(?<=[.!?])\s+(?=[A-Z0-9])/u)
      .map((part) => part.replace(/\s+/gu, " ").trim())
      .filter((part) => part.length >= 8),
  );
}

function clip(value: string, limit = 220): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1).trim()}…`;
}

function findEvidenceLine(
  lines: readonly string[],
  aliases: readonly string[],
): string | null {
  return lines.find((line) => containsPhrase(line, aliases)) ?? null;
}

function inferImportance(input: {
  title: string;
  aliases: readonly string[];
  evidenceLine: string;
  minimumQualifications: readonly string[];
  preferredQualifications: readonly string[];
  evidenceLines: readonly string[];
}): JobRequirementImportance {
  if (
    containsPhrase(input.title, input.aliases) ||
    input.minimumQualifications.some((value) =>
      containsPhrase(value, input.aliases),
    )
  ) {
    return "required";
  }

  if (
    input.preferredQualifications.some((value) =>
      containsPhrase(value, input.aliases),
    ) ||
    preferredMarkers.test(input.evidenceLine)
  ) {
    return "preferred";
  }

  if (requiredMarkers.test(input.evidenceLine)) {
    return "required";
  }

  const evidenceIndex = input.evidenceLines.indexOf(input.evidenceLine);
  for (
    let index = evidenceIndex - 1;
    index >= Math.max(0, evidenceIndex - 4);
    index -= 1
  ) {
    const previousLine = input.evidenceLines[index]!;
    if (previousLine.length > 100) {
      break;
    }
    if (preferredMarkers.test(previousLine)) {
      return "preferred";
    }
    if (
      /^(?:requirements?|minimum qualifications?|what (?:you|we) (?:bring|expect|are looking for)|what you should bring|must have)$/iu.test(
        previousLine.trim(),
      )
    ) {
      return "required";
    }
  }

  return "inferred";
}

function collectProfileRoleEvidence(
  profile: CandidateProfile,
  aliases: readonly string[],
): ResumeRequirementEvidence[] {
  const evidence = profile.experiences.flatMap((experience) => {
    const values = [
      experience.title,
      experience.summary,
      ...experience.achievements,
      ...experience.skills,
    ].filter((value): value is string => typeof value === "string");
    const matched = values.find((value) => containsPhrase(value, aliases));
    if (!matched) {
      return [];
    }

    return [
      {
        sourceKind: "experience" as const,
        sourceId: experience.id,
        label: [experience.title, experience.companyName]
          .filter(Boolean)
          .join(" at "),
        detail: clip(matched),
      },
    ];
  });

  return evidence.slice(0, 3);
}

function collectProfileSkillEvidence(
  profile: CandidateProfile,
  aliases: readonly string[],
): ResumeRequirementEvidence[] {
  const directSkills = uniqueStrings([
    ...profile.skills,
    ...profile.skillGroups.coreSkills,
    ...profile.skillGroups.tools,
    ...profile.skillGroups.languagesAndFrameworks,
    ...profile.skillGroups.highlightedSkills,
  ]);
  const evidence: ResumeRequirementEvidence[] = [];
  const directSkill = directSkills.find((skill) =>
    containsPhrase(skill, aliases),
  );

  if (directSkill) {
    evidence.push({
      sourceKind: "profile_skill",
      sourceId: null,
      label: `Profile skill: ${directSkill}`,
      detail: `${directSkill} is explicitly listed in the imported profile.`,
    });
  }

  for (const experience of profile.experiences) {
    const values = [
      ...experience.skills,
      ...experience.achievements,
      experience.summary,
    ].filter((value): value is string => typeof value === "string");
    const matched = values.find((value) => containsPhrase(value, aliases));
    if (!matched) {
      continue;
    }

    evidence.push({
      sourceKind: "experience",
      sourceId: experience.id,
      label: [experience.title, experience.companyName]
        .filter(Boolean)
        .join(" at "),
      detail: clip(matched),
    });
  }

  for (const project of profile.projects) {
    const values = [
      ...project.skills,
      project.summary,
      project.outcome,
    ].filter((value): value is string => typeof value === "string");
    const matched = values.find((value) => containsPhrase(value, aliases));
    if (!matched) {
      continue;
    }

    evidence.push({
      sourceKind: "project",
      sourceId: project.id,
      label: project.name,
      detail: clip(matched),
    });
  }

  return evidence.slice(0, 3);
}

function requirementId(category: string, label: string): string {
  return `requirement_${category}_${normalizeText(label).replaceAll(" ", "_")}`;
}

export function buildRequirementEvidenceAssessment(input: {
  profile: CandidateProfile;
  posting: JobPosting;
  matchesLocation: boolean;
  matchesWorkMode: boolean;
  hasLocationPreferences: boolean;
  hasWorkModePreferences: boolean;
}): JobRequirementAssessment[] {
  const { profile, posting } = input;
  const jobText = [
    posting.title,
    posting.description,
    ...posting.keySkills,
    ...posting.minimumQualifications,
    ...posting.preferredQualifications,
    ...posting.responsibilities,
  ].join("\n");
  const evidenceLines = splitJobEvidence(jobText);
  const requirements: JobRequirementAssessment[] = [];

  const technologyRequirements = technologySignals.flatMap((technology) => {
    const evidenceLine = findEvidenceLine(evidenceLines, technology.aliases);
    if (!evidenceLine) {
      return [];
    }

    const importance = inferImportance({
      title: posting.title,
      aliases: technology.aliases,
      evidenceLine,
      minimumQualifications: posting.minimumQualifications,
      preferredQualifications: posting.preferredQualifications,
      evidenceLines,
    });
    const resumeEvidence = collectProfileSkillEvidence(
      profile,
      technology.aliases,
    );

    return [
      {
        id: requirementId("skill", technology.label),
        category: "skill" as const,
        label: technology.label,
        importance,
        status: resumeEvidence.length > 0 ? ("supported" as const) : ("missing" as const),
        jobEvidence: clip(evidenceLine),
        resumeEvidence,
        explanation:
          resumeEvidence.length > 0
            ? `The resume contains explicit ${technology.label} evidence.`
            : `No explicit ${technology.label} evidence was found in the imported resume.`,
      },
    ];
  });

  requirements.push(
    ...technologyRequirements
      .sort((left, right) => {
        const importanceRank = { required: 0, preferred: 1, inferred: 2 };
        return (
          importanceRank[left.importance] - importanceRank[right.importance]
        );
      })
      .slice(0, 12),
  );

  if (/\b(?:site reliability|sre)\b/iu.test(posting.title)) {
    const aliases = [
      "site reliability",
      "sre",
      "kubernetes",
      "terraform",
      "incident response",
      "on call",
    ];
    const resumeEvidence = collectProfileRoleEvidence(profile, aliases);
    requirements.push({
      id: requirementId("domain", "site reliability operations"),
      category: "domain",
      label: "Site reliability operations",
      importance: "required",
      status: resumeEvidence.length > 0 ? "supported" : "missing",
      jobEvidence: posting.title,
      resumeEvidence,
      explanation:
        resumeEvidence.length > 0
          ? "The resume contains explicit production-operations or site-reliability evidence."
          : "The resume does not explicitly show SRE, on-call, incident-response, observability, Kubernetes, or infrastructure-as-code ownership.",
    });
  }

  const yearsEvidenceLine = evidenceLines.find((line) =>
    /\b\d{1,2}\+?\s*(?:years|yrs)\b.*\bexperience\b|\bexperience\b.*\b\d{1,2}\+?\s*(?:years|yrs)\b/iu.test(
      line,
    ),
  );
  const yearsMatch = yearsEvidenceLine?.match(
    /\b(\d{1,2})\+?\s*(?:years|yrs)\b/iu,
  );
  if (yearsEvidenceLine && yearsMatch?.[1]) {
    const requiredYears = Number.parseInt(yearsMatch[1], 10);
    const supported = profile.yearsExperience >= requiredYears;
    requirements.push({
      id: requirementId("experience", `${requiredYears} years`),
      category: "experience",
      label: `${requiredYears}+ years of experience`,
      importance: preferredMarkers.test(yearsEvidenceLine)
        ? "preferred"
        : "required",
      status: supported ? "supported" : "missing",
      jobEvidence: clip(yearsEvidenceLine),
      resumeEvidence: [
        {
          sourceKind: "profile",
          sourceId: profile.id,
          label: "Imported experience timeline",
          detail: `${profile.yearsExperience} years of experience are recorded in the profile.`,
        },
      ],
      explanation: supported
        ? "The imported experience timeline meets the stated threshold."
        : "The imported experience timeline is below the stated threshold.",
    });
  }

  if (input.hasLocationPreferences) {
    const locationStatus = input.matchesLocation
      ? "supported"
      : profile.workEligibility.willingToRelocate === false
        ? "conflict"
        : "unknown";
    requirements.push({
      id: requirementId("location", posting.location),
      category: "location",
      label: `Location: ${posting.location}`,
      importance: "required",
      status: locationStatus,
      jobEvidence: posting.location,
      resumeEvidence: [
        {
          sourceKind: "profile",
          sourceId: profile.id,
          label: "Current location",
          detail: profile.currentLocation,
        },
      ],
      explanation: input.matchesLocation
        ? "The listing location is compatible with the saved search area."
        : profile.workEligibility.willingToRelocate === false
          ? "The listing location is outside the saved search area and the profile rules out relocation."
          : "The listing location is outside the saved search area; relocation needs confirmation.",
    });
  }

  if (input.hasWorkModePreferences && posting.workMode.length > 0) {
    requirements.push({
      id: requirementId("work_mode", posting.workMode.join(" ")),
      category: "work_mode",
      label: `Work mode: ${posting.workMode.join(", ")}`,
      importance: "required",
      status: input.matchesWorkMode ? "supported" : "conflict",
      jobEvidence: `${posting.location}; ${posting.workMode.join(", ")}`,
      resumeEvidence: [
        {
          sourceKind: "profile",
          sourceId: profile.id,
          label: "Remote-work eligibility",
          detail:
            profile.workEligibility.remoteEligible === null
              ? "Remote-work eligibility is not confirmed in the profile."
              : profile.workEligibility.remoteEligible
                ? "The profile confirms remote-work eligibility."
                : "The profile does not confirm remote-work eligibility.",
        },
      ],
      explanation: input.matchesWorkMode
        ? "The listing work mode matches the saved preference."
        : "The listing work mode conflicts with the saved preference.",
    });
  }

  const noSponsorshipLine = evidenceLines.find((line) =>
    /\b(?:no|not)\s+(?:visa\s+)?sponsorship|\bmust\s+(?:already\s+)?(?:have|hold)\b.*\b(?:work authorization|right to work)\b/iu.test(
      line,
    ),
  );
  if (noSponsorshipLine) {
    const sponsorship = profile.workEligibility.requiresVisaSponsorship;
    requirements.push({
      id: requirementId("work_authorization", "work authorization"),
      category: "work_authorization",
      label: "Work authorization without sponsorship",
      importance: "required",
      status:
        sponsorship === true
          ? "conflict"
          : sponsorship === false
            ? "supported"
            : "unknown",
      jobEvidence: clip(noSponsorshipLine),
      resumeEvidence:
        sponsorship === null
          ? []
          : [
              {
                sourceKind: "profile",
                sourceId: profile.id,
                label: "Visa sponsorship preference",
                detail: sponsorship
                  ? "The profile records that visa sponsorship is required."
                  : "The profile records that visa sponsorship is not required.",
              },
            ],
      explanation:
        sponsorship === true
          ? "The listing rejects sponsorship while the profile records that sponsorship is required."
          : sponsorship === false
            ? "The saved sponsorship preference is compatible with the listing."
            : "Work-authorization evidence is missing from the profile and needs confirmation.",
    });
  }

  return requirements;
}

export function buildFitRecommendation(input: {
  score: number;
  requirements: readonly JobRequirementAssessment[];
}): {
  recommendation: FitRecommendation;
  rationale: string;
} {
  const hardConflicts = input.requirements.filter(
    (requirement) =>
      requirement.importance === "required" && requirement.status === "conflict",
  );
  const missingRequired = input.requirements.filter(
    (requirement) =>
      requirement.importance === "required" && requirement.status === "missing",
  );
  const unknownRequired = input.requirements.filter(
    (requirement) =>
      requirement.importance === "required" && requirement.status === "unknown",
  );
  const missingDetected = input.requirements.filter(
    (requirement) => requirement.status === "missing",
  );

  if (hardConflicts.length > 0) {
    return {
      recommendation: "skip",
      rationale: `${hardConflicts[0]!.label} conflicts with the saved profile or search preferences.`,
    };
  }

  if (missingRequired.length > 0 || unknownRequired.length > 0) {
    const requirement = missingRequired[0] ?? unknownRequired[0]!;
    return {
      recommendation: "review_before_applying",
      rationale: `${requirement.label} is not yet supported by explicit resume evidence.`,
    };
  }

  if (missingDetected.length >= 3) {
    return {
      recommendation: "review_before_applying",
      rationale: `${missingDetected.length} detected requirements are not backed by explicit resume evidence.`,
    };
  }

  if (input.score >= 86 && missingDetected.length === 0) {
    return {
      recommendation: "strong_fit",
      rationale: "No hard conflicts or unsupported required requirements were detected.",
    };
  }

  if (input.score >= 72) {
    return {
      recommendation: "apply_with_original",
      rationale: "The original resume has credible evidence for the detected requirements, with no hard blocker found.",
    };
  }

  return {
    recommendation: "review_before_applying",
    rationale: "The fit is plausible, but the evidence is not strong enough for an unqualified recommendation.",
  };
}
