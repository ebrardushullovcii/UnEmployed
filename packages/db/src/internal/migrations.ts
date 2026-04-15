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
  function hasTable(tableName: string): boolean {
    return Boolean(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
        )
        .get(tableName),
    );
  }

  function ensureResumeImportTables(): void {
    database.exec(`
      CREATE TABLE IF NOT EXISTS resume_import_runs (
        id TEXT PRIMARY KEY,
        source_resume_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        status TEXT NOT NULL,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS resume_import_runs_source_resume_id_idx
        ON resume_import_runs(source_resume_id, started_at DESC);

      CREATE TABLE IF NOT EXISTS resume_import_document_bundles (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        source_resume_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS resume_import_document_bundles_run_id_idx
        ON resume_import_document_bundles(run_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS resume_import_document_bundles_source_resume_id_idx
        ON resume_import_document_bundles(source_resume_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS resume_import_field_candidates (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        resolution TEXT NOT NULL,
        created_at TEXT NOT NULL,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS resume_import_field_candidates_run_id_idx
        ON resume_import_field_candidates(run_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS resume_import_field_candidates_resolution_idx
        ON resume_import_field_candidates(resolution, created_at DESC);
    `);
  }

  function ensureProfileCopilotTables(): void {
    database.exec(`
      CREATE TABLE IF NOT EXISTS profile_copilot_messages (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS profile_copilot_messages_created_at_idx
        ON profile_copilot_messages(created_at ASC, id ASC);

      CREATE TABLE IF NOT EXISTS profile_revisions (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS profile_revisions_created_at_idx
        ON profile_revisions(created_at DESC, id ASC);
    `);
  }

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

  if (currentVersion >= 4) {
    const resumeImportTablesMissing =
      !hasTable("resume_import_runs") ||
      !hasTable("resume_import_document_bundles") ||
      !hasTable("resume_import_field_candidates");
    const profileCopilotTablesMissing =
      !hasTable("profile_copilot_messages") || !hasTable("profile_revisions");
    const needsProfileCopilotMigration = currentVersion < 5;

    if (
      resumeImportTablesMissing ||
      profileCopilotTablesMissing ||
      needsProfileCopilotMigration
    ) {
      database.exec("BEGIN IMMEDIATE");
      try {
        if (resumeImportTablesMissing) {
          ensureResumeImportTables();
        }

        if (profileCopilotTablesMissing || needsProfileCopilotMigration) {
          ensureProfileCopilotTables();
        }

        if (needsProfileCopilotMigration) {
          database
            .prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)")
            .run(5, "job_finder_profile_copilot_history");
        }

        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    }

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

    if (currentVersion < 3) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS resume_drafts (
          id TEXT PRIMARY KEY,
          job_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS resume_drafts_job_id_idx
          ON resume_drafts(job_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS resume_draft_revisions (
          id TEXT PRIMARY KEY,
          draft_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS resume_draft_revisions_draft_id_idx
          ON resume_draft_revisions(draft_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS resume_export_artifacts (
          id TEXT PRIMARY KEY,
          job_id TEXT NOT NULL,
          draft_id TEXT NOT NULL,
          exported_at TEXT NOT NULL,
          is_approved INTEGER NOT NULL DEFAULT 0,
          value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS resume_export_artifacts_job_id_idx
          ON resume_export_artifacts(job_id, exported_at DESC);

        CREATE INDEX IF NOT EXISTS resume_export_artifacts_draft_id_idx
          ON resume_export_artifacts(draft_id, exported_at DESC);

        CREATE TABLE IF NOT EXISTS resume_research_artifacts (
          id TEXT PRIMARY KEY,
          job_id TEXT NOT NULL,
          fetched_at TEXT NOT NULL,
          value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS resume_research_artifacts_job_id_idx
          ON resume_research_artifacts(job_id, fetched_at DESC);

        CREATE TABLE IF NOT EXISTS resume_validation_results (
          id TEXT PRIMARY KEY,
          draft_id TEXT NOT NULL,
          validated_at TEXT NOT NULL,
          value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS resume_validation_results_draft_id_idx
          ON resume_validation_results(draft_id, validated_at DESC);

        CREATE TABLE IF NOT EXISTS resume_assistant_messages (
          id TEXT PRIMARY KEY,
          job_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS resume_assistant_messages_job_id_idx
          ON resume_assistant_messages(job_id, created_at ASC);
      `);

      database
        .prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)")
        .run(3, "job_finder_resume_workspace");
    }

    if (currentVersion < 4) {
      ensureResumeImportTables();

      database
        .prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)")
        .run(4, "job_finder_resume_import_runs");
    }

    if (currentVersion < 5) {
      ensureProfileCopilotTables();

      database
        .prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)")
        .run(5, "job_finder_profile_copilot_history");
    }

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
