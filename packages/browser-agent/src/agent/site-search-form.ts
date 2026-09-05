import type { Page } from "playwright";

/**
 * A job site's own search box, read generically from the page: the form's GET
 * action, the text input that carries the query, and any hidden inputs the
 * form submits alongside it. No board is named anywhere here (ADR 0007); this
 * is ordinary HTML form semantics.
 */
export interface SiteSearchForm {
  /** Absolute URL the form submits to. */
  actionUrl: string;
  /** Name of the text input that carries the query. */
  queryParam: string;
  /** Hidden inputs submitted with the query, as [name, value]. */
  hiddenParams: Array<[string, string]>;
  /** What made this input look like a search box, for the run log. */
  evidence: string;
}

const QUERY_PARAM_NAMES = new Set([
  "q",
  "s",
  "search",
  "query",
  "keyword",
  "keywords",
  "k",
  "kw",
  "what",
  "term",
  "terms",
  "text",
  "title",
  "job",
  "jobs",
  "position",
  "role",
]);

const SEARCH_HINT_PATTERN =
  /search|find|kërko|kerko|suche|buscar|recherch|cerca|zoek|szukaj|поиск|søk|sök|haku|keresés|hledat|caută|cauta|traži|trazi|arama|検索|搜索/iu;

interface ScannedSearchForm {
  action: string;
  method: string;
  queryParam: string;
  hiddenParams: Array<[string, string]>;
  evidence: string;
  score: number;
}

/**
 * Runs inside the page. Kept self-contained because Playwright serializes it.
 */
function scanSiteSearchForms(): ScannedSearchForm[] {
  const results: ScannedSearchForm[] = [];
  const hint =
    /search|find|kërko|kerko|suche|buscar|recherch|cerca|zoek|szukaj|поиск|søk|sök|haku|keresés|hledat|caută|cauta|traži|trazi|arama|検索|搜索/i;
  const knownNames = new Set([
    "q",
    "s",
    "search",
    "query",
    "keyword",
    "keywords",
    "k",
    "kw",
    "what",
    "term",
    "terms",
    "text",
    "title",
    "job",
    "jobs",
    "position",
    "role",
  ]);
  const forms = Array.from(document.querySelectorAll("form"));
  for (const form of forms) {
    const method = (form.getAttribute("method") ?? "get").trim().toLowerCase();
    if (method !== "get") {
      continue;
    }
    const inputs = Array.from(
      form.querySelectorAll<HTMLInputElement>(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="password"]):not([type="email"])',
      ),
    );
    for (const input of inputs) {
      const name = (input.getAttribute("name") ?? "").trim();
      if (!name) {
        continue;
      }
      const type = (input.getAttribute("type") ?? "text").toLowerCase();
      const placeholder = input.getAttribute("placeholder") ?? "";
      const aria = input.getAttribute("aria-label") ?? "";
      const label = input.id
        ? (document.querySelector(`label[for="${input.id}"]`)?.textContent ??
          "")
        : "";
      const evidence: string[] = [];
      let score = 0;
      if (type === "search") {
        score += 3;
        evidence.push("type=search");
      }
      if (knownNames.has(name.toLowerCase())) {
        score += 3;
        evidence.push(`name=${name}`);
      }
      if (hint.test(placeholder)) {
        score += 2;
        evidence.push(`placeholder="${placeholder.trim().slice(0, 40)}"`);
      }
      if (hint.test(aria) || hint.test(label)) {
        score += 2;
        evidence.push("labelled as search");
      }
      if (hint.test(form.getAttribute("role") ?? "") || hint.test(form.id)) {
        score += 1;
      }
      if (score < 3) {
        continue;
      }
      const hiddenParams = Array.from(
        form.querySelectorAll<HTMLInputElement>('input[type="hidden"][name]'),
      )
        .map(
          (hidden) =>
            [hidden.getAttribute("name") ?? "", hidden.value ?? ""] as [
              string,
              string,
            ],
        )
        .filter(([hiddenName]) => hiddenName.length > 0);
      results.push({
        action: form.getAttribute("action") ?? "",
        method,
        queryParam: name,
        hiddenParams,
        evidence: evidence.join(", "),
        score,
      });
    }
  }
  return results.sort((left, right) => right.score - left.score);
}

/**
 * Finds the page's site-search form, or null when the page offers none the
 * scanner recognizes. Only GET forms qualify: their results have a URL the
 * run can open, record and revisit.
 */
export async function detectSiteSearchForm(
  page: Page,
): Promise<SiteSearchForm | null> {
  let scanned: ScannedSearchForm[];
  try {
    scanned = await page.evaluate(scanSiteSearchForms);
  } catch {
    return null;
  }
  const pageUrl = safeUrl(page.url());
  for (const candidate of scanned) {
    const actionUrl = resolveActionUrl(candidate.action, pageUrl);
    if (!actionUrl) {
      continue;
    }
    return {
      actionUrl,
      queryParam: candidate.queryParam,
      hiddenParams: candidate.hiddenParams,
      evidence: candidate.evidence,
    };
  }
  return null;
}

function safeUrl(value: string | null | undefined): string {
  try {
    return value ? new URL(value).toString() : "";
  } catch {
    return "";
  }
}

function resolveActionUrl(action: string, pageUrl: string): string | null {
  try {
    const trimmed = action.trim();
    // An empty action submits to the current page; a relative one resolves
    // against it. Anything that is not http(s) is not a page we can open.
    const resolved = new URL(trimmed.length > 0 ? trimmed : ".", pageUrl);
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") {
      return null;
    }
    resolved.hash = "";
    return resolved.toString();
  } catch {
    return null;
  }
}

