import { uniqueStrings } from "./utils";

/**
 * Pure narrative-shaping helpers shared by deterministic tailoring. They never
 * invent content: every returned string is a whole sentence or a whole
 * inline-list item taken from the stored profile text.
 */

const INLINE_BULLET_GLYPH_CLASS = "●•▪◦‣";
const INLINE_BULLET_GLYPH_PATTERN = new RegExp(
  `[${INLINE_BULLET_GLYPH_CLASS}]`,
  "g",
);
const LEADING_BULLET_GLYPH_PATTERN = new RegExp(
  `^[\\s${INLINE_BULLET_GLYPH_CLASS}\\-–—*]+`,
);
const SENTENCE_BOUNDARY_PATTERN = /(?<=[.!?])\s+(?=["'([A-Z0-9])/;
const DEFAULT_LEAD_SENTENCE_BUDGET = 160;

export function stripLeadingBulletGlyphs(value: string): string {
  return value.replace(LEADING_BULLET_GLYPH_PATTERN, "").trim();
}

export function countInlineBulletGlyphs(
  value: string | null | undefined,
): number {
  return (value ?? "").match(INLINE_BULLET_GLYPH_PATTERN)?.length ?? 0;
}

export function splitSentences(value: string | null | undefined): string[] {
  return (value ?? "")
    .trim()
    .split(SENTENCE_BOUNDARY_PATTERN)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function ensureTerminalPunctuation(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Keeps whole sentences under the character budget. A single sentence that
 * exceeds the budget is kept whole rather than cut mid-sentence: a clipped
 * sentence like "…secure APIs that." ships as broken prose, while a slightly
 * long sentence only costs a line.
 */
export function compactNarrativeToSentences(
  value: string | null | undefined,
  budget = 150,
): string | null {
  const sentences = splitSentences(value);
  if (sentences.length === 0) {
    return null;
  }

  const kept: string[] = [];
  for (const sentence of sentences) {
    const candidate = [...kept, sentence].join(" ");
    if (kept.length > 0 && candidate.length > budget) {
      break;
    }
    kept.push(sentence);
    if (candidate.length > budget) {
      break;
    }
  }

  return ensureTerminalPunctuation(kept.join(" "));
}

export interface SplitNarrativeResult {
  summary: string | null;
  bullets: string[];
}

/**
 * Turns an inline "● item ● item" list, or a paragraph of three or more
 * sentences with no real bullets beneath it, into a short lead sentence plus
 * bullet items. Returns null when the narrative should stay as prose.
 */
export function splitInlineBulletSummary(
  value: string | null | undefined,
  existingBulletCount: number,
  options: { leadSentenceBudget?: number } = {},
): SplitNarrativeResult | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  const leadBudget = options.leadSentenceBudget ?? DEFAULT_LEAD_SENTENCE_BUDGET;

  if (countInlineBulletGlyphs(trimmed) >= 2) {
    const segments = trimmed
      .split(new RegExp(`\\s*[${INLINE_BULLET_GLYPH_CLASS}]\\s*`))
      .map((segment) => stripLeadingBulletGlyphs(segment))
      .filter(Boolean);
    if (segments.length === 0) {
      return null;
    }
    const startsWithGlyph = new RegExp(
      `^[\\s${INLINE_BULLET_GLYPH_CLASS}]`,
    ).test(trimmed);
    const [first, ...rest] = segments;
    const leadIsShortIntro =
      !startsWithGlyph && first !== undefined && first.length <= leadBudget;
    const summary = leadIsShortIntro ? ensureTerminalPunctuation(first) : null;
    const bullets = uniqueStrings(
      (leadIsShortIntro ? rest : segments).map(ensureTerminalPunctuation),
    );
    return { summary, bullets };
  }

  if (existingBulletCount >= 2) {
    return null;
  }

  const sentences = splitSentences(trimmed);
  if (sentences.length < 3) {
    return null;
  }
  const [lead, ...rest] = sentences;
  const leadIsShort = lead !== undefined && lead.length <= leadBudget;
  return {
    summary: leadIsShort ? ensureTerminalPunctuation(lead) : null,
    bullets: uniqueStrings(
      (leadIsShort ? rest : sentences).map(ensureTerminalPunctuation),
    ),
  };
}

export function normalizeNarrativeSignature(
  value: string | null | undefined,
): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * True when `candidate` is the same text as, or a truncated prefix of,
 * `reference` once punctuation and case are ignored. A truncated variant
 * beside its full twin reads as an editing accident.
 */
export function isTruncatedVariantOf(
  candidate: string | null | undefined,
  reference: string | null | undefined,
): boolean {
  const candidateSignature = normalizeNarrativeSignature(candidate);
  const referenceSignature = normalizeNarrativeSignature(reference);
  if (!candidateSignature || !referenceSignature) {
    return false;
  }
  if (candidateSignature === referenceSignature) {
    return true;
  }
  return (
    candidateSignature.length < referenceSignature.length &&
    referenceSignature.startsWith(candidateSignature) &&
    // Require a word boundary so "lead" is not treated as a prefix of
    // "leadership programs".
    (referenceSignature[candidateSignature.length] === " " ||
      candidateSignature.split(" ").length >= 4)
  );
}

/**
 * Drops any line that is a truncated prefix of another line in the same
 * list, keeping the fuller variant and the original order of survivors.
 */
export function dropTruncatedVariants(lines: readonly string[]): string[] {
  const unique = uniqueStrings([...lines]);
  return unique.filter(
    (line, index) =>
      !unique.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          normalizeNarrativeSignature(other) !==
            normalizeNarrativeSignature(line) &&
          isTruncatedVariantOf(line, other),
      ),
  );
}

/**
 * A compacted summary that repeats a kept bullet (exactly, as a truncated
 * prefix, or as a near-duplicate) adds nothing and should be omitted.
 */
export function summaryDuplicatesBullets(
  summary: string | null | undefined,
  bullets: readonly string[],
): boolean {
  const summarySignature = normalizeNarrativeSignature(summary);
  if (!summarySignature) {
    return false;
  }
  const summaryTokens = summarySignature.split(" ");
  return bullets.some((bullet) => {
    if (
      isTruncatedVariantOf(summary, bullet) ||
      isTruncatedVariantOf(bullet, summary)
    ) {
      return true;
    }
    const bulletTokens = new Set(
      normalizeNarrativeSignature(bullet).split(" "),
    );
    if (bulletTokens.size === 0 || summaryTokens.length === 0) {
      return false;
    }
    const overlap =
      summaryTokens.filter((token) => bulletTokens.has(token)).length /
      Math.min(summaryTokens.length, bulletTokens.size);
    return overlap >= 0.8;
  });
}

function normalizeSkillKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Orders grounded skills so the ones the job names come first, preserving
 * the original relative order inside each group. The grounding filter still
 * decides which skills are eligible; this only decides what the visible
 * budget spends its slots on.
 */
export function orderSkillsByJobRelevance(
  skills: readonly string[],
  job: {
    keySkills: readonly string[];
    title?: string | null;
    responsibilities?: readonly string[];
    minimumQualifications?: readonly string[];
  },
): string[] {
  const jobSkillKeys = new Set(job.keySkills.map(normalizeSkillKey));
  const jobText = normalizeSkillKey(
    [
      job.title ?? "",
      ...(job.responsibilities ?? []),
      ...(job.minimumQualifications ?? []),
      ...job.keySkills,
    ].join(" \n "),
  );
  const matches = (skill: string) => {
    const key = normalizeSkillKey(skill);
    if (!key) {
      return false;
    }
    if (jobSkillKeys.has(key)) {
      return true;
    }
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(jobText);
  };
  const unique = uniqueStrings([...skills]);
  return [
    ...unique.filter((skill) => matches(skill)),
    ...unique.filter((skill) => !matches(skill)),
  ];
}
