export function normalizeFlagValue(value) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function isEnabled(value) {
  const normalized = normalizeFlagValue(value);
  return normalized === "1" || normalized === "true";
}

export function isDisabled(value) {
  const normalized = normalizeFlagValue(value);
  return normalized === "0" || normalized === "false";
}
