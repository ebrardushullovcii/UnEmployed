import type { AgentConfig } from "../types";
import {
  getSeededQueryRuleParams,
  isSeededQueryPlaceholderValue,
  looksLikeSeededSearchSurfacePath,
} from "./seeded-query";

export const DEFAULT_SEARCH_RESULTS_EXTRACTION_REVIEW_BUDGET = 4;
const SEEDED_QUERY_SEARCH_RESULTS_EXTRACTION_REVIEW_BUDGET = 16;
const WEAK_SAME_HOST_SEARCH_RESULTS_EXTRACTION_REVIEW_BUDGET = 16;

function clampReviewBudget(targetJobCount: number, cap: number): number {
  return Math.max(
    DEFAULT_SEARCH_RESULTS_EXTRACTION_REVIEW_BUDGET,
    Math.min(targetJobCount, cap),
  );
}

function getNormalizedStartingHosts(values: readonly string[]): string[] {
  const hosts = new Set<string>();

  for (const value of values) {
    try {
      hosts.add(new URL(value).hostname.toLowerCase());
    } catch {
      continue;
    }
  }

  return [...hosts];
}

function isSeededQuerySearchUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const looksLikeSearchSurface = looksLikeSeededSearchSurfacePath(
      url.pathname,
    );

    if (!looksLikeSearchSurface) {
      return false;
    }

    const { ignoredParams } = getSeededQueryRuleParams(url.hostname);

    return [...url.searchParams.entries()].some(([key, paramValue]) => {
      if (ignoredParams.has(key)) {
        return false;
      }

      const normalizedValue = paramValue.trim();
      if (!normalizedValue) {
        return false;
      }

      return !isSeededQueryPlaceholderValue(normalizedValue);
    });
  } catch {
    return false;
  }
}

export function getSearchResultsExtractionReviewBudget(
  config: Pick<
    AgentConfig,
    "startingUrls" | "promptContext" | "targetJobCount" | "weakSameHostBoard"
  >,
): number | null {
  if (
    config.promptContext.taskPacket ||
    config.targetJobCount < DEFAULT_SEARCH_RESULTS_EXTRACTION_REVIEW_BUDGET
  ) {
    return null;
  }

  if (config.startingUrls.some((value) => isSeededQuerySearchUrl(value))) {
    return clampReviewBudget(
      config.targetJobCount,
      SEEDED_QUERY_SEARCH_RESULTS_EXTRACTION_REVIEW_BUDGET,
    );
  }

  const startingHosts = getNormalizedStartingHosts(config.startingUrls);
  const isWeakSameHostBoard =
    startingHosts.length === 1 && Boolean(config.weakSameHostBoard);

  if (!isWeakSameHostBoard) {
    return null;
  }

  return clampReviewBudget(
    config.targetJobCount,
    WEAK_SAME_HOST_SEARCH_RESULTS_EXTRACTION_REVIEW_BUDGET,
  );
}
