import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JOB_FINDER_MODEL_CLIENT_USER_AGENT,
  buildModelRequestHeaders,
  buildModelSessionId,
  isOpenCodeBaseUrl,
  modelConversationKeys,
} from "./model-request-identity";
import { createJobFinderAiClientFromEnvironment } from "./openai-compatible";
import {
  createEnvironment,
  createJobPosting,
  createPreferences,
  createProfile,
  createSettings,
} from "./test-fixtures";

describe("model request identity", () => {
  it("derives one stable, opaque, OpenCode-shaped session id per conversation key", () => {
    const first = buildModelSessionId("resume:target_site:4677969");
    const second = buildModelSessionId("resume:target_site:4677969");
    const other = buildModelSessionId("resume:target_site:4677970");

    expect(first).toBe(second);
    expect(first).not.toBe(other);
    expect(first).toMatch(/^ses_[a-z0-9]{26}$/u);
    // Opaque: the key itself never travels.
    expect(first).not.toContain("4677969");
  });

  it("sends the session header only to OpenCode hosts, and the client User-Agent everywhere", () => {
    const openCode = buildModelRequestHeaders({
      apiKey: "k",
      baseUrl: "https://opencode.ai/zen/go/v1",
      conversationKey: "profile-copilot:candidate_1",
    });
    expect(openCode["x-opencode-session"]).toBe(
      buildModelSessionId("profile-copilot:candidate_1"),
    );
    expect(openCode["User-Agent"]).toBe(JOB_FINDER_MODEL_CLIENT_USER_AGENT);
    expect(openCode.Authorization).toBe("Bearer k");
    expect(openCode["Content-Type"]).toBe("application/json");

    const other = buildModelRequestHeaders({
      apiKey: "k",
      baseUrl: "https://api.openai.com/v1",
      conversationKey: "profile-copilot:candidate_1",
    });
    expect(other["x-opencode-session"]).toBeUndefined();
    expect(other["User-Agent"]).toBe(JOB_FINDER_MODEL_CLIENT_USER_AGENT);

    const multipart = buildModelRequestHeaders({
      apiKey: "k",
      baseUrl: "https://opencode.ai/zen/go/v1",
      conversationKey: "interview-audio:mic",
      contentType: null,
    });
    expect(multipart["Content-Type"]).toBeUndefined();
    expect(multipart["x-opencode-session"]).toBeTruthy();

    expect(isOpenCodeBaseUrl("https://opencode.ai/zen/go/v1")).toBe(true);
    expect(isOpenCodeBaseUrl("https://zen.opencode.ai/v1")).toBe(true);
    expect(isOpenCodeBaseUrl("https://notopencode.ai/v1")).toBe(false);
    expect(isOpenCodeBaseUrl("nonsense")).toBe(false);
  });

  it("keys conversations by the thing being worked on", () => {
    expect(
      modelConversationKeys.resumeForJob({
        source: "target_site",
        sourceJobId: "42",
      }),
    ).toBe("resume:target_site:42");
    expect(modelConversationKeys.profileCopilot({ id: "candidate_1" })).toBe(
      "profile-copilot:candidate_1",
    );
    expect(modelConversationKeys.resumeImport("same text")).toBe(
      modelConversationKeys.resumeImport("same text"),
    );
    expect(
      modelConversationKeys.pageExtraction("https://Jobs.Example.test/a/b"),
    ).toBe("discovery:jobs.example.test");
  });
});

describe("OpenCode-compatible client requests", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("carries the User-Agent and one stable session id across every request about one job", async () => {
    const seen: Array<Record<string, string>> = [];
    globalThis.fetch = vi.fn((_url: unknown, init?: { headers?: unknown }) => {
      const headers = init?.headers as Record<string, string>;
      seen.push(headers);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({}) } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }) as unknown as typeof fetch;

    const client = createJobFinderAiClientFromEnvironment(
      createEnvironment({
        UNEMPLOYED_AI_BASE_URL: "https://opencode.ai/zen/go/v1",
      }),
    );
    const job = {
      ...createJobPosting(),
      description: Array.from(
        { length: 80 },
        (_, index) => `requirement ${index}`,
      ).join(" "),
    };
    const input = {
      profile: createProfile(),
      searchPreferences: createPreferences(),
      settings: createSettings(),
      job,
      resumeText: "Resume text",
    };

    await client.createResumeDraft(input);
    await client.tailorResume(input);

    expect(seen.length).toBeGreaterThanOrEqual(2);
    const sessionIds = new Set(
      seen.map((headers) => headers["x-opencode-session"]),
    );
    expect(sessionIds.size).toBe(1);
    expect([...sessionIds][0]).toBe(
      buildModelSessionId(modelConversationKeys.resumeForJob(job)),
    );
    for (const headers of seen) {
      expect(headers["User-Agent"]).toBe(JOB_FINDER_MODEL_CLIENT_USER_AGENT);
    }
  });
});
