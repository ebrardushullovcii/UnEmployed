/**
 * Shape rules for the two short listing fields a person reads as facts: who is
 * hiring and where the work is.
 *
 * A whole source once stored the employer as "United States" and the location
 * as "Security Remote in", because the extraction read two cells in the wrong
 * order and nothing downstream asked whether the values could possibly be what
 * they claimed to be. Fixing that per board would make every new source a code
 * change (ADR 0007), so the rules here are about the SHAPE of the text:
 *
 * - a string that is a place is never an employer;
 * - a fragment that trails off mid-phrase is never a location.
 *
 * No board, domain or provider name appears here, and none may.
 */

/**
 * Words that name where work happens rather than who is hiring. Generic
 * geography and work-mode vocabulary, not a source list.
 */
const PLACE_WORDS = new Set([
  "anywhere",
  "distributed",
  "elsewhere",
  "global",
  "globally",
  "hybrid",
  "international",
  "nationwide",
  "offsite",
  "onsite",
  "remote",
  "telecommute",
  "usa",
  "us",
  "uk",
  "worldwide",
]);

/**
 * Multi-word country-shaped names that turn up as a whole employer cell. Kept
 * deliberately short: the structural tests below catch the rest.
 */
const PLACE_PHRASES = new Set([
  "united states",
  "united states of america",
  "united kingdom",
  "great britain",
  "european union",
  "north america",
  "south america",
  "latin america",
  "middle east",
  "asia pacific",
  "remote us",
  "remote usa",
  "remote united states",
]);

/** "Chicago, IL" / "Toronto, ON" / "Austin, TX, US" — a place, not a company. */
const CITY_REGION_PATTERN =
  /^[\p{L}][\p{L}\p{M}.'’\- ]*,\s*([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?(?:\s*,\s*[\p{L}][\p{L}\p{M}.'’\- ]*)?$/u;

const KNOWN_REGION_CODES = new Set([
  "AB",
  "AK",
  "AL",
  "AR",
  "AS",
  "AZ",
  "BC",
  "CA",
  "CO",
  "CT",
  "DC",
  "DE",
  "FL",
  "GA",
  "GU",
  "HI",
  "IA",
  "ID",
  "IL",
  "IN",
  "KS",
  "KY",
  "LA",
  "MA",
  "MB",
  "MD",
  "ME",
  "MI",
  "MN",
  "MO",
  "MP",
  "MS",
  "MT",
  "NB",
  "NC",
  "ND",
  "NE",
  "NH",
  "NJ",
  "NL",
  "NM",
  "NS",
  "NT",
  "NU",
  "NV",
  "NY",
  "OH",
  "OK",
  "ON",
  "OR",
  "PA",
  "PE",
  "PR",
  "QC",
  "RI",
  "SC",
  "SD",
  "SK",
  "TN",
  "TX",
  "UM",
  "UT",
  "VA",
  "VI",
  "VT",
  "WA",
  "WI",
  "WV",
  "WY",
  "YT",
]);

/** ISO country names, generated once so a one-word country is still evidence. */
const ISO_COUNTRY_CODES =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW XK".split(
    " ",
  );

const countryDisplayNames = new Intl.DisplayNames(["en"], { type: "region" });
const COUNTRY_NAMES = new Set(
  ISO_COUNTRY_CODES.flatMap((code) => {
    const name = countryDisplayNames.of(code);
    return name && name !== code ? [comparable(name)] : [];
  }),
);
for (const alias of [
  "czech republic",
  "england",
  "northern ireland",
  "scotland",
  "south korea",
  "u k",
  "u s",
  "u s a",
  "uk",
  "us",
  "usa",
  "wales",
]) {
  COUNTRY_NAMES.add(alias);
}

const LEGAL_ENTITY_SUFFIXES = new Set([
  "ag",
  "bv",
  "co",
  "corp",
  "gmbh",
  "inc",
  "llc",
  "llp",
  "lp",
  "ltd",
  "plc",
  "pty",
  "pty ltd",
  "s a",
  "srl",
]);

const COMPANY_SHAPED_TAIL_PATTERN =
  /(?:&|\b(?:associates|company|group|holdings|industries|logistics|partners|services|solutions|systems|technologies)\b)/iu;

function comparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Whether this text names a place rather than an organisation. Used to refuse
 * a place-shaped value in the employer field; it is deliberately conservative,
 * because a wrong "yes" hides a real company name.
 */
