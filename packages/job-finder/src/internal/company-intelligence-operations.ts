/**
 * Pure, immutable company intelligence operations.
 *
 * Reconciliation is deliberately conservative: identity is only ever linked
 * through an exact normalized employer domain when one is present, otherwise
 * through an exact normalized company name. Ambiguous or near matches never
 * merge silently; they surface as explicit `pending` merge-review candidates
 * that require an explicit user decision.
 *
 * Every mutating operation returns freshly schema-parsed values and never
 * mutates its inputs. Ids for newly created companies and all timestamps are
 * supplied by the caller; the operations never mint ids or times themselves.
 */

import {
  ApplicationRecordSchema,
  type ApplicationRecord,
  ApplicationStatusSchema,
  type ApplicationStatus,
  CompanyDomainSchema,
  type CompanyDomain,
  CompanyEntitySchema,
  type CompanyEntity,
  CompanyIntelligenceMutationInputSchema,
  type CompanyIntelligenceMutationInput,
  CompanyMergeReviewCandidateSchema,
  type CompanyMergeReviewCandidate,
  CompanySourceHistoryRefSchema,
  type CompanySourceHistoryRef,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  ReviewCompanyMergeInputSchema,
  type ReviewCompanyMergeInput,
  SavedJobSchema,
  type SavedJob,
  SetCompanyPreferenceInputSchema,
  type SetCompanyPreferenceInput,
} from "@unemployed/contracts";

import { buildJobIdentityAliases, type JobIdentityInput } from "./job-identity";
import { normalizeText } from "./shared";

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** Lowercases and collapses company names to a comparable token form. */
export function normalizeCompanyName(value: string): string {
  return normalizeText(value);
}

/**
 * Normalizes an employer domain for exact comparison: lowercase, trimmed, a
 * single trailing dot removed, and a leading `www.` label stripped. The result
 * is still an exact comparison key; only cosmetic variants collapse.
 */
export function normalizeEmployerDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.+$/u, "")
    .replace(/^www\./u, "");
}

