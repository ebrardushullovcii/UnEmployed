import { normalizeText } from "./shared";

const TRACKING_QUERY_PARAMETERS = new Set([
  "gh_src",
  "lever-source",
  "ref",
  "referrer",
  "source",
  "sourceid",
  "trackingid",
  "trk",
]);

export type JobIdentityInput = {
  source: string | null;
  sourceJobId: string | null;
  canonicalUrl: string | null;
  applicationUrl?: string | null;
  providerKey?: string | null;
  providerBoardToken?: string | null;
  providerIdentifier?: string | null;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  postedAt?: string | null;
  postedAtText?: string | null;
};

export type JobIdentityAliasKind =
  | "provider_posting_id"
  | "source_posting_id"
  | "employer_application_url"
  | "canonical_listing_url"
  | "corroborated_listing_facts";

export type JobIdentityAlias = {
  key: string;
  kind: JobIdentityAliasKind;
  confidence: "strong" | "corroborating" | "possible";
  priority: number;
};

export type JobIdentityResolution<T> =
  | {
      status: "matched";
      value: T;
      matchedAliases: readonly JobIdentityAlias[];
    }
  | {
      status: "possible" | "ambiguous" | "conflict";
      candidates: readonly T[];
      matchedAliases: readonly JobIdentityAlias[];
    }
  | {
      status: "none";
      candidates: readonly [];
      matchedAliases: readonly [];
    };

export type JobIdentityIndex<T extends object> = {
  add(value: T): void;
  remove(value: T): void;
  replace(previous: T, next: T): void;
  resolve(identity: JobIdentityInput): JobIdentityResolution<T>;
  find(identity: JobIdentityInput): T | null;
};

function normalizeIdentifier(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function normalizeSourceScope(
  canonicalHostname: string | null,
  companyValue: string | null | undefined,
): string | null {
  if (!canonicalHostname || !companyValue) {
    return null;
  }
  const company = normalizeText(companyValue);
  return company ? `${canonicalHostname}:${company}` : null;
}

function normalizeJobIdentityUrlParts(value: string): {
  url: string;
  hostname: string | null;
} {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/u, "") || "/";

    for (const key of [...parsed.searchParams.keys()]) {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.startsWith("utm_") ||
        TRACKING_QUERY_PARAMETERS.has(normalizedKey)
      ) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.searchParams.sort();

    return { url: parsed.toString(), hostname: parsed.hostname };
  } catch {
    return { url: value.trim(), hostname: null };
  }
}

export function normalizeJobIdentityUrl(value: string): string {
  return normalizeJobIdentityUrlParts(value).url;
}

function normalizePostedDate(input: JobIdentityInput): string | null {
  if (input.postedAt) {
    const parsedTimestamp = Date.parse(input.postedAt);
    if (Number.isFinite(parsedTimestamp)) {
      return new Date(parsedTimestamp).toISOString().slice(0, 10);
    }
  }

  const postedAtText = input.postedAtText?.trim() ?? "";
  if (
    !postedAtText ||
    /\b(?:ago|hour|hours|today|yesterday|day|days|week|weeks|month|months)\b/iu.test(
      postedAtText,
    )
  ) {
    return null;
  }
  const parsedText = Date.parse(postedAtText);
  return Number.isFinite(parsedText)
    ? new Date(parsedText).toISOString().slice(0, 10)
    : null;
}

