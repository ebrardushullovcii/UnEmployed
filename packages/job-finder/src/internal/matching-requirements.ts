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

function containsTechnologySignal(
  value: string,
  technology: (typeof technologySignals)[number],
): boolean {
  // Punctuation-heavy and ordinary-word technology names cannot safely use
  // the generic normalized phrase matcher. Normalizing `C#` to `c` misses a
  // real requirement, while normalizing `.NET` to `net` and `Go` to `go`
  // turns ordinary prose ("net revenue", "go beyond") into skill gaps.
  switch (technology.label) {
    case "C#":
      return /(?:^|[^\p{L}\p{N}_])(?:c#|c\s*sharp|csharp)(?=$|[^\p{L}\p{N}_])/iu.test(
        value,
      );
    case ".NET":
      return /(?:^|[^\p{L}\p{N}_])(?:\.net|dotnet)(?=$|[^\p{L}\p{N}_])/iu.test(
        value,
      );
    case "Go": {
      const trimmed = value.trim();
      if (/^(?:go|golang)$/iu.test(trimmed) || /\bgolang\b/iu.test(value)) {
        return true;
      }

      return (
        /\b(?:experience|experienced|proficiency|proficient|knowledge|skills?|programming|develop(?:ing|ment)?|build(?:ing|s)?)\b[^.!?\n]{0,48}\bGo\b/u.test(
          value,
        ) ||
        /\bGo\b\s*(?:[,/&|]|\band\b)\s*(?:Java|JavaScript|TypeScript|Python|Rust|C\+\+|Kotlin|Ruby|PHP|Elixir)\b/u.test(
          value,
        )
      );
    }
    case "React":
      return (
        /^react$/iu.test(value.trim()) ||
        /\bReact\b(?!\s+(?:Native|to|with|when|by)\b)/u.test(value)
      );
    default:
      return containsPhrase(value, technology.aliases);
  }
}

function isAlternativeTechnologyLine(line: string): boolean {
  return (
    /\b(?:one|1)\+?\s+(?:or more\s+)?[^.!?\n]{0,48}\b(?:languages?|frameworks?|technologies|stacks?|tools?)\b/iu.test(
      line,
    ) ||
    /\b(?:any of|either|one of|such as|for example|e\.g\.)\b/iu.test(line) ||
    /(?:,|\bor\b)\s*etc\.?\s*[).]?$/iu.test(line.trim())
  );
}

function collectExplicitDomainEvidence(input: {
  profile: CandidateProfile;
  domainPattern: RegExp;
  deliveryPattern: RegExp;
}): ResumeRequirementEvidence[] {
  const evidence: ResumeRequirementEvidence[] = [];
  for (const experience of input.profile.experiences) {
    const matched = [experience.summary, ...experience.achievements]
      .filter((value): value is string => typeof value === "string")
      .find(
        (value) =>
          input.domainPattern.test(value) && input.deliveryPattern.test(value),
      );
    if (matched) {
      evidence.push({
        sourceKind: "experience",
        sourceId: experience.id,
        label: [experience.title, experience.companyName]
          .filter(Boolean)
          .join(" at "),
        detail: clip(matched),
      });
    }
  }

  for (const project of input.profile.projects) {
    const matched = [project.summary, project.outcome]
      .filter((value): value is string => typeof value === "string")
      .find(
        (value) =>
          input.domainPattern.test(value) && input.deliveryPattern.test(value),
      );
    if (matched) {
      evidence.push({
        sourceKind: "project",
        sourceId: project.id,
        label: project.name,
        detail: clip(matched),
      });
    }
  }

  return evidence.slice(0, 3);
}