function tokenSet(value: string): string[] {
  return value.split(/\s+/u).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

interface ZodIssueLike {
  message?: string;
}

interface ZodErrorLike {
  issues: readonly ZodIssueLike[];
}

function firstIssueMessage(error: ZodErrorLike): string {
  return error.issues[0]?.message ?? "Invalid value.";
}

function addToIndex(
  index: Map<string, string[]>,
  key: string,
  id: string,
): void {
  if (!key) return;
  const existing = index.get(key);
  if (existing) {
    if (!existing.includes(id)) existing.push(id);
  } else {
    index.set(key, [id]);
  }
}

function unionStrings(
  first: readonly string[],
  second: readonly string[],
): string[] {
  const seen = new Set(first);
  const result = [...first];
  for (const value of second) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function unionById<T extends { id: string }>(
  first: readonly T[],
  second: readonly T[],
): T[] {
  const seen = new Set(first.map((item) => item.id));
  const result = first.map((item) => ({ ...item }));
  for (const item of second) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push({ ...item });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Reconcile
// ---------------------------------------------------------------------------

export type ReconcileCompaniesFailure = {
  code: "invalid_input";
  message: string;
};

export type CreatedMergeCandidateSummary = {
  companyId: string;
  candidateCompanyId: string;
  reason: string;
};

export type ReconcileCompaniesSummary = {
  createdCompanyIds: string[];
  matchedCompanyIds: string[];
  ambiguousEvidenceCount: number;
  unresolvableEvidenceCount: number;
  createdMergeCandidates: CreatedMergeCandidateSummary[];
};

export type ReconcileCompaniesResult =
  | {
      ok: true;
      companies: CompanyEntity[];
      summary: ReconcileCompaniesSummary;
    }
  | { ok: false; failure: ReconcileCompaniesFailure };

type Evidence =
  | { kind: "job"; job: SavedJob }
  | { kind: "application"; record: ApplicationRecord };

type CompanyIndexes = {
  byId: Map<string, number>;
  domainIndex: Map<string, string[]>;
  nameIndex: Map<string, string[]>;
};

type Resolution =
  | { status: "matched"; companyId: string }
  | { status: "ambiguous"; companyIds: string[]; reason: string }
  | { status: "none" };

function buildIndexes(companies: readonly CompanyEntity[]): CompanyIndexes {
  const byId = new Map<string, number>();
  const domainIndex = new Map<string, string[]>();
  const nameIndex = new Map<string, string[]>();

  for (let index = 0; index < companies.length; index += 1) {
    const company = companies[index]!;
    byId.set(company.id, index);
    for (const domain of company.domains) {
      addToIndex(
        domainIndex,
        normalizeEmployerDomain(domain.domain),
        company.id,
      );
    }
    addToIndex(
      nameIndex,
      normalizeCompanyName(company.canonicalName),
      company.id,
    );
    for (const alias of company.aliases) {
      addToIndex(nameIndex, alias.normalized, company.id);
    }
  }

  return { byId, domainIndex, nameIndex };
}

function resolveEvidence(
  indexes: CompanyIndexes,
  evidence: Evidence,
): Resolution {
  const name =
    evidence.kind === "job" ? evidence.job.company : evidence.record.company;
  const domain = evidence.kind === "job" ? evidence.job.employerDomain : null;

  if (domain !== null && domain.trim() !== "") {
    const normalizedDomain = normalizeEmployerDomain(domain);
    const domainMatches = indexes.domainIndex.get(normalizedDomain) ?? [];
    if (domainMatches.length === 1) {
      return { status: "matched", companyId: domainMatches[0]! };
    }
    if (domainMatches.length > 1) {
      return {
        status: "ambiguous",
        companyIds: [...domainMatches],
        reason: `Multiple companies share the employer domain "${normalizedDomain}".`,
      };
    }
  }

  const normalizedName = normalizeCompanyName(name);
  if (!normalizedName) return { status: "none" };

  const nameMatches = indexes.nameIndex.get(normalizedName) ?? [];
  if (nameMatches.length === 1) {
    return { status: "matched", companyId: nameMatches[0]! };
  }
  if (nameMatches.length > 1) {
    return {
      status: "ambiguous",
      companyIds: [...nameMatches],
      reason: `Multiple companies share the company name "${normalizedName}".`,
    };
  }

  return { status: "none" };
}

function mergeSourceHistory(
  current: readonly CompanySourceHistoryRef[],
  evidence: Evidence,
  now: string,
  jobSourceById: ReadonlyMap<string, string>,
): { refs: readonly CompanySourceHistoryRef[]; changed: boolean } {
  let sourceId: string;
  let firstSeenAt: string;
  let lastSeenAt: string;
  let applicationRecordId: string | null;

  if (evidence.kind === "job") {
    const job = evidence.job;
    sourceId = job.source;
    firstSeenAt = job.firstSeenAt ?? job.discoveredAt ?? now;
    lastSeenAt =
      job.lastSeenAt ?? job.lastVerifiedActiveAt ?? job.discoveredAt ?? now;
    applicationRecordId = null;
  } else {
    sourceId = jobSourceById.get(evidence.record.jobId) ?? "application_record";
    firstSeenAt = evidence.record.lastUpdatedAt;
    lastSeenAt = evidence.record.lastUpdatedAt;
    applicationRecordId = evidence.record.id;
  }

  const existingIndex = current.findIndex((ref) => ref.sourceId === sourceId);

  if (existingIndex < 0) {
    return {
      refs: [
        ...current,
        CompanySourceHistoryRefSchema.parse({
          id: sourceId,
          sourceId,
          firstSeenAt,
          lastSeenAt,
          applicationRecordIds:
            applicationRecordId === null ? [] : [applicationRecordId],
        }),
      ],
      changed: true,
    };
  }

  const existing = current[existingIndex]!;
  const nextFirstSeenAt =
    Date.parse(existing.firstSeenAt) <= Date.parse(firstSeenAt)
      ? existing.firstSeenAt
      : firstSeenAt;
  const nextLastSeenAt =
    Date.parse(existing.lastSeenAt) >= Date.parse(lastSeenAt)
      ? existing.lastSeenAt
      : lastSeenAt;
  const appIds = new Set(existing.applicationRecordIds);
  if (applicationRecordId !== null) appIds.add(applicationRecordId);
  const nextAppIds = [...appIds];
  const changed =
    nextFirstSeenAt !== existing.firstSeenAt ||
    nextLastSeenAt !== existing.lastSeenAt ||
    nextAppIds.length !== existing.applicationRecordIds.length ||
    nextAppIds.some(
      (id, appIndex) => id !== existing.applicationRecordIds[appIndex],
    );

  if (!changed) return { refs: current, changed: false };

  return {
    refs: current.map((ref, refIndex) =>
      refIndex === existingIndex
        ? CompanySourceHistoryRefSchema.parse({
            ...ref,
            firstSeenAt: nextFirstSeenAt,
            lastSeenAt: nextLastSeenAt,
            applicationRecordIds: nextAppIds,
          })
        : ref,
    ),
    changed: true,
  };
}

function attachEvidence(input: {
  working: CompanyEntity[];
  indexes: CompanyIndexes;
  companyId: string;
  evidence: Evidence;
  now: string;
  jobSourceById: ReadonlyMap<string, string>;
  created: CreatedMergeCandidateSummary[];
}): void {
  const { working, indexes, companyId, evidence, now, jobSourceById, created } =
    input;
  const index = indexes.byId.get(companyId);
  if (index === undefined) return;
  const company = working[index]!;

  const jobIds = new Set(company.jobIds);
  const applicationRecordIds = new Set(company.applicationRecordIds);
  const domains = company.domains.map((domain) => ({ ...domain }));
  const aliases = company.aliases.map((alias) => ({ ...alias }));
  let changed = false;

  if (evidence.kind === "job") {
    if (!jobIds.has(evidence.job.id)) {
      jobIds.add(evidence.job.id);
      changed = true;
    }

    const rawDomain = evidence.job.employerDomain;
    if (rawDomain !== null && rawDomain.trim() !== "") {
      const normalizedDomain = normalizeEmployerDomain(rawDomain);
      if (
        !domains.some(
          (domain) =>
            normalizeEmployerDomain(domain.domain) === normalizedDomain,
        )
      ) {
        const parsedDomain = CompanyDomainSchema.safeParse({
          domain: normalizedDomain,
          primary: domains.length === 0,
          verifiedAt: null,
        });
        if (parsedDomain.success) {
          domains.push(parsedDomain.data);
          addToIndex(indexes.domainIndex, normalizedDomain, companyId);
          changed = true;

          const domainMatches = indexes.domainIndex.get(normalizedDomain) ?? [];
          if (domainMatches.length > 1) {
            flagAmbiguousPair(
              working,
              indexes,
              domainMatches,
              `Multiple companies share the employer domain "${normalizedDomain}".`,
              now,
              created,
            );
          }
        }
      }
    }
  } else {
    if (!applicationRecordIds.has(evidence.record.id)) {
      applicationRecordIds.add(evidence.record.id);
      changed = true;
    }
  }

  const rawName =
    evidence.kind === "job" ? evidence.job.company : evidence.record.company;
  const normalizedName = normalizeCompanyName(rawName);
  const canonicalNormalized = normalizeCompanyName(company.canonicalName);
  const aliasExists =
    normalizedName !== "" &&
    (normalizedName === canonicalNormalized ||
      aliases.some((alias) => alias.normalized === normalizedName));
  if (!aliasExists && normalizedName !== "") {
    aliases.push({
      alias: rawName,
      normalized: normalizedName,
      confidence: 1,
    });
    addToIndex(indexes.nameIndex, normalizedName, companyId);
    changed = true;

    const nameMatches = indexes.nameIndex.get(normalizedName) ?? [];
    if (nameMatches.length > 1) {
      flagAmbiguousPair(
        working,
        indexes,
        nameMatches,
        `Multiple companies share the company name "${normalizedName}".`,
        now,
        created,
      );
    }
  }

  const sourceHistoryResult = mergeSourceHistory(
    company.sourceHistory,
    evidence,
    now,
    jobSourceById,
  );
  if (sourceHistoryResult.changed) changed = true;

  if (!changed) return;

  working[index] = CompanyEntitySchema.parse({
    ...company,
    jobIds: [...jobIds],
    applicationRecordIds: [...applicationRecordIds],
    domains,
    aliases,
    sourceHistory: [...sourceHistoryResult.refs],
    updatedAt: now,
  });
}

function createCompanyEntity(input: {
  evidence: Evidence;
  id: string;
  now: string;
  jobSourceById: ReadonlyMap<string, string>;
}): CompanyEntity {
  const { evidence, id, now, jobSourceById } = input;
  const rawName =
    evidence.kind === "job" ? evidence.job.company : evidence.record.company;
  const rawDomain =
    evidence.kind === "job" ? evidence.job.employerDomain : null;
  const normalizedDomain =
    rawDomain !== null && rawDomain.trim() !== ""
      ? normalizeEmployerDomain(rawDomain)
      : null;

  let domains: CompanyDomain[] = [];
  if (normalizedDomain !== null) {
    const parsedDomain = CompanyDomainSchema.safeParse({
      domain: normalizedDomain,
      primary: true,
      verifiedAt: null,
    });
    if (parsedDomain.success) domains = [parsedDomain.data];
  }

  const sourceId =
    evidence.kind === "job"
      ? evidence.job.source
      : (jobSourceById.get(evidence.record.jobId) ?? "application_record");
  const firstSeenAt =
    evidence.kind === "job"
      ? (evidence.job.firstSeenAt ?? evidence.job.discoveredAt ?? now)
      : evidence.record.lastUpdatedAt;
  const lastSeenAt =
    evidence.kind === "job"
      ? (evidence.job.lastSeenAt ??
        evidence.job.lastVerifiedActiveAt ??
        evidence.job.discoveredAt ??
        now)
      : evidence.record.lastUpdatedAt;

  return CompanyEntitySchema.parse({
    id,
    canonicalName: rawName.trim(),
    aliases: [],
    domains,
    preference: "neutral",
    preferenceReason: null,
    mergeReviewCandidates: [],
    contacts: [],
    notes: [],
    sourceHistory: [
      CompanySourceHistoryRefSchema.parse({
        id: sourceId,
        sourceId,
        firstSeenAt,
        lastSeenAt,
        applicationRecordIds:
          evidence.kind === "application" ? [evidence.record.id] : [],
      }),
    ],
    jobIds: evidence.kind === "job" ? [evidence.job.id] : [],
    applicationRecordIds:
      evidence.kind === "application" ? [evidence.record.id] : [],
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Creates a `pending` merge-review candidate between two companies when none
 * has been recorded in either direction. The primary side is deterministic:
 * the company with the earliest `createdAt`, then the lexicographically
 * smaller id. A previously decided pair is never re-flagged.
 */
function ensureMergeCandidates(
  working: CompanyEntity[],
  indexes: CompanyIndexes,
  firstId: string,
  secondId: string,
  reason: string,
  now: string,
): CreatedMergeCandidateSummary | null {
  if (firstId === secondId) return null;
  const firstIndex = indexes.byId.get(firstId);
  const secondIndex = indexes.byId.get(secondId);
  if (firstIndex === undefined || secondIndex === undefined) return null;

  const first = working[firstIndex]!;
  const second = working[secondIndex]!;

  const firstCreatedAt = Date.parse(first.createdAt);
  const secondCreatedAt = Date.parse(second.createdAt);
  const firstIsPrimary =
    firstCreatedAt < secondCreatedAt ||
    (firstCreatedAt === secondCreatedAt && first.id < second.id);
  const primary = firstIsPrimary ? first : second;
  const secondary = firstIsPrimary ? second : first;
  const primaryIndex = firstIsPrimary ? firstIndex : secondIndex;

  const alreadyRecorded =
    primary.mergeReviewCandidates.some(
      (candidate) => candidate.candidateCompanyId === secondary.id,
    ) ||
    secondary.mergeReviewCandidates.some(
      (candidate) => candidate.candidateCompanyId === primary.id,
    );
  if (alreadyRecorded) return null;

  const candidate = CompanyMergeReviewCandidateSchema.parse({
    candidateCompanyId: secondary.id,
    reason,
    decision: "pending",
    decidedAt: null,
    requiresUserDecision: true,
  });

  working[primaryIndex] = CompanyEntitySchema.parse({
    ...primary,
    mergeReviewCandidates: [...primary.mergeReviewCandidates, candidate],
    updatedAt: now,
  });

  return { companyId: primary.id, candidateCompanyId: secondary.id, reason };
}

function flagAmbiguousPair(
  working: CompanyEntity[],
  indexes: CompanyIndexes,
  ids: readonly string[],
  reason: string,
  now: string,
  created: CreatedMergeCandidateSummary[],
): void {
  for (let firstIndex = 0; firstIndex < ids.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < ids.length;
      secondIndex += 1
    ) {
      const candidate = ensureMergeCandidates(
        working,
        indexes,
        ids[firstIndex]!,
        ids[secondIndex]!,
        reason,
        now,
      );
      if (candidate !== null) created.push(candidate);
    }
  }
}

function namesAreNear(first: CompanyEntity, second: CompanyEntity): boolean {
  const firstTokens = tokenSet(normalizeCompanyName(first.canonicalName));
  const secondTokens = tokenSet(normalizeCompanyName(second.canonicalName));
  if (firstTokens.length === 0 || secondTokens.length === 0) return false;
  if (firstTokens.join(" ") === secondTokens.join(" ")) return false;

  const firstSet = new Set(firstTokens);
  const shared = secondTokens.filter((token) => firstSet.has(token)).length;
  if (shared === 0) return false;

  const shorterLength = Math.min(firstTokens.length, secondTokens.length);
  if (shared === shorterLength) return true;

  const unionLength = firstTokens.length + secondTokens.length - shared;
  return shared / unionLength >= 0.5;
}

function domainLabel(domain: string): string | null {
  const normalized = normalizeEmployerDomain(domain);
  if (!normalized) return null;
  const label = normalized.split(".")[0];
  return label || null;
}

function companiesShareExactDomain(
  first: CompanyEntity,
  second: CompanyEntity,
): boolean {
  const secondDomains = new Set(
    second.domains.map((domain) => normalizeEmployerDomain(domain.domain)),
  );
  return first.domains.some((domain) =>
    secondDomains.has(normalizeEmployerDomain(domain.domain)),
  );
}

function companiesShareExactName(
  first: CompanyEntity,
  second: CompanyEntity,
): boolean {
  const firstKeys = new Set([
    normalizeCompanyName(first.canonicalName),
    ...first.aliases.map((alias) => alias.normalized),
  ]);
  const secondKeys = new Set([
    normalizeCompanyName(second.canonicalName),
    ...second.aliases.map((alias) => alias.normalized),
  ]);
  for (const key of firstKeys) {
    if (key && secondKeys.has(key)) return true;
  }
  return false;
}

function domainsAreNear(
  first: CompanyEntity,
  second: CompanyEntity,
): { near: boolean; firstDomain: string | null; secondDomain: string | null } {
  for (const firstDomain of first.domains) {
    for (const secondDomain of second.domains) {
      const firstNormalized = normalizeEmployerDomain(firstDomain.domain);
      const secondNormalized = normalizeEmployerDomain(secondDomain.domain);
      if (firstNormalized === secondNormalized) continue;
      const firstLabel = domainLabel(firstNormalized);
      const secondLabel = domainLabel(secondNormalized);
      if (firstLabel !== null && firstLabel === secondLabel) {
        return {
          near: true,
          firstDomain: firstNormalized,
          secondDomain: secondNormalized,
        };
      }
    }
  }
  return { near: false, firstDomain: null, secondDomain: null };
}

/**
 * Flags near-name and near-domain conflicts between company pairs as explicit
 * `pending` merge-review candidates. Pairs that already share an exact domain
 * or exact name are skipped: those conflicts are already surfaced by the
 * ambiguity handling during evidence attachment.
 */
function applyNearConflictCandidates(
  working: CompanyEntity[],
  indexes: CompanyIndexes,
  now: string,
  created: CreatedMergeCandidateSummary[],
): void {
  const tokenIndex = new Map<string, string[]>();
  for (const company of working) {
    for (const token of tokenSet(normalizeCompanyName(company.canonicalName))) {
      addToIndex(tokenIndex, token, company.id);
    }
  }

  const visited = new Set<string>();
  for (const ids of tokenIndex.values()) {
    for (let firstIndex = 0; firstIndex < ids.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < ids.length;
        secondIndex += 1
      ) {
        const firstId = ids[firstIndex]!;
        const secondId = ids[secondIndex]!;
        const pairKey =
          firstId < secondId
            ? `${firstId}|${secondId}`
            : `${secondId}|${firstId}`;
        if (visited.has(pairKey)) continue;
        visited.add(pairKey);

        const firstIndexInWorking = indexes.byId.get(firstId);
        const secondIndexInWorking = indexes.byId.get(secondId);
        if (
          firstIndexInWorking === undefined ||
          secondIndexInWorking === undefined
        ) {
          continue;
        }
        const first = working[firstIndexInWorking]!;
        const second = working[secondIndexInWorking]!;

        if (
          companiesShareExactDomain(first, second) ||
          companiesShareExactName(first, second)
        ) {
          continue;
        }

        const reasons: string[] = [];
        if (namesAreNear(first, second)) {
          reasons.push(
            `Similar company name "${first.canonicalName}" vs "${second.canonicalName}".`,
          );
        }
        const domainNear = domainsAreNear(first, second);
        if (domainNear.near) {
          reasons.push(
            `Similar employer domain "${domainNear.firstDomain}" vs "${domainNear.secondDomain}".`,
          );
        }
        if (reasons.length === 0) continue;

        const candidate = ensureMergeCandidates(
          working,
          indexes,
          firstId,
          secondId,
          reasons.join(" "),
          now,
        );
        if (candidate !== null) created.push(candidate);
      }
    }
  }
}

/**
 * Reconciles companies from jobs and application records.
 *
 * Matching is conservative: an exact normalized employer domain wins when one
 * is present, otherwise an exact normalized company name. Ambiguous matches
 * are never attached and instead produce pending merge-review candidates.
 * Near-name and near-domain conflicts also produce explicit pending
 * candidates. Existing companies are preserved; new companies receive
 * caller-provided ids and the caller-provided `now` timestamp.
 */
export function reconcileCompanies(input: {
  companies: readonly CompanyEntity[];
  jobs: readonly SavedJob[];
  applicationRecords: readonly ApplicationRecord[];
  now: string;
  createCompanyId: (identity: {
    normalizedName: string;
    normalizedDomain: string | null;
  }) => string;
}): ReconcileCompaniesResult {
  const nowResult = IsoDateTimeSchema.safeParse(input.now);
  if (!nowResult.success) {
    return {
      ok: false,
      failure: {
        code: "invalid_input",
        message: "now must be a valid ISO datetime.",
      },
    };
  }
  const now = nowResult.data;

  const companiesResult = CompanyEntitySchema.array().safeParse(
    input.companies,
  );
  if (!companiesResult.success) {
    return {
      ok: false,
      failure: {
        code: "invalid_input",
        message: firstIssueMessage(companiesResult.error),
      },
    };
  }
  const jobsResult = SavedJobSchema.array().safeParse(input.jobs);
  if (!jobsResult.success) {
    return {
      ok: false,
      failure: {
        code: "invalid_input",
        message: firstIssueMessage(jobsResult.error),
      },
    };
  }
  const recordsResult = ApplicationRecordSchema.array().safeParse(
    input.applicationRecords,
  );
  if (!recordsResult.success) {
    return {
      ok: false,
      failure: {
        code: "invalid_input",
        message: firstIssueMessage(recordsResult.error),
      },
    };
  }

  const working: CompanyEntity[] = companiesResult.data;

  const seenIds = new Set<string>();
  for (const company of working) {
    if (seenIds.has(company.id)) {
      return {
        ok: false,
        failure: {
          code: "invalid_input",
          message: `Duplicate company id "${company.id}".`,
        },
      };
    }
    seenIds.add(company.id);
  }

  const indexes = buildIndexes(working);

  const jobSourceById = new Map<string, string>();
  for (const job of jobsResult.data) {
    if (!jobSourceById.has(job.id)) jobSourceById.set(job.id, job.source);
  }

  const summary: ReconcileCompaniesSummary = {
    createdCompanyIds: [],
    matchedCompanyIds: [],
    ambiguousEvidenceCount: 0,
    unresolvableEvidenceCount: 0,
    createdMergeCandidates: [],
  };

  const processEvidence = (evidence: Evidence): void => {
    const resolution = resolveEvidence(indexes, evidence);

    if (resolution.status === "matched") {
      attachEvidence({
        working,
        indexes,
        companyId: resolution.companyId,
        evidence,
        now,
        jobSourceById,
        created: summary.createdMergeCandidates,
      });
      if (!summary.matchedCompanyIds.includes(resolution.companyId)) {
        summary.matchedCompanyIds.push(resolution.companyId);
      }
      return;
    }

    if (resolution.status === "ambiguous") {
      summary.ambiguousEvidenceCount += 1;
      flagAmbiguousPair(
        working,
        indexes,
        resolution.companyIds,
        resolution.reason,
        now,
        summary.createdMergeCandidates,
      );
      return;
    }

    const rawName =
      evidence.kind === "job" ? evidence.job.company : evidence.record.company;
    const normalizedName = normalizeCompanyName(rawName);
    if (!normalizedName) {
      summary.unresolvableEvidenceCount += 1;
      return;
    }

    const rawDomain =
      evidence.kind === "job" ? evidence.job.employerDomain : null;
    const normalizedDomain =
      rawDomain !== null && rawDomain.trim() !== ""
        ? normalizeEmployerDomain(rawDomain)
        : null;

    const identity = { normalizedName, normalizedDomain };
    const idResult = NonEmptyStringSchema.safeParse(
      input.createCompanyId(identity),
    );
    if (!idResult.success) {
      throw new Error(
        "createCompanyId must return a non-empty string id for a new company.",
      );
    }
    const newId = idResult.data;
    if (indexes.byId.has(newId)) {
      throw new Error(
        `createCompanyId returned an id that already exists: "${newId}".`,
      );
    }

    const company = createCompanyEntity({
      evidence,
      id: newId,
      now,
      jobSourceById,
    });

    indexes.byId.set(newId, working.length);
    working.push(company);
    for (const domain of company.domains) {
      addToIndex(
        indexes.domainIndex,
        normalizeEmployerDomain(domain.domain),
        newId,
      );
    }
    addToIndex(
      indexes.nameIndex,
      normalizeCompanyName(company.canonicalName),
      newId,
    );
    summary.createdCompanyIds.push(newId);
  };

  try {
    for (const job of jobsResult.data) {
      processEvidence({ kind: "job", job });
    }
    for (const record of recordsResult.data) {
      processEvidence({ kind: "application", record });
    }
  } catch (error) {
    return {
      ok: false,
      failure: {
        code: "invalid_input",
        message: error instanceof Error ? error.message : "Invalid input.",
      },
    };
  }

  applyNearConflictCandidates(
    working,
    indexes,
    now,
    summary.createdMergeCandidates,
  );

  return {
    ok: true,
    companies: CompanyEntitySchema.array().parse(working),
    summary,
  };
}

// ---------------------------------------------------------------------------
// Company preference
// ---------------------------------------------------------------------------

export type SetCompanyPreferenceFailure =
  | { code: "invalid_input"; message: string }
  | { code: "company_not_found"; message: string };

export type SetCompanyPreferenceResult =
  | { ok: true; companies: CompanyEntity[]; company: CompanyEntity }
  | { ok: false; failure: SetCompanyPreferenceFailure };

/**
 * Sets a company preference explicitly. An explicit user preference clears any
 * inferred preference reason and stamps the caller-provided `now` as the
 * update time. Returns a fresh, schema-parsed company list.
 */
export function setCompanyPreference(input: {
  companies: readonly CompanyEntity[];
  input: SetCompanyPreferenceInput;
  now: string;
}): SetCompanyPreferenceResult {
  const nowResult = IsoDateTimeSchema.safeParse(input.now);
  if (!nowResult.success) {
    return {
      ok: false,
      failure: {
        code: "invalid_input",
        message: "now must be a valid ISO datetime.",
      },
    };
  }
  const now = nowResult.data;

  const companiesResult = CompanyEntitySchema.array().safeParse(
    input.companies,
  );
  if (!companiesResult.success) {
    return {
      ok: false,
      failure: {
        code: "invalid_input",
        message: firstIssueMessage(companiesResult.error),
      },
    };
  }

  const commandResult = SetCompanyPreferenceInputSchema.safeParse(input.input);
  if (!commandResult.success) {
    return {
      ok: false,
      failure: {
        code: "invalid_input",
        message: firstIssueMessage(commandResult.error),
      },
    };
  }
  const command = commandResult.data;

  const index = companiesResult.data.findIndex(
    (company) => company.id === command.companyId,
  );
  if (index < 0) {
    return {
      ok: false,
      failure: {
        code: "company_not_found",
        message: `Company "${command.companyId}" does not exist.`,
      },
    };
  }

  const nextCompany = CompanyEntitySchema.parse({
    ...companiesResult.data[index]!,
    preference: command.preference,
    preferenceReason: null,
    updatedAt: now,
  });

  const companies = companiesResult.data.map((company, companyIndex) =>
    companyIndex === index ? nextCompany : company,
  );

  return { ok: true, companies, company: nextCompany };
}

// ---------------------------------------------------------------------------
// Merge review
// ---------------------------------------------------------------------------

export type ReviewCompanyMergeFailure =
  | { code: "invalid_input"; message: string }
  | { code: "company_not_found"; message: string }
  | { code: "candidate_not_found"; message: string }
  | {
      code: "candidate_already_decided";
      message: string;
      currentDecision: "approved_merge" | "rejected";
    }
  | { code: "candidate_company_not_found"; message: string };

export type ReviewCompanyMergeResult =
  | {
      ok: true;
      companies: CompanyEntity[];
      company: CompanyEntity;
      merged: CompanyEntity | null;
    }
  | { ok: false; failure: ReviewCompanyMergeFailure };

function dedupeCandidates(
  candidates: readonly CompanyMergeReviewCandidate[],
): CompanyMergeReviewCandidate[] {
  const seen = new Set<string>();
  const result: CompanyMergeReviewCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.candidateCompanyId)) continue;
    seen.add(candidate.candidateCompanyId);
    result.push(candidate);
  }
  return result;
}

function mergeRefLists(
  first: readonly CompanySourceHistoryRef[],
  second: readonly CompanySourceHistoryRef[],
): CompanySourceHistoryRef[] {
  const bySourceId = new Map<string, CompanySourceHistoryRef>();
  const result: CompanySourceHistoryRef[] = [];
  for (const ref of first) {
    bySourceId.set(ref.sourceId, ref);
    result.push(ref);
  }
  for (const ref of second) {
    const existing = bySourceId.get(ref.sourceId);
    if (!existing) {
      bySourceId.set(ref.sourceId, ref);
      result.push(ref);
      continue;
    }
    const existingIndex = result.indexOf(existing);
    const merged = CompanySourceHistoryRefSchema.parse({
      ...existing,
      firstSeenAt:
        Date.parse(existing.firstSeenAt) <= Date.parse(ref.firstSeenAt)
          ? existing.firstSeenAt
          : ref.firstSeenAt,
      lastSeenAt:
        Date.parse(existing.lastSeenAt) >= Date.parse(ref.lastSeenAt)
          ? existing.lastSeenAt
          : ref.lastSeenAt,
      applicationRecordIds: unionStrings(
        existing.applicationRecordIds,
        ref.applicationRecordIds,
      ),
    });
    bySourceId.set(ref.sourceId, merged);
    if (existingIndex >= 0) result[existingIndex] = merged;
  }
  return result;
}

/**
 * Deterministically merges `target` into `primary` and returns a fresh,
 * schema-parsed entity. The primary company keeps its id, canonical name,
 * preference, and preference reason; every job, application, contact, note,
 * and source id from both sides is preserved, and the target's canonical name
 * becomes an alias. The earliest `createdAt` is kept and `updatedAt` is
 * stamped with the caller-provided `now`.
 */
function mergeCompanies(
  primary: CompanyEntity,
  target: CompanyEntity,
  now: string,
): CompanyEntity {
  const aliasKeys = new Set<string>([
    normalizeCompanyName(primary.canonicalName),
    ...primary.aliases.map((alias) => alias.normalized),
  ]);
  const aliases = primary.aliases.map((alias) => ({ ...alias }));
  const targetCanonicalNormalized = normalizeCompanyName(target.canonicalName);
  if (targetCanonicalNormalized && !aliasKeys.has(targetCanonicalNormalized)) {
    aliases.push({
      alias: target.canonicalName,
      normalized: targetCanonicalNormalized,
      confidence: 1,
    });
    aliasKeys.add(targetCanonicalNormalized);
  }
  for (const alias of target.aliases) {
    if (aliasKeys.has(alias.normalized)) continue;
    aliasKeys.add(alias.normalized);
    aliases.push({ ...alias });
  }

  const domainKeys = new Set<string>();
  const domains: CompanyDomain[] = [];
  let primaryAssigned = false;
  for (const domain of [...primary.domains, ...target.domains]) {
    const key = normalizeEmployerDomain(domain.domain);
    if (domainKeys.has(key)) continue;
    domainKeys.add(key);
    const primaryFlag = domain.primary && !primaryAssigned;
    if (primaryFlag) primaryAssigned = true;
    domains.push({ ...domain, primary: primaryFlag });
  }

  const mergeReviewCandidates = dedupeCandidates([
    ...primary.mergeReviewCandidates.filter(
      (candidate) => candidate.candidateCompanyId !== target.id,
    ),
    ...target.mergeReviewCandidates.filter(
      (candidate) =>
        candidate.candidateCompanyId !== primary.id &&
        candidate.candidateCompanyId !== target.id,
    ),
  ]);

  return CompanyEntitySchema.parse({
    id: primary.id,
    canonicalName: primary.canonicalName,
    aliases,
    domains,
    preference: primary.preference,
    preferenceReason: primary.preferenceReason,
    mergeReviewCandidates,
    contacts: unionById(primary.contacts, target.contacts),
    notes: unionById(primary.notes, target.notes),
    salaryOfferEvidence: unionById(
      primary.salaryOfferEvidence,
      target.salaryOfferEvidence,
    ),
    sourceHistory: mergeRefLists(primary.sourceHistory, target.sourceHistory),
    jobIds: unionStrings(primary.jobIds, target.jobIds),
    applicationRecordIds: unionStrings(
      primary.applicationRecordIds,
      target.applicationRecordIds,
    ),
    createdAt:
      Date.parse(primary.createdAt) <= Date.parse(target.createdAt)
        ? primary.createdAt
        : target.createdAt,
    updatedAt: now,
  });
}

/**
 * Accepts or rejects a pending merge-review candidate. Rejection records the
 * decision and timestamp on the candidate. Acceptance deterministically
 * merges the candidate company into the reviewing company, preserving every
 * job/application/contact/note/source id and alias, and removes the absorbed
 * company. Merge candidates on other companies that reference the absorbed
 * company are remapped to the surviving company.
 */
export function reviewCompanyMerge(input: {
  companies: readonly CompanyEntity[];
  input: ReviewCompanyMergeInput;
  now: string;
}): ReviewCompanyMergeResult {
  const nowResult = IsoDateTimeSchema.safeParse(input.now);
  if (!nowResult.success) {
    return {
      ok: false,
      failure: {
        code: "invalid_input",
        message: "now must be a valid ISO datetime.",
      },
    };
  }
  const now = nowResult.data;

  const companiesResult = CompanyEntitySchema.array().safeParse(
    input.companies,
  );
  if (!companiesResult.success) {
    return {
      ok: false,
      failure: {
        code: "invalid_input",
        message: firstIssueMessage(companiesResult.error),
      },
    };
  }

  const commandResult = ReviewCompanyMergeInputSchema.safeParse(input.input);
  if (!commandResult.success) {
    return {
      ok: false,
      failure: {
        code: "invalid_input",
        message: firstIssueMessage(commandResult.error),
      },
    };
  }
  const command = commandResult.data;

  if (command.candidateId === command.companyId) {
    return {
      ok: false,
      failure: {
        code: "invalid_input",
        message: "A company cannot merge with itself.",
      },
    };
  }

  const primaryIndex = companiesResult.data.findIndex(
    (company) => company.id === command.companyId,
  );
  if (primaryIndex < 0) {
    return {
      ok: false,
      failure: {
        code: "company_not_found",
        message: `Company "${command.companyId}" does not exist.`,
      },
    };
  }
  const primary = companiesResult.data[primaryIndex]!;

  const candidate = primary.mergeReviewCandidates.find(
    (entry) => entry.candidateCompanyId === command.candidateId,
  );
  if (!candidate) {
    return {
      ok: false,
      failure: {
        code: "candidate_not_found",
        message: `Company "${command.companyId}" has no merge candidate for "${command.candidateId}".`,
      },
    };
  }
  if (candidate.decision !== "pending") {
    return {
      ok: false,
      failure: {
        code: "candidate_already_decided",
        message: `Merge candidate "${command.candidateId}" was already ${candidate.decision}.`,
        currentDecision: candidate.decision,
      },
    };
  }

  if (command.decision === "rejected") {
    const nextPrimary = CompanyEntitySchema.parse({
      ...primary,
      mergeReviewCandidates: primary.mergeReviewCandidates.map((entry) =>
        entry.candidateCompanyId === command.candidateId
          ? CompanyMergeReviewCandidateSchema.parse({
              ...entry,
              decision: "rejected",
              decidedAt: now,
            })
          : entry,
      ),
      updatedAt: now,
    });

    const companies = companiesResult.data.map((company, companyIndex) =>
      companyIndex === primaryIndex ? nextPrimary : company,
    );

    return { ok: true, companies, company: nextPrimary, merged: null };
  }

  const targetIndex = companiesResult.data.findIndex(
    (company) => company.id === command.candidateId,
  );
  if (targetIndex < 0) {
    return {
      ok: false,
      failure: {
        code: "candidate_company_not_found",
        message: `Merge candidate company "${command.candidateId}" does not exist.`,
      },
    };
  }
  const target = companiesResult.data[targetIndex]!;

  const merged = mergeCompanies(primary, target, now);

  const companies = companiesResult.data
    .map((company, companyIndex) => {
      if (companyIndex === primaryIndex) return merged;
      if (company.id === command.candidateId) return null;
      if (
        company.mergeReviewCandidates.some(
          (entry) => entry.candidateCompanyId === command.candidateId,
        )
      ) {
        return CompanyEntitySchema.parse({
          ...company,
          mergeReviewCandidates: dedupeCandidates(
            company.mergeReviewCandidates.map((entry) =>
              entry.candidateCompanyId === command.candidateId
                ? CompanyMergeReviewCandidateSchema.parse({
                    ...entry,
                    candidateCompanyId: merged.id,
                  })
                : entry,
            ),
          ),
          updatedAt: now,
        });
      }
      return company;
    })
    .filter((company): company is CompanyEntity => company !== null);

  return { ok: true, companies, company: merged, merged };
}

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

const OPEN_APPLICATION_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  "discovered",
  "shortlisted",
  "drafting",
  "ready_for_review",
  "approved",
  "submitted",
  "assessment",
  "interview",
  "offer",
]);

