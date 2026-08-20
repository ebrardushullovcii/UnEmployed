import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  ACCEPTANCE_VERSION,
  acceptanceEnvironment,
  artifactFingerprint,
  artifactRoot,
  CANONICAL_LATENCY_BUDGETS,
  desktopDir,
  repositoryRoot,
  sourceFingerprint,
  gitMetadata,
  sha256File,
  stableJson,
  verifyAcceptanceArtifacts,
  writeJson,
} from "./release-acceptance-harness.mjs";
import { resolveBuildInvocation } from "./resolve-build-invocation.mjs";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const buildInvocation = resolveBuildInvocation({ repositoryRoot });
const buildCommand = buildInvocation.command;
const buildArgs = buildInvocation.args;
const captureScripts = [
  {
    id: "fresh",
    script: "capture-fresh-flows.mjs",
    report: "capture-report.json",
  },
  { id: "scale", script: "capture-scale-500.mjs", report: "report.json" },
  {
    id: "error-recovery",
    script: "capture-job-finder-error-recovery.mjs",
    report: "report.json",
  },
];
const EXPECTED_SCALE_ROUTE_SEQUENCE = Object.freeze([
  "profile",
  "findJobs",
  "shortlisted",
  "applications",
  "profile",
  "findJobs",
  "shortlisted",
  "applications",
  "profile",
  "findJobs",
  "shortlisted",
  "applications",
]);
const EXPECTED_SCALE_ROUTE_SWITCH_COUNT = EXPECTED_SCALE_ROUTE_SEQUENCE.length;

