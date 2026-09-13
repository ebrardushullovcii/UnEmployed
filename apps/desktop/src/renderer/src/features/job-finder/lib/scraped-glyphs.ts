/**
 * Emoji and pictographs a job site prints inside text this app then quotes
 * back: a colour location pin before a place, a flag beside a country, a
 * sparkle inside a source label that later reaches a Needs-you instruction.
 *
 * Only symbol and pictograph code points are listed. No letter of any script
 * falls in these ranges, so Cyrillic, Arabic, Greek, Hebrew and CJK names and
 * place names pass through exactly as written.
 */
const PICTOGRAPH_GLYPH_PATTERN =
  // Written as alternatives rather than one class: variation selectors, the
  // zero-width joiner and the keycap mark are combining characters, and a
  // character class mixing them with base characters is misleading.
  /[\u{1F000}-\u{1FAFF}]|[\u2600-\u27BF]|[\u2B00-\u2BFF]|[\u203C\u2049\u2122\u2139\u2934\u2935\u3030\u303D\u3297\u3299]|\uFE0E|\uFE0F|\u200D|\u20E3/gu;

/**
 * Removes emoji and pictographs from quoted site text and settles the space
 * they leave behind. Text that was nothing but glyphs is returned unchanged
 * rather than emptied, so a line never silently disappears.
 */
export function stripScrapedGlyphs(value: string): string {
  const stripped = value
    .replace(PICTOGRAPH_GLYPH_PATTERN, " ")
    .replace(/[ \t]{2,}/gu, " ")
    .trim();
  if (stripped === value) return value;
  return stripped.length > 0 ? stripped : value;
}