function dedupeRequirementEvidence(
  evidence: readonly ResumeRequirementEvidence[],
): ResumeRequirementEvidence[] {
  const seen = new Set<string>();
  return evidence.filter((entry) => {
    const key = [entry.sourceKind, entry.sourceId ?? "", entry.detail].join(
      "|",
    );
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function scoreProductionAiEvidenceLine(line: string): number {
  return (
    Number(/\b(?:shipped?|deployed?|launched?)\b/iu.test(line)) * 2 +
    Number(/\bnot just prototypes?\b/iu.test(line)) * 2 +
    Number(/\bproduction\b/iu.test(line))
  );
}

function selectStrongestEvidenceLine(
  lines: readonly string[],
  pattern: RegExp,
): string | null {
  return (
    lines
      .filter((line) => pattern.test(line))
      .sort((left, right) => {
        const importanceRank = (line: string) =>
          requiredMarkers.test(line)
            ? 0
            : preferredMarkers.test(line)
              ? 1
              : 2;
        return importanceRank(left) - importanceRank(right);
      })[0] ?? null
  );
}

function parseCefrLevel(value: string): number | null {
  const match = /\b([ABC])\s*([12])\b/iu.exec(value);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  const ranks: Record<string, number> = {
    A1: 1,
    A2: 2,
    B1: 3,
    B2: 4,
    C1: 5,
    C2: 6,
  };
  return ranks[`${match[1].toUpperCase()}${match[2]}`] ?? null;
}

function inferImportance(input: {
  title: string;
  technology: (typeof technologySignals)[number];
  evidenceLine: string;
  minimumQualifications: readonly string[];
  preferredQualifications: readonly string[];
  evidenceLines: readonly string[];
}): JobRequirementImportance {
  if (
    containsTechnologySignal(input.title, input.technology) ||
    input.minimumQualifications.some((value) =>
      containsTechnologySignal(value, input.technology),
    )
  ) {
    return "required";
  }

  if (
    input.preferredQualifications.some((value) =>
      containsTechnologySignal(value, input.technology),
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
  technology: (typeof technologySignals)[number],
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
    containsTechnologySignal(skill, technology),
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
    const matched = values.find((value) =>
      containsTechnologySignal(value, technology),
    );
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
    const values = [...project.skills, project.summary, project.outcome].filter(
      (value): value is string => typeof value === "string",
    );
    const matched = values.find((value) =>
      containsTechnologySignal(value, technology),
    );
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

  const technologyMatches = technologySignals.flatMap((technology) => {
    const matchingEvidenceLines = evidenceLines.filter((line) =>
      containsTechnologySignal(line, technology),
    );
    const evidenceLine = [...matchingEvidenceLines].sort((left, right) => {
      const importanceRank = { required: 0, preferred: 1, inferred: 2 };
      const leftImportance = inferImportance({
        title: posting.title,
        technology,
        evidenceLine: left,
        minimumQualifications: posting.minimumQualifications,
        preferredQualifications: posting.preferredQualifications,
        evidenceLines,
      });
      const rightImportance = inferImportance({
        title: posting.title,
        technology,
        evidenceLine: right,
        minimumQualifications: posting.minimumQualifications,
        preferredQualifications: posting.preferredQualifications,
        evidenceLines,
      });
      return importanceRank[leftImportance] - importanceRank[rightImportance];
    })[0];
    if (!evidenceLine) {
      return [];
    }

    return [{ technology, evidenceLine }];
  });
  const alternativeTechnologyLines = uniqueStrings(
    technologyMatches
      .map((match) => match.evidenceLine)
      .filter(
        (line) =>
          isAlternativeTechnologyLine(line) &&
          technologyMatches.filter((match) => match.evidenceLine === line)
            .length >= 2,
      ),
  );
  const alternativeTechnologyRequirements = alternativeTechnologyLines.map(
    (evidenceLine) => {
      const alternatives = technologyMatches.filter(
        (match) => match.evidenceLine === evidenceLine,
      );
      const resumeEvidence = dedupeRequirementEvidence(
        alternatives.flatMap((match) =>
          collectProfileSkillEvidence(profile, match.technology),
        ),
      );
      const labels = alternatives.map((match) => match.technology.label);

      return {
        id: requirementId("skill", `one of ${labels.join(" ")}`),
        category: "skill" as const,
        label: `One of: ${labels.join(", ")}`,
        importance: inferImportance({
          title: posting.title,
          technology: alternatives[0]!.technology,
          evidenceLine,
          minimumQualifications: posting.minimumQualifications,
          preferredQualifications: posting.preferredQualifications,
          evidenceLines,
        }),
        status:
          resumeEvidence.length > 0
            ? ("supported" as const)
            : ("missing" as const),
        jobEvidence: clip(evidenceLine),
        resumeEvidence,
        explanation:
          resumeEvidence.length > 0
            ? `The resume contains explicit evidence for at least one accepted technology (${labels.join(", ")}).`
            : `No explicit evidence was found for any accepted technology (${labels.join(", ")}).`,
      };
    },
  );
  const technologyRequirements = technologyMatches.flatMap(
    ({ technology, evidenceLine }) => {
      if (alternativeTechnologyLines.includes(evidenceLine)) {
        return [];
      }

      const importance = inferImportance({
        title: posting.title,
        technology,
        evidenceLine,
        minimumQualifications: posting.minimumQualifications,
        preferredQualifications: posting.preferredQualifications,
        evidenceLines,
      });
      const resumeEvidence = collectProfileSkillEvidence(profile, technology);

      return [
        {
          id: requirementId("skill", technology.label),
          category: "skill" as const,
          label: technology.label,
          importance,
          status:
            resumeEvidence.length > 0
              ? ("supported" as const)
              : ("missing" as const),
          jobEvidence: clip(evidenceLine),
          resumeEvidence,
          explanation:
            resumeEvidence.length > 0
              ? `The resume contains explicit ${technology.label} evidence.`
              : `No explicit ${technology.label} evidence was found in the imported resume.`,
        },
      ];
    },
  );

  requirements.push(
    ...[...alternativeTechnologyRequirements, ...technologyRequirements]
      .sort((left, right) => {
        const importanceRank = { required: 0, preferred: 1, inferred: 2 };
        return (
          importanceRank[left.importance] - importanceRank[right.importance]
        );
      })
      .slice(0, 12),
  );

  const productionAiLine = evidenceLines
    .filter(
      (line) =>
        /\b(?:AI|artificial intelligence|LLMs?|large language models?|RAG|retrieval[- ]augmented generation|AI agents?)\b/iu.test(
          line,
        ) &&
        /\b(?:hands[- ]on|production|shipped?|deployed?|launched?|real (?:AI )?use case|not just prototypes?)\b/iu.test(
          line,
        ),
    )
    .sort(
      (left, right) =>
        scoreProductionAiEvidenceLine(right) -
        scoreProductionAiEvidenceLine(left),
    )[0];
  if (productionAiLine) {
    const resumeEvidence = collectExplicitDomainEvidence({
      profile,
      domainPattern:
        /\b(?:AI|artificial intelligence|LLMs?|large language models?|RAG|retrieval[- ]augmented generation|AI agents?|machine learning)\b/iu,
      deliveryPattern:
        /\b(?:production|shipped?|deployed?|launched?|released?|customers?|users?|live)\b/iu,
    });
    requirements.push({
      id: requirementId("domain", "production AI feature delivery"),
      category: "domain",
      label: "Production AI feature delivery",
      importance: requiredMarkers.test(productionAiLine)
        ? "required"
        : "inferred",
      status: resumeEvidence.length > 0 ? "supported" : "missing",
      jobEvidence: clip(productionAiLine),
      resumeEvidence,
      explanation:
        resumeEvidence.length > 0
          ? "The resume explicitly shows an AI or LLM feature shipped to production users."
          : "The resume does not explicitly show an AI or LLM feature shipped to production; generic AI interest or prototypes are not treated as evidence.",
    });
  }

  const productionScaleLine = evidenceLines.find(
    (line) =>
      /\b(?:high[- ]traffic|production applications?[^.!?]{0,40}(?:scale|scaling)|challenges? that come with scale|query optimization|performance bottlenecks?|careful migrations)\b/iu.test(
        line,
      ),
  );
  if (productionScaleLine) {
    const resumeEvidence = collectExplicitDomainEvidence({
      profile,
      domainPattern:
        /\b(?:high[- ]traffic|large[- ]scale|at scale|production scale|millions? of (?:users|requests|transactions)|thousands? of (?:requests|transactions) (?:per|a)|query optimization|performance bottlenecks?|zero[- ]downtime migrations?)\b/iu,
      deliveryPattern:
        /\b(?:production|shipped?|deployed?|launched?|scaled?|optimized?|handled?|served?|users?|requests?|transactions?|migrations?)\b/iu,
    });
    requirements.push({
      id: requirementId("domain", "high traffic production scaling"),
      category: "domain",
      label: "High-traffic production scaling",
      importance:
        requiredMarkers.test(productionScaleLine) ||
        /\b\d{1,2}\+?\s*years?\s+(?:of\s+)?experience\b/iu.test(
          productionScaleLine,
        )
          ? "required"
          : "inferred",
      status: resumeEvidence.length > 0 ? "supported" : "missing",
      jobEvidence: clip(productionScaleLine),
      resumeEvidence,
      explanation:
        resumeEvidence.length > 0
          ? "The resume explicitly shows production work at material traffic or scaling depth."
          : "The resume does not explicitly show high-traffic production scaling; general performance work is not treated as proof of traffic scale.",
    });
  }

  const experimentationLine = selectStrongestEvidenceLine(
    evidenceLines,
    /\b(?:experimentation|experiments?|A\/?B tests?)\b/iu,
  );
  if (experimentationLine) {
    const resumeEvidence = collectProfileRoleEvidence(profile, [
      "experimentation",
      "experiment",
      "experiments",
      "A/B",
      "A/B tests",
      "A/B testing",
    ]);
    requirements.push({
      id: requirementId("domain", "experimentation and measurement"),
      category: "domain",
      label: "Experimentation and measurement",
      importance: requiredMarkers.test(experimentationLine)
        ? "required"
        : preferredMarkers.test(experimentationLine)
          ? "preferred"
          : "inferred",
      status: resumeEvidence.length > 0 ? "supported" : "missing",
      jobEvidence: clip(experimentationLine),
      resumeEvidence,
      explanation:
        resumeEvidence.length > 0
          ? "The resume explicitly shows experimentation or A/B testing experience."
          : "The resume does not explicitly show designing, running, or measuring experiments.",
    });
  }

  const englishProficiencyLine = selectStrongestEvidenceLine(
    evidenceLines,
    /\b(?:English[^.!?\n]{0,60}(?:CEFR\s+Level\s+)?[ABC][12]|(?:proficient|fluent|professional proficiency|native)[^.!?\n]{0,24}English)\b/iu,
  );
  if (englishProficiencyLine) {
    const englishRecord = profile.spokenLanguages.find(
      (language) => normalizeText(language.language) === "english",
    );
    const requiredLevel = parseCefrLevel(englishProficiencyLine);
    const storedProficiency = englishRecord?.proficiency ?? "";
    const storedLevel = parseCefrLevel(storedProficiency);
    const storedNativeOrBilingual =
      /\b(?:native|bilingual|mother tongue)\b/iu.test(storedProficiency);
    const supported = Boolean(
      englishRecord &&
        (requiredLevel === null ||
          storedNativeOrBilingual ||
          (storedLevel !== null && storedLevel >= requiredLevel)),
    );
    const resumeEvidence = englishRecord
      ? [
          {
            sourceKind: "profile" as const,
            sourceId: profile.id,
            label: "English proficiency",
            detail: [englishRecord.language, englishRecord.proficiency]
              .filter(Boolean)
              .join(" — "),
          },
        ]
      : [];
    requirements.push({
      id: requirementId("domain", "English proficiency"),
      category: "domain",
      label: requiredLevel === null ? "English proficiency" : "English proficiency at the stated CEFR level",
      importance:
        requiredMarkers.test(englishProficiencyLine) ||
        /\byou (?:are|must|need to be)\b/iu.test(englishProficiencyLine)
          ? "required"
          : "inferred",
      status: supported ? "supported" : "missing",
      jobEvidence: clip(englishProficiencyLine),
      resumeEvidence,
      explanation: supported
        ? "The saved English proficiency meets the listing's stated level."
        : englishRecord
          ? "English is present in the profile, but the saved proficiency does not meet the listing's stated level."
          : "The profile does not contain explicit English proficiency evidence.",
    });
  }

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
    const isRemotePosting = posting.workMode.includes("remote");
    const workModeStatus = !input.matchesWorkMode
      ? "conflict"
      : isRemotePosting && profile.workEligibility.remoteEligible === false
        ? "conflict"
        : isRemotePosting && profile.workEligibility.remoteEligible === null
          ? "unknown"
          : "supported";
    requirements.push({
      id: requirementId("work_mode", posting.workMode.join(" ")),
      category: "work_mode",
      label: `Work mode: ${posting.workMode.join(", ")}`,
      importance: "required",
      status: workModeStatus,
      jobEvidence: uniqueStrings([posting.location, ...posting.workMode]).join(
        "; ",
      ),
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
      explanation: !input.matchesWorkMode
        ? "The listing work mode conflicts with the saved preference."
        : isRemotePosting && profile.workEligibility.remoteEligible === null
          ? "The listing matches the saved remote-work preference, but remote-work eligibility is not confirmed in the profile."
          : isRemotePosting && profile.workEligibility.remoteEligible === false
            ? "The listing is remote, but the profile does not confirm remote-work eligibility."
            : "The listing work mode matches the saved preference.",
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
      requirement.importance === "required" &&
      requirement.status === "conflict",
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
      rationale:
        "No hard conflicts or unsupported required requirements were detected.",
    };
  }

  if (input.score >= 72) {
    return {
      recommendation: "apply_with_original",
      rationale:
        "The original resume has credible evidence for the detected requirements, with no hard blocker found.",
    };
  }

  return {
    recommendation: "review_before_applying",
    rationale:
      "The fit is plausible, but the evidence is not strong enough for an unqualified recommendation.",
  };
}