export function buildJobIdentityAliases(
  input: JobIdentityInput,
): JobIdentityAlias[] {
  const source = normalizeIdentifier(input.source);
  const sourceJobId = normalizeIdentifier(input.sourceJobId);
  const providerKey = normalizeIdentifier(input.providerKey);
  const providerIdentifier = normalizeIdentifier(input.providerIdentifier);
  const providerBoardToken = normalizeIdentifier(input.providerBoardToken);
  const canonicalUrlParts = input.canonicalUrl
    ? normalizeJobIdentityUrlParts(input.canonicalUrl)
    : null;
  const sourceScope = normalizeSourceScope(
    canonicalUrlParts?.hostname ?? null,
    input.company,
  );
  const aliases: JobIdentityAlias[] = [];

  if (providerKey && sourceJobId && providerIdentifier) {
    aliases.push({
      key: `provider-id:${providerKey}:${providerIdentifier}:${sourceJobId}`,
      kind: "provider_posting_id",
      confidence: "strong",
      priority: 10,
    });
  }
  if (providerKey && sourceJobId && providerBoardToken) {
    aliases.push({
      key: `provider-board-id:${providerKey}:${providerBoardToken}:${sourceJobId}`,
      kind: "provider_posting_id",
      confidence: "strong",
      priority: 11,
    });
  }
  if (source && sourceJobId && sourceScope) {
    aliases.push({
      key: `source-id:${source}:${sourceScope}:${sourceJobId}`,
      kind: "source_posting_id",
      confidence: "strong",
      priority: 20,
    });
  }
  if (source && sourceJobId) {
    aliases.push({
      key: `unscoped-source-id:${source}:${sourceJobId}`,
      kind: "source_posting_id",
      confidence: "corroborating",
      priority: 21,
    });
  }

  const employerApplicationUrl = input.applicationUrl ?? input.canonicalUrl;
  if (employerApplicationUrl) {
    const normalizedEmployerApplicationUrl =
      employerApplicationUrl === input.canonicalUrl && canonicalUrlParts
        ? canonicalUrlParts.url
        : normalizeJobIdentityUrl(employerApplicationUrl);
    aliases.push({
      key: `employer-url:${normalizedEmployerApplicationUrl}`,
      kind: "employer_application_url",
      confidence: "strong",
      priority: 30,
    });
  }
  if (input.canonicalUrl) {
    aliases.push({
      key: `listing-url:${canonicalUrlParts!.url}`,
      kind: "canonical_listing_url",
      confidence: "strong",
      priority: 40,
    });
  }

  const title = input.title ? normalizeText(input.title) : "";
  const company = input.company ? normalizeText(input.company) : "";
  const location = input.location ? normalizeText(input.location) : "";
  const postedDate = normalizePostedDate(input);
  if (title && company && location && postedDate) {
    aliases.push({
      key: `facts:${title}\u0000${company}\u0000${location}\u0000${postedDate}`,
      kind: "corroborated_listing_facts",
      confidence: "possible",
      priority: 100,
    });
  }

  // Alias-kind prefixes are disjoint and entries are appended in priority order,
  // so a de-duplication map and sort cannot change the result.
  return aliases;
}

