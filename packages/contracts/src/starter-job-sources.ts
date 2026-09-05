import { z } from "zod";

import { JobDiscoveryTargetSchema, type JobDiscoveryTarget } from "./discovery";
import { NonEmptyStringSchema, UrlStringSchema } from "./base";

/**
 * Declarative starter-source content for first-run source selection.
 *
 * This is user-facing suggestion metadata (a label, a public starting URL,
 * search aliases, and hedged access expectations). It is not discovery
 * workflow policy: no routing, query building, triage, or per-board behavior
 * may be derived from it. Starter sources are suggestions only and never
 * enable themselves; every seeded or added target starts disabled until the
 * user explicitly enables it through the ordinary save path.
 */
export const StarterJobSourceSchema = z.object({
  aliases: z.array(NonEmptyStringSchema),
  accessNote: NonEmptyStringSchema,
  id: NonEmptyStringSchema,
  label: NonEmptyStringSchema,
  startingUrl: UrlStringSchema,
});

export type StarterJobSource = z.infer<typeof StarterJobSourceSchema>;

export const STARTER_JOB_SOURCES: readonly StarterJobSource[] = [
  StarterJobSourceSchema.parse({
    accessNote:
      "Usually requires signing in to your own account before jobs appear.",
    aliases: ["linkedin", "linkedin jobs"],
    id: "target_starter_linkedin_jobs",
    label: "LinkedIn Jobs",
    startingUrl: "https://www.linkedin.com/jobs/search/",
  }),
  StarterJobSourceSchema.parse({
    accessNote:
      "Startup-focused board that often asks you to sign in before showing full listings.",
    aliases: ["wellfound", "angellist", "angel list"],
    id: "target_starter_wellfound",
    label: "Wellfound",
    startingUrl: "https://wellfound.com/jobs",
  }),
  StarterJobSourceSchema.parse({
    accessNote:
      "Public regional job board that is usually readable without an account.",
    aliases: ["kosovajob", "kosova job"],
    id: "target_starter_kosovajob",
    label: "KosovaJob",
    startingUrl: "https://kosovajob.com/",
  }),
];

/** Disabled-by-default discovery targets for a fresh workspace seed. */
export function createStarterJobDiscoveryTargets(): JobDiscoveryTarget[] {
  return STARTER_JOB_SOURCES.map((source) =>
    JobDiscoveryTargetSchema.parse({
      enabled: false,
      id: source.id,
      label: source.label,
      startingUrl: source.startingUrl,
    }),
  );
}

function normalizeStartingUrl(value: string): string {
  return value.trim().toLowerCase().replace(/\/+$/, "");
}

export function findStarterJobSourceByStartingUrl(
  value: string,
): StarterJobSource | null {
  const normalized = normalizeStartingUrl(value);
  if (!normalized) {
    return null;
  }

  return (
    STARTER_JOB_SOURCES.find(
      (source) => normalizeStartingUrl(source.startingUrl) === normalized,
    ) ?? null
  );
}