const ALL_APPLICATION_STATUSES =
  ApplicationStatusSchema.options as readonly ApplicationStatus[];

export type CompanyOpeningsProjection = {
  companyId: string;
  current: SavedJob[];
  previous: SavedJob[];
  currentCount: number;
  previousCount: number;
  totalCount: number;
  lastOpenedAt: string | null;
};

function compareOpenedAtDescending(first: SavedJob, second: SavedJob): number {
  const firstOpenedAt = first.postedAt ?? first.discoveredAt;
  const secondOpenedAt = second.postedAt ?? second.discoveredAt;
  const difference = Date.parse(secondOpenedAt) - Date.parse(firstOpenedAt);
  if (difference !== 0) return difference;
  return first.id < second.id ? -1 : first.id > second.id ? 1 : 0;
}

/**
 * Projects a company's linked openings from `company.jobIds`: current openings
 * (active statuses) and previous openings (closed statuses), each sorted most
 * recent first. Outputs are freshly schema-parsed `SavedJob` values.
 */
export function projectCompanyOpenings(input: {
  company: CompanyEntity;
  jobs: readonly SavedJob[];
}): CompanyOpeningsProjection {
  const company = CompanyEntitySchema.parse(input.company);
  const jobs = SavedJobSchema.array().parse(input.jobs);

  const linked = jobs.filter((job) => company.jobIds.includes(job.id));
  const current: SavedJob[] = [];
  const previous: SavedJob[] = [];
  for (const job of linked) {
    if (OPEN_APPLICATION_STATUSES.has(job.status)) {
      current.push(job);
    } else {
      previous.push(job);
    }
  }
  current.sort(compareOpenedAtDescending);
  previous.sort(compareOpenedAtDescending);

  let lastOpenedAt: string | null = null;
  for (const job of linked) {
    const openedAt = job.postedAt ?? job.discoveredAt;
    if (
      lastOpenedAt === null ||
      Date.parse(openedAt) > Date.parse(lastOpenedAt)
    ) {
      lastOpenedAt = openedAt;
    }
  }

  return {
    companyId: company.id,
    current,
    previous,
    currentCount: current.length,
    previousCount: previous.length,
    totalCount: linked.length,
    lastOpenedAt,
  };
}

