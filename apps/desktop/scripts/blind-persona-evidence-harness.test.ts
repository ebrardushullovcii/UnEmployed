import { spawnSync } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  BLIND_PERSONA_EVIDENCE_HELP,
  BLIND_PERSONA_EVIDENCE_SCHEMA_VERSION,
  EVIDENCE_RECORD_FILENAME,
  EVIDENCE_RECORD_KEYS,
  EvidenceValidationError,
  SYNTHESIS_OUTPUT_FILENAME,
  aggregateBlindPersonaEvidence,
  assertCanonicalBlindPersonaCoverage,
  initBlindPersonaEvidence,
  loadVerifiedBlindPersonaCustodyIndex,
  orderedEvidenceRecordJson,
  parseBlindPersonaEvidenceCli,
  recordBlindPersonaEvidence,
  scaffoldEvidenceRecord,
  sha256Hex,
  stableEvidenceSerialization,
  validateEvidenceRecordValue,
  writeFileAtomic0644,
} from "./blind-persona-evidence-harness";
import { stableJson } from "./release-acceptance-harness.mjs";

/** Host-approved scratch root for this environment. Tests prefer the
 * portable os.tmpdir()/opencode base and fall back to this directory so they
 * always stay inside the approved area on this host. */
const HOST_APPROVED_TEMP_ROOT =
  "/private/var/folders/nh/pj6dg1rj2kvdgrh75f7b5krr0000gn/T/opencode";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");

let approvedTempBasePromise: Promise<string> | null = null;

async function approvedTempBase(): Promise<string> {
  if (!approvedTempBasePromise) {
    approvedTempBasePromise = (async () => {
      const portable = path.join(os.tmpdir(), "opencode");
      await mkdir(portable, { recursive: true });
      try {
        const [portableReal, hostReal] = await Promise.all([
          realpath(portable),
          realpath(HOST_APPROVED_TEMP_ROOT),
        ]);
        if (portableReal === hostReal) return portable;
      } catch {
        // Fall through to the host-approved constant below.
      }
      try {
        return await realpath(HOST_APPROVED_TEMP_ROOT);
      } catch {
        return portable;
      }
    })();
  }
  return approvedTempBasePromise;
}

async function uniqueTestRoot(label: string): Promise<string> {
  const base = await approvedTempBase();
  const root = path.join(base, `${label}-${crypto.randomUUID()}`);
  await mkdir(root, { recursive: true });
  return root;
}

const PERSONA_IDS = Array.from({ length: 14 }, (_value, index) => {
  const raw = String(index + 1).padStart(2, "0");
  return `P${raw}`;
});

interface CustodyIndexOptions {
  /** Signs the index with waveComplete:false (still self-consistent). */
  incompleteWave?: boolean;
  /** Omits canonical personas from the index (subset wave). */
  omitPersonas?: string[];
  /** Lists one canonical persona twice. */
  duplicatePersona?: string;
  /** Adds an entry outside the canonical P01..P14 namespace. */
  unsupportedPersona?: boolean;
  /** Flips waveComplete after signing so the self-digest breaks. */
  tamperWaveFlagAfterSigning?: boolean;
}

interface FixturePaths {
  custodyIndexPath: string;
  evidenceRoot: string;
  root: string;
}

async function writeCustodyIndexAt(
  indexPath: string,
  options: CustodyIndexOptions & { listedIds?: string[] } = {},
): Promise<void> {
  let listedIds = options.listedIds;
  if (!listedIds) {
    listedIds = PERSONA_IDS.filter(
      (personaId) => !(options.omitPersonas ?? []).includes(personaId),
    );
    if (options.duplicatePersona) listedIds.push(options.duplicatePersona);
    if (options.unsupportedPersona === true) listedIds.push("P15");
  }
  const subject = {
    schemaVersion: 1,
    threatBoundary: "fixture boundary text",
    waveComplete: options.incompleteWave === true ? false : true,
    build: { runDir: "/fixture/run" },
    personas: listedIds.map((personaId) => ({
      personaId,
      seedManifestPath: `/fixture/workspaces/${personaId}/blind-persona-seed-manifest.json`,
      seedManifestSha256: sha256Hex(`seed:${personaId}`),
      userDataRoot: `/fixture/workspaces/${personaId}`,
      workspaceDigest: sha256Hex(`payload:${personaId}`),
    })),
  };
  const finalIndex = {
    ...subject,
    custodyIndexSha256: sha256Hex(stableEvidenceSerialization(subject)),
  };
  if (options.tamperWaveFlagAfterSigning === true) {
    finalIndex.waveComplete = false;
  }
  await mkdir(path.dirname(indexPath), { recursive: true });
  await writeFile(
    indexPath,
    `${JSON.stringify(finalIndex, null, 2)}\n`,
    "utf8",
  );
}

async function prepareFixtures(
  label: string,
  custodyOptions: CustodyIndexOptions = {},
): Promise<FixturePaths> {
  const root = await uniqueTestRoot(label);
  const custodyIndexPath = path.join(
    root,
    "custody",
    "blind-persona-wave-custody-index.json",
  );
  await writeCustodyIndexAt(custodyIndexPath, custodyOptions);
  return {
    custodyIndexPath,
    evidenceRoot: path.join(root, "evidence"),
    root,
  };
}

/** Creates the screenshot files one persona record references, including a
 * nested subdirectory, inside that persona's record directory. */
async function writePersonaShotFiles(
  recordDirectory: string,
  personaId: string,
): Promise<void> {
  const nestedShots = path.join(recordDirectory, "shots", "extra");
  await mkdir(nestedShots, { recursive: true });
  await writeFile(
    path.join(recordDirectory, "shots", `${personaId}-blocker-1.png`),
    `png-bytes:${personaId}-blocker-1`,
    "utf8",
  );
  await writeFile(
    path.join(nestedShots, `${personaId}-extra.png`),
    `png-bytes:${personaId}-extra`,
    "utf8",
  );
}

function filledRecord(
  personaId: string,
  custodyIndexPath: string,
): Record<string, unknown> {
  return {
    schemaVersion: BLIND_PERSONA_EVIDENCE_SCHEMA_VERSION,
    personaId,
    waveCustodyPath: custodyIndexPath,
    verdict: "complete",
    severities: [
      {
        level: "P2",
        area: "wording",
        summary: `Label wording confused ${personaId} briefly.`,
        evidenceRefs: [`${personaId}-blocker-1`],
      },
    ],
    blockers: [],
    journeyStages: [
      { stage: "setup", seconds: 120.5, interactions: 14 },
      { stage: "find-jobs", seconds: 240, interactions: 30 },
    ],
    firstConfusion: `${personaId} first hesitated at profile import.`,
    misunderstoodTerms: ["discovery"],
    backtracks: 1,
    inaccessibleControls: [],
    trustConcerns: [],
    expectedNextAction: "Review the prepared application.",
    // Relative to the persona record directory; nested subdirectories allowed.
    screenshotPaths: [
      `shots/${personaId}-blocker-1.png`,
      `shots/extra/${personaId}-extra.png`,
    ],
    rendererErrors: [],
    horizontalOverflowFindings: [],
    firstPersonVerdict: `${personaId} reached the safe checkpoint unaided.`,
  };
}

