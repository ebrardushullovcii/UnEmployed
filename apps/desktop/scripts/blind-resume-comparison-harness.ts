import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";

// Blind original-vs-generated resume comparison harness (docs/TESTING.md,
// "Blind original-vs-generated resume comparison"): turns one supervisor-owned
// case set (synthetic today; the user's private CV plus real target jobs stay
// an external later input) into a blinded pairwise human-rating protocol.
//
// Commands:
//   init      validate the case file, compute hard gates, scaffold the sealed
//             supervisor work root plus the identity-free rater root
//   record    validate one filled rater record against the schema and rewrite
//             it back atomically (exclusive temp file -> rename, mode 0644)
//   aggregate verify the seal, every source/variant digest, every rater
//             record, lift the A/B blinding only here, and emit the aggregate
//
// Protocol guarantees enforced here:
//   - Hard gates before humans: factuality (every generated claim must be
//     supported by the original), numeric integrity (no invented numbers),
//     omissions (contact data plus declared critical anchors must survive),
//     and ATS parsing/structure (plain-text parseability of the generated
//     side). Any gate violation aborts init and nothing is ever shown to a
//     rater.
//   - Blinding: which variant is the original is decided per case from
//     sha256(seed:caseId), recorded only in the sealed manifest inside the
//     supervisor work root, and never printed. Rater-facing materials and
//     rater records speak only of variants A and B. Identity is joined back
//     exclusively at aggregate.
//   - Tamper evidence: the manifest carries a self-digest plus SHA-256 of
//     every source and rater-facing variant file; aggregate recomputes all of
//     them and refuses on any mismatch.
//   - Complete blinded ratings only: aggregation refuses records that are
//     missing, stale-bound, structurally incomplete, missing the forced
//     choice, or attempting to encode side identity. The mandatory original-
//     win control cases must be present and must actually be won by the
//     original, otherwise the run fails closed.
//   - Claim hygiene: no ATS score, callback, response-rate, screening, or
//     hiring-outcome claims may be encoded anywhere in protocol documents;
//     forbidden vocabulary keys are rejected outright.
//
// Self-contained plain-TypeScript validators (same style as
// blind-persona-evidence-harness.ts): no contracts export describes this
// protocol today. No network, no Electron; pure fs plus validation. All
// emitted text stays ASCII. Resume text is never logged: errors carry case
// IDs, key paths, digests, and counts only, and gate excerpts are capped
// short fragments stored solely in the supervisor-side manifest.

type JsonRecord = Record<string, unknown>;

export const BLIND_RESUME_COMPARISON_SCHEMA_VERSION = 1;

export const COMPARISON_MANIFEST_FILENAME =
  "blind-resume-comparison-manifest.json";

export const COMPARISON_AGGREGATE_FILENAME =
  "blind-resume-comparison-aggregate.json";

export const COMPARISON_SOURCES_DIRNAME = "sources";

export const COMPARISON_RATER_CASES_DIRNAME = "cases";

export const COMPARISON_RATER_RECORDS_DIRNAME = "rater-records";

export const COMPARISON_RATER_RECORD_TEMPLATE_FILENAME =
  "rater-record.template.json";

export const COMPARISON_KIND_MANIFEST = "blind-resume-comparison-manifest";
export const COMPARISON_KIND_CASE_BRIEF = "blind-resume-comparison-case-brief";
export const COMPARISON_KIND_RATER_RECORD =
  "blind-resume-comparison-rater-record";
export const COMPARISON_KIND_AGGREGATE = "blind-resume-comparison-aggregate";

/** Ordered top-level keys of one rater record; doubles as the canonical
 * on-disk serialization order. */
export const RATER_RECORD_KEYS = [
  "schemaVersion",
  "kind",
  "raterId",
  "manifestSha256",
  "raterNotes",
  "ratings",
] as const;

export type RaterRecordKey = (typeof RATER_RECORD_KEYS)[number];

/** Ordered keys of one per-case rating inside a rater record. */
export const RATING_KEYS = [
  "caseId",
  "credibility",
  "readability",
  "relevance",
  "specificity",
  "forcedChoice",
] as const;

export type RatingKey = (typeof RATING_KEYS)[number];

export const RATING_DIMENSIONS = [
  "credibility",
  "readability",
  "relevance",
  "specificity",
] as const;

export type RatingDimension = (typeof RATING_DIMENSIONS)[number];

export const VARIANT_SLOTS = ["A", "B"] as const;
export type VariantSlot = (typeof VARIANT_SLOTS)[number];

export const MIN_RATING_SCORE = 1;
export const MAX_RATING_SCORE = 5;

export const MAX_CASE_COUNT = 32;
export const MAX_CRITICAL_ANCHORS = 24;
export const MAX_TEXT_CHARACTERS = 60_000;
export const MIN_TEXT_CHARACTERS = 100;
export const MAX_JOB_CONTEXT_CHARACTERS = 300;
export const MAX_RATER_NOTES_CHARACTERS = 2000;
export const MAX_GATE_EXCERPTS = 8;
export const MAX_GATE_EXCERPT_CHARACTERS = 80;

// Hard-gate thresholds. Deliberately conservative floors: the gates exist to
// fail closed on obvious fabrications and unparseable structure, not to grade
// tailoring quality (that is the blinded human pairwise rating's job).
export const FACTUALITY_TOKEN_SUPPORT_THRESHOLD = 0.6;
export const FACTUALITY_MIN_CLAIM_TOKENS = 3;
export const ATS_MAX_LINE_LENGTH = 200;
export const ATS_MIN_SECTION_HEADERS = 2;
export const ATS_MIN_YEAR_MENTIONS = 2;

const caseIdPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const digestPattern = /^[a-f0-9]{64}$/u;
const slotPattern = /^[AB]$/u;

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "was",
  "were",
  "are",
  "our",
  "their",
  "his",
  "her",
  "its",
  "into",
  "onto",
  "across",
  "about",
  "over",
  "under",
  "who",
  "whom",
  "which",
  "while",
  "when",
  "where",
  "how",
  "all",
  "any",
  "both",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "than",
  "then",
  "them",
  "they",
  "those",
  "these",
  "upon",
  "per",
  "via",
  "also",
  "has",
  "have",
  "had",
  "being",
  "been",
  "will",
  "would",
  "can",
  "could",
]);

const NUMBER_WORDS: ReadonlyMap<string, string> = new Map([
  ["zero", "0"],
  ["one", "1"],
  ["two", "2"],
  ["three", "3"],
  ["four", "4"],
  ["five", "5"],
  ["six", "6"],
  ["seven", "7"],
  ["eight", "8"],
  ["nine", "9"],
  ["ten", "10"],
  ["eleven", "11"],
  ["twelve", "12"],
]);

/**
 * Vocabulary that must never appear as a structured key in any protocol
 * document: the protocol measures blinded human preference and deterministic
 * hard gates only. It makes no claims about applicant-tracking-system scores
 * or employer callbacks, and documents attempting to encode such claims are
 * refused outright.
 */
const FORBIDDEN_CLAIM_KEY_PATTERN =
  /(?:(?:ats|applicant[_-]?tracking)[_-]?(?:score|rating|rank|percent|percentage|probability|likelihood|match)|(?:callback|call_back)s?|response[_-]?rates?|screening[_-]?(?:score|rate|result)s?|interview[_-]?(?:invite|invites|rate|rates|offer|offers)|hire[_-]?(?:rate|probability|likelihood)|pass[_-]?through[_-]?rates?|shortlist(?:ing|ed)?[_-]?(?:rate|rates|probability))/iu;

/**
 * Tripwires for records trying to smuggle the unblinded mapping in through
 * free text (for example "A is the original"). Matched case-insensitively
 * against every string leaf of a rater record; normal comparative feedback
 * never matches these shapes.
 */
const IDENTITY_ASSERTION_PATTERNS: readonly RegExp[] = [
  /\bvariant[_ ]?[ab]\s+(?:is|was|=)\s+the\s+(?:original|generated|tailored|source|reference|resume)\b/iu,
  /\b[ab]\s+(?:is|was|=)\s+the\s+(?:original|generated|tailored|source|reference|resume)\b/iu,
  /\b(?:the\s+)?(?:original|generated|tailored|source)\s+(?:one\s+)?(?:is|was|=)\s+(?:variant[_ ]?)[ab]\b/iu,
];

export interface ComparisonCaseInput {
  caseId: string;
  isControl: boolean;
  jobContext: string;
  originalText: string;
  generatedText: string;
  criticalAnchors: string[];
}

export interface ComparisonCaseInputFile {
  cases: ComparisonCaseInput[];
  schemaVersion: typeof BLIND_RESUME_COMPARISON_SCHEMA_VERSION;
  seed: string;
}

export interface FactualityGateResult {
  fabricatedContactCount: number;
  passed: boolean;
  unsupportedClaimCount: number;
  /** Capped, whitespace-normalized fragments of unsupported generated
   * claims. Supervisor-side triage aid only; never shown to raters. */
  unsupportedClaimExcerpts: string[];
}

export interface NumericIntegrityGateResult {
  fabricatedNumberCount: number;
  fabricatedNumbers: string[];
  passed: boolean;
}

