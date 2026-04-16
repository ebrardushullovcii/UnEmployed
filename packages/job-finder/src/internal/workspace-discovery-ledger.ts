import {
  DiscoveryLedgerEntrySchema,
  type DiscoveryLedgerEntry,
  type DiscoveryTitleTriageOutcome,
  type JobDiscoveryCollectionMethod,
  type JobPosting,
  type SavedJob,
} from "@unemployed/contracts";
import { createUniqueId, normalizeText } from "./shared";

function normalizeLedgerUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value.trim();
  }
}

function buildLedgerKeys(input: {
  canonicalUrl: string;
  source: string;
  sourceJobId: string | null;
  providerKey: string | null;
  providerBoardToken: string | null;
  providerIdentifier: string | null;
}) {
  return {
    canonicalUrl: normalizeLedgerUrl(input.canonicalUrl),
    sourceJobIdKey: input.sourceJobId
      ? normalizeText(
          [
            input.source,
            input.providerKey ?? "",
            input.providerBoardToken ?? "",
            input.providerIdentifier ?? "",
            input.sourceJobId,
          ].join(":"),
        )
      : null,
    providerPostingKey:
      input.sourceJobId && input.providerKey && (input.providerIdentifier || input.providerBoardToken)
        ? normalizeText(
            `${input.providerKey}:${input.providerBoardToken ?? ""}:${input.providerIdentifier ?? ""}:${input.sourceJobId}`,
          )
        : null,
  };
}

function matchesLedgerEntry(
  entry: DiscoveryLedgerEntry,
  input: {
    canonicalUrl: string;
    source: string;
    sourceJobId: string | null;
    providerKey: string | null;
    providerBoardToken: string | null;
    providerIdentifier: string | null;
  },
): boolean {
  const left = buildLedgerKeys({
    canonicalUrl: entry.canonicalUrl,
    source: entry.source,
    sourceJobId: entry.sourceJobId,
    providerKey: entry.providerKey,
    providerBoardToken: entry.providerBoardToken,
    providerIdentifier: entry.providerIdentifier,
  });
  const right = buildLedgerKeys(input);

  return (
    left.canonicalUrl === right.canonicalUrl ||
    (left.sourceJobIdKey !== null && left.sourceJobIdKey === right.sourceJobIdKey) ||
    (left.providerPostingKey !== null &&
      left.providerPostingKey === right.providerPostingKey)
  );
}

export function findDiscoveryLedgerEntry(
  ledger: readonly DiscoveryLedgerEntry[],
  posting: Pick<
    JobPosting,
    | "source"
    | "canonicalUrl"
    | "sourceJobId"
    | "providerKey"
    | "providerBoardToken"
    | "providerIdentifier"
    | "title"
    | "company"
  >,
): DiscoveryLedgerEntry | null {
  return (
    ledger.find((entry) =>
        matchesLedgerEntry(entry, {
          canonicalUrl: posting.canonicalUrl,
          source: posting.source,
          sourceJobId: posting.sourceJobId,
          providerKey: posting.providerKey,
          providerBoardToken: posting.providerBoardToken,
          providerIdentifier: posting.providerIdentifier,
      }),
    ) ?? null
  );
}

function upsertLedgerEntry(
  ledger: readonly DiscoveryLedgerEntry[],
  nextEntry: DiscoveryLedgerEntry,
): DiscoveryLedgerEntry[] {
  let replaced = false;
  const nextLedger = ledger.map((entry) => {
    if (
        !matchesLedgerEntry(entry, {
          canonicalUrl: nextEntry.canonicalUrl,
          source: nextEntry.source,
          sourceJobId: nextEntry.sourceJobId,
          providerKey: nextEntry.providerKey,
          providerBoardToken: nextEntry.providerBoardToken,
          providerIdentifier: nextEntry.providerIdentifier,
      })
    ) {
      return entry;
    }

    replaced = true;
    return nextEntry;
  });

  return replaced ? nextLedger : [...nextLedger, nextEntry];
}

export function recordDiscoveredPostingInLedger(input: {
  ledger: readonly DiscoveryLedgerEntry[];
  posting: Pick<
    JobPosting,
    | "canonicalUrl"
    | "source"
    | "sourceJobId"
    | "providerKey"
    | "providerBoardToken"
    | "providerIdentifier"
    | "title"
    | "company"
    | "collectionMethod"
    | "titleTriageOutcome"
  >;
  targetId: string;
  seenAt: string;
  status: DiscoveryLedgerEntry["latestStatus"];
  skipReason?: string | null;
}): DiscoveryLedgerEntry[] {
  const existingEntry = findDiscoveryLedgerEntry(input.ledger, input.posting);

  return upsertLedgerEntry(
    input.ledger,
    DiscoveryLedgerEntrySchema.parse({
      id: existingEntry?.id ?? createUniqueId("discovery_ledger"),
      canonicalUrl: normalizeLedgerUrl(input.posting.canonicalUrl),
      source: input.posting.source,
      sourceJobId: input.posting.sourceJobId,
      providerKey: input.posting.providerKey,
      providerBoardToken: input.posting.providerBoardToken,
      providerIdentifier: input.posting.providerIdentifier,
      title: input.posting.title,
      company: input.posting.company,
      targetId: input.targetId,
      collectionMethod: input.posting.collectionMethod,
      firstSeenAt: existingEntry?.firstSeenAt ?? input.seenAt,
      lastSeenAt: input.seenAt,
      lastAppliedAt:
        input.status === "applied"
          ? input.seenAt
          : existingEntry?.lastAppliedAt ?? null,
      lastEnrichedAt:
        input.status === "enriched"
          ? input.seenAt
          : existingEntry?.lastEnrichedAt ?? null,
      inactiveAt:
        input.status === "inactive" ? input.seenAt : existingEntry?.inactiveAt ?? null,
      latestStatus: input.status,
      titleTriageOutcome: input.posting.titleTriageOutcome,
      skipReason:
        input.status === "skipped"
          ? input.skipReason ?? existingEntry?.skipReason ?? null
          : null,
    }),
  );
}

