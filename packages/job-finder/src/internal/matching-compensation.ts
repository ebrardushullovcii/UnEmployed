import {
  annualizeCompensationAmount,
  type CompensationPreference,
  type CompensationFitAssessment,
  type NormalizedCompensation,
} from "@unemployed/contracts";

function readPeriodUnit(
  salaryText: string,
  startIndex: number,
  knownCompensationPeriods: ReadonlySet<string>,
): string | null {
  const followingText = salaryText.slice(startIndex).trimStart().toLowerCase();

  const rawPeriodUnit =
    followingText.match(/^(?:(?:\/|per\b|a\b)\s*)?([a-z]+)/)?.[1] ?? "";
  const periodUnit = compensationPeriodAliases[rawPeriodUnit] ?? rawPeriodUnit;
  return knownCompensationPeriods.has(periodUnit) ? periodUnit : null;
}

function isCompactRangeSeparator(text: string): boolean {
  return /^\s*[-–—/]\s*[$€£]?\s*$/.test(text);
}

const knownCompensationPeriods = new Set(["yr", "year", "years", "annual", "annum", "mo", "month", "months", "wk", "week", "weeks", "day", "days", "hr", "hrs", "hour", "hours"]);
const compensationPeriodAliases: Record<string, string> = {
  hourly: "hour",
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
  annually: "annual",
};
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
const salaryNumberPattern = /(\d[\d,]*(?:\.\d+)?)(?:\s*([km])\b)?/gi;
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

  if (/\b(hour|hours|hourly|hr|hrs)\b/u.test(normalized)) {
    return "hour";
  }

  if (/\b(day|days|daily)\b/u.test(normalized)) {
    return "day";
  }

  if (/\b(week|weeks|weekly|wk)\b/u.test(normalized)) {
    return "week";
  }

  if (/\b(month|months|monthly|mo)\b/u.test(normalized)) {
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
  // "$100,000 or more", "from $60k", "$45/hr+" name a floor, not a range;
  // a max equal to the min would render as a capped salary.
  const openEnded =
    parsedValues.length === 1 &&
    /(?:\bor more\b|\band (?:up|above)\b|\bat least\b|\bminimum\b|\bstarting (?:at|from)\b|\bfrom\b|\bupwards?\b|\d\s*(?:k|m)?\s*\+)/iu.test(
      salaryText,
    );
  const maxAmount = openEnded ? null : (parsedValues.at(-1) ?? minAmount);
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
  preference: CompensationPreference | number | null,
): CompensationFitAssessment {
  const compensation =
    typeof preference === "number"
      ? {
          minimum: preference,
          maximum: null,
          interval: "year" as const,
          currency: "USD",
          currencyStatus: "inherited" as const,
        }
      : preference;
  const minimum = compensation?.minimum ?? null;

  if (minimum === null) {
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
  const preferenceCurrency = compensation?.currency?.toUpperCase() ?? null;
  const preferenceMinimumAnnualAmount = compensation
    ? annualizeCompensationAmount(minimum, compensation.interval)
    : null;
  const minimumSalaryUsd =
    preferenceCurrency === "USD" ? preferenceMinimumAnnualAmount : null;
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

  if (
    compensation?.currencyStatus === "needs_clarification" ||
    preferenceCurrency === null
  ) {
    return {
      state: "currency_incomparable",
      confidence: "low",
      minimumSalaryUsd,
      listingMinimumAnnualUsd: null,
      listingCurrency: normalized.currency,
      explanation:
        "The saved compensation currency needs clarification before salary matching can compare this listing.",
    };
  }

  if (normalized.currency === null) {
    return {
      state: "currency_incomparable",
      confidence: "high",
      minimumSalaryUsd,
      listingMinimumAnnualUsd: null,
      listingCurrency: null,
      explanation:
        "The listing currency is unspecified, so it was not compared with the saved minimum.",
    };
  }

  if (normalized.currency !== preferenceCurrency) {
    return {
      state: "currency_incomparable",
      confidence: "high",
      minimumSalaryUsd,
      listingMinimumAnnualUsd: normalized.minAnnualUsd,
      listingCurrency: normalized.currency,
      explanation: `The listing uses ${normalized.currency} while the saved minimum uses ${preferenceCurrency}; no exchange-rate assumption was made.`,
    };
  }

  const listingMinimumAnnualAmount = normalized.interval
    ? annualizeCompensationAmount(normalized.minAmount, normalized.interval)
    : null;
  if (
    listingMinimumAnnualAmount === null ||
    preferenceMinimumAnnualAmount === null
  ) {
    return {
      state: "unknown",
      confidence: "low",
      minimumSalaryUsd,
      listingMinimumAnnualUsd: null,
      listingCurrency: normalized.currency,
      explanation: "The listing compensation interval could not be normalized safely.",
    };
  }

  const listingMinimumAnnualUsd =
    normalized.currency === "USD" ? listingMinimumAnnualAmount : null;
  if (listingMinimumAnnualAmount >= preferenceMinimumAnnualAmount) {
    return {
      state: "meets_minimum",
      confidence: "high",
      minimumSalaryUsd,
      listingMinimumAnnualUsd,
      listingCurrency: normalized.currency,
      explanation: `The listing minimum meets or exceeds the saved ${preferenceCurrency} minimum after normalizing both to annual amounts.`,
    };
  }

  return {
    state: "below_minimum",
    confidence: "high",
    minimumSalaryUsd,
    listingMinimumAnnualUsd,
    listingCurrency: normalized.currency,
    explanation: `The listing minimum is below the saved ${preferenceCurrency} minimum after normalizing both to annual amounts.`,
  };
}
