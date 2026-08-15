export const modelApiModes = ["responses", "chat_completions"] as const;
export type ModelApiMode = (typeof modelApiModes)[number];

export const modelReasoningEfforts = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
export type ModelReasoningEffort = (typeof modelReasoningEfforts)[number];

export const DEFAULT_OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";
export const DEFAULT_TEXT_MODEL = "deepseek-v4-flash";
export const DEFAULT_TEXT_MODEL_API_MODE: ModelApiMode = "chat_completions";
export const DEFAULT_TEXT_MODEL_REASONING_EFFORT: ModelReasoningEffort = "max";
export const DEFAULT_VISION_MODEL = "gpt-5.6-luna";
export const DEFAULT_VISION_MODEL_API_MODE: ModelApiMode = "responses";
export const DEFAULT_VISION_MODEL_REASONING_EFFORT: ModelReasoningEffort =
  "high";

export type CompatibleMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: unknown;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
};

export type CompatibleTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: unknown;
  };
};

type ChatCompletionsPayload = {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
  }>;
  error?: { message?: string };
};

type ResponsesPayload = {
  output?: Array<{
    type?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  output_text?: string;
  error?: { message?: string };
};

function isTextContentPart(value: unknown): value is { text: string } {
  return Boolean(
    value &&
    typeof value === "object" &&
    "text" in value &&
    typeof value.text === "string",
  );
}

function extractContentString(rawContent: unknown): string {
  if (typeof rawContent === "string") {
    return rawContent;
  }

  if (Array.isArray(rawContent)) {
    return rawContent
      .flatMap((entry) => {
        if (typeof entry === "string") {
          return [entry];
        }
        if (isTextContentPart(entry)) {
          return [entry.text];
        }
        return [];
      })
      .join("\n");
  }

  return "";
}

function extractJsonString(rawContent: string): string {
  const fencedMatches = [
    ...rawContent.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi),
  ]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));

  for (const candidate of fencedMatches) {
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // Keep scanning fenced blocks until one parses as JSON.
    }
  }

  if (fencedMatches[0]) {
    return fencedMatches[0];
  }

  const firstBraceIndex = rawContent.indexOf("{");
  const firstBracketIndex = rawContent.indexOf("[");
  const startsWithArray =
    firstBracketIndex >= 0 &&
    (firstBraceIndex < 0 || firstBracketIndex < firstBraceIndex);

  if (startsWithArray) {
    const lastBracketIndex = rawContent.lastIndexOf("]");
    if (lastBracketIndex > firstBracketIndex) {
      return rawContent.slice(firstBracketIndex, lastBracketIndex + 1);
    }
  }

  const lastBraceIndex = rawContent.lastIndexOf("}");
  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    return rawContent.slice(firstBraceIndex, lastBraceIndex + 1);
  }

  return rawContent.trim();
}

function normalizeResponsesPayload(
  payload: ResponsesPayload,
): ChatCompletionsPayload {
  const content =
    payload.output_text?.trim() ||
    payload.output
      ?.flatMap((item) =>
        item.type === "message"
          ? (item.content ?? []).flatMap((part) =>
              typeof part.text === "string" ? [part.text] : [],
            )
          : [],
      )
      .join("\n") ||
    undefined;
  const toolCalls = payload.output?.flatMap((item) => {
    if (
      item.type !== "function_call" ||
      typeof item.call_id !== "string" ||
      typeof item.name !== "string" ||
      typeof item.arguments !== "string"
    ) {
      return [];
    }

    return [
      {
        id: item.call_id,
        type: "function",
        function: { name: item.name, arguments: item.arguments },
      },
    ];
  });

  return {
    choices: [
      {
        message: {
          ...(content ? { content } : {}),
          ...(toolCalls && toolCalls.length > 0
            ? { tool_calls: toolCalls }
            : {}),
        },
      },
    ],
    ...(payload.error ? { error: payload.error } : {}),
  };
}

async function parseNormalizedPayload(
  response: Response,
  apiMode: ModelApiMode,
): Promise<ChatCompletionsPayload> {
  const rawBody = await response.text();
  let rawPayload: ChatCompletionsPayload | ResponsesPayload | null = null;

  if (rawBody.length > 0) {
    try {
      rawPayload = JSON.parse(rawBody) as
        | ChatCompletionsPayload
        | ResponsesPayload;
    } catch {
      rawPayload = null;
    }
  }

  if (!response.ok) {
    throw new Error(
      rawPayload?.error?.message ??
        `Model request failed with status ${response.status}`,
    );
  }

  if (!rawPayload) {
    throw new Error("Model returned a non-JSON response");
  }

  return apiMode === "responses"
    ? normalizeResponsesPayload(rawPayload as ResponsesPayload)
    : (rawPayload as ChatCompletionsPayload);
}

