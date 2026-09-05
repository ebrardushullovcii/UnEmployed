import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createFrozenEvalCases } from "./case-registry";
import { parseCapturedModelContribution } from "./capture-fetch";
import {
  EvalAttemptSchema,
  type EvalAttempt,
  type EvalCapability,
  type EvalGrade,
  type EvalLaneId,
  systemEvalLanes,
} from "./contracts";
import { gradeEvalAttempt } from "./grader";

type AttemptWithGrade = {
  readonly attempt: EvalAttempt;
  readonly grade: EvalGrade;
};

type Aggregate = {
  readonly attemptCount: number;
  readonly directSuccessCount: number;
  readonly fallbackCount: number;
  readonly guardedRejectionCount: number;
  readonly providerCallCount: number;
  readonly medianDurationMs: number | null;
  readonly meanDurationMs: number | null;
  readonly directSuccessMedianDurationMs: number | null;
  readonly directSuccessMeanDurationMs: number | null;
  readonly fallbackMedianDurationMs: number | null;
  readonly failedMedianDurationMs: number | null;
  readonly providerHttpDurationMs: number;
  readonly meanModelScore: number;
  readonly meanProductScore: number;
};

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return (
    Math.round(
      (values.reduce((sum, value) => sum + value, 0) / values.length) * 10,
    ) / 10
  );
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return Math.round(sorted[middle] ?? 0);
  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

function aggregate(entries: readonly AttemptWithGrade[]): Aggregate {
  const measuredDurations = entries
    .map(({ attempt }) => attempt.durationMs)
    .filter((duration) => duration > 0);
  const directDurations = entries
    .filter(({ attempt }) => attempt.status === "succeeded")
    .map(({ attempt }) => attempt.durationMs)
    .filter((duration) => duration > 0);
  const fallbackDurations = entries
    .filter(({ attempt }) => attempt.status === "fallback_succeeded")
    .map(({ attempt }) => attempt.durationMs)
    .filter((duration) => duration > 0);
  const failedDurations = entries
    .filter(({ attempt }) =>
      ["failed", "timed_out", "unsupported"].includes(attempt.status),
    )
    .map(({ attempt }) => attempt.durationMs)
    .filter((duration) => duration > 0);
  return {
    attemptCount: entries.length,
    directSuccessCount: entries.filter(
      ({ attempt }) => attempt.status === "succeeded",
    ).length,
    fallbackCount: entries.filter(({ attempt }) => attempt.fallbackDetected)
      .length,
    guardedRejectionCount: entries.filter(
      ({ attempt }) => attempt.guardedRejectionDetected,
    ).length,
    providerCallCount: entries.reduce(
      (sum, { attempt }) => sum + attempt.providerCallCount,
      0,
    ),
    medianDurationMs: median(measuredDurations),
    meanDurationMs:
      measuredDurations.length > 0 ? Math.round(mean(measuredDurations)) : null,
    directSuccessMedianDurationMs: median(directDurations),
    directSuccessMeanDurationMs:
      directDurations.length > 0 ? Math.round(mean(directDurations)) : null,
    fallbackMedianDurationMs: median(fallbackDurations),
    failedMedianDurationMs: median(failedDurations),
    providerHttpDurationMs: Math.round(
      entries.reduce(
        (sum, { attempt }) =>
          sum +
          attempt.rawHttp.reduce(
            (callSum, call) => callSum + call.durationMs,
            0,
          ),
        0,
      ),
    ),
    meanModelScore: mean(entries.map(({ grade }) => grade.objectiveModelScore)),
    meanProductScore: mean(
      entries.map(({ grade }) => grade.objectiveProductScore),
    ),
  };
}

function selectPilotCases() {
  const seen = new Map<EvalCapability, number>();
  return createFrozenEvalCases().filter((evalCase) => {
    const count = seen.get(evalCase.capability) ?? 0;
    seen.set(evalCase.capability, count + 1);
    return count < 2;
  });
}

function parseCodexRow(value: unknown): {
  readonly caseId: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly output: unknown;
} {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Codex reference row must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.caseId !== "string" ||
    typeof record.startedAt !== "string" ||
    typeof record.durationMs !== "number"
  ) {
    throw new Error("Codex reference row is missing required fields.");
  }
  return {
    caseId: record.caseId,
    startedAt: record.startedAt,
    durationMs: record.durationMs,
    output: record.output,
  };
}

