import type { EvalHttpCapture } from "./contracts";

export class CapturedModelRunError extends Error {
  readonly captures: readonly EvalHttpCapture[];
  override readonly cause: unknown;

  constructor(cause: unknown, captures: readonly EvalHttpCapture[]) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "CapturedModelRunError";
    this.cause = cause;
    this.captures = captures;
  }
}

function unwrapJsonText(value: string): unknown {
  const trimmed = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

export function parseLastCapturedModelJson(
  captures: readonly EvalHttpCapture[],
): unknown {
  const responseBody = captures.at(-1)?.responseBody;
  if (!responseBody) return null;
  const responsePayload = unwrapJsonText(responseBody);
  if (
    responsePayload === null ||
    typeof responsePayload !== "object" ||
    Array.isArray(responsePayload)
  ) {
    return responsePayload;
  }
  const record = responsePayload as Record<string, unknown>;
  if (Array.isArray(record.output)) {
    for (const outputItem of record.output) {
      if (
        outputItem === null ||
        typeof outputItem !== "object" ||
        Array.isArray(outputItem)
      ) {
        continue;
      }
      const content = (outputItem as Record<string, unknown>).content;
      if (!Array.isArray(content)) continue;
      for (const contentItem of content) {
        if (
          contentItem !== null &&
          typeof contentItem === "object" &&
          !Array.isArray(contentItem)
        ) {
          const text = (contentItem as Record<string, unknown>).text;
          if (typeof text === "string") {
            const parsed = unwrapJsonText(text);
            if (parsed !== null) return parsed;
          }
        }
      }
    }
  }
  if (Array.isArray(record.choices)) {
    for (const choice of record.choices) {
      if (
        choice === null ||
        typeof choice !== "object" ||
        Array.isArray(choice)
      ) {
        continue;
      }
      const message = (choice as Record<string, unknown>).message;
      if (
        message === null ||
        typeof message !== "object" ||
        Array.isArray(message)
      ) {
        continue;
      }
      const content = (message as Record<string, unknown>).content;
      if (typeof content === "string") {
        const parsed = unwrapJsonText(content);
        if (parsed !== null) return parsed;
      }
    }
  }
  return null;
}

export function parseCapturedModelContribution(
  capture: EvalHttpCapture,
): unknown {
  const parsedJson = parseLastCapturedModelJson([capture]);
  if (parsedJson !== null) return parsedJson;
  if (!capture.responseBody) return null;
  const responsePayload = unwrapJsonText(capture.responseBody);
  if (
    responsePayload === null ||
    typeof responsePayload !== "object" ||
    Array.isArray(responsePayload)
  ) {
    return null;
  }
  const record = responsePayload as Record<string, unknown>;
  const assistantTexts: string[] = [];
  const toolCalls: Array<{ name: string; arguments: unknown }> = [];
  if (Array.isArray(record.output)) {
    for (const outputItem of record.output) {
      if (
        outputItem === null ||
        typeof outputItem !== "object" ||
        Array.isArray(outputItem)
      ) {
        continue;
      }
      const item = outputItem as Record<string, unknown>;
      if (item.type === "function_call" && typeof item.name === "string") {
        const rawArguments = item.arguments;
        toolCalls.push({
          name: item.name,
          arguments:
            typeof rawArguments === "string"
              ? (unwrapJsonText(rawArguments) ?? rawArguments)
              : rawArguments,
        });
      }
      if (!Array.isArray(item.content)) continue;
      for (const contentItem of item.content) {
        if (
          contentItem !== null &&
          typeof contentItem === "object" &&
          !Array.isArray(contentItem)
        ) {
          const text = (contentItem as Record<string, unknown>).text;
          if (typeof text === "string" && text.trim().length > 0) {
            assistantTexts.push(text.trim());
          }
        }
      }
    }
  }
  return assistantTexts.length > 0 || toolCalls.length > 0
    ? { assistantTexts, toolCalls }
    : null;
}

function serializeBody(body: BodyInit | null | undefined): string {
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof FormData) {
    return JSON.stringify(
      Array.from(body.entries()).map(([key, value]) => [
        key,
        typeof value === "string"
          ? value
          : `[file name=${value.name} size=${value.size}]`,
      ]),
    );
  }
  if (body instanceof Blob) return `[blob size=${body.size} type=${body.type}]`;
  if (body instanceof ArrayBuffer)
    return `[arraybuffer byteLength=${body.byteLength}]`;
  if (ArrayBuffer.isView(body))
    return `[arraybuffer-view byteLength=${body.byteLength}]`;
  if (body === null || body === undefined) return "";
  return `[${body.constructor.name}]`;
}

function sanitizeUrl(input: string | URL | Request): string {
  const raw =
    input instanceof Request
      ? input.url
      : input instanceof URL
        ? input.toString()
        : input;
  const url = new URL(raw);
  url.username = "";
  url.password = "";
  return url.toString();
}

export async function withCapturedModelFetch<T>(input: {
  endpointPrefix: string;
  run: () => Promise<T>;
}): Promise<{ result: T; captures: readonly EvalHttpCapture[] }> {
  const originalFetch = globalThis.fetch;
  const captures: EvalHttpCapture[] = [];
  let sequence = 0;

  globalThis.fetch = (async (fetchInput, init) => {
    const url = sanitizeUrl(fetchInput);
    if (!url.startsWith(input.endpointPrefix)) {
      return originalFetch(fetchInput, init);
    }

    const currentSequence = ++sequence;
    const startedAt = new Date().toISOString();
    const startedAtMs = performance.now();
    const requestBody = serializeBody(init?.body);

    try {
      const response = await originalFetch(fetchInput, init);
      const responseBody = await response.clone().text();
      captures.push({
        sequence: currentSequence,
        startedAt,
        durationMs: Math.max(0, performance.now() - startedAtMs),
        url,
        method: init?.method ?? "GET",
        requestBody,
        responseStatus: response.status,
        responseBody,
        error: null,
      });
      return response;
    } catch (error) {
      captures.push({
        sequence: currentSequence,
        startedAt,
        durationMs: Math.max(0, performance.now() - startedAtMs),
        url,
        method: init?.method ?? "GET",
        requestBody,
        responseStatus: null,
        responseBody: null,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }) as typeof fetch;

  try {
    try {
      return { result: await input.run(), captures };
    } catch (error) {
      throw new CapturedModelRunError(error, captures);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}
