export const TAILORED_ASSET_FAILURE_MESSAGE_MAX_LENGTH = 400;

const LABELED_SECRET_PATTERN =
  /\b(api[-_]?key|apikey|access[-_]?token|refresh[-_]?token|auth[-_]?token|client[-_]?secret|secret|password|authorization)((?:\s*[:=])\s*)\S+/gi;
const REDACTED_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\bBearer\s+\S+/gi,
];

export function sanitizeTailoredAssetFailureMessage(
  error: unknown,
): string | null {
  const rawDetail =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message || error.name
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : String(error);
  let sanitized = Array.from(rawDetail, (character) =>
    character.charCodeAt(0) < 32 ? " " : character,
  )
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  for (const pattern of REDACTED_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[redacted]");
  }
  sanitized = sanitized.replace(LABELED_SECRET_PATTERN, "$1$2[redacted]");

  if (sanitized.length > TAILORED_ASSET_FAILURE_MESSAGE_MAX_LENGTH) {
    sanitized = `${sanitized.slice(
      0,
      TAILORED_ASSET_FAILURE_MESSAGE_MAX_LENGTH - 1,
    )}…`;
  }

  return sanitized.length > 0 ? sanitized : null;
}