function toCodexAttempt(row: ReturnType<typeof parseCodexRow>): EvalAttempt {
  return EvalAttemptSchema.parse({
    runId: "codex_agent_reference_pilot",
    caseId: row.caseId,
    laneId: "codex_agent_reference",
    startedAt: row.startedAt,
    durationMs: row.durationMs,
    status: "succeeded",
    providerCallCount: 0,
    fallbackDetected: false,
    guardedRejectionDetected: false,
    rawHttp: [],
    modelOutput: row.output,
    productOutput: row.output,
    error: null,
  });
}

function normalizeCapturedAttempt(attempt: EvalAttempt): EvalAttempt {
  const browserVisualFallback =
    attempt.caseId.startsWith("browser_visual_analysis_") &&
    /deterministic fallback|did not satisfy the safe observation schema/i.test(
      JSON.stringify(attempt.productOutput),
    );
  const shouldReparseContributions =
    attempt.caseId.startsWith("agentic_job_discovery_") ||
    attempt.caseId.startsWith("source_debug_");
  return EvalAttemptSchema.parse({
    ...attempt,
    status: browserVisualFallback ? "fallback_succeeded" : attempt.status,
    fallbackDetected: attempt.fallbackDetected || browserVisualFallback,
    guardedRejectionDetected:
      attempt.guardedRejectionDetected || browserVisualFallback,
    modelOutput: shouldReparseContributions
      ? attempt.rawHttp.map((capture) =>
          parseCapturedModelContribution(capture),
        )
      : attempt.modelOutput,
  });
}

export async function createFullReport(input: {
  readonly runDirectory: string;
  readonly corpusDigest: string;
}) {
  const cases = createFrozenEvalCases();
  const entries: AttemptWithGrade[] = [];
  for (const lane of systemEvalLanes) {
    for (const evalCase of cases) {
      const attempt = normalizeCapturedAttempt(
        EvalAttemptSchema.parse(
          JSON.parse(
            await readFile(
              path.join(input.runDirectory, lane.id, `${evalCase.id}.json`),
              "utf8",
            ),
          ) as unknown,
        ),
      );
      entries.push({ attempt, grade: gradeEvalAttempt(evalCase, attempt) });
    }
  }
  const expectedOutcomeCount = cases.length * systemEvalLanes.length;
  const uniqueKeys = new Set(
    entries.map(({ attempt }) => `${attempt.laneId}:${attempt.caseId}`),
  );
  if (
    entries.length !== expectedOutcomeCount ||
    uniqueKeys.size !== expectedOutcomeCount
  ) {
    throw new Error(
      `Full report requires ${expectedOutcomeCount} unique outcomes; found ${entries.length}/${uniqueKeys.size}.`,
    );
  }
  const overall = Object.fromEntries(
    systemEvalLanes.map((lane) => [
      lane.id,
      aggregate(entries.filter(({ attempt }) => attempt.laneId === lane.id)),
    ]),
  ) as Record<Exclude<EvalLaneId, "codex_agent_reference">, Aggregate>;
  const capabilities = Array.from(
    new Set(cases.map((evalCase) => evalCase.capability)),
  );
  const byCapability = Object.fromEntries(
    systemEvalLanes.map((lane) => [
      lane.id,
      Object.fromEntries(
        capabilities.map((capability) => [
          capability,
          aggregate(
            entries.filter(({ attempt }) => {
              const evalCase = cases.find(
                (candidate) => candidate.id === attempt.caseId,
              );
              return (
                attempt.laneId === lane.id &&
                evalCase?.capability === capability
              );
            }),
          ),
        ]),
      ),
    ]),
  ) as Record<
    Exclude<EvalLaneId, "codex_agent_reference">,
    Record<EvalCapability, Aggregate>
  >;
  const report = {
    generatedAt: new Date().toISOString(),
    corpusDigest: input.corpusDigest,
    caseCountPerLane: cases.length,
    totalOutcomeCount: entries.length,
    completeness: {
      expectedOutcomeCount,
      uniqueOutcomeCount: uniqueKeys.size,
      complete: true,
    },
    overall,
    byCapability,
    cases: entries.map(({ attempt, grade }) => ({
      caseId: attempt.caseId,
      laneId: attempt.laneId,
      status: attempt.status,
      durationMs: attempt.durationMs,
      providerCallCount: attempt.providerCallCount,
      providerHttpDurationMs: Math.round(
        attempt.rawHttp.reduce((sum, capture) => sum + capture.durationMs, 0),
      ),
      fallbackDetected: attempt.fallbackDetected,
      guardedRejectionDetected: attempt.guardedRejectionDetected,
      error: attempt.error,
      grade,
    })),
  };
  const jsonPath = path.join(input.runDirectory, "full-report.json");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { report, jsonPath };
}