function now() {
  return new Date().toISOString();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertFiniteNumber(value, message) {
  assert(Number.isFinite(value), message);
}

function assertAcceptanceBinding(id, report, acceptanceReport) {
  assert(
    isRecord(report.acceptance),
    `${id} report is missing its exact-build acceptance binding.`,
  );
  assert(
    report.acceptance.version === ACCEPTANCE_VERSION &&
      report.acceptance.runDir === acceptanceReport.runDir &&
      report.acceptance.manifestPath ===
        path.join(acceptanceReport.runDir, "build-manifest.json") &&
      report.acceptance.sourceFingerprint ===
        acceptanceReport.source.afterBuild?.digest &&
      report.acceptance.buildArtifactFingerprint ===
        acceptanceReport.artifacts?.digest,
    `${id} report is not bound to the exact source/build manifest.`,
  );
}

function assertCaptureSafety(id, report) {
  assert(isRecord(report.safety), `${id} report is missing safety evidence.`);
  const safety = report.safety;
  assert(
    (safety.syntheticCandidateDataOnly === true ||
      safety.syntheticTestDataOnly === true) &&
      safety.browserAgentEnabled === false &&
      safety.applicationActionsExecuted === false &&
      safety.finalSubmissionClicked === false &&
      safety.submitAuthorized === false &&
      safety.accountCreationAuthorized === false &&
      safety.prepareOnlyVerified === true &&
      safety.cleanedUp === true,
    `${id} report does not prove an isolated prepare-only run: ${JSON.stringify(safety)}`,
  );
  const observedSafetyEvents = Array.isArray(safety.observedSafetyEvents)
    ? safety.observedSafetyEvents
    : report.safetyEvents;
  assert(
    Array.isArray(observedSafetyEvents) && observedSafetyEvents.length === 0,
    `${id} report contains missing or observed safety events: ${JSON.stringify(observedSafetyEvents)}`,
  );
}

function assertScenarioContract(id, report, entries) {
  assert(
    Array.isArray(report.requiredScenarioCompletionIds) &&
      report.requiredScenarioCompletionIds.length > 0 &&
      report.requiredScenarioCompletionIds.every(
        (scenarioId) => typeof scenarioId === "string" && scenarioId.length > 0,
      ),
    `${id} report is missing a non-empty required scenario list.`,
  );
  assert(
    Array.isArray(report.scenarioCompletionIds) &&
      report.scenarioCompletionIds.length > 0 &&
      report.scenarioCompletionIds.every(
        (scenarioId) => typeof scenarioId === "string" && scenarioId.length > 0,
      ),
    `${id} report is missing a non-empty completed scenario list.`,
  );
  assert(
    new Set(report.requiredScenarioCompletionIds).size ===
      report.requiredScenarioCompletionIds.length,
    `${id} report contains duplicate required scenario IDs.`,
  );
  assert(
    new Set(report.scenarioCompletionIds).size ===
      report.scenarioCompletionIds.length,
    `${id} report contains duplicate completed scenario IDs.`,
  );
  const completed = new Set(report.scenarioCompletionIds);
  assert(
    report.requiredScenarioCompletionIds.every((scenarioId) =>
      completed.has(scenarioId),
    ),
    `${id} report did not complete every required scenario.`,
  );
  for (const entry of entries) {
    assert(
      isRecord(entry) && typeof entry.scenarioId === "string" &&
        entry.scenarioId.length > 0,
      `${id} capture entry is missing an explicit scenario ID.`,
    );
  }
}

function assertScalePerformanceContract(report) {
  assert(
    isRecord(report.latencyBudgets) &&
      report.latencyBudgets.coldToUsableShellMs ===
        CANONICAL_LATENCY_BUDGETS.coldToUsableShellMs &&
      report.latencyBudgets.warmRouteSwitchMs ===
        CANONICAL_LATENCY_BUDGETS.warmRouteSwitchMs,
    "Scale acceptance did not record the canonical latency budgets.",
  );
  assertFiniteNumber(
    report.startup?.coldToUsableShellMs,
    "Scale acceptance did not record a finite cold usable-shell measurement.",
  );
  assert(
    report.startup.coldToUsableShellMs <=
      CANONICAL_LATENCY_BUDGETS.coldToUsableShellMs,
    `Scale cold-start latency exceeded ${CANONICAL_LATENCY_BUDGETS.coldToUsableShellMs} ms.`,
  );
  assert(
    Array.isArray(report.startup.timingMarks) &&
      report.startup.timingMarks.length > 0,
    "Scale acceptance did not record renderer timing marks.",
  );
  for (const mark of report.startup.timingMarks) {
    assert(
      isRecord(mark) &&
        typeof mark.name === "string" &&
        mark.name.length > 0 &&
        Number.isFinite(mark.startTime) &&
        Number.isFinite(mark.duration),
      `Scale acceptance contains an invalid renderer timing mark: ${JSON.stringify(mark)}`,
    );
  }
  assert(
    Array.isArray(report.routeSwitches) &&
      report.routeSwitches.length === EXPECTED_SCALE_ROUTE_SWITCH_COUNT,
    `Scale acceptance must record exactly ${EXPECTED_SCALE_ROUTE_SWITCH_COUNT} canonical route switches.`,
  );
  report.routeSwitches.forEach((routeEntry, index) => {
    assert(
      isRecord(routeEntry) &&
        routeEntry.route === EXPECTED_SCALE_ROUTE_SEQUENCE[index] &&
        routeEntry.cycle === Math.floor(index / 4) + 1,
      `Scale acceptance route ${index + 1} does not match the canonical route sequence.`,
    );
    assertFiniteNumber(
      routeEntry.latencyMs,
      `Scale route ${index + 1} has no finite latency mark.`,
    );
    assert(
      routeEntry.latencyMs >= 0 &&
        routeEntry.latencyMs <= CANONICAL_LATENCY_BUDGETS.warmRouteSwitchMs,
      `Scale route ${index + 1} exceeded the canonical warm-route budget.`,
    );
    for (const field of ["headingObservedLatencyMs", "rendererRoundTripMs"]) {
      assertFiniteNumber(
        routeEntry[field],
        `Scale route ${index + 1} has no finite ${field} mark.`,
      );
    }
    const rendererTiming = routeEntry.rendererTiming;
    assert(
      isRecord(rendererTiming) &&
        Number.isFinite(rendererTiming.start) &&
        Number.isFinite(rendererTiming.end) &&
        Number.isFinite(rendererTiming.durationMs) &&
        rendererTiming.end >= rendererTiming.start &&
        rendererTiming.durationMs >= 0 &&
        (rendererTiming.feedbackDurationMs === null ||
          Number.isFinite(rendererTiming.feedbackDurationMs)),
      `Scale route ${index + 1} has incomplete renderer timing marks.`,
    );
  });
}

function isInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function runCommand(command, args, options = {}) {
  const startedAt = now();
  const startedClock = performance.now();
  let result;
  try {
    result = await execFileAsync(command, args, {
      cwd: options.cwd ?? repositoryRoot,
      env: options.env ?? acceptanceEnvironment(),
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    result = {
      stdout: error?.stdout ?? "",
      stderr: error?.stderr ?? "",
      error,
    };
  }
  return {
    command,
    args,
    startedAt,
    finishedAt: now(),
    durationMs: Math.round((performance.now() - startedClock) * 100) / 100,
    exitCode:
      result.error?.code && typeof result.error.code === "number"
        ? result.error.code
        : result.error
          ? 1
          : 0,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
    error: result.error
      ? result.error instanceof Error
        ? result.error.message
        : String(result.error)
      : null,
  };
}

async function assertExpectedBuildOutputs() {
  const required = ["out/main", "out/preload", "out/renderer/index.html"];
  for (const relativePath of required) {
    const fullPath = path.resolve(desktopDir, relativePath);
    assert(
      existsSync(fullPath),
      `The exact build did not produce ${relativePath}.`,
    );
    const fileStat = await stat(fullPath);
    if (relativePath.endsWith("index.html"))
      assert(
        fileStat.isFile() && fileStat.size > 0,
        `${relativePath} is empty.`,
      );
    else assert(fileStat.isDirectory(), `${relativePath} is not a directory.`);
  }
}

async function pngMetadata(filePath) {
  const contents = await readFile(filePath);
  assert(
    contents.length >= 24 &&
      contents.readUInt32BE(0) === 0x89504e47 &&
      contents.toString("ascii", 1, 4) === "PNG",
    `Invalid PNG screenshot: ${filePath}`,
  );
  return {
    bytes: contents.length,
    sha256: createHash("sha256").update(contents).digest("hex"),
    width: contents.readUInt32BE(16),
    height: contents.readUInt32BE(20),
  };
}

async function verifyScreenshots(runDir, report) {
  assert(
    Array.isArray(report.captures) || Array.isArray(report.screenshots),
    "Capture report has no screenshot entries.",
  );
  const entries = report.captures ?? report.screenshots;
  assert(entries.length > 0, "Capture report contains no screenshots.");
  const seen = new Set();
  for (const entry of entries) {
    const filePath = path.resolve(
      entry.path ?? entry.fullPath ?? path.join(runDir, entry.fileName),
    );
    assert(
      isInside(runDir, filePath),
      `Screenshot escaped the acceptance run directory: ${filePath}`,
    );
    assert(
      !seen.has(filePath),
      `Screenshot was recorded more than once: ${filePath}`,
    );
    seen.add(filePath);
    assert(
      existsSync(filePath),
      `Capture report references a missing screenshot: ${filePath}`,
    );
    const actual = await pngMetadata(filePath);
    const expected = entry.screenshot ?? {};
    assert(
      actual.sha256 === expected.sha256,
      `Screenshot hash changed after capture: ${filePath}`,
    );
    assert(
      actual.width === expected.width && actual.height === expected.height,
      `Screenshot dimensions changed after capture: ${filePath}`,
    );
    assert(
      entry.route || entry.viewport?.css || entry.viewport,
      `Screenshot lacks route/viewport metadata: ${filePath}`,
    );
  }
  const descendants = [];
  const walk = async (directory) => {
    for (const name of await (
      await import("node:fs/promises")
    ).readdir(directory, { withFileTypes: true })) {
      const child = path.join(directory, name.name);
      if (name.isDirectory()) await walk(child);
      else if (name.isFile() && name.name.toLowerCase().endsWith(".png"))
        descendants.push(child);
    }
  };
  await walk(runDir);
  assert(
    descendants.length === seen.size,
    `Acceptance run contains unreported or missing screenshots: reported=${seen.size} actual=${descendants.length}`,
  );
  return { screenshotCount: seen.size };
}

function assertScenarioMatrix(id, report) {
  const entries = report.captures ?? report.screenshots ?? [];
  const labels = entries.map((entry) =>
    `${entry.label ?? entry.fileName ?? ""}`.toLowerCase(),
  );
  const has = (pattern) => labels.some((label) => pattern.test(label));
  if (id !== "error-recovery")
    assert(
      has(/1440|desktop|normal/),
      `${id} acceptance did not capture a 1440 desktop scenario.`,
    );
  if (id !== "error-recovery")
    assert(
      has(/200|zoom/),
      `${id} acceptance did not capture a native 200% scenario.`,
    );
  assert(
    has(/minimum|1024|narrow/),
    `${id} acceptance did not capture the 1024px minimum-width scenario.`,
  );
  if (id === "fresh")
    assert(
      has(/empty|zero|fresh/),
      `${id} acceptance did not capture a zero/empty state.`,
    );
  if (id === "error-recovery") {
    assert(
      has(/error|failure/),
      "Error/recovery acceptance did not capture an error state.",
    );
    assert(
      has(/recover/),
      "Error/recovery acceptance did not capture the recovered state.",
    );
  }
  if (id === "error-recovery")
    assert(
      has(/preview|resume/),
      "Error/recovery acceptance did not capture the resume surface.",
    );
  else
    assert(
      has(/populated|rows|sources|jobs|applications/),
      `${id} acceptance did not capture a populated state.`,
    );
  assert(
    labels.every((label, index) => entries[index].seedDigest),
    `${id} screenshot metadata is missing deterministic seed digests.`,
  );
}

async function writeCommandLogs(runDir, id, result) {
  await writeFile(path.join(runDir, `${id}-stdout.log`), result.stdout, "utf8");
  await writeFile(path.join(runDir, `${id}-stderr.log`), result.stderr, "utf8");
}

async function main() {
  const startedAt = now();
  await (
    await import("node:fs/promises")
  ).mkdir(artifactRoot, { recursive: true });
  const runDir = await mkdtemp(
    path.join(artifactRoot, "production-acceptance-"),
  );
  assert(
    isInside(artifactRoot, runDir),
    `Acceptance run directory escaped ${artifactRoot}: ${runDir}`,
  );
  const manifestPath = path.join(runDir, "build-manifest.json");
  const reportPath = path.join(runDir, "acceptance-report.json");
  const acceptanceReport = {
    acceptanceVersion: ACCEPTANCE_VERSION,
    runDir,
    pass: false,
    startedAt,
    build: {
      command: [buildCommand, ...buildArgs],
      invocationSource: buildInvocation.source,
      executable: buildInvocation.executable,
      cwd: repositoryRoot,
      rendererUrlEnvironmentRemoved: true,
    },
    source: {
      beforeBuild: null,
      afterBuild: null,
      gitBefore: null,
      gitAfter: null,
    },
    artifacts: null,
    captures: {},
    screenshotCount: 0,
    safety: {
      syntheticTestDataOnly: true,
      isolatedUserDataDirectories: true,
      browserAgentDisabled: true,
      finalSubmitAndAccountCreationDisabled: true,
      prepareOnly: true,
      prepareOnlyVerified: false,
      applicationActionsExecuted: null,
      finalSubmissionClicked: null,
      submitAuthorized: null,
      accountCreationAuthorized: null,
      observedSafetyEvents: [],
    },
  };
  try {
    acceptanceReport.source.gitBefore = await gitMetadata();
    acceptanceReport.source.beforeBuild = await sourceFingerprint();
    const buildResult = await runCommand(buildCommand, buildArgs, {
      cwd: repositoryRoot,
      env: acceptanceEnvironment(),
    });
    acceptanceReport.build = {
      ...acceptanceReport.build,
      ...buildResult,
      command: [buildCommand, ...buildArgs],
    };
    await writeCommandLogs(runDir, "build", buildResult);
    assert(
      buildResult.exitCode === 0,
      `Desktop build failed with exit code ${buildResult.exitCode}. See ${path.join(runDir, "build-stderr.log")}.`,
    );
    await assertExpectedBuildOutputs();
    acceptanceReport.source.gitAfter = await gitMetadata();
    acceptanceReport.source.afterBuild = await sourceFingerprint();
    assert(
      acceptanceReport.source.beforeBuild.digest ===
        acceptanceReport.source.afterBuild.digest,
      "The build changed source files; refusing to test a different source than the recorded input.",
    );
    acceptanceReport.artifacts = await artifactFingerprint();
    assert(
      acceptanceReport.artifacts.fileCount > 0,
      "Exact build produced no hashed artifacts.",
    );
    await writeJson(manifestPath, acceptanceReport);
    for (const capture of captureScripts) {
      const captureDir = path.join(runDir, capture.id);
      const environment = acceptanceEnvironment({
        JOB_FINDER_ACCEPTANCE_RUN_DIR: runDir,
        JOB_FINDER_ACCEPTANCE_MANIFEST: manifestPath,
        JOB_FINDER_ACCEPTANCE_COMPONENT: capture.id,
      });
      const result = await runCommand(
        process.execPath,
        [path.join(scriptDir, capture.script)],
        { cwd: desktopDir, env: environment },
      );
      await writeCommandLogs(runDir, capture.id, result);
      assert(
        result.exitCode === 0,
        `${capture.id} acceptance failed with exit code ${result.exitCode}. See ${path.join(runDir, `${capture.id}-stderr.log`)}.`,
      );
      assert(
        result.stderr.trim() === "",
        `${capture.id} wrote to stderr; the run is not clean. See ${path.join(runDir, `${capture.id}-stderr.log`)}.`,
      );
      const reportFile = path.join(captureDir, capture.report);
      assert(
        existsSync(reportFile),
        `${capture.id} did not produce ${capture.report}.`,
      );
      const captureReport = await readJson(reportFile);
      assertAcceptanceBinding(capture.id, captureReport, acceptanceReport);
      assert(
        typeof captureReport.pass === "boolean" ||
          isRecord(captureReport.summary),
        `${capture.id} report is missing an explicit pass/summary contract.`,
      );
      assert(
        captureReport.pass !== false &&
          !captureReport.failure &&
          typeof captureReport.completedAt === "string" &&
          captureReport.completedAt.length > 0,
        `${capture.id} report contains a failure: ${captureReport.failure}`,
      );
      assert(
        Array.isArray(captureReport.runtimeErrors) &&
          captureReport.runtimeErrors.length === 0,
        `${capture.id} reported renderer/runtime errors.`,
      );
      assert(
        isRecord(captureReport.mainProcess) &&
          typeof captureReport.mainProcess.unexpectedStderr === "string" &&
          captureReport.mainProcess.unexpectedStderr.trim() === "",
        `${capture.id} reported unexpected Electron main stderr.`,
      );
      assertCaptureSafety(capture.id, captureReport);
      const captureEntries =
        captureReport.captures ?? captureReport.screenshots ?? [];
      assert(
        Array.isArray(captureEntries) && captureEntries.length > 0,
        `${capture.id} produced no capture entries.`,
      );
      for (const entry of captureEntries) {
        assert(
          entry.pass === true,
          `${capture.id} contains a failed capture entry: ${entry.label ?? entry.fileName}`,
        );
        assert(
          Array.isArray(entry.failures) && entry.failures.length === 0,
          `${capture.id} contains capture failures: ${entry.label ?? entry.fileName}: ${JSON.stringify(entry.failures)}`,
        );
        assert(
          entry.insideViewport === true,
          `${capture.id} contains an out-of-viewport capture: ${entry.label ?? entry.fileName}`,
        );
        assert(
          entry.noClip === true,
          `${capture.id} contains a clipped capture: ${entry.label ?? entry.fileName}`,
        );
      }
      assertScenarioContract(capture.id, captureReport, captureEntries);
      if (capture.id === "scale") {
        assertScalePerformanceContract(captureReport);
      }
      if (capture.id === "fresh") {
        const scrollProof = captureEntries
          .map((entry) => entry.nestedScroll)
          .filter(Boolean)
          .find(
            (entry) =>
              entry.available &&
              entry.wheelMoved &&
              entry.keyboardMoved &&
              !entry.wheelLeaked &&
              !entry.keyboardLeaked,
          );
        assert(
          scrollProof,
          "Fresh acceptance did not produce a real wheel-and-keyboard scroll-chain proof.",
        );
      }
      assertScenarioMatrix(capture.id, captureReport);
      const screenshotSummary = await verifyScreenshots(
        captureDir,
        captureReport,
      );
      acceptanceReport.captures[capture.id] = {
        report: reportFile,
        pass: true,
        completedAt: captureReport.completedAt,
        screenshotCount: screenshotSummary.screenshotCount,
        summary: captureReport.summary ?? null,
      };
      acceptanceReport.screenshotCount += screenshotSummary.screenshotCount;
      const currentArtifacts = await artifactFingerprint();
      assert(
        currentArtifacts.digest === acceptanceReport.artifacts.digest,
        `${capture.id} changed the built artifacts after the exact build.`,
      );
    }
    const afterRunArtifacts = await artifactFingerprint();
    assert(
      afterRunArtifacts.digest === acceptanceReport.artifacts.digest,
      "Build artifacts changed after screenshots; evidence is not bound to the exact build.",
    );
    acceptanceReport.artifacts.postRun = afterRunArtifacts;
    acceptanceReport.safety = {
      ...acceptanceReport.safety,
      prepareOnlyVerified: true,
      applicationActionsExecuted: false,
      finalSubmissionClicked: false,
      submitAuthorized: false,
      accountCreationAuthorized: false,
      observedSafetyEvents: [],
    };
    acceptanceReport.pass = true;
    acceptanceReport.completedAt = now();
    acceptanceReport.durationMs =
      new Date(acceptanceReport.completedAt).getTime() -
      new Date(startedAt).getTime();
    await writeJson(manifestPath, acceptanceReport);
    await writeJson(reportPath, acceptanceReport);
    process.stdout.write(`Production acceptance passed. Run: ${runDir}\n`);
    process.stdout.write(`Screenshots: ${acceptanceReport.screenshotCount}\n`);
  } catch (error) {
    acceptanceReport.failedAt = now();
    acceptanceReport.failure =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    await writeJson(manifestPath, acceptanceReport);
    await writeJson(reportPath, acceptanceReport);
    process.stderr.write(`${acceptanceReport.failure}\n`);
    process.exitCode = 1;
  }
}

await main();
