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

// Public boards first: a first-run user whose only readable suggestion was a
// regional board ended up with a page of jobs from the wrong country, and the
// sign-in boards cannot be searched until they have signed in.
export const STARTER_JOB_SOURCES: readonly StarterJobSource[] = [
  StarterJobSourceSchema.parse({
    accessNote:
      "Large general job board that is usually readable without an account.",
    aliases: ["indeed", "indeed jobs"],
    id: "target_starter_indeed",
    label: "Indeed",
    startingUrl: "https://www.indeed.com/jobs",
  }),
  StarterJobSourceSchema.parse({
    accessNote: "Remote-only board that is readable without an account.",
    aliases: ["we work remotely", "weworkremotely", "wwr"],
    id: "target_starter_we_work_remotely",
    label: "We Work Remotely",
    startingUrl: "https://weworkremotely.com/remote-jobs",
  }),
  StarterJobSourceSchema.parse({
    accessNote: "Remote-only board that is readable without an account.",
    aliases: ["remote ok", "remoteok"],
    id: "target_starter_remote_ok",
    label: "Remote OK",
    startingUrl: "https://remoteok.com/",
  }),
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

/**
 * A fresh workspace seeds no sources. The known-source list above exists so
 * the assistant can add a board by name and so the setup step can show an
 * access note for a URL the user pastes; a seeded list of three suggestions
 * sent every blind tester to whichever board happened to work without an
 * account, whatever country they lived in. Real users add the sites they use.
 */
export function createStarterJobDiscoveryTargets(): JobDiscoveryTarget[] {
  return [];
}

/** The known sources as disabled targets, for fixtures and tests only. */
export function createKnownJobSourceTargetsForFixtures(): JobDiscoveryTarget[] {
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