async function materializeEvidence(input: {
  custodyIndexPath: string;
  evidenceRoot: string;
  mutate?: (personaId: string, record: Record<string, unknown>) => void;
}): Promise<void> {
  await mkdir(input.evidenceRoot, { recursive: true });
  for (const personaId of PERSONA_IDS) {
    const recordDirectory = path.join(input.evidenceRoot, personaId);
    await mkdir(recordDirectory);
    await writePersonaShotFiles(recordDirectory, personaId);
    const record = filledRecord(personaId, input.custodyIndexPath);
    input.mutate?.(personaId, record);
    await writeFile(
      path.join(recordDirectory, EVIDENCE_RECORD_FILENAME),
      JSON.stringify(record),
      "utf8",
    );
  }
}

async function makeRecordContext(
  paths: { evidenceRoot: string },
  personaId: string,
): Promise<string> {
  const recordDirectory = path.join(paths.evidenceRoot, personaId);
  await mkdir(recordDirectory, { recursive: true });
  await writePersonaShotFiles(recordDirectory, personaId);
  return recordDirectory;
}

function expectProjectionOf(
  record: Record<string, unknown>,
  personaId: string,
): Record<string, unknown> {
  const findings = record.horizontalOverflowFindings as unknown[];
  return {
    backtracks: record.backtracks,
    blockers: record.blockers,
    expectedNextAction: record.expectedNextAction,
    firstConfusion: record.firstConfusion,
    firstPersonVerdict: record.firstPersonVerdict,
    horizontalOverflow: findings.length > 0,
    horizontalOverflowFindings: record.horizontalOverflowFindings,
    inaccessibleControls: record.inaccessibleControls,
    journeyStages: record.journeyStages,
    misunderstoodTerms: record.misunderstoodTerms,
    personaId,
    rendererErrors: record.rendererErrors,
    screenshotPaths: record.screenshotPaths,
    severities: record.severities,
    trustConcerns: record.trustConcerns,
    verdict: record.verdict,
  };
}

