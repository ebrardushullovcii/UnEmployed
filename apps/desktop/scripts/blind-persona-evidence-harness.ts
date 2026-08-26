import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";

// Blind-persona evidence collection harness (docs/TESTING.md, "Blind persona
// usability rounds"): turns one sealed tester wave into per-persona evidence
// records and one aggregated synthesis input for the parent session.
//
// Commands:
//   init      scaffold one evidence directory plus an empty prefilled record
//             per custody-index persona (canonical complete waves only)
//   record    validate a filled record against the schema and rewrite it back
//             atomically (exclusive temp file -> rename, mode 0644 preserved)
//   aggregate verify every persona has a valid, wave-bound record, emit the
//             synthesis input JSON into the evidence root, and exit nonzero
//             when anything is missing/invalid or any P0 finding exists
//
// Protocol guarantees enforced here:
//   - Complete canonical wave: custody must carry waveComplete:true and
//     exactly P01..P14 once each; incomplete waves fail closed.
//   - Wave binding: aggregate requires every record's waveCustodyPath to
//     resolve to the verified custody index; evidence cannot migrate waves.
//   - Output containment: synthesis output is a direct child of the evidence
//     root and can never replace custody data or persona evidence records.
//
// The record schema intentionally uses self-contained plain-TypeScript
// validators (same style as blind-persona-seed-data.ts): no contracts export
// describes usability-evidence records today. No network, no Electron; pure
// fs plus validation. All emitted text stays ASCII. Severity.evidenceRefs
// stay free-form supplementary pointers; screenshotPaths are the validated
// evidence anchors.

type JsonRecord = Record<string, unknown>;

export const BLIND_PERSONA_EVIDENCE_SCHEMA_VERSION = 1;

export const EVIDENCE_RECORD_FILENAME = "blind-persona-evidence-record.json";

export const SYNTHESIS_OUTPUT_FILENAME =
  "blind-persona-evidence-synthesis-input.json";

export const EVIDENCE_SEVERITY_LEVELS = ["P0", "P1", "P2"] as const;
export type EvidenceSeverityLevel = (typeof EVIDENCE_SEVERITY_LEVELS)[number];

export const EVIDENCE_VERDICTS = ["complete", "blocked", "partial"] as const;
export type EvidencePersonaVerdict = (typeof EVIDENCE_VERDICTS)[number];

/** Ordered top-level keys of one evidence record; order doubles as the
 * canonical on-disk serialization order. */
export const EVIDENCE_RECORD_KEYS = [
  "schemaVersion",
  "personaId",
  "waveCustodyPath",
  "verdict",
  "severities",
  "blockers",
  "journeyStages",
  "firstConfusion",
  "misunderstoodTerms",
  "backtracks",
  "inaccessibleControls",
  "trustConcerns",
  "expectedNextAction",
  "screenshotPaths",
  "rendererErrors",
  "horizontalOverflowFindings",
  "firstPersonVerdict",
] as const;

export type EvidenceRecordKey = (typeof EVIDENCE_RECORD_KEYS)[number];

export interface EvidenceSeverityFinding {
  area: string;
  /** Free-form supplementary pointers (quotes, transcript snippets, shot
   * labels). Not validated as filesystem evidence; screenshotPaths are. */
  evidenceRefs: string[];
  level: EvidenceSeverityLevel;
  summary: string;
}

export interface EvidenceBlockerEntry {
  /** Must reference paths also listed in the top-level screenshotPaths. */
  screenshotPaths: string[];
  stage: string;
  summary: string;
}

export interface EvidenceJourneyStage {
  interactions: number;
  seconds: number;
  stage: string;
}

export interface EvidenceRendererError {
  message: string;
  scenarioHint: string;
}

export interface EvidenceOverflowFinding {
  /** Must reference a path also listed in the top-level screenshotPaths. */
  screenshotPath: string;
  surface: string;
  summary: string;
}

export interface BlindPersonaEvidenceRecord {
  backtracks: number;
  blockers: EvidenceBlockerEntry[];
  expectedNextAction: string;
  firstConfusion: string;
  firstPersonVerdict: string;
  horizontalOverflowFindings: EvidenceOverflowFinding[];
  inaccessibleControls: string[];
  journeyStages: EvidenceJourneyStage[];
  misunderstoodTerms: string[];
  personaId: string;
  rendererErrors: EvidenceRendererError[];
  screenshotPaths: string[];
  schemaVersion: typeof BLIND_PERSONA_EVIDENCE_SCHEMA_VERSION;
  severities: EvidenceSeverityFinding[];
  trustConcerns: string[];
  verdict: EvidencePersonaVerdict;
  waveCustodyPath: string;
}

export interface BlindPersonaCustodyEntry {
  personaId: string;
  seedManifestPath: string;
  seedManifestSha256: string;
  userDataRoot: string;
  workspaceDigest: string;
}

export interface LoadedBlindPersonaCustodyIndex {
  indexPath: string;
  personas: BlindPersonaCustodyEntry[];
  waveComplete: boolean;
}

/** Alias kept intentional: the structure phase performs integrity checks
 * (self-digest, entry shapes, canonical realpath) but no wave-policy
 * diagnostics, so commands can order incomplete-wave versus canonical-set
 * errors deliberately. */
export type VerifiedCustodyStructure = LoadedBlindPersonaCustodyIndex;

export interface InitBlindPersonaEvidenceOptions {
  custodyIndexPath: string;
  evidenceRoot: string;
}

export interface InitBlindPersonaEvidenceDependencies {
  /** Injection seam for tests: defaults to exclusive-create write plus an
   * explicit 0644 chmod. */
  writeRecordFile?: (targetPath: string, contents: string) => Promise<void>;
}

export interface EvidenceScaffoldEntry {
  directory: string;
  personaId: string;
  recordPath: string;
}

export interface InitBlindPersonaEvidenceOutcome {
  created: EvidenceScaffoldEntry[];
  custodyIndexPath: string;
  evidenceRoot: string;
  waveComplete: boolean;
}

export interface RecordBlindPersonaEvidenceOptions {
  file: string;
}

export interface RecordBlindPersonaEvidenceOutcome {
  bytes: number;
  personaId: string;
  recordPath: string;
  screenshotCount: number;
  severityCounts: Record<EvidenceSeverityLevel, number>;
  verdict: EvidencePersonaVerdict;
}