export interface OmissionsGateResult {
  missingAnchorCount: number;
  missingAnchors: string[];
  passed: boolean;
}

export interface AtsStructureGateResult {
  passed: boolean;
  /** Structural problem codes with positions only; never resume content. */
  problems: string[];
}

export interface HardGateEvaluation extends JsonRecord {
  atsStructure: AtsStructureGateResult;
  factuality: FactualityGateResult;
  numericIntegrity: NumericIntegrityGateResult;
  omissions: OmissionsGateResult;
  passed: boolean;
}

export interface ManifestCaseEntry {
  caseId: string;
  criticalAnchors: string[];
  hardGates: HardGateEvaluation;
  hardGatesPassed: boolean;
  isControl: boolean;
  jobContext: string;
  slots: Record<VariantSlot, "original" | "generated">;
  sourceDigests: Record<"generated" | "original", string>;
  variantDigests: Record<VariantSlot, string>;
}

export interface ComparisonManifest extends JsonRecord {
  caseCount: number;
  cases: ManifestCaseEntry[];
  controlCaseIds: string[];
  createdAtIso: string;
  kind: typeof COMPARISON_KIND_MANIFEST;
  manifestSha256: string;
  schemaVersion: typeof BLIND_RESUME_COMPARISON_SCHEMA_VERSION;
  seedSha256: string;
}

export interface RatingDimensionScores {
  A: number;
  B: number;
}

export interface CaseRating {
  caseId: string;
  credibility: RatingDimensionScores;
  forcedChoice: VariantSlot;
  readability: RatingDimensionScores;
  relevance: RatingDimensionScores;
  specificity: RatingDimensionScores;
}

export interface BlindRaterRecord {
  kind: typeof COMPARISON_KIND_RATER_RECORD;
  manifestSha256: string;
  raterId: string;
  raterNotes: string;
  ratings: CaseRating[];
  schemaVersion: typeof BLIND_RESUME_COMPARISON_SCHEMA_VERSION;
}

export interface InitBlindResumeComparisonOptions {
  casesFile: string;
  raterRoot: string;
  workRoot: string;
}

export interface InitBlindResumeComparisonOutcome {
  caseCount: number;
  controlCaseIds: string[];
  manifestPath: string;
  manifestSha256: string;
  raterCasesDir: string;
  raterRecordsDir: string;
  raterRoot: string;
  sourcesDir: string;
  workRoot: string;
}

export interface RecordBlindResumeComparisonOptions {
  file: string;
}

export interface RecordBlindResumeComparisonOutcome {
  bytes: number;
  forcedChoices: number;
  raterId: string;
  ratedCaseCount: number;
  recordPath: string;
}

export interface AggregateBlindResumeComparisonOptions {
  out: string | null;
  raterRoot: string;
  workRoot: string;
}

export interface AggregateRefusalRow {
  reason: string;
  subject: string;
}

export interface CaseAggregate {
  caseId: string;
  dimensionMeans: Record<
    RatingDimension,
    Record<"generated" | "original", number>
  >;
  forcedChoiceCounts: Record<"generated" | "original", number>;
  hardGatesPassed: boolean;
  isControl: boolean;
  raterCount: number;
  winner: "generated" | "original" | "tie";
}

export interface ComparisonAggregateOutput extends JsonRecord {
  caseCount: number;
  cases: CaseAggregate[];
  controlCaseIds: string[];
  controlsWonByOriginal: number;
  generatedAtIso: string;
  kind: typeof COMPARISON_KIND_AGGREGATE;
  manifestPath: string;
  manifestSha256: string;
  protocolGuarantees: {
    atsScoreAndCallbackClaimsForbidden: true;
    blindingLiftedOnlyHere: true;
    originalWinControlsRequired: true;
  };
  raterIds: string[];
  schemaVersion: typeof BLIND_RESUME_COMPARISON_SCHEMA_VERSION;
  warnings: string[];
}

export interface AggregateBlindResumeComparisonOutcome {
  aggregate: ComparisonAggregateOutput | null;
  aggregatePath: string | null;
  exitReasons: string[];
  failures: AggregateRefusalRow[];
  ok: boolean;
}

export type BlindResumeComparisonCliOptions =
  | {
      casesFile: string;
      command: "init";
      raterRoot: string;
      workRoot: string;
    }
  | { command: "record"; file: string }
  | {
      command: "aggregate";
      out: string | null;
      raterRoot: string;
      workRoot: string;
    };

function isPlainObject(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

/** Canonical serialization shared across the protocol: recursively key-sorted
 * JSON without whitespace. */
export function stableComparisonSerialization(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Serializes a value through a fixed top-level key order with a trailing
 * newline; used for scaffolds, manifests, and canonical record rewrites. */
function orderedJson(value: object, keys: readonly string[]): string {
  const source = value as JsonRecord;
  const ordered: JsonRecord = {};
  for (const key of keys) {
    ordered[key] = source[key];
  }
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** Atomic replacement write: exclusive temp file in the target directory
 * (wx never clobbers), explicit 0644, then rename over the target so readers
 * never observe a partial file. Makes no fsync durability claim. */
export async function writeFileAtomic0644(
  targetPath: string,
  content: string,
): Promise<void> {
  const directory = path.dirname(targetPath);
  const tempPath = path.join(
    directory,
    `.${path.basename(targetPath)}.tmp-${process.pid}-${randomUUID()}`,
  );
  let handle: FileHandle | undefined;
  try {
    handle = await open(tempPath, "wx", 0o644);
    await handle.writeFile(content, "utf8");
    await handle.chmod(0o644);
    await handle.close();
    handle = undefined;
    await rename(tempPath, targetPath);
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function parseJsonContent(
  content: string,
  label: string,
): Promise<JsonRecord> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`${label} is not valid JSON.`, { cause: error });
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
}

class ProtocolValidationError extends Error {
  readonly problems: string[];

  constructor(problems: readonly string[]) {
    super(
      `Blind resume comparison validation failed (${problems.length} problem(s)):\n- ${problems.join("\n- ")}`,
    );
    this.name = "ProtocolValidationError";
    this.problems = [...problems];
  }
}

function readNonEmptyString(
  source: JsonRecord,
  key: string,
  problems: string[],
): string {
  const raw = source[key];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    problems.push(`${key} must be a non-empty string.`);
    return "";
  }
  return raw;
}

function readBoolean(
  source: JsonRecord,
  key: string,
  problems: string[],
): boolean {
  const raw = source[key];
  if (typeof raw !== "boolean") {
    problems.push(`${key} must be a boolean.`);
    return false;
  }
  return raw;
}

function collectUnknownFieldProblems(
  source: JsonRecord,
  allowedKeys: readonly string[],
  label: string,
  problems: string[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) {
      problems.push(`${label} has unknown field: ${key}.`);
    }
  }
}

/** Walks every object key of an already-parsed value and refuses any key
 * from the forbidden claim vocabulary (ATS scores, callbacks, response or
 * hire rates, screening results). Only key paths are reported, never
 * values. */
export function collectForbiddenClaimKeyProblems(
  value: unknown,
  problems: string[],
  prefix = "",
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectForbiddenClaimKeyProblems(
        entry,
        problems,
        `${prefix}[${String(index)}]`,
      );
    });
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_CLAIM_KEY_PATTERN.test(key)) {
      problems.push(
        `${prefix}${key}: forbidden claim vocabulary; this protocol encodes no ATS-score, callback, response-rate, screening, or hiring-outcome claims.`,
      );
    }
    collectForbiddenClaimKeyProblems(entry, problems, `${prefix}${key}.`);
  }
}

/** True when a string leaf attempts to assert which variant is which. */
export function containsIdentityAssertion(value: string): boolean {
  return IDENTITY_ASSERTION_PATTERNS.some((pattern) => pattern.test(value));
}

