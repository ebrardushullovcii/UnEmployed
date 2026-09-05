import { describe, expect, test } from "vitest";
import { DatabaseSync } from "node:sqlite";

import {
  repairLegacyCommaSplitAchievements,
  runMigrations,
} from "./migrations";

describe("legacy profile achievement repair", () => {
  test("rejoins only strong comma-split continuation fragments", () => {
    expect(
      repairLegacyCommaSplitAchievements([
        "Engineered a real-time order platform with React",
        "Next.js",
        "TailwindCSS and WebSockets",
        "synchronizing POS and kitchen screens.",
        "Built a typed release pipeline that reduced regressions by 30%.",
      ]),
    ).toEqual([
      "Engineered a real-time order platform with React, Next.js, TailwindCSS and WebSockets, synchronizing POS and kitchen screens.",
      "Built a typed release pipeline that reduced regressions by 30%.",
    ]);
  });

  test("preserves legitimate action-led and noun-phrase bullets", () => {
    const achievements = [
      "Led QA",
      "Maintained CI pipelines",
      "Improved uptime 20%",
      "Cross-functional leadership",
      "managed vendor handoffs.",
      "C# API maintenance",
      "Delivered the release.",
      "using a structured incident checklist.",
    ];

    expect(repairLegacyCommaSplitAchievements(achievements)).toEqual(
      achievements,
    );
  });

  test("repairs a persisted pre-v8 profile exactly once", () => {
    const database = new DatabaseSync(":memory:");
    runMigrations(database);
    database
      .prepare("INSERT INTO singleton_state (key, value) VALUES (?, ?)")
      .run(
        "profile",
        JSON.stringify({
          experiences: [
            {
              achievements: [
                "Engineered an ordering platform with React",
                "Next.js",
                "synchronizing kitchen screens.",
                "Built a typed release pipeline.",
              ],
            },
          ],
        }),
      );
    database
      .prepare(
        `INSERT INTO profile_revisions (id, created_at, value)
         VALUES (?, ?, ?)`,
      )
      .run(
        "revision_with_fragments",
        "2026-07-12T12:00:00.000Z",
        JSON.stringify({
          snapshotProfile: {
            experiences: [
              {
                achievements: [
                  "Built a design system with TypeScript",
                  "Next.js",
                  "supporting four product teams.",
                  "Documented component ownership.",
                ],
              },
            ],
          },
        }),
      );
    database.prepare("DELETE FROM schema_migrations WHERE version = 8").run();

    runMigrations(database);

    const row = database
      .prepare("SELECT value FROM singleton_state WHERE key = ?")
      .get("profile") as { value: string };
    const profile = JSON.parse(row.value) as {
      experiences: Array<{ achievements: string[] }>;
    };
    expect(profile.experiences[0]?.achievements).toEqual([
      "Engineered an ordering platform with React, Next.js, synchronizing kitchen screens.",
      "Built a typed release pipeline.",
    ]);
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 8",
        )
        .get(),
    ).toEqual({ count: 1 });
    const revisionRow = database
      .prepare("SELECT value FROM profile_revisions WHERE id = ?")
      .get("revision_with_fragments") as { value: string };
    const revision = JSON.parse(revisionRow.value) as {
      snapshotProfile: {
        experiences: Array<{ achievements: string[] }>;
      };
    };
    expect(revision.snapshotProfile.experiences[0]?.achievements).toEqual([
      "Built a design system with TypeScript, Next.js, supporting four product teams.",
      "Documented component ownership.",
    ]);
    database.close();
  });
});