export type CompanyApplicationHistoryProjection = {
  companyId: string;
  records: ApplicationRecord[];
  totalCount: number;
  statusCounts: Record<ApplicationStatus, number>;
  earliestUpdatedAt: string | null;
  latestUpdatedAt: string | null;
};

/**
 * Projects a company's application history from `company.applicationRecordIds`,
 * newest first, with per-status counts. Outputs are freshly schema-parsed
 * `ApplicationRecord` values.
 */
export function projectCompanyApplicationHistory(input: {
  company: CompanyEntity;
  applicationRecords: readonly ApplicationRecord[];
}): CompanyApplicationHistoryProjection {
  const company = CompanyEntitySchema.parse(input.company);
  const records = ApplicationRecordSchema.array().parse(
    input.applicationRecords,
  );

  const linked = records.filter((record) =>
    company.applicationRecordIds.includes(record.id),
  );
  const sorted = [...linked].sort((first, second) => {
    const difference =
      Date.parse(second.lastUpdatedAt) - Date.parse(first.lastUpdatedAt);
    if (difference !== 0) return difference;
    return first.id < second.id ? -1 : first.id > second.id ? 1 : 0;
  });

  const statusCounts = Object.fromEntries(
    ALL_APPLICATION_STATUSES.map((status) => [status, 0]),
  ) as Record<ApplicationStatus, number>;
  for (const record of sorted) {
    statusCounts[record.status] = (statusCounts[record.status] ?? 0) + 1;
  }

  return {
    companyId: company.id,
    records: sorted,
    totalCount: sorted.length,
    statusCounts,
    earliestUpdatedAt:
      sorted.length === 0 ? null : sorted.at(-1)!.lastUpdatedAt,
    latestUpdatedAt: sorted.length === 0 ? null : sorted[0]!.lastUpdatedAt,
  };
}

