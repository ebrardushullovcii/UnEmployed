import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "./internal/migrations";

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupPaths
      .splice(0)
      .map((cleanupPath) => rm(cleanupPath, { recursive: true, force: true })),
  );
});

describe("application authority migration integrity", () => {
  test("rejects a migration-15 database with an incomplete authority table", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "unemployed-authority-migration-"),
    );
    cleanupPaths.push(directory);
    const database = new DatabaseSync(path.join(directory, "workspace.sqlite"));

    try {
      runMigrations(database);
      database.exec(
        "ALTER TABLE application_authority_envelopes DROP COLUMN value",
      );

      expect(() => runMigrations(database)).toThrow(
        "Application authority migration is incomplete: application_authority_envelopes.value is missing.",
      );
    } finally {
      database.close();
    }
  });

  test("installs a database-level one-active-envelope invariant", () => {
    const database = new DatabaseSync(":memory:");

    try {
      runMigrations(database);

      const index = database
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?",
        )
        .get("application_authority_envelopes_active_unique_idx") as
        | { sql?: unknown }
        | undefined;
      expect(index?.sql).toEqual(
        expect.stringContaining("CREATE UNIQUE INDEX"),
      );
      expect(index?.sql).toEqual(
        expect.stringContaining("WHERE status = 'active'"),
      );

      database
        .prepare(
          "INSERT INTO application_authority_envelopes (id, revision, status, value) VALUES (?, ?, ?, ?)",
        )
        .run("authority_a", 1, "active", "{}");
      expect(() =>
        database
          .prepare(
            "INSERT INTO application_authority_envelopes (id, revision, status, value) VALUES (?, ?, ?, ?)",
          )
          .run("authority_b", 1, "active", "{}"),
      ).toThrow();
    } finally {
      database.close();
    }
  });
});
