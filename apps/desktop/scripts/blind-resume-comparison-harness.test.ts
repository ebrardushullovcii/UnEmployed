import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  COMPARISON_AGGREGATE_FILENAME as AGGREGATE_FILENAME,
  BLIND_RESUME_COMPARISON_SCHEMA_VERSION,
  COMPARISON_MANIFEST_FILENAME,
  COMPARISON_RATER_RECORDS_DIRNAME,
  COMPARISON_RATER_RECORD_TEMPLATE_FILENAME,
  MAX_GATE_EXCERPT_CHARACTERS,
  MIN_RATING_SCORE,
  RATING_DIMENSIONS,
  RATER_RECORD_KEYS,
  aggregateBlindResumeComparison,
  evaluateHardGates,
  initBlindResumeComparison,
  loadVerifiedComparisonManifest,
  parseBlindResumeComparisonCli,
  recordBlindResumeComparisonRating,
  resolveSlotAssignment,
  sha256Hex,
  stableComparisonSerialization,
  validateComparisonCaseInputFile,
  validateRaterRecordValue,
  type ComparisonManifest,
  type ManifestCaseEntry,
} from "./blind-resume-comparison-harness";

/** Host-approved scratch root for this environment. Tests prefer the
 * portable os.tmpdir()/opencode base and fall back to this directory so they
 * always stay inside the approved area on this host. */
const HOST_APPROVED_TEMP_ROOT =
  "/private/var/folders/nh/pj6dg1rj2kvdgrh75f7b5krr0000gn/T/opencode";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const cliPath = path.join(
  scriptDirectory,
  "blind-resume-comparison-harness-cli.mjs",
);
const syntheticCasesPath = path.join(
  desktopRoot,
  "test-fixtures",
  "job-finder",
  "resume-comparison",
  "synthetic-cases.json",
);

let approvedTempBasePromise: Promise<string> | null = null;

async function approvedTempBase(): Promise<string> {
  if (!approvedTempBasePromise) {
    approvedTempBasePromise = (async () => {
      const portable = path.join(os.tmpdir(), "opencode");
      await mkdir(portable, { recursive: true });
      try {
        const [portableReal, hostReal] = await Promise.all([
          stat(portable),
          stat(HOST_APPROVED_TEMP_ROOT),
        ]);
        if (
          portableReal.ino === hostReal.ino &&
          portableReal.dev === hostReal.dev
        ) {
          return HOST_APPROVED_TEMP_ROOT;
        }
        return portable;
      } catch {
        return HOST_APPROVED_TEMP_ROOT;
      }
    })();
  }
  return approvedTempBasePromise;
}