export interface AggregateBlindPersonaEvidenceOptions {
  custodyIndexPath: string;
  evidenceRoot: string;
  out: string | null;
}

export interface AggregateEvidenceFailureRow {
  personaId: string;
  reason: string;
}

export interface SynthesisPersonaProjection {
  backtracks: number;
  blockers: EvidenceBlockerEntry[];
  expectedNextAction: string;
  firstConfusion: string;
  firstPersonVerdict: string;
  /** Derived from horizontalOverflowFindings.length > 0. */
  horizontalOverflow: boolean;
  horizontalOverflowFindings: EvidenceOverflowFinding[];
  inaccessibleControls: string[];
  journeyStages: EvidenceJourneyStage[];
  misunderstoodTerms: string[];
  personaId: string;
  rendererErrors: EvidenceRendererError[];
  screenshotPaths: string[];
  severities: EvidenceSeverityFinding[];
  trustConcerns: string[];
  verdict: EvidencePersonaVerdict;
}

export interface EvidenceSynthesisSummary {
  horizontalOverflowPersonaIds: string[];
  p0Count: number;
  p1Count: number;
  p2Count: number;
  personasWithP0: string[];
  rendererErrorCount: number;
  verdictBlocked: number;
  verdictComplete: number;
  verdictPartial: number;
}

export interface EvidenceSynthesisInput {
  custodyIndexPath: string;
  evidenceRoot: string;
  generatedAtIso: string;
  kind: "blind-persona-evidence-synthesis-input";
  personaCount: number;
  personas: SynthesisPersonaProjection[];
  schemaVersion: typeof BLIND_PERSONA_EVIDENCE_SCHEMA_VERSION;
  summary: EvidenceSynthesisSummary;
  waveComplete: boolean;
}

export interface AggregateBlindPersonaEvidenceOutcome {
  exitReasons: string[];
  failures: AggregateEvidenceFailureRow[];
  ok: boolean;
  synthesis: EvidenceSynthesisInput | null;
  synthesisPath: string | null;
}

export type BlindPersonaEvidenceCliOptions =
  | {
      command: "aggregate";
      custodyIndexPath: string;
      evidenceRoot: string;
      out: string | null;
    }
  | { command: "init"; custodyIndexPath: string; evidenceRoot: string }
  | { command: "record"; file: string };

const personaPattern = /^P(?:0[1-9]|1[0-4])$/u;
const digestPattern = /^[a-f0-9]{64}$/u;
const recordKeySet: ReadonlySet<string> = new Set(EVIDENCE_RECORD_KEYS);

/** The canonical blind-persona wave. This harness exists to collect evidence
 * for exactly this set: every listed custody persona must appear once, and no
 * other persona may appear. */
export const BLIND_PERSONA_CANONICAL_IDS = [
  "P01",
  "P02",
  "P03",
  "P04",
  "P05",
  "P06",
  "P07",
  "P08",
  "P09",
  "P10",
  "P11",
  "P12",
  "P13",
  "P14",
] as const;

const INIT_INCOMPLETE_MESSAGE =
  "Incomplete blind-persona custody (waveComplete:false) cannot initialize canonical persona evidence; prepare and seal the complete canonical wave first.";

const AGGREGATE_INCOMPLETE_MESSAGE =
  "Incomplete blind-persona custody (waveComplete:false) cannot aggregate canonical persona evidence; prepare and seal the complete canonical wave first.";

/** Strict containment: candidate must resolve strictly inside parent (the
 * parent path itself does not count). Both paths are resolved first. */
function isStrictlyInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function canonicalParentOrThrow(candidate: string): Promise<string> {
  const parent = path.dirname(candidate);
  const parentReal = await realpath(parent).catch((error: unknown) => {
    throw new Error(
      `Evidence root parent must be an existing directory: ${parent}`,
      { cause: error },
    );
  });
  const parentStat = await stat(parentReal).catch((error: unknown) => {
    throw new Error(
      `Evidence root parent must be an existing directory: ${parent}`,
      { cause: error },
    );
  });
  if (!parentStat.isDirectory()) {
    throw new Error(
      `Evidence root parent must be an existing directory: ${parent}`,
    );
  }
  return parentReal;
}

export class EvidenceValidationError extends Error {
  readonly problems: string[];

  constructor(problems: readonly string[]) {
    super(
      `Blind-persona evidence validation failed (${problems.length} problem(s)):\n- ${problems.join("\n- ")}`,
    );
    this.name = "EvidenceValidationError";
    this.problems = [...problems];
  }
}

function isPlainObject(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** UTF-16 code-unit key order — byte-identical to the default Array#sort
 * used by the custody writer and tester verifiers (stableJson/digestSeed).
 * Never localeCompare here: collation is ICU/locale-dependent and diverges on
 * mixed-case/underscore/non-ASCII keys, which would produce false
 * custody-digest rejections. */
function compareCodeUnitOrder(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCodeUnitOrder(left, right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

/** Canonical serialization shared with the seeder/custody tooling: recursively
 * key-sorted (UTF-16 code-unit order) JSON without whitespace. */
export function stableEvidenceSerialization(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
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

function readEnum<T extends string>(
  source: JsonRecord,
  key: string,
  allowed: readonly T[],
  problems: string[],
): T {
  const raw = source[key];
  if (typeof raw !== "string" || !allowed.includes(raw as T)) {
    problems.push(
      `${key} must be one of ${allowed.join("|")} but was ${JSON.stringify(raw ?? null)}.`,
    );
    return allowed[0] as T;
  }
  return raw as T;
}

function readNonNegativeInteger(
  source: JsonRecord,
  key: string,
  problems: string[],
): number {
  const raw = source[key];
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0) {
    problems.push(`${key} must be a non-negative integer.`);
    return 0;
  }
  return raw;
}

function readNonNegativeSeconds(
  source: JsonRecord,
  key: string,
  problems: string[],
): number {
  const raw = source[key];
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    problems.push(`${key} must be a finite number of seconds >= 0.`);
    return 0;
  }
  return raw;
}

function readNonEmptyStringArray(
  source: JsonRecord,
  key: string,
  problems: string[],
): string[] {
  const raw = source[key];
  if (!Array.isArray(raw)) {
    problems.push(`${key} must be an array of non-empty strings.`);
    return [];
  }
  const entries: string[] = [];
  raw.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      problems.push(`${key}[${index}] must be a non-empty string.`);
      return;
    }
    entries.push(entry);
  });
  return entries;
}