// ---------------------------------------------------------------------------
// Local company intelligence mutations (contacts, notes, salary/offer evidence)
// ---------------------------------------------------------------------------

export type CompanyIntelligenceMutationFailure =
  | { code: "invalid_input"; message: string }
  | { code: "company_not_found"; message: string }
  | { code: "company_changed"; message: string }
  | { code: "contact_not_found"; message: string }
  | { code: "note_not_found"; message: string }
  | { code: "evidence_not_found"; message: string };

export type CompanyIntelligenceMutationResult =
  | { ok: true; companies: CompanyEntity[]; company: CompanyEntity }
  | { ok: false; failure: CompanyIntelligenceMutationFailure };

function replaceCompany(
  companies: readonly CompanyEntity[],
  index: number,
  company: CompanyEntity,
): CompanyEntity[] {
  return companies.map((entry, entryIndex) =>
    entryIndex === index ? company : entry,
  );
}

/**
 * Applies a typed local company-intelligence mutation immutably. The command
 * is compare-and-swapped against `expectedUpdatedAt` so a company changed by a
 * concurrent merge/edit is never overwritten. Upserts replace the matching id
 * while preserving the original `createdAt`; removals are no-op failures when
 * the referenced item does not exist. All outputs are freshly schema-parsed.
 */
