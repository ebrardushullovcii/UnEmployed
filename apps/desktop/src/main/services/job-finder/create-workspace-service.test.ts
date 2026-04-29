import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createDesktopBrowserRuntime, createDesktopJobFinderAiClient } from "./create-workspace-service";
import {
  getDesktopTestDelayMs,
  getResumePreviewTestMode,
  getTestBrowserSessionStatus,
  isBrowserAgentEnabled,
  parseResumeImportPathPayload,
  resetInvalidBooleanEnvWarnings,
} from "./test-api";

describe("createDesktopJobFinderAiClient", () => {
  test.each([
    ["with an API key present", { UNEMPLOYED_ENABLE_TEST_API: "1", UNEMPLOYED_AI_API_KEY: "test-api-key" }],
    ["without an API key configured", { UNEMPLOYED_ENABLE_TEST_API: "1" }],
  ])(
    "keeps the deterministic client when the desktop test API is enabled %s",
    (_label, env) => {
      const client = createDesktopJobFinderAiClient(env);

      expect(client.chatWithTools).toBeUndefined();
      expect(client.getStatus().kind).toBe("deterministic");
    },
  );

  test("allows live AI when the test API explicitly requests it", () => {
    const client = createDesktopJobFinderAiClient({
      UNEMPLOYED_ENABLE_TEST_API: "1",
      UNEMPLOYED_TEST_API_USE_LIVE_AI: "1",
      UNEMPLOYED_AI_API_KEY: "test-api-key",
      UNEMPLOYED_AI_BASE_URL: "https://example.invalid/v1",
      UNEMPLOYED_AI_MODEL: "test-model",
    });

    expect(client.chatWithTools).toBeTypeOf("function");
    expect(client.getStatus().kind).toBe("openai_compatible");
  });

  test("keeps deterministic behavior when live AI is requested without an API key", () => {
    const client = createDesktopJobFinderAiClient({
      UNEMPLOYED_ENABLE_TEST_API: "1",
      UNEMPLOYED_TEST_API_USE_LIVE_AI: "1",
    });

    expect(client.chatWithTools).toBeUndefined();
    expect(client.getStatus().kind).toBe("deterministic");
  });
});

describe("createDesktopBrowserRuntime", () => {
  test("rejects targeted browser opens when the browser agent runtime is disabled", async () => {
    const browserRuntime = createDesktopBrowserRuntime({
      env: { UNEMPLOYED_BROWSER_AGENT: "0" },
      aiClient: createDesktopJobFinderAiClient({ UNEMPLOYED_BROWSER_AGENT: "0" }),
      desktopTestApiEnabled: false,
    });

    await expect(
      browserRuntime.openSession("target_site", {
        targetUrl: "https://www.linkedin.com/jobs/search/",
      }),
    ).rejects.toThrow(
      "Targeted sign-in requires the browser agent runtime, but it is disabled in this desktop build.",
    );
  });

  test("rejects target-id browser opens when the browser agent runtime is disabled", async () => {
    const browserRuntime = createDesktopBrowserRuntime({
      env: { UNEMPLOYED_BROWSER_AGENT: "0" },
      aiClient: createDesktopJobFinderAiClient({ UNEMPLOYED_BROWSER_AGENT: "0" }),
      desktopTestApiEnabled: false,
    });

    await expect(
      browserRuntime.openSession("target_site", {
        targetId: "target_linkedin_default",
      } as { targetUrl?: string | null } & { targetId: string }),
    ).rejects.toThrow(
      "Targeted sign-in requires the browser agent runtime, but it is disabled in this desktop build.",
    );
  });

  test("keeps generic browser opens available when the browser agent runtime is disabled", async () => {
    const browserRuntime = createDesktopBrowserRuntime({
      env: { UNEMPLOYED_BROWSER_AGENT: "0" },
      aiClient: createDesktopJobFinderAiClient({ UNEMPLOYED_BROWSER_AGENT: "0" }),
      desktopTestApiEnabled: false,
    });

    const session = await browserRuntime.openSession("target_site");

    expect(session.driver).toBe("catalog_seed");
  });
});

