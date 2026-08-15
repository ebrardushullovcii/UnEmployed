import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";
import {
  DiscoveryRunRecordSchema,
  JobFinderIntelligenceStateSchema,
  JobSearchCampaignCollectionSchema,
} from "@unemployed/contracts";

import {
  cleanupTempDirectoryWithRetry,
  createSavedJob,
  createTempRepository,
} from "./file-repository.test-support";
import { runMigrations } from "./internal/migrations";
import { createSeed } from "./test-fixtures";

describe("campaign and activity persistence", () => {
  test("backfills legacy jobs and discovery history into one default campaign", () => {
    const database = new DatabaseSync(":memory:");
    const job = createSavedJob({ id: "job_legacy" });
    const run = DiscoveryRunRecordSchema.parse({
      id: "run_legacy",
      state: "completed",
      startedAt: "2026-08-01T10:00:00.000Z",
      completedAt: "2026-08-01T10:01:00.000Z",
      summary: { validJobsFound: 1, jobsPersisted: 1 },
    });
    try {
      runMigrations(database);
      database
        .prepare("DELETE FROM singleton_state WHERE key = ?")
        .run("campaign_state");
      database
        .prepare("DELETE FROM schema_migrations WHERE version = ?")
        .run(10);
      database
        .prepare(
          "INSERT OR REPLACE INTO singleton_state (key, value) VALUES (?, ?)",
        )
        .run(
          "search_preferences",
          JSON.stringify(createSeed().searchPreferences),
        );
      database
        .prepare(
          "INSERT OR REPLACE INTO singleton_state (key, value) VALUES (?, ?)",
        )
        .run(
          "discovery_state",
          JSON.stringify({ ...createSeed().discovery, recentRuns: [run] }),
        );
      database
        .prepare("INSERT INTO saved_jobs (id, value) VALUES (?, ?)")
        .run(job.id, JSON.stringify(job));
      runMigrations(database);
      const row = database
        .prepare("SELECT value FROM singleton_state WHERE key = ?")
        .get("campaign_state") as { value: string };
      const campaigns = JobSearchCampaignCollectionSchema.parse(
        JSON.parse(row.value) as unknown,
      );

      expect(campaigns.activeCampaignId).toBe("campaign_default");
      expect(campaigns.campaigns[0]?.jobIds).toEqual(["job_legacy"]);
      expect(campaigns.campaigns[0]?.history).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ discoveryRunId: "run_legacy" }),
        ]),
      );
    } finally {
      database.close();
    }
  });

  test("persists the workspace activity pause separately from campaigns", async () => {
    const temp = await createTempRepository("unemployed-db-activity-");
    let repository = await temp.createRepository();

    try {
      await repository.saveActivityControl({
        paused: true,
        pausedAt: "2026-08-15T10:00:00.000Z",
        reason: "User paused browser work.",
      });
      await repository.close();
      repository = await temp.createRepository();

      await expect(repository.getActivityControl()).resolves.toEqual({
        paused: true,
        pausedAt: "2026-08-15T10:00:00.000Z",
        reason: "User paused browser work.",
      });
    } finally {
      await repository.close().catch(() => undefined);
      await cleanupTempDirectoryWithRetry(temp.tempDirectory);
    }
  });

  test("persists additive Job Finder intelligence without a database migration", async () => {
    const temp = await createTempRepository("unemployed-db-intelligence-");
    let repository = await temp.createRepository();
    const intelligence = JobFinderIntelligenceStateSchema.parse({
      updatedAt: "2026-08-15T10:00:00.000Z",
    });

    try {
      await repository.saveIntelligenceState(intelligence);
      await repository.close();
      repository = await temp.createRepository();

      await expect(repository.getIntelligenceState()).resolves.toEqual(
        intelligence,
      );
    } finally {
      await repository.close().catch(() => undefined);
      await cleanupTempDirectoryWithRetry(temp.tempDirectory);
    }
  });
});