describe("blind-persona-evidence-harness init", () => {
  it("scaffolds exactly one directory and prefilled record per custody persona", async () => {
    const paths = await prepareFixtures("evidence-init");
    const outcome = await initBlindPersonaEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
    });
    expect(outcome.created).toHaveLength(14);
    expect(outcome.waveComplete).toBe(true);
    const listed = (await readdir(paths.evidenceRoot)).sort();
    expect(listed).toEqual(PERSONA_IDS);
    for (const personaId of PERSONA_IDS) {
      const recordPath = path.join(
        paths.evidenceRoot,
        personaId,
        EVIDENCE_RECORD_FILENAME,
      );
      const parsed = JSON.parse(await readFile(recordPath, "utf8")) as Record<
        string,
        unknown
      >;
      expect(Object.keys(parsed)).toEqual([...EVIDENCE_RECORD_KEYS]);
      expect(parsed.schemaVersion).toBe(BLIND_PERSONA_EVIDENCE_SCHEMA_VERSION);
      expect(parsed.personaId).toBe(personaId);
      // The scaffold prefills the canonical (realpath) custody index path.
      expect(parsed.waveCustodyPath).toBe(
        await realpath(paths.custodyIndexPath),
      );
      // The scaffold is intentionally unfilled: meaningful strings stay empty
      // so recording it before session data exists fails validation closed.
      expect(parsed.verdict).toBe("");
      expect(parsed.blockers).toEqual([]);
      expect(parsed.horizontalOverflowFindings).toEqual([]);
      expect(parsed.firstPersonVerdict).toBe("");
      expect((await lstat(recordPath)).mode & 0o777).toBe(0o644);
    }
  });

  it("refuses to rerun into an existing evidence root instead of clobbering", async () => {
    const paths = await prepareFixtures("evidence-init-rerun");
    await initBlindPersonaEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
    });
    // Fresh-root protocol: any existing entry at the evidence root (stale
    // scaffolding, a directory planted under a persona name, or a symlink)
    // refuses the whole invocation before anything is written.
    await expect(
      initBlindPersonaEvidence({
        custodyIndexPath: paths.custodyIndexPath,
        evidenceRoot: paths.evidenceRoot,
      }),
    ).rejects.toThrow(/Evidence root already exists/u);
  });

  it("rolls back directories created before an injected mid-loop failure", async () => {
    const paths = await prepareFixtures("evidence-init-rollback");
    let writes = 0;
    await expect(
      initBlindPersonaEvidence(
        {
          custodyIndexPath: paths.custodyIndexPath,
          evidenceRoot: paths.evidenceRoot,
        },
        {
          writeRecordFile: async (targetPath, contents) => {
            writes += 1;
            if (writes > 3) {
              throw new Error(`injected writer failure #${writes}`);
            }
            await writeFile(targetPath, contents, {
              encoding: "utf8",
              flag: "wx",
              mode: 0o644,
            });
          },
        },
      ),
    ).rejects.toThrow(/rolled back after 4 persona director/iu);
    // Every created persona directory is gone; the root itself is empty.
    expect(await readdir(paths.evidenceRoot)).toEqual([]);
  });

  it("refuses symlinked or dangling evidence-root targets", async () => {
    const root = await uniqueTestRoot("evidence-init-symlink");
    const { custodyIndexPath } = await prepareFixtures(
      "evidence-init-symlink-index",
    );
    // A dangling symlink at the evidence root: the target does not exist, so
    // writing through it would silently create an unexpected subtree.
    const dangling = path.join(root, "dangling");
    await symlink(path.join(root, "nowhere"), dangling);
    await expect(
      initBlindPersonaEvidence({
        custodyIndexPath,
        evidenceRoot: dangling,
      }),
    ).rejects.toThrow(/Evidence root already exists/u);
    // A symlink pointing at a real directory elsewhere is equally refused:
    // scaffolding must never be redirected through a link.
    const realDir = path.join(root, "real-target");
    await mkdir(realDir);
    const redirect = path.join(root, "redirect");
    await symlink(realDir, redirect);
    await expect(
      initBlindPersonaEvidence({
        custodyIndexPath,
        evidenceRoot: redirect,
      }),
    ).rejects.toThrow(/Evidence root already exists/u);
    // Neither target gained any scaffolding.
    expect(await readdir(realDir)).toEqual([]);
  });

  it("refuses a custody index whose self-digest no longer matches", async () => {
    const paths = await prepareFixtures("evidence-init-tampered", {
      tamperWaveFlagAfterSigning: true,
    });
    await expect(
      loadVerifiedBlindPersonaCustodyIndex(paths.custodyIndexPath),
    ).rejects.toThrow(/self-digest mismatch/u);
  });

  it("refuses an incomplete wave even when the full canonical set is listed", async () => {
    const paths = await prepareFixtures("evidence-init-incomplete", {
      incompleteWave: true,
    });
    await expect(
      initBlindPersonaEvidence({
        custodyIndexPath: paths.custodyIndexPath,
        evidenceRoot: paths.evidenceRoot,
      }),
    ).rejects.toThrow(
      /Incomplete blind-persona custody \(waveComplete:false\) cannot initialize canonical persona evidence/u,
    );
    // The gate fires before any filesystem mutation: the root is absent.
    await expect(stat(paths.evidenceRoot)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("refuses a custody index missing part of the canonical persona set", async () => {
    const paths = await prepareFixtures("evidence-init-subset", {
      omitPersonas: ["P07"],
    });
    await expect(
      loadVerifiedBlindPersonaCustodyIndex(paths.custodyIndexPath),
    ).rejects.toThrow(
      /canonical blind-persona wave exactly once each[\s\S]*missing: P07; duplicated: none/u,
    );
  });

  it("refuses a duplicated canonical persona entry", async () => {
    const paths = await prepareFixtures("evidence-init-duplicate", {
      duplicatePersona: "P03",
    });
    await expect(
      loadVerifiedBlindPersonaCustodyIndex(paths.custodyIndexPath),
    ).rejects.toThrow(
      /canonical blind-persona wave exactly once each[\s\S]*duplicated: P03/u,
    );
  });

  it("refuses an entry outside the canonical P01..P14 namespace", async () => {
    const paths = await prepareFixtures("evidence-init-unsupported", {
      unsupportedPersona: true,
    });
    await expect(
      loadVerifiedBlindPersonaCustodyIndex(paths.custodyIndexPath),
    ).rejects.toThrow(/unsupported blind persona ID[\s\S]*P15/u);
  });

  it("refuses an empty custody index as non-canonical", async () => {
    const root = await uniqueTestRoot("evidence-init-empty");
    const custodyIndexPath = path.join(root, "index.json");
    await writeCustodyIndexAt(custodyIndexPath, { listedIds: [] });
    await expect(
      loadVerifiedBlindPersonaCustodyIndex(custodyIndexPath),
    ).rejects.toThrow(
      /does not carry the canonical blind-persona wave[\s\S]*missing: P01,/u,
    );
    await expect(() => assertCanonicalBlindPersonaCoverage([])).toThrow(
      /missing: P01,/u,
    );
  });
});

describe("blind-persona-evidence-harness record", () => {
  it("round-trips a valid filled record atomically in canonical form", async () => {
    const paths = await prepareFixtures("evidence-record-ok");
    await materializeEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
    });
    const recordPath = path.join(
      paths.evidenceRoot,
      "P01",
      EVIDENCE_RECORD_FILENAME,
    );
    const source = filledRecord("P01", paths.custodyIndexPath);
    const scrambled: Record<string, unknown> = {};
    for (const key of [...EVIDENCE_RECORD_KEYS].reverse()) {
      scrambled[key] = source[key];
    }
    await writeFile(recordPath, JSON.stringify(scrambled), "utf8");

    const outcome = await recordBlindPersonaEvidence({ file: recordPath });
    expect(outcome.personaId).toBe("P01");
    expect(outcome.verdict).toBe("complete");
    expect(outcome.screenshotCount).toBe(2);
    expect(outcome.severityCounts).toEqual({ P0: 0, P1: 0, P2: 1 });

    const text = await readFile(recordPath, "utf8");
    expect(text.endsWith("\n")).toBe(true);
    const reparsed = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(reparsed)).toEqual([...EVIDENCE_RECORD_KEYS]);
    expect(reparsed).toEqual(source);
    expect((await lstat(recordPath)).mode & 0o777).toBe(0o644);
  });

  it("rejects a missing screenshot and never touches the original bytes", async () => {
    const paths = await prepareFixtures("evidence-record-shot-missing");
    const recordDirectory = await makeRecordContext(paths, "P02");
    const recordPath = path.join(recordDirectory, EVIDENCE_RECORD_FILENAME);
    const original = filledRecord("P02", paths.custodyIndexPath);
    original.screenshotPaths = ["shots/absent.png"];
    const originalBytes = Buffer.from(JSON.stringify(original), "utf8");
    await writeFile(recordPath, originalBytes, "utf8");

    await expect(
      recordBlindPersonaEvidence({ file: recordPath }),
    ).rejects.toThrow(/screenshotPaths\[0\] does not exist on disk/u);
    expect((await readFile(recordPath)).equals(originalBytes)).toBe(true);
    const leftovers = (await readdir(recordDirectory)).filter((name) =>
      name.includes(".tmp-"),
    );
    expect(leftovers).toEqual([]);
  });

  it("enforces blocked-verdict coupling: blocker and severity are mandatory", async () => {
    const paths = await prepareFixtures("evidence-record-blocked-coupling");
    const recordDirectory = await makeRecordContext(paths, "P11");
    const record = filledRecord("P11", paths.custodyIndexPath);
    record.verdict = "blocked";
    record.severities = [];
    let caught: EvidenceValidationError | undefined;
    try {
      await validateEvidenceRecordValue(record, recordDirectory);
    } catch (error) {
      caught = error as EvidenceValidationError;
    }
    expect(caught).toBeInstanceOf(EvidenceValidationError);
    expect(caught?.problems).toHaveLength(2);
    expect(caught?.problems.join(" ")).toMatch(
      /verdict "blocked" requires at least one blockers entry/u,
    );
    expect(caught?.problems.join(" ")).toMatch(
      /verdict "blocked" requires at least one severity finding/u,
    );

    // A blocked record with one severity but still no blockers keeps failing.
    const partialBlocked = filledRecord("P11", paths.custodyIndexPath);
    partialBlocked.verdict = "blocked";
    await expect(
      validateEvidenceRecordValue(partialBlocked, recordDirectory),
    ).rejects.toThrow(
      /verdict "blocked" requires at least one blockers entry/u,
    );
  });

  it("forbids blockers on a complete verdict", async () => {
    const paths = await prepareFixtures("evidence-record-complete-blocker");
    const recordDirectory = await makeRecordContext(paths, "P12");
    const record = filledRecord("P12", paths.custodyIndexPath);
    record.blockers = [
      {
        summary: "not actually blocking",
        stage: "find-jobs",
        screenshotPaths: [`shots/P12-blocker-1.png`],
      },
    ];
    await expect(
      validateEvidenceRecordValue(record, recordDirectory),
    ).rejects.toThrow(/verdict "complete" requires an empty blockers array/u);
  });

  it("requires every blocker to carry at least one known screenshot", async () => {
    const paths = await prepareFixtures("evidence-record-blocker-shots");
    const recordDirectory = await makeRecordContext(paths, "P12");

    const emptyShots = filledRecord("P12", paths.custodyIndexPath);
    emptyShots.verdict = "blocked";
    emptyShots.severities = [
      {
        level: "P0",
        area: "core-flow",
        summary: "Blocked.",
        evidenceRefs: [],
      },
    ];
    emptyShots.blockers = [
      { summary: "Stuck.", stage: "setup", screenshotPaths: [] },
    ];
    await expect(
      validateEvidenceRecordValue(emptyShots, recordDirectory),
    ).rejects.toThrow(
      /blockers\[0\].screenshotPaths must contain at least one screenshot path/u,
    );

    const unknownRef = filledRecord("P12", paths.custodyIndexPath);
    unknownRef.verdict = "blocked";
    unknownRef.severities = [
      {
        level: "P0",
        area: "core-flow",
        summary: "Blocked.",
        evidenceRefs: [],
      },
    ];
    unknownRef.blockers = [
      {
        summary: "Stuck.",
        stage: "setup",
        screenshotPaths: ["shots/not-listed.png"],
      },
    ];
    await expect(
      validateEvidenceRecordValue(unknownRef, recordDirectory),
    ).rejects.toThrow(
      /blockers\[0\].screenshotPaths\[0\] must reference a path listed in the top-level screenshotPaths/u,
    );
  });

  it("rejects severity levels outside the P0|P1|P2 enum", async () => {
    const paths = await prepareFixtures("evidence-record-bad-enum");
    const recordDirectory = await makeRecordContext(paths, "P03");
    const record = filledRecord("P03", paths.custodyIndexPath);
    (record.severities as { level: string }[])[0]!.level = "P3";
    await expect(
      validateEvidenceRecordValue(record, recordDirectory),
    ).rejects.toThrow(/severities\[0\]: level must be one of P0\|P1\|P2/u);
    await expect(
      validateEvidenceRecordValue(record, recordDirectory),
    ).rejects.toBeInstanceOf(EvidenceValidationError);
  });

  it("rejects unknown top-level and nested fields (strict schema)", async () => {
    const paths = await prepareFixtures("evidence-record-unknown-field");
    const recordDirectory = await makeRecordContext(paths, "P04");
    const record = filledRecord("P04", paths.custodyIndexPath);
    record.notes = "extra observation";
    await expect(
      validateEvidenceRecordValue(record, recordDirectory),
    ).rejects.toThrow(/Unknown field is not allowed: notes/u);

    const nested = filledRecord("P04", paths.custodyIndexPath);
    (nested.severities as Record<string, unknown>[])[0]!.confidence = "high";
    await expect(
      validateEvidenceRecordValue(nested, recordDirectory),
    ).rejects.toThrow(/severities\[0\] has unknown field: confidence/u);

    const blockerField = filledRecord("P04", paths.custodyIndexPath);
    (blockerField.blockers as Record<string, unknown>[]).push({
      summary: "s",
      stage: "st",
      screenshotPaths: ["shots/P04-blocker-1.png"],
      confidence: "high",
    });
    await expect(
      validateEvidenceRecordValue(blockerField, recordDirectory),
    ).rejects.toThrow(/blockers\[0\] has unknown field: confidence/u);
  });

  it("rejects empty required strings and malformed scalars", async () => {
    const paths = await prepareFixtures("evidence-record-empty");
    const recordDirectory = await makeRecordContext(paths, "P05");

    const emptyConfusion = filledRecord("P05", paths.custodyIndexPath);
    emptyConfusion.firstConfusion = "";
    await expect(
      validateEvidenceRecordValue(emptyConfusion, recordDirectory),
    ).rejects.toThrow(/firstConfusion must be a non-empty string/u);

    const whitespaceArea = filledRecord("P05", paths.custodyIndexPath);
    (whitespaceArea.severities as { area: string }[])[0]!.area = "   ";
    await expect(
      validateEvidenceRecordValue(whitespaceArea, recordDirectory),
    ).rejects.toThrow(/severities\[0\]: area must be a non-empty string/u);

    const negativeBacktracks = filledRecord("P05", paths.custodyIndexPath);
    negativeBacktracks.backtracks = -1;
    await expect(
      validateEvidenceRecordValue(negativeBacktracks, recordDirectory),
    ).rejects.toThrow(/backtracks must be a non-negative integer/u);

    const badSeconds = filledRecord("P05", paths.custodyIndexPath);
    (badSeconds.journeyStages as { seconds: number }[])[0]!.seconds =
      Number.NaN;
    await expect(
      validateEvidenceRecordValue(badSeconds, recordDirectory),
    ).rejects.toThrow(/journeyStages\[0\]: seconds must be a finite number/u);

    const badSchema = filledRecord("P05", paths.custodyIndexPath);
    badSchema.schemaVersion = 2;
    await expect(
      validateEvidenceRecordValue(badSchema, recordDirectory),
    ).rejects.toThrow(/schemaVersion must be 1/u);

    await expect(
      validateEvidenceRecordValue([1, 2, 3], recordDirectory),
    ).rejects.toThrow(/must be a JSON object/u);
  });

  it("reports every collected problem together in one validation error", async () => {
    const paths = await prepareFixtures("evidence-record-collects");
    const recordDirectory = await makeRecordContext(paths, "P06");
    const record = filledRecord("P06", paths.custodyIndexPath);
    record.expectedNextAction = "";
    record.horizontalOverflowFindings = [
      {
        surface: "",
        summary: "overflow",
        screenshotPath: "shots/P06-blocker-1.png",
      },
    ];
    let caught: EvidenceValidationError | undefined;
    try {
      await validateEvidenceRecordValue(record, recordDirectory);
    } catch (error) {
      caught = error as EvidenceValidationError;
    }
    expect(caught).toBeInstanceOf(EvidenceValidationError);
    expect(caught?.problems).toHaveLength(2);
    expect(caught?.problems.join(" ")).toMatch(
      /expectedNextAction must be a non-empty string/,
    );
    expect(caught?.problems.join(" ")).toMatch(
      /horizontalOverflowFindings\[0\]: surface must be a non-empty string/,
    );
  });
});