/** The results URL the form would open for one query. */
export function buildSiteSearchUrl(
  form: SiteSearchForm,
  query: string,
): string {
  const url = new URL(form.actionUrl);
  for (const [name, value] of form.hiddenParams) {
    if (!url.searchParams.has(name)) {
      url.searchParams.set(name, value);
    }
  }
  url.searchParams.set(form.queryParam, query.trim());
  return url.toString();
}

/**
 * The queries worth sending, most specific first: each saved target role
 * (slash-alternatives split, near-duplicates dropped), then each role without
 * its seniority words, then the one domain word the roles share. Many boards
 * match the whole phrase literally, so "Senior Software Engineer" finds two
 * postings while "Software Engineer" finds the team-lead and full-stack roles
 * and "Software" finds the rest of the engineering inventory. Relevance is
 * judged downstream from the cards themselves; the searches only need to
 * surface them.
 */
export function buildSiteSearchQueries(
  targetRoles: readonly string[],
  limit = 6,
): string[] {
  const seen = new Set<string>();
  const queries: string[] = [];
  const push = (value: string): boolean => {
    const cleaned = value.replace(/\s+/g, " ").trim();
    const key = cleaned.toLowerCase();
    if (!key || seen.has(key)) {
      return queries.length >= limit;
    }
    seen.add(key);
    queries.push(cleaned);
    return queries.length >= limit;
  };
  const expandedRoles = targetRoles.flatMap((role) =>
    role.includes("/") ? expandSlashAlternatives(role) : [role.trim()],
  );
  for (const role of expandedRoles) {
    if (push(role)) {
      return queries;
    }
  }
  for (const role of expandedRoles) {
    const stripped = role
      .split(/\s+/u)
      .filter((word) => !SENIORITY_WORDS.has(word.toLowerCase()))
      .join(" ");
    if (stripped.length > 0 && push(stripped)) {
      return queries;
    }
  }
  const shared = sharedDomainWord(expandedRoles);
  if (shared) {
    push(shared);
  }
  return queries;
}

const SENIORITY_WORDS = new Set([
  "senior",
  "junior",
  "staff",
  "lead",
  "principal",
  "associate",
  "mid",
  "mid-level",
  "entry",
  "entry-level",
  "sr",
  "sr.",
  "jr",
  "jr.",
  "i",
  "ii",
  "iii",
  "iv",
]);

/**
 * The word that appears in every target role once seniority words are gone
 * and the role noun itself (the last word: engineer, developer, manager) is
 * set aside. "Software" for a software engineer who would also take a software
 * developer title; null when the roles share nothing.
 */
function sharedDomainWord(roles: readonly string[]): string | null {
  const wordSets = roles
    .map((role) =>
      role
        .split(/\s+/u)
        .filter((word) => word.length >= 3)
        .filter((word) => !SENIORITY_WORDS.has(word.toLowerCase()))
        .filter((word) => !ROLE_STOP_TOKENS.has(word.toLowerCase())),
    )
    .filter((words) => words.length >= 2)
    .map((words) => words.slice(0, -1));
  if (wordSets.length === 0) {
    return null;
  }
  const counts = new Map<string, { display: string; count: number }>();
  for (const words of wordSets) {
    for (const word of new Set(words.map((value) => value.toLowerCase()))) {
      const entry = counts.get(word) ?? {
        display: words.find((value) => value.toLowerCase() === word) ?? word,
        count: 0,
      };
      entry.count += 1;
      counts.set(word, entry);
    }
  }
  const shared = Array.from(counts.values()).filter(
    (entry) => entry.count === wordSets.length,
  );
  return shared.length === 1 ? (shared[0]?.display ?? null) : null;
}

function expandSlashAlternatives(role: string): string[] {
  // "Staff/Senior Software Engineer" -> ["Staff Software Engineer",
  // "Senior Software Engineer"]; "Frontend/Backend Developer" likewise.
  const match = role.match(/^(\S+)\/(\S+)\s+(.+)$/u);
  if (!match) {
    return [role.trim()];
  }
  const [, first, second, rest] = match;
  return [`${first} ${rest}`.trim(), `${second} ${rest}`.trim()];
}

function roleTokenSet(targetRoles: readonly string[]): Set<string> {
  return new Set(
    targetRoles
      .flatMap((role) => role.toLowerCase().split(/[^a-z0-9+#]+/u))
      .filter((token) => token.length >= 3 && !ROLE_STOP_TOKENS.has(token)),
  );
}

/** Whether one title shares a meaningful word with any target role. */
export function titleRelatesToRoles(
  title: string,
  targetRoles: readonly string[],
): boolean {
  const roleTokens = roleTokenSet(targetRoles);
  if (roleTokens.size === 0) {
    return true;
  }
  return title
    .toLowerCase()
    .split(/[^a-z0-9+#]+/u)
    .some((token) => roleTokens.has(token));
}

/**
 * Whether the recognized cards look like an unfiltered feed rather than the
 * results the user wanted: fewer than a fifth of the titles share a meaningful
 * word with any target role. A board's front page lists every new posting, so
 * a handful of related titles among many unrelated ones is exactly that feed,
 * and the site's own search is the better source.
 */
export function titlesLookUnrelatedToRoles(
  titles: readonly string[],
  targetRoles: readonly string[],
): boolean {
  if (titles.length === 0 || targetRoles.length === 0) {
    return false;
  }
  if (roleTokenSet(targetRoles).size === 0) {
    return false;
  }
  const related = titles.filter((title) =>
    titleRelatesToRoles(title, targetRoles),
  ).length;
  return related / titles.length < 0.2;
}

const ROLE_STOP_TOKENS = new Set([
  "senior",
  "junior",
  "staff",
  "lead",
  "principal",
  "the",
  "and",
  "for",
  "with",
]);

export { QUERY_PARAM_NAMES, SEARCH_HINT_PATTERN };