function collectIdentityAssertionProblems(
  value: unknown,
  problems: string[],
  prefix: string,
): void {
  if (typeof value === "string") {
    if (containsIdentityAssertion(value)) {
      problems.push(
        `${prefix}: free-text identity assertion detected; rater records may discuss variants only as A and B.`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectIdentityAssertionProblems(
        entry,
        problems,
        `${prefix}[${String(index)}]`,
      );
    });
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      collectIdentityAssertionProblems(entry, problems, `${prefix}.${key}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Normalization and extraction primitives shared by the hard gates.
// ---------------------------------------------------------------------------

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function truncateExcerpt(value: string): string {
  const normalized = normalizeWhitespace(value);
  return normalized.slice(0, MAX_GATE_EXCERPT_CHARACTERS);
}

function normalizeForSubstringMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/\r\n?/gu, "\n")
    .replace(/[^a-z0-9@.]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function replaceNumberWords(value: string): string {
  return value.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/giu,
    (matched) => NUMBER_WORDS.get(matched.toLowerCase()) ?? matched,
  );
}

function extractInformativeTokens(value: string): string[] {
  const lowered = replaceNumberWords(value.toLowerCase());
  return lowered
    .split(/[^a-z0-9%]+/u)
    .filter(
      (token) =>
        token.length >= 3 &&
        token !== "%" &&
        !STOPWORDS.has(token) &&
        !/^\d+$/u.test(token),
    );
}

function normalizeDigits(value: string): string {
  return value.replace(/\D+/gu, "");
}

function extractEmails(value: string): string[] {
  return [...value.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/giu)]
    .map((match) => match[0]?.toLowerCase() ?? "")
    .filter((entry) => entry.length > 0);
}

function extractPhoneDigits(value: string): string[] {
  const candidates = value.matchAll(/(?:\+\d[\d ().-]{7,}\d)/gu);
  return [...candidates]
    .map((match) => normalizeDigits(match[0] ?? ""))
    .filter((digits) => digits.length >= 10);
}

function extractUrlSignatures(value: string): string[] {
  return [...value.matchAll(/https?:\/\/[^\s)>]+/giu)]
    .map((match) => (match[0] ?? "").toLowerCase().split("?")[0] ?? "")
    .filter((entry) => entry.length > 0);
}

/** Extracts the numerically comparable forms of every number-like token:
 * number words become digits, thousands separators are stripped. */
function extractComparableNumbers(value: string): Set<string> {
  const prepared = replaceNumberWords(normalizeWhitespace(value));
  const numbers = new Set<string>();
  for (const match of prepared.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?/gu)) {
    const raw = match[0] ?? "";
    numbers.add(raw.replaceAll(",", ""));
  }
  return numbers;
}

// ---------------------------------------------------------------------------
// Hard gates (pure functions over the paired texts).
// ---------------------------------------------------------------------------

function evaluateFactualityGate(
  originalText: string,
  generatedText: string,
): FactualityGateResult {
  const originalTokens = new Set(extractInformativeTokens(originalText));
  const originalEmails = new Set(extractEmails(originalText));
  const originalPhones = new Set(extractPhoneDigits(originalText));

  const excerpts: string[] = [];
  let unsupportedClaimCount = 0;
  let fabricatedContactCount = 0;

  const lines = generatedText.split(/\r?\n/u);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const sentences = trimmed.split(/(?<=[.!?;:])\s+/u);
    for (const sentence of sentences) {
      const tokens = extractInformativeTokens(sentence);
      if (tokens.length < FACTUALITY_MIN_CLAIM_TOKENS) continue;
      const supported = tokens.filter((token) => originalTokens.has(token));
      if (
        supported.length / tokens.length <
        FACTUALITY_TOKEN_SUPPORT_THRESHOLD
      ) {
        unsupportedClaimCount += 1;
        if (excerpts.length < MAX_GATE_EXCERPTS) {
          excerpts.push(truncateExcerpt(sentence));
        }
      }
    }
  }

  for (const email of extractEmails(generatedText)) {
    if (!originalEmails.has(email)) {
      fabricatedContactCount += 1;
    }
  }
  for (const phone of extractPhoneDigits(generatedText)) {
    let known = false;
    for (const candidate of originalPhones) {
      if (
        candidate === phone ||
        candidate.endsWith(phone) ||
        phone.endsWith(candidate)
      ) {
        known = true;
        break;
      }
    }
    if (!known) fabricatedContactCount += 1;
  }

  return {
    fabricatedContactCount,
    passed: unsupportedClaimCount === 0 && fabricatedContactCount === 0,
    unsupportedClaimCount,
    unsupportedClaimExcerpts: excerpts,
  };
}

function evaluateNumericIntegrityGate(
  originalText: string,
  generatedText: string,
): NumericIntegrityGateResult {
  const originalNumbers = extractComparableNumbers(originalText);
  const generatedNumbers = extractComparableNumbers(generatedText);
  const fabricatedNumbers: string[] = [];
  for (const number of generatedNumbers) {
    if (!originalNumbers.has(number)) {
      fabricatedNumbers.push(number);
    }
  }
  return {
    fabricatedNumberCount: fabricatedNumbers.length,
    fabricatedNumbers: fabricatedNumbers.sort((left, right) =>
      left.localeCompare(right),
    ),
    passed: fabricatedNumbers.length === 0,
  };
}

function evaluateOmissionsGate(
  originalText: string,
  generatedText: string,
  criticalAnchors: readonly string[],
): OmissionsGateResult {
  const generatedLower = generatedText.toLowerCase();
  const generatedNormalized = normalizeForSubstringMatch(generatedText);
  const generatedPhoneDigits = normalizeDigits(generatedText);

  const missingAnchors: string[] = [];

  for (const email of extractEmails(originalText)) {
    if (!generatedLower.includes(email))
      missingAnchors.push(`contact:${email}`);
  }
  for (const phone of extractPhoneDigits(originalText)) {
    if (!generatedPhoneDigits.includes(phone)) {
      missingAnchors.push(`contact-phone:${phone}`);
    }
  }
  for (const url of extractUrlSignatures(originalText)) {
    if (!generatedLower.includes(url)) missingAnchors.push(`link:${url}`);
  }
  for (const anchor of criticalAnchors) {
    if (
      !generatedLower.includes(anchor.toLowerCase()) &&
      !generatedNormalized.includes(normalizeForSubstringMatch(anchor))
    ) {
      missingAnchors.push(`anchor:${anchor}`);
    }
  }

  return {
    missingAnchorCount: missingAnchors.length,
    missingAnchors,
    passed: missingAnchors.length === 0,
  };
}

const SECTION_HEADER_PATTERN =
  /^\s*(?:professional\s+|relevant\s+|technical\s+)?(experience|work\s+history|employment(?:\s+history)?|education|skills?|summary|profile|projects|certifications)\s*:?\s*$/iu;

const DECORATIVE_GLYPH_PATTERN =
  /[\u2190-\u2BFF\u3000-\u303F\u3040-\u30FF\u3130-\u318F\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF\u{1F000}-\u{1FAFF}\u{1FB00}-\u{1FBFF}]/gu;

const UNEXPECTED_CONTROL_PATTERN =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function describeCodePoints(value: string): string {
  const seen = new Map<string, number>();
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    const label = `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
    seen.set(label, (seen.get(label) ?? 0) + 1);
  }
  return [...seen.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, count]) => `${label} x${count}`)
    .join(", ");
}

function evaluateAtsStructureGate(
  generatedText: string,
): AtsStructureGateResult {
  const problems: string[] = [];
  const normalized = generatedText.replace(/\r\n?/gu, "\n");

  if (normalized.length < MIN_TEXT_CHARACTERS) {
    problems.push(
      `length:text shorter than ${MIN_TEXT_CHARACTERS} characters (${normalized.length})`,
    );
  }
  if (normalized.length > MAX_TEXT_CHARACTERS) {
    problems.push(
      `length:text longer than ${MAX_TEXT_CHARACTERS} characters (${normalized.length})`,
    );
  }

  const contactSignals =
    extractEmails(normalized).length + extractPhoneDigits(normalized).length;
  if (contactSignals === 0) {
    problems.push("contact:no recognizable email or phone contact signal");
  }

  const headerCategories = new Set<string>();
  for (const line of normalized.split("\n")) {
    const match = SECTION_HEADER_PATTERN.exec(line);
    const category = match?.[1];
    if (category) {
      headerCategories.add(category.toLowerCase());
    }
  }
  if (headerCategories.size < ATS_MIN_SECTION_HEADERS) {
    problems.push(
      `structure:only ${headerCategories.size} recognizable section header(s); need at least ${ATS_MIN_SECTION_HEADERS}`,
    );
  }

  const lines = normalized.split("\n");
  for (const [index, line] of lines.entries()) {
    if (line.length > ATS_MAX_LINE_LENGTH) {
      problems.push(
        `line-length:line ${index + 1} is ${line.length} characters (limit ${ATS_MAX_LINE_LENGTH}); possible column or table mangling`,
      );
      break;
    }
  }

  const unexpectedControl = normalized.match(UNEXPECTED_CONTROL_PATTERN);
  if (unexpectedControl) {
    problems.push(
      `control-chars:${describeCodePoints(unexpectedControl.join(""))}`,
    );
  }

  const decorative = normalized.match(DECORATIVE_GLYPH_PATTERN);
  if (decorative) {
    problems.push(
      `glyphs:decorative glyphs that break plain-text parsers (${describeCodePoints(decorative.join(""))})`,
    );
  }

  const yearMentions = [...normalized.matchAll(/\b(?:19|20)\d{2}\b/gu)].length;
  if (yearMentions < ATS_MIN_YEAR_MENTIONS) {
    problems.push(
      `timeline:only ${yearMentions} four-digit year mention(s); need at least ${ATS_MIN_YEAR_MENTIONS}`,
    );
  }

  return { passed: problems.length === 0, problems };
}

/** Computes all four hard gates for one original/generated pair. Pure and
 * deterministic: identical inputs always yield identical results. */
export function evaluateHardGates(input: {
  criticalAnchors: readonly string[];
  generatedText: string;
  originalText: string;
}): HardGateEvaluation {
  const factuality = evaluateFactualityGate(
    input.originalText,
    input.generatedText,
  );
  const numericIntegrity = evaluateNumericIntegrityGate(
    input.originalText,
    input.generatedText,
  );
  const omissions = evaluateOmissionsGate(
    input.originalText,
    input.generatedText,
    input.criticalAnchors,
  );
  const atsStructure = evaluateAtsStructureGate(input.generatedText);
  return {
    atsStructure,
    factuality,
    numericIntegrity,
    omissions,
    passed:
      factuality.passed &&
      numericIntegrity.passed &&
      omissions.passed &&
      atsStructure.passed,
  };
}