describe("blind-persona-evidence-harness screenshot path safety", () => {
  it("rejects absolute screenshot paths outright", async () => {
    const paths = await prepareFixtures("evidence-shot-absolute");
    const recordDirectory = await makeRecordContext(paths, "P08");
    const record = filledRecord("P08", paths.custodyIndexPath);
    record.screenshotPaths = ["/etc/hosts"];
    await expect(
      validateEvidenceRecordValue(record, recordDirectory),
    ).rejects.toThrow(
      /screenshotPaths\[0\] must be a relative path inside the persona record directory/u,
    );
  });

  it("rejects upward traversal even when the target file exists", async () => {
    const paths = await prepareFixtures("evidence-shot-traversal");
    const recordDirectory = await makeRecordContext(paths, "P08");
    // A real file at the traversal destination proves the rejection comes
    // from the traversal rule, not from absence on disk.
    const decoyDirectory = path.dirname(paths.evidenceRoot);
    await writeFile(path.join(decoyDirectory, "decoy.txt"), "decoy", "utf8");
    const record = filledRecord("P08", paths.custodyIndexPath);
    record.screenshotPaths = ["../../decoy.txt"];
    await expect(
      validateEvidenceRecordValue(record, recordDirectory),
    ).rejects.toThrow(/screenshotPaths\[0\] must not contain "\.\." segments/u);
  });

  it("rejects dot-dot segments hidden behind valid-looking subdirectories", async () => {
    const paths = await prepareFixtures("evidence-shot-mid-traversal");
    const recordDirectory = await makeRecordContext(paths, "P08");
    const record = filledRecord("P08", paths.custodyIndexPath);
    record.screenshotPaths = ["shots/sub/../../../decoy.txt"];
    await expect(
      validateEvidenceRecordValue(record, recordDirectory),
    ).rejects.toThrow(/must not contain "\.\." segments/u);
  });

  it("rejects symlinks that escape the persona record directory", async () => {
    const paths = await prepareFixtures("evidence-shot-symlink-escape");
    const recordDirectory = await makeRecordContext(paths, "P09");
    const escapeTarget = path.join(paths.root, "escape-payload.png");
    await writeFile(escapeTarget, "outside-bytes", "utf8");
    await symlink(
      escapeTarget,
      path.join(recordDirectory, "shots", "link-out.png"),
    );
    const record = filledRecord("P09", paths.custodyIndexPath);
    record.screenshotPaths = ["shots/link-out.png"];
    await expect(
      validateEvidenceRecordValue(record, recordDirectory),
    ).rejects.toThrow(
      /screenshotPaths\[0\] resolves outside the persona record directory/u,
    );
  });

  it("still accepts symlinks that stay inside the persona record directory", async () => {
    const paths = await prepareFixtures("evidence-shot-symlink-inside");
    const recordDirectory = await makeRecordContext(paths, "P10");
    await symlink(
      path.join(recordDirectory, "shots", "P10-blocker-1.png"),
      path.join(recordDirectory, "shots", "link-in.png"),
    );
    const record = filledRecord("P10", paths.custodyIndexPath);
    record.screenshotPaths = ["shots/link-in.png"];
    const validated = await validateEvidenceRecordValue(
      record,
      recordDirectory,
    );
    expect(validated.personaId).toBe("P10");
    expect(validated.screenshotPaths).toEqual(["shots/link-in.png"]);
  });
});