export async function parseModelJsonResponse(
  response: Response,
  apiMode: ModelApiMode = "chat_completions",
): Promise<unknown> {
  const payload = await parseNormalizedPayload(response, apiMode);
  const rawContent = extractContentString(
    payload.choices?.[0]?.message?.content,
  );
  const jsonString = extractJsonString(rawContent);

  try {
    return JSON.parse(jsonString) as unknown;
  } catch (error) {
    throw new Error(
      `Model returned invalid JSON: ${error instanceof Error ? error.message : "Unknown parse error"}`,
    );
  }
}

export async function parseResponsePayload(
  response: Response,
  apiMode: ModelApiMode = "chat_completions",
): Promise<ChatCompletionsPayload> {
  return parseNormalizedPayload(response, apiMode);
}

function toResponsesContent(rawContent: unknown): unknown {
  if (!Array.isArray(rawContent)) {
    return rawContent;
  }

  const content: unknown[] = [];
  for (const part of rawContent as unknown[]) {
    if (!part || typeof part !== "object") {
      continue;
    }

    if (
      "type" in part &&
      part.type === "text" &&
      "text" in part &&
      typeof part.text === "string"
    ) {
      content.push({ type: "input_text", text: part.text });
      continue;
    }

    if (
      "type" in part &&
      part.type === "image_url" &&
      "image_url" in part &&
      part.image_url &&
      typeof part.image_url === "object" &&
      "url" in part.image_url &&
      typeof part.image_url.url === "string"
    ) {
      content.push({
        type: "input_image",
        image_url: part.image_url.url,
        ...("detail" in part.image_url &&
        typeof part.image_url.detail === "string"
          ? { detail: part.image_url.detail }
          : {}),
      });
    }
  }

  return content;
}

function toResponsesInput(messages: readonly CompatibleMessage[]): unknown[] {
  return messages.flatMap((message) => {
    if (message.role === "tool") {
      return message.tool_call_id
        ? [
            {
              type: "function_call_output",
              call_id: message.tool_call_id,
              output: extractContentString(message.content),
            },
          ]
        : [];
    }

    const items: unknown[] = [];
    const content = toResponsesContent(message.content);
    if (
      (typeof content === "string" && content.length > 0) ||
      (Array.isArray(content) && content.length > 0)
    ) {
      items.push({ role: message.role, content });
    }

    for (const toolCall of message.tool_calls ?? []) {
      items.push({
        type: "function_call",
        call_id: toolCall.id,
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      });
    }

    return items;
  });
}

export function buildModelRequestBody(input: {
  apiMode: ModelApiMode;
  model: string;
  reasoningEffort?: ModelReasoningEffort | undefined;
  messages: readonly CompatibleMessage[];
  jsonOutput?: boolean;
  tools?: readonly CompatibleTool[];
  maxOutputTokens?: number | undefined;
}): Record<string, unknown> {
  if (input.apiMode === "chat_completions") {
    return {
      model: input.model,
      ...(!input.reasoningEffort ? { temperature: 0.2 } : {}),
      ...(input.reasoningEffort
        ? {
            reasoning_effort: input.reasoningEffort,
          }
        : {}),
      ...(input.jsonOutput ? { response_format: { type: "json_object" } } : {}),
      messages: input.messages,
      ...(input.tools && input.tools.length > 0
        ? { tools: input.tools, tool_choice: "auto" }
        : {}),
      ...(typeof input.maxOutputTokens === "number"
        ? { max_tokens: input.maxOutputTokens }
        : {}),
    };
  }

  return {
    model: input.model,
    store: false,
    reasoning: {
      effort: input.reasoningEffort ?? DEFAULT_VISION_MODEL_REASONING_EFFORT,
    },
    input: toResponsesInput(input.messages),
    ...(input.jsonOutput ? { text: { format: { type: "json_object" } } } : {}),
    ...(input.tools && input.tools.length > 0
      ? {
          tools: input.tools.map((tool) => ({
            type: "function",
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters,
          })),
          tool_choice: "auto",
        }
      : {}),
    ...(typeof input.maxOutputTokens === "number"
      ? { max_output_tokens: input.maxOutputTokens }
      : {}),
  };
}

export function parseModelApiMode(
  value: string | undefined,
): ModelApiMode | undefined {
  const normalized = value?.trim().toLowerCase();
  return modelApiModes.find((mode) => mode === normalized);
}

export function parseModelReasoningEffort(
  value: string | undefined,
): ModelReasoningEffort | undefined {
  const normalized = value?.trim().toLowerCase();
  return modelReasoningEfforts.find((effort) => effort === normalized);
}

export function buildModelUrl(baseUrl: string, apiMode: ModelApiMode): string {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    apiMode === "responses" ? "responses" : "chat/completions",
    normalizedBaseUrl,
  ).toString();
}

export function buildChatCompletionsUrl(baseUrl: string): string {
  return buildModelUrl(baseUrl, "chat_completions");
}

export function buildAudioTranscriptionsUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("audio/transcriptions", normalizedBaseUrl).toString();
}
