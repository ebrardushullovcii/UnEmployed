import { chmod } from "node:fs/promises";
import type { DatabaseSync } from "node:sqlite";

export function secureDatabaseFile(filePath: string): Promise<void> {
  if (process.platform === "win32") {
    return Promise.resolve();
  }

  const relatedFiles = [filePath, `${filePath}-wal`, `${filePath}-shm`];

  return Promise.all(
    relatedFiles.map(async (candidate) => {
      try {
        await chmod(candidate, 0o600);
      } catch {
        // Ignore permission updates for files that do not exist yet.
      }
    }),
  ).then(() => undefined);
}

export function runMigrations(database: DatabaseSync): void {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const versionRow = database
    .prepare(
      "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations",
    )
    .get() as { version?: number } | undefined;
  const currentVersion = Number(versionRow?.version ?? 0);

  if (currentVersion >= 2) {
    return;
  }

  database.exec("BEGIN IMMEDIATE");

  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS singleton_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS saved_jobs (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tailored_assets (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS application_records (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS application_attempts (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    if (currentVersion < 1) {
      database
        .prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)")
        .run(1, "job_finder_baseline");
    }

    if (currentVersion < 2) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS source_debug_runs (
          id TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS source_debug_attempts (
          id TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS source_instruction_artifacts (
          id TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS source_debug_evidence_refs (
          id TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);

      database
        .prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)")
        .run(2, "job_finder_source_debug_artifacts");
    }

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
