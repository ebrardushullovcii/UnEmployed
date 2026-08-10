import { z } from "zod";

import type { CreateResumeDraftInput, TailorResumeInput } from "./shared";

const EvidenceReferenceSchema = z.string().trim().min(1).max(300);
const EvidenceReferenceListSchema = z
  .array(EvidenceReferenceSchema)
  .min(1)
  .max(8);
const EvidenceLinkedTextSchema = z.object({
  text: z.string().trim().min(1).max(1_000),
  evidenceRefs: EvidenceReferenceListSchema,
});

export type ResumeGenerationInput = CreateResumeDraftInput | TailorResumeInput;

export type ResumeGenerationEvidenceScope =
  | "profile"
  | "experience"
  | "project"
  | "proof"
  | "import_evidence";

export interface ResumeGenerationEvidenceItem {
  id: string;
  text: string;
  scope: ResumeGenerationEvidenceScope;
  profileRecordId: string | null;
}

export interface ParsedEvidenceLinkedText {
  text: string;
  evidenceRefs: string[];
}

export interface ResumeRewriteSelection {
  text: string;
  kind: "canonical" | "grounded_rewrite";
  referencedEvidenceText: string[];
}

const RESUME_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "been",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "through",
  "to",
  "using",
  "via",
  "with",
]);

const RESUME_TOKEN_SYNONYM_GROUPS = [
  ["build", "create", "develop", "engineer", "implement"],
  ["design", "architect"],
  ["deliver", "launch", "release", "ship"],
  ["direct", "lead", "manage", "own"],
  ["collaborate", "partner", "work"],
  ["improve", "enhance", "optimize", "raise"],
  ["decrease", "cut", "reduce"],
  ["boost", "grow", "increase"],
  ["maintain", "operate", "support"],
] as const;

const RESUME_TOKEN_SYNONYMS = new Map<string, string>(
  RESUME_TOKEN_SYNONYM_GROUPS.flatMap((group, groupIndex) =>
    group.map((token) => [token, `group_${groupIndex}`] as const),
  ),
);

const UNSUPPORTED_ABSOLUTE_CLAIM_PATTERN =
  /\b(?:best[- ]in[- ]class|industry[- ]leading|unparalleled|visionary|world[- ]class|guaranteed|mastered every|expert in every)\b/i;
const FIRST_PERSON_PATTERN = /\b(?:i|me|my|mine|we|our|ours)\b/i;
const NUMBER_OR_METRIC_PATTERN =
  /(?:[$€£]\s*)?\d+(?:[.,]\d+)*(?:\s*(?:%|x|k|m|b|million|billion|thousand))?/gi;

function normalizeNullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeToken(value: string): string {
  let normalized = value
    .toLowerCase()
    .replace(/^[^a-z0-9+#.]+|[^a-z0-9+#.]+$/g, "");

  if (normalized.length > 6 && normalized.endsWith("ing")) {
    normalized = normalized.slice(0, -3);
  } else if (normalized.length > 5 && normalized.endsWith("ed")) {
    normalized = normalized.slice(0, -2);
  } else if (normalized.length > 5 && normalized.endsWith("ies")) {
    normalized = `${normalized.slice(0, -3)}y`;
  } else if (normalized.length > 5 && normalized.endsWith("es")) {
    normalized = normalized.slice(0, -2);
  } else if (normalized.length > 4 && normalized.endsWith("s")) {
    normalized = normalized.slice(0, -1);
  }

  if (normalized.startsWith("reliab")) {
    return "reliab";
  }

  return RESUME_TOKEN_SYNONYMS.get(normalized) ?? normalized;
}

function meaningfulTokens(value: string): string[] {
  return Array.from(
    new Set(
      (value.match(/[A-Za-z0-9][A-Za-z0-9+#.%-]*/g) ?? [])
        .map((token) => normalizeToken(token))
        .filter(
          (token) =>
            token.length >= 2 &&
            !RESUME_STOP_WORDS.has(token) &&
            !/^\d/.test(token),
        ),
    ),
  );
}

function normalizedMetrics(value: string): string[] {
  return (value.match(NUMBER_OR_METRIC_PATTERN) ?? []).map((metric) =>
    metric.toLowerCase().replace(/[\s,]/g, ""),
  );
}

function normalizedComparableText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function phraseAppears(value: string, phrase: string): boolean {
  const normalizedValue = normalizedComparableText(value);
  const normalizedPhrase = normalizedComparableText(phrase);
  return (
    Boolean(normalizedPhrase) && normalizedValue.includes(normalizedPhrase)
  );
}

function pushEvidenceItem(
  items: ResumeGenerationEvidenceItem[],
  seenIds: Set<string>,
  item: Omit<ResumeGenerationEvidenceItem, "text"> & { text: unknown },
): void {
  const text = normalizeNullableText(item.text);
  if (!text || seenIds.has(item.id)) {
    return;
  }

  seenIds.add(item.id);
  items.push({ ...item, text });
}

export function buildResumeGenerationEvidenceCatalog(
  input: ResumeGenerationInput,
): ResumeGenerationEvidenceItem[] {
  const items: ResumeGenerationEvidenceItem[] = [];
  const seenIds = new Set<string>();
  const addProfileEvidence = (id: string, text: unknown) => {
    pushEvidenceItem(items, seenIds, {
      id,
      text,
      scope: "profile",
      profileRecordId: null,
    });
  };

  addProfileEvidence("profile:headline", input.profile.headline);
  addProfileEvidence("profile:summary", input.profile.summary);
  addProfileEvidence(
    "profile:yearsExperience",
    input.profile.yearsExperience > 0
      ? `${input.profile.yearsExperience} years of professional experience.`
      : null,
  );
  addProfileEvidence(
    "profile:professionalSummary:shortValueProposition",
    input.profile.professionalSummary.shortValueProposition,
  );
  addProfileEvidence(
    "profile:professionalSummary:fullSummary",
    input.profile.professionalSummary.fullSummary,
  );
  addProfileEvidence(
    "profile:professionalSummary:leadershipSummary",
    input.profile.professionalSummary.leadershipSummary,
  );
  addProfileEvidence(
    "profile:professionalSummary:domainFocusSummary",
    input.profile.professionalSummary.domainFocusSummary,
  );
  input.profile.professionalSummary.careerThemes.forEach((text, index) => {
    addProfileEvidence(
      `profile:professionalSummary:careerTheme:${index}`,
      text,
    );
  });
  input.profile.professionalSummary.strengths.forEach((text, index) => {
    addProfileEvidence(`profile:professionalSummary:strength:${index}`, text);
  });
  addProfileEvidence(
    "profile:narrative:professionalStory",
    input.profile.narrative.professionalStory,
  );
  addProfileEvidence(
    "profile:narrative:careerTransitionSummary",
    input.profile.narrative.careerTransitionSummary,
  );
  input.profile.narrative.differentiators.forEach((text, index) => {
    addProfileEvidence(`profile:narrative:differentiator:${index}`, text);
  });

  input.profile.experiences.forEach((experience) => {
    pushEvidenceItem(items, seenIds, {
      id: `experience:${experience.id}:summary`,
      text: experience.summary,
      scope: "experience",
      profileRecordId: experience.id,
    });
    experience.achievements.forEach((text, index) => {
      pushEvidenceItem(items, seenIds, {
        id: `experience:${experience.id}:achievement:${index}`,
        text,
        scope: "experience",
        profileRecordId: experience.id,
      });
    });
  });

  input.profile.projects.forEach((project) => {
    pushEvidenceItem(items, seenIds, {
      id: `project:${project.id}:summary`,
      text: project.summary,
      scope: "project",
      profileRecordId: project.id,
    });
    pushEvidenceItem(items, seenIds, {
      id: `project:${project.id}:outcome`,
      text: project.outcome,
      scope: "project",
      profileRecordId: project.id,
    });
  });

  input.profile.proofBank.forEach((proof) => {
    for (const [field, text] of [
      ["claim", proof.claim],
      ["heroMetric", proof.heroMetric],
      ["supportingContext", proof.supportingContext],
    ] as const) {
      pushEvidenceItem(items, seenIds, {
        id: `proof:${proof.id}:${field}`,
        text,
        scope: "proof",
        profileRecordId: proof.id,
      });
    }
  });

  if ("evidence" in input && input.evidence) {
    for (const field of [
      "summary",
      "candidateSummary",
      "experience",
    ] as const) {
      input.evidence[field].forEach((text, index) => {
        pushEvidenceItem(items, seenIds, {
          id: `importEvidence:${field}:${index}`,
          text,
          scope: "import_evidence",
          profileRecordId: null,
        });
      });
    }
  }

  return items;
}

export function buildGroundedResumeRewriteModelPayload(
  input: ResumeGenerationInput,
) {
  return {
    targetJob: {
      title: input.job.title,
      company: input.job.company,
      description: input.job.description,
      responsibilities: input.job.responsibilities,
      minimumQualifications: input.job.minimumQualifications,
      preferredQualifications: input.job.preferredQualifications,
      keySkills: input.job.keySkills,
      keywordSignals: input.job.keywordSignals,
    },
    ...("researchContext" in input && input.researchContext
      ? { researchContext: input.researchContext }
      : {}),
    groundingEvidence: {
      version: 1,
      items: buildResumeGenerationEvidenceCatalog(input),
    },
  };
}

export function parseEvidenceLinkedText(
  value: unknown,
  companionEvidenceRefs?: unknown,
): ParsedEvidenceLinkedText | null {
  const structured = EvidenceLinkedTextSchema.safeParse(value);
  if (structured.success) {
    return {
      text: structured.data.text,
      evidenceRefs: Array.from(new Set(structured.data.evidenceRefs)),
    };
  }

  const text = normalizeNullableText(value);
  if (!text) {
    return null;
  }

  const parsedRefs = EvidenceReferenceListSchema.safeParse(
    companionEvidenceRefs,
  );
  return {
    text,
    evidenceRefs: parsedRefs.success
      ? Array.from(new Set(parsedRefs.data))
      : [],
  };
}

function isRewriteGrounded(input: {
  text: string;
  evidence: readonly ResumeGenerationEvidenceItem[];
  jobCompany: string;
  jobSkills: readonly string[];
}): boolean {
  const trimmed = input.text.trim();
  if (
    trimmed.length < 12 ||
    trimmed.length > 1_000 ||
    FIRST_PERSON_PATTERN.test(trimmed) ||
    UNSUPPORTED_ABSOLUTE_CLAIM_PATTERN.test(trimmed)
  ) {
    return false;
  }

  const evidenceText = input.evidence.map((item) => item.text).join(" ");
  const evidenceMetrics = new Set(normalizedMetrics(evidenceText));
  if (
    normalizedMetrics(trimmed).some((metric) => !evidenceMetrics.has(metric))
  ) {
    return false;
  }

  const jobOnlyTerms = [input.jobCompany, ...input.jobSkills].filter(
    (term) =>
      normalizeNullableText(term) &&
      phraseAppears(trimmed, term) &&
      !phraseAppears(evidenceText, term),
  );
  if (jobOnlyTerms.length > 0) {
    return false;
  }

  const generatedTokens = meaningfulTokens(trimmed);
  const evidenceTokens = new Set(meaningfulTokens(evidenceText));
  if (generatedTokens.length === 0 || evidenceTokens.size === 0) {
    return false;
  }

  const unmatchedTokens = generatedTokens.filter(
    (token) => !evidenceTokens.has(token),
  );
  const matchedTokens = generatedTokens.length - unmatchedTokens.length;
  const leadershipClaimToken = RESUME_TOKEN_SYNONYMS.get("lead") ?? "lead";
  if (
    unmatchedTokens.includes(leadershipClaimToken) ||
    (/\b(?:certified|licensed|fluent|native proficiency|subject[- ]matter expert)\b/i.test(
      trimmed,
    ) &&
      !/\b(?:certified|licensed|fluent|native proficiency|subject[- ]matter expert)\b/i.test(
        evidenceText,
      ))
  ) {
    return false;
  }

  return (
    matchedTokens >= Math.min(2, generatedTokens.length) &&
    unmatchedTokens.length === 0
  );
}

export function selectResumeRewrite(input: {
  generated: unknown;
  companionEvidenceRefs?: unknown;
  canonicalCandidates: readonly string[];
  evidenceCatalog: readonly ResumeGenerationEvidenceItem[];
  allowedScope?:
    | {
        scope: "experience" | "project";
        profileRecordId: string;
      }
    | undefined;
  jobCompany: string;
  jobSkills: readonly string[];
}): ResumeRewriteSelection | null {
  const parsed = parseEvidenceLinkedText(
    input.generated,
    input.companionEvidenceRefs,
  );
  if (!parsed) {
    return null;
  }

  const normalizedGenerated = normalizedComparableText(parsed.text);
  const canonical = input.canonicalCandidates.find(
    (candidate) => normalizedComparableText(candidate) === normalizedGenerated,
  );
  if (canonical) {
    return {
      text: canonical,
      kind: "canonical",
      referencedEvidenceText: [canonical],
    };
  }

  if (parsed.evidenceRefs.length === 0) {
    return null;
  }

  const evidenceById = new Map(
    input.evidenceCatalog.map((item) => [item.id, item] as const),
  );
  const referencedEvidence = parsed.evidenceRefs.flatMap((reference) => {
    const item = evidenceById.get(reference);
    return item ? [item] : [];
  });
  if (referencedEvidence.length !== parsed.evidenceRefs.length) {
    return null;
  }

  if (
    input.allowedScope &&
    referencedEvidence.some(
      (item) =>
        item.scope !== input.allowedScope?.scope ||
        item.profileRecordId !== input.allowedScope.profileRecordId,
    )
  ) {
    return null;
  }

  if (
    !isRewriteGrounded({
      text: parsed.text,
      evidence: referencedEvidence,
      jobCompany: input.jobCompany,
      jobSkills: input.jobSkills,
    })
  ) {
    return null;
  }

  return {
    text: parsed.text.trim(),
    kind: "grounded_rewrite",
    referencedEvidenceText: referencedEvidence.map((item) => item.text),
  };
}