describe("blind-persona-evidence-harness atomic writer", () => {
  it("replaces content atomically and forces mode 0644", async () => {
    const root = await uniqueTestRoot("evidence-writer-mode");
    const target = path.join(root, "out.json");
    await writeFile(target, "old", { encoding: "utf8", mode: 0o600 });
    await writeFileAtomic0644(target, "new-bytes\n");
    expect(await readFile(target, "utf8")).toBe("new-bytes\n");
    expect((await lstat(target)).mode & 0o777).toBe(0o644);
    const leftovers = (await readdir(root)).filter((name) =>
      name.includes(".tmp-"),
    );
    expect(leftovers).toEqual([]);
  });

  it("leaves the original target untouched when any step fails", async () => {
    const root = await uniqueTestRoot("evidence-writer-failure");
    const target = path.join(root, "keep.json");
    await writeFileAtomic0644(target, "durable-by-design-rename\n");
    await chmod(root, 0o555);
    try {
      // A directory-permission failure surfaces as EACCES on the exclusive
      // temp-file create; the original target bytes must survive untouched.
      await expect(
        writeFileAtomic0644(target, "replacement\n"),
      ).rejects.toMatchObject({ code: "EACCES" });
    } finally {
      await chmod(root, 0o755);
    }
    expect(await readFile(target, "utf8")).toBe("durable-by-design-rename\n");
    const leftovers = (await readdir(root)).filter((name) =>
      name.includes(".tmp-"),
    );
    expect(leftovers).toEqual([]);
  });

  it("serializes scaffolds through the fixed key order", () => {
    const scaffold = scaffoldEvidenceRecord("P09", "/fixture/index.json");
    const parsed = JSON.parse(orderedEvidenceRecordJson(scaffold)) as Record<
      string,
      unknown
    >;
    expect(Object.keys(parsed)).toEqual([...EVIDENCE_RECORD_KEYS]);
    expect(parsed.personaId).toBe("P09");
    expect(parsed.waveCustodyPath).toBe("/fixture/index.json");
  });

  it("pins the seeder writer to the shared canonical serializer and keeps reader-parity on code-unit key order", async () => {
    // Reader/writer parity: a fixture signed with the seeder's exported
    // serializer verifies against this harness's reader. The seeder module is
    // loaded through a runtime specifier (read-only, never modified) so the
    // scoped typecheck stays limited to this harness's own sources. There is
    // deliberately NO catch/skip escape: an import failure fails this test.
    const seederModuleSpecifier = "./prepare-blind-persona-workspaces";
    const seedWriter = (await import(seederModuleSpecifier)) as unknown as {
      stableSeedSerialization: (value: unknown) => string;
    };
    expect(typeof seedWriter.stableSeedSerialization).toBe("function");
    const root = await uniqueTestRoot("evidence-parity");
    const subject = {
      schemaVersion: 1,
      threatBoundary: "parity probe",
      waveComplete: true,
      build: { runDir: "/fixture/run" },
      personas: PERSONA_IDS.map((personaId) => ({
        personaId,
        seedManifestPath: `/fixture/${personaId}/manifest.json`,
        seedManifestSha256: sha256Hex(`seed:${personaId}`),
        userDataRoot: `/fixture/${personaId}`,
        workspaceDigest: sha256Hex(`payload:${personaId}`),
      })),
    };
    const custodyIndexPath = path.join(root, "parity-index.json");
    await writeFile(
      custodyIndexPath,
      JSON.stringify({
        ...subject,
        custodyIndexSha256: sha256Hex(
          seedWriter.stableSeedSerialization(subject),
        ),
      }),
      "utf8",
    );
    const loaded = await loadVerifiedBlindPersonaCustodyIndex(custodyIndexPath);
    expect(loaded.personas).toHaveLength(14);

    // Writer side: the seeder delegates to the harness's single canonical
    // serializer, so ordering is code-unit sort — deterministic across
    // locales/ICU and byte-identical to digestSeed inputs even for keys whose
    // relative order differs under locale collation (mixed case, "_", non-ASCII).
    const asciiProbe = { Z: 1, "10": 2, "2": 3, _z: 4, a: 5 };
    const viaHarness = stableJson(asciiProbe);
    expect(viaHarness).toBe(seedWriter.stableSeedSerialization(asciiProbe));
    expect(seedWriter.stableSeedSerialization(asciiProbe)).toBe(viaHarness);
    expect(viaHarness).toBe('{"2":3,"10":2,"Z":1,"_z":4,"a":5}');
    expect(viaHarness).toMatch(/^[\x20-\x7E]+$/u);

    // Reader/writer parity on keys where locale collation diverges from
    // code-unit order (mixed case, "_", digit-leading): this harness's
    // canonicalizer must sort exactly like the custody writer and the tester
    // verifiers' stableJson, or future such keys would be falsely rejected as
    // custody-digest mismatches. P01..P14 records never hit this today; this
    // pins the comparator against drift.
    const collationDivergentProbe = { Z: 1, "10": 2, _x: 3, B: 4, a: 5 };
    const codeUnitForm = stableJson(collationDivergentProbe);
    expect(codeUnitForm).toBe('{"10":2,"B":4,"Z":1,"_x":3,"a":5}');
    expect(stableEvidenceSerialization(collationDivergentProbe)).toBe(
      codeUnitForm,
    );
    expect(stableEvidenceSerialization(collationDivergentProbe)).toBe(
      seedWriter.stableSeedSerialization(collationDivergentProbe),
    );
    // Why these keys: under locale collation "a" sorts before "B" (case is
    // tertiary) while code-unit order puts "B" first — so a regression back
    // to localeCompare flips the pinned form above.
    expect("B".localeCompare("a")).toBeGreaterThan(0);
  });
});

