import {
  ProfileCopilotReplySchema,
  type CompensationCurrencyStatus,
  type CompensationInterval,
  type ProfileCopilotReply,
} from "@unemployed/contracts";

import type { ReviseCandidateProfileInput } from "../shared";
import { createUniqueId } from "./profile-copilot-helpers";

interface ParsedCompensationRequest {
  minimum: number;
  maximum: number;
  interval: CompensationInterval;
  currency: string | null;
  currencyStatus: CompensationCurrencyStatus;
}

function parseAmount(
  rawValue: string,
  hasThousandsSuffix: boolean,
): number | null {
  const parsed = Number.parseFloat(rawValue.replaceAll(",", ""));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * (hasThousandsSuffix ? 1_000 : 1));
}

function detectInterval(request: string): CompensationInterval | null {
  if (/\b(?:per|a|each)?\s*(?:month|monthly)\b/i.test(request)) return "month";
  if (/\b(?:per|a|each)?\s*(?:year|yearly|annual(?:ly)?)\b/i.test(request)) return "year";
  if (/\b(?:per|a|each)?\s*(?:week|weekly)\b/i.test(request)) return "week";
  if (/\b(?:per|a|each)?\s*(?:day|daily)\b/i.test(request)) return "day";
  if (/\b(?:per|an|each)?\s*(?:hour|hourly)\b/i.test(request)) return "hour";
  return null;
}

function detectCurrency(request: string): string | null {
  const isoCode = request.match(/\b(USD|EUR|GBP|CAD|AUD|NZD|CHF)\b/i)?.[1];
  if (isoCode) return isoCode.toUpperCase();
  if (/US\$/i.test(request)) return "USD";
  if (request.includes("€")) return "EUR";
  if (request.includes("£")) return "GBP";
  return null;
}

function parseCompensationRequest(
  input: ReviseCandidateProfileInput,
): ParsedCompensationRequest | null {
  const interval = detectInterval(input.request);
  const range = input.request.match(
    /(?:\b[A-Z]{3}\b|US\$|[$€£])?\s*([\d,.]+)\s*(k)?\s*(?:-|–|—|to)\s*(?:\b[A-Z]{3}\b|US\$|[$€£])?\s*([\d,.]+)\s*(k)?/i,
  );

  if (!interval || !range) {
    return null;
  }

  const sharedThousandsSuffix = Boolean(range[2] || range[4]);
  const first = parseAmount(range[1] ?? "", sharedThousandsSuffix);
  const second = parseAmount(range[3] ?? "", sharedThousandsSuffix);
  if (first === null || second === null) {
    return null;
  }

  const explicitCurrency = detectCurrency(input.request);
  const savedExplicitCurrency =
    input.searchPreferences.compensation.currencyStatus === "explicit"
      ? input.searchPreferences.compensation.currency
      : null;
  const currency = explicitCurrency ?? savedExplicitCurrency;
  const currencyStatus: CompensationCurrencyStatus = explicitCurrency
    ? "explicit"
    : savedExplicitCurrency
      ? "inherited"
      : "needs_clarification";

  return {
    minimum: Math.min(first, second),
    maximum: Math.max(first, second),
    interval,
    currency,
    currencyStatus,
  };
}

function detectPreferredLocation(request: string): string | null {
  const matches = [
    ...request.matchAll(
      /\b(?:around|near|in)\s+([A-Za-z][A-Za-z .'-]{1,60}?)(?=\s+(?:with|where|pay|paying|for|and|at)\b|[,.]|$)/gi,
    ),
  ];
  const value = matches.at(-1)?.[1]?.trim();
  return value && !/^(?:jobs?|roles?|work)$/i.test(value) ? value : null;
}

export function buildNaturalSearchPreferenceReply(
  input: ReviseCandidateProfileInput,
): ProfileCopilotReply | null {
  if (!/\b(?:jobs?|roles?|look(?:ing)?|search|pay|salary|compensation)\b/i.test(input.request)) {
    return null;
  }

  const compensation = parseCompensationRequest(input);
  if (!compensation) {
    return null;
  }

  const location = detectPreferredLocation(input.request);
  const needsCurrencyClarification =
    compensation.currencyStatus === "needs_clarification";
  const operations: ProfileCopilotReply["patchGroups"][number]["operations"] = [];

  if (location && !input.searchPreferences.locations.includes(location)) {
    operations.push({
      operation: "replace_search_preferences_fields",
      value: { locations: [location] },
    });
  }
  operations.push({
    operation: "replace_compensation_preferences_fields",
    value: compensation,
  });

  const formattedRange = `${compensation.minimum.toLocaleString("en-US")}–${compensation.maximum.toLocaleString("en-US")} per ${compensation.interval}`;
  const locationSummary = location ? ` around ${location}` : "";
  const content = needsCurrencyClarification
    ? `I understood ${formattedRange}${locationSummary}, but the currency is not explicit. I prepared the structured preference for review without assuming USD or another currency. Tell me the three-letter currency code, such as USD or EUR, before relying on compensation matching.`
    : `I prepared ${formattedRange} ${compensation.currency}${locationSummary} as structured job-search preferences${compensation.currencyStatus === "inherited" ? " using your explicitly saved currency" : ""}.`;

  return ProfileCopilotReplySchema.parse({
    content,
    patchGroups: [
      {
        id: createUniqueId("profile_patch_group"),
        summary: location
          ? `Update preferred location and ${compensation.interval}ly compensation range`
          : `Update ${compensation.interval}ly compensation range`,
        applyMode:
          location || needsCurrencyClarification ? "needs_review" : "applied",
        operations,
        createdAt: new Date().toISOString(),
      },
    ],
  });
}