// ---------------------------------------------------------------------------
// Deterministic blinded slot assignment.
// ---------------------------------------------------------------------------

/** Which slot the original lands in for one seed/case pair. Deterministic
 * across platforms and runs; the generated side takes the other slot. */
export function resolveSlotAssignment(
  seed: string,
  caseId: string,
): VariantSlot {
  const digest = createHash("sha256")
    .update(`blind-resume-comparison/v1:${seed}:${caseId}`, "utf8")
    .digest();
  return (digest[0] ?? 0) % 2 === 0 ? "A" : "B";
}

// ---------------------------------------------------------------------------
// Case-file validation.
// ---------------------------------------------------------------------------

const CASE_FILE_KEYS = ["schemaVersion", "seed", "cases"] as const;
const CASE_ENTRY_KEYS = [
  "caseId",
  "isControl",
  "jobContext",
  "originalText",
  "generatedText",
  "criticalAnchors",
] as const;

function validateCaseText(
  source: JsonRecord,
  key: "generatedText" | "originalText",
  label: string,
  problems: string[],
): string {
  const raw = source[key];
  if (typeof raw !== "string") {
    problems.push(`${label}.${key} must be a string.`);
    return "";
  }
  if (raw.trim().length < MIN_TEXT_CHARACTERS) {
    problems.push(
      `${label}.${key} must carry at least ${MIN_TEXT_CHARACTERS} characters of resume text (${raw.trim().length}).`,
    );
  }
  if (raw.length > MAX_TEXT_CHARACTERS) {
    problems.push(
      `${label}.${key} must carry at most ${MAX_TEXT_CHARACTERS} characters (${raw.length}).`,
    );
  }
  return raw;
}

/** Validates one parsed case-file value against the protocol input schema.
 * Unknown fields and forbidden claim vocabulary fail closed; every collected
 * problem is reported together. */
