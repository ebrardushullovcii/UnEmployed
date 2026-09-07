/**
 * Page-owned reads during unauthorized preparation.
 *
 * The prepare-only guard blocks every mutating request. A page still has to
 * load itself: a form definition, a language file, a module manifest, or the
 * GraphQL queries a single-page application uses for all of its reads. Those
 * are allowed by shape, and refused the moment they would carry a value that
 * is currently in a form field, which is the only way a read could send a
 * prepared answer. The in-page guard mirrors this logic verbatim because it
 * is serialized into the page and cannot import.
 */
const SAFE_READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function normalizeRequestMethod(value: string | null | undefined) {
  return (value || "GET").trim().toUpperCase() || "GET";
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** True when the text contains any prepared value (3+ characters, trimmed). */
export function carriesPreparedValue(
  text: string | null | undefined,
  preparedValues: readonly string[],
): boolean {
  if (!text) return false;
  const haystacks = [text, safeDecode(text)];
  return preparedValues.some((value) => {
    const needle = value.trim();
    return (
      needle.length >= 3 &&
      haystacks.some((haystack) => haystack.includes(needle))
    );
  });
}

/**
 * A GraphQL document whose every operation is a query. Mutations and
 * subscriptions, batched or not, are never reads.
 */
export function isGraphQlReadBody(
  bodyText: string | null | undefined,
): boolean {
  if (!bodyText || bodyText.length > 65_536) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return false;
  }
  const operations = Array.isArray(parsed) ? parsed : [parsed];
  if (operations.length === 0) return false;
  return operations.every((operation) => {
    if (typeof operation !== "object" || operation === null) return false;
    const query = (operation as { query?: unknown }).query;
    if (typeof query !== "string") return false;
    const document = query.replace(/#[^\n]*/g, " ").trim();
    return (
      /^(?:query\b|\{)/u.test(document) &&
      !/\b(?:mutation|subscription)\b/u.test(document)
    );
  });
}

export interface PageOwnedReadRequest {
  method: string;
  url: string | null;
  bodyText?: string | null;
  preparedValues: readonly string[];
}

/** Whether a fetch or XHR is a page-owned read that carries nothing prepared. */
export function isPageOwnedReadRequest(input: PageOwnedReadRequest): boolean {
  const method = normalizeRequestMethod(input.method);
  if (SAFE_READ_METHODS.has(method)) {
    return !carriesPreparedValue(input.url, input.preparedValues);
  }
  if (method === "POST" && isGraphQlReadBody(input.bodyText)) {
    return (
      !carriesPreparedValue(input.url, input.preparedValues) &&
      !carriesPreparedValue(input.bodyText, input.preparedValues)
    );
  }
  return false;
}