async function uniqueDirectory(label: string): Promise<string> {
  const base = await approvedTempBase();
  const parent = path.join(base, "blind-resume-comparison-tests");
  await mkdir(parent, { recursive: true });
  return mkdir(
    path.join(
      parent,
      `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ),
    {
      recursive: true,
    },
  );
}

type SyntheticCaseFile = {
  cases: Array<{
    caseId: string;
    criticalAnchors: string[];
    generatedText: string;
    isControl: boolean;
    jobContext: string;
    originalText: string;
  }>;
  schemaVersion: number;
  seed: string;
};

let syntheticCaseFileCache: Promise<SyntheticCaseFile> | null = null;

function loadSyntheticCaseFile(): Promise<SyntheticCaseFile> {
  if (!syntheticCaseFileCache) {
    syntheticCaseFileCache = readFile(syntheticCasesPath, "utf8").then(
      (content) => JSON.parse(content) as SyntheticCaseFile,
    );
  }
  return syntheticCaseFileCache;
}

interface InitializedProtocol {
  manifest: ComparisonManifest;
  manifestPath: string;
  outcome: Awaited<ReturnType<typeof initBlindResumeComparison>>;
  raterRecordsDir: string;
  raterRoot: string;
  workRoot: string;
}

/** Runs init against a copy of the synthetic corpus in fresh temp roots and
 * returns everything a test needs, including the supervisor-side manifest
 * (reading it in tests is legitimate; raters never see it). */
async function initSyntheticProtocol(
  label: string,
  mutateCaseFile?: (caseFile: SyntheticCaseFile) => unknown,
): Promise<InitializedProtocol> {
  const parent = await uniqueDirectory(label);
  const workRoot = path.join(parent, "work");
  const raterRoot = path.join(parent, "raters");
  let caseValue: unknown = await loadSyntheticCaseFile();
  if (mutateCaseFile) caseValue = mutateCaseFile(caseFileCopy());
  const casesFile = path.join(parent, "cases.json");
  await writeFile(casesFile, JSON.stringify(caseValue, null, 2));
  const outcome = await initBlindResumeComparison({
    casesFile,
    raterRoot,
    workRoot,
  });
  const verified = await loadVerifiedComparisonManifest(workRoot);
  return {
    manifest: verified.manifest,
    manifestPath: verified.manifestPath,
    outcome,
    raterRecordsDir: path.join(raterRoot, COMPARISON_RATER_RECORDS_DIRNAME),
    raterRoot,
    workRoot,
  };
}

function caseFileCopy(): SyntheticCaseFile {
  if (!syntheticCaseFileCache) {
    throw new Error("synthetic case file not loaded yet");
  }
  return JSON.parse(
    JSON.stringify(syntheticCaseFileCache),
  ) as SyntheticCaseFile;
}

function structuredCopy(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function expectProtocolValidationProblems(invoke: () => unknown): string[] {
  try {
    invoke();
  } catch (error) {
    expect(
      error instanceof Error && "problems" in error,
      `expected ProtocolValidationError, got: ${String(error)}`,
    ).toBe(true);
    return (error as { problems: string[] }).problems;
  }
  throw new Error("expected validation to fail");
}

type SideOfSlot = Record<"A" | "B", "original" | "generated">;

interface FillOptions {
  forcedChoiceSide: (context: {
    caseId: string;
    isControl: boolean;
  }) => "generated" | "original";
  notes?: string;
  raterId: string;
  score?: (context: {
    caseId: string;
    dimension: string;
    slot: "A" | "B";
  }) => number;
}

function slotsFor(manifest: ComparisonManifest, caseId: string): SideOfSlot {
  const entry = (manifest.cases as ManifestCaseEntry[]).find(
    (candidate) => candidate.caseId === caseId,
  );
  if (!entry) throw new Error(`Unknown case in manifest: ${caseId}`);
  return entry.slots as SideOfSlot;
}

function slotForSide(
  slots: SideOfSlot,
  side: "generated" | "original",
): "A" | "B" {
  return slots.A === side ? "A" : "B";
}

/** Builds one filled record object from the scaffold template, resolving
 * sides through the sealed slot mapping. */
async function buildFilledRecord(
  initialized: InitializedProtocol,
  options: FillOptions,
): Promise<Record<string, unknown>> {
  const templatePath = path.join(
    initialized.raterRecordsDir,
    COMPARISON_RATER_RECORD_TEMPLATE_FILENAME,
  );
  const template = JSON.parse(await readFile(templatePath, "utf8")) as Record<
    string,
    unknown
  >;
  const ratings = template.ratings as Array<Record<string, unknown>>;
  for (const rating of ratings) {
    const caseId = String(rating.caseId);
    const slots = slotsFor(initialized.manifest, caseId);
    const isControl = (initialized.manifest.cases as ManifestCaseEntry[]).find(
      (entry) => entry.caseId === caseId,
    )?.isControl;
    for (const dimension of RATING_DIMENSIONS) {
      rating[dimension] = {
        A:
          options.score?.({ caseId, dimension, slot: "A" }) ??
          MIN_RATING_SCORE + 2,
        B:
          options.score?.({ caseId, dimension, slot: "B" }) ??
          MIN_RATING_SCORE + 2,
      };
    }
    const chosenSide = options.forcedChoiceSide({
      caseId,
      isControl: !!isControl,
    });
    rating.forcedChoice = slotForSide(slots, chosenSide);
  }
  template.raterId = options.raterId;
  template.raterNotes = options.notes ?? "";
  return template;
}

async function persistFilledRecord(
  initialized: InitializedProtocol,
  record: Record<string, unknown>,
): Promise<string> {
  const recordPath = path.join(
    initialized.raterRecordsDir,
    `${String(record.raterId)}.json`,
  );
  await writeFile(recordPath, JSON.stringify(record, null, 2));
  await recordBlindResumeComparisonRating({ file: recordPath });
  return recordPath;
}

describe("blind-resume-comparison hard gates", () => {
  it("passes every synthetic corpus pair through all four gates", async () => {
    const caseFile = await loadSyntheticCaseFile();
    for (const entry of caseFile.cases) {
      const evaluation = evaluateHardGates({
        criticalAnchors: entry.criticalAnchors,
        generatedText: entry.generatedText,
        originalText: entry.originalText,
      });
      expect(
        evaluation.passed,
        `${entry.caseId}: ${stableComparisonSerialization(evaluation)}`,
      ).toBe(true);
      expect(evaluation.factuality.unsupportedClaimCount).toBe(0);
      expect(evaluation.numericIntegrity.fabricatedNumberCount).toBe(0);
      expect(evaluation.omissions.missingAnchorCount).toBe(0);
      expect(evaluation.atsStructure.problems).toEqual([]);
    }
  });

  it("fails factuality when a generated claim has no support in the original", async () => {
    const caseFile = await loadSyntheticCaseFile();
    const entry = caseFile.cases[1];
    if (!entry) throw new Error("missing synthetic case");
    const evaluation = evaluateHardGates({
      criticalAnchors: entry.criticalAnchors,
      generatedText: `${entry.generatedText}- Spearheaded quantum blockchain telemetry synergies across 47 federated observatory clusters.\n`,
      originalText: entry.originalText,
    });
    expect(evaluation.factuality.passed).toBe(false);
    expect(evaluation.factuality.unsupportedClaimCount).toBeGreaterThan(0);
    expect(
      evaluation.factuality.unsupportedClaimExcerpts.length,
    ).toBeGreaterThan(0);
    for (const excerpt of evaluation.factuality.unsupportedClaimExcerpts) {
      expect(excerpt.length).toBeLessThanOrEqual(MAX_GATE_EXCERPT_CHARACTERS);
    }
  });

  it("fails factuality when a fabricated contact address appears", async () => {
    const caseFile = await loadSyntheticCaseFile();
    const entry = caseFile.cases[0];
    if (!entry) throw new Error("missing synthetic case");
    const evaluation = evaluateHardGates({
      criticalAnchors: entry.criticalAnchors,
      generatedText: `${entry.generatedText}Contact: jordan.avery@entirely-different-domain.example\n`,
      originalText: entry.originalText,
    });
    expect(evaluation.factuality.passed).toBe(false);
    expect(evaluation.factuality.fabricatedContactCount).toBe(1);
  });

  it("fails numeric integrity on an invented metric", async () => {
    const caseFile = await loadSyntheticCaseFile();
    const entry = caseFile.cases[0];
    if (!entry) throw new Error("missing synthetic case");
    const evaluation = evaluateHardGates({
      criticalAnchors: entry.criticalAnchors,
      generatedText: `${entry.generatedText}Grew platform efficiency 738% while mentoring 27 engineers.\n`,
      originalText: entry.originalText,
    });
    expect(evaluation.numericIntegrity.passed).toBe(false);
    expect(evaluation.numericIntegrity.fabricatedNumbers).toEqual([
      "27",
      "738",
    ]);
  });

  it("fails omissions when a critical anchor or contact is dropped", async () => {
    const caseFile = await loadSyntheticCaseFile();
    const entry = caseFile.cases[2];
    if (!entry) throw new Error("missing synthetic case");
    const stripped = entry.generatedText
      .replace("Rosewood Dental Group", "A Regional Clinic Group")
      .replace("sam.whitfield@example.com", "removed@example.invalid");
    const evaluation = evaluateHardGates({
      criticalAnchors: entry.criticalAnchors,
      generatedText: stripped,
      originalText: entry.originalText,
    });
    expect(evaluation.omissions.passed).toBe(false);
    expect(
      evaluation.omissions.missingAnchors.some((anchor) =>
        anchor.startsWith("anchor:Rosewood"),
      ),
    ).toBe(true);
    expect(
      evaluation.omissions.missingAnchors.some((anchor) =>
        anchor.startsWith("contact:sam.whitfield"),
      ),
    ).toBe(true);
  });

  it("fails ATS structure on decorative glyphs, oversized lines, and missing headers", () => {
    const bloated = `Jordan\njordan.a@example.com | +1 (415) 555-0148\n\n${"X".repeat(260)}\n\nExperience stuff happened everywhere at once and then some more things happened too.\n\u{1F680} \u2500\u2500\u2500 dashboard banner \u2500\u2500\u2500`;
    const evaluation = evaluateAtsOnly(bloated);
    expect(evaluation.passed).toBe(false);
    expect(
      evaluation.problems.some((problem) => problem.startsWith("line-length")),
    ).toBe(true);
    expect(
      evaluation.problems.some((problem) => problem.startsWith("glyphs")),
    ).toBe(true);
    expect(evaluation.problems.join("\n")).not.toContain("XXXX");
  });
});

/** ATS gate runs against the generated side only. */
function evaluateAtsOnly(generatedText: string) {
  return evaluateHardGates({
    criticalAnchors: [],
    generatedText,
    originalText: `${generatedText}\n filler original side with matching tokens ${generatedText}`,
  }).atsStructure;
}

describe("blind-resume-comparison slot assignment", () => {
  it("is deterministic per seed and case and always yields A or B", async () => {
    const caseFile = await loadSyntheticCaseFile();
    for (const entry of caseFile.cases) {
      expect(resolveSlotAssignment(caseFile.seed, entry.caseId)).toBe(
        resolveSlotAssignment(caseFile.seed, entry.caseId),
      );
      expect(["A", "B"]).toContain(
        resolveSlotAssignment(caseFile.seed, entry.caseId),
      );
    }
  });

  it("varies assignments across seeds for the fixed corpus (fixed inputs stay stable)", async () => {
    const caseFile = await loadSyntheticCaseFile();
    const caseIds = caseFile.cases.map((entry) => entry.caseId);
    const seeds = ["seed-one", "seed-two", "seed-three", "seed-four"];
    const observed = new Set(
      seeds.map((seed) =>
        caseIds.map((caseId) => resolveSlotAssignment(seed, caseId)).join(","),
      ),
    );
    expect(observed.size).toBeGreaterThan(1);
  });
});

describe("blind-resume-comparison case-file validation", () => {
  it("accepts the synthetic corpus as-is", async () => {
    const parsed = validateComparisonCaseInputFile(
      await loadSyntheticCaseFile(),
    );
    expect(parsed.schemaVersion).toBe(BLIND_RESUME_COMPARISON_SCHEMA_VERSION);
    expect(parsed.cases.map((entry) => entry.caseId)).toEqual([
      "platform-control",
      "marketing-analyst-tailored",
      "career-change-faithful",
    ]);
  });

  it("rejects unknown fields and forbidden claim vocabulary", async () => {
    const base = await loadSyntheticCaseFile();
    expect(() =>
      validateComparisonCaseInputFile({
        ...structuredCopy(base),
        extraField: true,
      }),
    ).toThrow(/extraField/);

    const withForbiddenKey = structuredCopy(base) as Record<string, unknown>;
    (
      withForbiddenKey.cases as Array<Record<string, unknown>>
    )[0]!.atsScorePrediction = 99;
    const problems = expectProtocolValidationProblems(() =>
      validateComparisonCaseInputFile(withForbiddenKey),
    );
    expect(problems.join("\n")).toMatch(/forbidden claim vocabulary/i);
    expect(problems.join("\n")).toMatch(/atsScorePrediction/);
  });

  it("rejects duplicate case ids", async () => {
    const base = structuredCopy(
      await loadSyntheticCaseFile(),
    ) as SyntheticCaseFile;
    base.cases.push({ ...base.cases[2]! });
    const problems = expectProtocolValidationProblems(() =>
      validateComparisonCaseInputFile(base),
    );
    expect(problems.join("\n")).toContain("duplicates an earlier case");
  });
});

describe("blind-resume-comparison init", () => {
  it("scaffolds a sealed supervisor root and an identity-free rater root", async () => {
    const initialized = await initSyntheticProtocol("init-happy");
    expect(initialized.outcome.caseCount).toBe(3);
    expect(initialized.outcome.controlCaseIds).toEqual(["platform-control"]);

    // Supervisor side: manifest + both source texts per case.
    const sourcesDir = initialized.outcome.sourcesDir;
    for (const entry of initialized.manifest.cases as ManifestCaseEntry[]) {
      for (const side of ["original", "generated"] as const) {
        const content = await readFile(
          path.join(sourcesDir, `${entry.caseId}.${side}.txt`),
          "utf8",
        );
        expect(sha256Hex(content)).toBe(
          entry.sourceDigests[side as "original" | "generated"],
        );
      }
    }

    // Rater side: variants + brief only; no original/generated naming anywhere.
    const raterCasesDir = initialized.outcome.raterCasesDir;
    const brief = await readFile(
      path.join(raterCasesDir, "platform-control", "case-brief.json"),
      "utf8",
    );
    expect(brief).toMatch(/"caseId": "platform-control"/);
    expect(brief.toLowerCase()).not.toContain("original");
    expect(brief.toLowerCase()).not.toContain("generated");
    await stat(path.join(raterCasesDir, "platform-control", "variant-A.txt"));
    await stat(path.join(raterCasesDir, "platform-control", "variant-B.txt"));

    // Template is prefilled with the manifest binding and every case id.
    const template = JSON.parse(
      await readFile(
        path.join(
          initialized.raterRecordsDir,
          COMPARISON_RATER_RECORD_TEMPLATE_FILENAME,
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(template.manifestSha256).toBe(initialized.manifest.manifestSha256);
    expect(
      (template.ratings as Array<{ caseId: string }>).map(
        (rating) => rating.caseId,
      ),
    ).toEqual([
      "platform-control",
      "marketing-analyst-tailored",
      "career-change-faithful",
    ]);
  });

  it("keeps the slot mapping out of stdout-facing outcome objects and rater files", async () => {
    const initialized = await initSyntheticProtocol("init-blinding");
    const serializedOutcome = JSON.stringify(initialized.outcome);
    expect(serializedOutcome).not.toMatch(/"slots"/);
    const templateBytes = await readFile(
      path.join(
        initialized.raterRecordsDir,
        COMPARISON_RATER_RECORD_TEMPLATE_FILENAME,
      ),
      "utf8",
    );
    expect(templateBytes).not.toContain("slots");
  });

  it("refuses a gate-violating case set before creating anything", async () => {
    const parent = await uniqueDirectory("init-gate-fail");
    const workRoot = path.join(parent, "work");
    const raterRoot = path.join(parent, "raters");
    const base = structuredCopy(
      await loadSyntheticCaseFile(),
    ) as SyntheticCaseFile;
    base.cases[0]!.generatedText +=
      "Invented unicorn unicorn unicorn quantum synergy metrics here.\n";
    const casesFile = path.join(parent, "cases.json");
    await writeFile(casesFile, JSON.stringify(base));
    await expect(
      initBlindResumeComparison({ casesFile, raterRoot, workRoot }),
    ).rejects.toThrow(/factuality/);
    await expect(stat(workRoot)).rejects.toBeTruthy();
    await expect(stat(raterRoot)).rejects.toBeTruthy();
  });

  it("refuses a case set with no original-win control case", async () => {
    const parent = await uniqueDirectory("init-no-control");
    const base = structuredCopy(
      await loadSyntheticCaseFile(),
    ) as SyntheticCaseFile;
    base.cases = base.cases.map((entry) => ({ ...entry, isControl: false }));
    const casesFile = path.join(parent, "cases.json");
    await writeFile(casesFile, JSON.stringify(base));
    await expect(
      initBlindResumeComparison({
        casesFile,
        raterRoot: path.join(parent, "raters"),
        workRoot: path.join(parent, "work"),
      }),
    ).rejects.toThrow(/control/);
  });

  it("requires two disjoint fresh roots and refuses clobbering", async () => {
    const parent = await uniqueDirectory("init-freshness");
    const casesFile = path.join(parent, "cases.json");
    await writeFile(casesFile, JSON.stringify(await loadSyntheticCaseFile()));
    const workRoot = path.join(parent, "work");
    const raterRoot = path.join(parent, "raters");
    await mkdir(workRoot); // pre-existing
    await expect(
      initBlindResumeComparison({ casesFile, raterRoot, workRoot }),
    ).rejects.toThrow(/fresh directory/);

    await rm(workRoot, { recursive: true });
    await expect(
      initBlindResumeComparison({
        casesFile,
        raterRoot,
        workRoot: raterRoot, // overlapping
      }),
    ).rejects.toThrow(/disjoint/);
  });

  it("derives identical slot mappings from identical seeds in separate runs", async () => {
    const firstRun = await initSyntheticProtocol("init-determinism-a");
    const secondRun = await initSyntheticProtocol("init-determinism-b");
    expect(secondRun.manifest.seedSha256).toBe(firstRun.manifest.seedSha256);
    expect(
      stableComparisonSerialization(
        secondRun.manifest.cases.map((entry) => entry.slots),
      ),
    ).toBe(
      stableComparisonSerialization(
        firstRun.manifest.cases.map((entry) => entry.slots),
      ),
    );
  });
});

describe("blind-resume-comparison record", () => {
  it("fails closed on the untouched scaffold template", async () => {
    const initialized = await initSyntheticProtocol("record-template");
    const templatePath = path.join(
      initialized.raterRecordsDir,
      COMPARISON_RATER_RECORD_TEMPLATE_FILENAME,
    );
    const templateValue = JSON.parse(await readFile(templatePath, "utf8"));
    const problems = expectProtocolValidationProblems(() =>
      validateRaterRecordValue(templateValue),
    );
    expect(problems.join("\n")).toMatch(/raterId/);
    expect(problems.join("\n")).toMatch(/forcedChoice/);
  });

  it("round-trips a fully filled record atomically in canonical key order", async () => {
    const initialized = await initSyntheticProtocol("record-roundtrip");
    const record = await buildFilledRecord(initialized, {
      forcedChoiceSide: ({ caseId, isControl }) =>
        isControl || caseId === "career-change-faithful"
          ? "original"
          : "generated",
      notes: "Second variant read more smoothly to me.",
      raterId: "rater-01",
    });
    const recordPath = await persistFilledRecord(initialized, record);
    const canonical = await readFile(recordPath, "utf8");
    const keys = Object.keys(JSON.parse(canonical));
    expect(keys).toEqual([...RATER_RECORD_KEYS]);
    expect(canonical.endsWith("\n")).toBe(true);
    const mode = (await stat(recordPath)).mode & 0o777;
    expect(mode).toBe(0o644);
    const parsed = validateRaterRecordValue(JSON.parse(canonical));
    expect(parsed.ratings).toHaveLength(3);
  });

  it("rejects bad scores, missing dimensions, ties, unknown fields, and identity assertions without touching bytes", async () => {
    const initialized = await initSyntheticProtocol("record-invalid");
    const valid = await buildFilledRecord(initialized, {
      forcedChoiceSide: ({ isControl }) =>
        isControl ? "original" : "generated",
      raterId: "rater-02",
    });
    const recordPath = path.join(initialized.raterRecordsDir, "rater-02.json");
    await writeFile(recordPath, JSON.stringify(valid));

    const originalBytes = await readFile(recordPath, "utf8");
    const mutate = (fn: (value: Record<string, unknown>) => void): void => {
      const copy = structuredCopy(valid) as Record<string, unknown>;
      fn(copy);
      expect(() => validateRaterRecordValue(copy)).toThrow();
    };

    const ratingsKey = "ratings" as const;
    mutate((value) => {
      (value[ratingsKey] as Array<Record<string, unknown>>)[0]!.credibility = {
        A: 0,
        B: 5,
      };
    });
    mutate((value) => {
      delete (value[ratingsKey] as Array<Record<string, unknown>>)[0]!
        .relevance;
    });
    mutate((value) => {
      (value[ratingsKey] as Array<Record<string, unknown>>)[0]!.forcedChoice =
        "tie";
    });
    mutate((value) => {
      value.unblindedMapping = { A: "original" };
    });
    mutate((value) => {
      value.atsScoreGuess = 82;
    });
    mutate((value) => {
      value.raterNotes = "Honestly B is the original resume, right?";
    });

    // A failed record command never touches the original bytes.
    await writeFile(recordPath, JSON.stringify({ ...valid, ratings: [] }));
    const beforeFailedWrite = await readFile(recordPath, "utf8");
    await expect(
      recordBlindResumeComparisonRating({ file: recordPath }),
    ).rejects.toThrow();
    expect(await readFile(recordPath, "utf8")).toBe(beforeFailedWrite);
    expect(originalBytes.length).toBeGreaterThan(0);
  });
});

describe("blind-resume-comparison aggregate", () => {
  async function completeHappyPath(label: string): Promise<{
    initialized: InitializedProtocol;
    outcome: Awaited<ReturnType<typeof aggregateBlindResumeComparison>>;
  }> {
    const initialized = await initSyntheticProtocol(label);
    const record = await buildFilledRecord(initialized, {
      forcedChoiceSide: ({ caseId, isControl }) =>
        isControl || caseId === "career-change-faithful"
          ? "original"
          : "generated",
      notes: "Preferred the crisper variant in most cases.",
      raterId: "rater-01",
      score: ({ caseId, dimension, slot }) => {
        if (caseId === "platform-control" && dimension === "relevance") {
          return slot === "A" ? 5 : 3;
        }
        return 4;
      },
    });
    await persistFilledRecord(initialized, record);
    const outcome = await aggregateBlindResumeComparison({
      out: null,
      raterRoot: initialized.raterRoot,
      workRoot: initialized.workRoot,
    });
    return { initialized, outcome };
  }

  it("lifts the blinding only at aggregate and reports mapped winners", async () => {
    const { initialized, outcome } = await completeHappyPath("aggregate-happy");
    expect(outcome.ok).toBe(true);
    expect(outcome.failures).toEqual([]);
    expect(outcome.aggregate?.controlsWonByOriginal).toBe(1);

    const controlCase = outcome.aggregate?.cases.find(
      (entry) => entry.caseId === "platform-control",
    );
    expect(controlCase?.isControl).toBe(true);
    expect(controlCase?.winner).toBe("original");

    // Winner mapping must agree with the sealed slots: the chosen side was
    // "generated" for this case, whatever slot it happened to occupy.
    const analystCase = outcome.aggregate?.cases.find(
      (entry) => entry.caseId === "marketing-analyst-tailored",
    );
    expect(analystCase?.winner).toBe("generated");
    const slots = slotsFor(initialized.manifest, "platform-control");
    const relevance = controlCase?.dimensionMeans.relevance;
    if (!relevance) throw new Error("missing relevance means");
    if (slots.A === "original") {
      expect(relevance.original).toBe(5);
      expect(relevance.generated).toBe(3);
    } else {
      expect(relevance.original).toBe(3);
      expect(relevance.generated).toBe(5);
    }
    expect(
      outcome.aggregate?.protocolGuarantees.atsScoreAndCallbackClaimsForbidden,
    ).toBe(true);

    // Privacy: the aggregate carries statistics, never resume text.
    const aggregateText = await readFile(
      path.join(initialized.workRoot, AGGREGATE_FILENAME),
      "utf8",
    );
    for (const forbidden of [
      "Northwind",
      "210000",
      "@example.com",
      "Rosewood",
    ]) {
      expect(aggregateText).not.toContain(forbidden);
    }
  });

  it("fails closed when a blinded variant file is tampered with", async () => {
    const { initialized } = await completeHappyPath("tamper-variant");
    const variantPath = path.join(
      initialized.outcome.raterCasesDir,
      "platform-control",
      "variant-A.txt",
    );
    const current = await readFile(variantPath, "utf8");
    await writeFile(variantPath, `${current}Tampered trailing line.\n`);
    const tampered = await aggregateBlindResumeComparison({
      out: null,
      raterRoot: initialized.raterRoot,
      workRoot: initialized.workRoot,
    });
    expect(tampered.ok).toBe(false);
    expect(tampered.aggregate).toBeNull();
    expect(tampered.failures.map((row) => row.reason).join("\n")).toMatch(
      /Blinded variant tampered/,
    );
  });

  it("fails closed when a sealed source file is tampered with", async () => {
    const { initialized } = await completeHappyPath("tamper-source");
    const sourcePath = path.join(
      initialized.outcome.sourcesDir,
      "career-change-faithful.generated.txt",
    );
    await writeFile(sourcePath, "Completely replaced synthetic content.\n");
    const tampered = await aggregateBlindResumeComparison({
      out: null,
      raterRoot: initialized.raterRoot,
      workRoot: initialized.workRoot,
    });
    expect(tampered.ok).toBe(false);
    expect(tampered.failures.map((row) => row.reason).join("\n")).toMatch(
      /Source file tampered/,
    );
  });

  it("fails closed when the sealed manifest itself is tampered with", async () => {
    const { initialized } = await completeHappyPath("tamper-manifest");
    const manifestPath = path.join(
      initialized.workRoot,
      COMPARISON_MANIFEST_FILENAME,
    );
    const sealed = JSON.parse(await readFile(manifestPath, "utf8")) as Record<
      string,
      unknown
    >;
    sealed.controlCaseIds = []; // any content change breaks the self-digest
    await writeFile(manifestPath, JSON.stringify(sealed, null, 2));
    await expect(
      aggregateBlindResumeComparison({
        out: null,
        raterRoot: initialized.raterRoot,
        workRoot: initialized.workRoot,
      }),
    ).rejects.toThrow(/self-digest mismatch|seal is broken/);
  });

  it("refuses records bound to a foreign or stale manifest digest", async () => {
    const { initialized } = await completeHappyPath("stale-binding");
    const recordPath = path.join(initialized.raterRecordsDir, "rater-01.json");
    const record = structuredCopy(
      JSON.parse(await readFile(recordPath, "utf8")),
    ) as Record<string, unknown>;
    record.manifestSha256 = sha256Hex("a-different-wave");
    await writeFile(recordPath, JSON.stringify(record, null, 2));
    const outcome = await aggregateBlindResumeComparison({
      out: null,
      raterRoot: initialized.raterRoot,
      workRoot: initialized.workRoot,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.exitReasons.join("\n")).toMatch(
      /no aggregate output was written/,
    );
  });

  it("refuses an incomplete record wholesale and writes no aggregate", async () => {
    const initialized = await initSyntheticProtocol("aggregate-incomplete");
    const record = await buildFilledRecord(initialized, {
      forcedChoiceSide: ({ isControl }) =>
        isControl ? "original" : "generated",
      raterId: "rater-partial",
    });
    (record.ratings as unknown[]).splice(-1);
    await persistFilledRecord(initialized, record);
    const outcome = await aggregateBlindResumeComparison({
      out: null,
      raterRoot: initialized.raterRoot,
      workRoot: initialized.workRoot,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.aggregate).toBeNull();
    expect(outcome.failures.map((row) => row.reason).join("\n")).toMatch(
      /Incomplete ratings/,
    );
    await expect(
      stat(path.join(initialized.workRoot, AGGREGATE_FILENAME)),
    ).rejects.toBeTruthy();
  });

  it("writes the aggregate yet exits nonzero when a mandatory control is lost", async () => {
    const initialized = await initSyntheticProtocol("aggregate-lost-control");
    const record = await buildFilledRecord(initialized, {
      forcedChoiceSide: () => "generated",
      raterId: "rater-suspicious",
    });
    await persistFilledRecord(initialized, record);
    const outcome = await aggregateBlindResumeComparison({
      out: null,
      raterRoot: initialized.raterRoot,
      workRoot: initialized.workRoot,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.aggregate).not.toBeNull();
    expect(outcome.exitReasons.join("\n")).toMatch(
      /control case platform-control.*not won by the original/,
    );
    expect(outcome.aggregate?.warnings.join("\n")).toMatch(
      /control-not-won-by-original/,
    );
  });

  it("fails with a clear refusal when no rater records exist", async () => {
    const initialized = await initSyntheticProtocol("aggregate-no-records");
    const defaultAggregate = path.join(
      initialized.workRoot,
      AGGREGATE_FILENAME,
    );
    await writeFile(defaultAggregate, "{}\n"); // stale output
    const outcome = await aggregateBlindResumeComparison({
      out: null,
      raterRoot: initialized.raterRoot,
      workRoot: initialized.workRoot,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.failures[0]?.reason).toMatch(/No rater records found/);
    await expect(stat(defaultAggregate)).rejects.toBeTruthy();
  });

  it("refuses duplicate rater ids across files", async () => {
    const { initialized } = await completeHappyPath("duplicate-raters");
    const source = await readFile(
      path.join(initialized.raterRecordsDir, "rater-01.json"),
      "utf8",
    );
    await writeFile(
      path.join(initialized.raterRecordsDir, "copy-cat.json"),
      source,
    );
    const outcome = await aggregateBlindResumeComparison({
      out: null,
      raterRoot: initialized.raterRoot,
      workRoot: initialized.workRoot,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.failures.map((row) => row.reason).join("\n")).toMatch(
      /Duplicate rater id/,
    );
  });

  it("contains --out inside the supervisor work root", async () => {
    const { initialized } = await completeHappyPath("out-containment");
    await expect(
      aggregateBlindResumeComparison({
        out: path.join(await uniqueDirectory("outside"), "leak.json"),
        raterRoot: initialized.raterRoot,
        workRoot: initialized.workRoot,
      }),
    ).rejects.toThrow(/direct child of the supervisor work root/);
  });
});

describe("blind-resume-comparison CLI parsing and spawning", () => {
  it("routes the three commands with resolved paths", async () => {
    const parent = await uniqueDirectory("cli-parse");
    const parsedInit = parseBlindResumeComparisonCli([
      "init",
      "--cases",
      `${parent}/cases.json`,
      "--work-root",
      `${parent}/work`,
      "--rater-root",
      `${parent}/raters`,
    ]);
    expect(parsedInit?.command).toBe("init");
    const parsedRecord = parseBlindResumeComparisonCli([
      "record",
      "--file",
      "x.json",
    ]);
    expect(parsedRecord).toEqual({
      command: "record",
      file: path.resolve("x.json"),
    });
    const parsedAggregate = parseBlindResumeComparisonCli([
      "aggregate",
      "--work-root",
      "w",
      "--rater-root",
      "r",
    ]);
    expect(parsedAggregate).toEqual({
      command: "aggregate",
      out: null,
      raterRoot: path.resolve("r"),
      workRoot: path.resolve("w"),
    });
  });

  it("prints help (null) for --help/-h/empty args and throws for malformed input", () => {
    expect(parseBlindResumeComparisonCli([])).toBeNull();
    expect(parseBlindResumeComparisonCli(["--help"])).toBeNull();
    expect(parseBlindResumeComparisonCli(["-h"])).toBeNull();
    expect(() => parseBlindResumeComparisonCli(["--foo"])).toThrow(
      /Unknown blind-resume-comparison CLI input/,
    );
    expect(() => parseBlindResumeComparisonCli(["bogus"])).not.toThrow();
    expect(parseBlindResumeComparisonCli(["bogus"])).toBeNull();
    expect(() =>
      parseBlindResumeComparisonCli(["init", "--cases", "a", "--work-root"]),
    ).toThrow();
  });

  it("runs the full protocol end-to-end through the real CLI process", async () => {
    const parent = await uniqueDirectory("cli-e2e");
    const casesFile = path.join(parent, "cases.json");
    await writeFile(casesFile, JSON.stringify(await loadSyntheticCaseFile()));
    const workRoot = path.join(parent, "work");
    const raterRoot = path.join(parent, "raters");

    const spawnedInit = spawnSync(
      process.execPath,
      [
        cliPath,
        "init",
        "--cases",
        casesFile,
        "--work-root",
        workRoot,
        "--rater-root",
        raterRoot,
      ],
      { encoding: "utf8" },
    );
    expect(spawnedInit.status).toBe(0);
    const initOutcome = JSON.parse(spawnedInit.stdout) as {
      manifestSha256: string;
    };
    expect(initOutcome.manifestSha256).toHaveLength(64);

    // Fill the template in-process, then submit it through the record command.
    const verified = await loadVerifiedComparisonManifest(workRoot);
    const initialized: InitializedProtocol = {
      manifest: verified.manifest,
      manifestPath: verified.manifestPath,
      outcome: {} as InitializedProtocol["outcome"],
      raterRecordsDir: path.join(raterRoot, COMPARISON_RATER_RECORDS_DIRNAME),
      raterRoot,
      workRoot,
    };
    const record = await buildFilledRecord(initialized, {
      forcedChoiceSide: ({ isControl }) =>
        isControl ? "original" : "generated",
      raterId: "cli-rater",
    });
    const recordPath = path.join(
      raterRoot,
      COMPARISON_RATER_RECORDS_DIRNAME,
      "cli-rater.json",
    );
    await writeFile(recordPath, JSON.stringify(record, null, 2));
    const spawnedRecord = spawnSync(
      process.execPath,
      [cliPath, "record", "--file", recordPath],
      {
        encoding: "utf8",
      },
    );
    expect(spawnedRecord.status).toBe(0);

    const spawnedAggregate = spawnSync(
      process.execPath,
      [
        cliPath,
        "aggregate",
        "--work-root",
        workRoot,
        "--rater-root",
        raterRoot,
      ],
      { encoding: "utf8" },
    );
    expect(spawnedAggregate.status).toBe(0);
    expect(spawnedAggregate.stdout).toContain(
      `aggregate ${path.join(workRoot, AGGREGATE_FILENAME)}`,
    );
  }, 120_000);

  it("exits nonzero for malformed input and zero for bare help (spawn)", () => {
    const bad = spawnSync(process.execPath, [cliPath, "--foo"], {
      encoding: "utf8",
    });
    expect(bad.status).not.toBe(0);
    const help = spawnSync(process.execPath, [cliPath, "--help"], {
      encoding: "utf8",
    });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("Usage:");
    expect(help.stdout).toContain("ATS-score");
  });
});
