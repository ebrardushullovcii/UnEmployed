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
  error?: {
    message?: string;
  };
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
  const fencedMatches = [...rawContent.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
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
  const lastBraceIndex = rawContent.lastIndexOf("}");

  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    return rawContent.slice(firstBraceIndex, lastBraceIndex + 1);
  }

  return rawContent.trim();
}

export async function parseModelJsonResponse(response: Response): Promise<unknown> {
  const rawBody = await response.text();
  const payload = rawBody.length > 0
    ? (() => {
        try {
          return JSON.parse(rawBody) as {
            choices?: Array<{
              message?: {
                content?: unknown;
              };
            }>;
            error?: {
              message?: string;
            };
          };
        } catch {
          return null;
        }
      })()
    : null;

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ??
        `Model request failed with status ${response.status}`,
    );
  }

  if (!payload) {
    throw new Error("Model returned a non-JSON response");
  }

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

export async function parseResponsePayload(response: Response): Promise<ChatCompletionsPayload> {
  const rawBody = await response.text();

  let payload: ChatCompletionsPayload | null = null;

  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody) as ChatCompletionsPayload;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ??
        `Chat request failed with status ${response.status}`,
    );
  }

  if (!payload) {
    throw new Error("Chat request returned a non-JSON response");
  }

  return payload;
}

export function buildChatCompletionsUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("chat/completions", normalizedBaseUrl).toString();
}
