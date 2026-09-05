import { matchesCollectionSearch } from "../components/collection-search-toolbar";

export type JobFinderGlobalSearchKind =
  | "application"
  | "campaign"
  | "company"
  | "document"
  | "job";

export interface JobFinderGlobalSearchEntry {
  campaignId?: string | null;
  href: string;
  id: string;
  kind: JobFinderGlobalSearchKind;
  metadata: readonly string[];
  subtitle: string;
  title: string;
}

export interface JobFinderGlobalSearchGroup {
  entries: readonly JobFinderGlobalSearchEntry[];
  kind: JobFinderGlobalSearchKind;
}

const kindOrder: readonly JobFinderGlobalSearchKind[] = [
  "campaign",
  "job",
  "application",
  "company",
  "document",
];

export function searchJobFinderEntries(
  entries: readonly JobFinderGlobalSearchEntry[],
  query: string,
  options: { campaignId?: string | null; limit?: number } = {},
): readonly JobFinderGlobalSearchGroup[] {
  const limit = Math.max(1, Math.min(options.limit ?? 40, 200));
  const matches = entries
    .filter(
      (entry) =>
        (!options.campaignId || entry.campaignId === options.campaignId) &&
        matchesCollectionSearch(query, [
          entry.title,
          entry.subtitle,
          entry.kind,
          ...entry.metadata,
        ]),
    )
    .slice(0, limit);

  return kindOrder.flatMap((kind) => {
    const groupedEntries = matches.filter((entry) => entry.kind === kind);
    return groupedEntries.length > 0 ? [{ entries: groupedEntries, kind }] : [];
  });
}