export async function createLaneReport(input: {
  readonly runDirectory: string;
  readonly corpusDigest: string;
  readonly laneId: Exclude<EvalLaneId, "codex_agent_reference">;
}) {
  const cases = createFrozenEvalCases();
  const entries: AttemptWithGrade[] = [];
  for (const evalCase of cases) {
    const attempt = normalizeCapturedAttempt(
      EvalAttemptSchema.parse(
        JSON.parse(
          await readFile(
            path.join(input.runDirectory, input.laneId, `${evalCase.id}.json`),
            "utf8",
          ),
        ) as unknown,
      ),
    );
    entries.push({ attempt, grade: gradeEvalAttempt(evalCase, attempt) });
  }
  const uniqueCaseIds = new Set(entries.map(({ attempt }) => attempt.caseId));
  if (entries.length !== cases.length || uniqueCaseIds.size !== cases.length) {
    throw new Error(
      `Lane report requires ${cases.length} unique outcomes; found ${entries.length}/${uniqueCaseIds.size}.`,
    );
  }
  const capabilities = Array.from(
    new Set(cases.map((evalCase) => evalCase.capability)),
  );
  const report = {
    generatedAt: new Date().toISOString(),
    corpusDigest: input.corpusDigest,
    laneId: input.laneId,
    caseCount: entries.length,
    complete: true,
    overall: aggregate(entries),
    byCapability: Object.fromEntries(
      capabilities.map((capability) => [
        capability,
        aggregate(
          entries.filter(({ attempt }) =>
            cases.some(
              (evalCase) =>
                evalCase.id === attempt.caseId &&
                evalCase.capability === capability,
            ),
          ),
        ),
      ]),
    ),
    cases: entries.map(({ attempt, grade }) => ({
      caseId: attempt.caseId,
      status: attempt.status,
      durationMs: attempt.durationMs,
      providerCallCount: attempt.providerCallCount,
      providerHttpDurationMs: Math.round(
        attempt.rawHttp.reduce((sum, capture) => sum + capture.durationMs, 0),
      ),
      fallbackDetected: attempt.fallbackDetected,
      guardedRejectionDetected: attempt.guardedRejectionDetected,
      error: attempt.error,
      grade,
    })),
  };
  const jsonPath = path.join(
    input.runDirectory,
    `lane-report.${input.laneId}.json`,
  );
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { report, jsonPath };
}

function formatDuration(value: number | null): string {
  return value === null ? "not measured" : `${(value / 1000).toFixed(1)}s`;
}