describe("blind-persona-evidence-harness aggregate", () => {
  it("aggregates the exact canonical wave deterministically and writes the synthesis", async () => {
    const paths = await prepareFixtures("evidence-aggregate-ok");
    await materializeEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
    });
    // Synthesis output is contained inside the evidence root.
    const outPath = path.join(paths.evidenceRoot, "synthesis-input.json");
    const outcome = await aggregateBlindPersonaEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
      out: outPath,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.exitReasons).toEqual([]);
    expect(outcome.failures).toEqual([]);
    expect(outcome.synthesisPath).toBe(outPath);
    const synthesis = outcome.synthesis;
    expect(synthesis?.kind).toBe("blind-persona-evidence-synthesis-input");
    expect(synthesis?.schemaVersion).toBe(
      BLIND_PERSONA_EVIDENCE_SCHEMA_VERSION,
    );
    expect(synthesis?.waveComplete).toBe(true);
    expect(synthesis?.custodyIndexPath).toBe(
      await realpath(paths.custodyIndexPath),
    );
    expect(synthesis?.evidenceRoot).toBe(await realpath(paths.evidenceRoot));
    expect(Number.isFinite(Date.parse(synthesis?.generatedAtIso ?? ""))).toBe(
      true,
    );
    expect(synthesis?.personas.map((entry) => entry.personaId)).toEqual(
      PERSONA_IDS,
    );
    expect(synthesis?.summary).toEqual({
      horizontalOverflowPersonaIds: [],
      p0Count: 0,
      p1Count: 0,
      p2Count: 14,
      personasWithP0: [],
      rendererErrorCount: 0,
      verdictBlocked: 0,
      verdictComplete: 14,
      verdictPartial: 0,
    });
    for (const personaId of PERSONA_IDS) {
      const expected = expectProjectionOf(
        filledRecord(personaId, paths.custodyIndexPath),
        personaId,
      );
      const actual = synthesis?.personas.find(
        (entry) => entry.personaId === personaId,
      );
      expect(actual).toBeTruthy();
      expect(actual).toEqual(expected);
    }
    const written = JSON.parse(await readFile(outPath, "utf8")) as unknown;
    expect(written).toEqual(synthesis);
  });

  it("defaults the synthesis output to a direct child of the evidence root", async () => {
    const paths = await prepareFixtures("evidence-aggregate-default-out");
    await materializeEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
    });
    const outcome = await aggregateBlindPersonaEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
      out: null,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.synthesisPath).toBe(
      path.join(await realpath(paths.evidenceRoot), SYNTHESIS_OUTPUT_FILENAME),
    );
    await stat(String(outcome.synthesisPath)).then((info) =>
      expect(info.isFile()).toBe(true),
    );
  });

  it("contains --out inside the evidence root and refuses unsafe targets", async () => {
    const paths = await prepareFixtures("evidence-aggregate-containment");
    await materializeEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
    });
    const run = (out: string | null) =>
      aggregateBlindPersonaEvidence({
        custodyIndexPath: paths.custodyIndexPath,
        evidenceRoot: paths.evidenceRoot,
        out,
      }).catch((error: unknown) =>
        error instanceof Error ? error.message : String(error),
      );

    // Persona subpath: rejected.
    expect(await run(path.join(paths.evidenceRoot, "P01", "syn.json"))).toMatch(
      /direct child of the canonical evidence root/u,
    );
    // Parent escape via dot-dot: rejected.
    expect(await run(path.join(paths.evidenceRoot, "..", "syn.json"))).toMatch(
      /direct child of the canonical evidence root/u,
    );
    // Custody-side location: rejected.
    expect(await run(path.join(paths.root, "custody", "syn.json"))).toMatch(
      /direct child of the canonical evidence root/u,
    );
    // Evidence-record filename: rejected even as a direct child.
    expect(
      await run(path.join(paths.evidenceRoot, EVIDENCE_RECORD_FILENAME)),
    ).toMatch(/must never overwrite an evidence record/u);
    // Existing symlink target: rejected.
    const linkTarget = path.join(paths.root, "outside.json");
    await writeFile(linkTarget, "{}", "utf8");
    const symlinkOut = path.join(paths.evidenceRoot, "link-syn.json");
    await symlink(linkTarget, symlinkOut);
    expect(await run(symlinkOut)).toMatch(/existing symlink/u);
    // Nothing was written anywhere during these refusals: the only .json
    // entries are setup fixtures (the refusal-test symlink itself).
    expect(
      await readdir(paths.evidenceRoot).then((entries) =>
        entries.filter(
          (name) => name.includes(".json") && name !== "link-syn.json",
        ),
      ),
    ).toEqual([]);
  });

  it("binds every record to the verified custody index before aggregating", async () => {
    const paths = await prepareFixtures("evidence-aggregate-binding");
    await materializeEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
    });
    // A second, fully valid wave-B custody index.
    const waveBIndexPath = path.join(
      paths.root,
      "custody-b",
      "blind-persona-wave-custody-index.json",
    );
    await writeCustodyIndexAt(waveBIndexPath);
    // Point one record at wave B. The record command accepts it (shape-only
    // validation); aggregate is the authority that catches the migration.
    const drifted = path.join(
      paths.evidenceRoot,
      "P07",
      EVIDENCE_RECORD_FILENAME,
    );
    const driftRecord = filledRecord("P07", waveBIndexPath);
    await writeFile(drifted, JSON.stringify(driftRecord), "utf8");
    const recordOutcome = await recordBlindPersonaEvidence({ file: drifted });
    expect(recordOutcome.personaId).toBe("P07");

    const outcome = await aggregateBlindPersonaEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
      out: null,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.synthesis).toBeNull();
    expect(outcome.failures.map((row) => row.personaId)).toEqual(["P07"]);
    expect(outcome.failures[0]?.reason).toMatch(
      /Wave binding mismatch: record\.waveCustodyPath resolves to .* but this aggregation is bound to /u,
    );
  });

  it("reports incompleteness before canonical-set diagnostics for real partial waves", async () => {
    // Real partial shape: subset of personas AND waveComplete:false.
    const paths = await prepareFixtures("evidence-aggregate-real-partial", {
      incompleteWave: true,
      omitPersonas: ["P13", "P14"],
    });
    let message = "";
    try {
      await aggregateBlindPersonaEvidence({
        custodyIndexPath: paths.custodyIndexPath,
        evidenceRoot: paths.evidenceRoot,
        out: null,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(
      /Incomplete blind-persona custody \(waveComplete:false\) cannot aggregate canonical persona evidence/u,
    );
    expect(message).not.toMatch(/canonical blind-persona wave exactly once/u);
  });

  it("fails when the waveComplete:true index misses a canonical persona", async () => {
    const paths = await prepareFixtures("evidence-aggregate-missing-persona", {
      omitPersonas: ["P07"],
    });
    await expect(
      aggregateBlindPersonaEvidence({
        custodyIndexPath: paths.custodyIndexPath,
        evidenceRoot: paths.evidenceRoot,
        out: null,
      }),
    ).rejects.toThrow(
      /canonical blind-persona wave exactly once each[\s\S]*missing: P07/u,
    );
  });

  it("fails on a missing persona record and clears stale default synthesis", async () => {
    const paths = await prepareFixtures("evidence-aggregate-missing");
    await materializeEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
    });
    // Produce a current-looking default synthesis first.
    const firstRun = await aggregateBlindPersonaEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
      out: null,
    });
    expect(firstRun.ok).toBe(true);
    const defaultOutput = String(firstRun.synthesisPath);
    await stat(defaultOutput).then((info) => expect(info.isFile()).toBe(true));

    await rm(path.join(paths.evidenceRoot, "P07", EVIDENCE_RECORD_FILENAME));
    const outcome = await aggregateBlindPersonaEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
      out: null,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.synthesis).toBeNull();
    expect(outcome.synthesisPath).toBeNull();
    expect(outcome.failures.map((row) => row.personaId)).toEqual(["P07"]);
    expect(outcome.exitReasons.join(" ")).toMatch(
      /Removed stale default synthesis output/u,
    );
    // The stale derived output is gone and cannot masquerade as current.
    await expect(stat(defaultOutput)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("fails on an invalid persona record and writes no synthesis output", async () => {
    const paths = await prepareFixtures("evidence-aggregate-invalid");
    await materializeEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
      mutate: (personaId, record) => {
        if (personaId === "P03") record.verdict = "excellent";
      },
    });
    const outcome = await aggregateBlindPersonaEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
      out: null,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.synthesis).toBeNull();
    expect(outcome.failures).toHaveLength(1);
    expect(outcome.failures[0]?.personaId).toBe("P03");
    expect(outcome.failures[0]?.reason).toMatch(/verdict must be one of/u);
  });

  it("fails closed when a record is filed under the wrong persona directory", async () => {
    const paths = await prepareFixtures("evidence-aggregate-crosspersona");
    await materializeEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
    });
    // Screenshot refs swapped to P04's own files so the record validates and
    // the personaId mismatch itself is what fails aggregation.
    const misplaced = filledRecord("P09", paths.custodyIndexPath);
    misplaced.screenshotPaths = filledRecord("P04", paths.custodyIndexPath)
      .screenshotPaths as string[];
    await writeFile(
      path.join(paths.evidenceRoot, "P04", EVIDENCE_RECORD_FILENAME),
      JSON.stringify(misplaced),
      "utf8",
    );
    const outcome = await aggregateBlindPersonaEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
      out: null,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.synthesis).toBeNull();
    expect(outcome.failures[0]?.personaId).toBe("P04");
    expect(outcome.failures[0]?.reason).toMatch(
      /personaId mismatch: record says P09 but custody entry is P04/u,
    );
  });

  it("writes the synthesis for a P0 wave yet still exits nonzero", async () => {
    const paths = await prepareFixtures("evidence-aggregate-p0");
    await materializeEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
      mutate: (personaId, record) => {
        if (personaId === "P05") {
          record.verdict = "blocked";
          record.severities = [
            {
              level: "P0",
              area: "core-flow",
              summary: "Could not reach Prepare application.",
              evidenceRefs: [`${personaId}-blocker-1`],
            },
          ];
          record.blockers = [
            {
              summary: "Prepare application never became reachable.",
              stage: "resume-review",
              screenshotPaths: [`shots/${personaId}-blocker-1.png`],
            },
          ];
        }
      },
    });
    const outPath = path.join(paths.evidenceRoot, "synthesis-input.json");
    const outcome = await aggregateBlindPersonaEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
      out: outPath,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.exitReasons.join(" ")).toMatch(
      /1 P0 finding\(s\) present across persona\(s\): P05/u,
    );
    expect(outcome.synthesis).not.toBeNull();
    expect(outcome.synthesisPath).toBe(outPath);
    expect(outcome.synthesis?.summary.p0Count).toBe(1);
    expect(outcome.synthesis?.summary.personasWithP0).toEqual(["P05"]);
    expect(outcome.synthesis?.summary.verdictBlocked).toBe(1);
    expect(outcome.synthesis?.summary.verdictComplete).toBe(13);
    const blockedProjection = outcome.synthesis?.personas.find(
      (entry) => entry.personaId === "P05",
    );
    expect(blockedProjection?.blockers).toHaveLength(1);
    const written = JSON.parse(await readFile(outPath, "utf8")) as {
      summary: { p0Count: number };
    };
    expect(written.summary.p0Count).toBe(1);
  });

  it("preserves multiple horizontal-overflow occurrences and derives the flag", async () => {
    const paths = await prepareFixtures("evidence-aggregate-overflow");
    await materializeEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
      mutate: (personaId, record) => {
        if (personaId === "P06") {
          record.horizontalOverflowFindings = [
            {
              surface: "results-grid",
              summary: "Row actions pushed past the right edge.",
              screenshotPath: `shots/${personaId}-blocker-1.png`,
            },
            {
              surface: "job-detail-pane",
              summary: "Long company names clipped the footer.",
              screenshotPath: `shots/extra/${personaId}-extra.png`,
            },
          ];
          record.verdict = "partial";
        }
      },
    });
    const outcome = await aggregateBlindPersonaEvidence({
      custodyIndexPath: paths.custodyIndexPath,
      evidenceRoot: paths.evidenceRoot,
      out: null,
    });
    expect(outcome.ok).toBe(true);
    const projection = outcome.synthesis?.personas.find(
      (entry) => entry.personaId === "P06",
    );
    expect(projection?.horizontalOverflow).toBe(true);
    expect(projection?.horizontalOverflowFindings).toHaveLength(2);
    expect(
      projection?.horizontalOverflowFindings.map((f) => f.surface),
    ).toEqual(["results-grid", "job-detail-pane"]);
    expect(outcome.synthesis?.summary.horizontalOverflowPersonaIds).toEqual([
      "P06",
    ]);
    // Personas without findings derive false.
    const clean = outcome.synthesis?.personas.find(
      (entry) => entry.personaId === "P01",
    );
    expect(clean?.horizontalOverflow).toBe(false);
  });
});

