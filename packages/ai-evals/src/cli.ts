import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createFrozenEvalCases, digestEvalCorpus } from "./case-registry";
import {
  codexAgentReferenceLane,
  EvalAttemptSchema,
  EvalLaneIdSchema,
  EvalRunManifestSchema,
  systemEvalLanes,
} from "./contracts";
import { gradeEvalAttempt } from "./grader";
import {
  createFullReport,
  createLaneReport,
  createPilotReport,
} from "./report";
import {
  readSystemLaneEnvironment,
  runProfileCopilotSystemCase,
  runSystemCase,
} from "./system-lane";

function readRepositoryHead(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unavailable";
  }
}

function findSystemLane(laneId: string) {
  const parsedLaneId = EvalLaneIdSchema.parse(laneId);
  const lane = systemEvalLanes.find(
    (candidate) => candidate.id === parsedLaneId,
  );
  if (!lane) throw new Error(`${laneId} is not a system lane.`);
  return {
    ...lane,
    id: lane.id as Exclude<typeof parsedLaneId, "codex_agent_reference">,
  };
}

function parseRunLabel(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
  if (!normalized)
    throw new Error("Run label must contain a letter or number.");
  return normalized.slice(0, 80);
}

function selectPilotCases(cases: ReturnType<typeof createFrozenEvalCases>) {
  const seen = new Map<string, number>();
  return cases.filter((evalCase) => {
    const count = seen.get(evalCase.capability) ?? 0;
    seen.set(evalCase.capability, count + 1);
    return count < 2;
  });
}

function seededShuffle<T>(values: readonly T[], seed: string): T[] {
  const shuffled = [...values];
  let state = Number.parseInt(
    createHash("sha256").update(seed).digest("hex").slice(0, 8),
    16,
  );
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    const swapIndex = state % (index + 1);
    const current = shuffled[index];
    shuffled[index] = shuffled[swapIndex] as T;
    shuffled[swapIndex] = current as T;
  }
  return shuffled;
}

function orderFullCases(
  cases: ReturnType<typeof createFrozenEvalCases>,
  laneId: string,
) {
  const laneIndex = systemEvalLanes.findIndex((lane) => lane.id === laneId);
  const capabilityBuckets = Array.from(
    new Set(cases.map((evalCase) => evalCase.capability)),
  ).map((capability) =>
    seededShuffle(
      cases.filter((evalCase) => evalCase.capability === capability),
      `ai-evals-v2:${capability}`,
    ),
  );
  return Array.from({ length: 10 }, (_, caseIndex) =>
    capabilityBuckets.map(
      (bucket, bucketIndex) =>
        bucket[(caseIndex + laneIndex + bucketIndex) % bucket.length],
    ),
  )
    .flat()
    .filter((evalCase): evalCase is (typeof cases)[number] =>
      Boolean(evalCase),
    );
}

const hardCanaryCaseIds = [
  "resume_text_import_overlapping_dates",
  "resume_vision_repeated_headers",
  "resume_generation_long_chronology",
  "guided_resume_edits_unsupported_metric",
  "profile_copilot_ambiguous",
  "job_page_extraction_detail_contamination",
  "agentic_job_discovery_pagination",
  "source_debug_login_redirect",
  "browser_visual_analysis_final_submit",
  "interview_cue_visual",
  "interview_screenshot_vision_conflicting",
] as const;