export function applyCompanyIntelligenceMutation(input: {
  companies: readonly CompanyEntity[];
  input: CompanyIntelligenceMutationInput;
  now: string;
}): CompanyIntelligenceMutationResult {
  const nowResult = IsoDateTimeSchema.safeParse(input.now);
  if (!nowResult.success) {
    return {
      ok: false,
      failure: {
        code: "invalid_input",
        message: "now must be a valid ISO datetime.",
      },
    };
  }
  const now = nowResult.data;

  const companiesResult = CompanyEntitySchema.array().safeParse(
    input.companies,
  );
  if (!companiesResult.success) {
    return {
      ok: false,
      failure: {
        code: "invalid_input",
        message: firstIssueMessage(companiesResult.error),
      },
    };
  }

  const commandResult = CompanyIntelligenceMutationInputSchema.safeParse(
    input.input,
  );
  if (!commandResult.success) {
    return {
      ok: false,
      failure: {
        code: "invalid_input",
        message: firstIssueMessage(commandResult.error),
      },
    };
  }
  const command = commandResult.data;

  const index = companiesResult.data.findIndex(
    (company) => company.id === command.companyId,
  );
  if (index < 0) {
    return {
      ok: false,
      failure: {
        code: "company_not_found",
        message: `Company "${command.companyId}" does not exist.`,
      },
    };
  }

  const company = companiesResult.data[index]!;
  if (company.updatedAt !== command.expectedUpdatedAt) {
    return {
      ok: false,
      failure: {
        code: "company_changed",
        message:
          "This company changed since you opened it. Refresh before editing.",
      },
    };
  }

  let next: CompanyEntity | null = null;

  if (command.mutation.type === "upsert_contact") {
    const contact = command.mutation.contact;
    const existing = company.contacts.find((entry) => entry.id === contact.id);
    const contacts = existing
      ? company.contacts.map((entry) =>
          entry.id === contact.id
            ? { ...contact, createdAt: entry.createdAt, updatedAt: now }
            : entry,
        )
      : [...company.contacts, { ...contact, updatedAt: now }];
    next = CompanyEntitySchema.parse({
      ...company,
      contacts,
      updatedAt: now,
    });
  } else if (command.mutation.type === "remove_contact") {
    const removeContact = command.mutation;
    if (
      !company.contacts.some((entry) => entry.id === removeContact.contactId)
    ) {
      return {
        ok: false,
        failure: {
          code: "contact_not_found",
          message: `Contact "${removeContact.contactId}" does not exist.`,
        },
      };
    }
    next = CompanyEntitySchema.parse({
      ...company,
      contacts: company.contacts.filter(
        (entry) => entry.id !== removeContact.contactId,
      ),
      updatedAt: now,
    });
  } else if (command.mutation.type === "add_note") {
    next = CompanyEntitySchema.parse({
      ...company,
      notes: [...company.notes, command.mutation.note],
      updatedAt: now,
    });
  } else if (command.mutation.type === "remove_note") {
    const removeNote = command.mutation;
    if (!company.notes.some((entry) => entry.id === removeNote.noteId)) {
      return {
        ok: false,
        failure: {
          code: "note_not_found",
          message: `Note "${removeNote.noteId}" does not exist.`,
        },
      };
    }
    next = CompanyEntitySchema.parse({
      ...company,
      notes: company.notes.filter((entry) => entry.id !== removeNote.noteId),
      updatedAt: now,
    });
  } else if (command.mutation.type === "upsert_salary_offer_evidence") {
    const evidence = command.mutation.evidence;
    const existing = company.salaryOfferEvidence.find(
      (entry) => entry.id === evidence.id,
    );
    const salaryOfferEvidence = existing
      ? company.salaryOfferEvidence.map((entry) =>
          entry.id === evidence.id
            ? { ...evidence, createdAt: entry.createdAt, updatedAt: now }
            : entry,
        )
      : [...company.salaryOfferEvidence, { ...evidence, updatedAt: now }];
    next = CompanyEntitySchema.parse({
      ...company,
      salaryOfferEvidence,
      updatedAt: now,
    });
  } else if (command.mutation.type === "remove_salary_offer_evidence") {
    const removeEvidence = command.mutation;
    if (
      !company.salaryOfferEvidence.some(
        (entry) => entry.id === removeEvidence.evidenceId,
      )
    ) {
      return {
        ok: false,
        failure: {
          code: "evidence_not_found",
          message: `Salary/offer evidence "${removeEvidence.evidenceId}" does not exist.`,
        },
      };
    }
    next = CompanyEntitySchema.parse({
      ...company,
      salaryOfferEvidence: company.salaryOfferEvidence.filter(
        (entry) => entry.id !== removeEvidence.evidenceId,
      ),
      updatedAt: now,
    });
  } else {
    const unreachable: never = command.mutation;
    return {
      ok: false,
      failure: {
        code: "invalid_input",
        message: `Unsupported company intelligence mutation: ${String(unreachable)}`,
      },
    };
  }

  if (next === null) {
    return {
      ok: false,
      failure: {
        code: "invalid_input",
        message: "The company mutation could not be applied.",
      },
    };
  }

  const companies = replaceCompany(companiesResult.data, index, next);
  return { ok: true, companies, company: next };
}