describe("blind-persona-evidence-harness CLI parsing", () => {
  const repositoryRelative = (value: string): string =>
    // The CLI parser resolves relative paths against the process cwd, which
    // differs between package-local and repository-wide Vitest invocations.
    path.resolve(process.cwd(), value);

  it("routes the three commands with resolved paths", () => {
    expect(
      parseBlindPersonaEvidenceCli([
        "init",
        "--custody-index",
        "idx.json",
        "--evidence-root",
        "ev",
      ]),
    ).toEqual({
      command: "init",
      custodyIndexPath: repositoryRelative("idx.json"),
      evidenceRoot: repositoryRelative("ev"),
    });
    expect(
      parseBlindPersonaEvidenceCli(["record", "--file", "r.json"]),
    ).toEqual({
      command: "record",
      file: repositoryRelative("r.json"),
    });
    expect(
      parseBlindPersonaEvidenceCli([
        "aggregate",
        "--custody-index",
        "idx.json",
        "--evidence-root",
        "ev",
      ]),
    ).toEqual({
      command: "aggregate",
      custodyIndexPath: repositoryRelative("idx.json"),
      evidenceRoot: repositoryRelative("ev"),
      out: null,
    });
    expect(
      parseBlindPersonaEvidenceCli([
        "aggregate",
        "--custody-index",
        "idx.json",
        "--evidence-root",
        "ev",
        "--out",
        "syn.json",
      ]),
    ).toEqual({
      command: "aggregate",
      custodyIndexPath: repositoryRelative("idx.json"),
      evidenceRoot: repositoryRelative("ev"),
      out: repositoryRelative("syn.json"),
    });
  });

  it("prints help (null) for --help, -h, empty args, and unknown commands", () => {
    expect(parseBlindPersonaEvidenceCli(["--help"])).toBeNull();
    expect(parseBlindPersonaEvidenceCli(["-h"])).toBeNull();
    expect(parseBlindPersonaEvidenceCli([])).toBeNull();
    expect(parseBlindPersonaEvidenceCli(["transcribe"])).toBeNull();
  });

  it("enforces known, unduplicated, valued flags per command", () => {
    expect(() => parseBlindPersonaEvidenceCli(["init"])).toThrow(
      /Missing required --custody-index/u,
    );
    expect(() =>
      parseBlindPersonaEvidenceCli([
        "record",
        "--file",
        "r.json",
        "--persona",
        "P01",
      ]),
    ).toThrow(/Unknown blind-persona-evidence CLI argument: --persona/u);
    expect(() =>
      parseBlindPersonaEvidenceCli([
        "record",
        "--file",
        "r.json",
        "--file",
        "other.json",
      ]),
    ).toThrow(/Duplicate blind-persona-evidence CLI argument: --file/u);
    expect(() =>
      parseBlindPersonaEvidenceCli(["aggregate", "--custody-index"]),
    ).toThrow(/Missing required --custody-index/u);
    expect(() =>
      parseBlindPersonaEvidenceCli(["record", "stray-positional"]),
    ).toThrow(/Unexpected blind-persona-evidence CLI positional/u);
  });

  it("fails flags-first unknown input at the parser level", () => {
    expect(() => parseBlindPersonaEvidenceCli(["--foo"])).toThrow(
      /Unknown blind-persona-evidence CLI input: --foo \(expected init, record, or aggregate as the first argument\)/u,
    );
    expect(() =>
      parseBlindPersonaEvidenceCli(["--custody-index", "x", "init"]),
    ).toThrow(/Unknown blind-persona-evidence CLI input: --custody-index/u);
  });

  it("exits nonzero for flags-first input and keeps bare help successful (spawn)", () => {
    const cliPath = path.join(
      scriptDirectory,
      "blind-persona-evidence-harness-cli.mjs",
    );
    const bad = spawnSync(process.execPath, [cliPath, "--foo"], {
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toMatch(/Unknown blind-persona-evidence input: --foo/u);
    expect(bad.stdout).not.toMatch(/Usage:/u);
    const help = spawnSync(process.execPath, [cliPath, "--help"], {
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(help.status).toBe(0);
    expect(help.stdout).toMatch(/Canonical complete wave only/u);
  }, 120_000);
});

describe("blind-persona-evidence-harness help text", () => {
  it("states canonical-wave, binding, containment, and schema requirements", () => {
    expect(BLIND_PERSONA_EVIDENCE_HELP).toMatch(
      /Canonical complete wave only:[\s\S]*fail closed when custody waveComplete is not\s+true/u,
    );
    expect(BLIND_PERSONA_EVIDENCE_HELP).toMatch(
      /exactly\s+P01 through P14 once each/u,
    );
    expect(BLIND_PERSONA_EVIDENCE_HELP).toMatch(
      /Incompleteness is reported before canonical-set\s+diagnostics/u,
    );
    expect(BLIND_PERSONA_EVIDENCE_HELP).toMatch(
      /aggregate is the authority that binds each\s+record's waveCustodyPath/u,
    );
    expect(BLIND_PERSONA_EVIDENCE_HELP).toMatch(
      /direct child\s+of the evidence root/u,
    );
    expect(BLIND_PERSONA_EVIDENCE_HELP).toMatch(
      /blockers with non-empty summary,\s+stage, and at least one screenshot/u,
    );
    expect(BLIND_PERSONA_EVIDENCE_HELP).toMatch(
      /structured horizontalOverflowFindings with surface\/summary\/screenshotPath/u,
    );
    expect(BLIND_PERSONA_EVIDENCE_HELP).toMatch(
      /free-form supplementary evidenceRefs/u,
    );
    expect(BLIND_PERSONA_EVIDENCE_HELP).toMatch(
      /INPUT to independent\s+synthesis; it is not final acceptance/u,
    );
    expect(BLIND_PERSONA_EVIDENCE_HELP).toMatch(
      /flags-first arguments such as --foo -- exits nonzero/u,
    );
  });
});
