export function jobDescriptionToText(
  value: string | null | undefined,
  preserveLineBreaks = false,
): string {
  if (!value) {
    return "";
  }

  const parser = new DOMParser();
  const normalize = (text: string): string =>
    preserveLineBreaks
      ? text
          .replace(/[^\S\n]+/g, " ")
          .replace(/ *\n */g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim()
      : text.replace(/\s+/g, " ").trim();
  const prepareMarkup = (text: string): string =>
    preserveLineBreaks
      ? text.replace(/<br\s*\/?\s*>|<\/(?:p|div|li|ul|ol|h[1-6])\s*>/gi, "\n\n")
      : text;
  const firstPass =
    parser.parseFromString(prepareMarkup(value), "text/html").body
      .textContent ?? "";
  const trimmedFirstPass = normalize(firstPass);

  // Some sources persist HTML as escaped text (&lt;div...&gt;). Parse once more
  // when the decoded text still looks like markup so the UI shows readable copy.
  if (/(?:&lt;[a-z]|&lt;|&gt;|&#\d+;|&#x[0-9a-f]+;)/i.test(value)) {
    const normalizedMarkupPass = trimmedFirstPass.replace(/></g, "> <");

    return normalize(
      parser.parseFromString(prepareMarkup(normalizedMarkupPass), "text/html")
        .body.textContent ?? "",
    );
  }

  return trimmedFirstPass;
}
