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

function isStrongLegacyAchievementContinuation(value: string): boolean {
  const trimmed = value.trim();
  const startsWithContinuationWord =
    /^(?:and|or|while|which|that|with|using|including|ensuring|improving|reducing|synchronizing|supporting)\b/u.test(
      trimmed,
    );
  const technologyTokens = trimmed.split(/\s+(?:and|&)\s+/u);
  const isTechnologyList =
    trimmed.length <= 48 &&
    technologyTokens.length <= 4 &&
    technologyTokens.every(
      (token) =>
        !/\s/u.test(token) &&
        (/[A-Za-z]\.[A-Za-z]/u.test(token) ||
          /[a-z][A-Z]/u.test(token) ||
          /^(?:\.?NET|[A-Za-z][A-Za-z0-9]*#|[A-Za-z][A-Za-z0-9]*\+\+)$/u.test(
            token,
          )),
    );

  return startsWithContinuationWord || isTechnologyList;
}

export function repairLegacyCommaSplitAchievements(
  values: readonly string[],
): string[] {
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  if (
    !normalized.some(
      (value, index) =>
        index > 0 && isStrongLegacyAchievementContinuation(value),
    )
  ) {
    return normalized;
  }

  const repaired: string[] = [];
  let current = normalized[0] ?? "";

  for (const value of normalized.slice(1)) {
    if (
      !/[.!?]$/u.test(current) &&
      isStrongLegacyAchievementContinuation(value)
    ) {
      current = `${current}${/[,;:]$/u.test(current) ? " " : ", "}${value}`;
      continue;
    }

    repaired.push(current);
    current = value;
  }

  if (current) repaired.push(current);
  return repaired;
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

  function repairProfileRecordAchievementFragments(profile: unknown): boolean {
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      return false;
    }

    const profileRecord = profile as Record<string, unknown>;
    if (!Array.isArray(profileRecord.experiences)) return false;
    let changed = false;

    for (const experience of profileRecord.experiences) {
      if (
        !experience ||
        typeof experience !== "object" ||
        Array.isArray(experience)
      ) {
        continue;
      }
      const experienceRecord = experience as Record<string, unknown>;
      if (
        !Array.isArray(experienceRecord.achievements) ||
        !experienceRecord.achievements.every(
          (achievement) => typeof achievement === "string",
        )
      ) {
        continue;
      }

      const achievements = experienceRecord.achievements;
      const repaired = repairLegacyCommaSplitAchievements(achievements);
      if (
        repaired.length === achievements.length &&
        repaired.every((value, index) => value === achievements[index])
      ) {
        continue;
      }

      experienceRecord.achievements = repaired;
      changed = true;
    }

    return changed;
  }

  function repairPersistedProfileAchievementFragments(): void {
    if (hasTable("singleton_state")) {
      const row = database
        .prepare("SELECT value FROM singleton_state WHERE key = ?")
        .get("profile") as { value?: string } | undefined;

      if (row?.value) {
        try {
          const profile = JSON.parse(row.value) as unknown;
          if (repairProfileRecordAchievementFragments(profile)) {
            database
              .prepare("UPDATE singleton_state SET value = ? WHERE key = ?")
              .run(JSON.stringify(profile), "profile");
          }
        } catch {
          // Leave malformed legacy state untouched; schema loading will surface it.
        }
      }
    }

    if (!hasTable("profile_revisions")) return;

    const revisionRows = database
      .prepare("SELECT id, value FROM profile_revisions")
      .all() as Array<{ id: string; value: string }>;
    const updateRevision = database.prepare(
      "UPDATE profile_revisions SET value = ? WHERE id = ?",
    );

    for (const row of revisionRows) {
      try {
        const revision = JSON.parse(row.value) as unknown;
        if (
          revision &&
          typeof revision === "object" &&
          !Array.isArray(revision) &&
          repairProfileRecordAchievementFragments(
            (revision as Record<string, unknown>).snapshotProfile,
          )
        ) {
          updateRevision.run(JSON.stringify(revision), row.id);
        }
      } catch {
        // Leave malformed revision rows untouched; schema loading will surface them.
      }
    }
  }

  function ensureApplyFoundationTables(): void {
    database.exec(`
      CREATE TABLE IF NOT EXISTS apply_runs (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        mode TEXT NOT NULL,
        state TEXT NOT NULL,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS apply_runs_updated_at_idx
        ON apply_runs(updated_at DESC, id ASC);

      CREATE TABLE IF NOT EXISTS apply_job_results (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        queue_position INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        state TEXT NOT NULL,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS apply_job_results_run_id_idx
        ON apply_job_results(run_id, queue_position ASC, updated_at DESC, id ASC);

      CREATE INDEX IF NOT EXISTS apply_job_results_job_id_idx
        ON apply_job_results(job_id, updated_at DESC, id ASC);

      CREATE UNIQUE INDEX IF NOT EXISTS apply_job_results_run_job_unique_idx
        ON apply_job_results(run_id, job_id);

      CREATE TABLE IF NOT EXISTS apply_submit_approvals (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS apply_submit_approvals_run_id_idx
        ON apply_submit_approvals(run_id, created_at DESC, id ASC);

      CREATE TABLE IF NOT EXISTS application_question_records (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        result_id TEXT,
        detected_at TEXT NOT NULL,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS application_question_records_run_job_idx
        ON application_question_records(run_id, job_id, detected_at ASC, id ASC);

      CREATE INDEX IF NOT EXISTS application_question_records_result_idx
        ON application_question_records(result_id, detected_at ASC, id ASC);

      CREATE TABLE IF NOT EXISTS application_answer_records (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        result_id TEXT,
        question_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS application_answer_records_question_idx
        ON application_answer_records(question_id, created_at ASC, id ASC);

      CREATE INDEX IF NOT EXISTS application_answer_records_run_job_idx
        ON application_answer_records(run_id, job_id, created_at ASC, id ASC);

      CREATE INDEX IF NOT EXISTS application_answer_records_result_idx
        ON application_answer_records(result_id, created_at ASC, id ASC);

      CREATE TABLE IF NOT EXISTS application_artifact_refs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        result_id TEXT,
        created_at TEXT NOT NULL,
        kind TEXT NOT NULL,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS application_artifact_refs_result_idx
        ON application_artifact_refs(result_id, created_at DESC, id ASC);

      CREATE INDEX IF NOT EXISTS application_artifact_refs_run_job_idx
        ON application_artifact_refs(run_id, job_id, created_at DESC, id ASC);

      CREATE TABLE IF NOT EXISTS application_replay_checkpoints (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        result_id TEXT,
        created_at TEXT NOT NULL,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS application_replay_checkpoints_result_idx
        ON application_replay_checkpoints(result_id, created_at DESC, id ASC);

      CREATE INDEX IF NOT EXISTS application_replay_checkpoints_run_job_idx
        ON application_replay_checkpoints(run_id, job_id, created_at DESC, id ASC);

      CREATE TABLE IF NOT EXISTS application_consent_requests (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        result_id TEXT,
        requested_at TEXT NOT NULL,
        status TEXT NOT NULL,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS application_consent_requests_result_idx
        ON application_consent_requests(result_id, requested_at DESC, id ASC);

      CREATE INDEX IF NOT EXISTS application_consent_requests_run_job_idx
        ON application_consent_requests(run_id, job_id, requested_at DESC, id ASC);
    `);
  }

  function rewritePersistedResultId(input: {
    tableName: string;
    rowId: string;
    serializedValue: string;
    survivorId: string;
  }): string | null {
    let parsedValue: unknown;

    try {
      parsedValue = JSON.parse(input.serializedValue) as unknown;
    } catch {
      console.warn(
        `[DB migration] Skipping embedded resultId rewrite for ${input.tableName}.${input.rowId} because the persisted value is not valid JSON.`,
      );
      return null;
    }

    if (
      !parsedValue ||
      typeof parsedValue !== "object" ||
      Array.isArray(parsedValue)
    ) {
      console.warn(
        `[DB migration] Skipping embedded resultId rewrite for ${input.tableName}.${input.rowId} because the persisted value is not a JSON object.`,
      );
      return null;
    }

    return JSON.stringify({
      ...parsedValue,
      resultId: input.survivorId,
    });
  }

  function dedupeApplyJobResultsByRunAndJob(): void {
    const evidenceTables = [
      "application_question_records",
      "application_answer_records",
      "application_artifact_refs",
      "application_replay_checkpoints",
      "application_consent_requests",
    ] as const;

    database.exec(`
      CREATE TEMP TABLE apply_job_result_dedupe_map AS
      WITH ranked_results AS (
        SELECT
          id,
          run_id,
          job_id,
          FIRST_VALUE(id) OVER (
            PARTITION BY run_id, job_id
            ORDER BY updated_at DESC, queue_position ASC, id ASC
          ) AS survivor_id,
          ROW_NUMBER() OVER (
            PARTITION BY run_id, job_id
            ORDER BY updated_at DESC, queue_position ASC, id ASC
          ) AS row_number
        FROM apply_job_results
      )
      SELECT id AS duplicate_id, survivor_id
      FROM ranked_results
      WHERE row_number > 1;
    `);

    for (const tableName of evidenceTables) {
      if (!hasTable(tableName)) {
        continue;
      }

      const rows = database
        .prepare(
          `
        SELECT
          ${tableName}.id AS id,
          ${tableName}.value AS value,
          apply_job_result_dedupe_map.survivor_id AS survivor_id
        FROM ${tableName}
        INNER JOIN apply_job_result_dedupe_map
          ON apply_job_result_dedupe_map.duplicate_id = ${tableName}.result_id;
      `,
        )
        .all();

      const updateStatement = database.prepare(`
        UPDATE ${tableName}
        SET value = ?, result_id = ?
        WHERE id = ?
      `);

      for (const row of rows) {
        if (
          !row ||
          typeof row !== "object" ||
          typeof (row as { id?: unknown }).id !== "string" ||
          typeof (row as { value?: unknown }).value !== "string" ||
          typeof (row as { survivor_id?: unknown }).survivor_id !== "string"
        ) {
          throw new Error(
            `Invalid ${tableName} evidence row while rewriting apply result ids.`,
          );
        }
        const typedRow = row as {
          id: string;
          value: string;
          survivor_id: string;
        };
        const rewrittenValue = rewritePersistedResultId({
          tableName,
          rowId: typedRow.id,
          serializedValue: typedRow.value,
          survivorId: typedRow.survivor_id,
        });

        updateStatement.run(
          rewrittenValue ?? typedRow.value,
          typedRow.survivor_id,
          typedRow.id,
        );
      }
    }

    database.exec(`
      DELETE FROM apply_job_results
      WHERE id IN (SELECT duplicate_id FROM apply_job_result_dedupe_map);

      DROP TABLE apply_job_result_dedupe_map;
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
  const appliedVersions = new Set(
    (
      database.prepare("SELECT version FROM schema_migrations").all() as Array<{
        version: number;
      }>
    ).map((row) => Number(row.version)),
  );

  if (currentVersion >= 4) {
    const resumeImportTablesMissing =
      !hasTable("resume_import_runs") ||
      !hasTable("resume_import_document_bundles") ||
      !hasTable("resume_import_field_candidates");
    const profileCopilotTablesMissing =
      !hasTable("profile_copilot_messages") || !hasTable("profile_revisions");
    const applyFoundationTablesMissing =
      !hasTable("apply_runs") ||
      !hasTable("apply_job_results") ||
      !hasTable("apply_submit_approvals") ||
      !hasTable("application_question_records") ||
      !hasTable("application_answer_records") ||
      !hasTable("application_artifact_refs") ||
      !hasTable("application_replay_checkpoints") ||
      !hasTable("application_consent_requests");
    // Migration rows can be removed independently while reproducing or
    // repairing legacy databases. Do not let a later version hide a missing
    // earlier migration merely because MAX(version) is newer.
    const needsProfileCopilotMigration = !appliedVersions.has(5);
    const needsApplyFoundationMigration = !appliedVersions.has(6);
    const needsApplyFoundationIndexMigration = !appliedVersions.has(7);
    const needsProfileAchievementRepairMigration = !appliedVersions.has(8);

    if (
      resumeImportTablesMissing ||
      profileCopilotTablesMissing ||
      applyFoundationTablesMissing ||
      needsProfileCopilotMigration ||
      needsApplyFoundationMigration ||
      needsApplyFoundationIndexMigration ||
      needsProfileAchievementRepairMigration
    ) {
      database.exec("BEGIN IMMEDIATE");
      try {
        if (resumeImportTablesMissing) {
          ensureResumeImportTables();
        }

        if (profileCopilotTablesMissing || needsProfileCopilotMigration) {
          ensureProfileCopilotTables();
        }

        if (
          applyFoundationTablesMissing ||
          needsApplyFoundationMigration ||
          needsApplyFoundationIndexMigration
        ) {
          if (
            hasTable("apply_job_results") &&
            needsApplyFoundationIndexMigration
          ) {
            dedupeApplyJobResultsByRunAndJob();
          }

          ensureApplyFoundationTables();
        }

        if (needsProfileCopilotMigration) {
          database
            .prepare(
              "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
            )
            .run(5, "job_finder_profile_copilot_history");
        }

        if (needsApplyFoundationMigration) {
          database
            .prepare(
              "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
            )
            .run(6, "job_finder_apply_foundation");
        }

        if (needsApplyFoundationIndexMigration) {
          database
            .prepare(
              "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
            )
            .run(7, "job_finder_apply_foundation_dedupe");
        }

        if (needsProfileAchievementRepairMigration) {
          repairPersistedProfileAchievementFragments();
          database
            .prepare(
              "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
            )
            .run(8, "repair_legacy_profile_achievement_fragments");
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

    if (currentVersion < 6) {
      if (hasTable("apply_job_results")) {
        dedupeApplyJobResultsByRunAndJob();
      }

      ensureApplyFoundationTables();

      database
        .prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)")
        .run(6, "job_finder_apply_foundation");
    }

    if (currentVersion < 7) {
      database
        .prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)")
        .run(7, "job_finder_apply_foundation_dedupe");
    }

    if (currentVersion < 8) {
      repairPersistedProfileAchievementFragments();
      database
        .prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)")
        .run(8, "repair_legacy_profile_achievement_fragments");
    }

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
