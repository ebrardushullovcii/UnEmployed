import { describe, expect, test } from "vitest";
import { createConfig } from "./agent.test-fixtures";
import { createSystemPrompt } from "./prompts";
import { createUserPrompt } from "./agent/user-prompts";

describe("seeded-query prompt guidance", () => {
  test("preserves seeded search terms in both prompts", () => {
    const config = createConfig();
    config.startingUrls = [
      "https://example.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo",
    ];

    expect(createSystemPrompt(config)).toContain(
      "Preserve those seeded terms when using the visible search UI.",
    );
    expect(createUserPrompt(config)).toContain(
      "Preserve these exact terms when using the visible search UI.",
    );
  });

  test("omits seeded guidance when URL has no search terms", () => {
    const config = createConfig();
    config.startingUrls = ["https://example.com/jobs"];

    expect(createSystemPrompt(config)).not.toContain(
      "Preserve those seeded terms when using the visible search UI.",
    );
    expect(createUserPrompt(config)).not.toContain(
      "Preserve these exact terms when using the visible search UI.",
    );
  });
});
