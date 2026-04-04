export function normalizeText(value: string): string {
  return value
    .replace(/(^|[^a-z0-9])c\s*\+\s*\+(?=$|[^a-z0-9])/gi, "$1cplusplus")
    .replace(/(^|[^a-z0-9])c\s*#(?=$|[^a-z0-9])/gi, "$1csharp")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenize(value: string): string[] {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

export function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();

  return values.flatMap((value) => {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return [];
    }

    const key = trimmedValue.toLowerCase();

    if (seen.has(key)) {
      return [];
    }

    seen.add(key);
    return [trimmedValue];
  });
}

export function createUniqueId(prefix: string): string {
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  return `${prefix}_${suffix}`;
}