export function markSavedJobStatusInLedger(input: {
  ledger: readonly DiscoveryLedgerEntry[];
  job: SavedJob;
  status: DiscoveryLedgerEntry["latestStatus"];
  occurredAt: string;
  skipReason: string | null;
}): DiscoveryLedgerEntry[] {
  const existingEntry = findDiscoveryLedgerEntry(input.ledger, input.job);

  return recordDiscoveredPostingInLedger({
    ledger: input.ledger,
    posting: {
      canonicalUrl: input.job.canonicalUrl,
      source: input.job.source,
      sourceJobId: input.job.sourceJobId,
      providerKey: input.job.providerKey,
      providerBoardToken: input.job.providerBoardToken,
      providerIdentifier: input.job.providerIdentifier,
      title: input.job.title,
      company: input.job.company,
      collectionMethod:
        input.job.provenance[input.job.provenance.length - 1]?.collectionMethod ??
        existingEntry?.collectionMethod ??
        input.job.collectionMethod,
      titleTriageOutcome: input.job.titleTriageOutcome,
    },
    targetId:
      input.job.provenance[input.job.provenance.length - 1]?.targetId ??
      input.job.provenance[0]?.targetId ??
      existingEntry?.targetId ??
      "unknown_target",
    seenAt: input.occurredAt,
    status: input.status,
    skipReason: input.skipReason,
  });
}

export function shouldSkipPostingFromLedger(input: {
  ledgerEntry: DiscoveryLedgerEntry | null;
  posting: Pick<JobPosting, "title" | "company">;
  triageOutcome: DiscoveryTitleTriageOutcome;
}): {
  skip: boolean;
  reason: string | null;
  outcome: DiscoveryTitleTriageOutcome;
} {
  if (!input.ledgerEntry) {
    return {
      skip: false,
      reason: null,
      outcome: input.triageOutcome,
    };
  }

  if (input.ledgerEntry.latestStatus === "applied") {
    return {
      skip: true,
      reason: `Already applied to ${input.posting.title} at ${input.posting.company}.`,
      outcome: "skip_handled",
    };
  }

  if (input.ledgerEntry.latestStatus === "skipped") {
    return {
      skip: true,
      reason: input.ledgerEntry.skipReason ?? "Previously skipped intentionally.",
      outcome: "skip_handled",
    };
  }

  if (input.ledgerEntry.latestStatus === "enriched") {
    return {
      skip: true,
      reason: "Already retained from an earlier run.",
      outcome: "skip_existing",
    };
  }

  return {
    skip: false,
    reason: null,
    outcome: input.triageOutcome,
  };
}

export function applyInactiveLedgerMarks(input: {
  ledger: readonly DiscoveryLedgerEntry[];
  targetId: string;
  seenCanonicalUrls: readonly string[];
  occurredAt: string;
  allowInactiveMarking: boolean;
}): DiscoveryLedgerEntry[] {
  if (!input.allowInactiveMarking) {
    return [...input.ledger];
  }

  const seenSet = new Set(input.seenCanonicalUrls.map((value) => normalizeLedgerUrl(value)));

  return input.ledger.map((entry) => {
    if (entry.targetId !== input.targetId) {
      return entry;
    }

    if (seenSet.has(normalizeLedgerUrl(entry.canonicalUrl))) {
      return entry;
    }

    if (entry.latestStatus === "applied" || entry.latestStatus === "skipped") {
      return entry;
    }

    return DiscoveryLedgerEntrySchema.parse({
      ...entry,
      latestStatus: "inactive",
      inactiveAt: input.occurredAt,
    });
  });
}

export function createDiscoveryProvenance(input: {
  targetId: string;
  adapterKind: SavedJob["provenance"][number]["adapterKind"];
  resolvedAdapterKind: SavedJob["provenance"][number]["resolvedAdapterKind"];
  startingUrl: string;
  discoveredAt: string;
  collectionMethod: JobDiscoveryCollectionMethod;
  providerKey: SavedJob["providerKey"];
  providerBoardToken: SavedJob["providerBoardToken"];
  titleTriageOutcome: DiscoveryTitleTriageOutcome;
}) {
  return {
    targetId: input.targetId,
    adapterKind: input.adapterKind,
    resolvedAdapterKind: input.resolvedAdapterKind,
    startingUrl: input.startingUrl,
    discoveredAt: input.discoveredAt,
    collectionMethod: input.collectionMethod,
    providerKey: input.providerKey,
    providerBoardToken: input.providerBoardToken,
    titleTriageOutcome: input.titleTriageOutcome,
  };
}
