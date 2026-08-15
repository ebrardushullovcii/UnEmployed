import type {
  ApplicationRecord,
  CompanyEntity,
  SavedJob,
} from "@unemployed/contracts";

/**
 * Renderer-safe display projections for the Companies screens. These mirror
 * the authoritative pure operations in `@unemployed/job-finder` (which the
 * main process uses) without pulling the job-finder package into the renderer
 * bundle. Semantics are intentionally identical: identity is only ever linked
 * through exact employer identity, and ambiguous near matches are surfaced
 * for review, never silently merged.
 */

const OPEN_APPLICATION_STATUSES: ReadonlySet<string> = new Set([
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

export function projectCompanyOpenings(input: {
  company: CompanyEntity;
  jobs: readonly SavedJob[];
}): CompanyOpeningsProjection {
  const linked = input.jobs.filter((job) =>
    input.company.jobIds.includes(job.id),
  );
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
    companyId: input.company.id,
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
  statusCounts: Record<string, number>;
  earliestUpdatedAt: string | null;
  latestUpdatedAt: string | null;
};

export function projectCompanyApplicationHistory(input: {
  company: CompanyEntity;
  applicationRecords: readonly ApplicationRecord[];
}): CompanyApplicationHistoryProjection {
  const linked = input.applicationRecords.filter((record) =>
    input.company.applicationRecordIds.includes(record.id),
  );
  const sorted = [...linked].sort((first, second) => {
    const difference =
      Date.parse(second.lastUpdatedAt) - Date.parse(first.lastUpdatedAt);
    if (difference !== 0) return difference;
    return first.id < second.id ? -1 : first.id > second.id ? 1 : 0;
  });

  const statusCounts: Record<string, number> = {};
  for (const record of sorted) {
    statusCounts[record.status] = (statusCounts[record.status] ?? 0) + 1;
  }

  return {
    companyId: input.company.id,
    records: sorted,
    totalCount: sorted.length,
    statusCounts,
    earliestUpdatedAt:
      sorted.length === 0 ? null : sorted.at(-1)!.lastUpdatedAt,
    latestUpdatedAt: sorted.length === 0 ? null : sorted[0]!.lastUpdatedAt,
  };
}

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()'"\u2019\u201c\u201d]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeJobUrl(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\/+$/u, "");
}

export type CompanyDuplicateJobKind = "exact" | "possible";

export type CompanyDuplicateJobGroup = {
  id: string;
  kind: CompanyDuplicateJobKind;
  reason: string;
  jobIds: string[];
};

function jobIdentityKeys(job: SavedJob): {
  strong: ReadonlySet<string>;
  weak: ReadonlySet<string>;
} {
  const source = job.source.trim().toLocaleLowerCase() || null;
  const sourceJobId = job.sourceJobId.trim().toLocaleLowerCase() || null;
  const company = normalizeText(job.company);
  const canonicalHostname = (() => {
    try {
      return new URL(job.canonicalUrl).hostname.toLocaleLowerCase();
    } catch {
      return null;
    }
  })();
  const strong = new Set<string>();
  const weak = new Set<string>();

  if (job.canonicalUrl) {
    strong.add(`listing-url:${normalizeJobUrl(job.canonicalUrl)}`);
  }
  const applicationUrl = job.applicationUrl ?? job.canonicalUrl;
  if (applicationUrl) {
    strong.add(`employer-url:${normalizeJobUrl(applicationUrl)}`);
  }
  if (source && sourceJobId && canonicalHostname && company) {
    strong.add(
      `source-id:${source}:${canonicalHostname}:${company}:${sourceJobId}`,
    );
  }
  if (source && sourceJobId) {
    weak.add(`unscoped-source-id:${source}:${sourceJobId}`);
  }

  const title = normalizeText(job.title);
  const location = normalizeText(job.location);
  const postedDate = job.postedAt
    ? new Date(job.postedAt).toISOString().slice(0, 10)
    : null;
  if (title && company && location && postedDate) {
    weak.add(
      `facts:${title}\u0000${company}\u0000${location}\u0000${postedDate}`,
    );
  }

  return { strong, weak };
}

/**
 * Detects duplicate postings inside one company conservatively: a shared
 * listing/application URL or source posting id is an `exact` duplicate; a
 * shared normalized title + company + location + posted date is a `possible`
 * duplicate surfaced for review. Nothing is ever silently merged here.
 */
export function projectCompanyDuplicateJobs(input: {
  company: CompanyEntity;
  jobs: readonly SavedJob[];
}): CompanyDuplicateJobGroup[] {
  const linked = input.jobs.filter((job) =>
    input.company.jobIds.includes(job.id),
  );
  if (linked.length < 2) return [];

  const keysByJobId = new Map<string, ReturnType<typeof jobIdentityKeys>>();
  for (const job of linked) {
    keysByJobId.set(job.id, jobIdentityKeys(job));
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

      const firstKeys = keysByJobId.get(first.id)!;
      const secondKeys = keysByJobId.get(second.id)!;

      let sharedStrong = false;
      for (const key of firstKeys.strong) {
        if (secondKeys.strong.has(key)) {
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

      let sharedWeak = false;
      for (const key of firstKeys.weak) {
        if (secondKeys.weak.has(key)) {
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
