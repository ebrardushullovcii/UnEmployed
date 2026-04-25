import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createDesktopJobFinderAiClient } from "./create-workspace-service";
import {
  isBrowserAgentEnabled,
  resetInvalidBooleanEnvWarnings,
} from "./test-api";

describe("createDesktopJobFinderAiClient", () => {
  test("forces the deterministic client when the desktop test API is enabled", () => {
    const client = createDesktopJobFinderAiClient({
      UNEMPLOYED_ENABLE_TEST_API: "1",
      UNEMPLOYED_AI_API_KEY: "test-api-key",
    });

    expect(client.chatWithTools).toBeUndefined();
    expect(client.getStatus().kind).toBe("deterministic");
  });

  test("still falls back to deterministic behavior when no API key is configured", () => {
    const client = createDesktopJobFinderAiClient({
      UNEMPLOYED_ENABLE_TEST_API: "1",
    });

    expect(client.chatWithTools).toBeUndefined();
    expect(client.getStatus().kind).toBe("deterministic");
  });

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

    warnSpy.mockRestore();
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
      '[desktop test-api] Unrecognized UNEMPLOYED_BROWSER_AGENT value: " yes ". Falling back to the default enabled behavior.',
    );
  });
});