describe("isBrowserAgentEnabled", () => {
  beforeEach(() => {
    resetInvalidBooleanEnvWarnings();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetInvalidBooleanEnvWarnings();
    vi.restoreAllMocks();
  });

  test("defaults to enabled when the flag is unset", () => {
    expect(isBrowserAgentEnabled({})).toBe(true);
  });

  test("treats blank values as unset without warning", () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    expect(isBrowserAgentEnabled({ UNEMPLOYED_BROWSER_AGENT: "" })).toBe(true);
    expect(isBrowserAgentEnabled({ UNEMPLOYED_BROWSER_AGENT: "   " })).toBe(
      true,
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("ignores the removed LinkedIn-specific alias when the generic flag is unset", () => {
    expect(
      isBrowserAgentEnabled({ UNEMPLOYED_LINKEDIN_BROWSER_AGENT: "0" }),
    ).toBe(true);
  });

  test("disables only for explicit false values", () => {
    expect(isBrowserAgentEnabled({ UNEMPLOYED_BROWSER_AGENT: "0" })).toBe(
      false,
    );
    expect(isBrowserAgentEnabled({ UNEMPLOYED_BROWSER_AGENT: "false" })).toBe(
      false,
    );
    expect(isBrowserAgentEnabled({ UNEMPLOYED_BROWSER_AGENT: " FALSE " })).toBe(
      false,
    );
  });

  test("enables explicit true values and warns once for unknown values while defaulting to enabled", () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    expect(isBrowserAgentEnabled({ UNEMPLOYED_BROWSER_AGENT: "1" })).toBe(true);
    expect(isBrowserAgentEnabled({ UNEMPLOYED_BROWSER_AGENT: "TRUE" })).toBe(
      true,
    );
    expect(isBrowserAgentEnabled({ UNEMPLOYED_BROWSER_AGENT: "yes" })).toBe(
      true,
    );
    expect(isBrowserAgentEnabled({ UNEMPLOYED_BROWSER_AGENT: "yes" })).toBe(
      true,
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[desktop test-api] Unrecognized UNEMPLOYED_BROWSER_AGENT value: "yes". Falling back to the default enabled behavior.',
    );
  });

  test("dedupes unknown values across casing and whitespace differences", () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    expect(isBrowserAgentEnabled({ UNEMPLOYED_BROWSER_AGENT: " yes " })).toBe(
      true,
    );
    expect(isBrowserAgentEnabled({ UNEMPLOYED_BROWSER_AGENT: "YES" })).toBe(
      true,
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[desktop test-api] Unrecognized UNEMPLOYED_BROWSER_AGENT value: "yes". Falling back to the default enabled behavior.',
    );
  });
});

describe("parseResumeImportPathPayload", () => {
  test("trims source paths at the test API boundary", () => {
    expect(
      parseResumeImportPathPayload({ sourcePath: "  C:/tmp/resume.pdf  " }),
    ).toEqual({ sourcePath: "C:/tmp/resume.pdf" });
  });
});

describe("getTestBrowserSessionStatus", () => {
  beforeEach(() => {
    resetInvalidBooleanEnvWarnings();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetInvalidBooleanEnvWarnings();
    vi.restoreAllMocks();
  });

  test("returns null when the override is unset or blank", () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    expect(getTestBrowserSessionStatus({})).toBeNull();
    expect(
      getTestBrowserSessionStatus({ UNEMPLOYED_TEST_BROWSER_SESSION_STATUS: "   " }),
    ).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("parses valid browser session statuses", () => {
    expect(
      getTestBrowserSessionStatus({
        UNEMPLOYED_TEST_BROWSER_SESSION_STATUS: "login_required",
      }),
    ).toBe("login_required");
    expect(
      getTestBrowserSessionStatus({
        UNEMPLOYED_TEST_BROWSER_SESSION_STATUS: " blocked ",
      }),
    ).toBe("blocked");
  });

  test("warns once and ignores invalid overrides", () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    expect(
      getTestBrowserSessionStatus({
        UNEMPLOYED_TEST_BROWSER_SESSION_STATUS: "needs_login",
      }),
    ).toBeNull();
    expect(
      getTestBrowserSessionStatus({
        UNEMPLOYED_TEST_BROWSER_SESSION_STATUS: "needs_login",
      }),
    ).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[desktop test-api] Unrecognized UNEMPLOYED_TEST_BROWSER_SESSION_STATUS value: "needs_login". Falling back to the default no-override behavior.',
    );
  });
});

describe("getDesktopTestDelayMs", () => {
  beforeEach(() => {
    resetInvalidBooleanEnvWarnings();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetInvalidBooleanEnvWarnings();
    vi.restoreAllMocks();
  });

  test("accepts trimmed numeric delay values", () => {
    expect(
      getDesktopTestDelayMs(" 250 ", "UNEMPLOYED_TEST_PROFILE_COPILOT_DELAY_MS"),
    ).toBe(250);
  });

  test("rejects numeric prefixes with a warning", () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    expect(
      getDesktopTestDelayMs("250ms", "UNEMPLOYED_TEST_PROFILE_COPILOT_DELAY_MS"),
    ).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      '[desktop test-api] Unrecognized UNEMPLOYED_TEST_PROFILE_COPILOT_DELAY_MS value: "250ms". Falling back to the default disabled behavior.',
    );
  });
});

describe("getResumePreviewTestMode", () => {
  beforeEach(() => {
    resetInvalidBooleanEnvWarnings();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetInvalidBooleanEnvWarnings();
    vi.restoreAllMocks();
  });

  test("defaults to ok when unset or blank", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(getResumePreviewTestMode({})).toBe("ok");
    expect(getResumePreviewTestMode({ UNEMPLOYED_TEST_RESUME_PREVIEW: "   " })).toBe("ok");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("accepts fail_once override", () => {
    expect(getResumePreviewTestMode({ UNEMPLOYED_TEST_RESUME_PREVIEW: "fail_once" })).toBe("fail_once");
  });

  test("warns once and falls back to ok for invalid overrides", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(getResumePreviewTestMode({ UNEMPLOYED_TEST_RESUME_PREVIEW: "broken" })).toBe("ok");
    expect(getResumePreviewTestMode({ UNEMPLOYED_TEST_RESUME_PREVIEW: "broken" })).toBe("ok");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[desktop test-api] Unrecognized UNEMPLOYED_TEST_RESUME_PREVIEW value: "broken". Falling back to the default "ok" behavior.',
    );
  });
});
