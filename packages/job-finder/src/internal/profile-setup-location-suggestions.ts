/**
 * A home address and a job-search location are different things. Resume
 * extraction reads the address line at the top of a CV, so a suggested
 * preferred search location can arrive carrying a postal code — proposing
 * "Cedar Park, TX 78613" as a place to look for work. Job locations do not
 * carry postal codes, so the trailing postal token is removed before the
 * suggestion is shown or applied.
 *
 * The rule is deliberately conservative: only a trailing token that is clearly
 * a postal code (digits, or digits with a ZIP+4 suffix) is dropped, and only
 * when other location text survives.
 */

const TRAILING_POSTAL_CODE = /[\s,]+\d{4,6}(?:-\d{3,4})?$/;

function stripTrailingPostalCode(value: string): string {
  const trimmed = value.trim();
  const stripped = trimmed.replace(TRAILING_POSTAL_CODE, "").trim();
  // Never turn a location into an empty string: a value that is only a postal
  // code stays exactly as imported so nothing is silently invented or lost.
  return stripped.length > 0 ? stripped.replace(/[\s,]+$/, "") : trimmed;
}

/** True for the imported field whose value is a job-search location list. */
export function isSearchLocationCandidateTarget(target: {
  section: string;
  key: string;
}): boolean {
  return target.section === "search_preferences" && target.key === "locations";
}

/**
 * Normalizes an imported preferred-location value (a string or a list of
 * strings) by removing trailing postal codes. Any other value shape is
 * returned unchanged.
 */
export function sanitizeSearchLocationCandidateValue<TValue>(
  value: TValue,
): TValue {
  if (typeof value === "string") {
    return stripTrailingPostalCode(value) as TValue;
  }

  if (Array.isArray(value)) {
    return value.map((entry: unknown) =>
      typeof entry === "string" ? stripTrailingPostalCode(entry) : entry,
    ) as TValue;
  }

  return value;
}