export function looksLikePlaceValue(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return false;
  }
  const key = comparable(trimmed);
  if (!key) {
    return false;
  }
  if (PLACE_PHRASES.has(key)) {
    return true;
  }
  const words = key.split(" ");
  // Every word is place or work-mode vocabulary ("Remote", "Remote US",
  // "Hybrid Anywhere").
  if (words.every((word) => PLACE_WORDS.has(word))) {
    return true;
  }

  const commaParts = trimmed.split(/\s*,\s*/u);
  if (commaParts.length < 2) {
    return false;
  }
  const tail = commaParts.at(-1) ?? "";
  const comparableTail = comparable(tail);
  const companyTailParts = commaParts.slice(1);
  if (
    companyTailParts.some((part) => {
      const regionCode = part.trim();
      return (
        LEGAL_ENTITY_SUFFIXES.has(comparable(regionCode)) &&
        !(/^[A-Z]{2}$/u.test(regionCode) && KNOWN_REGION_CODES.has(regionCode))
      );
    }) ||
    COMPANY_SHAPED_TAIL_PATTERN.test(trimmed)
  ) {
    return false;
  }
  const cityRegion = CITY_REGION_PATTERN.exec(trimmed);
  if (
    cityRegion &&
    (KNOWN_REGION_CODES.has(cityRegion[1] ?? "") || Boolean(cityRegion[2]))
  ) {
    return true;
  }
  if (COUNTRY_NAMES.has(comparableTail)) {
    return true;
  }
  return false;
}

/**
 * Words a location value can never end on. A cell that stops after one of
 * these was cut mid-phrase ("Security Remote in"), so what follows — the part
 * that actually named the place — was never captured.
 */
const DANGLING_TAIL_WORDS = new Set([
  "and",
  "at",
  "by",
  "for",
  "from",
  "in",
  "near",
  "of",
  "on",
  "or",
  "the",
  "to",
  "within",
]);

/**
 * Whether this text is a fragment rather than a place: it trails off on a
 * preposition or conjunction, or it is nothing but punctuation.
 */
export function isTruncatedLocationFragment(
  value: string | null | undefined,
): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return false;
  }
  const originalWords = trimmed.match(/[\p{L}\p{N}]+/gu) ?? [];
  const last = originalWords.at(-1);
  if (!last) {
    return false;
  }
  // Preserve case until this check. "ON", "IN" and "OR" are region codes in
  // a complete location, while lowercase "in" and "or" are dangling words.
  if (
    /^[A-Z]{2}$/u.test(last) &&
    (KNOWN_REGION_CODES.has(last) || /,\s*[A-Z]{2}\s*$/u.test(trimmed))
  ) {
    return false;
  }
  // A single preposition on its own is a fragment; so is a value that ends on
  // one after other words.
  return DANGLING_TAIL_WORDS.has(last.toLowerCase());
}

/**
 * How many distinct places one stored location value names.
 *
 * "Chicago, IL" is one place written the way people write places; splitting it
 * on the comma produced "2 locations" beside a panel reading "Chicago · IL".
 * A comma between a settlement and its region is part of one name; only an
 * explicit list separator — a slash, a pipe, a semicolon, or the word "or" —
 * starts a second place.
 */
export function splitListingLocations(
  value: string | null | undefined,
): string[] {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return [];
  }
  const seen = new Set<string>();
  const places: string[] = [];
  for (const part of trimmed.split(/\s*(?:[;/|]|\bor\b)\s*/iu)) {
    const place = part
      .replace(/\s+/gu, " ")
      .trim()
      .replace(/[,;·]+$/u, "");
    if (!place) {
      continue;
    }
    const key = comparable(place);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    places.push(place);
  }
  return places;
}

/**
 * Collapses a location value that repeats the same token.
 *
 * "Anywhere, Anywhere, Anywhere" is one place stated three times, and a
 * comparison sentence built from it read "Anywhere, Anywhere, Anywhere
 * compared with Philadelphia, PA: aligned." The repeats carry nothing, so the
 * sentence is built from the distinct parts in their original order.
 */
export function collapseRepeatedLocationTokens(
  value: string | null | undefined,
): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return "";
  }
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const raw of trimmed.split(/\s*[,·]\s*/u)) {
    const part = raw.replace(/\s+/gu, " ").trim();
    if (!part) {
      continue;
    }
    const key = comparable(part);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    parts.push(part);
  }
  return parts.length > 0 ? parts.join(", ") : trimmed;
}