// ---------------------------------------------------------------------------
// Duplicate job detection within a company
// ---------------------------------------------------------------------------

export type CompanyDuplicateJobKind = "exact" | "possible";

export type CompanyDuplicateJobGroup = {
  id: string;
  kind: CompanyDuplicateJobKind;
  reason: string;
  jobIds: string[];
};

function toJobIdentityInput(job: SavedJob): JobIdentityInput {
  return {
    source: job.source,
    sourceJobId: job.sourceJobId,
    canonicalUrl: job.canonicalUrl,
    applicationUrl: job.applicationUrl,
    providerKey: job.providerKey,
    providerBoardToken: job.providerBoardToken,
    providerIdentifier: job.providerIdentifier,
    title: job.title,
    company: job.company,
    location: job.location,
    postedAt: job.postedAt,
    postedAtText: job.postedAtText,
  };
}

/**
 * Detects duplicate job postings inside one company using the same collision-
 * safe identity aliases as discovery. A pair sharing any strong identity alias
 * (provider/source posting id, employer application URL, or canonical listing
 * URL) is an `exact` duplicate. A pair sharing only corroborating or possible
 * aliases (for example normalized title + company + location + posted date)
 * is a `possible` duplicate that is surfaced for review, never auto-merged.
 *
 * The projection is conservative: weak facts never collapse two postings, and
 * a job with no shared alias is simply not a duplicate.
 */
