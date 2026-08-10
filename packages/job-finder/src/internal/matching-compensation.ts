import type {
  CompensationFitAssessment,
  NormalizedCompensation,
} from "@unemployed/contracts";

function readPeriodUnit(
  salaryText: string,
  startIndex: number,
  knownCompensationPeriods: ReadonlySet<string>,
): string | null {
  const followingText = salaryText.slice(startIndex).trimStart().toLowerCase();

  if (!followingText.startsWith("/")) {
    return null;
  }

  const periodUnit = followingText.match(/^\/\s*([a-z]+)/)?.[1] ?? "";
  return knownCompensationPeriods.has(periodUnit) ? periodUnit : null;
}

function isCompactRangeSeparator(text: string): boolean {
  return /^\s*[-–—/]\s*[$€£]?\s*$/.test(text);
}

const knownCompensationPeriods = new Set(["yr", "year", "years", "annual", "annum", "mo", "month", "months", "wk", "week", "weeks", "day", "days", "hr", "hrs", "hour", "hours"]);
const annualCompensationMultipliers: Record<string, number> = {
  yr: 1,
  year: 1,
  years: 1,
  annual: 1,
  annum: 1,
  mo: 12,
  month: 12,
  months: 12,
  wk: 52,
  week: 52,
  weeks: 52,
  day: 260,
  days: 260,
  hr: 2080,
  hrs: 2080,
  hour: 2080,
  hours: 2080,
};
const salaryNumberPattern = /(\d[\d,]*(?:\.\d+)?)(?:\s*)([km])?/gi;
const secondaryCompensationBeforePattern = /\b(bonus|commission|sign[- ]?on|equity|ote)\b/i;
const secondaryCompensationAfterPattern = /^(?:[:-]\s*)?(bonus|commission|sign[- ]?on|equity|ote)\b/i;

function detectCurrencyCode(salaryText: string | null): string | null {
  if (!salaryText) {
    return null;
  }

  const normalized = salaryText.toLowerCase();

  if (normalized.includes("usd") || salaryText.includes("$")) {
    return "USD";
  }

  if (normalized.includes("eur") || salaryText.includes("€")) {
    return "EUR";
  }

  if (normalized.includes("gbp") || salaryText.includes("£")) {
    return "GBP";
  }

  return null;
}

function detectCompensationInterval(
  salaryText: string | null,
): NormalizedCompensation["interval"] {
  if (!salaryText) {
    return null;
  }

  const normalized = salaryText.toLowerCase();

  if (/\b(hour|hr|hrs)\b|\//.test(normalized) && /\/(?:\s*)(hour|hr|hrs)\b/.test(normalized)) {
    return "hour";
  }

  if (/\b(day|days)\b|\/(?:\s*)(day|days)\b/.test(normalized)) {
    return "day";
  }

  if (/\b(week|weeks|wk)\b|\/(?:\s*)(week|weeks|wk)\b/.test(normalized)) {
    return "week";
  }

  if (/\b(month|months|mo)\b|\/(?:\s*)(month|months|mo)\b/.test(normalized)) {
    return "month";
  }

  return "year";
}

export function parseSalaryFloor(salaryText: string | null): number | null {
  if (!salaryText) {
    return null;
  }

  const matches = [...salaryText.matchAll(salaryNumberPattern)];

  if (matches.length === 0) {
    return null;
  }

  const parsed = matches
    .map((match, index) => {
      const baseValue = parseFloat((match[1] ?? "").replaceAll(",", ""));
      const rawSuffix = (match[2] ?? "").toLowerCase();
      const currentIndex = match.index ?? 0;
      const nextMatch = matches[index + 1];
      const nextIndex = nextMatch?.index ?? -1;
      const betweenText = nextMatch ? salaryText.slice(currentIndex + match[0].length, nextIndex) : "";
      const suffix = !rawSuffix && nextMatch?.[2] && isCompactRangeSeparator(betweenText)
        ? nextMatch[2].toLowerCase()
        : rawSuffix;
      const periodUnit = readPeriodUnit(salaryText, currentIndex + match[0].length, knownCompensationPeriods)
        ?? (nextMatch && isCompactRangeSeparator(betweenText)
          ? readPeriodUnit(salaryText, (nextMatch.index ?? 0) + nextMatch[0].length, knownCompensationPeriods)
          : null);
      const precedingText = salaryText.slice(Math.max(0, currentIndex - 24), currentIndex).toLowerCase();
      const followingText = salaryText.slice(currentIndex + match[0].length).trimStart().toLowerCase();

      if (!Number.isFinite(baseValue) || baseValue <= 0) {
        return null;
      }

      if (followingText.startsWith("%")) {
        return null;
      }

      const trailingContext = followingText.slice(0, 24);
      const leadingContext = precedingText.trim().split(/\s+/).at(-1) ?? "";

      if (secondaryCompensationBeforePattern.test(leadingContext) || secondaryCompensationAfterPattern.test(trailingContext)) {
        return null;
      }

      if (!suffix && !periodUnit && baseValue < 1000) {
        return null;
      }

      const scaledValue = suffix === "k"
        ? baseValue * 1000
        : suffix === "m"
          ? baseValue * 1_000_000
          : baseValue;

      return periodUnit
        ? scaledValue * (annualCompensationMultipliers[periodUnit] ?? 1)
        : scaledValue;
    })
    .filter((value): value is number => value !== null);

  if (parsed.length === 0) {
    return null;
  }

  return Math.min(...parsed);
}

