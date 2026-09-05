import { afterEach, describe, expect, test, vi } from "vitest";

import {
  CapturedModelRunError,
  parseCapturedModelContribution,
  parseLastCapturedModelJson,
  withCapturedModelFetch,
} from "./capture-fetch";

const originalFetch = globalThis.fetch;

describe("model fetch capture", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test("captures model request and raw response without headers", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response('{"output_text":"ok"}', { status: 200 })),
    ) as typeof fetch;

    const captured = await withCapturedModelFetch({
      endpointPrefix: "https://models.example.com/v1",
      run: async () => {
        const response = await fetch(
          "https://models.example.com/v1/responses",
          {
            method: "POST",
            headers: { Authorization: "Bearer must-not-be-captured" },
            body: JSON.stringify({ model: "test-model", store: false }),
          },
        );
        return response.json() as Promise<unknown>;
      },
    });

    expect(captured.result).toEqual({ output_text: "ok" });
    expect(captured.captures).toHaveLength(1);
    expect(captured.captures[0]).toMatchObject({
      method: "POST",
      requestBody: '{"model":"test-model","store":false}',
      responseStatus: 200,
      responseBody: '{"output_text":"ok"}',
      error: null,
    });
    expect(JSON.stringify(captured.captures)).not.toContain(
      "must-not-be-captured",
    );
    expect(globalThis.fetch).not.toBe(originalFetch);
  });

  test("restores fetch after a failed run and records the transport error", async () => {
    const failingFetch = vi.fn(() =>
      Promise.reject(new Error("synthetic transport failure")),
    ) as typeof fetch;
    globalThis.fetch = failingFetch;

    const runPromise = withCapturedModelFetch({
      endpointPrefix: "https://models.example.com/v1",
      run: async () => {
        await fetch("https://models.example.com/v1/responses");
      },
    });

    await expect(runPromise).rejects.toThrow("synthetic transport failure");
    const capturedError = await runPromise.catch((error: unknown) => error);
    expect(capturedError).toBeInstanceOf(CapturedModelRunError);
    expect((capturedError as CapturedModelRunError).captures).toHaveLength(1);

    expect(globalThis.fetch).toBe(failingFetch);
  });

  test("extracts the unguarded JSON contribution from a Responses payload", () => {
    const parsed = parseLastCapturedModelJson([
      {
        sequence: 1,
        startedAt: "2026-08-12T00:00:00.000Z",
        durationMs: 12,
        url: "https://models.example.com/v1/responses",
        method: "POST",
        requestBody: "{}",
        responseStatus: 200,
        responseBody: JSON.stringify({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: '{"patchGroups":[{"applyMode":"auto"}]}',
                },
              ],
            },
          ],
        }),
        error: null,
      },
    ]);

    expect(parsed).toEqual({ patchGroups: [{ applyMode: "auto" }] });
  });

  test("preserves assistant text and tool calls when output is not JSON", () => {
    const contribution = parseCapturedModelContribution({
      sequence: 1,
      startedAt: "2026-08-12T00:00:00.000Z",
      durationMs: 10,
      url: "https://models.example.com/v1/responses",
      method: "POST",
      requestBody: "{}",
      responseStatus: 200,
      responseBody: JSON.stringify({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "I will inspect the public jobs route.",
              },
            ],
          },
          {
            type: "function_call",
            name: "navigate",
            arguments: '{"url":"https://jobs.example.com/jobs"}',
          },
        ],
      }),
      error: null,
    });

    expect(contribution).toEqual({
      assistantTexts: ["I will inspect the public jobs route."],
      toolCalls: [
        {
          name: "navigate",
          arguments: { url: "https://jobs.example.com/jobs" },
        },
      ],
    });
  });
});