export function projectCompanyDuplicateJobs(input: {
  company: CompanyEntity;
  jobs: readonly SavedJob[];
}): CompanyDuplicateJobGroup[] {
  const company = CompanyEntitySchema.parse(input.company);
  const jobs = SavedJobSchema.array().parse(input.jobs);

  const linked = jobs.filter((job) => company.jobIds.includes(job.id));
  if (linked.length < 2) return [];

  const aliasByJobId = new Map<
    string,
    ReturnType<typeof buildJobIdentityAliases>
  >();
  for (const job of linked) {
    aliasByJobId.set(job.id, buildJobIdentityAliases(toJobIdentityInput(job)));
  }

  const strongKeysByJobId = new Map<string, ReadonlySet<string>>();
  const weakKeysByJobId = new Map<string, ReadonlySet<string>>();
  for (const job of linked) {
    const aliases = aliasByJobId.get(job.id)!;
    strongKeysByJobId.set(
      job.id,
      new Set(
        aliases
          .filter((alias) => alias.confidence === "strong")
          .map((alias) => alias.key),
      ),
    );
    weakKeysByJobId.set(
      job.id,
      new Set(
        aliases
          .filter(
            (alias) =>
              alias.confidence === "corroborating" ||
              alias.confidence === "possible",
          )
          .map((alias) => alias.key),
      ),
    );
  }

  const groups: CompanyDuplicateJobGroup[] = [];
  const visited = new Set<string>();

  for (let firstIndex = 0; firstIndex < linked.length; firstIndex += 1) {
    const first = linked[firstIndex]!;
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < linked.length;
      secondIndex += 1
    ) {
      const second = linked[secondIndex]!;
      const pairKey =
        first.id < second.id
          ? `${first.id}|${second.id}`
          : `${second.id}|${first.id}`;
      if (visited.has(pairKey)) continue;
      visited.add(pairKey);

      const firstStrong = strongKeysByJobId.get(first.id)!;
      const secondStrong = strongKeysByJobId.get(second.id)!;
      let sharedStrong = false;
      for (const key of firstStrong) {
        if (secondStrong.has(key)) {
          sharedStrong = true;
          break;
        }
      }
      if (sharedStrong) {
        groups.push({
          id: `duplicate_${first.id}_${second.id}`,
          kind: "exact",
          reason: `"${first.title}" at ${first.company} matches an identical posting already saved here.`,
          jobIds: [first.id, second.id].sort(),
        });
        continue;
      }

      const firstWeak = weakKeysByJobId.get(first.id)!;
      const secondWeak = weakKeysByJobId.get(second.id)!;
      let sharedWeak = false;
      for (const key of firstWeak) {
        if (secondWeak.has(key)) {
          sharedWeak = true;
          break;
        }
      }
      if (sharedWeak) {
        groups.push({
          id: `duplicate_possible_${first.id}_${second.id}`,
          kind: "possible",
          reason: `"${first.title}" at ${first.company} may repeat "${second.title}" from ${second.location}. Review before treating them as the same role.`,
          jobIds: [first.id, second.id].sort(),
        });
      }
    }
  }

  return groups.sort((firstGroup, secondGroup) => {
    const firstJobId = firstGroup.jobIds[0] ?? "";
    const secondJobId = secondGroup.jobIds[0] ?? "";
    return firstJobId < secondJobId ? -1 : firstJobId > secondJobId ? 1 : 0;
  });
}
