/**
 * The locale native date and date-time inputs must format with.
 *
 * Every rendered date in Job Finder is formatted through
 * `Intl.DateTimeFormat(undefined, …)`, so a native input left on the browser's
 * own default can print a day-first placeholder ("dd.mm.yyyy, --:-- --") beside
 * dates the same screen renders as "Sep 3". Chromium formats a date input by
 * its inherited `lang`, so tagging these inputs with the resolved Intl locale
 * keeps one date convention per workspace.
 */
export function getJobFinderDateInputLocale(): string | undefined {
  try {
    const locale = new Intl.DateTimeFormat().resolvedOptions().locale;
    return locale && locale.trim().length > 0 ? locale : undefined;
  } catch {
    return undefined;
  }
}