/** Validates one screenshot-path list: relative-only, no upward traversal,
 * must exist as regular files, and must stay strictly inside the persona
 * record directory after symlink resolution. Nested subdirectories are
 * allowed. */
async function validateScreenshotPathList(
  entries: readonly string[],
  screenshotBaseDir: string,
  labelPrefix: string,
  problems: string[],
): Promise<void> {
  await Promise.all(
    entries.map(async (entry, index) => {
      const label = `${labelPrefix}[${index}]`;
      if (path.isAbsolute(entry)) {
        problems.push(
          `${label} must be a relative path inside the persona record directory.`,
        );
        return;
      }
      if (entry.split(/[\\/]+/u).includes("..")) {
        problems.push(`${label} must not contain ".." segments: ${entry}`);
        return;
      }
      const candidate = path.resolve(screenshotBaseDir, entry);
      try {
        const info = await stat(candidate);
        if (!info.isFile()) {
          problems.push(`${label} is not a regular file: ${candidate}`);
          return;
        }
        const [realCandidate, realBase] = await Promise.all([
          realpath(candidate),
          realpath(screenshotBaseDir),
        ]);
        if (!isStrictlyInside(realBase, realCandidate)) {
          problems.push(
            `${label} resolves outside the persona record directory: ${candidate}`,
          );
        }
      } catch {
        problems.push(`${label} does not exist on disk: ${candidate}`);
      }
    }),
  );
}

/** Validates one parsed evidence-record value against the docs/TESTING.md
 * blind-persona record requirements. Screenshot paths are resolved against
 * screenshotBaseDir and must exist on disk as regular files right now.
 * Unknown fields are rejected; every collected problem is reported together. */