export function parseNormalizedCompensation(
  salaryText: string | null,
): NormalizedCompensation {
  if (!salaryText) {
    return {
      currency: null,
      interval: null,
      minAmount: null,
      maxAmount: null,
      minAnnualUsd: null,
      maxAnnualUsd: null,
    };
  }

  const matches = [...salaryText.matchAll(salaryNumberPattern)];
  const parsedValues = matches
    .map((match, index) => {
      const baseValue = parseFloat((match[1] ?? "").replaceAll(",", ""));
      const rawSuffix = (match[2] ?? "").toLowerCase();
      const currentIndex = match.index ?? 0;
      const nextMatch = matches[index + 1];
      const nextIndex = nextMatch?.index ?? -1;
      const betweenText = nextMatch
        ? salaryText.slice(currentIndex + match[0].length, nextIndex)
        : "";
      const suffix =
        !rawSuffix && nextMatch?.[2] && isCompactRangeSeparator(betweenText)
          ? nextMatch[2].toLowerCase()
          : rawSuffix;
      const periodUnit = readPeriodUnit(salaryText, currentIndex + match[0].length, knownCompensationPeriods)
        ?? (nextMatch && isCompactRangeSeparator(betweenText)
          ? readPeriodUnit(salaryText, (nextMatch.index ?? 0) + nextMatch[0].length, knownCompensationPeriods)
          : null);
      const precedingText = salaryText
        .slice(Math.max(0, currentIndex - 24), currentIndex)
        .toLowerCase();
      const followingText = salaryText
        .slice(currentIndex + match[0].length)
        .trimStart()
        .toLowerCase();

      if (!Number.isFinite(baseValue) || baseValue <= 0 || followingText.startsWith("%")) {
        return null;
      }

      const trailingContext = followingText.slice(0, 24);
      const leadingContext = precedingText.trim().split(/\s+/).at(-1) ?? "";

      if (
        secondaryCompensationBeforePattern.test(leadingContext) ||
        secondaryCompensationAfterPattern.test(trailingContext)
      ) {
        return null;
      }

      if (!suffix && !periodUnit && baseValue < 1000) {
        return null;
      }

      return suffix === "k"
        ? baseValue * 1000
        : suffix === "m"
          ? baseValue * 1_000_000
          : baseValue;
    })
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);

  const minAmount = parsedValues[0] ?? null;
  const maxAmount = parsedValues.at(-1) ?? minAmount;
  const interval = detectCompensationInterval(salaryText);
  const multiplier = interval ? (annualCompensationMultipliers[interval] ?? 1) : null;
  const currency = detectCurrencyCode(salaryText);
  const hasComparableUsdEvidence = currency === "USD" && multiplier !== null;

  return {
    currency,
    interval,
    minAmount,
    maxAmount,
    minAnnualUsd:
      hasComparableUsdEvidence && minAmount !== null
        ? Math.round(minAmount * multiplier)
        : null,
    maxAnnualUsd:
      hasComparableUsdEvidence && maxAmount !== null
        ? Math.round(maxAmount * multiplier)
        : null,
  };
}

export function evaluateCompensationFit(
  salaryText: string | null,
  minimumSalaryUsd: number | null,
): CompensationFitAssessment {
  if (minimumSalaryUsd === null) {
    return {
      state: "not_requested",
      confidence: "unavailable",
      minimumSalaryUsd: null,
      listingMinimumAnnualUsd: null,
      listingCurrency: null,
      explanation: "No minimum salary preference is configured.",
    };
  }

  const normalized = parseNormalizedCompensation(salaryText);
  if (normalized.minAmount === null) {
    return {
      state: "unknown",
      confidence: salaryText ? "low" : "unavailable",
      minimumSalaryUsd,
      listingMinimumAnnualUsd: null,
      listingCurrency: normalized.currency,
      explanation: salaryText
        ? "The listing compensation could not be normalized safely."
        : "The listing does not provide compensation evidence.",
    };
  }

  if (normalized.currency !== "USD") {
    return {
      state: "currency_incomparable",
      confidence: "high",
      minimumSalaryUsd,
      listingMinimumAnnualUsd: null,
      listingCurrency: normalized.currency,
      explanation: normalized.currency
        ? `The listing uses ${normalized.currency}; no exchange-rate assumption was made against the USD minimum.`
        : "The listing currency is unspecified, so it was not compared with the USD minimum.",
    };
  }

  if (normalized.minAnnualUsd === null) {
    return {
      state: "unknown",
      confidence: "low",
      minimumSalaryUsd,
      listingMinimumAnnualUsd: null,
      listingCurrency: normalized.currency,
      explanation: "The listing compensation interval could not be normalized safely.",
    };
  }

  if (normalized.minAnnualUsd >= minimumSalaryUsd) {
    return {
      state: "meets_minimum",
      confidence: "high",
      minimumSalaryUsd,
      listingMinimumAnnualUsd: normalized.minAnnualUsd,
      listingCurrency: normalized.currency,
      explanation: "The listing minimum meets or exceeds the saved USD minimum.",
    };
  }

  return {
    state: "below_minimum",
    confidence: "high",
    minimumSalaryUsd,
    listingMinimumAnnualUsd: normalized.minAnnualUsd,
    listingCurrency: normalized.currency,
    explanation: "The listing minimum is below the saved USD minimum.",
  };
}