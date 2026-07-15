import type {
  JobPosting,
  JobPostingDetailQuality,
} from "@unemployed/contracts";

type DetailQualityInput = Pick<
  JobPosting,
  | "title"
  | "company"
  | "description"
  | "keySkills"
  | "responsibilities"
  | "minimumQualifications"
  | "preferredQualifications"
  | "benefits"
>;

const PARTIAL_DESCRIPTION_WORD_FLOOR = 18;
const ENRICHED_DESCRIPTION_WORD_FLOOR = 70;
const ENRICHED_DESCRIPTION_CHARACTER_FLOOR = 500;
const ENRICHED_WITH_STRUCTURED_DETAIL_WORD_FLOOR = 35;
const ENRICHED_STRUCTURED_DETAIL_FLOOR = 5;
const ENRICHED_STRUCTURED_DETAIL_CHARACTER_FLOOR = 180;

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim().toLowerCase();
}

function countWords(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function isSyntheticDescription(input: DetailQualityInput): boolean {
  const description = normalizeText(input.description);
  const title = normalizeText(input.title);
  const company = normalizeText(input.company);

  return (
    description === title ||
    description === `${title} role at ${company}` ||
    description === `${title} opportunity at ${company}`
  );
}

export function assessJobPostingDetailQuality(
  input: DetailQualityInput,
): JobPostingDetailQuality {
  const description = input.description.trim();
  const descriptionWordCount = countWords(description);
  const structuredDetails = [
    ...input.responsibilities,
    ...input.minimumQualifications,
    ...input.preferredQualifications,
    ...input.benefits,
  ]
    .map((entry) => entry.trim())
    .filter(Boolean);
  const structuredDetailCharacterCount = structuredDetails.reduce(
    (total, entry) => total + entry.length,
    0,
  );
  const syntheticDescription = isSyntheticDescription(input);

  if (
    (!syntheticDescription &&
      (descriptionWordCount >= ENRICHED_DESCRIPTION_WORD_FLOOR ||
        description.length >= ENRICHED_DESCRIPTION_CHARACTER_FLOOR)) ||
    (!syntheticDescription &&
      descriptionWordCount >= ENRICHED_WITH_STRUCTURED_DETAIL_WORD_FLOOR &&
      structuredDetails.length >= 2) ||
    (structuredDetails.length >= ENRICHED_STRUCTURED_DETAIL_FLOOR &&
      structuredDetailCharacterCount >=
        ENRICHED_STRUCTURED_DETAIL_CHARACTER_FLOOR)
  ) {
    return "detail_enriched";
  }

  if (
    (!syntheticDescription &&
      descriptionWordCount >= PARTIAL_DESCRIPTION_WORD_FLOOR) ||
    structuredDetails.length > 0 ||
    input.keySkills.length >= 2
  ) {
    return "partial_detail";
  }

  return "card_only";
}
