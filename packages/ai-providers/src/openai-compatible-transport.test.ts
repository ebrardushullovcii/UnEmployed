import { describe, expect, test } from "vitest";
import {
  buildModelRequestBody,
  buildModelUrl,
  parseModelJsonResponse,
  parseResponsePayload,
} from "./openai-compatible-transport";

describe("Responses API transport", () => {
  test("preserves max reasoning for Chat Completions tool requests", () => {
    const body = buildModelRequestBody({
      apiMode: "chat_completions",
      model: "deepseek-v4-flash",
      reasoningEffort: "max",
      messages: [{ role: "user", content: "Inspect the saved profile." }],
      tools: [
        {
          type: "function",
          function: {
            name: "read_profile",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
    });

    expect(body).toMatchObject({
      model: "deepseek-v4-flash",
      reasoning_effort: "max",
      tool_choice: "auto",
    });
  });

  test("builds a private Luna high structured request with vision input", () => {
    const body = buildModelRequestBody({
      apiMode: "responses",
      model: "gpt-5.6-luna",
      reasoningEffort: "high",
      jsonOutput: true,
      messages: [
        { role: "system", content: "Return grounded JSON." },
        {
          role: "user",
          content: [
            { type: "text", text: '{"candidate":"Casey"}' },
            {
              type: "image_url",
              image_url: {
                url: "data:image/png;base64,AAAA",
                detail: "high",
              },
            },
          ],
        },
      ],
    });

    expect(buildModelUrl("http://127.0.0.1:8080/v1", "responses")).toBe(
      "http://127.0.0.1:8080/v1/responses",
    );
    expect(body).toMatchObject({
      model: "gpt-5.6-luna",
      store: false,
      reasoning: { effort: "high" },
      text: { format: { type: "json_object" } },
      input: [
        { role: "system", content: "Return grounded JSON." },
        {
          role: "user",
          content: [
            { type: "input_text", text: '{"candidate":"Casey"}' },
            {
              type: "input_image",
              image_url: "data:image/png;base64,AAAA",
              detail: "high",
            },
          ],
        },
      ],
    });
  });

  test("maps function tools and prior tool results to Responses items", () => {
    const body = buildModelRequestBody({
      apiMode: "responses",
      model: "gpt-5.6-luna",
      reasoningEffort: "xhigh",
      messages: [
        { role: "user", content: "Check the source." },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "inspect_source", arguments: '{"id":1}' },
            },
          ],
        },
        {
          role: "tool",
          content: '{"status":"ready"}',
          tool_call_id: "call_1",
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "inspect_source",
            description: "Inspect one source.",
            parameters: {
              type: "object",
              properties: { id: { type: "number" } },
              required: ["id"],
            },
          },
        },
      ],
      maxOutputTokens: 2_000,
    });

    expect(body).toMatchObject({
      input: [
        { role: "user", content: "Check the source." },
        {
          type: "function_call",
          call_id: "call_1",
          name: "inspect_source",
          arguments: '{"id":1}',
        },
        {
          type: "function_call_output",
          call_id: "call_1",
          output: '{"status":"ready"}',
        },
      ],
      tools: [
        {
          type: "function",
          name: "inspect_source",
          description: "Inspect one source.",
        },
      ],
      max_output_tokens: 2_000,
    });
  });

  test("normalizes Responses text and function calls for existing clients", async () => {
    const jsonResponse = new Response(
      JSON.stringify({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({ score: 92 }),
              },
            ],
          },
        ],
      }),
      { status: 200 },
    );

    await expect(
      parseModelJsonResponse(jsonResponse, "responses"),
    ).resolves.toEqual({ score: 92 });

    const toolResponse = new Response(
      JSON.stringify({
        output: [
          {
            type: "function_call",
            call_id: "call_2",
            name: "prepare_application",
            arguments: '{"jobId":"job_1"}',
          },
        ],
      }),
      { status: 200 },
    );
    const payload = await parseResponsePayload(toolResponse, "responses");

    expect(payload.choices?.[0]?.message?.tool_calls).toEqual([
      {
        id: "call_2",
        type: "function",
        function: {
          name: "prepare_application",
          arguments: '{"jobId":"job_1"}',
        },
      },
    ]);
  });
});