function renderMarkdown(input: {
  readonly corpusDigest: string;
  readonly overall: Readonly<Record<EvalLaneId, Aggregate>>;
  readonly byCapability: Readonly<
    Record<EvalLaneId, Partial<Record<EvalCapability, Aggregate>>>
  >;
}): string {
  const lines = [
    "# AI capability benchmark pilot",
    "",
    `Frozen corpus digest: \`${input.corpusDigest}\``,
    "",
    "This pilot uses the first two synthetic cases in each of 11 model-backed suites. The Codex reference is a separate agentic baseline; its per-case time was not available and is not compared as latency.",
    "",
    "## Overall",
    "",
    "| Lane | Direct success | Fallbacks | Guarded rejections | Provider calls | Median | Mean | Model evidence score | Guarded product score |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const laneId of [
    "luna_high",
    "luna_max",
    "sol_low",
    "codex_agent_reference",
  ] as const) {
    const value = input.overall[laneId];
    lines.push(
      `| ${laneId} | ${value.directSuccessCount}/${value.attemptCount} | ${value.fallbackCount} | ${value.guardedRejectionCount} | ${value.providerCallCount} | ${formatDuration(value.medianDurationMs)} | ${formatDuration(value.meanDurationMs)} | ${value.meanModelScore.toFixed(1)} | ${value.meanProductScore.toFixed(1)} |`,
    );
  }
  lines.push("", "## Capability detail", "");
  for (const capability of Object.keys(
    input.byCapability.luna_high,
  ) as EvalCapability[]) {
    lines.push(
      `### ${capability}`,
      "",
      "| Lane | Direct | Fallback | Rejected | Median | Model score | Product score |",
      "|---|---:|---:|---:|---:|---:|---:|",
    );
    for (const laneId of [
      "luna_high",
      "luna_max",
      "sol_low",
      "codex_agent_reference",
    ] as const) {
      const value = input.byCapability[laneId][capability];
      if (!value) continue;
      lines.push(
        `| ${laneId} | ${value.directSuccessCount}/${value.attemptCount} | ${value.fallbackCount} | ${value.guardedRejectionCount} | ${formatDuration(value.medianDurationMs)} | ${value.meanModelScore.toFixed(1)} | ${value.meanProductScore.toFixed(1)} |`,
      );
    }
    lines.push("");
  }
  lines.push(
    "## Interpretation limits",
    "",
    "- This is a 2-of-10 pilot per capability, not the final 10-case matrix.",
    "- Evidence scores are deterministic token/field coverage checks. They are useful for triage, not a substitute for blinded qualitative review.",
    "- Model contribution and guarded product output are scored separately so deterministic fallbacks cannot hide invalid model schemas.",
    "- Source-debug currently exercises the model-backed browser worker. The separate final instruction-review call still needs its own adapter before full scale.",
    "- Codex reference timing is an explicit unavailable sentinel and is excluded from latency statistics.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

export async function createPilotReport(input: {
  readonly pilotDirectory: string;
  readonly corpusDigest: string;
  readonly codexReferencePath: string;
}) {
  const cases = selectPilotCases();
  const entries: AttemptWithGrade[] = [];
  for (const lane of systemEvalLanes) {
    for (const evalCase of cases) {
      const attempt = normalizeCapturedAttempt(
        EvalAttemptSchema.parse(
          JSON.parse(
            await readFile(
              path.join(input.pilotDirectory, lane.id, `${evalCase.id}.json`),
              "utf8",
            ),
          ) as unknown,
        ),
      );
      entries.push({ attempt, grade: gradeEvalAttempt(evalCase, attempt) });
    }
  }
  const codexLines = (await readFile(input.codexReferencePath, "utf8"))
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  for (const line of codexLines) {
    const attempt = toCodexAttempt(parseCodexRow(JSON.parse(line) as unknown));
    const evalCase = cases.find((candidate) => candidate.id === attempt.caseId);
    if (!evalCase) throw new Error(`Unexpected Codex case ${attempt.caseId}.`);
    entries.push({ attempt, grade: gradeEvalAttempt(evalCase, attempt) });
  }

  const laneIds = [
    "luna_high",
    "luna_max",
    "sol_low",
    "codex_agent_reference",
  ] as const;
  const overall = Object.fromEntries(
    laneIds.map((laneId) => [
      laneId,
      aggregate(entries.filter(({ attempt }) => attempt.laneId === laneId)),
    ]),
  ) as Record<EvalLaneId, Aggregate>;
  const byCapability = Object.fromEntries(
    laneIds.map((laneId) => [
      laneId,
      Object.fromEntries(
        Array.from(new Set(cases.map((evalCase) => evalCase.capability))).map(
          (capability) => [
            capability,
            aggregate(
              entries.filter(({ attempt }) => {
                const evalCase = cases.find(
                  (candidate) => candidate.id === attempt.caseId,
                );
                return (
                  attempt.laneId === laneId &&
                  evalCase?.capability === capability
                );
              }),
            ),
          ],
        ),
      ),
    ]),
  ) as Record<EvalLaneId, Record<EvalCapability, Aggregate>>;
  const report = {
    generatedAt: new Date().toISOString(),
    corpusDigest: input.corpusDigest,
    pilotCaseCount: cases.length,
    totalOutcomeCount: entries.length,
    overall,
    byCapability,
    cases: entries.map(({ attempt, grade }) => ({
      caseId: attempt.caseId,
      laneId: attempt.laneId,
      status: attempt.status,
      durationMs: attempt.durationMs === 0 ? null : attempt.durationMs,
      providerCallCount: attempt.providerCallCount,
      fallbackDetected: attempt.fallbackDetected,
      guardedRejectionDetected: attempt.guardedRejectionDetected,
      grade,
    })),
  };
  const jsonPath = path.join(input.pilotDirectory, "pilot-report.json");
  const markdownPath = path.join(input.pilotDirectory, "pilot-report.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(
    markdownPath,
    renderMarkdown({ corpusDigest: input.corpusDigest, overall, byCapability }),
    "utf8",
  );
  return { report, jsonPath, markdownPath };
}