export function createJobIdentityDigest(input: JobIdentityInput): string {
  const basis = buildJobIdentityAliases(input)
    .filter((alias) => alias.confidence === "strong")
    .map((alias) => alias.key)
    .join("|");
  let hash = 0x811c9dc5;
  for (let index = 0; index < basis.length; index += 1) {
    hash ^= basis.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function intersectValues<T>(
  current: ReadonlySet<T>,
  incoming: ReadonlySet<T>,
): ReadonlySet<T> {
  if (current === incoming) {
    return current;
  }
  if (current.size === 1) {
    const value = current.values().next().value as T;
    return incoming.has(value) ? current : new Set<T>();
  }
  if (incoming.size === 1) {
    const value = incoming.values().next().value as T;
    return current.has(value) ? incoming : new Set<T>();
  }

  const [smaller, larger] =
    current.size <= incoming.size
      ? [current, incoming]
      : [incoming, current];
  const intersection = new Set<T>();
  for (const value of smaller) {
    if (larger.has(value)) {
      intersection.add(value);
    }
  }
  return intersection;
}

export function createJobIdentityIndex<T extends object>(
  values: readonly T[],
  selectIdentity: (value: T) => JobIdentityInput,
): JobIdentityIndex<T> {
  const valuesByAlias = new Map<string, Set<T>>();
  const aliasesByValue = new Map<T, readonly JobIdentityAlias[]>();

  const add = (value: T): void => {
    const aliases = buildJobIdentityAliases(selectIdentity(value));
    aliasesByValue.set(value, aliases);
    for (const alias of aliases) {
      const matches = valuesByAlias.get(alias.key);
      if (matches) {
        matches.add(value);
      } else {
        valuesByAlias.set(alias.key, new Set([value]));
      }
    }
  };

  const remove = (value: T): void => {
    const aliases = aliasesByValue.get(value) ?? [];
    for (const alias of aliases) {
      const matches = valuesByAlias.get(alias.key);
      matches?.delete(value);
      if (matches?.size === 0) {
        valuesByAlias.delete(alias.key);
      }
    }
    aliasesByValue.delete(value);
  };

  const resolve = (identity: JobIdentityInput): JobIdentityResolution<T> => {
    const aliases = buildJobIdentityAliases(identity);
    const matchedStrongAliases: JobIdentityAlias[] = [];
    let strongCandidates: ReadonlySet<T> | null = null;

    for (const alias of aliases) {
      if (alias.confidence !== "strong") {
        continue;
      }
      const matches = valuesByAlias.get(alias.key);
      if (!matches || matches.size === 0) {
        continue;
      }
      matchedStrongAliases.push(alias);
      strongCandidates = strongCandidates
        ? intersectValues(strongCandidates, matches)
        : matches;
      if (strongCandidates.size === 0) {
        return {
          status: "conflict",
          candidates: [],
          matchedAliases: matchedStrongAliases,
        };
      }
    }

    const corroboratingAliases = aliases.filter(
      (alias) => alias.confidence === "corroborating",
    );
    const matchedCorroboratingAliases: JobIdentityAlias[] = [];
    let corroboratingCandidates: ReadonlySet<T> | null = null;
    for (const alias of corroboratingAliases) {
      const matches = valuesByAlias.get(alias.key);
      if (!matches || matches.size === 0) {
        continue;
      }
      matchedCorroboratingAliases.push(alias);
      corroboratingCandidates = corroboratingCandidates
        ? intersectValues(corroboratingCandidates, matches)
        : matches;
    }

    if (strongCandidates && corroboratingCandidates) {
      const corroborated = intersectValues(
        strongCandidates,
        corroboratingCandidates,
      );
      if (corroborated.size === 0) {
        return {
          status: "conflict",
          candidates: [],
          matchedAliases: [
            ...matchedStrongAliases,
            ...matchedCorroboratingAliases,
          ],
        };
      }
      strongCandidates = corroborated;
    }

    if (strongCandidates?.size === 1) {
      return {
        status: "matched",
        value: [...strongCandidates][0]!,
        matchedAliases: [
          ...matchedStrongAliases,
          ...matchedCorroboratingAliases,
        ],
      };
    }

    const possibleAliases = aliases.filter(
      (alias) => alias.confidence === "possible",
    );
    const matchedPossibleAliases: JobIdentityAlias[] = [];
    let possibleCandidates: ReadonlySet<T> | null = null;
    for (const alias of possibleAliases) {
      const matches = valuesByAlias.get(alias.key);
      if (!matches || matches.size === 0) {
        continue;
      }
      matchedPossibleAliases.push(alias);
      possibleCandidates = possibleCandidates
        ? intersectValues(possibleCandidates, matches)
        : matches;
    }

    if (strongCandidates) {
      if (possibleCandidates) {
        const narrowed = intersectValues(strongCandidates, possibleCandidates);
        if (narrowed.size === 1) {
          return {
            status: "matched",
            value: [...narrowed][0]!,
            matchedAliases: [
              ...matchedStrongAliases,
              ...matchedCorroboratingAliases,
              ...matchedPossibleAliases,
            ],
          };
        }
        if (narrowed.size === 0) {
          return {
            status: "ambiguous",
            candidates: [...strongCandidates],
            matchedAliases: matchedStrongAliases,
          };
        }
        strongCandidates = narrowed;
      }
      return {
        status: "ambiguous",
        candidates: [...strongCandidates],
        matchedAliases: [
          ...matchedStrongAliases,
          ...matchedCorroboratingAliases,
          ...matchedPossibleAliases,
        ],
      };
    }

    let nonStrongCandidates = corroboratingCandidates;
    const nonStrongAliases = [...matchedCorroboratingAliases];
    if (possibleCandidates) {
      nonStrongCandidates = nonStrongCandidates
        ? intersectValues(nonStrongCandidates, possibleCandidates)
        : possibleCandidates;
      nonStrongAliases.push(...matchedPossibleAliases);
    }

    if (nonStrongCandidates && nonStrongCandidates.size > 0) {
      return {
        status: "possible",
        candidates: [...nonStrongCandidates],
        matchedAliases: nonStrongAliases,
      };
    }

    return { status: "none", candidates: [], matchedAliases: [] };
  };

  for (const value of values) {
    add(value);
  }

  return {
    add,
    remove,
    replace(previous, next) {
      remove(previous);
      add(next);
    },
    resolve,
    find(identity) {
      const resolution = resolve(identity);
      return resolution.status === "matched" ? resolution.value : null;
    },
  };
}
