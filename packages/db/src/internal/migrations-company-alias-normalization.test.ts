import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";

import { runMigrations } from "./migrations";

describe("company alias normalization migration", () => {
  test("repairs legacy derived alias keys without changing alias authority", () => {
    const database = new DatabaseSync(":memory:");
    runMigrations(database);
    database
      .prepare("INSERT INTO singleton_state (key, value) VALUES (?, ?)")
      .run(
        "intelligence_state",
        JSON.stringify({
          companies: [
            {
              id: "company_cpp",
              aliases: [
                {
                  alias: "C++ Works",
                  normalized: "c works",
                  confidence: 0.8,
                  identityAuthority: "user_approved_merge",
                },
                {
                  alias: "C# Labs",
                  normalized: "c labs",
                  confidence: 1,
                },
              ],
            },
          ],
          untouched: { marker: "preserved" },
        }),
      );
    database.prepare("DELETE FROM schema_migrations WHERE version = 14").run();

    runMigrations(database);
    runMigrations(database);

    const row = database
      .prepare("SELECT value FROM singleton_state WHERE key = ?")
      .get("intelligence_state") as { value: string };
    expect(JSON.parse(row.value)).toEqual({
      companies: [
        {
          id: "company_cpp",
          aliases: [
            {
              alias: "C++ Works",
              normalized: "cplusplus works",
              confidence: 0.8,
              identityAuthority: "user_approved_merge",
            },
            {
              alias: "C# Labs",
              normalized: "csharp labs",
              confidence: 1,
            },
          ],
        },
      ],
      untouched: { marker: "preserved" },
    });
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 14",
        )
        .get(),
    ).toEqual({ count: 1 });
    database.close();
  });
});