export async function validateEvidenceRecordValue(
  value: unknown,
  screenshotBaseDir: string,
): Promise<BlindPersonaEvidenceRecord> {
  if (!isPlainObject(value)) {
    throw new EvidenceValidationError([
      "Evidence record must be a JSON object.",
    ]);
  }
  const problems: string[] = [];
  const presentKeys = Object.keys(value);
  for (const key of EVIDENCE_RECORD_KEYS) {
    if (!(key in value)) problems.push(`Missing required field: ${key}.`);
  }
  for (const key of presentKeys) {
    if (!recordKeySet.has(key)) {
      problems.push(`Unknown field is not allowed: ${key}.`);
    }
  }

  const schemaVersion = value.schemaVersion;
  if (schemaVersion !== BLIND_PERSONA_EVIDENCE_SCHEMA_VERSION) {
    problems.push(
      `schemaVersion must be ${BLIND_PERSONA_EVIDENCE_SCHEMA_VERSION}.`,
    );
  }
  const personaIdRaw = value.personaId;
  if (typeof personaIdRaw !== "string" || !personaPattern.test(personaIdRaw)) {
    problems.push(
      "personaId must match P01 through P14 (canonical blind-persona ID).",
    );
  }
  // Shape only: the record command may run offline; aggregate is the
  // authority that binds this path to the verified custody index.
  const waveCustodyPath = readNonEmptyString(
    value,
    "waveCustodyPath",
    problems,
  );
  const verdict = readEnum(value, "verdict", EVIDENCE_VERDICTS, problems);

  const severities: EvidenceSeverityFinding[] = [];
  const severitiesRaw = value.severities;
  if (!Array.isArray(severitiesRaw)) {
    problems.push("severities must be an array.");
  } else {
    severitiesRaw.forEach((entry, index) => {
      const label = `severities[${index}]`;
      if (!isPlainObject(entry)) {
        problems.push(`${label} must be an object.`);
        return;
      }
      const entryProblems: string[] = [];
      const level = readEnum(
        entry,
        "level",
        EVIDENCE_SEVERITY_LEVELS,
        entryProblems,
      );
      const area = readNonEmptyString(entry, "area", entryProblems);
      const summary = readNonEmptyString(entry, "summary", entryProblems);
      const evidenceRefs = readNonEmptyStringArray(
        entry,
        "evidenceRefs",
        entryProblems,
      );
      collectUnknownFieldProblems(
        entry,
        ["level", "area", "summary", "evidenceRefs"],
        label,
        entryProblems,
      );
      for (const entryProblem of entryProblems) {
        problems.push(`${label}: ${entryProblem}`);
      }
      if (entryProblems.length === 0) {
        severities.push({ area, evidenceRefs, level, summary });
      }
    });
  }

  const blockers: EvidenceBlockerEntry[] = [];
  const blockersRaw = value.blockers;
  if (!Array.isArray(blockersRaw)) {
    problems.push("blockers must be an array.");
  } else {
    blockersRaw.forEach((entry, index) => {
      const label = `blockers[${index}]`;
      if (!isPlainObject(entry)) {
        problems.push(`${label} must be an object.`);
        return;
      }
      const entryProblems: string[] = [];
      const summary = readNonEmptyString(entry, "summary", entryProblems);
      const stage = readNonEmptyString(entry, "stage", entryProblems);
      const screenshotPaths = readNonEmptyStringArray(
        entry,
        "screenshotPaths",
        entryProblems,
      );
      collectUnknownFieldProblems(
        entry,
        ["summary", "stage", "screenshotPaths"],
        label,
        entryProblems,
      );
      for (const entryProblem of entryProblems) {
        problems.push(`${label}: ${entryProblem}`);
      }
      if (entryProblems.length === 0) {
        blockers.push({ screenshotPaths, stage, summary });
      }
    });
  }

  const journeyStages: EvidenceJourneyStage[] = [];
  const journeyStagesRaw = value.journeyStages;
  if (!Array.isArray(journeyStagesRaw)) {
    problems.push("journeyStages must be an array.");
  } else {
    journeyStagesRaw.forEach((entry, index) => {
      const label = `journeyStages[${index}]`;
      if (!isPlainObject(entry)) {
        problems.push(`${label} must be an object.`);
        return;
      }
      const entryProblems: string[] = [];
      const stage = readNonEmptyString(entry, "stage", entryProblems);
      const seconds = readNonNegativeSeconds(entry, "seconds", entryProblems);
      const interactions = readNonNegativeInteger(
        entry,
        "interactions",
        entryProblems,
      );
      collectUnknownFieldProblems(
        entry,
        ["stage", "seconds", "interactions"],
        label,
        entryProblems,
      );
      for (const entryProblem of entryProblems) {
        problems.push(`${label}: ${entryProblem}`);
      }
      if (entryProblems.length === 0) {
        journeyStages.push({ interactions, seconds, stage });
      }
    });
  }

  const firstConfusion = readNonEmptyString(value, "firstConfusion", problems);
  const misunderstoodTerms = readNonEmptyStringArray(
    value,
    "misunderstoodTerms",
    problems,
  );
  const backtracks = readNonNegativeInteger(value, "backtracks", problems);
  const inaccessibleControls = readNonEmptyStringArray(
    value,
    "inaccessibleControls",
    problems,
  );
  const trustConcerns = readNonEmptyStringArray(
    value,
    "trustConcerns",
    problems,
  );
  const expectedNextAction = readNonEmptyString(
    value,
    "expectedNextAction",
    problems,
  );

  const screenshotPaths = readNonEmptyStringArray(
    value,
    "screenshotPaths",
    problems,
  );
  await validateScreenshotPathList(
    screenshotPaths,
    screenshotBaseDir,
    "screenshotPaths",
    problems,
  );

  const rendererErrors: EvidenceRendererError[] = [];
  const rendererErrorsRaw = value.rendererErrors;
  if (!Array.isArray(rendererErrorsRaw)) {
    problems.push("rendererErrors must be an array.");
  } else {
    rendererErrorsRaw.forEach((entry, index) => {
      const label = `rendererErrors[${index}]`;
      if (!isPlainObject(entry)) {
        problems.push(`${label} must be an object.`);
        return;
      }
      const entryProblems: string[] = [];
      const message = readNonEmptyString(entry, "message", entryProblems);
      const scenarioHint = readNonEmptyString(
        entry,
        "scenarioHint",
        entryProblems,
      );
      collectUnknownFieldProblems(
        entry,
        ["message", "scenarioHint"],
        label,
        entryProblems,
      );
      for (const entryProblem of entryProblems) {
        problems.push(`${label}: ${entryProblem}`);
      }
      if (entryProblems.length === 0) {
        rendererErrors.push({ message, scenarioHint });
      }
    });
  }

  const horizontalOverflowFindings: EvidenceOverflowFinding[] = [];
  const findingsRaw = value.horizontalOverflowFindings;
  if (!Array.isArray(findingsRaw)) {
    problems.push("horizontalOverflowFindings must be an array.");
  } else {
    findingsRaw.forEach((entry, index) => {
      const label = `horizontalOverflowFindings[${index}]`;
      if (!isPlainObject(entry)) {
        problems.push(`${label} must be an object.`);
        return;
      }
      const entryProblems: string[] = [];
      const surface = readNonEmptyString(entry, "surface", entryProblems);
      const summary = readNonEmptyString(entry, "summary", entryProblems);
      const screenshotPath = readNonEmptyString(
        entry,
        "screenshotPath",
        entryProblems,
      );
      collectUnknownFieldProblems(
        entry,
        ["surface", "summary", "screenshotPath"],
        label,
        entryProblems,
      );
      for (const entryProblem of entryProblems) {
        problems.push(`${label}: ${entryProblem}`);
      }
      if (entryProblems.length === 0) {
        horizontalOverflowFindings.push({ screenshotPath, summary, surface });
      }
    });
  }

  const firstPersonVerdict = readNonEmptyString(
    value,
    "firstPersonVerdict",
    problems,
  );

  // Verdict/blocker coupling rules.
  if (verdict === "blocked") {
    if (blockers.length === 0) {
      problems.push(
        'verdict "blocked" requires at least one blockers entry describing what blocked the session.',
      );
    }
    if (severities.length === 0) {
      problems.push(
        'verdict "blocked" requires at least one severity finding.',
      );
    }
  }
  if (verdict === "complete" && blockers.length > 0) {
    problems.push('verdict "complete" requires an empty blockers array.');
  }
  for (const [index, blocker] of blockers.entries()) {
    validateBlockerScreenshotMembership(
      blocker,
      screenshotPaths,
      index,
      problems,
    );
  }
  for (const [index, finding] of horizontalOverflowFindings.entries()) {
    if (!screenshotPaths.includes(finding.screenshotPath)) {
      problems.push(
        `horizontalOverflowFindings[${index}].screenshotPath must reference a path listed in the top-level screenshotPaths: ${finding.screenshotPath}`,
      );
    }
  }

  if (problems.length > 0) throw new EvidenceValidationError(problems);

  return {
    backtracks,
    blockers,
    expectedNextAction,
    firstConfusion,
    firstPersonVerdict,
    horizontalOverflowFindings,
    inaccessibleControls,
    journeyStages,
    misunderstoodTerms,
    personaId: typeof personaIdRaw === "string" ? personaIdRaw : "",
    rendererErrors,
    screenshotPaths,
    schemaVersion: BLIND_PERSONA_EVIDENCE_SCHEMA_VERSION,
    severities,
    trustConcerns,
    verdict,
    waveCustodyPath,
  };
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

function validateBlockerScreenshotMembership(
  blocker: EvidenceBlockerEntry,
  screenshotPaths: readonly string[],
  index: number,
  problems: string[],
): void {
  if (blocker.screenshotPaths.length === 0) {
    problems.push(
      `blockers[${index}].screenshotPaths must contain at least one screenshot path.`,
    );
    return;
  }
  for (const [refIndex, ref] of blocker.screenshotPaths.entries()) {
    if (!screenshotPaths.includes(ref)) {
      problems.push(
        `blockers[${index}].screenshotPaths[${refIndex}] must reference a path listed in the top-level screenshotPaths: ${ref}`,
      );
    }
  }
}

/** Serializes an evidence-record-shaped value with fixed key order plus a
 * trailing newline. Used for scaffolds and for normalized record rewrites. */
export function orderedEvidenceRecordJson(value: object): string {
  const source = value as JsonRecord;
  const ordered: JsonRecord = {};
  for (const key of EVIDENCE_RECORD_KEYS) {
    ordered[key] = source[key];
  }
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** Empty prefilled scaffold: structurally complete on purpose but not yet a
 * valid filled record (meaningful strings stay empty until the tester fills
 * them in), so recording it before the session data exists fails closed. */
export function scaffoldEvidenceRecord(
  personaId: string,
  waveCustodyPath: string,
): Record<string, unknown> {
  return {
    schemaVersion: BLIND_PERSONA_EVIDENCE_SCHEMA_VERSION,
    personaId,
    waveCustodyPath,
    verdict: "",
    severities: [],
    blockers: [],
    journeyStages: [],
    firstConfusion: "",
    misunderstoodTerms: [],
    backtracks: 0,
    inaccessibleControls: [],
    trustConcerns: [],
    expectedNextAction: "",
    screenshotPaths: [],
    rendererErrors: [],
    horizontalOverflowFindings: [],
    firstPersonVerdict: "",
  };
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

/**
 * Structure phase of custody verification: verifies the self-digest over the
 * canonically serialized subject, requires a boolean waveComplete and
 * well-formed persona entries, and canonicalizes the index path via realpath.
 * It intentionally performs NO wave-policy diagnostics (completeness,
 * canonical coverage) so commands can order those errors deliberately.
 */
export async function loadVerifiedCustodyStructure(
  custodyIndexPath: string,
): Promise<VerifiedCustodyStructure> {
  const resolvedIndexPath = path.resolve(custodyIndexPath);
  const bytes = await readFile(resolvedIndexPath).catch((error: unknown) => {
    throw new Error(`Unable to read custody index ${resolvedIndexPath}.`, {
      cause: error,
    });
  });
  const indexPath = await realpath(resolvedIndexPath);
  const index = await parseJsonContent(bytes.toString("utf8"), indexPath);
  const recordedDigest = index.custodyIndexSha256;
  if (
    typeof recordedDigest !== "string" ||
    !digestPattern.test(recordedDigest)
  ) {
    throw new Error(
      `Custody index ${indexPath} is missing a valid custodyIndexSha256.`,
    );
  }
  const subject = { ...index };
  delete subject.custodyIndexSha256;
  const actualDigest = sha256Hex(stableEvidenceSerialization(subject));
  if (actualDigest !== recordedDigest) {
    throw new Error(
      `Custody index self-digest mismatch for ${indexPath}: expected ${recordedDigest}, computed ${actualDigest}.`,
    );
  }
  if (index.waveComplete !== true && index.waveComplete !== false) {
    throw new Error(`Custody index ${indexPath} needs a boolean waveComplete.`);
  }
  if (!Array.isArray(index.personas)) {
    throw new Error(`Custody index ${indexPath} needs a personas array.`);
  }
  const personas: BlindPersonaCustodyEntry[] = [];
  index.personas.forEach((rawEntry, index2) => {
    const label = `personas[${index2}]`;
    if (!isPlainObject(rawEntry)) {
      throw new Error(`Custody index ${label} must be an object.`);
    }
    const personaId = rawEntry.personaId;
    if (typeof personaId !== "string" || !personaPattern.test(personaId)) {
      throw new Error(
        `Custody index ${label} has an unsupported blind persona ID: ${JSON.stringify(
          rawEntry.personaId ?? null,
        )}; the canonical wave is P01 through P14 only.`,
      );
    }
    for (const key of ["seedManifestPath", "userDataRoot"] as const) {
      const entryValue = rawEntry[key];
      if (typeof entryValue !== "string" || entryValue.trim().length === 0) {
        throw new Error(`Custody index ${label} needs a non-empty ${key}.`);
      }
    }
    for (const key of ["seedManifestSha256", "workspaceDigest"] as const) {
      const entryValue = rawEntry[key];
      if (typeof entryValue !== "string" || !digestPattern.test(entryValue)) {
        throw new Error(
          `Custody index ${label} needs a lowercase SHA-256 ${key}.`,
        );
      }
    }
    personas.push({
      personaId,
      seedManifestPath: String(rawEntry.seedManifestPath),
      seedManifestSha256: String(rawEntry.seedManifestSha256),
      userDataRoot: String(rawEntry.userDataRoot),
      workspaceDigest: String(rawEntry.workspaceDigest),
    });
  });
  personas.sort((left, right) => left.personaId.localeCompare(right.personaId));
  return {
    indexPath,
    personas,
    waveComplete: index.waveComplete === true,
  };
}

/** Canonical-wave contract: exactly P01..P14 once each. A subset or a
 * duplicated entry must never produce a complete synthesis input. */
export function assertCanonicalBlindPersonaCoverage(
  personas: readonly BlindPersonaCustodyEntry[],
): void {
  const counts = new Map<string, number>();
  for (const entry of personas) {
    counts.set(entry.personaId, (counts.get(entry.personaId) ?? 0) + 1);
  }
  const missing = BLIND_PERSONA_CANONICAL_IDS.filter((id) => !counts.has(id));
  const duplicated = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
  if (missing.length > 0 || duplicated.length > 0) {
    throw new Error(
      `Custody index does not carry the canonical blind-persona wave exactly once each (P01 through P14); missing: ${
        missing.length > 0 ? missing.join(", ") : "none"
      }; duplicated: ${duplicated.length > 0 ? duplicated.join(", ") : "none"}.`,
    );
  }
}

/** Combined verification: structure integrity plus canonical coverage. Does
 * not gate waveComplete (policy belongs to the commands). */
export async function loadVerifiedBlindPersonaCustodyIndex(
  custodyIndexPath: string,
): Promise<LoadedBlindPersonaCustodyIndex> {
  const structure = await loadVerifiedCustodyStructure(custodyIndexPath);
  assertCanonicalBlindPersonaCoverage(structure.personas);
  return structure;
}

/** Atomic replacement write used for records and synthesis output: exclusive
 * temp file in the target directory (wx never clobbers), explicit 0644, then
 * rename over the target so readers never observe a partial file. Callers
 * needing crash durability must fsync separately; this routine makes no
 * fsync claim. */
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

async function readAndValidateEvidenceRecordFile(
  recordPath: string,
): Promise<BlindPersonaEvidenceRecord> {
  const resolved = path.resolve(recordPath);
  const bytes = await readFile(resolved).catch((error: unknown) => {
    throw new Error(`Unable to read evidence record ${resolved}.`, {
      cause: error,
    });
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`Evidence record ${resolved} is not valid JSON.`, {
      cause: error,
    });
  }
  return validateEvidenceRecordValue(parsed, path.dirname(resolved));
}

/** init: scaffold one directory plus one empty prefilled record per custody
 * index entry. Refuses incomplete waves, non-canonical persona sets,
 * symlinked path segments, and existing persona directories (all-or-nothing
 * preflight; a mid-flight failure rolls back directories it created). */
export async function initBlindPersonaEvidence(
  options: InitBlindPersonaEvidenceOptions,
  dependencies: InitBlindPersonaEvidenceDependencies = {},
): Promise<InitBlindPersonaEvidenceOutcome> {
  const custody = await loadVerifiedCustodyStructure(options.custodyIndexPath);
  if (!custody.waveComplete) {
    throw new Error(INIT_INCOMPLETE_MESSAGE);
  }
  assertCanonicalBlindPersonaCoverage(custody.personas);
  const evidenceRoot = path.resolve(options.evidenceRoot);
  // Fresh-root protocol: the evidence root must not exist yet (a pre-existing
  // entry could be a symlink redirect or stale scaffolding), and its parent
  // must resolve to an existing directory. System-level ancestor prefixes
  // (for example macOS /var -> /private/var) are intentionally tolerated;
  // containment elsewhere relies on realpath comparisons.
  await canonicalParentOrThrow(evidenceRoot);
  const existingRoot = await lstat(evidenceRoot).catch(() => null);
  if (existingRoot !== null) {
    throw new Error(
      `Evidence root already exists; init requires a fresh empty directory per wave: ${evidenceRoot}`,
    );
  }
  await mkdir(evidenceRoot);
  const planned: EvidenceScaffoldEntry[] = custody.personas.map((entry) => {
    const directory = path.join(evidenceRoot, entry.personaId);
    return {
      directory,
      personaId: entry.personaId,
      recordPath: path.join(directory, EVIDENCE_RECORD_FILENAME),
    };
  });
  for (const entry of planned) {
    if (
      await stat(entry.directory)
        .then(() => true)
        .catch(() => false)
    ) {
      throw new Error(
        `Evidence directory already exists for ${entry.personaId}: ${entry.directory}; refusing to clobber existing scaffolding.`,
      );
    }
  }
  const writeRecordFile =
    dependencies.writeRecordFile ??
    (async (targetPath: string, contents: string) => {
      await writeFile(targetPath, contents, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o644,
      });
      await chmod(targetPath, 0o644);
    });
  const created: EvidenceScaffoldEntry[] = [];
  try {
    for (const entry of planned) {
      await mkdir(entry.directory);
      // Register before writing so a failed record write rolls the fresh
      // directory back as well.
      created.push(entry);
      await writeRecordFile(
        entry.recordPath,
        orderedEvidenceRecordJson(
          scaffoldEvidenceRecord(entry.personaId, custody.indexPath),
        ),
      );
    }
  } catch (error) {
    // Roll back everything this invocation created so a half-initialized
    // evidence root can never be mistaken for scaffolding progress.
    for (const entry of [...created].reverse()) {
      await rm(entry.directory, { force: true, recursive: true }).catch(
        () => undefined,
      );
    }
    throw new Error(
      `Evidence scaffolding aborted and rolled back after ${created.length} persona directory(ies): ${
        created.map((entry) => entry.personaId).join(", ") || "none"
      }.`,
      { cause: error },
    );
  }
  return {
    created,
    custodyIndexPath: custody.indexPath,
    evidenceRoot,
    waveComplete: custody.waveComplete,
  };
}

/** record: validate the filled record file against the schema (including
 * on-disk screenshot existence) and rewrite it back atomically in canonical
 * form with mode 0644. A failed validation never touches the original bytes.
 * Shape-only by design: wave binding is aggregate's authority. */
export async function recordBlindPersonaEvidence(
  options: RecordBlindPersonaEvidenceOptions,
): Promise<RecordBlindPersonaEvidenceOutcome> {
  const recordPath = path.resolve(options.file);
  const record = await readAndValidateEvidenceRecordFile(recordPath);
  const serialized = orderedEvidenceRecordJson(record);
  await writeFileAtomic0644(recordPath, serialized);
  const severityCounts: Record<EvidenceSeverityLevel, number> = {
    P0: 0,
    P1: 0,
    P2: 0,
  };
  for (const finding of record.severities) {
    severityCounts[finding.level] += 1;
  }
  return {
    bytes: Buffer.byteLength(serialized, "utf8"),
    personaId: record.personaId,
    recordPath,
    screenshotCount: record.screenshotPaths.length,
    severityCounts,
    verdict: record.verdict,
  };
}

function projectSynthesisPersona(
  record: BlindPersonaEvidenceRecord,
): SynthesisPersonaProjection {
  return {
    backtracks: record.backtracks,
    blockers: record.blockers.map((entry) => ({
      screenshotPaths: [...entry.screenshotPaths],
      stage: entry.stage,
      summary: entry.summary,
    })),
    expectedNextAction: record.expectedNextAction,
    firstConfusion: record.firstConfusion,
    firstPersonVerdict: record.firstPersonVerdict,
    horizontalOverflow: record.horizontalOverflowFindings.length > 0,
    horizontalOverflowFindings: record.horizontalOverflowFindings.map(
      (entry) => ({ ...entry }),
    ),
    inaccessibleControls: [...record.inaccessibleControls],
    journeyStages: record.journeyStages.map((entry) => ({ ...entry })),
    misunderstoodTerms: [...record.misunderstoodTerms],
    personaId: record.personaId,
    rendererErrors: record.rendererErrors.map((entry) => ({ ...entry })),
    screenshotPaths: [...record.screenshotPaths],
    severities: record.severities.map((entry) => ({
      area: entry.area,
      evidenceRefs: [...entry.evidenceRefs],
      level: entry.level,
      summary: entry.summary,
    })),
    trustConcerns: [...record.trustConcerns],
    verdict: record.verdict,
  };
}

/** Resolves and contains the synthesis output path: a direct child of the
 * canonical evidence root (the default when --out is omitted), never an
 * existing symlink, never an evidence-record filename. */
async function resolveContainedSynthesisOutput(
  evidenceRootReal: string,
  out: string | null,
): Promise<string> {
  const requested =
    out === null
      ? path.join(evidenceRootReal, SYNTHESIS_OUTPUT_FILENAME)
      : path.resolve(out);
  const parent = path.dirname(requested);
  let parentReal: string;
  try {
    parentReal = await realpath(parent);
  } catch (error) {
    throw new Error(`Synthesis output directory does not exist: ${parent}`, {
      cause: error,
    });
  }
  if (parentReal !== evidenceRootReal) {
    throw new Error(
      `Synthesis output must be a direct child of the canonical evidence root (${evidenceRootReal}): ${requested}`,
    );
  }
  const existing = await lstat(requested).catch(() => null);
  if (existing?.isSymbolicLink()) {
    throw new Error(
      `Synthesis output path is an existing symlink; refusing to write through it: ${requested}`,
    );
  }
  if (path.basename(requested) === EVIDENCE_RECORD_FILENAME) {
    throw new Error(
      `Synthesis output must never overwrite an evidence record: ${requested}`,
    );
  }
  return requested;
}

/** aggregate: verify every custody persona has a valid, wave-bound evidence
 * record under the evidence root, then emit the synthesis input. Missing or
 * invalid records produce a failed outcome with per-persona reasons and no
 * synthesis; a stale default synthesis inside the evidence root is removed so
 * it cannot be mistaken for current output. When every record is valid but
 * any P0 finding exists, the synthesis is still written and the outcome stays
 * failed so the caller cannot silently proceed. Personas are always ordered
 * P01..P14 by custody-entry sort. */
export async function aggregateBlindPersonaEvidence(
  options: AggregateBlindPersonaEvidenceOptions,
): Promise<AggregateBlindPersonaEvidenceOutcome> {
  const custody = await loadVerifiedCustodyStructure(options.custodyIndexPath);
  if (!custody.waveComplete) {
    throw new Error(AGGREGATE_INCOMPLETE_MESSAGE);
  }
  assertCanonicalBlindPersonaCoverage(custody.personas);
  const evidenceRoot = path.resolve(options.evidenceRoot);
  const evidenceRootStat = await stat(evidenceRoot).catch((error: unknown) => {
    throw new Error(`Evidence root does not exist: ${evidenceRoot}`, {
      cause: error,
    });
  });
  if (!evidenceRootStat.isDirectory()) {
    throw new Error(`Evidence root is not a directory: ${evidenceRoot}`);
  }
  const evidenceRootReal = await realpath(evidenceRoot);
  const synthesisPath = await resolveContainedSynthesisOutput(
    evidenceRootReal,
    options.out,
  );
  const failures: AggregateEvidenceFailureRow[] = [];
  const projections: SynthesisPersonaProjection[] = [];
  for (const entry of custody.personas) {
    const recordPath = path.join(
      evidenceRoot,
      entry.personaId,
      EVIDENCE_RECORD_FILENAME,
    );
    let record: BlindPersonaEvidenceRecord;
    try {
      record = await readAndValidateEvidenceRecordFile(recordPath);
    } catch (error) {
      failures.push({
        personaId: entry.personaId,
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (record.personaId !== entry.personaId) {
      failures.push({
        personaId: entry.personaId,
        reason: `Evidence record personaId mismatch: record says ${record.personaId} but custody entry is ${entry.personaId}.`,
      });
      continue;
    }
    // Authoritative wave binding: the record must name this exact custody
    // index (canonical realpath), preventing cross-wave evidence reuse.
    const recordBinding = await realpath(record.waveCustodyPath).catch(
      () => null,
    );
    if (recordBinding !== custody.indexPath) {
      failures.push({
        personaId: entry.personaId,
        reason: `Wave binding mismatch: record.waveCustodyPath resolves to ${
          recordBinding ?? "<unresolvable>"
        } but this aggregation is bound to ${custody.indexPath}.`,
      });
      continue;
    }
    projections.push(projectSynthesisPersona(record));
  }
  if (failures.length > 0) {
    const exitReasons = [
      `${failures.length} persona record(s) missing or invalid; no synthesis output was written.`,
    ];
    // Fail closed against stale derived output: only the default synthesis
    // path inside our own evidence root is ever touched.
    if (options.out === null) {
      const defaultOutput = path.join(
        evidenceRootReal,
        SYNTHESIS_OUTPUT_FILENAME,
      );
      const stale = await lstat(defaultOutput).catch(() => null);
      if (stale?.isFile() && !stale.isSymbolicLink()) {
        await rm(defaultOutput, { force: true }).catch(() => undefined);
        exitReasons.push(
          `Removed stale default synthesis output so it cannot be mistaken for current: ${defaultOutput}`,
        );
      }
    }
    return {
      exitReasons,
      failures,
      ok: false,
      synthesis: null,
      synthesisPath: null,
    };
  }

  const p0Findings = projections.flatMap((projection) =>
    projection.severities
      .filter((finding) => finding.level === "P0")
      .map((finding) => ({ finding, personaId: projection.personaId })),
  );
  const exitReasons: string[] = [];
  if (p0Findings.length > 0) {
    exitReasons.push(
      `${p0Findings.length} P0 finding(s) present across persona(s): ${[
        ...new Set(p0Findings.map((entry) => entry.personaId)),
      ].join(", ")}.`,
    );
  }

  const summary: EvidenceSynthesisSummary = {
    horizontalOverflowPersonaIds: projections
      .filter((projection) => projection.horizontalOverflow)
      .map((projection) => projection.personaId),
    p0Count: 0,
    p1Count: 0,
    p2Count: 0,
    personasWithP0: [...new Set(p0Findings.map((entry) => entry.personaId))],
    rendererErrorCount: projections.reduce(
      (total, projection) => total + projection.rendererErrors.length,
      0,
    ),
    verdictBlocked: projections.filter((p) => p.verdict === "blocked").length,
    verdictComplete: projections.filter((p) => p.verdict === "complete").length,
    verdictPartial: projections.filter((p) => p.verdict === "partial").length,
  };
  for (const projection of projections) {
    for (const finding of projection.severities) {
      if (finding.level === "P0") summary.p0Count += 1;
      else if (finding.level === "P1") summary.p1Count += 1;
      else summary.p2Count += 1;
    }
  }

  const synthesis: EvidenceSynthesisInput = {
    custodyIndexPath: custody.indexPath,
    evidenceRoot: evidenceRootReal,
    generatedAtIso: new Date().toISOString(),
    kind: "blind-persona-evidence-synthesis-input",
    personaCount: projections.length,
    personas: projections,
    schemaVersion: BLIND_PERSONA_EVIDENCE_SCHEMA_VERSION,
    summary,
    waveComplete: custody.waveComplete,
  };

  await mkdir(path.dirname(synthesisPath), { recursive: true });
  await writeFileAtomic0644(
    synthesisPath,
    `${JSON.stringify(synthesis, null, 2)}\n`,
  );

  return {
    exitReasons,
    failures: [],
    ok: exitReasons.length === 0,
    synthesis,
    synthesisPath,
  };
}

function optionValue(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing required ${name}.`);
  }
  return value;
}

function assertKnownCliArgs(
  args: string[],
  valuedFlags: string[],
  booleanFlags: string[],
): void {
  const allowed = new Set([...valuedFlags, ...booleanFlags, "--help", "-h"]);
  const seenValued = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] as string;
    if (!allowed.has(token)) {
      if (token.startsWith("-")) {
        throw new Error(
          `Unknown blind-persona-evidence CLI argument: ${token}`,
        );
      }
      throw new Error(
        `Unexpected blind-persona-evidence CLI positional: ${token} (only the leading command may be positional)`,
      );
    }
    if (valuedFlags.includes(token)) {
      if (seenValued.has(token)) {
        throw new Error(
          `Duplicate blind-persona-evidence CLI argument: ${token}`,
        );
      }
      seenValued.add(token);
      index += 1;
    }
  }
}

/** Parses the CLI argv into one of the three commands; returns null for
 * --help/-h or an empty argv (the CLI prints help), and throws for any other
 * malformed input -- including flags-first invocations with no leading
 * subcommand, which must fail nonzero rather than print help as success. */
export function parseBlindPersonaEvidenceCli(
  args: string[],
): BlindPersonaEvidenceCliOptions | null {
  if (args.includes("--help") || args.includes("-h")) return null;
  const command = args[0];
  if (command === undefined) return null;
  if (command !== "init" && command !== "record" && command !== "aggregate") {
    if (command.startsWith("-")) {
      throw new Error(
        `Unknown blind-persona-evidence CLI input: ${command} (expected init, record, or aggregate as the first argument)`,
      );
    }
    return null;
  }
  const flags = args.slice(1);
  if (command === "init") {
    assertKnownCliArgs(flags, ["--custody-index", "--evidence-root"], []);
    return {
      command,
      custodyIndexPath: path.resolve(optionValue(flags, "--custody-index")),
      evidenceRoot: path.resolve(optionValue(flags, "--evidence-root")),
    };
  }
  if (command === "record") {
    assertKnownCliArgs(flags, ["--file"], []);
    return { command, file: path.resolve(optionValue(flags, "--file")) };
  }
  assertKnownCliArgs(
    flags,
    ["--custody-index", "--evidence-root", "--out"],
    [],
  );
  return {
    command,
    custodyIndexPath: path.resolve(optionValue(flags, "--custody-index")),
    evidenceRoot: path.resolve(optionValue(flags, "--evidence-root")),
    out: args.includes("--out")
      ? path.resolve(optionValue(flags, "--out"))
      : null,
  };
}

export const BLIND_PERSONA_EVIDENCE_HELP = `Usage:
  node apps/desktop/scripts/blind-persona-evidence-harness-cli.mjs init \\
    --custody-index <blind-persona-wave-custody-index.json> \\
    --evidence-root <empty-directory>

  node apps/desktop/scripts/blind-persona-evidence-harness-cli.mjs record \\
    --file <evidence-root>/<P##>/blind-persona-evidence-record.json

  node apps/desktop/scripts/blind-persona-evidence-harness-cli.mjs aggregate \\
    --custody-index <blind-persona-wave-custody-index.json> \\
    --evidence-root <directory> [--out <direct-child-of-evidence-root>.json]

init scaffolds one directory per custody-index persona containing an empty
record prefilled with personaId and waveCustodyPath into a FRESH evidence
root (the root must not exist yet; its parent must be an existing
directory). It refuses existing persona directories instead of clobbering
them and rolls back everything it created if scaffolding fails midway.

Canonical complete wave only: this harness serves the canonical complete
wave, so init and aggregate fail closed when custody waveComplete is not
true, and both refuse any custody index whose persona set is not exactly
P01 through P14 once each. Incompleteness is reported before canonical-set
diagnostics so real partial waves read clearly.

record validates a filled record against the blind-persona evidence schema
(verdict complete|blocked|partial; severities P0|P1|P2 with area, summary,
and free-form supplementary evidenceRefs; blockers with non-empty summary,
stage, and at least one screenshot; journeyStages with
stage/seconds/interactions; firstConfusion; misunderstoodTerms; backtracks;
inaccessibleControls; trustConcerns; expectedNextAction; screenshotPaths as
relative paths inside the persona record directory that must exist on disk --
nested subdirectories are allowed, but ".." segments and symlinks escaping
the directory are rejected; rendererErrors as message/scenarioHint pairs;
structured horizontalOverflowFindings with surface/summary/screenshotPath
instead of a bare boolean; firstPersonVerdict). A blocked verdict requires at
least one blocker and one severity; a complete verdict requires no blockers;
every blocker screenshot and overflow-finding screenshot must also appear in
the top-level screenshotPaths. Unknown fields are rejected. On success the
record is rewritten atomically in canonical key order with mode 0644
preserved. A failed validation never modifies the original file. The record
command validates shape only: aggregate is the authority that binds each
record's waveCustodyPath to the verified custody index.

aggregate verifies every persona from the custody index has a valid record
whose waveCustodyPath resolves to this exact custody index, prints FAIL lines
for missing/invalid ones, and writes the synthesis input when all records
pass: by default to blind-persona-evidence-synthesis-input.json directly
inside the evidence root, or to the --out path, which must be a direct child
of the evidence root (never a custody path, persona subpath, evidence record,
or existing symlink). On missing/invalid records no synthesis is written and
a stale default synthesis inside the evidence root is removed so it cannot be
mistaken for current. Exit code is nonzero when any record is missing or
invalid, or when any P0 finding exists, so a parent session cannot silently
proceed past a blocked wave. Aggregation produces the INPUT to independent
synthesis; it is not final acceptance. Unrecognized input -- an unknown
subcommand or flags-first arguments such as --foo -- exits nonzero with an
error instead of printing help as success.`;