export function validateComparisonCaseInputFile(
  value: unknown,
): ComparisonCaseInputFile {
  if (!isPlainObject(value)) {
    throw new ProtocolValidationError(["Case file must be a JSON object."]);
  }
  const problems: string[] = [];
  for (const key of Object.keys(value)) {
    if (!(CASE_FILE_KEYS as readonly string[]).includes(key)) {
      problems.push(`Unknown field is not allowed: ${key}.`);
    }
  }
  collectForbiddenClaimKeyProblems(value, problems);

  const schemaVersion = value.schemaVersion;
  if (schemaVersion !== BLIND_RESUME_COMPARISON_SCHEMA_VERSION) {
    problems.push(
      `schemaVersion must be ${BLIND_RESUME_COMPARISON_SCHEMA_VERSION}.`,
    );
  }
  const seed = readNonEmptyString(value, "seed", problems);
  if (seed.length > 256 || /[\u0000-\u001F]/u.test(seed)) {
    problems.push("seed must be 1-256 characters with no control characters.");
  }

  const casesRaw = value.cases;
  const cases: ComparisonCaseInput[] = [];
  if (!Array.isArray(casesRaw) || casesRaw.length === 0) {
    problems.push("cases must be a non-empty array.");
  } else {
    if (casesRaw.length > MAX_CASE_COUNT) {
      problems.push(`cases must carry at most ${MAX_CASE_COUNT} entries.`);
    }
    const seenCaseIds = new Set<string>();
    casesRaw.forEach((rawCase, index) => {
      const label = `cases[${index}]`;
      if (!isPlainObject(rawCase)) {
        problems.push(`${label} must be an object.`);
        return;
      }
      const caseProblems: string[] = [];
      const caseId = readNonEmptyString(rawCase, "caseId", caseProblems);
      if (!caseIdPattern.test(caseId)) {
        caseProblems.push(
          `${label}.caseId must match ${caseIdPattern.source} (safe filename characters).`,
        );
      } else if (seenCaseIds.has(caseId)) {
        caseProblems.push(
          `${label}.caseId duplicates an earlier case: ${caseId}.`,
        );
      } else {
        seenCaseIds.add(caseId);
      }
      const isControl = readBoolean(rawCase, "isControl", caseProblems);
      const jobContext = readNonEmptyString(
        rawCase,
        "jobContext",
        caseProblems,
      );
      if (jobContext.length > MAX_JOB_CONTEXT_CHARACTERS) {
        caseProblems.push(
          `${label}.jobContext must carry at most ${MAX_JOB_CONTEXT_CHARACTERS} characters.`,
        );
      }
      const originalText = validateCaseText(
        rawCase,
        "originalText",
        label,
        caseProblems,
      );
      const generatedText = validateCaseText(
        rawCase,
        "generatedText",
        label,
        caseProblems,
      );
      const criticalAnchorsRaw = rawCase.criticalAnchors ?? [];
      const criticalAnchors: string[] = [];
      if (!Array.isArray(criticalAnchorsRaw)) {
        caseProblems.push(`${label}.criticalAnchors must be an array.`);
      } else {
        if (criticalAnchorsRaw.length > MAX_CRITICAL_ANCHORS) {
          caseProblems.push(
            `${label}.criticalAnchors must carry at most ${MAX_CRITICAL_ANCHORS} entries.`,
          );
        }
        criticalAnchorsRaw.forEach((anchor, anchorIndex) => {
          if (typeof anchor !== "string" || anchor.trim().length === 0) {
            caseProblems.push(
              `${label}.criticalAnchors[${anchorIndex}] must be a non-empty string.`,
            );
            return;
          }
          if (anchor.length > 200) {
            caseProblems.push(
              `${label}.criticalAnchors[${anchorIndex}] must carry at most 200 characters.`,
            );
          }
          criticalAnchors.push(anchor);
        });
      }
      collectUnknownFieldProblems(
        rawCase,
        CASE_ENTRY_KEYS,
        label,
        caseProblems,
      );

      // Per-entry problems are prefixed so multi-problem case files remain
      // readable while every problem is still reported together.
      for (const entryProblem of caseProblems) {
        problems.push(
          entryProblem.startsWith(label)
            ? entryProblem
            : `${label}: ${entryProblem}`,
        );
      }
      if (caseProblems.length === 0) {
        cases.push({
          caseId,
          criticalAnchors,
          generatedText,
          isControl,
          jobContext,
          originalText,
        });
      }
    });
  }

  if (problems.length > 0) throw new ProtocolValidationError(problems);

  return {
    cases,
    schemaVersion: BLIND_RESUME_COMPARISON_SCHEMA_VERSION,
    seed,
  };
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

function buildCaseBrief(caseInput: ComparisonCaseInput): JsonRecord {
  return {
    schemaVersion: BLIND_RESUME_COMPARISON_SCHEMA_VERSION,
    kind: COMPARISON_KIND_CASE_BRIEF,
    caseId: caseInput.caseId,
    jobContext: caseInput.jobContext,
    instructions: {
      ratingScale: {
        min: MIN_RATING_SCORE,
        max: MAX_RATING_SCORE,
        meaning: "1 = poor, 5 = excellent, rated independently per variant",
      },
      dimensions: [...RATING_DIMENSIONS],
      forcedChoice:
        "After scoring both variants you MUST choose the single stronger resume: A or B. Ties are not an option.",
      blinding:
        "Rate both variants on their own merits. Do not speculate about which variant has any particular provenance.",
    },
    variantFilenames: ["variant-A.txt", "variant-B.txt"],
  };
}

function buildRaterRecordTemplate(
  manifestSha256: string,
  caseIds: readonly string[],
): JsonRecord {
  const ratings = caseIds.map((caseId) => ({
    caseId,
    credibility: { A: 0, B: 0 },
    readability: { A: 0, B: 0 },
    relevance: { A: 0, B: 0 },
    specificity: { A: 0, B: 0 },
    forcedChoice: "",
  }));
  return {
    schemaVersion: BLIND_RESUME_COMPARISON_SCHEMA_VERSION,
    kind: COMPARISON_KIND_RATER_RECORD,
    raterId: "",
    manifestSha256,
    raterNotes: "",
    ratings,
  };
}

function gateFailureSummary(evaluation: HardGateEvaluation): string {
  const failed: string[] = [];
  if (!evaluation.factuality.passed) {
    failed.push(
      `factuality(${evaluation.factuality.unsupportedClaimCount} unsupported, ${evaluation.factuality.fabricatedContactCount} fabricated contacts)`,
    );
  }
  if (!evaluation.numericIntegrity.passed) {
    failed.push(
      `numeric-integrity(${evaluation.numericIntegrity.fabricatedNumberCount} invented numbers)`,
    );
  }
  if (!evaluation.omissions.passed) {
    failed.push(
      `omissions(${evaluation.omissions.missingAnchorCount} missing)`,
    );
  }
  if (!evaluation.atsStructure.passed) {
    failed.push(
      `ats-structure(${evaluation.atsStructure.problems.length} problems)`,
    );
  }
  return failed.join(", ");
}

async function assertFreshDirectory(
  target: string,
  label: string,
): Promise<void> {
  const parent = path.dirname(target);
  const parentStat = await stat(parent).catch((error: unknown) => {
    throw new Error(
      `${label} parent must be an existing directory: ${parent}`,
      {
        cause: error,
      },
    );
  });
  if (!parentStat.isDirectory()) {
    throw new Error(`${label} parent must be an existing directory: ${parent}`);
  }
  await realpath(parent);
  const existing = await lstat(target).catch(() => null);
  if (existing !== null) {
    throw new Error(
      `${label} already exists; this protocol requires a fresh directory: ${target}`,
    );
  }
}

/** init: validate the case file, run every hard gate, and scaffold the sealed
 * supervisor work root (manifest + sources) plus the identity-free rater root
 * (case briefs, blinded variants, rater record template). Fails closed before
 * anything is written when any gate, schema, or freshness requirement is
 * violated; a mid-flight write failure rolls back both fresh roots. */
export async function initBlindResumeComparison(
  options: InitBlindResumeComparisonOptions,
): Promise<InitBlindResumeComparisonOutcome> {
  const casesFilePath = path.resolve(options.casesFile);
  const bytes = await readFile(casesFilePath).catch((error: unknown) => {
    throw new Error(`Unable to read case file ${casesFilePath}.`, {
      cause: error,
    });
  });
  const parsed = await parseJsonContent(
    bytes.toString("utf8"),
    `Case file ${casesFilePath}`,
  );
  const caseFile = validateComparisonCaseInputFile(parsed);

  const controlCaseIds = caseFile.cases
    .filter((entry) => entry.isControl)
    .map((entry) => entry.caseId);
  if (controlCaseIds.length === 0) {
    throw new ProtocolValidationError([
      "The case set must include at least one original-win control case (isControl:true) so rater reliability can be checked.",
    ]);
  }

  // Hard gates run before any directory exists: a violating case set must
  // never reach a rater.
  const evaluations = new Map<string, HardGateEvaluation>();
  const gateFailures: string[] = [];
  for (const entry of caseFile.cases) {
    const evaluation = evaluateHardGates({
      criticalAnchors: entry.criticalAnchors,
      generatedText: entry.generatedText,
      originalText: entry.originalText,
    });
    evaluations.set(entry.caseId, evaluation);
    if (!evaluation.passed) {
      gateFailures.push(`${entry.caseId}: ${gateFailureSummary(evaluation)}`);
    }
  }
  if (gateFailures.length > 0) {
    throw new ProtocolValidationError([
      `Hard gates failed for ${gateFailures.length} case(s); nothing was scaffolded and no rater saw anything:`,
      ...gateFailures,
    ]);
  }

  const workRoot = path.resolve(options.workRoot);
  const raterRoot = path.resolve(options.raterRoot);
  await assertFreshDirectory(workRoot, "Work root");
  await assertFreshDirectory(raterRoot, "Rater root");
  if (
    workRoot === raterRoot ||
    workRoot.startsWith(`${raterRoot}${path.sep}`) ||
    raterRoot.startsWith(`${workRoot}${path.sep}`)
  ) {
    throw new Error(
      "Work root and rater root must be disjoint directories; the sealed manifest must never live where raters can browse.",
    );
  }

  const sourcesDir = path.join(workRoot, COMPARISON_SOURCES_DIRNAME);
  const raterCasesDir = path.join(raterRoot, COMPARISON_RATER_CASES_DIRNAME);
  const raterRecordsDir = path.join(
    raterRoot,
    COMPARISON_RATER_RECORDS_DIRNAME,
  );

  const createdRoots: string[] = [];
  try {
    for (const directory of [workRoot, raterRoot]) {
      await mkdir(directory);
      createdRoots.push(directory);
    }
    await mkdir(sourcesDir);
    await mkdir(raterCasesDir);
    await mkdir(raterRecordsDir);

    const manifestCases: ManifestCaseEntry[] = [];
    for (const entry of caseFile.cases) {
      const evaluation = evaluations.get(entry.caseId);
      if (!evaluation) {
        throw new Error(`Missing hard-gate evaluation for ${entry.caseId}.`);
      }
      const originalSlot = resolveSlotAssignment(caseFile.seed, entry.caseId);
      const generatedSlot: VariantSlot = originalSlot === "A" ? "B" : "A";
      const variantContents: Record<VariantSlot, string> = {
        [originalSlot]: entry.originalText,
        [generatedSlot]: entry.generatedText,
      } as Record<VariantSlot, string>;

      await writeFileAtomic0644(
        path.join(sourcesDir, `${entry.caseId}.original.txt`),
        entry.originalText,
      );
      await writeFileAtomic0644(
        path.join(sourcesDir, `${entry.caseId}.generated.txt`),
        entry.generatedText,
      );

      const caseDir = path.join(raterCasesDir, entry.caseId);
      await mkdir(caseDir);
      await writeFileAtomic0644(
        path.join(caseDir, "variant-A.txt"),
        variantContents.A,
      );
      await writeFileAtomic0644(
        path.join(caseDir, "variant-B.txt"),
        variantContents.B,
      );
      await writeFileAtomic0644(
        path.join(caseDir, "case-brief.json"),
        `${JSON.stringify(buildCaseBrief(entry), null, 2)}\n`,
      );

      manifestCases.push({
        caseId: entry.caseId,
        criticalAnchors: [...entry.criticalAnchors],
        hardGates: evaluation,
        hardGatesPassed: evaluation.passed,
        isControl: entry.isControl,
        jobContext: entry.jobContext,
        // Slot -> which side it holds; identity joins back only at aggregate.
        slots: {
          A: originalSlot === "A" ? "original" : "generated",
          B: originalSlot === "B" ? "original" : "generated",
        },
        sourceDigests: {
          original: sha256Hex(entry.originalText),
          generated: sha256Hex(entry.generatedText),
        },
        variantDigests: {
          A: sha256Hex(variantContents.A),
          B: sha256Hex(variantContents.B),
        },
      });
    }

    const manifestSeed: Omit<ComparisonManifest, "manifestSha256"> = {
      schemaVersion: BLIND_RESUME_COMPARISON_SCHEMA_VERSION,
      kind: COMPARISON_KIND_MANIFEST,
      createdAtIso: new Date().toISOString(),
      seedSha256: sha256Hex(caseFile.seed),
      caseCount: manifestCases.length,
      controlCaseIds,
      cases: manifestCases,
    };
    const manifestSha256 = sha256Hex(
      stableComparisonSerialization(manifestSeed),
    );
    const manifest: ComparisonManifest = {
      ...manifestSeed,
      manifestSha256,
    };
    const manifestPath = path.join(workRoot, COMPARISON_MANIFEST_FILENAME);
    await writeFileAtomic0644(
      manifestPath,
      orderedJson(manifest, [
        "schemaVersion",
        "kind",
        "createdAtIso",
        "seedSha256",
        "caseCount",
        "controlCaseIds",
        "cases",
        "manifestSha256",
      ]),
    );

    await writeFileAtomic0644(
      path.join(raterRecordsDir, COMPARISON_RATER_RECORD_TEMPLATE_FILENAME),
      orderedJson(
        buildRaterRecordTemplate(
          manifestSha256,
          caseFile.cases.map((entry) => entry.caseId),
        ),
        RATER_RECORD_KEYS,
      ),
    );

    return {
      caseCount: manifestCases.length,
      controlCaseIds,
      manifestPath,
      manifestSha256,
      raterCasesDir,
      raterRecordsDir,
      raterRoot,
      sourcesDir,
      workRoot,
    };
  } catch (error) {
    for (const directory of [...createdRoots].reverse()) {
      await rm(directory, { force: true, recursive: true }).catch(
        () => undefined,
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Rater record validation and the record command.
// ---------------------------------------------------------------------------

function readScore(
  source: JsonRecord,
  slot: VariantSlot,
  label: string,
  problems: string[],
): number {
  const raw = source[slot];
  if (
    typeof raw !== "number" ||
    !Number.isSafeInteger(raw) ||
    raw < MIN_RATING_SCORE ||
    raw > MAX_RATING_SCORE
  ) {
    problems.push(
      `${label}.${slot} must be an integer between ${MIN_RATING_SCORE} and ${MAX_RATING_SCORE}.`,
    );
    return 0;
  }
  return raw;
}

function validateDimensionScores(
  source: JsonRecord,
  label: string,
  problems: string[],
): RatingDimensionScores | null {
  if (!isPlainObject(source)) {
    problems.push(`${label} must be an object with A and B scores.`);
    return null;
  }
  collectUnknownFieldProblems(source, ["A", "B"], label, problems);
  const a = readScore(source, "A", label, problems);
  const b = readScore(source, "B", label, problems);
  return { A: a, B: b };
}

/** Validates one parsed rater-record value. Strict schema, forced choice
 * mandatory, forbidden claim vocabulary and identity assertions refused.
 * Shape-only by design: binding to the sealed manifest is aggregate's
 * authority. */
export function validateRaterRecordValue(value: unknown): BlindRaterRecord {
  if (!isPlainObject(value)) {
    throw new ProtocolValidationError(["Rater record must be a JSON object."]);
  }
  const problems: string[] = [];
  for (const key of Object.keys(value)) {
    if (!(RATER_RECORD_KEYS as readonly string[]).includes(key)) {
      problems.push(`Unknown field is not allowed: ${key}.`);
    }
  }
  collectForbiddenClaimKeyProblems(value, problems);

  const schemaVersion = value.schemaVersion;
  if (schemaVersion !== BLIND_RESUME_COMPARISON_SCHEMA_VERSION) {
    problems.push(
      `schemaVersion must be ${BLIND_RESUME_COMPARISON_SCHEMA_VERSION}.`,
    );
  }
  const kind = value.kind;
  if (kind !== COMPARISON_KIND_RATER_RECORD) {
    problems.push(`kind must be ${COMPARISON_KIND_RATER_RECORD}.`);
  }
  const raterId = readNonEmptyString(value, "raterId", problems);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/u.test(raterId)) {
    problems.push(
      "raterId must be 1-64 safe filename characters (letters, digits, dot, underscore, hyphen).",
    );
  }
  const manifestSha256 = readNonEmptyString(value, "manifestSha256", problems);
  if (!digestPattern.test(manifestSha256)) {
    problems.push("manifestSha256 must be a lowercase SHA-256 digest.");
  }
  const raterNotesRaw = value.raterNotes;
  if (typeof raterNotesRaw !== "string") {
    problems.push("raterNotes must be a string (possibly empty).");
  } else if (raterNotesRaw.length > MAX_RATER_NOTES_CHARACTERS) {
    problems.push(
      `raterNotes must carry at most ${MAX_RATER_NOTES_CHARACTERS} characters.`,
    );
  }
  const raterNotes = typeof raterNotesRaw === "string" ? raterNotesRaw : "";

  const ratings: CaseRating[] = [];
  const ratingsRaw = value.ratings;
  if (!Array.isArray(ratingsRaw) || ratingsRaw.length === 0) {
    problems.push("ratings must be a non-empty array.");
  } else {
    const seenCaseIds = new Set<string>();
    ratingsRaw.forEach((rawRating, index) => {
      const label = `ratings[${index}]`;
      if (!isPlainObject(rawRating)) {
        problems.push(`${label} must be an object.`);
        return;
      }
      const ratingProblems: string[] = [];
      const caseId = readNonEmptyString(rawRating, "caseId", ratingProblems);
      if (!caseIdPattern.test(caseId)) {
        ratingProblems.push(`${label}.caseId is not a valid case id.`);
      } else if (seenCaseIds.has(caseId)) {
        ratingProblems.push(
          `${label}.caseId duplicates an earlier rating: ${caseId}.`,
        );
      } else {
        seenCaseIds.add(caseId);
      }
      const dimensions: Partial<
        Record<RatingDimension, RatingDimensionScores>
      > = {};
      for (const dimension of RATING_DIMENSIONS) {
        const rawDimension = rawRating[dimension];
        if (rawDimension === undefined) {
          ratingProblems.push(
            `${label} is missing required field: ${dimension}.`,
          );
          continue;
        }
        const scores = validateDimensionScores(
          rawDimension,
          `${label}.${dimension}`,
          ratingProblems,
        );
        if (scores) dimensions[dimension] = scores;
      }
      const forcedChoice = rawRating.forcedChoice;
      if (typeof forcedChoice !== "string" || !slotPattern.test(forcedChoice)) {
        ratingProblems.push(
          `${label}.forcedChoice is mandatory and must be "A" or "B" (ties are not an option).`,
        );
      }
      collectUnknownFieldProblems(
        rawRating,
        RATING_KEYS,
        label,
        ratingProblems,
      );
      for (const ratingProblem of ratingProblems) {
        problems.push(
          ratingProblem.startsWith(label)
            ? ratingProblem
            : `${label}: ${ratingProblem}`,
        );
      }
      if (ratingProblems.length === 0) {
        ratings.push({
          caseId,
          credibility: dimensions.credibility ?? { A: 0, B: 0 },
          forcedChoice: forcedChoice as VariantSlot,
          readability: dimensions.readability ?? { A: 0, B: 0 },
          relevance: dimensions.relevance ?? { A: 0, B: 0 },
          specificity: dimensions.specificity ?? { A: 0, B: 0 },
        });
      }
    });
  }

  collectIdentityAssertionProblems(value, problems, "record");
  if (problems.length > 0) throw new ProtocolValidationError(problems);

  return {
    kind: COMPARISON_KIND_RATER_RECORD,
    manifestSha256,
    raterId,
    raterNotes,
    ratings,
    schemaVersion: BLIND_RESUME_COMPARISON_SCHEMA_VERSION,
  };
}

async function readAndValidateRaterRecordFile(
  recordPath: string,
): Promise<BlindRaterRecord> {
  const resolved = path.resolve(recordPath);
  const bytes = await readFile(resolved).catch((error: unknown) => {
    throw new Error(`Unable to read rater record ${resolved}.`, {
      cause: error,
    });
  });
  const parsed = await parseJsonContent(
    bytes.toString("utf8"),
    `Rater record ${resolved}`,
  );
  return validateRaterRecordValue(parsed);
}

/** record: validate one filled rater record and rewrite it atomically in
 * canonical key order with mode 0644. A failed validation never touches the
 * original bytes. */
export async function recordBlindResumeComparisonRating(
  options: RecordBlindResumeComparisonOptions,
): Promise<RecordBlindResumeComparisonOutcome> {
  const recordPath = path.resolve(options.file);
  const record = await readAndValidateRaterRecordFile(recordPath);
  const serialized = orderedJson(record, RATER_RECORD_KEYS);
  await writeFileAtomic0644(recordPath, serialized);
  return {
    bytes: Buffer.byteLength(serialized, "utf8"),
    forcedChoices: record.ratings.length,
    raterId: record.raterId,
    ratedCaseCount: record.ratings.length,
    recordPath,
  };
}

// ---------------------------------------------------------------------------
// Manifest verification and aggregate.
// ---------------------------------------------------------------------------

export interface VerifiedComparisonManifest {
  manifest: ComparisonManifest;
  manifestPath: string;
  workRootReal: string;
}

/** Loads and verifies the sealed manifest: self-digest over the canonically
 * serialized subject, schema/kind, and basic entry shape. Digest and gate
 * re-verification against on-disk files happens in aggregate. */
export async function loadVerifiedComparisonManifest(
  workRoot: string,
): Promise<VerifiedComparisonManifest> {
  const resolvedWorkRoot = path.resolve(workRoot);
  const manifestPath = path.join(
    resolvedWorkRoot,
    COMPARISON_MANIFEST_FILENAME,
  );
  const bytes = await readFile(manifestPath).catch((error: unknown) => {
    throw new Error(
      `Unable to read comparison manifest ${manifestPath}; run init first.`,
      { cause: error },
    );
  });
  const manifest = await parseJsonContent(
    bytes.toString("utf8"),
    `Comparison manifest ${manifestPath}`,
  );
  const recordedDigest = manifest.manifestSha256;
  if (
    typeof recordedDigest !== "string" ||
    !digestPattern.test(recordedDigest)
  ) {
    throw new Error(
      `Comparison manifest ${manifestPath} is missing a valid manifestSha256.`,
    );
  }
  const subject: JsonRecord = { ...manifest };
  delete subject.manifestSha256;
  const actualDigest = sha256Hex(stableComparisonSerialization(subject));
  if (actualDigest !== recordedDigest) {
    throw new Error(
      `Comparison manifest self-digest mismatch for ${manifestPath}: expected ${recordedDigest}, computed ${actualDigest}; the seal is broken.`,
    );
  }
  if (manifest.kind !== COMPARISON_KIND_MANIFEST) {
    throw new Error(
      `Comparison manifest ${manifestPath} must declare kind ${COMPARISON_KIND_MANIFEST}.`,
    );
  }
  if (manifest.schemaVersion !== BLIND_RESUME_COMPARISON_SCHEMA_VERSION) {
    throw new Error(
      `Comparison manifest ${manifestPath} has an unsupported schemaVersion.`,
    );
  }
  if (!Array.isArray(manifest.cases) || manifest.cases.length === 0) {
    throw new Error(`Comparison manifest ${manifestPath} needs a cases array.`);
  }
  if (!Array.isArray(manifest.controlCaseIds)) {
    throw new Error(
      `Comparison manifest ${manifestPath} needs a controlCaseIds array.`,
    );
  }
  if (manifest.controlCaseIds.length === 0) {
    throw new Error(
      "The sealed case set carries no original-win control cases; aggregation is refused because rater reliability cannot be checked.",
    );
  }
  const workRootReal = await realpath(resolvedWorkRoot);
  return {
    manifest: manifest as unknown as ComparisonManifest,
    manifestPath,
    workRootReal,
  };
}

interface SlotTally {
  generated: number;
  original: number;
}

function projectCaseAggregate(
  entry: ManifestCaseEntry,
  ratings: CaseRating[],
  raterCount: number,
): CaseAggregate {
  const dimensionMeans = {} as Record<
    RatingDimension,
    Record<"generated" | "original", number>
  >;
  for (const dimension of RATING_DIMENSIONS) {
    const sums = { original: 0, generated: 0 };
    for (const rating of ratings) {
      const scores = rating[dimension];
      for (const slot of VARIANT_SLOTS) {
        const side = entry.slots[slot];
        const score = scores[slot];
        if (side === "original") sums.original += score;
        else sums.generated += score;
      }
    }
    dimensionMeans[dimension] = {
      original: Math.round((sums.original / raterCount) * 100) / 100,
      generated: Math.round((sums.generated / raterCount) * 100) / 100,
    };
  }

  const tally: SlotTally = { original: 0, generated: 0 };
  for (const rating of ratings) {
    const side = entry.slots[rating.forcedChoice];
    if (side === "original") tally.original += 1;
    else tally.generated += 1;
  }
  const winner: CaseAggregate["winner"] =
    tally.original === tally.generated
      ? "tie"
      : tally.original > tally.generated
        ? "original"
        : "generated";

  return {
    caseId: entry.caseId,
    dimensionMeans,
    forcedChoiceCounts: tally,
    hardGatesPassed: entry.hardGatesPassed,
    isControl: entry.isControl,
    raterCount,
    winner,
  };
}

async function verifySealedArtifacts(
  verified: VerifiedComparisonManifest,
  raterRoot: string,
  failures: AggregateRefusalRow[],
): Promise<boolean> {
  let intact = true;
  const sealedCases = verified.manifest.cases as ManifestCaseEntry[];
  for (const entry of sealedCases) {
    for (const side of ["original", "generated"] as const) {
      const sourcePath = path.join(
        verified.workRootReal,
        COMPARISON_SOURCES_DIRNAME,
        `${entry.caseId}.${side}.txt`,
      );
      const content = await readFile(sourcePath).catch(() => null);
      if (
        content === null ||
        sha256Hex(content) !== entry.sourceDigests[side]
      ) {
        failures.push({
          subject: entry.caseId,
          reason: `Source file tampered or missing: ${sourcePath}.`,
        });
        intact = false;
      }
    }
    for (const slot of VARIANT_SLOTS) {
      const variantPath = path.join(
        raterRoot,
        COMPARISON_RATER_CASES_DIRNAME,
        entry.caseId,
        `variant-${slot}.txt`,
      );
      const content = await readFile(variantPath).catch(() => null);
      if (
        content === null ||
        sha256Hex(content) !== entry.variantDigests[slot]
      ) {
        failures.push({
          subject: entry.caseId,
          reason: `Blinded variant tampered or missing: ${variantPath}.`,
        });
        intact = false;
      }
    }
    // Defense in depth: recompute the hard gates from the sealed sources and
    // require the recorded evaluation to match byte-for-byte.
    const originalContent = await readFile(
      path.join(
        verified.workRootReal,
        COMPARISON_SOURCES_DIRNAME,
        `${entry.caseId}.original.txt`,
      ),
    ).catch(() => null);
    const generatedContent = await readFile(
      path.join(
        verified.workRootReal,
        COMPARISON_SOURCES_DIRNAME,
        `${entry.caseId}.generated.txt`,
      ),
    ).catch(() => null);
    if (originalContent !== null && generatedContent !== null) {
      const recomputed = evaluateHardGates({
        criticalAnchors: entry.criticalAnchors,
        generatedText: generatedContent.toString("utf8"),
        originalText: originalContent.toString("utf8"),
      });
      if (
        stableComparisonSerialization(recomputed) !==
        stableComparisonSerialization(entry.hardGates)
      ) {
        failures.push({
          subject: entry.caseId,
          reason:
            "Recorded hard-gate results no longer match the sealed sources; the seal is inconsistent.",
        });
        intact = false;
      }
    }
  }
  return intact;
}

async function discoverRaterRecords(
  raterRecordsDir: string,
): Promise<string[]> {
  const entries = await readdir(raterRecordsDir).catch(() => []);
  return entries
    .filter((name) => name.endsWith(".json"))
    .filter((name) => name !== COMPARISON_RATER_RECORD_TEMPLATE_FILENAME)
    .filter((name) => !name.startsWith("."))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => path.join(raterRecordsDir, name));
}

/** Resolves and contains the aggregate output path: a direct child of the
 * canonical work root (the default), never an existing symlink, never the
 * manifest, and never anything inside sources/. */
async function resolveContainedAggregateOutput(
  workRootReal: string,
  out: string | null,
): Promise<string> {
  const requested =
    out === null
      ? path.join(workRootReal, COMPARISON_AGGREGATE_FILENAME)
      : path.resolve(out);
  const parent = path.dirname(requested);
  let parentReal: string;
  try {
    parentReal = await realpath(parent);
  } catch (error) {
    throw new Error(`Aggregate output directory does not exist: ${parent}`, {
      cause: error,
    });
  }
  if (parentReal !== workRootReal) {
    throw new Error(
      `Aggregate output must be a direct child of the supervisor work root (${workRootReal}): ${requested}`,
    );
  }
  const existing = await lstat(requested).catch(() => null);
  if (existing?.isSymbolicLink()) {
    throw new Error(
      `Aggregate output path is an existing symlink; refusing to write through it: ${requested}`,
    );
  }
  if (
    path.basename(requested) === COMPARISON_MANIFEST_FILENAME ||
    path.basename(requested) === COMPARISON_RATER_RECORD_TEMPLATE_FILENAME
  ) {
    throw new Error(
      `Aggregate output must never overwrite a protocol artifact: ${requested}`,
    );
  }
  return requested;
}

/** aggregate: verify the seal, every source and blinded variant digest, the
 * recorded hard gates, and every rater record; refuse unbound, incomplete,
 * forced-choice-less, or identity-leaking ratings; then lift the blinding and
 * emit the aggregate. Missing or invalid ratings write no output and clear a
 * stale default aggregate. When all ratings are valid but a mandatory
 * original-win control did not actually go to the original, the aggregate is
 * still written and the outcome stays failed so nobody silently proceeds.
 * This command produces descriptive statistics only: it makes no ATS-score,
 * callback, screening, or hiring-outcome claims. */
export async function aggregateBlindResumeComparison(
  options: AggregateBlindResumeComparisonOptions,
): Promise<AggregateBlindResumeComparisonOutcome> {
  const raterRoot = path.resolve(options.raterRoot);
  const raterRecordsDir = path.join(
    raterRoot,
    COMPARISON_RATER_RECORDS_DIRNAME,
  );
  const verified = await loadVerifiedComparisonManifest(options.workRoot);
  const aggregatePath = await resolveContainedAggregateOutput(
    verified.workRootReal,
    options.out,
  );

  const failures: AggregateRefusalRow[] = [];

  const artifactsIntact = await verifySealedArtifacts(
    verified,
    raterRoot,
    failures,
  );

  const manifest = verified.manifest;
  const manifestCases = manifest.cases as ManifestCaseEntry[];
  const controlCaseIds = manifest.controlCaseIds as string[];
  const expectedCaseIds = new Set(manifestCases.map((entry) => entry.caseId));

  const ratingsByCase = new Map<string, CaseRating[]>();
  for (const entry of manifestCases) {
    ratingsByCase.set(entry.caseId, []);
  }
  const raterIds: string[] = [];
  const seenRaterIds = new Map<string, string>();

  if (artifactsIntact) {
    const recordPaths = await discoverRaterRecords(raterRecordsDir);
    if (recordPaths.length === 0) {
      failures.push({
        subject: "rater-records",
        reason: `No rater records found in ${raterRecordsDir}; copy the template, fill every rating and the mandatory forced choice, and record each rater's file.`,
      });
    }
    for (const recordPath of recordPaths) {
      let record: BlindRaterRecord;
      try {
        record = await readAndValidateRaterRecordFile(recordPath);
      } catch (error) {
        failures.push({
          subject: path.basename(recordPath),
          reason: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (seenRaterIds.has(record.raterId)) {
        failures.push({
          subject: record.raterId,
          reason: `Duplicate rater id across ${seenRaterIds.get(record.raterId) ?? ""} and ${path.basename(recordPath)}.`,
        });
        continue;
      }
      seenRaterIds.set(record.raterId, path.basename(recordPath));
      if (record.manifestSha256 !== manifest.manifestSha256) {
        failures.push({
          subject: record.raterId,
          reason:
            "Record is bound to a different manifest digest (stale or foreign wave); refusing unbound ratings.",
        });
        continue;
      }
      const ratingCaseIds = new Set(
        record.ratings.map((rating) => rating.caseId),
      );
      for (const ratingCaseId of ratingCaseIds) {
        if (!expectedCaseIds.has(ratingCaseId)) {
          failures.push({
            subject: record.raterId,
            reason: `Rating references unknown case ${ratingCaseId}.`,
          });
        }
      }
      // Completeness is all-or-nothing per rater: a record that misses any
      // sealed case, duplicates a case, or references an unknown case is
      // refused whole and contributes no ratings.
      const complete =
        record.ratings.length ===
          record.ratings.filter((rating) => expectedCaseIds.has(rating.caseId))
            .length &&
        manifestCases.every((entry) => ratingCaseIds.has(entry.caseId)) &&
        ratingCaseIds.size === record.ratings.length;
      if (!complete) {
        failures.push({
          subject: record.raterId,
          reason:
            "Incomplete ratings: every sealed case must be rated exactly once with a complete score set and forced choice.",
        });
        continue;
      }
      raterIds.push(record.raterId);
      for (const rating of record.ratings) {
        ratingsByCase.get(rating.caseId)?.push(rating);
      }
    }
  }

  if (failures.length > 0) {
    const exitReasons = [
      `${failures.length} refusal(s); no aggregate output was written.`,
    ];
    if (options.out === null) {
      const defaultOutput = path.join(
        verified.workRootReal,
        COMPARISON_AGGREGATE_FILENAME,
      );
      const stale = await lstat(defaultOutput).catch(() => null);
      if (stale?.isFile() && !stale.isSymbolicLink()) {
        await rm(defaultOutput, { force: true }).catch(() => undefined);
        exitReasons.push(
          `Removed stale default aggregate output so it cannot be mistaken for current: ${defaultOutput}`,
        );
      }
    }
    return {
      aggregate: null,
      aggregatePath: null,
      exitReasons,
      failures,
      ok: false,
    };
  }

  const raterCount = raterIds.length;
  const cases = manifestCases.map((entry) =>
    projectCaseAggregate(
      entry,
      ratingsByCase.get(entry.caseId) ?? [],
      raterCount,
    ),
  );

  const exitReasons: string[] = [];
  const warnings: string[] = [];
  const lostControls = cases.filter(
    (entry) => entry.isControl && entry.winner !== "original",
  );
  for (const control of lostControls) {
    exitReasons.push(
      `Original-win control case ${control.caseId} was not won by the original (winner: ${control.winner}); rater reliability or protocol discipline is compromised.`,
    );
    warnings.push(`control-not-won-by-original:${control.caseId}`);
  }

  const aggregate: ComparisonAggregateOutput = {
    schemaVersion: BLIND_RESUME_COMPARISON_SCHEMA_VERSION,
    kind: COMPARISON_KIND_AGGREGATE,
    generatedAtIso: new Date().toISOString(),
    manifestPath: verified.manifestPath,
    manifestSha256: manifest.manifestSha256,
    raterIds: [...raterIds].sort((left, right) => left.localeCompare(right)),
    caseCount: cases.length,
    controlCaseIds: controlCaseIds.filter((id) => expectedCaseIds.has(id)),
    controlsWonByOriginal: cases.filter(
      (entry) => entry.isControl && entry.winner === "original",
    ).length,
    cases,
    protocolGuarantees: {
      atsScoreAndCallbackClaimsForbidden: true,
      blindingLiftedOnlyHere: true,
      originalWinControlsRequired: true,
    },
    warnings,
  };

  await writeFileAtomic0644(
    aggregatePath,
    `${JSON.stringify(aggregate, null, 2)}\n`,
  );

  return {
    aggregate,
    aggregatePath,
    exitReasons,
    failures: [],
    ok: exitReasons.length === 0,
  };
}

// ---------------------------------------------------------------------------
// CLI parsing.
// ---------------------------------------------------------------------------

function optionValue(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing required ${name}.`);
  }
  return value;
}

function assertKnownCliArgs(args: string[], valuedFlags: string[]): void {
  const allowed = new Set([...valuedFlags, "--help", "-h"]);
  const seenValued = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] as string;
    if (!allowed.has(token)) {
      if (token.startsWith("-")) {
        throw new Error(
          `Unknown blind-resume-comparison CLI argument: ${token}`,
        );
      }
      throw new Error(
        `Unexpected blind-resume-comparison CLI positional: ${token} (only the leading command may be positional)`,
      );
    }
    if (valuedFlags.includes(token)) {
      if (seenValued.has(token)) {
        throw new Error(
          `Duplicate blind-resume-comparison CLI argument: ${token}`,
        );
      }
      seenValued.add(token);
      index += 1;
    }
  }
}

/** Parses the CLI argv into one of the three commands; returns null for
 * --help/-h or an empty argv (the CLI prints help), and throws for malformed
 * input, including flags-first invocations, which must fail nonzero rather
 * than print help as success. */
export function parseBlindResumeComparisonCli(
  args: string[],
): BlindResumeComparisonCliOptions | null {
  if (args.includes("--help") || args.includes("-h")) return null;
  const command = args[0];
  if (command === undefined) return null;
  if (command !== "init" && command !== "record" && command !== "aggregate") {
    if (command.startsWith("-")) {
      throw new Error(
        `Unknown blind-resume-comparison CLI input: ${command} (expected init, record, or aggregate as the first argument)`,
      );
    }
    return null;
  }
  const flags = args.slice(1);
  if (command === "init") {
    assertKnownCliArgs(flags, ["--cases", "--work-root", "--rater-root"]);
    return {
      command,
      casesFile: path.resolve(optionValue(flags, "--cases")),
      raterRoot: path.resolve(optionValue(flags, "--rater-root")),
      workRoot: path.resolve(optionValue(flags, "--work-root")),
    };
  }
  if (command === "record") {
    assertKnownCliArgs(flags, ["--file"]);
    return { command, file: path.resolve(optionValue(flags, "--file")) };
  }
  assertKnownCliArgs(flags, ["--out", "--rater-root", "--work-root"]);
  return {
    command,
    out: args.includes("--out")
      ? path.resolve(optionValue(flags, "--out"))
      : null,
    raterRoot: path.resolve(optionValue(flags, "--rater-root")),
    workRoot: path.resolve(optionValue(flags, "--work-root")),
  };
}

export const BLIND_RESUME_COMPARISON_HELP = `Usage:
  node apps/desktop/scripts/blind-resume-comparison-harness-cli.mjs init \\
    --cases <comparison-cases.json> \\
    --work-root <empty-supervisor-directory> \\
    --rater-root <empty-rater-facing-directory>

  node apps/desktop/scripts/blind-resume-comparison-harness-cli.mjs record \\
    --file <rater-root>/rater-records/<rater-id>.json

  node apps/desktop/scripts/blind-resume-comparison-harness-cli.mjs aggregate \\
    --work-root <supervisor-directory> \\
    --rater-root <rater-facing-directory> [--out <direct-child-of-work-root>.json]

Protocol (docs/TESTING.md, "Blind original-vs-generated resume comparison"):

  init validates the case file (schemaVersion 1, seed, cases with caseId,
  isControl, jobContext, originalText, generatedText, optional
  criticalAnchors), computes four deterministic HARD GATES per case, and
  scaffolds two disjoint fresh directories:
    - work root (supervisor-only): sealed manifest with per-case A/B slot
      assignment derived from sha256(seed:caseId), source texts, and SHA-256
      bindings; plus sources/<caseId>.original.txt / .generated.txt
    - rater root (share with raters): per-case brief plus variant-A.txt /
      variant-B.txt with NO identity information, and the rater record
      template
  Hard gates, in order of authority: factuality (every generated claim must
  be lexically supported by the original; fabricated contacts refused),
  numeric integrity (every number in the generated text must exist in the
  original), omissions (contact data plus declared critical anchors must
  survive tailoring), and ATS parsing/structure (recognizable section
  headers, contact signal, timeline, line lengths, no decorative glyphs or
  control characters). ANY gate violation aborts init and nothing is ever
  shown to a rater. At least one original-win control case (isControl:true)
  is mandatory.

  record validates one filled rater record: independent 1-5 scores per
  variant for relevance, credibility, readability, and specificity, plus a
  MANDATORY forced choice (A or B; ties are not an option) for every case.
  Records may speak of variants only as A and B: identity assertions in any
  text field are refused, as is any attempt to encode ATS-score, callback,
  response-rate, screening, or hiring-outcome claims. Valid records are
  rewritten atomically in canonical form with mode 0644; failed validation
  never touches the original bytes.

  aggregate verifies the manifest self-digest, re-hashes every source and
  every blinded variant (tampering fails closed), re-verifies the recorded
  hard gates against the sealed sources, and refuses unbound, incomplete, or
  identity-leaking ratings and any record whose manifestSha256 does not match
  the seal. Only then does it lift the A/B blinding, compute per-side
  dimension means and forced-choice tallies, and write the aggregate as a
  direct child of the work root. The mandatory original-win controls must be
  present in the seal AND actually won by the original; a lost control writes
  the aggregate yet exits nonzero. Missing or invalid ratings write no
  output and remove a stale default aggregate. The aggregate reports
  descriptive blinded-preference statistics only: it claims nothing about
  ATS scores, callbacks, screening outcomes, or hiring results.

Privacy: resume text is never logged. Errors carry case IDs, key paths,
digests, counts, and capped fragments only. The user's private CV and real
target jobs remain an external, later input; today's corpus is fully
synthetic (apps/desktop/test-fixtures/job-finder/resume-comparison/).
Unrecognized input -- an unknown subcommand or flags-first arguments such as
--foo -- exits nonzero with an error instead of printing help as success.`;