function orderPilotCases(
  cases: ReturnType<typeof selectPilotCases>,
  laneId: string,
) {
  const laneIndex = systemEvalLanes.findIndex((lane) => lane.id === laneId);
  if (laneIndex <= 0) return cases;
  const capabilityPairs = Array.from({ length: cases.length / 2 }, (_, index) =>
    cases.slice(index * 2, index * 2 + 2),
  );
  const rotated = [
    ...capabilityPairs.slice(laneIndex),
    ...capabilityPairs.slice(0, laneIndex),
  ];
  return rotated.flatMap((pair, index) =>
    (index + laneIndex) % 2 === 0 ? pair : [...pair].reverse(),
  );
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function runAiEvalCli(args: readonly string[]): Promise<void> {
  const command = args[0] ?? "plan";
  if (
    command !== "plan" &&
    command !== "preflight" &&
    command !== "case" &&
    command !== "pilot" &&
    command !== "canary" &&
    command !== "full" &&
    command !== "grade" &&
    command !== "report" &&
    command !== "full-report" &&
    command !== "lane-report"
  ) {
    throw new Error(`Unsupported ai benchmark command: ${command}`);
  }

  const cases = createFrozenEvalCases();
  const manifest = EvalRunManifestSchema.parse({
    schemaVersion: 1,
    runId: `ai_eval_plan_${new Date().toISOString().replace(/\W/g, "_")}`,
    createdAt: new Date().toISOString(),
    repositoryHead: readRepositoryHead(),
    corpusDigest: digestEvalCorpus(cases),
    randomizedCaseIds: seededShuffle(cases, "ai-evals-v2-manifest").map(
      (evalCase) => evalCase.id,
    ),
    lanes: [...systemEvalLanes, codexAgentReferenceLane],
    caseCount: cases.length,
    safety: {
      syntheticOnly: true,
      store: false,
      realWorkspaceAllowed: false,
      externalWritesAllowed: false,
    },
  });

  const capabilityCounts = Object.fromEntries(
    Array.from(new Set(cases.map((evalCase) => evalCase.capability))).map(
      (capability) => [
        capability,
        cases.filter((evalCase) => evalCase.capability === capability).length,
      ],
    ),
  );

  if (command === "pilot") {
    const lane = findSystemLane(args[1] ?? "");
    const pilotCases = orderPilotCases(selectPilotCases(cases), lane.id);
    const pilotId = `pilot_v1_${manifest.corpusDigest.slice(0, 12)}`;
    const pilotDirectory = path.resolve(".tmp", "ai-evals", pilotId);
    const laneDirectory = path.join(pilotDirectory, lane.id);
    await mkdir(laneDirectory, { recursive: true });
    await writeFile(
      path.join(pilotDirectory, "manifest.json"),
      `${JSON.stringify(
        {
          ...manifest,
          runId: pilotId,
          randomizedCaseIds: pilotCases.map((evalCase) => evalCase.id),
          caseCount: pilotCases.length,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    let completed = 0;
    let skipped = 0;
    for (const evalCase of pilotCases) {
      const attemptPath = path.join(laneDirectory, `${evalCase.id}.json`);
      if (await pathExists(attemptPath)) {
        EvalAttemptSchema.parse(
          JSON.parse(await readFile(attemptPath, "utf8")) as unknown,
        );
        skipped += 1;
        process.stdout.write(
          `${JSON.stringify({ event: "skipped", laneId: lane.id, caseId: evalCase.id })}\n`,
        );
        continue;
      }
      const attempt = await runSystemCase({
        runId: pilotId,
        lane,
        evalCase,
        environment: readSystemLaneEnvironment(process.env),
      });
      await writeFile(
        attemptPath,
        `${JSON.stringify(attempt, null, 2)}\n`,
        "utf8",
      );
      completed += 1;
      process.stdout.write(
        `${JSON.stringify({
          event: "completed",
          laneId: lane.id,
          caseId: evalCase.id,
          status: attempt.status,
          durationMs: Math.round(attempt.durationMs),
          providerCallCount: attempt.providerCallCount,
          fallbackDetected: attempt.fallbackDetected,
          guardedRejectionDetected: attempt.guardedRejectionDetected,
        })}\n`,
      );
    }
    process.stdout.write(
      `${JSON.stringify({ event: "pilot_complete", laneId: lane.id, completed, skipped, pilotDirectory })}\n`,
    );
    return;
  }

  if (command === "full") {
    const lane = findSystemLane(args[1] ?? "");
    const runLabel = parseRunLabel(args[2]);
    const orderedCases = orderFullCases(cases, lane.id);
    const runId = `full_v2_${manifest.corpusDigest.slice(0, 12)}${runLabel ? `_${runLabel}` : ""}`;
    const runDirectory = path.resolve(".tmp", "ai-evals", runId);
    const laneDirectory = path.join(runDirectory, lane.id);
    await mkdir(laneDirectory, { recursive: true });
    const laneManifestPath = path.join(
      runDirectory,
      `manifest.${lane.id}.json`,
    );
    await writeFile(
      laneManifestPath,
      `${JSON.stringify(
        {
          ...manifest,
          runId,
          randomizedCaseIds: orderedCases.map((evalCase) => evalCase.id),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    let completed = 0;
    let skipped = 0;
    for (const evalCase of orderedCases) {
      const attemptPath = path.join(laneDirectory, `${evalCase.id}.json`);
      if (await pathExists(attemptPath)) {
        const existing = EvalAttemptSchema.parse(
          JSON.parse(await readFile(attemptPath, "utf8")) as unknown,
        );
        if (existing.runId !== runId || existing.laneId !== lane.id) {
          throw new Error(`Stale attempt at ${attemptPath}.`);
        }
        skipped += 1;
        continue;
      }
      const attempt = await runSystemCase({
        runId,
        lane,
        evalCase,
        environment: readSystemLaneEnvironment(process.env),
      });
      await writeFile(
        attemptPath,
        `${JSON.stringify(attempt, null, 2)}\n`,
        "utf8",
      );
      completed += 1;
      process.stdout.write(
        `${JSON.stringify({ event: "completed", laneId: lane.id, caseId: evalCase.id, status: attempt.status, durationMs: Math.round(attempt.durationMs) })}\n`,
      );
    }
    const outcomeFiles = await Promise.all(
      orderedCases.map((evalCase) =>
        readFile(path.join(laneDirectory, `${evalCase.id}.json`), "utf8"),
      ),
    );
    const validated = outcomeFiles.map((value) =>
      EvalAttemptSchema.parse(JSON.parse(value) as unknown),
    );
    if (
      validated.length !== cases.length ||
      new Set(validated.map((attempt) => attempt.caseId)).size !== cases.length
    ) {
      throw new Error(
        `Full lane is incomplete or duplicated: expected ${cases.length} unique outcomes.`,
      );
    }
    process.stdout.write(
      `${JSON.stringify({ event: "full_complete", runId, laneId: lane.id, completed, skipped, outcomeCount: validated.length, runDirectory })}\n`,
    );
    return;
  }

  if (command === "canary") {
    const lane = findSystemLane(args[1] ?? "");
    const canaryCases = hardCanaryCaseIds.map((caseId) => {
      const evalCase = cases.find((candidate) => candidate.id === caseId);
      if (!evalCase) throw new Error(`Missing hard canary case ${caseId}.`);
      return evalCase;
    });
    const runId = `canary_v2_${manifest.corpusDigest.slice(0, 12)}`;
    const runDirectory = path.resolve(".tmp", "ai-evals", runId);
    const laneDirectory = path.join(runDirectory, lane.id);
    await mkdir(laneDirectory, { recursive: true });
    let completed = 0;
    let skipped = 0;
    for (const evalCase of canaryCases) {
      const attemptPath = path.join(laneDirectory, `${evalCase.id}.json`);
      if (await pathExists(attemptPath)) {
        const existing = EvalAttemptSchema.parse(
          JSON.parse(await readFile(attemptPath, "utf8")) as unknown,
        );
        if (existing.runId !== runId || existing.laneId !== lane.id) {
          throw new Error(`Stale canary attempt at ${attemptPath}.`);
        }
        skipped += 1;
        continue;
      }
      const attempt = await runSystemCase({
        runId,
        lane,
        evalCase,
        environment: readSystemLaneEnvironment(process.env),
      });
      await writeFile(
        attemptPath,
        `${JSON.stringify(attempt, null, 2)}\n`,
        "utf8",
      );
      completed += 1;
      process.stdout.write(
        `${JSON.stringify({ event: "completed", laneId: lane.id, caseId: evalCase.id, status: attempt.status, durationMs: Math.round(attempt.durationMs), providerCallCount: attempt.providerCallCount, fallbackDetected: attempt.fallbackDetected })}\n`,
      );
    }
    process.stdout.write(
      `${JSON.stringify({ event: "canary_complete", runId, laneId: lane.id, completed, skipped, caseCount: canaryCases.length, runDirectory })}\n`,
    );
    return;
  }

  if (command === "grade") {
    const attemptPath = path.resolve(args[1] ?? "");
    const attempt = EvalAttemptSchema.parse(
      JSON.parse(await readFile(attemptPath, "utf8")) as unknown,
    );
    const evalCase = cases.find((candidate) => candidate.id === attempt.caseId);
    if (!evalCase)
      throw new Error(`Unknown evaluation case: ${attempt.caseId}`);
    process.stdout.write(
      `${JSON.stringify(gradeEvalAttempt(evalCase, attempt), null, 2)}\n`,
    );
    return;
  }

  if (command === "report") {
    const pilotId = `pilot_v1_${manifest.corpusDigest.slice(0, 12)}`;
    const pilotDirectory = path.resolve(".tmp", "ai-evals", pilotId);
    const result = await createPilotReport({
      pilotDirectory,
      corpusDigest: manifest.corpusDigest,
      codexReferencePath: path.resolve(
        ".tmp",
        "ai-evals",
        "codex-agent-reference-pilot.jsonl",
      ),
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          pilotDirectory,
          jsonPath: result.jsonPath,
          markdownPath: result.markdownPath,
          overall: result.report.overall,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (command === "full-report") {
    const runLabel = parseRunLabel(args[1]);
    const runId = `full_v2_${manifest.corpusDigest.slice(0, 12)}${runLabel ? `_${runLabel}` : ""}`;
    const runDirectory = path.resolve(".tmp", "ai-evals", runId);
    const result = await createFullReport({
      runDirectory,
      corpusDigest: manifest.corpusDigest,
    });
    process.stdout.write(
      `${JSON.stringify({ runDirectory, jsonPath: result.jsonPath, completeness: result.report.completeness, overall: result.report.overall }, null, 2)}\n`,
    );
    return;
  }

  if (command === "lane-report") {
    const lane = findSystemLane(args[1] ?? "luna_high");
    const runLabel = parseRunLabel(args[2]);
    const runId = `full_v2_${manifest.corpusDigest.slice(0, 12)}${runLabel ? `_${runLabel}` : ""}`;
    const runDirectory = path.resolve(".tmp", "ai-evals", runId);
    const result = await createLaneReport({
      runDirectory,
      corpusDigest: manifest.corpusDigest,
      laneId: lane.id,
    });
    process.stdout.write(
      `${JSON.stringify({ runDirectory, jsonPath: result.jsonPath, overall: result.report.overall }, null, 2)}\n`,
    );
    return;
  }

  if (command === "preflight") {
    const lane = findSystemLane(args[1] ?? "luna_high");
    const evalCase = cases.find(
      (candidate) => candidate.id === "profile_copilot_headline",
    );
    if (!evalCase)
      throw new Error("Preflight case is missing from the corpus.");
    const runId = `ai_eval_preflight_${lane.id}_${Date.now()}`;
    const attempt = await runProfileCopilotSystemCase({
      runId,
      lane,
      evalCase,
      environment: readSystemLaneEnvironment(process.env),
    });
    const outputDirectory = path.resolve(".tmp", "ai-evals", runId);
    await mkdir(outputDirectory, { recursive: true });
    const outputPath = path.join(outputDirectory, "attempt.json");
    await writeFile(
      outputPath,
      `${JSON.stringify(attempt, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(
      `${JSON.stringify(
        {
          runId,
          laneId: lane.id,
          caseId: evalCase.id,
          status: attempt.status,
          durationMs: attempt.durationMs,
          providerCallCount: attempt.providerCallCount,
          fallbackDetected: attempt.fallbackDetected,
          guardedRejectionDetected: attempt.guardedRejectionDetected,
          outputPath,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (command === "case") {
    const lane = findSystemLane(args[1] ?? "");
    const caseId = args[2] ?? "";
    const evalCase = cases.find((candidate) => candidate.id === caseId);
    if (!evalCase) throw new Error(`Unknown evaluation case: ${caseId}`);
    const runId = `ai_eval_case_${lane.id}_${caseId}_${Date.now()}`;
    const attempt = await runSystemCase({
      runId,
      lane,
      evalCase,
      environment: readSystemLaneEnvironment(process.env),
    });
    const outputDirectory = path.resolve(".tmp", "ai-evals", runId);
    await mkdir(outputDirectory, { recursive: true });
    const outputPath = path.join(outputDirectory, "attempt.json");
    await writeFile(
      outputPath,
      `${JSON.stringify(attempt, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(
      `${JSON.stringify(
        {
          runId,
          laneId: lane.id,
          caseId,
          status: attempt.status,
          durationMs: attempt.durationMs,
          providerCallCount: attempt.providerCallCount,
          fallbackDetected: attempt.fallbackDetected,
          guardedRejectionDetected: attempt.guardedRejectionDetected,
          outputPath,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  process.stdout.write(
    `${JSON.stringify({ manifest, capabilityCounts }, null, 2)}\n`,
  );
}
